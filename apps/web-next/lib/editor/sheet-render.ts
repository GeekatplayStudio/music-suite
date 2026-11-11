/**
 * Engrave bars of a sheet with VexFlow: used for the on-screen view (SVG) and for
 * the pages that are printed or saved as a PDF (canvas).
 */
import type { RenderContext, StaveNote as VexStaveNote } from "vexflow";

import type { Sheet, SheetEvent } from "@/lib/editor/notation";

export type Vex = typeof import("vexflow");

/** Distance from the top of one grand staff to the next. */
export const LINE_HEIGHT = 230;

export interface SheetLayout {
  /** Left edge of the first bar of each line. */
  left: number;
  /** Top of the first line. */
  top: number;
  barWidth: number;
  perLine: number;
  /** Bars to draw: from this index up to, not including, `to`. */
  from: number;
  to: number;
}

/** The engraving library, loaded on first use: it is large. */
export async function loadVex(): Promise<Vex> {
  const vex = await import("vexflow");
  await document.fonts.ready;
  return vex;
}

export function drawSheet(vex: Vex, context: RenderContext, sheet: Sheet, layout: SheetLayout): void {
  const { Accidental, Beam, Dot, Formatter, Stave, StaveConnector, StaveNote, StaveTie, Voice } = vex;
  const { left, top, barWidth, perLine, from, to } = layout;
  const last = (events: SheetEvent[]) => events[events.length - 1];
  // A tie waiting for its second note, per staff. "carry" is one that began before `from`.
  const open: Record<"treble" | "bass", VexStaveNote | "carry" | null> = {
    treble: from > 0 && last(sheet.measures[from - 1].treble)?.tied ? "carry" : null,
    bass: from > 0 && last(sheet.measures[from - 1].bass)?.tied ? "carry" : null
  };

  for (let index = from; index < Math.min(to, sheet.measures.length); index++) {
    const measure = sheet.measures[index];
    const column = (index - from) % perLine;
    const row = Math.floor((index - from) / perLine);
    const x = left + column * barWidth;
    const y = top + row * LINE_HEIGHT;
    const treble = new Stave(x, y, barWidth);
    const bass = new Stave(x, y + 90, barWidth);
    if (column === 0) {
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
    if (column === 0) {
      new StaveConnector(treble, bass).setType("brace").setContext(context).draw();
      new StaveConnector(treble, bass).setType("singleLeft").setContext(context).draw();
    }
    const final = index === sheet.measures.length - 1 && sheet.hiddenBars === 0;
    new StaveConnector(treble, bass).setType(final ? "boldDoubleRight" : "singleRight").setContext(context).draw();

    const build = (events: SheetEvent[], clef: "treble" | "bass") =>
      events.map((event) => {
        const note = new StaveNote({ keys: event.keys, duration: `${event.duration}${event.rest ? "r" : ""}`, clef, dots: event.dotted ? 1 : 0 });
        if (event.dotted) Dot.buildAndAttach([note], { all: true });
        return note;
      });
    const staves = [
      { name: "treble" as const, stave: treble, events: measure.treble, notes: build(measure.treble, "treble") },
      { name: "bass" as const, stave: bass, events: measure.bass, notes: build(measure.bass, "bass") }
    ];
    const voices = staves.map(({ notes }) => new Voice({ numBeats: sheet.barLength / 4, beatValue: 4 }).setStrict(false).addTickables(notes));
    Accidental.applyAccidentals(voices, sheet.keySignature);
    const formatter = new Formatter();
    for (const voice of voices) formatter.joinVoices([voice]);
    formatter.format(voices, Math.max(60, x + barWidth - noteStart - 14));
    // Given the rests too, so a beam ends at a rest instead of reaching over it.
    const beams = staves.flatMap(({ notes }) => Beam.generateBeams(notes));
    voices.forEach((voice, i) => voice.draw(context, staves[i].stave));
    for (const beam of beams) beam.setContext(context).draw();

    for (const { name, events, notes } of staves) {
      notes.forEach((note, i) => {
        if (events[i].rest) {
          open[name] = null;
          return;
        }
        const first = open[name];
        const indexes = events[i].pitches.map((_, k) => k);
        if (first) {
          // Across a line or page break the tie is drawn as two halves.
          const sameLine = first !== "carry" && (column !== 0 || i !== 0);
          if (sameLine) new StaveTie({ firstNote: first, lastNote: note, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw();
          else new StaveTie({ lastNote: note, lastIndexes: indexes }).setContext(context).draw();
        }
        open[name] = events[i].tied ? note : null;
        const endsLine = (column === perLine - 1 || index === to - 1) && i === notes.length - 1;
        if (events[i].tied && endsLine) new StaveTie({ firstNote: note, firstIndexes: indexes }).setContext(context).draw();
      });
    }
  }
}
