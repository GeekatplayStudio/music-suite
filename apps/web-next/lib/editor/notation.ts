/**
 * Turn a MIDI clip's notes into written music: bars of notes, rests and ties on a
 * piano's two staves. Timing is rounded to sixteenth notes of the project tempo.
 */
import type { Note } from "@/lib/editor/types";

export interface SheetEvent {
  /** Pitches in VexFlow form ("c#/4"); for a rest, the line it sits on. */
  keys: string[];
  /** MIDI pitches, low to high; empty for a rest. */
  pitches: number[];
  /** "w", "h", "q", "8" or "16". */
  duration: string;
  dotted: boolean;
  rest: boolean;
  /** This note continues into the next event (same pitches). */
  tied: boolean;
  /** Length in sixteenths. */
  length: number;
  /** A rest that fills its bar: written as one centred whole rest, whatever the metre. */
  wholeBar?: boolean;
}

export interface SheetMeasure {
  treble: SheetEvent[];
  bass: SheetEvent[];
}

export interface Sheet {
  measures: SheetMeasure[];
  /** Sixteenths in a bar. */
  barLength: number;
  /** Seconds in a bar. */
  barSeconds: number;
  /** VexFlow key signature, such as "C", "F#m" or "Bb". */
  keySignature: string;
  /** Bars left out because the clip is longer than the limit. */
  hiddenBars: number;
}

export const MAX_BARS = 96;
const SHARP_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const FLAT_NAMES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
/** Keys written with flats. */
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"]);
/** Sharp-named keys that are written as their flat twin. */
const RESPELL: Record<string, string> = { "A#": "Bb", "D#": "Eb", "G#": "Ab", "C#": "Db", "A#m": "Bbm", "D#m": "Ebm" };
/** Note values in sixteenths, longest first, with the grid each must start on. */
const VALUES: { length: number; grid: number; duration: string; dotted: boolean }[] = [
  { length: 16, grid: 16, duration: "w", dotted: false },
  { length: 12, grid: 4, duration: "h", dotted: true },
  { length: 8, grid: 4, duration: "h", dotted: false },
  { length: 6, grid: 4, duration: "q", dotted: true },
  { length: 4, grid: 4, duration: "q", dotted: false },
  { length: 3, grid: 4, duration: "8", dotted: true },
  { length: 2, grid: 2, duration: "8", dotted: false },
  { length: 1, grid: 1, duration: "16", dotted: false }
];

/** "C major" / "F# minor" (the project's key) as a VexFlow key signature. */
export function keySignature(keyLabel: string | null): string {
  const match = /^([A-G][#b]?)\s+(major|minor)$/i.exec(keyLabel?.trim() ?? "");
  if (!match) return "C";
  const name = `${match[1][0].toUpperCase()}${match[1].slice(1)}${match[2].toLowerCase() === "minor" ? "m" : ""}`;
  return RESPELL[name] ?? name;
}

function keyName(pitch: number, flats: boolean): string {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[((pitch % 12) + 12) % 12]}/${Math.floor(pitch / 12) - 1}`;
}

interface Span {
  start: number;
  end: number;
  pitches: number[];
}

/** One line of music from possibly overlapping notes: chords at each onset, cut at the next. */
function spans(notes: { start: number; length: number; pitch: number }[], total: number): Span[] {
  const onsets = [...new Set(notes.map((note) => note.start))].sort((a, b) => a - b);
  const out: Span[] = [];
  onsets.forEach((start, index) => {
    const chord = notes.filter((note) => note.start === start);
    const longest = Math.max(...chord.map((note) => note.length));
    const end = Math.min(start + longest, onsets[index + 1] ?? total, total);
    if (end > start) out.push({ start, end, pitches: [...new Set(chord.map((note) => note.pitch))].sort((a, b) => a - b) });
  });
  return out;
}

/** Cut a stretch inside one bar into note values that sit on the beat grid. */
function pieces(start: number, length: number, rest: boolean): (typeof VALUES)[number][] {
  const out: (typeof VALUES)[number][] = [];
  let at = start;
  let left = length;
  while (left > 0) {
    // Rests are written plain (no dots) and each starts on a multiple of its own length.
    const fits = (v: (typeof VALUES)[number]) => v.length <= left && at % (rest ? v.length : v.grid) === 0 && !(rest && v.dotted);
    const value = VALUES.find(fits) ?? VALUES[VALUES.length - 1];
    out.push(value);
    at += value.length;
    left -= value.length;
  }
  return out;
}

function staff(line: Span[], bars: number, barLength: number, flats: boolean, restKey: string): SheetEvent[][] {
  const measures: SheetEvent[][] = Array.from({ length: bars }, () => []);
  const add = (from: number, to: number, pitches: number[]) => {
    let at = from;
    while (at < to) {
      const bar = Math.floor(at / barLength);
      if (bar >= bars) return;
      const stop = Math.min(to, (bar + 1) * barLength);
      const rest = pitches.length === 0;
      const cut = pieces(at - bar * barLength, stop - at, rest);
      cut.forEach((value, index) => {
        const last = index === cut.length - 1 && stop === to;
        measures[bar].push({
          keys: rest ? [restKey] : pitches.map((pitch) => keyName(pitch, flats)),
          pitches,
          duration: value.duration,
          dotted: value.dotted,
          rest,
          tied: !rest && !last,
          length: value.length
        });
      });
      at = stop;
    }
  };
  let cursor = 0;
  for (const span of line) {
    if (span.start > cursor) add(cursor, span.start, []);
    add(span.start, span.end, span.pitches);
    cursor = span.end;
  }
  if (cursor < bars * barLength) add(cursor, bars * barLength, []);
  return measures.map((events) =>
    events.every((event) => event.rest)
      ? [{ keys: [restKey], pitches: [], duration: "w", dotted: false, rest: true, tied: false, length: barLength, wholeBar: true }]
      : events
  );
}

/**
 * Notes of a clip (times in seconds from the clip's own start, as the clip stores them)
 * as bars for a grand staff. Notes from middle C up go on the treble staff.
 */
export function toSheet(
  notes: Note[],
  options: { bpm: number; beatsPerBar: number; offset: number; duration: number; keyLabel: string | null }
): Sheet {
  const step = 60 / options.bpm / 4;
  const barLength = Math.max(1, Math.round(options.beatsPerBar)) * 4;
  const allBars = Math.max(1, Math.ceil(options.duration / step / barLength - 1e-6));
  const bars = Math.min(allBars, MAX_BARS);
  const total = bars * barLength;
  const signature = keySignature(options.keyLabel);
  const flats = FLAT_KEYS.has(signature);
  const grid = notes
    .filter((note) => note.t >= options.offset - 1e-6 && note.t < options.offset + options.duration)
    .map((note) => ({
      start: Math.max(0, Math.round((note.t - options.offset) / step)),
      length: Math.max(1, Math.round(note.d / step)),
      pitch: Math.round(note.p)
    }))
    .filter((note) => note.start < total);
  const treble = staff(spans(grid.filter((n) => n.pitch >= 60), total), bars, barLength, flats, "b/4");
  const bass = staff(spans(grid.filter((n) => n.pitch < 60), total), bars, barLength, flats, "d/3");
  return {
    measures: treble.map((events, index) => ({ treble: events, bass: bass[index] })),
    barLength,
    barSeconds: step * barLength,
    keySignature: signature,
    hiddenBars: allBars - bars
  };
}
