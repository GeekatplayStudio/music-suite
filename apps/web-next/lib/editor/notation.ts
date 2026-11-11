/**
 * Turn a MIDI clip's notes into written music: bars of notes, rests and ties on a
 * piano's two staves. Timing is rounded to sixteenth notes of the project tempo, or to
 * triplet eighths in beats whose notes fall on thirds.
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
  /** Length in grid units: 12 to a quarter note, so a sixteenth is 3 and a triplet eighth 4. */
  length: number;
  /** Events sharing this are one triplet (three eighths in the time of two). */
  tuplet?: string;
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

/** Grid units in a quarter note: divisible by 4 (sixteenths) and by 3 (triplet eighths). */
const TPQ = 12;
/** A note this close before a beat belongs to that beat. */
const EARLY = 0.04;

interface Span {
  start: number;
  end: number;
  pitches: number[];
}

/**
 * Beats whose notes sit on thirds rather than quarters of the beat: written as triplets.
 * A beat qualifies when thirds fit its note starts better and one start is on a third.
 */
function tripletBeats(onsets: number[]): Set<number> {
  const byBeat = new Map<number, number[]>();
  for (const on of onsets) {
    const beat = Math.floor(on + EARLY);
    byBeat.set(beat, [...(byBeat.get(beat) ?? []), Math.max(0, on - beat)]);
  }
  const found = new Set<number>();
  for (const [beat, fractions] of byBeat) {
    const off = (parts: number) => fractions.reduce((sum, f) => sum + Math.abs(f - Math.round(f * parts) / parts), 0);
    const onThird = fractions.some((f) => Math.round(f * 3) % 3 !== 0 && Math.abs(f - Math.round(f * 3) / 3) < 0.06);
    // Thirds only have to fit a little better: played triplets are loose, while notes drawn
    // in the piano roll sit exactly on sixteenths and so never qualify by accident.
    if (onThird && off(3) + 0.005 < off(4)) found.add(beat);
  }
  return found;
}

/** One line of music from possibly overlapping notes: chords at each onset, cut at the next. */
function spans(notes: { start: number; end: number; pitch: number }[], total: number): Span[] {
  const onsets = [...new Set(notes.map((note) => note.start))].sort((a, b) => a - b);
  const out: Span[] = [];
  onsets.forEach((start, index) => {
    const chord = notes.filter((note) => note.start === start);
    const longest = Math.max(...chord.map((note) => note.end));
    const end = Math.min(longest, onsets[index + 1] ?? total, total);
    if (end > start) out.push({ start, end, pitches: [...new Set(chord.map((note) => note.pitch))].sort((a, b) => a - b) });
  });
  return out;
}

/** Cut a stretch inside one bar (in sixteenths) into note values that sit on the beat grid. */
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

/** One staff: beats of raw notes (in quarter notes from the clip's start) to bars of events. */
function staff(
  raw: { on: number; off: number; pitch: number }[],
  bars: number,
  barLength: number,
  flats: boolean,
  restKey: string
): SheetEvent[][] {
  const barTicks = (barLength / 4) * TPQ;
  const total = bars * barTicks;
  const triplet = tripletBeats(raw.map((note) => note.on));
  /** Snap a time to the grid of its beat: thirds in a triplet beat, sixteenths elsewhere. */
  const tick = (time: number) => {
    const beat = Math.floor(time + EARLY);
    const fraction = Math.max(0, time - beat);
    return beat * TPQ + (triplet.has(beat) ? Math.round(fraction * 3) * 4 : Math.round(fraction * 4) * 3);
  };
  const grid = raw
    .map((note) => {
      const start = tick(note.on);
      const unit = triplet.has(Math.floor(start / TPQ)) ? 4 : 3;
      return { start, end: Math.max(start + unit, tick(note.off)), pitch: note.pitch };
    })
    .filter((note) => note.start < total);

  const measures: SheetEvent[][] = Array.from({ length: bars }, () => []);
  const add = (from: number, to: number, pitches: number[]) => {
    const rest = pitches.length === 0;
    const push = (bar: number, duration: string, dotted: boolean, length: number, last: boolean, tuplet?: string) =>
      measures[bar].push({
        keys: rest ? [restKey] : pitches.map((pitch) => keyName(pitch, flats)),
        pitches,
        duration,
        dotted,
        rest,
        tied: !rest && !last,
        length,
        tuplet
      });
    let at = from;
    while (at < to) {
      const bar = Math.floor(at / barTicks);
      if (bar >= bars) return;
      const beat = Math.floor(at / TPQ);
      const barEnd = (bar + 1) * barTicks;
      if (triplet.has(beat)) {
        // Inside a triplet beat: thirds of the beat, one or two at a time.
        const stop = Math.min(to, (beat + 1) * TPQ);
        const thirds = Math.round((stop - at) / 4);
        if (thirds >= 3) push(bar, "q", false, TPQ, stop === to);
        else push(bar, thirds === 2 ? "q" : "8", false, stop - at, stop === to, `${bar}:${beat}`);
        at = stop;
        continue;
      }
      // Up to the bar's end, or to the next triplet beat.
      let stop = Math.min(to, barEnd);
      for (let next = beat + 1; next * TPQ < stop; next++) {
        if (triplet.has(next)) {
          stop = next * TPQ;
          break;
        }
      }
      const cut = pieces(Math.round((at - bar * barTicks) / 3), Math.max(1, Math.round((stop - at) / 3)), rest);
      cut.forEach((value, index) => push(bar, value.duration, value.dotted, value.length * 3, index === cut.length - 1 && stop === to));
      at = stop;
    }
  };
  let cursor = 0;
  for (const span of spans(grid, total)) {
    if (span.start > cursor) add(cursor, span.start, []);
    add(span.start, span.end, span.pitches);
    cursor = span.end;
  }
  if (cursor < total) add(cursor, total, []);
  return measures.map((events) =>
    events.every((event) => event.rest)
      ? [{ keys: [restKey], pitches: [], duration: "w", dotted: false, rest: true, tied: false, length: barTicks, wholeBar: true }]
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
  const beat = 60 / options.bpm;
  const step = beat / 4;
  const barLength = Math.max(1, Math.round(options.beatsPerBar)) * 4;
  const allBars = Math.max(1, Math.ceil(options.duration / step / barLength - 1e-6));
  const bars = Math.min(allBars, MAX_BARS);
  const signature = keySignature(options.keyLabel);
  const flats = FLAT_KEYS.has(signature);
  // Times in quarter notes from the start of what the clip plays.
  const raw = notes
    .filter((note) => note.t >= options.offset - 1e-6 && note.t < options.offset + options.duration)
    .map((note) => ({ on: Math.max(0, (note.t - options.offset) / beat), off: (note.t - options.offset + note.d) / beat, pitch: Math.round(note.p) }));
  const treble = staff(raw.filter((n) => n.pitch >= 60), bars, barLength, flats, "b/4");
  const bass = staff(raw.filter((n) => n.pitch < 60), bars, barLength, flats, "d/3");
  return {
    measures: treble.map((events, index) => ({ treble: events, bass: bass[index] })),
    barLength,
    barSeconds: step * barLength,
    keySignature: signature,
    hiddenBars: allBars - bars
  };
}
