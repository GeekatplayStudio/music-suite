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
Progress = Callable[[float], None]

MAX_NOTES_PER_PART = 20_000
#: A stem quieter than this, relative to the loudest stem, holds only bleed from the others.
SILENT_RATIO = 0.04
#: General MIDI percussion notes for the separated kit pieces.
DRUM_PITCHES = {"kick": 36, "snare": 38, "toms": 45, "hi-hat": 42, "ride": 51, "crash": 49}
#: Stem name -> (track name, General MIDI program, how it is transcribed).
PARTS: dict[str, tuple[str, int, str]] = {
    "vocals": ("Vocals", 52, "mono"),
    "lead vocals": ("Lead vocals", 52, "mono"),
    "backing vocals": ("Backing vocals", 53, "poly"),
    "bass": ("Bass", 33, "mono"),
    "piano": ("Piano", 0, "piano"),
    "guitar": ("Guitar", 25, "poly"),
    "other": ("Other instruments", 48, "poly"),
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
        # Firmer thresholds than the model's defaults (0.5, 0.3, 58 ms): the faint
        # detections are mostly overtones and ringing, not played notes. Chosen by measuring
        # 25 synthesized parts against their notes; real recordings were not part of that.
        _, _, events = predict(
            str(path), onset_threshold=0.55, frame_threshold=0.45, minimum_note_length=90.0
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


def song_to_midi(
    audio: np.ndarray, sample_rate: int, progress: Progress | None = None
) -> dict[str, Any]:
    """Split a recording into stems and transcribe each. Returns tracks and what wrote them."""
    report = progress or (lambda _fraction: None)
    seconds = audio.shape[0] / float(sample_rate)
    if float(np.max(np.abs(audio))) < 1e-4:
        raise EditorError("This audio is silent, so there are no notes to find.")
    count = max(engines.stem_options())
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
        notes = _tidy([note for note in notes if low <= note["p"] <= high], seconds)
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
        notes, engine = drum_notes(source, sample_rate, kit or None)
        notes = _tidy(notes, seconds)
        if notes:
            used["Drums"] = engine
            tracks.append(
                {"name": "Drums", "role": "drums", "program": 0, "drums": True, "notes": notes}
            )
        else:
            skipped.append("Drums")

    report(1.0)
    if not tracks:
        raise EditorError("No notes were found in this audio.")
    return {
        "tracks": tracks,
        "engines": used,
        "stems": stem_engine,
        "skipped": skipped,
        "seconds": round(seconds, 3),
        "note_count": sum(len(track["notes"]) for track in tracks),
    }
