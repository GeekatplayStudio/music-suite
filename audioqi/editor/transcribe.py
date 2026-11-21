"""Song to MIDI: a whole recording turned into one track of notes per instrument.

No single model transcribes a full mix well, so the song is first split into stems and each
stem goes to the transcriber that suits it:

* **piano** to Transkun, a piano-only model that is the most accurate transcriber there is;
* **guitar and everything else pitched** to basic-pitch, which follows chords on any instrument;
* **vocals and bass** to a one-note-at-a-time pitch tracker, because that is what they are;
* **drums** to hit detection on each separated kit piece (or on frequency bands of the drum
  stem when the kit separator is not installed).

Every engine is optional. What is installed decides what is used, the result says which
engine wrote each part, and a stem with nothing in it is left out rather than transcribed
into noise. Notes are ``{t, d, p, v}``: seconds, seconds, MIDI pitch, velocity 0 to 1.
"""

from __future__ import annotations

import itertools
import logging
import tempfile
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from audioqi.editor import composition, engines, projects, separation
from audioqi.editor.projects import EditorError

logger = logging.getLogger(__name__)

Notes = list[dict[str, float]]


class NoNotesError(EditorError):
    """A transcriber listened and wrote nothing down; another one may still hear something."""


Progress = Callable[[float], None]

MAX_NOTES_PER_PART = 20_000
#: A stem quieter than this, relative to the loudest stem, holds only bleed from the others.
SILENT_RATIO = 0.04
#: General MIDI percussion notes for the separated kit pieces.
DRUM_PITCHES = {"kick": 36, "snare": 38, "toms": 45, "hi-hat": 42, "ride": 51, "crash": 49}
#: Stem name -> (track name, General MIDI program, how it is transcribed).
PARTS: dict[str, tuple[str, int, str]] = {
    # The instruments are chosen to speak at once: a transcribed line is mostly short notes, and
    # a sound that swells in slowly (strings, a choir) would be over before it was heard.
    "vocals": ("Vocals", 73, "mono"),
    "lead vocals": ("Lead vocals", 73, "mono"),
    "backing vocals": ("Backing vocals", 16, "poly"),
    "bass": ("Bass", 33, "mono"),
    "piano": ("Piano", 0, "piano"),
    "guitar": ("Guitar", 25, "poly"),
    "other": ("Other instruments", 4, "poly"),
    "instrumental": ("Instruments", 0, "poly"),
}

#: The notes each part can plausibly play; anything outside is another instrument's bleed.
RANGES: dict[str, tuple[int, int]] = {
    "vocals": (40, 86),
    "lead vocals": (40, 86),
    "backing vocals": (40, 86),
    "bass": (23, 67),
    "guitar": (38, 90),
}

_TRANSKUN_LOCK = threading.Lock()
_transkun: Any = None


def engines_available() -> dict[str, str]:
    """Which engine each kind of part will use on this machine."""
    poly = "basic-pitch" if engines.has_module("basic_pitch") else "pyin"
    return {
        "piano": "transkun" if engines.has_module("transkun") else poly,
        "poly": poly,
        "mono": poly,
        "drums": "kit pieces" if separation.detail_available() else "frequency bands",
        "stems": engines.separation_engines()[0],
        # "ready", "needs-access" or "not-installed": the one-model, whole-mix transcriber.
        "whole_mix": whole_mix_status(),
    }


def _rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(audio, dtype=np.float64)))) if audio.size else 0.0


def _tidy(notes: Notes, seconds: float) -> Notes:
    """Sort, bound and de-duplicate: a model can report one note twice across its windows."""
    kept: Notes = []
    last: dict[int, float] = {}
    for note in sorted(notes, key=lambda n: (n["t"], n["p"])):
        start = float(note["t"])
        pitch = int(note["p"])
        if not 0 <= pitch <= 127 or start < 0 or start >= seconds:
            continue
        if start - last.get(pitch, -1.0) < 0.03:
            continue
        last[pitch] = start
        kept.append(
            {
                "t": round(start, 4),
                "d": round(max(0.03, min(float(note["d"]), seconds - start)), 4),
                "p": pitch,
                "v": round(min(1.0, max(0.05, float(note["v"]))), 3),
            }
        )
    return kept[:MAX_NOTES_PER_PART]


# --------------------------------------------------------------------------- pitched parts


def _load_transkun() -> Any:
    global _transkun
    with _TRANSKUN_LOCK:
        if _transkun is None:
            import moduleconf
            import torch
            import transkun

            folder = Path(transkun.__file__).parent / "pretrained"
            conf = moduleconf.parseFromFile(str(folder / "2.0.conf"))
            device = "cuda" if torch.cuda.is_available() else "cpu"
            # The checkpoint is the one shipped inside the installed package.
            checkpoint = torch.load(str(folder / "2.0.pt"), map_location=device, weights_only=False)
            model = conf["Model"].module.TransKun(conf=conf["Model"].config).to(device)
            state = checkpoint.get("best_state_dict") or checkpoint["state_dict"]
            model.load_state_dict(state, strict=False)
            model.eval()
            _transkun = (model, device)
        return _transkun


def piano_notes(audio: np.ndarray, sample_rate: int) -> Notes:
    """Piano through Transkun. Pedal events it reports are not notes and are dropped."""
    import torch

    model, device = _load_transkun()
    stereo = audio if audio.ndim == 2 else audio[:, None]
    if sample_rate != model.fs:
        import librosa

        stereo = librosa.resample(
            stereo.T.astype(np.float32), orig_sr=sample_rate, target_sr=model.fs
        ).T
    with torch.no_grad():
        found = model.transcribe(
            torch.from_numpy(np.ascontiguousarray(stereo, dtype=np.float32)).to(device),
            discardSecondHalf=False,
        )
    if device == "cuda":
        torch.cuda.empty_cache()
    return [
        {
            "t": float(note.start),
            "d": float(note.end - note.start),
            "p": int(note.pitch),
            "v": float(note.velocity) / 127.0,
        }
        for note in found
        if 0 <= int(note.pitch) <= 127 and note.end > note.start
    ]


