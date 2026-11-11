/**
 * Engrave bars of a sheet with VexFlow: used for the on-screen view (SVG) and for
 * the pages that are printed or saved as a PDF (canvas).
 *
 * Bars are as wide as their notes need. As many as fit go on a line, and the line is
 * then stretched to the full width, as in printed music.
 */
import type { RenderContext, StaveNote as VexStaveNote } from "vexflow";

import type { Sheet, SheetEvent, SheetMeasure } from "@/lib/editor/notation";

export type Vex = typeof import("vexflow");

/** Distance from the top of one grand staff to the next, before room for extreme notes. */
export const LINE_HEIGHT = 230;
/** Height one semitone takes on a staff, near enough: used to make room for ledger lines. */
const SEMITONE = 3;
/** Notes beyond these sit far enough outside the staves to need extra room. */
const TREBLE_COMFORT = 84;
const BASS_COMFORT = 36;
/** Room after the last note of a bar, before its barline. */
const BAR_PADDING = 22;
/**
 * Share of VexFlow's own "minimum" width that a bar is given. That minimum is roomy
 * (about 50 units a note); two thirds of it reads like printed music and keeps every
 * note inside its bar (at half, the last note of a busy bar crossed the barline).
 */
const DENSITY = 0.66;
/** The least width any note or rest is given. */
const NOTE_FLOOR = 34;
/** A short last line is stretched no further than this. */
const MAX_STRETCH = 1.7;
const MAX_BARS_PER_LINE = 6;

export interface SheetLine {
  /** Index of the line's first bar, and one past its last. */
  from: number;
  to: number;
  /** Width of each bar, clef and key signature included for the first. */
  widths: number[];
  /** Extra room above and below the line for very high and very low notes. */
  above: number;
  below: number;
}

/** Space a line takes, top of its treble staff area to the top of the next line's. */
export function lineHeight(line: SheetLine): number {
  return LINE_HEIGHT + line.above + line.below;
}

/** The engraving library, loaded on first use: it is large. */
export async function loadVex(): Promise<Vex> {
  const vex = await import("vexflow");
  await document.fonts.ready;
  return vex;
}

function buildNotes(vex: Vex, events: SheetEvent[], clef: "treble" | "bass"): VexStaveNote[] {
  return events.map((event) => {
    if (event.wholeBar) return new vex.StaveNote({ keys: [clef === "treble" ? "d/5" : "f/3"], duration: "wr", clef, alignCenter: true });
    const note = new vex.StaveNote({ keys: event.keys, duration: `${event.duration}${event.rest ? "r" : ""}`, clef, dots: event.dotted ? 1 : 0 });
    if (event.dotted) vex.Dot.buildAndAttach([note], { all: true });
    return note;
  });
}

function buildVoices(vex: Vex, sheet: Sheet, measure: SheetMeasure) {
  const treble = buildNotes(vex, measure.treble, "treble");
  const bass = buildNotes(vex, measure.bass, "bass");
  // Triplets are made before the voices, because they change how long their notes last.
  const tuplets = [
    { notes: treble, events: measure.treble },
    { notes: bass, events: measure.bass }
  ].flatMap(({ notes, events }) => {
    const groups = new Map<string, VexStaveNote[]>();
    events.forEach((event, i) => {
      if (event.tuplet) groups.set(event.tuplet, [...(groups.get(event.tuplet) ?? []), notes[i]]);
    });
    return [...groups.values()].map((group) => new vex.Tuplet(group, { numNotes: 3, notesOccupied: 2 }));
  });
  const voices = [treble, bass].map((notes) => new vex.Voice({ numBeats: sheet.barLength / 4, beatValue: 4 }).setStrict(false).addTickables(notes));
  vex.Accidental.applyAccidentals(voices, sheet.keySignature);
  const formatter = new vex.Formatter();
  for (const voice of voices) formatter.joinVoices([voice]);
  return { treble, bass, voices, formatter, tuplets };
}

/** Width the clef, key signature and (for the very first bar) time signature take. */
function headWidth(vex: Vex, sheet: Sheet, withTime: boolean): number {
  const widths = (["treble", "bass"] as const).map((clef) => {
    const stave = new vex.Stave(0, 0, 400).addClef(clef).addKeySignature(sheet.keySignature);
    if (withTime) stave.addTimeSignature(`${sheet.barLength / 4}/4`);
    return stave.getNoteStartX();
  });
  return Math.max(...widths);
}

