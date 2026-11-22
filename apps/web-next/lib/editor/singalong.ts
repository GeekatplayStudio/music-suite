/**
 * A part written to go with a song rather than to replace anything in it: a voice that sings
 * the tune, a harmony above it, or held chords underneath. It is made from the notes already
 * found in the song, so it is in the song's key, on its beat and follows its chords.
 */

import { scaleOf } from "@/lib/editor/reamp";
import type { Note } from "@/lib/editor/types";

export type SingStyle = "tune" | "harmony" | "chords";

export const SING_STYLES: { id: SingStyle; label: string; hint: string }[] = [
  { id: "tune", label: "Sing the tune", hint: "The song's melody, one note at a time, in a singing range." },
  { id: "harmony", label: "Sing a harmony", hint: "A third above the melody, inside the song's key." },
  { id: "chords", label: "Hold the chords", hint: "Long notes that follow the song's chords, bar by bar, like a backing choir." }
];

export interface SongPart {
  name: string;
  notes: Note[];
  drums: boolean;
}

/** One note at a time from many: at each moment the highest note that starts there, held to the next. */
function topLine(notes: Note[]): Note[] {
  const sorted = [...notes].sort((a, b) => a.t - b.t || b.p - a.p);
  const line: Note[] = [];
  for (const note of sorted) {
    const last = line[line.length - 1];
    // Notes struck together are one chord; its top note is the tune.
    if (last && note.t - last.t < 0.04) continue;
    if (last && last.t + last.d > note.t) {
      // A lower note under a held higher one is accompaniment, not the tune moving.
      if (note.p < last.p - 2 && note.t - last.t < last.d * 0.5) continue;
      last.d = Math.max(0.05, note.t - last.t);
    }
    line.push({ ...note });
  }
  return line;
}

/**
 * A tune kept within an octave either side of where most of it lies. A sung line written
 * down from a recording has the odd note an octave or two off; folded back, it is singable.
 */
function inOneRange(line: Note[]): Note[] {
  if (line.length < 3) return line;
  const sorted = line.map((note) => note.p).sort((a, b) => a - b);
  const centre = sorted[sorted.length >> 1];
  return line.map((note) => {
    let pitch = note.p;
    while (pitch < centre - 12) pitch += 12;
    while (pitch > centre + 12) pitch -= 12;
    return pitch === note.p ? note : { ...note, p: pitch };
  });
}

/**
 * The song's tune: the sung part when the song has one, otherwise the top line of whatever
 * carries the melody. Bass and drums never do.
 */
export function melodyOf(parts: SongPart[]): Note[] {
  const pitched = parts.filter((part) => !part.drums && part.notes.length);
  const sung = pitched.find((part) => /vocal|voice|lead/i.test(part.name) && part.notes.length >= 8);
  if (sung) return inOneRange(topLine(sung.notes));
  const upper = pitched.filter((part) => !/bass/i.test(part.name));
  // Below the C under middle C is the left hand or a bass line, not a tune.
  return inOneRange(topLine((upper.length ? upper : pitched).flatMap((part) => part.notes).filter((note) => note.p >= 55)));
}

/** The pitch classes that fill each bar, as long notes: the chord, bar by bar. */
function chordsOf(parts: SongPart[], bar: number): Note[] {
  const all = parts.filter((part) => !part.drums).flatMap((part) => part.notes);
  if (!all.length || bar <= 0) return [];
  const end = all.reduce((latest, note) => Math.max(latest, note.t + note.d), 0);
  const out: Note[] = [];
  const open = new Map<number, Note>();
  for (let start = 0; start < end; start += bar) {
    const weight = new Array<number>(12).fill(0);
    for (const note of all) {
      const overlap = Math.min(note.t + note.d, start + bar) - Math.max(note.t, start);
      if (overlap > 0) weight[((Math.round(note.p) % 12) + 12) % 12] += overlap * note.v;
    }
    const total = weight.reduce((sum, value) => sum + value, 0);
    const chosen = total < bar * 0.1 ? [] : weight.map((value, pc) => ({ value, pc })).sort((a, b) => b.value - a.value).slice(0, 3).filter((entry) => entry.value > total * 0.08).map((entry) => entry.pc);
    for (const [pc, held] of open) {
      // The same note in the next bar is held on rather than struck again, but for two bars
      // at most: no voice holds a note for half a minute.
      if (chosen.includes(pc) && held.d < bar * 1.5) held.d += bar;
      else open.delete(pc);
    }
    for (const pc of chosen) {
      if (open.has(pc)) continue;
      // Around middle C, where held voices sit under a tune without crowding it.
      const note: Note = { t: start, d: bar - 0.06, p: 55 + ((pc - 7 + 12) % 12), v: 0.6 };
      open.set(pc, note);
      out.push(note);
    }
  }
  return out.sort((a, b) => a.t - b.t || a.p - b.p);
}

/** One line of a sing-along: what it is called and its notes. */
export interface SingLine {
  label: string;
  notes: Note[];
}

/**
 * The ticked styles as separate lines, each one note at a time, so a voice that sounds one
 * note at a time can record each as its own take and the takes play together. Held chords
 * become three lines (low, middle, high). Lines with no notes are left out.
 */
export function singAlongLines(parts: SongPart[], styles: SingStyle[], bpm: number, beatsPerBar: number): SingLine[] {
  const lines: SingLine[] = [];
  for (const entry of SING_STYLES) {
    if (!styles.includes(entry.id)) continue;
    const notes = singAlong(parts, entry.id, bpm, beatsPerBar);
    if (entry.id !== "chords") {
      lines.push({ label: entry.label.toLowerCase(), notes });
      continue;
    }
    // Each chord's notes, lowest first, dealt out to the low, middle and high lines.
    const byStart = new Map<number, Note[]>();
    for (const note of notes) {
      const key = Math.round(note.t * 100);
      byStart.set(key, [...(byStart.get(key) ?? []), note]);
    }
    const split: Note[][] = [[], [], []];
    for (const group of byStart.values()) {
      group.sort((a, b) => a.p - b.p).slice(0, 3).forEach((note, index) => split[index].push(note));
    }
    ["low", "middle", "high"].forEach((name, index) => {
      lines.push({ label: `${entry.label.toLowerCase()} (${name})`, notes: split[index].sort((a, b) => a.t - b.t) });
    });
  }
  return lines.filter((line) => line.notes.length);
}

/** The notes of a sing-along part in the given style. Empty when the song has nothing to build it from. */
export function singAlong(parts: SongPart[], style: SingStyle, bpm: number, beatsPerBar: number): Note[] {
  if (style === "chords") return chordsOf(parts, (60 / Math.max(30, bpm)) * Math.max(1, beatsPerBar));
  const tune = melodyOf(parts);
  if (style === "tune") return tune;
  const scale = scaleOf(parts.filter((part) => !part.drums).flatMap((part) => part.notes));
  return tune.map((note) => {
    // Two scale steps up: a third, major or minor as the key has it at that point.
    let pitch = Math.round(note.p);
    for (let steps = 0; steps < 2; ) {
      pitch += 1;
      if (scale.has(((pitch % 12) + 12) % 12)) steps += 1;
    }
    return { ...note, p: pitch, v: note.v * 0.9 };
  });
}