def poly_notes(audio: np.ndarray, sample_rate: int) -> Notes:
    """Chords and melodies on any instrument, through basic-pitch."""
    from basic_pitch.inference import predict

    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        path = Path(tmp) / "stem.wav"
        sf.write(str(path), audio, sample_rate, subtype="PCM_16")
        # A firm onset threshold with a loose frame threshold (the defaults are 0.5 and 0.3):
        # a note needs a clear attack to begin, but once begun it is held for as long as
        # there is any evidence of it. Measured on stems of real songs, this roughly doubled
        # how much of the music was written down compared with firm thresholds for both,
        # with the share of notes inside the song's key unchanged; settings tuned on
        # synthesized audio alone had cut held notes and chords short.
        _, _, events = predict(
            str(path), onset_threshold=0.6, frame_threshold=0.2, minimum_note_length=100.0
        )
    return drop_overtones(
        [
            {
                "t": float(start),
                "d": float(end - start),
                "p": int(pitch),
                "v": float(min(1.0, max(0.05, amplitude * 1.6))),
            }
            for start, end, pitch, amplitude, *_ in events
            if end > start
        ]
    )


#: Overtones a transcriber can mistake for played notes, in semitones above the real one:
#: the octave, the twelfth, two octaves, and the third and fifth above that.
_OVERTONES = (12, 19, 24, 28, 31)


def drop_overtones(notes: Notes) -> Notes:
    """Remove faint notes that start with a louder note they are an overtone of."""
    ordered = sorted(notes, key=lambda note: note["t"])
    starts = np.array([note["t"] for note in ordered])
    kept: Notes = []
    for note in ordered:
        low = int(np.searchsorted(starts, note["t"] - 0.05))
        high = int(np.searchsorted(starts, note["t"] + 0.05))
        ghost = any(
            other is not note
            and int(note["p"] - other["p"]) in _OVERTONES
            and note["v"] < other["v"] * 0.7
            for other in ordered[low:high]
        )
        if not ghost:
            kept.append(note)
    return kept


