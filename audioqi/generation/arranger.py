"""Writes a multi-instrument arrangement as notes, from music theory rather than a model.

This is the suite's symbolic generator: it produces MIDI-style notes for drums, bass, chords,
a melody, a pad and an arpeggio, which land in the Studio Editor as instrument tracks that can
be edited, re-voiced and exported as a MIDI file. Nothing is sampled or synthesised here, and
no model is loaded: the same seed always gives the same arrangement, and it takes milliseconds.

The musical shape comes from three ideas:

* **Sections carry material.** A chorus is written once and reused wherever the form says
  "chorus", with a small variation each time. That repetition is what makes a sequence of
  chords sound like a song rather than a stream of bars.
* **Chords are voice-led.** Each chord is voiced in the inversion nearest the one before it,
  so the inner parts move by a step or two instead of jumping.
* **Patterns follow the pulse, not the bar.** Grooves are written against the metre's pulse,
  so 3/4 and the compound metres (6/8, 9/8, 12/8) come out correctly rather than as 4/4 cut
  to length.

Note times and lengths are in seconds on the arrangement's own timeline, and velocities are
0 to 1, which is the editor's own note format.
"""

from __future__ import annotations

import random
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

# --------------------------------------------------------------------------- keys and scales

KEY_NAMES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
#: The same 24 keys, in the same spelling, that the analyser and the other providers use.
KEYS = [f"{note} {mode}" for note in KEY_NAMES for mode in ("major", "minor")]
_KEY_LOOKUP = {key.lower(): key for key in KEYS}

SCALES: dict[str, tuple[int, ...]] = {
    "major": (0, 2, 4, 5, 7, 9, 11),
    "minor": (0, 2, 3, 5, 7, 8, 10),
}

#: General MIDI percussion notes the grooves use.
KICK, SNARE, CLAP, HAT, HAT_OPEN, CRASH, RIDE, TOM_LOW, TOM_MID, TOM_HIGH = (
    36,
    38,
    39,
    42,
    46,
    49,
    51,
    45,
    47,
    50,
)


def canonical_key(label: Any) -> str | None:
    """The suite's spelling of a key label ("a MINOR" -> "A minor"), or None if it is not one."""
    return _KEY_LOOKUP.get(str(label or "").strip().lower())


def parse_key(label: Any) -> tuple[int, str]:
    """A key label such as "A minor" as a tonic pitch class and a mode name."""
    text = str(label or "C major").strip().lower()
    canonical = _KEY_LOOKUP.get(text)
    if canonical is None:
        return 0, "major"
    note, mode = canonical.rsplit(" ", 1)
    return KEY_NAMES.index(note), mode


# --------------------------------------------------------------------------- the form

#: Section roles an arrangement is built from. Each has a part list and an energy level.
ROLES = ("intro", "verse", "prechorus", "chorus", "bridge", "solo", "outro")

#: Ready-made forms. Each is a list of roles; the layout repeats their material.
FORMS: dict[str, tuple[str, ...]] = {
    "verse-chorus": ("intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"),
    "pop": ("intro", "verse", "prechorus", "chorus", "verse", "prechorus", "chorus", "outro"),
    "short": ("intro", "verse", "chorus", "outro"),
    "loop": ("verse", "verse", "chorus", "verse"),
    "aaba": ("intro", "verse", "verse", "bridge", "verse", "outro"),
    "build": ("intro", "verse", "verse", "prechorus", "chorus", "chorus", "outro"),
    "instrumental": ("intro", "verse", "solo", "verse", "solo", "outro"),
}

#: Bars each role lasts, before the length is trimmed to fit.
ROLE_BARS: dict[str, int] = {
    "intro": 4,
    "verse": 8,
    "prechorus": 4,
    "chorus": 8,
    "bridge": 8,
    "solo": 8,
    "outro": 4,
}

#: How loud and how full each role is, 0 to 1.
ROLE_ENERGY: dict[str, float] = {
    "intro": 0.4,
    "verse": 0.6,
    "prechorus": 0.75,
    "chorus": 1.0,
    "bridge": 0.65,
    "solo": 0.85,
    "outro": 0.45,
}

#: Which parts play in each role. An absent part is silent for that section.
ROLE_PARTS: dict[str, frozenset[str]] = {
    "intro": frozenset({"chords", "pad", "arp"}),
    "verse": frozenset({"drums", "bass", "chords", "melody", "pad"}),
    "prechorus": frozenset({"drums", "bass", "chords", "pad", "arp"}),
    "chorus": frozenset({"drums", "bass", "chords", "melody", "pad", "arp"}),
    "bridge": frozenset({"drums", "bass", "chords", "pad"}),
    "solo": frozenset({"drums", "bass", "chords", "melody", "arp"}),
    "outro": frozenset({"chords", "pad", "bass"}),
}

PARTS = ("drums", "bass", "chords", "melody", "pad", "arp")