/** Break the sheet into lines of `lineWidth`, each bar as wide as its notes need. */
export function layoutSheet(vex: Vex, sheet: Sheet, lineWidth: number): SheetLine[] {
  const plain = new vex.Stave(0, 0, 400).getNoteStartX();
  const head = headWidth(vex, sheet, false);
  const firstHead = headWidth(vex, sheet, true);
  const notes = sheet.measures.map((measure) => {
    const { voices, formatter } = buildVoices(vex, sheet, measure);
    // Few notes still need room each, more so with accidentals in front of them.
    const busiest = Math.max(measure.treble.length, measure.bass.length);
    return Math.max(busiest * NOTE_FLOOR, formatter.preCalculateMinTotalWidth(voices) * DENSITY) + BAR_PADDING;
  });
  const lines: SheetLine[] = [];
  let index = 0;
  while (index < notes.length) {
    const from = index;
    const widths: number[] = [];
    let total = 0;
    while (index < notes.length && widths.length < MAX_BARS_PER_LINE) {
      const width = notes[index] + (widths.length === 0 ? (index === 0 ? firstHead : head) : plain);
      if (widths.length > 0 && total + width > lineWidth) break;
      widths.push(width);
      total += width;
      index += 1;
    }
    // Stretch the bars to fill the line; a lone crowded bar is squeezed to fit instead.
    const last = index >= notes.length;
    const factor = total > lineWidth ? lineWidth / total : last ? Math.min(lineWidth / total, MAX_STRETCH) : lineWidth / total;
    const pitches = sheet.measures.slice(from, index).flatMap((measure) => [...measure.treble, ...measure.bass].flatMap((event) => event.pitches));
    const above = Math.max(0, Math.max(TREBLE_COMFORT, ...pitches) - TREBLE_COMFORT) * SEMITONE;
    const below = Math.max(0, BASS_COMFORT - Math.min(BASS_COMFORT, ...pitches)) * SEMITONE;
    lines.push({ from, to: index, widths: widths.map((width) => width * factor), above, below });
  }
  return lines;
}

/** Draw lines of the sheet, the first at `top`, each starting at `left`. */
export function drawLines(vex: Vex, context: RenderContext, sheet: Sheet, lines: SheetLine[], left: number, top: number): void {
  const { Beam, Stave, StaveConnector, StaveTie } = vex;
  const lastOf = (events: SheetEvent[]) => events[events.length - 1];

  let nextTop = top;
  lines.forEach((line) => {
    const y = nextTop + line.above;
    nextTop += lineHeight(line);
    let x = left;
    // A tie waiting for its second note, per staff. "carry" is one that began on an earlier line.
    const open: Record<"treble" | "bass", VexStaveNote | "carry" | null> = {
      treble: line.from > 0 && lastOf(sheet.measures[line.from - 1].treble)?.tied ? "carry" : null,
      bass: line.from > 0 && lastOf(sheet.measures[line.from - 1].bass)?.tied ? "carry" : null
    };
    for (let index = line.from; index < line.to; index++) {
      const measure = sheet.measures[index];
      const barWidth = line.widths[index - line.from];
      const first = index === line.from;
      const treble = new Stave(x, y, barWidth);
      const bass = new Stave(x, y + 90, barWidth);
      if (first) {
        treble.addClef("treble").addKeySignature(sheet.keySignature);
        bass.addClef("bass").addKeySignature(sheet.keySignature);
        treble.setMeasure(index + 1);
      }
      if (index === 0) {
        treble.addTimeSignature(`${sheet.barLength / 4}/4`);
        bass.addTimeSignature(`${sheet.barLength / 4}/4`);
      }
      const noteStart = Math.max(treble.getNoteStartX(), bass.getNoteStartX());
      treble.setNoteStartX(noteStart);
      bass.setNoteStartX(noteStart);
      treble.setContext(context).draw();
      bass.setContext(context).draw();
      if (first) {
        new StaveConnector(treble, bass).setType("brace").setContext(context).draw();
        new StaveConnector(treble, bass).setType("singleLeft").setContext(context).draw();
      }
      const final = index === sheet.measures.length - 1 && sheet.hiddenBars === 0;
      new StaveConnector(treble, bass).setType(final ? "boldDoubleRight" : "singleRight").setContext(context).draw();

      const built = buildVoices(vex, sheet, measure);
      built.formatter.format(built.voices, Math.max(40, x + barWidth - noteStart - BAR_PADDING));
      const staves = [
        { name: "treble" as const, stave: treble, events: measure.treble, notes: built.treble },
        { name: "bass" as const, stave: bass, events: measure.bass, notes: built.bass }
      ];
      // Given the rests too, so a beam ends at a rest instead of reaching over it.
      const beams = staves.flatMap(({ notes }) => Beam.generateBeams(notes));
      built.voices.forEach((voice, i) => voice.draw(context, staves[i].stave));
      for (const beam of beams) beam.setContext(context).draw();
      for (const tuplet of built.tuplets) tuplet.setContext(context).draw();

      for (const { name, events, notes } of staves) {
        notes.forEach((note, i) => {
          if (events[i].rest) {
            open[name] = null;
            return;
          }
          const before = open[name];
          const indexes = events[i].pitches.map((_, k) => k);
          // Across a line or page break the tie is drawn as two halves. A half still names
          // the notes of the chord on both sides, or VexFlow refuses it.
          if (before === "carry") new StaveTie({ lastNote: note, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw();
          else if (before) new StaveTie({ firstNote: before, lastNote: note, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw();
          open[name] = events[i].tied ? note : null;
          const endsLine = index === line.to - 1 && i === notes.length - 1;
          if (events[i].tied && endsLine) new StaveTie({ firstNote: note, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw();
        });
      }
      x += barWidth;
    }
  });
}
