"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { toSheet, type SheetEvent } from "@/lib/editor/notation";
import type { Clip } from "@/lib/editor/types";

const LINE_HEIGHT = 230;
const MIN_BAR_WIDTH = 230;
/** Room at the sides, for the brace that joins the two staves. */
const MARGIN = 30;

/**
 * A MIDI clip written as sheet music on a piano's two staves. It is a reading view:
 * notes are edited in the piano roll, and this redraws as they change.
 */
export function SheetMusic({
  clip,
  bpm,
  beatsPerBar,
  keyLabel,
  onSeek,
  onClose
}: {
  clip: Clip;
  bpm: number;
  beatsPerBar: number;
  keyLabel: string | null;
  /** Jump to a time on the timeline (a bar was clicked). */
  onSeek: (time: number) => void;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const sheet = useMemo(
    () => toSheet(clip.notes ?? [], { bpm, beatsPerBar, offset: clip.offset, duration: clip.duration, keyLabel }),
    [clip.notes, clip.offset, clip.duration, bpm, beatsPerBar, keyLabel]
  );
  const perLine = Math.max(1, Math.floor((width - 2 * MARGIN) / MIN_BAR_WIDTH));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => setWidth(host.clientWidth);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || width < 200) return;
    let cancelled = false;
    void (async () => {
      try {
        // The engraving library is large, so it loads only when sheet music is opened.
        const { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Voice } = await import("vexflow");
        await document.fonts.ready;
        if (cancelled) return;
        paper.replaceChildren();
        const lines = Math.ceil(sheet.measures.length / perLine);
        const renderer = new Renderer(paper, Renderer.Backends.SVG);
        renderer.resize(width, lines * LINE_HEIGHT + 20);
        const context = renderer.getContext();
        const left = MARGIN;
        const barWidth = (width - 2 * left) / perLine;
        type Drawn = InstanceType<typeof StaveNote>;
        // A tie waiting for its second note, per staff.
        const open: { treble: Drawn | null; bass: Drawn | null } = { treble: null, bass: null };

        sheet.measures.forEach((measure, index) => {
          const column = index % perLine;
          const row = Math.floor(index / perLine);
          const x = left + column * barWidth;
          const y = 20 + row * LINE_HEIGHT;
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
          new StaveConnector(treble, bass).setType(index === sheet.measures.length - 1 ? "boldDoubleRight" : "singleRight").setContext(context).draw();

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
              const from = open[name];
              const indexes = events[i].pitches.map((_, k) => k);
              if (from) {
                // Across a line break the tie is drawn as two halves.
                const sameLine = column !== 0 || i !== 0;
                if (sameLine) new StaveTie({ firstNote: from, lastNote: note, firstIndexes: indexes, lastIndexes: indexes }).setContext(context).draw();
                else new StaveTie({ lastNote: note, lastIndexes: indexes }).setContext(context).draw();
              }
              open[name] = events[i].tied ? note : null;
              const endsLine = column === perLine - 1 && i === notes.length - 1;
              if (events[i].tied && endsLine) new StaveTie({ firstNote: note, firstIndexes: indexes }).setContext(context).draw();
            });
          }
        });
        setFailure(null);
      } catch (err) {
        if (!cancelled) setFailure(err instanceof Error ? err.message : "The sheet music could not be drawn.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheet, width, perLine]);

  /** A click on the paper jumps to the start of the bar under it. */
  const seekTo = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const column = Math.min(perLine - 1, Math.max(0, Math.floor((event.clientX - box.left - MARGIN) / ((width - 2 * MARGIN) / perLine))));
    const row = Math.max(0, Math.floor((event.clientY - box.top - 10) / LINE_HEIGHT));
    const bar = row * perLine + column;
    if (bar < sheet.measures.length) onSeek(clip.start + bar * sheet.barSeconds);
  };

  const count = (clip.notes ?? []).length;
  return (
    <section className="flex max-h-[55vh] shrink-0 flex-col border-t border-white/10 bg-slate-950" aria-label="Sheet music">
      <header className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-400">
        <h2 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-200">Sheet music</h2>
        <span className="min-w-0 flex-1 truncate">
          {clip.name}: {count} note{count === 1 ? "" : "s"}, {sheet.measures.length} bar{sheet.measures.length === 1 ? "" : "s"} at {Math.round(bpm)} BPM.
          Timing is rounded to sixteenths. Click a bar to move the playhead there; edit notes in the piano roll.
          {sheet.hiddenBars ? ` Showing the first ${sheet.measures.length} bars of ${sheet.measures.length + sheet.hiddenBars}.` : ""}
        </span>
        <button
          type="button"
          aria-label="Close the sheet music"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>
      {failure ? (
        <p role="alert" className="px-3 pb-2 text-xs text-rose-300">
          {failure}
        </p>
      ) : null}
      <div ref={hostRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* Dark ink on paper, as sheet music is read. */}
        <div
          ref={paperRef}
          role="img"
          aria-label={`Sheet music of ${clip.name}: ${count} notes in ${sheet.measures.length} bars`}
          onClick={seekTo}
          className="min-h-40 cursor-pointer rounded-lg bg-[#f8f6f0] text-black"
        />
      </div>
    </section>
  );
}
