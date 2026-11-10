"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActionButton, Slider } from "@/components/editor/controls";
import type { Clip, Note } from "@/lib/editor/types";

const HEIGHT = 264;
const KEYS = 48;
const EDGE = 7;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);

export type NotePhase = "start" | "move" | "end" | "commit";

interface PianoRollProps {
  clip: Clip;
  color: string;
  bpm: number;
  beatsPerBar: number;
  snap: boolean;
  getPosition: () => number;
  onNotes: (notes: Note[], phase: NotePhase) => void;
  onPreview: (pitch: number) => void;
  onClose: () => void;
}

type Drag =
  | { kind: "move"; index: number; grabT: number; grabP: number; base: Note[] }
  | { kind: "resize"; index: number; base: Note[] };

function pitchName(pitch: number): string {
  return `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function PianoRoll({ clip, color, bpm, beatsPerBar, snap, getPosition, onNotes, onPreview, onClose }: PianoRollProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const lengthRef = useRef(0);
  const notes = clip.notes ?? [];

  // The visible pitch range follows the notes, with room to add more above and below.
  const pitches = notes.map((note) => note.p);
  let low = pitches.length ? Math.min(...pitches) - 7 : 48;
  let high = pitches.length ? Math.max(...pitches) + 7 : 84;
  if (high - low < 30) {
    const middle = Math.round((high + low) / 2);
    low = middle - 15;
    high = middle + 15;
  }
  low = Math.max(0, low);
  high = Math.min(127, high);
  const rows = high - low + 1;
  const rowH = HEIGHT / rows;
  const step = 60 / bpm / 4;
  const pxPerSec = width / Math.max(0.1, clip.duration);

  const view = useRef({ notes, low, high, rowH, pxPerSec, selected, clip, step, beatsPerBar, color, getPosition });
  useEffect(() => {
    view.current = { notes, low, high, rowH, pxPerSec, selected, clip, step, beatsPerBar, color, getPosition };
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, Math.floor(wrap.clientWidth) - KEYS)));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = (width + KEYS) * dpr;
    canvas.height = HEIGHT * dpr;
    let frame = 0;
    const draw = () => {
      const v = view.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, width + KEYS, HEIGHT);
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      for (let pitch = v.low; pitch <= v.high; pitch++) {
        const y = (v.high - pitch) * v.rowH;
        const black = BLACK.has(pitch % 12);
        ctx.fillStyle = black ? "#0b1220" : "#111a2e";
        ctx.fillRect(KEYS, y, width, v.rowH);
        ctx.fillStyle = black ? "#1e293b" : "#e2e8f0";
        ctx.fillRect(0, y, KEYS - 2, Math.max(1, v.rowH - 0.5));
        if (pitch % 12 === 0) {
          ctx.fillStyle = "#0f172a";
          ctx.fillText(pitchName(pitch), 4, y + v.rowH / 2 + 0.5);
          ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
          ctx.fillRect(KEYS, y + v.rowH - 0.5, width, 1);
        }
      }
      // Grid: sixteenths when there is room, always beats and bars.
      const beat = v.step * 4;
      const fine = v.step * v.pxPerSec >= 7;
      const gridStep = fine ? v.step : beat;
      const first = Math.ceil(v.clip.offset / gridStep - 1e-6);
      for (let i = first; i * gridStep < v.clip.offset + v.clip.duration; i++) {
        const sixteenths = fine ? i : i * 4;
        const x = KEYS + (i * gridStep - v.clip.offset) * v.pxPerSec;
        const isBar = sixteenths % (4 * v.beatsPerBar) === 0;
        const isBeat = sixteenths % 4 === 0;
        ctx.fillStyle = isBar ? "rgba(226, 232, 240, 0.4)" : isBeat ? "rgba(148, 163, 184, 0.22)" : "rgba(148, 163, 184, 0.09)";
        ctx.fillRect(Math.round(x), 0, 1, HEIGHT);
      }
      v.notes.forEach((note, index) => {
        if (note.p < v.low || note.p > v.high) return;
        const x = KEYS + (note.t - v.clip.offset) * v.pxPerSec;
        const w = Math.max(3, note.d * v.pxPerSec);
        if (x + w < KEYS || x > KEYS + width) return;
        const y = (v.high - note.p) * v.rowH;
        // Velocity shows as opacity, so soft notes look lighter.
        ctx.globalAlpha = 0.45 + 0.55 * note.v;
        ctx.fillStyle = v.color;
        ctx.fillRect(Math.max(KEYS, x), y + 0.5, w - Math.max(0, KEYS - x), Math.max(2, v.rowH - 1));
        ctx.globalAlpha = 1;
        ctx.lineWidth = index === v.selected ? 2 : 1;
        ctx.strokeStyle = index === v.selected ? "#ffffff" : "rgba(2, 6, 23, 0.9)";
        ctx.strokeRect(Math.max(KEYS, x) + 0.5, y + 0.5, w - Math.max(0, KEYS - x) - 1, Math.max(2, v.rowH - 1));
      });
      const local = v.getPosition() - v.clip.start;
      if (local >= 0 && local <= v.clip.duration) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.round(KEYS + local * v.pxPerSec), 0, 1, HEIGHT);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [width]);

  const locate = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left - KEYS;
    const y = Math.min(HEIGHT - 1, Math.max(0, event.clientY - rect.top));
    return { x, time: clip.offset + x / pxPerSec, pitch: Math.min(high, Math.max(low, high - Math.floor(y / rowH))) };
  };

  const snapTime = (time: number, bypass: boolean) => (snap && !bypass ? Math.round(time / step) * step : time);

  const hit = (x: number, pitch: number): { index: number; edge: boolean } | null => {
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note.p !== pitch) continue;
      const x0 = (note.t - clip.offset) * pxPerSec;
      const x1 = x0 + Math.max(3, note.d * pxPerSec);
      if (x >= x0 - 1 && x <= x1 + 1) return { index: i, edge: x1 - x <= Math.min(EDGE, (x1 - x0) / 2) };
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const point = locate(event);
    if (point.x < 0) {
      onPreview(point.pitch);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const found = hit(point.x, point.pitch);
    onNotes(notes, "start");
    if (found) {
      setSelected(found.index);
      const note = notes[found.index];
      lengthRef.current = note.d;
      dragRef.current = found.edge
        ? { kind: "resize", index: found.index, base: notes }
        : { kind: "move", index: found.index, grabT: point.time - note.t, grabP: note.p, base: notes };
      onPreview(note.p);
      return;
    }
    // An empty spot adds a note there; keep dragging to set its length.
    const start = Math.max(clip.offset, Math.min(snapTime(point.time, event.altKey), clip.offset + clip.duration - step / 2));
    const created: Note = { t: start, d: lengthRef.current || step * 2, p: point.pitch, v: 0.8 };
    const next = [...notes, created];
    setSelected(next.length - 1);
    dragRef.current = { kind: "resize", index: next.length - 1, base: next };
    onNotes(next, "move");
    onPreview(point.pitch);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const point = locate(event);
    if (!drag) {
      const found = point.x >= 0 ? hit(point.x, point.pitch) : null;
      event.currentTarget.style.cursor = found ? (found.edge ? "ew-resize" : "grab") : point.x < 0 ? "pointer" : "crosshair";
      return;
    }
    const original = drag.base[drag.index];
    let changed: Note;
    if (drag.kind === "move") {
      const t = Math.max(clip.offset, Math.min(snapTime(point.time - drag.grabT, event.altKey), clip.offset + clip.duration - 0.02));
      changed = { ...original, t, p: point.pitch };
      if (point.pitch !== drag.grabP) {
        drag.grabP = point.pitch;
        onPreview(point.pitch);
      }
    } else {
      const end = Math.max(original.t + step / 2, snapTime(point.time, event.altKey));
      changed = { ...original, d: Math.max(0.02, end - original.t) };
      lengthRef.current = changed.d;
    }
    onNotes(drag.base.map((note, index) => (index === drag.index ? changed : note)), "move");
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    onNotes(notes, "end");
  };

  const current = selected !== null ? notes[selected] : undefined;

  return (
    <section className="shrink-0 border-t border-white/10 bg-slate-950" aria-label="Piano roll">
      <div className="flex h-9 items-center gap-3 px-3 text-[11px] text-slate-300">
        <h3 className="display-font shrink-0 whitespace-nowrap font-semibold uppercase tracking-wider">Piano roll</h3>
        <span className="min-w-0 flex-1 truncate text-slate-400">
          {current
            ? `${pitchName(current.p)} · starts ${(current.t - clip.offset).toFixed(2)} s · ${current.d.toFixed(2)} s long`
            : "Click to add a note, drag to move, drag the right edge to resize, right-click to delete."}
        </span>
        {current ? (
          <>
            <div className="w-52 shrink-0">
              <Slider
                label="Velocity"
                value={current.v}
                min={0.05}
                max={1}
                step={0.01}
                defaultValue={0.8}
                format={(v) => `${Math.round(v * 127)}`}
                onChange={(v) => onNotes(notes.map((note, index) => (index === selected ? { ...note, v } : note)), "commit")}
              />
            </div>
            <ActionButton
              variant="danger"
              onClick={() => {
                onNotes(notes.filter((_, index) => index !== selected), "commit");
                setSelected(null);
              }}
            >
              Delete note
            </ActionButton>
          </>
        ) : null}
        <button
          type="button"
          aria-label="Close piano roll"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={wrapRef} style={{ height: HEIGHT }}>
        <canvas
          ref={canvasRef}
          className="block touch-none"
          style={{ width: width + KEYS, height: HEIGHT }}
          role="application"
          aria-label={`Piano roll with ${notes.length} notes. Click to add a note; right-click a note to delete it.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(event) => {
            event.preventDefault();
            const point = locate(event);
            const found = point.x >= 0 ? hit(point.x, point.pitch) : null;
            if (!found) return;
            onNotes(notes.filter((_, index) => index !== found.index), "commit");
            setSelected(null);
          }}
        />
      </div>
    </section>
  );
}