# --------------------------------------------------------------------------- styles


@dataclass(frozen=True)
class Style:
    label: str
    #: Chord degrees (0 = the tonic chord) per role, one chord per slot.
    progressions: Mapping[str, tuple[tuple[int, ...], ...]]
    groove: str
    bass: str
    comp: str
    #: Tempo offered when the user does not set one.
    bpm: int
    #: General MIDI programs for the pitched parts.
    programs: dict[str, int]
    #: Chords in a bar: 1 is the usual, 2 moves the harmony twice as fast.
    chords_per_bar: int = 1
    #: Add the seventh to every chord (jazz and soul rather than pop).
    sevenths: bool = False
    #: Shift every second subdivision late, for a swung feel (0 is straight).
    swing: float = 0.0
    #: Where the melody sits, as a MIDI pitch.
    melody_centre: int = 72
    #: Longest note the melody writes, in pulses.
    phrasing: str = "balanced"


#: Progressions are written as scale degrees: 0 is I (or i), 4 is V, 5 is vi.
_POP = {
    "intro": ((0, 5, 3, 4),),
    "verse": ((5, 3, 0, 4), (0, 4, 5, 3)),
    "prechorus": ((3, 4, 5, 4), (1, 4, 0, 0)),
    "chorus": ((0, 4, 5, 3), (5, 3, 0, 4)),
    "bridge": ((3, 0, 3, 4), (1, 5, 3, 4)),
    "solo": ((0, 4, 5, 3),),
    "outro": ((0, 3, 0, 0),),
}
_MINOR = {
    "intro": ((0, 5, 2, 6),),
    "verse": ((0, 5, 2, 6), (0, 3, 5, 6)),
    "prechorus": ((3, 4, 0, 0), (5, 6, 0, 0)),
    "chorus": ((0, 6, 5, 2), (5, 2, 6, 0)),
    "bridge": ((3, 6, 2, 4), (5, 3, 0, 4)),
    "solo": ((0, 5, 2, 6),),
    "outro": ((0, 5, 0, 0),),
}
_BLUES = {
    "intro": ((0, 0, 3, 4),),
    "verse": ((0, 0, 3, 0), (0, 3, 0, 4)),
    "prechorus": ((3, 3, 4, 4),),
    "chorus": ((0, 3, 0, 4), (3, 3, 0, 0)),
    "bridge": ((4, 3, 0, 0),),
    "solo": ((0, 0, 3, 4),),
    "outro": ((0, 3, 0, 0),),
}
_JAZZ = {
    "intro": ((1, 4, 0, 0),),
    "verse": ((1, 4, 0, 5), (0, 5, 1, 4)),
    "prechorus": ((3, 6, 1, 4),),
    "chorus": ((0, 5, 1, 4), (3, 2, 1, 4)),
    "bridge": ((2, 5, 1, 4), (6, 2, 5, 0)),
    "solo": ((1, 4, 0, 0),),
    "outro": ((1, 4, 0, 0),),
}

STYLES: dict[str, Style] = {
    "pop": Style(
        "Pop",
        _POP,
        "backbeat",
        "eighth",
        "pulse",
        112,
        {"bass": 33, "chords": 4, "melody": 81, "pad": 89, "arp": 11},
        melody_centre=72,
    ),
    "rock": Style(
        "Rock",
        _BLUES,
        "straight",
        "eighth",
        "strum",
        128,
        {"bass": 34, "chords": 29, "melody": 30, "pad": 48, "arp": 27},
        melody_centre=69,
        phrasing="punchy",
    ),
    "ballad": Style(
        "Ballad",
        _POP,
        "ballad",
        "whole",
        "sustain",
        72,
        {"bass": 32, "chords": 0, "melody": 73, "pad": 48, "arp": 46},
        melody_centre=74,
        phrasing="long",
    ),
    "folk": Style(
        "Folk",
        _POP,
        "brushes",
        "half",
        "strum",
        100,
        {"bass": 32, "chords": 24, "melody": 73, "pad": 48, "arp": 25},
        melody_centre=72,
    ),
    "electronic": Style(
        "Electronic",
        _MINOR,
        "fourfloor",
        "octave",
        "offbeat",
        126,
        {"bass": 38, "chords": 81, "melody": 80, "pad": 88, "arp": 81},
        melody_centre=76,
        phrasing="punchy",
    ),
    "lofi": Style(
        "Lo-fi",
        _JAZZ,
        "halftime",
        "walking",
        "sustain",
        82,
        {"bass": 33, "chords": 4, "melody": 11, "pad": 89, "arp": 12},
        sevenths=True,
        swing=0.18,
        melody_centre=74,
        phrasing="long",
    ),
    "hiphop": Style(
        "Hip-hop",
        _MINOR,
        "halftime",
        "offbeat",
        "pulse",
        90,
        {"bass": 38, "chords": 5, "melody": 11, "pad": 89, "arp": 9},
        melody_centre=72,
        phrasing="punchy",
    ),
    "funk": Style(
        "Funk",
        _BLUES,
        "funk",
        "offbeat",
        "offbeat",
        104,
        {"bass": 36, "chords": 27, "melody": 65, "pad": 62, "arp": 17},
        sevenths=True,
        melody_centre=70,
        phrasing="punchy",
    ),
    "jazz": Style(
        "Jazz",
        _JAZZ,
        "brushes",
        "walking",
        "pulse",
        132,
        {"bass": 32, "chords": 0, "melody": 66, "pad": 48, "arp": 11},
        sevenths=True,
        swing=0.25,
        chords_per_bar=2,
        melody_centre=72,
        phrasing="long",
    ),
    "cinematic": Style(
        "Cinematic",
        _MINOR,
        "cinematic",
        "whole",
        "sustain",
        84,
        {"bass": 43, "chords": 48, "melody": 40, "pad": 89, "arp": 46},
        melody_centre=76,
        phrasing="long",
    ),
    "metal": Style(
        "Metal",
        _MINOR,
        "driving",
        "eighth",
        "pulse",
        150,
        {"bass": 34, "chords": 30, "melody": 30, "pad": 48, "arp": 29},
        melody_centre=67,
        phrasing="punchy",
    ),
    "waltz": Style(
        "Waltz",
        _POP,
        "waltz",
        "waltz",
        "waltz",
        108,
        {"bass": 32, "chords": 0, "melody": 40, "pad": 48, "arp": 46},
        melody_centre=74,
        phrasing="long",
    ),
}