def mono_notes(audio: np.ndarray, sample_rate: int) -> Notes:
    """One note at a time, for a voice or a bass: pitch from pYIN, note starts from attacks.

    A pitch tracker alone cannot tell a held note from the same note played again, and
    it hears a change of pitch a little late. So the pitch decides *what* each note is and
    the detected attacks decide *where* notes begin.
    """
    import librosa
    from scipy.ndimage import median_filter

    rate, hop = 22_050, 256
    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    mono = librosa.resample(mono.astype(np.float32), orig_sr=sample_rate, target_sr=rate)
    f0, voiced, _ = librosa.pyin(
        mono,
        fmin=float(librosa.note_to_hz("C1")),
        fmax=float(librosa.note_to_hz("C7")),
        sr=rate,
        frame_length=2048,
        hop_length=hop,
    )
    level = librosa.feature.rms(y=mono, frame_length=2048, hop_length=hop)[0]
    frames = min(f0.shape[0], level.shape[0])
    pitch = np.full(frames, -1.0)
    ok = voiced[:frames] & np.isfinite(f0[:frames])
    pitch[ok] = np.round(librosa.hz_to_midi(f0[:frames][ok]))
    pitch = median_filter(pitch, size=5, mode="nearest")
    attacks = librosa.onset.onset_detect(
        y=mono, sr=rate, hop_length=hop, backtrack=True, delta=0.1, wait=4
    )
    attacks = attacks[attacks < frames]
    seconds = hop / rate
    peak = float(level.max()) or 1.0

    # Cut wherever the pitch changes, and wherever an attack falls inside a held pitch.
    cuts = {0, frames}
    cuts.update(int(index) for index in np.flatnonzero(np.diff(pitch) != 0) + 1)
    cuts.update(int(frame) for frame in attacks)
    edges = sorted(cuts)
    notes: Notes = []
    for start, end in itertools.pairwise(edges):
        voiced_frames = pitch[start:end][pitch[start:end] >= 0]
        if voiced_frames.size < max(2, (end - start) // 2):
            continue
        value = int(np.argmax(np.bincount(voiced_frames.astype(int))))
        begin = start
        if attacks.size:
            # The pitch settles a few frames after the attack that caused it.
            nearest = int(attacks[np.argmin(np.abs(attacks - start))])
            if 0 < start - nearest <= 6:
                begin = nearest
        loudness = float(level[start:end].max()) / peak
        last = notes[-1] if notes else None
        if (
            last
            and last["p"] == value
            and begin * seconds - (last["t"] + last["d"]) < 0.02
            and ((end - start) * seconds < 0.06 or not np.any(np.abs(attacks - start) <= 2))
        ):
            # The same pitch carrying on with no new attack: one note, not two.
            last["d"] = end * seconds - last["t"]
            continue
        if (end - begin) * seconds < 0.05:
            continue
        notes.append(
            {
                "t": begin * seconds,
                "d": (end - begin) * seconds,
                "p": value,
                "v": float(min(1.0, max(0.1, loudness**0.5))),
            }
        )
    return notes


def single_line(audio: np.ndarray, sample_rate: int) -> Notes:
    """A voice or a bass through basic-pitch, kept to one note at a time."""
    kept: Notes = []
    for note in sorted(poly_notes(audio, sample_rate), key=lambda n: (n["t"], -n["v"])):
        # Of notes that start together, the loudest is the line; the rest are its overtones.
        if kept and note["t"] - kept[-1]["t"] < 0.05:
            continue
        kept.append(dict(note))
    line: Notes = []
    for note in kept:
        last = line[-1] if line else None
        if last is not None:
            gap = note["t"] - (last["t"] + last["d"])
            if abs(note["p"] - last["p"]) <= 1 and gap < 0.08 and min(note["d"], last["d"]) < 0.14:
                # A slide or a wobble of a semitone is one sung note, not two: the longer
                # of the pair says which pitch it was.
                if note["d"] > last["d"]:
                    last["p"] = note["p"]
                last["d"] = note["t"] + note["d"] - last["t"]
                last["v"] = max(last["v"], note["v"])
                continue
            # One note at a time: the earlier note ends where the next begins.
            last["d"] = min(last["d"], max(0.03, note["t"] - last["t"]))
        line.append(note)
    return line


#: A note quieter than this, relative to the loudest pitch sounding with it, is not counted
#: as heard in the recording.
HEARD_DB = 30.0


def heard_notes(notes: Notes, audio: np.ndarray, sample_rate: int) -> Notes:
    """Only the notes that can actually be heard in the audio they were written from.

    A transcriber reports what it believes, and some of what it believes is not there:
    measured on a real song, a quarter to a third of the notes it wrote for a busy stem
    were at pitches with nothing sounding. So each note is checked against the stem's own
    spectrum, and kept only when its pitch is a peak while it sounds: louder than the
    semitone either side, and not far below the loudest pitch at that moment.
    """
    if not notes:
        return notes
    import librosa

    rate, hop, lowest = 22_050, 256, 21
    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    mono = librosa.resample(mono.astype(np.float32), orig_sr=sample_rate, target_sr=rate)
    spectrum = np.abs(
        librosa.cqt(
            mono,
            sr=rate,
            hop_length=hop,
            fmin=float(librosa.midi_to_hz(lowest)),
            n_bins=88,
            bins_per_octave=12,
        )
    )
    level = librosa.amplitude_to_db(spectrum, ref=np.max)
    per_second = rate / hop
    kept: Notes = []
    for note in notes:
        row = round(note["p"]) - lowest
        if row < 1 or row >= level.shape[0] - 1:
            # Outside what the spectrum covers: nothing to check it against.
            kept.append(note)
            continue
        first = int((note["t"] + 0.02) * per_second)
        last = int((note["t"] + min(max(note["d"], 0.08), 0.35)) * per_second) + 1
        if first >= level.shape[1]:
            continue
        column = level[:, first:last].mean(axis=1)
        if (
            column[row] >= column[row - 1]
            and column[row] >= column[row + 1]
            and column[row] > float(column.max()) - HEARD_DB
        ):
            kept.append(note)
    return kept


def transcribe_pitched(audio: np.ndarray, sample_rate: int, kind: str) -> tuple[Notes, str]:
    """Run the best installed engine for one kind of part, falling back when one fails."""
    chain: list[tuple[str, Callable[[np.ndarray, int], Notes]]] = []
    if kind == "piano" and engines.has_module("transkun"):
        chain.append(("transkun", piano_notes))
    if engines.has_module("basic_pitch"):
        # Measured better than a pitch tracker on single lines too: it hears repeated
        # notes as separate, where a tracker hears one long one.
        chain.append(("basic-pitch", single_line if kind == "mono" else poly_notes))
    chain.append(("pyin", mono_notes if kind == "mono" else composition._notes_pyin))
    for name, run in chain:
        try:
            return run(audio, sample_rate), name
        except Exception:
            if name == chain[-1][0]:
                raise
            logger.warning(
                "%s failed on a %s part; trying the next engine.", name, kind, exc_info=True
            )
    return [], "pyin"


# --------------------------------------------------------------------------- drums


def _hits(audio: np.ndarray, sample_rate: int, floor: float) -> list[tuple[float, float]]:
    """Hits in one percussion signal as ``(seconds, strength)``, from its loudness alone.

    A drum hit is a sudden rise in level followed by a decay. Following the level, rather
    than changes in the spectrum, keeps a drum whose pitch drops as it rings (a kick, a
    tom) from being counted again part-way through its own decay. ``floor`` is the level,
    as a fraction of the loudest hit anywhere in the kit, below which a rise is bleed from
    another drum rather than a hit on this one.
    """
    import librosa

    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    mono = mono.astype(np.float32)
    if mono.size < 2048 or float(np.abs(mono).max()) < 1e-4:
        return []
    hop = 128
    level = librosa.feature.rms(y=mono, frame_length=512, hop_length=hop, center=True)[0]
    back = max(2, int(0.012 * sample_rate / hop))
    ahead = max(4, int(0.04 * sample_rate / hop))
    found: list[tuple[float, float]] = []
    last_peak = 0.0
    index = back
    while index < level.size:
        before = float(level[index - back : index].min())
        rise = float(level[index]) - before
        if rise < floor * 0.5:
            index += 1
            continue
        peak = float(level[index : index + ahead].max())
        at = (index - back // 2) * hop / sample_rate
        ringing = bool(found) and at - found[-1][0] < 0.25 and before > last_peak * 0.5
        if peak >= floor and not ringing and (not found or at - found[-1][0] >= 0.05):
            found.append((max(0.0, at), peak))
            last_peak = peak
        # Skip past this hit's attack so its own rising edge is not read as another.
        index += ahead
    return found


def _band(audio: np.ndarray, sample_rate: int, low: float, high: float) -> np.ndarray:
    from scipy.signal import butter, sosfiltfilt

    mono = audio.mean(axis=1) if audio.ndim == 2 else audio
    edges = [max(20.0, low), min(high, sample_rate / 2 - 100)]
    sos = butter(4, edges, btype="bandpass", fs=sample_rate, output="sos")
    return np.asarray(sosfiltfilt(sos, mono), dtype=np.float32)


def drum_notes(
    drums: np.ndarray, sample_rate: int, kit: dict[str, np.ndarray] | None
) -> tuple[Notes, str]:
    """Drum hits on their General MIDI notes, from kit pieces or from bands of the stem."""
    if kit:
        pieces = {name: kit[name] for name in DRUM_PITCHES if name in kit}
        engine = "kit pieces"
    else:
        # Without the kit separator: the kick lives at the bottom, the snare in the middle
        # and the cymbals at the top. Toms and the kinds of cymbal cannot be told apart.
        pieces = {
            "kick": _band(drums, sample_rate, 30, 110),
            "snare": _band(drums, sample_rate, 180, 2500),
            "hi-hat": _band(drums, sample_rate, 7000, 16000),
        }
        engine = "frequency bands"
    loudest = max((float(np.abs(piece).max()) for piece in pieces.values()), default=0.0)
    if loudest < 1e-4:
        return [], engine
    notes: Notes = []
    for name, piece in pieces.items():
        for at, strength in _hits(piece, sample_rate, floor=loudest * 0.05):
            notes.append(
                {
                    "t": at,
                    "d": 0.1,
                    "p": DRUM_PITCHES[name],
                    "v": min(1.0, max(0.15, (strength / (loudest * 0.5)) ** 0.5)),
                }
            )
    return notes, engine


# --------------------------------------------------------------------------- musical clean-up

_SCALES = {"major": (0, 2, 4, 5, 7, 9, 11), "minor": (0, 2, 3, 5, 7, 8, 10)}


def keep_in_key(notes: Notes, tonic: int, scale: str) -> Notes:
    """Drop the notes outside the key that are too short or faint to be meant.

    A wrong detection is far more likely to fall outside the song's key than a played note
    is. A long or strong note outside the key is kept, because real music has those.
    """
    allowed = {(tonic + step) % 12 for step in _SCALES.get(scale, _SCALES["major"])}
    return [
        note
        for note in notes
        if int(note["p"]) % 12 in allowed or (note["d"] >= 0.25 and note["v"] >= 0.5)
    ]


def beat_grid(beats: list[float], divisions: int) -> np.ndarray:
    """Every subdivision of the tracked beats, following the performance's own tempo."""
    if len(beats) < 3:
        return np.zeros(0)
    marks = np.asarray(beats, dtype=np.float64)
    steps = [np.linspace(a, b, divisions, endpoint=False) for a, b in itertools.pairwise(marks)]
    # Carry the last beat's spacing on a little, so the song's final notes have a grid too.
    tail = marks[-1] + (marks[-1] - marks[-2]) * np.arange(0, 2 * divisions) / divisions
    return np.concatenate([*steps, tail])


def snap_to_grid(tracks: list[dict[str, Any]], beats: list[float]) -> str | None:
    """Move note starts onto the beat grid the song itself keeps. Returns the grid used.

    The grid comes from beats tracked in this recording, so it bends with the playing and
    the notes stay lined up with the audio. Whichever of sixteenths and triplets fits the
    notes better is used, and a note far from any grid line is left where it was.
    """
    starts = np.array([note["t"] for track in tracks for note in track["notes"]])
    if starts.size < 8 or len(beats) < 8:
        return None

    def miss(grid: np.ndarray) -> float:
        index = np.clip(np.searchsorted(grid, starts), 1, grid.size - 1)
        return float(
            np.mean(np.minimum(np.abs(starts - grid[index - 1]), np.abs(grid[index] - starts)))
        )

    sixteenths, triplets = beat_grid(beats, 4), beat_grid(beats, 3)
    # Triplets are a coarser grid, so they must fit clearly better to be believed.
    use_triplets = miss(triplets) < miss(sixteenths) * 0.6
    grid = triplets if use_triplets else sixteenths
    for track in tracks:
        for note in track["notes"]:
            index = int(np.clip(np.searchsorted(grid, note["t"]), 1, grid.size - 1))
            before, after = grid[index - 1], grid[index]
            nearest = before if note["t"] - before <= after - note["t"] else after
            if abs(nearest - note["t"]) <= (after - before) * 0.45:
                note["t"] = round(float(max(0.0, nearest)), 4)
    return "triplets" if use_triplets else "sixteenths"


# --------------------------------------------------------------------------- the whole song


def drop_bleed(tracks: list[dict[str, Any]]) -> None:
    """Keep a note only on the part where it is loudest.

    Separation is never perfect: a strong note leaks faintly into the other stems and is
    transcribed again there. The same pitch starting at the same moment on two parts is one
    played note, and it belongs to the part that heard it loudest.
    """
    best: dict[tuple[int, int], tuple[float, int]] = {}
    for index, track in enumerate(tracks):
        for note in track["notes"]:
            # 60 ms buckets, checked with their neighbours below, so timing jitter still matches.
            key = (int(note["p"]), int(note["t"] / 0.06))
            if key not in best or note["v"] > best[key][0]:
                best[key] = (note["v"], index)
    for index, track in enumerate(tracks):
        kept = []
        for note in track["notes"]:
            pitch, slot = int(note["p"]), int(note["t"] / 0.06)
            owners = [best.get((pitch, slot + shift)) for shift in (-1, 0, 1)]
            louder_elsewhere = any(
                owner is not None and owner[1] != index and owner[0] > note["v"] for owner in owners
            )
            if not louder_elsewhere:
                kept.append(note)
        track["notes"] = kept


# --------------------------------------------------------------------------- one model, whole mix

#: MuScriptor's instrument groups -> (track name, General MIDI program).
WHOLE_MIX_PARTS: dict[str, tuple[str, int]] = {
    "acoustic_piano": ("Piano", 0),
    "electric_piano": ("Electric piano", 4),
    "chromatic_percussion": ("Mallets and bells", 11),
    "organ": ("Organ", 16),
    "acoustic_guitar": ("Acoustic guitar", 25),
    "clean_electric_guitar": ("Electric guitar", 27),
    "distorted_electric_guitar": ("Distorted guitar", 30),
    "acoustic_bass": ("Acoustic bass", 32),
    "electric_bass": ("Bass", 33),
    "violin": ("Violin", 40),
    "viola": ("Viola", 41),
    "cello": ("Cello", 42),
    "contrabass": ("Contrabass", 43),
    "orchestral_harp": ("Harp", 46),
    "timpani": ("Timpani", 47),
    "string_ensemble": ("Strings", 48),
    "synth_strings": ("Synth strings", 50),
    # A flute rather than a choir: it speaks at once, so short sung notes are heard.
    "voice": ("Vocals", 73),
    "orchestra_hit": ("Orchestra hit", 55),
    "trumpet": ("Trumpet", 56),
    "trombone": ("Trombone", 57),
    "tuba": ("Tuba", 58),
    "french_horn": ("French horn", 60),
    "brass_section": ("Brass", 61),
    "soprano_and_alto_sax": ("Alto sax", 65),
    "tenor_sax": ("Tenor sax", 66),
    "baritone_sax": ("Baritone sax", 67),
    "oboe": ("Oboe", 68),
    "english_horn": ("English horn", 69),
    "bassoon": ("Bassoon", 70),
    "clarinet": ("Clarinet", 71),
    "flutes": ("Flute", 73),
    "synth_lead": ("Synth lead", 81),
    "synth_pad": ("Synth pad", 89),
}
#: General MIDI's sixteen families, eight programs each, for groups named by program number.
GM_FAMILIES = (
    "Piano", "Chromatic percussion", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass",
    "Reed", "Pipe", "Synth lead", "Synth pad", "Synth effects", "Ethnic", "Percussive",
    "Sound effects",
)  # fmt: skip


def whole_mix_part(group: str) -> tuple[str, int]:
    """The track name and General MIDI program for one of MuScriptor's instrument groups.

    Notes the model decodes into a group outside its usual list arrive as ``program_<n>``,
    a General MIDI program number, and are named after that program's family.
    """
    if group in WHOLE_MIX_PARTS:
        return WHOLE_MIX_PARTS[group]
    if group.startswith("program_") and group[8:].isdigit():
        program = min(127, int(group[8:]))
        return f"{GM_FAMILIES[program // 8]} ({program + 1})", program
    return group.replace("_", " ").capitalize(), 0


WHOLE_MIX_SIZES = ("small", "medium", "large")
WHOLE_MIX_SIZE_ENV = "MUSIC_SUITE_MUSCRIPTOR_SIZE"
ENGINES = ("auto", "stems", "muscriptor")
#: Whether "auto" reaches for the whole-mix model when it is installed. It does not:
#: measured on a real song against the recording itself, 66 to 87 percent of the notes the
#: stems method wrote were audibly there, against 43 to 64 percent for the whole-mix model,
#: which also named instruments the song did not have. It stays available by name.
AUTO_WHOLE_MIX = False
WHOLE_MIX_ACCESS = (
    "MuScriptor's model is not available on this computer yet. Its weights are for "
    "non-commercial use and need a free Hugging Face account: accept the terms at "
    "https://huggingface.co/MuScriptor/muscriptor-medium, then sign in on this computer "
    "with 'hf auth login' (or set HF_TOKEN) and restart Music Suite."
)

_WHOLE_MIX_LOCK = threading.Lock()
_whole_mix_model: Any = None


_whole_mix_loaded_size: str | None = None


def _cached_size(size: str) -> bool:
    from huggingface_hub import try_to_load_from_cache

    return isinstance(
        try_to_load_from_cache(f"MuScriptor/muscriptor-{size}", "model.safetensors"), str
    )


def whole_mix_size() -> str:
    """The model size in use: the one loaded, else the one asked for, else one already here.

    Each size is its own gated download whose terms are accepted separately, so the size
    asked for may be one this account cannot fetch while another is already on disk.
    """
    import os

    if _whole_mix_loaded_size:
        return _whole_mix_loaded_size
    asked = os.getenv(WHOLE_MIX_SIZE_ENV, "").strip().lower()
    if asked in WHOLE_MIX_SIZES:
        return asked
    try:
        for size in ("medium", "large", "small"):
            if _cached_size(size):
                return size
    except Exception:
        logger.warning("Could not look for downloaded MuScriptor weights.", exc_info=True)
    return "medium"


def whole_mix_status() -> str:
    """ "ready", "needs-access" or "not-installed" for the whole-mix model."""
    if not engines.has_module("muscriptor"):
        return "not-installed"
    try:
        from huggingface_hub import get_token

        if _cached_size(whole_mix_size()) or get_token():
            return "ready"
    except Exception:
        logger.warning("Could not check access to the MuScriptor weights.", exc_info=True)
    return "needs-access"


def _load_whole_mix() -> Any:
    """Load the model, trying the other sizes when the account may not download this one."""
    global _whole_mix_model, _whole_mix_loaded_size
    with _WHOLE_MIX_LOCK:
        if _whole_mix_model is None:
            from muscriptor import TranscriptionModel

            first = whole_mix_size()
            sizes = [first, *(size for size in ("medium", "large", "small") if size != first)]
            failure: Exception | None = None
            for size in sizes:
                try:
                    _whole_mix_model = TranscriptionModel.load_model(size)
                except Exception as exc:  # most often: this size's terms were not accepted
                    logger.warning("MuScriptor %s could not be loaded.", size, exc_info=True)
                    failure = failure or exc
                    continue
                _whole_mix_loaded_size = size
                break
            if _whole_mix_model is None:
                raise failure or RuntimeError("No MuScriptor model could be loaded.")
        return _whole_mix_model


def whole_mix_tracks(audio: np.ndarray, sample_rate: int, report: Progress) -> list[dict[str, Any]]:
    """Every instrument's notes from the full mix, in one pass through MuScriptor.

    The model reports no loudness, so each note takes its velocity from how loud the
    recording is at the moment it starts.
    """
    from muscriptor import NoteEndEvent, NoteStartEvent

    model = _load_whole_mix()
    mono = (audio.mean(axis=1) if audio.ndim == 2 else audio).astype(np.float32)
    hop = max(1, sample_rate // 100)
    usable = mono[: mono.size - mono.size % hop]
    level: np.ndarray = np.zeros(1)
    if usable.size:
        level = np.sqrt(np.mean(np.square(usable.reshape(-1, hop)), axis=1))
    loudest = float(np.max(level)) or 1.0

    def velocity(at: float) -> float:
        index = min(level.size - 1, max(0, int(at * 100)))
        heard = float(np.max(level[index : index + 6])) / loudest
        return min(1.0, max(0.3, heard**0.5))

    by_group: dict[str, Notes] = {}
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        path = Path(tmp) / "mix.wav"
        sf.write(str(path), mono, sample_rate, subtype="PCM_16")
        for event in model.transcribe(str(path)):
            if isinstance(event, NoteEndEvent):
                start = event.start_event
                drums = start.instrument == "drums"
                by_group.setdefault(start.instrument, []).append(
                    {
                        "t": float(start.start_time),
                        # Drums are reported as hits, with no length of their own.
                        "d": 0.1 if drums else float(event.end_time - start.start_time),
                        "p": int(start.pitch),
                        "v": velocity(float(start.start_time)),
                    }
                )
            elif not isinstance(event, NoteStartEvent):
                total = getattr(event, "total", 0)
                if total:
                    report(float(getattr(event, "completed", 0)) / float(total))
    tracks: list[dict[str, Any]] = []
    for group, notes in by_group.items():
        if group == "drums":
            continue
        label, program = whole_mix_part(group)
        tracks.append(
            {"name": label, "role": group, "program": program, "drums": False, "notes": notes}
        )
    # Parts in score order, with the drums last as everywhere else in the suite.
    order = list(WHOLE_MIX_PARTS)
    tracks.sort(key=lambda track: order.index(track["role"]) if track["role"] in order else 99)
    if by_group.get("drums"):
        tracks.append(
            {
                "name": "Drums",
                "role": "drums",
                "program": 0,
                "drums": True,
                "notes": by_group["drums"],
            }
        )
    return tracks


#: A vocal stem quieter than this, relative to the rest of the song, holds only bleed.
#: Sung parts in two real songs measured 0.11 and 0.28; a synthesized tone the separator
#: did not take for a voice measured 0.0.
VOCAL_RATIO = 0.05


def sung_line(audio: np.ndarray, sample_rate: int, report: Progress) -> tuple[Notes, str] | None:
    """The sung melody, from a vocals-only split. None when the song has no singing.

    MuScriptor, measured on two real songs, wrote down under a fifth of the sung notes,
    and mostly under other instruments' names; singing is what it hears least well. A
    two-way split isolates the voice cleanly, and a single line is then written from it.
    """
    stems, _engine = separation.separate(audio, sample_rate, 2, report)
    vocals, rest = stems.get("vocals"), stems.get("instrumental")
    if vocals is None or rest is None or _rms(vocals) < _rms(rest) * VOCAL_RATIO:
        return None
    notes, engine = transcribe_pitched(vocals, sample_rate, "mono")
    low, high = RANGES["vocals"]
    return [note for note in notes if low <= note["p"] <= high], engine


def _whole_mix_song(
    audio: np.ndarray, sample_rate: int, report: Progress, snap: bool
) -> dict[str, Any]:
    from audioqi.editor import analysis

    seconds = audio.shape[0] / float(sample_rate)
    measured = analysis.analyze(audio, sample_rate)
    key = analysis.parse_key(str(measured.get("key_label") or ""))
    key_trusted = key is not None and float(measured.get("key_confidence") or 0.0) >= 0.7
    tracks = whole_mix_tracks(audio, sample_rate, lambda fraction: report(0.05 + 0.75 * fraction))
    engine = f"muscriptor ({whole_mix_size()})"
    engines_used = {str(track["name"]): engine for track in tracks}
    stems_note = "none: transcribed from the full mix"
    if not any(track["role"] == "voice" for track in tracks):
        try:
            sung = sung_line(audio, sample_rate, lambda fraction: report(0.8 + 0.15 * fraction))
        except Exception:
            logger.warning("The vocal line could not be added.", exc_info=True)
            sung = None
        if sung and sung[0]:
            label, program = WHOLE_MIX_PARTS["voice"]
            tracks.insert(
                0,
                {
                    "name": label,
                    "role": "voice",
                    "program": program,
                    "drums": False,
                    "notes": sung[0],
                },
            )
            engines_used[label] = f"{sung[1]} (vocals split out)"
            stems_note = "vocals only, for the sung line"
    for track in tracks:
        notes = track["notes"]
        if not track["drums"] and key is not None and key_trusted:
            notes = keep_in_key(notes, key[0], key[1])
        track["notes"] = _tidy(notes, seconds)
    tracks = [track for track in tracks if track["notes"]]
    grid = snap_to_grid(tracks, list(measured.get("beats") or [])) if snap else None
    if grid:
        for track in tracks:
            track["notes"] = _tidy(track["notes"], seconds)
    report(1.0)
    if not tracks:
        raise NoNotesError("MuScriptor found no notes in this audio.")
    return {
        "bpm": measured.get("bpm"),
        "key": measured.get("key_label") if key_trusted else None,
        "grid": grid,
        "tracks": tracks,
        "engines": {
            name: used
            for name, used in engines_used.items()
            if any(t["name"] == name for t in tracks)
        },
        "stems": stems_note,
        "skipped": [],
        "seconds": round(seconds, 3),
        "note_count": sum(len(track["notes"]) for track in tracks),
    }


def song_to_midi(
    audio: np.ndarray,
    sample_rate: int,
    progress: Progress | None = None,
    *,
    snap: bool = True,
    engine: str = "auto",
    source: str = "song",
) -> dict[str, Any]:
    """A recording as one track of notes per instrument.

    ``source`` says what the recording is. "song" is a full mix, split into stems first.
    "piano", "instrument" and "voice" are one instrument on its own, which is transcribed
    as it stands: splitting a solo recording only tears it into pieces.

    ``engine`` "auto" and "stems" split the song into stems and transcribe each, checking
    every note against the stem it came from. "muscriptor" asks for the whole-mix model.
    """
    if engine not in ENGINES:
        raise EditorError("Engine must be auto, stems or muscriptor.")
    if source not in SOURCES:
        raise EditorError("Source must be song, piano, instrument or voice.")
    report = progress or (lambda _fraction: None)
    if float(np.max(np.abs(audio))) < 1e-4:
        raise EditorError("This audio is silent, so there are no notes to find.")
    if source != "song":
        return _solo(audio, sample_rate, report, source, snap)
    status = whole_mix_status()
    if engine == "muscriptor" and status != "ready":
        raise EditorError(WHOLE_MIX_ACCESS, 409)
    problem: str | None = None
    if status == "ready" and (engine == "muscriptor" or (engine == "auto" and AUTO_WHOLE_MIX)):
        try:
            return _whole_mix_song(audio, sample_rate, report, snap)
        except NoNotesError:
            if engine == "muscriptor":
                raise
            problem = "MuScriptor found no notes, so the stems method was used."
        except EditorError:
            raise
        except Exception as exc:
            # Most often: signed in, but the model's terms have not been accepted yet.
            logger.warning("MuScriptor could not transcribe; using stems instead.", exc_info=True)
            if engine == "muscriptor":
                raise EditorError(WHOLE_MIX_ACCESS, 409) from exc
            problem = f"MuScriptor could not be used ({type(exc).__name__}), so stems were used."
    result = _stems_song(audio, sample_rate, report, snap=snap)
    if problem:
        result["whole_mix_problem"] = problem
    return result


#: What a recording can be said to hold: a full mix, or one instrument on its own.
SOURCES = ("song", "piano", "instrument", "voice")
_SOLO: dict[str, tuple[str, int, str]] = {
    "piano": ("Piano", 0, "piano"),
    "instrument": ("Instrument", 0, "poly"),
    "voice": ("Voice", 73, "mono"),
}


#: A stem holding at least this share of a recording's energy is the whole recording.
ALONE_SHARE = 0.9


def _one_instrument(levels: dict[str, float]) -> str | None:
    """What a recording is when one stem holds nearly all of it; None for a real mix.

    A lone voice is a "voice". Anything else is "keys": a piano or another instrument,
    told apart afterwards by which transcriber's notes the audio bears out.
    """
    energy = {name: level * level for name, level in levels.items()}
    total = sum(energy.values())
    if total <= 0:
        return None
    name, most = max(energy.items(), key=lambda item: item[1])
    if most / total < ALONE_SHARE or name == "drums" or name in DRUM_PITCHES:
        return None
    return "voice" if name == "vocals" else "keys"


def _solo(
    audio: np.ndarray, sample_rate: int, report: Progress, source: str, snap: bool
) -> dict[str, Any]:
    """One instrument on its own, written down without splitting it first."""
    from audioqi.editor import analysis

    seconds = audio.shape[0] / float(sample_rate)
    report(0.1)
    if source == "keys":
        # Not told which: the piano model is the more exact when it is a piano, and says
        # so by most of its notes being found in the audio. Otherwise the general one.
        raw, engine = transcribe_pitched(audio, sample_rate, "piano")
        notes = heard_notes(raw, audio, sample_rate)
        source = "piano"
        if not notes or len(notes) < 0.75 * len(raw):
            source = "instrument"
            raw, engine = transcribe_pitched(audio, sample_rate, "poly")
            notes = heard_notes(raw, audio, sample_rate)
        label, program, _kind = _SOLO[source]
    else:
        label, program, kind = _SOLO[source]
        raw, engine = transcribe_pitched(audio, sample_rate, kind)
        notes = heard_notes(raw, audio, sample_rate)
    report(0.7)
    notes = _tidy(notes, seconds)
    if not notes:
        raise EditorError("No notes were found in this audio.")
    measured = analysis.analyze(audio, sample_rate)
    tracks = [{"name": label, "role": source, "program": program, "drums": False, "notes": notes}]
    grid = snap_to_grid(tracks, list(measured.get("beats") or [])) if snap else None
    if grid:
        tracks[0]["notes"] = _tidy(tracks[0]["notes"], seconds)
    report(1.0)
    return {
        "bpm": measured.get("bpm"),
        "key": measured.get("key_label"),
        "grid": grid,
        "tracks": tracks,
        "engines": {label: engine},
        "stems": "none (one instrument)",
        "skipped": [],
        "seconds": round(seconds, 3),
        "note_count": len(tracks[0]["notes"]),
    }


def _stems_song(
    audio: np.ndarray,
    sample_rate: int,
    progress: Progress | None = None,
    *,
    snap: bool = True,
    stem_count: int | None = None,
) -> dict[str, Any]:
    """Split a recording into stems and transcribe each. Returns tracks and what wrote them."""
    report = progress or (lambda _fraction: None)
    seconds = audio.shape[0] / float(sample_rate)
    if float(np.max(np.abs(audio))) < 1e-4:
        raise EditorError("This audio is silent, so there are no notes to find.")
    # Four stems, not six, even when six can be made. The six-stem model guesses which of
    # guitar, piano and "other" each sound belongs to, and guesses differently from moment
    # to moment: a solo piano with known notes came back split across all three, and the
    # fragments transcribed to 6 percent of its notes at 3 percent of their length. As one
    # "other" stem the same piano gave 96 percent.
    options = engines.stem_options()
    count = stem_count or (4 if 4 in options else max(options))
    kit_available = separation.detail_available() and count >= 4
    stems, stem_engine = separation.separate(
        audio,
        sample_rate,
        count,
        lambda fraction: report(0.6 * fraction),
        drum_kit_pass=kit_available,
    )

    # With the kit pass the drum stem comes back as its pieces instead of one "drums" stem.
    kit = {name: stem for name, stem in stems.items() if name in DRUM_PITCHES}
    pitched = {name: stem for name, stem in stems.items() if name in PARTS}
    drums = stems.get("drums")
    levels = {name: _rms(stem) for name, stem in stems.items()}
    loudest = max(levels.values(), default=0.0)

    # One instrument on its own shows up as one stem holding nearly all of the sound. It is
    # then written down from the recording itself, whole, rather than from a stem of it.
    alone = _one_instrument(levels)
    if alone is not None:
        result = _solo(audio, sample_rate, lambda f: report(0.6 + 0.4 * f), alone, snap)
        result["detected"] = alone
        return result

    # The song's own key and beats, used to clean the notes up once they are written.
    from audioqi.editor import analysis

    measured = analysis.analyze(audio, sample_rate)
    key = analysis.parse_key(str(measured.get("key_label") or ""))
    key_trusted = key is not None and float(measured.get("key_confidence") or 0.0) >= 0.7

    tracks: list[dict[str, Any]] = []
    used: dict[str, str] = {}
    skipped: list[str] = []
    order = [name for name in PARTS if name in pitched]
    total = len(order) + 1
    for index, name in enumerate(order):
        label, program, kind = PARTS[name]
        report(0.6 + 0.38 * index / total)
        if loudest <= 0 or levels[name] < loudest * SILENT_RATIO:
            skipped.append(label)
            continue
        notes, engine = transcribe_pitched(pitched[name], sample_rate, kind)
        low, high = RANGES.get(name, (0, 127))
        notes = [note for note in notes if low <= note["p"] <= high]
        notes = heard_notes(notes, pitched[name], sample_rate)
        if key is not None and key_trusted:
            notes = keep_in_key(notes, key[0], key[1])
        notes = _tidy(notes, seconds)
        if not notes:
            skipped.append(label)
            continue
        used[label] = engine
        tracks.append(
            {"name": label, "role": name, "program": program, "drums": False, "notes": notes}
        )

    drop_bleed(tracks)
    for track in [track for track in tracks if not track["notes"]]:
        tracks.remove(track)
        skipped.append(str(track["name"]))
        used.pop(str(track["name"]), None)
    report(0.6 + 0.38 * len(order) / total)
    if kit or drums is not None:
        source = drums if drums is not None else np.sum(list(kit.values()), axis=0)
        # A song with no drums still leaves a whisper in the drum stem, and hit detection
        # works on relative level, so it would write a full kit part from that whisper.
        if loudest <= 0 or _rms(source) < loudest * SILENT_RATIO:
            notes, engine = [], "none"
        else:
            notes, engine = drum_notes(source, sample_rate, kit or None)
        notes = _tidy(notes, seconds)
        if notes:
            used["Drums"] = engine
            tracks.append(
                {"name": "Drums", "role": "drums", "program": 0, "drums": True, "notes": notes}
            )
        else:
            skipped.append("Drums")

    grid = snap_to_grid(tracks, list(measured.get("beats") or [])) if snap else None
    if grid:
        for track in tracks:
            # Two notes can land on one grid line; they are the same note.
            track["notes"] = _tidy(track["notes"], seconds)
    report(1.0)
    if not tracks:
        raise EditorError("No notes were found in this audio.")
    return {
        "bpm": measured.get("bpm"),
        "key": measured.get("key_label") if key_trusted else None,
        "grid": grid,
        "tracks": tracks,
        "engines": used,
        "stems": stem_engine,
        "skipped": skipped,
        "seconds": round(seconds, 3),
        "note_count": sum(len(track["notes"]) for track in tracks),
    }
