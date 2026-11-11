"use client";

import { FileDown, Loader2, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { toSheet } from "@/lib/editor/notation";
import { type PaperSize, defaultPaper, exportPdf, printSheet } from "@/lib/editor/sheet-pages";
import { type SheetLine, drawLines, layoutSheet, lineHeight, loadVex } from "@/lib/editor/sheet-render";
import type { Clip } from "@/lib/editor/types";

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
  const [paper, setPaper] = useState<PaperSize>(defaultPaper);
  const [working, setWorking] = useState<"print" | "pdf" | null>(null);
  const sheet = useMemo(
    () => toSheet(clip.notes ?? [], { bpm, beatsPerBar, offset: clip.offset, duration: clip.duration, keyLabel }),
    [clip.notes, clip.offset, clip.duration, bpm, beatsPerBar, keyLabel]
  );
  // Where each line's bars were drawn, for finding the bar under a click.
  const drawn = useRef<SheetLine[]>([]);

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
        const vex = await loadVex();
        if (cancelled) return;
        paper.replaceChildren();
        const lines = layoutSheet(vex, sheet, width - 2 * MARGIN);
        drawn.current = lines;
        const renderer = new vex.Renderer(paper, vex.Renderer.Backends.SVG);
        renderer.resize(width, lines.reduce((sum, line) => sum + lineHeight(line), 0) + 20);
        drawLines(vex, renderer.getContext(), sheet, lines, MARGIN, 20);
        setFailure(null);
      } catch (err) {
        if (!cancelled) setFailure(err instanceof Error ? err.message : "The sheet music could not be drawn.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheet, width]);

  /** A click on the paper jumps to the start of the bar under it. */
  const seekTo = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    let below = 10;
    const line = drawn.current.find((candidate) => {
      below += lineHeight(candidate);
      return event.clientY - box.top < below;
    });
    if (!line) return;
    let edge = MARGIN;
    let bar = line.to - 1;
    for (let index = line.from; index < line.to; index++) {
      edge += line.widths[index - line.from];
      if (event.clientX - box.left < edge) {
        bar = index;
        break;
      }
    }
    onSeek(clip.start + bar * sheet.barSeconds);
  };

  const count = (clip.notes ?? []).length;
  /** Print, or save a PDF: the same pages either way. */
  const produce = async (kind: "print" | "pdf") => {
    if (working) return;
    setWorking(kind);
    setFailure(null);
    const heading = {
      title: clip.name || "Sheet music",
      subtitle: [`${Math.round(bpm)} BPM`, keyLabel, "Music Suite"].filter(Boolean).join("  ·  ")
    };
    try {
      await (kind === "pdf" ? exportPdf(sheet, heading, paper) : printSheet(sheet, heading, paper));
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "The pages could not be made.");
    }
    setWorking(null);
  };
  const tool =
    "inline-flex h-7 items-center gap-1.5 rounded-lg bg-slate-800 px-2 text-[11px] font-semibold text-slate-100 hover:bg-slate-700 " +
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";
  return (
    <section className="flex max-h-[55vh] shrink-0 flex-col border-t border-white/10 bg-slate-950" aria-label="Sheet music">
      <header className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-400">
        <h2 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-200">Sheet music</h2>
        <span className="min-w-0 flex-1 truncate">
          {clip.name}: {count} note{count === 1 ? "" : "s"}, {sheet.measures.length} bar{sheet.measures.length === 1 ? "" : "s"} at {Math.round(bpm)} BPM.
          Timing is rounded to sixteenths or triplets. Click a bar to move the playhead there; edit notes in the piano roll.
          {sheet.hiddenBars ? ` Showing the first ${sheet.measures.length} bars of ${sheet.measures.length + sheet.hiddenBars}.` : ""}
        </span>
        <select
          aria-label="Paper size"
          value={paper}
          onChange={(event) => setPaper(event.target.value === "letter" ? "letter" : "a4")}
          className="h-7 rounded-lg border border-white/10 bg-slate-900 px-1.5 text-[11px] text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
        </select>
        <button type="button" className={tool} disabled={working !== null} onClick={() => void produce("print")} title="Print this sheet music">
          {working === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Printer className="h-3.5 w-3.5" aria-hidden />} Print
        </button>
        <button type="button" className={tool} disabled={working !== null} onClick={() => void produce("pdf")} title="Save this sheet music as a PDF file">
          {working === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FileDown className="h-3.5 w-3.5" aria-hidden />} PDF
        </button>
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