# --------------------------------------------------------------------------- the metre


@dataclass(frozen=True)
class Metre:
    beats_per_bar: int
    beat_unit: int

    @property
    def compound(self) -> bool:
        """6/8, 9/8 and 12/8: the pulse is a dotted quarter of three eighth notes."""
        return self.beat_unit == 8 and self.beats_per_bar % 3 == 0 and self.beats_per_bar >= 6

    @property
    def pulse_beats(self) -> float:
        """Beats in one pulse: three eighths in a compound metre, one beat otherwise."""
        return 3.0 if self.compound else 1.0

    @property
    def pulses(self) -> int:
        return int(self.beats_per_bar / self.pulse_beats)

    @property
    def subdivision(self) -> int:
        """Even divisions of a pulse: three in a compound metre, two otherwise."""
        return 3 if self.compound else 2

    @property
    def beats(self) -> float:
        return float(self.beats_per_bar)

    def seconds_per_beat(self, bpm: float) -> float:
        # Tempo always counts quarter notes, as it does everywhere else in the suite.
        return (60.0 / bpm) * (4.0 / self.beat_unit)


# --------------------------------------------------------------------------- chords


def scale_pitch(scale: tuple[int, ...], step: int) -> int:
    """The pitch, in semitones above the tonic, of a scale step that may run past an octave."""
    return scale[step % 7] + 12 * (step // 7)


def chord_steps(degree: int, *, seventh: bool) -> tuple[int, ...]:
    """Scale steps of a diatonic chord: the degree, a third and a fifth above it."""
    steps = (degree, degree + 2, degree + 4)
    return (*steps, degree + 6) if seventh else steps


def voice_chord(pitches: list[int], previous: list[int] | None, low: int, high: int) -> list[int]:
    """Choose the inversion of a chord that moves least from the one before it."""
    options: list[list[int]] = []
    working = sorted(pitches)
    for _ in range(len(working)):
        options.append(list(working))
        # Lift the lowest note an octave: the next inversion of the same chord.
        working = sorted([*working[1:], working[0] + 12])
    # Each inversion is tried in every octave that fits, so the nearest voicing may lie
    # below the last chord as easily as above it.
    fitted = [
        [pitch + octave for pitch in option]
        for option in options
        for octave in (-24, -12, 0, 12, 24)
        if low <= min(option) + octave and max(option) + octave <= high
    ]
    if not fitted:
        return sorted(pitches)
    if previous is None:
        # Open on the plainest voicing, which is the one closest to the bottom of the range.
        return min(fitted, key=lambda option: min(option))
    reference = sorted(previous)

    def movement(option: list[int]) -> float:
        pairs = zip(sorted(option), reference, strict=False)
        return sum(abs(a - b) for a, b in pairs) + abs(len(option) - len(reference)) * 6

    return min(fitted, key=movement)


@dataclass
class Chord:
    """One harmony in the arrangement, placed in beats from the start of its section."""

    degree: int
    #: Beats from the section's start.
    start: float
    beats: float
    #: The root, as a MIDI pitch in the bass register.
    root: int
    #: The voiced chord, as MIDI pitches.
    pitches: list[int]
    #: Chord tones as pitch classes, for choosing melody notes.
    tones: tuple[int, ...]
    #: The root, third and fifth above the root, for a bass line that stays in the key.
    low: tuple[int, int, int]


def build_chords(
    progression: tuple[int, ...],
    bars: int,
    metre: Metre,
    tonic: int,
    mode: str,
    style: Style,
) -> list[Chord]:
    """Lay a progression over a number of bars, voiced so the chords move smoothly."""
    scale = SCALES[mode]
    slots_per_bar = max(1, style.chords_per_bar)
    beats_per_slot = metre.beats / slots_per_bar
    chords: list[Chord] = []
    previous: list[int] | None = None
    for slot in range(bars * slots_per_bar):
        degree = progression[slot % len(progression)]
        steps = chord_steps(degree, seventh=style.sevenths)
        # Voiced around the middle of the keyboard, where a comping instrument sits.
        raw = [48 + tonic + scale_pitch(scale, step) for step in steps]
        pitches = voice_chord(raw, previous, 45, 84)
        previous = pitches
        # Kept inside one octave, so the bass walks rather than leaps about.
        root = 36 + ((tonic + scale_pitch(scale, degree)) % 12)
        # The intervals of this chord as the scale actually spells them: a third is three
        # semitones or four depending on the degree, and the fifth above vii is diminished.
        above = scale_pitch(scale, degree)
        low = tuple(root + scale_pitch(scale, degree + step) - above for step in (0, 2, 4))
        chords.append(
            Chord(
                degree=degree,
                start=slot * beats_per_slot,
                beats=beats_per_slot,
                root=root,
                pitches=pitches,
                tones=tuple(sorted({pitch % 12 for pitch in raw})),
                low=(low[0], low[1], low[2]),
            )
        )
    return chords


# --------------------------------------------------------------------------- note helpers


@dataclass
class Writer:
    """Collects notes for one part, in beats, and converts them to seconds at the end."""

    notes: list[dict[str, float]] = field(default_factory=list)

    def add(self, beat: float, beats: float, pitch: int, velocity: float) -> None:
        if beats <= 0 or not 0 <= pitch <= 127:
            return
        self.notes.append(
            {
                "t": round(max(0.0, beat), 6),
                "d": round(beats, 6),
                "p": int(pitch),
                "v": round(min(1.0, max(0.05, velocity)), 3),
            }
        )

    def seconds(self, per_beat: float) -> list[dict[str, float]]:
        return [
            {
                "t": round(note["t"] * per_beat, 4),
                "d": round(max(0.02, note["d"] * per_beat), 4),
                "p": int(note["p"]),
                "v": note["v"],
            }
            for note in sorted(self.notes, key=lambda note: (note["t"], -note["p"]))
        ]


def _swung(beat: float, metre: Metre, swing: float) -> float:
    """Push the second half of each pulse late, which is what a swung feel is."""
    if swing <= 0 or metre.compound:
        return beat
    pulse = metre.pulse_beats
    position = (beat % pulse) / pulse
    if abs(position - 0.5) < 1e-6:
        return beat + pulse * swing * 0.5
    return beat


# --------------------------------------------------------------------------- the parts


def write_drums(
    writer: Writer,
    style: Style,
    metre: Metre,
    bars: int,
    bar_offset: float,
    energy: float,
    density: float,
    rng: random.Random,
    *,
    fill_into_next: bool,
) -> None:
    """A groove over `bars` bars, ending with a fill when another section follows."""
    pulses = metre.pulses
    pulse = metre.pulse_beats
    sub = metre.subdivision
    loud = 0.55 + 0.45 * energy
    groove = style.groove

    for bar in range(bars):
        base = bar_offset + bar * metre.beats
        filling = fill_into_next and bar == bars - 1 and pulses >= 3 and groove != "none"
        if bar == 0 and energy >= 0.8:
            writer.add(base, pulse, CRASH, loud)

        # Kick and snare: where the weight of the bar falls.
        if groove in ("straight", "backbeat", "driving"):
            kicks = [0.0] + ([pulse * 2] if pulses >= 4 else [])
            if density > 0.5 and pulses >= 4:
                kicks.append(pulse * 2 + pulse / sub)
            snares = [pulse * p for p in range(1, pulses, 2)]
        elif groove == "fourfloor":
            kicks = [pulse * p for p in range(pulses)]
            snares = [pulse * p for p in range(1, pulses, 2)]
        elif groove == "halftime":
            kicks = [0.0] + ([pulse * 1.5] if pulses >= 4 else [])
            snares = [pulse * (pulses // 2)] if pulses >= 2 else []
        elif groove == "funk":
            kicks = [0.0, pulse * 0.75] + ([pulse * 2.5] if pulses >= 4 else [])
            snares = [pulse * 1, pulse * 3] if pulses >= 4 else [pulse]
        elif groove == "waltz":
            kicks = [0.0]
            snares = [pulse * p for p in range(1, pulses)]
        elif groove == "ballad":
            kicks = [0.0] + ([pulse * 2] if pulses >= 4 else [])
            snares = [pulse * (pulses // 2)] if pulses >= 2 else []
        elif groove == "brushes":
            kicks = [0.0] if energy >= 0.6 else []
            snares = [pulse * p for p in range(1, pulses, 2)]
        elif groove == "cinematic":
            kicks = [0.0] if bar % 2 == 0 else []
            snares = []
        else:
            kicks, snares = [], []

        if not filling:
            for at in kicks:
                writer.add(base + at, pulse / sub, KICK, loud * (1.0 if at == 0 else 0.85))
            for at in snares:
                pitch = CLAP if groove == "fourfloor" else SNARE
                writer.add(base + at, pulse / sub, pitch, loud * 0.9)

        # The cymbal line, which carries the subdivision.
        if groove == "brushes":
            # A swung ride: the long-short pattern a jazz drummer plays.
            for p in range(pulses):
                writer.add(base + pulse * p, pulse * 0.6, RIDE, loud * 0.55)
                if energy > 0.5:
                    at = _swung(pulse * p + pulse * 0.5, metre, style.swing)
                    writer.add(base + at, pulse * 0.3, RIDE, loud * 0.35)
        elif groove == "cinematic":
            if bar % 4 == 3:
                writer.add(base, pulse, CRASH, loud * 0.6)
        elif groove != "none" and not filling:
            steps = sub if density < 0.65 else sub * 2
            for p in range(pulses):
                for s in range(steps):
                    at = pulse * p + pulse * s / steps
                    if density < 0.35 and s:
                        continue
                    pitch = HAT_OPEN if s == 0 and p == pulses - 1 and energy > 0.7 else HAT
                    accent = 0.5 if s == 0 else 0.3
                    writer.add(
                        base + _swung(at, metre, style.swing), pulse / sub, pitch, loud * accent
                    )

        if filling:
            # A fill walks down the drums over the last bar and lands on a crash.
            toms = [TOM_HIGH, TOM_MID, TOM_LOW, SNARE]
            steps = pulses * sub
            for step in range(steps):
                at = pulse * step / sub
                pitch = toms[min(len(toms) - 1, step * len(toms) // max(1, steps))]
                writer.add(base + at, pulse / sub, pitch, loud * (0.7 + 0.3 * step / max(1, steps)))
            if rng.random() < 0.8:
                writer.add(base + metre.beats, pulse, CRASH, loud)


def write_bass(
    writer: Writer,
    style: Style,
    metre: Metre,
    chords: list[Chord],
    bar_offset: float,
    energy: float,
    rng: random.Random,
    scale: tuple[int, ...],
) -> None:
    pulse = metre.pulse_beats
    sub = metre.subdivision
    loud = 0.6 + 0.4 * energy
    for index, chord in enumerate(chords):
        base = bar_offset + chord.start
        root = chord.root
        if style.bass == "whole":
            writer.add(base, chord.beats, root, loud)
        elif style.bass == "half":
            half = chord.beats / 2
            writer.add(base, half, root, loud)
            writer.add(base + half, half, root, loud * 0.85)
        elif style.bass == "waltz":
            writer.add(base, pulse, root, loud)
            for p in range(1, int(chord.beats / pulse)):
                writer.add(base + pulse * p, pulse * 0.8, root + 12, loud * 0.6)
        elif style.bass == "octave":
            step = pulse / sub
            count = int(chord.beats / step)
            for n in range(count):
                pitch = root if n % 2 == 0 else root + 12
                writer.add(base + n * step, step * 0.9, pitch, loud * (0.95 if n % 2 == 0 else 0.7))
        elif style.bass == "offbeat":
            step = pulse / sub
            count = int(chord.beats / step)
            for n in range(count):
                if n % 2 == 0 and rng.random() < 0.35:
                    continue
                # A funk bass leans on the off-beats, drops the odd downbeat and
                # reaches up to the chord's own fifth to end a phrase.
                pitch = chord.low[2] if n % 4 == 3 else root
                writer.add(base + step * n, step * 0.6, pitch, loud * (0.9 if n % 2 else 0.7))
        elif style.bass == "walking":
            # Quarter notes stepping from this chord's root towards the next one.
            count = max(1, int(chord.beats / pulse))
            following = chords[(index + 1) % len(chords)].root
            for n in range(count):
                if n == 0:
                    pitch = root
                elif n == count - 1 and following != root:
                    # A chromatic approach note, a semitone or tone off the next root. This
                    # is the one place the bass leaves the key, and it is meant to.
                    pitch = following - 1 if following > root else following + 1
                else:
                    # Otherwise step through this chord's own third and fifth.
                    pitch = rng.choice(chord.low[1:])
                writer.add(base + pulse * n, pulse * 0.9, pitch, loud * (0.95 if n == 0 else 0.75))
        else:  # "eighth"
            step = pulse / sub
            count = int(chord.beats / step)
            for n in range(count):
                writer.add(
                    base + step * n, step * 0.85, root, loud * (0.95 if n % sub == 0 else 0.7)
                )


def write_comp(
    writer: Writer,
    style: Style,
    metre: Metre,
    chords: list[Chord],
    bar_offset: float,
    energy: float,
    rng: random.Random,
) -> None:
    """The chord instrument: how the harmony is actually played."""
    pulse = metre.pulse_beats
    sub = metre.subdivision
    loud = 0.5 + 0.4 * energy
    for chord in chords:
        base = bar_offset + chord.start
        if style.comp == "sustain":
            for pitch in chord.pitches:
                writer.add(base, chord.beats * 0.98, pitch, loud * 0.8)
        elif style.comp == "pulse":
            count = max(1, int(chord.beats / pulse))
            for n in range(count):
                level = loud * (0.9 if n == 0 else 0.65)
                for pitch in chord.pitches:
                    writer.add(base + pulse * n, pulse * 0.8, pitch, level)
        elif style.comp == "offbeat":
            step = pulse / sub
            count = int(chord.beats / step)
            for n in range(count):
                if n % sub == 0:
                    continue
                # Swing is measured from the bar, so the chord's own position comes back off.
                at = _swung(chord.start + step * n, metre, style.swing) - chord.start
                for pitch in chord.pitches:
                    writer.add(base + at, step * 0.7, pitch, loud * 0.7)
        elif style.comp == "waltz":
            count = max(1, int(chord.beats / pulse))
            for n in range(count):
                if n == 0:
                    writer.add(base, pulse * 0.9, chord.pitches[0] - 12, loud * 0.9)
                else:
                    for pitch in chord.pitches:
                        writer.add(base + pulse * n, pulse * 0.8, pitch, loud * 0.6)
        else:  # "strum"
            count = max(1, int(chord.beats / pulse))
            for n in range(count):
                down = n % 2 == 0
                order = chord.pitches if down else list(reversed(chord.pitches))
                for index, pitch in enumerate(order):
                    # A strum is not a block chord: the strings sound a few milliseconds apart.
                    spread = 0.02 * index * (1 if down else 0.6)
                    writer.add(
                        base + pulse * n + spread,
                        pulse * 0.85,
                        pitch,
                        loud * (0.85 if down else 0.6),
                    )
                if rng.random() < 0.15:
                    break


def write_pad(writer: Writer, chords: list[Chord], bar_offset: float, energy: float) -> None:
    """Long held notes under everything: the lowest three of the voicing, an octave up."""
    loud = 0.3 + 0.3 * energy
    for chord in chords:
        base = bar_offset + chord.start
        for index, pitch in enumerate(chord.pitches[:3]):
            writer.add(base, chord.beats * 0.99, pitch + 12, loud * (0.9 if index == 0 else 0.6))


def write_arp(
    writer: Writer,
    style: Style,
    metre: Metre,
    chords: list[Chord],
    bar_offset: float,
    energy: float,
    density: float,
) -> None:
    pulse = metre.pulse_beats
    sub = metre.subdivision
    step = pulse / (sub * (2 if density > 0.6 else 1))
    loud = 0.35 + 0.35 * energy
    for chord in chords:
        base = bar_offset + chord.start
        tones = [pitch + 12 for pitch in chord.pitches]
        # Up and back down, so a long chord does not simply climb away.
        shape = tones + tones[-2:0:-1] if len(tones) > 2 else tones
        count = int(chord.beats / step)
        for n in range(count):
            pitch = shape[n % len(shape)]
            at = _swung(chord.start + step * n, metre, style.swing) - chord.start
            writer.add(base + at, step * 0.9, pitch, loud)


@dataclass(frozen=True)
class Motif:
    """A melodic idea: a rhythm in beats, and a contour in scale steps."""

    rhythm: tuple[float, ...]
    contour: tuple[int, ...]
    #: How far each bar of a four-bar phrase sits above the first, in scale steps.
    arch: tuple[int, int, int, int] = (0, 0, 0, 0)


def make_motif(metre: Metre, style: Style, rng: random.Random, energy: float) -> Motif:
    pulse = metre.pulse_beats
    choices: tuple[tuple[float, ...], ...]
    if style.phrasing == "long":
        choices = ((2.0, 1.0, 1.0), (1.5, 1.5, 1.0), (3.0, 1.0), (2.0, 2.0))
    elif style.phrasing == "punchy":
        choices = ((0.5, 0.5, 1.0), (0.5, 0.5, 0.5, 0.5), (1.0, 0.5, 0.5), (0.75, 0.75, 0.5))
    else:
        choices = ((1.0, 0.5, 0.5), (0.5, 1.0, 0.5), (1.0, 1.0), (0.5, 0.5, 1.0))
    rhythm = tuple(value * pulse for value in rng.choice(choices))
    # A contour that leaves the tonic and comes back is easier to hear as a tune.
    shapes = ((0, 1, 2), (0, 2, 1), (0, -1, 0), (2, 1, 0), (0, 1, -1), (0, 3, 2))
    shape = rng.choice(shapes)
    lift = 1 if energy > 0.8 else 0
    contour = tuple(step + lift for step in shape[: len(rhythm)])
    while len(contour) < len(rhythm):
        contour = (*contour, contour[-1])
    # The phrase as a whole rises and falls too, so four bars are not one bar four times.
    arches = ((0, 1, 2, 1), (0, 2, 1, 0), (2, 1, 0, 1), (0, 0, 2, 3), (0, 1, 0, -1), (0, 2, 4, 2))
    return Motif(rhythm=rhythm, contour=contour, arch=rng.choice(arches))


def write_melody(
    writer: Writer,
    style: Style,
    metre: Metre,
    chords: list[Chord],
    bar_offset: float,
    bars: int,
    motif: Motif,
    energy: float,
    rng: random.Random,
    scale: tuple[int, ...],
    tonic: int,
) -> None:
    """Realise the motif bar by bar against the harmony, snapping to chord tones."""
    loud = 0.55 + 0.4 * energy
    centre = style.melody_centre

    def nearest(pitch_class: int, near: int) -> int:
        """The pitch of a pitch class closest to `near`."""
        base = near - (near % 12) + pitch_class
        return min((base - 12, base, base + 12), key=lambda pitch: abs(pitch - near))

    # The tonic nearest the style's register: scale steps are counted from here.
    home = nearest(tonic % 12, centre)

    def chord_at(beat: float) -> Chord:
        for chord in chords:
            if chord.start <= beat < chord.start + chord.beats:
                return chord
        return chords[-1]

    for bar in range(bars):
        # A phrase every other bar, with a rest between, so the tune breathes.
        if bar % 2 == 1 and rng.random() < 0.55:
            continue
        base = bar * metre.beats
        beat = 0.0
        # Later repeats of a section lift the motif, which keeps a long form moving.
        shift = motif.arch[bar % 4] + (0 if bar < bars / 2 else rng.choice((0, 0, 1)))
        # A busy section states the idea and answers it, the answer falling where it rose.
        answers = energy > 0.7 and rng.random() < 0.6
        for statement in range(2 if answers else 1):
            contour = motif.contour if statement == 0 else tuple(reversed(motif.contour))
            for index, length in enumerate(motif.rhythm):
                if beat + length > metre.beats + 1e-6:
                    break
                chord = chord_at(base + beat)
                step = contour[index] + shift
                target = home + scale_pitch(scale, step)
                strong = abs(beat % metre.pulse_beats) < 1e-6
                if strong:
                    # On the pulse, land on a note of the chord so the harmony is heard.
                    # `chord.tones` are already pitch classes in the key.
                    options = [nearest(tone, target) for tone in chord.tones]
                    pitch = min(options, key=lambda candidate: abs(candidate - target))
                else:
                    # Off the pulse, the scale note itself: a passing note between chord tones.
                    pitch = target
                held = length * (0.9 if index < len(motif.rhythm) - 1 else 1.0)
                writer.add(bar_offset + base + _swung(beat, metre, style.swing), held, pitch, loud)
                beat += length
        # Hold the last note of the phrase over the rest of the bar now and then.
        if beat < metre.beats and rng.random() < 0.35 and writer.notes:
            writer.notes[-1]["d"] = round(writer.notes[-1]["d"] + (metre.beats - beat) * 0.5, 6)


# --------------------------------------------------------------------------- the arrangement


MAX_SECTIONS = 40


def _section_layout(form: tuple[str, ...], max_bars: int) -> list[dict[str, Any]]:
    """Fit the form to the length asked for: repeat its middle to fill, or trim to fit."""
    roles = list(form)
    total = sum(ROLE_BARS[role] for role in roles)
    if total < max_bars and len(roles) > 2:
        # Repeat the body of the song rather than the form as a whole, so the intro
        # does not come round again in the middle and the outro stays last.
        middle = roles[1:-1]
        index = 0
        while total < max_bars and len(roles) < MAX_SECTIONS:
            role = middle[index % len(middle)]
            roles.insert(len(roles) - 1, role)
            total += ROLE_BARS[role]
            index += 1

    # Too long for the length asked for: take sections out of the middle, so the song still
    # opens and ends the way the form says instead of stopping part-way through a chorus.
    while total > max_bars and len(roles) > 2:
        dropped = roles.pop(len(roles) - 2)
        total -= ROLE_BARS[dropped]

    sections: list[dict[str, Any]] = []
    bar = 0
    for role in roles:
        if bar >= max_bars:
            break
        bars = min(ROLE_BARS[role], max_bars - bar)
        if bars < 2:
            break
        sections.append({"role": role, "bar": bar, "bars": bars})
        bar += bars
    if not sections:
        sections = [{"role": "verse", "bar": 0, "bars": max(2, max_bars)}]
    return sections


def arrange(
    *,
    style: str = "pop",
    key: str = "C major",
    bpm: float | None = None,
    beats_per_bar: int = 4,
    beat_unit: int = 4,
    form: str = "verse-chorus",
    bars: int = 32,
    parts: set[str] | None = None,
    seed: int = 0,
    density: float = 0.5,
) -> dict[str, Any]:
    """Write an arrangement. The same arguments always give the same notes."""
    chosen = STYLES.get(style) or STYLES["pop"]
    metre = Metre(
        beats_per_bar=max(2, min(12, int(beats_per_bar))), beat_unit=8 if beat_unit == 8 else 4
    )
    tempo = float(bpm) if bpm else float(chosen.bpm)
    tonic, mode = parse_key(key)
    scale = SCALES[mode]
    wanted = parts if parts is not None else set(PARTS)
    layout = _section_layout(FORMS.get(form) or FORMS["verse-chorus"], max(2, int(bars)))

    # One Writer per part, filled section by section.
    writers = {name: Writer() for name in PARTS}
    # Material is written once per role and reused, which is what makes the form audible.
    role_material: dict[str, dict[str, Any]] = {}
    seen: dict[str, int] = {}

    for index, section in enumerate(layout):
        role = str(section["role"])
        repeat = seen.get(role, 0)
        seen[role] = repeat + 1
        if role not in role_material:
            # One stream per role, so a role's material does not change with where it falls.
            picker = random.Random(seed * 1000 + (ROLES.index(role) if role in ROLES else 0))
            options = chosen.progressions.get(role) or chosen.progressions["verse"]
            role_material[role] = {
                "progression": picker.choice(options),
                "motif": make_motif(metre, chosen, picker, ROLE_ENERGY[role]),
            }
        material = role_material[role]
        # A fresh stream per section, seeded from the section's place in the form, so a
        # repeat varies a little without being a different section.
        rng = random.Random(seed * 7919 + index * 31 + repeat)
        energy = ROLE_ENERGY[role]
        playing = ROLE_PARTS[role] & wanted
        bar_offset = float(section["bar"]) * metre.beats
        chords = build_chords(
            material["progression"], int(section["bars"]), metre, tonic, mode, chosen
        )
        last = index == len(layout) - 1

        if "drums" in playing:
            write_drums(
                writers["drums"],
                chosen,
                metre,
                int(section["bars"]),
                bar_offset,
                energy,
                density,
                rng,
                fill_into_next=not last,
            )
        if "bass" in playing:
            write_bass(writers["bass"], chosen, metre, chords, bar_offset, energy, rng, scale)
        if "chords" in playing:
            write_comp(writers["chords"], chosen, metre, chords, bar_offset, energy, rng)
        if "pad" in playing:
            write_pad(writers["pad"], chords, bar_offset, energy)
        if "arp" in playing:
            write_arp(writers["arp"], chosen, metre, chords, bar_offset, energy, density)
        if "melody" in playing:
            write_melody(
                writers["melody"],
                chosen,
                metre,
                chords,
                bar_offset,
                int(section["bars"]),
                material["motif"],
                energy,
                rng,
                scale,
                tonic,
            )

    per_beat = metre.seconds_per_beat(tempo)
    total_bars = sum(int(section["bars"]) for section in layout)
    names = {
        "drums": "Drums",
        "bass": "Bass",
        "chords": "Chords",
        "melody": "Melody",
        "pad": "Pad",
        "arp": "Arpeggio",
    }
    tracks = []
    for name in PARTS:
        notes = writers[name].seconds(per_beat)
        if not notes:
            continue
        tracks.append(
            {
                "name": names[name],
                "role": name,
                "drums": name == "drums",
                "program": 0 if name == "drums" else chosen.programs[name],
                "notes": notes,
            }
        )

    bar_seconds = metre.beats * per_beat
    return {
        "style": style,
        "style_label": chosen.label,
        "key": f"{KEY_NAMES[tonic]} {mode}",
        "bpm": round(tempo, 2),
        "beats_per_bar": metre.beats_per_bar,
        "beat_unit": metre.beat_unit,
        "bars": total_bars,
        "seconds": round(total_bars * bar_seconds, 3),
        "seed": int(seed),
        "form": form,
        "sections": [
            {
                "name": str(section["role"]).capitalize(),
                "start": round(int(section["bar"]) * bar_seconds, 3),
                "end": round((int(section["bar"]) + int(section["bars"])) * bar_seconds, 3),
            }
            for section in layout
        ],
        "tracks": tracks,
    }
