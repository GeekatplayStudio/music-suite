"use client";

import { X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { ActionButton, Slider } from "@/components/editor/controls";
import { midiHub } from "@/lib/editor/midi";
import type { Clip, Note } from "@/lib/editor/types";

const HEIGHT = 264;
const KEYS = 56;
const EDGE = 7;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);
/** General MIDI drum names for the pitches the built-in kit plays. */
export const DRUM_NAMES: Record<number, string> = {
  36: "Kick",
  38: "Snare",
  39: "Clap",
  41: "Tom lo",
  42: "Hat",
  45: "Tom mid",
  46: "Hat open",
  48: "Tom hi",
  49: "Cymbal"
};
/** Computer keys laid out like a piano octave, starting on C. */
const TYPING: Record<string, number> = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12 };

let noteClipboard: Note[] = [];

export type NotePhase = "start" | "move" | "end" | "commit";

interface PianoRollProps {
  clip: Clip;
  color: string;
  bpm: number;
  beatsPerBar: number;
  /** 4 when a beat is a quarter note, 8 when it is an eighth (6/8). */
  beatUnit?: 4 | 8;
  snap: boolean;
  drums: boolean;
  getPosition: () => number;
  onNotes: (notes: Note[], phase: NotePhase) => void;
  onPreview: (pitch: number) => void;
  onSeek: (time: number) => void;
  onClose: () => void;
}

type Drag =
  | { kind: "move"; anchor: number; grabT: number; grabP: number; lastP: number; ids: Set<number>; base: Note[] }
  | { kind: "resize"; index: number; base: Note[] }
  | { kind: "marquee"; t: number; p: number };

function pitchName(pitch: number, drums: boolean): string {
  if (drums && DRUM_NAMES[pitch]) return DRUM_NAMES[pitch];
  return `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function PianoRoll(props: PianoRollProps) {
  const { clip, color, bpm, beatsPerBar, beatUnit = 4, snap, drums, getPosition, onNotes, onPreview, onSeek, onClose } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [scroll, setScroll] = useState(0);
  const [typing, setTyping] = useState(false);
  const [marquee, setMarquee] = useState<{ t0: number; t1: number; p0: number; p1: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const lengthRef = useRef(0);
  const notes = clip.notes ?? [];

  // The rows are fixed when the editor opens, so they never shift under the pointer while
  // notes are added; they only widen if a note ends up outside them.
  const [base] = useState(() => {
    const found = (clip.notes ?? []).map((note) => note.p);
    if (drums) return { low: Math.min(35, ...found), high: Math.max(50, ...found) };
    let bottom = found.length ? Math.min(...found) - 7 : 48;
    let top = found.length ? Math.max(...found) + 7 : 84;
    if (top - bottom < 30) {
      const middle = Math.round((top + bottom) / 2);
      bottom = middle - 15;
      top = middle + 15;
    }
    return { low: bottom, high: top };
  });
  const pitches = notes.map((note) => note.p);
  const low = Math.max(0, Math.min(base.low, ...pitches));
  const high = Math.min(127, Math.max(base.high, ...pitches));
  const rowH = HEIGHT / (high - low + 1);
  const step = 60 / bpm / 4;
  const pxPerSec = (width / Math.max(0.1, clip.duration)) * zoom;
  const visible = width / pxPerSec;
  const viewStart = clip.offset + Math.min(scroll, Math.max(0, clip.duration - visible));

  const view = useRef({ notes, low, high, rowH, pxPerSec, selected, clip, step, beatsPerBar, beatUnit, color, getPosition, viewStart, drums, marquee });
  useEffect(() => {
    view.current = { notes, low, high, rowH, pxPerSec, selected, clip, step, beatsPerBar, beatUnit, color, getPosition, viewStart, drums, marquee };
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
      const xOf = (time: number) => KEYS + (time - v.viewStart) * v.pxPerSec;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, width + KEYS, HEIGHT);
      ctx.textBaseline = "middle";
      for (let pitch = v.low; pitch <= v.high; pitch++) {
        const y = (v.high - pitch) * v.rowH;
        const black = !v.drums && BLACK.has(pitch % 12);
        ctx.fillStyle = black ? "#0b1220" : "#111a2e";
        ctx.fillRect(KEYS, y, width, v.rowH);
        ctx.fillStyle = v.drums ? (pitch % 2 ? "#1e293b" : "#273449") : black ? "#1e293b" : "#e2e8f0";
        ctx.fillRect(0, y, KEYS - 2, Math.max(1, v.rowH - 0.5));
        const labelled = v.drums ? DRUM_NAMES[pitch] !== undefined : pitch % 12 === 0;
        if (labelled) {
          ctx.font = `${v.drums ? 10 : 9}px ui-monospace, SFMono-Regular, Menlo, monospace`;
          ctx.fillStyle = v.drums ? "#e2e8f0" : "#0f172a";
          ctx.fillText(pitchName(pitch, v.drums), 4, y + v.rowH / 2 + 0.5);
        }
        if (v.drums || pitch % 12 === 0) {
          ctx.fillStyle = "rgba(148, 163, 184, 0.22)";
          ctx.fillRect(KEYS, y + v.rowH - 0.5, width, 1);
        }
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(KEYS, 0, width, HEIGHT);
      ctx.clip();
      // Grid: sixteenths when there is room, always beats and bars.
      const fine = v.step * v.pxPerSec >= 7;
      const gridStep = fine ? v.step : v.step * 4;
      for (let i = Math.ceil(v.viewStart / gridStep - 1e-6); i * gridStep < v.viewStart + width / v.pxPerSec; i++) {
        const sixteenths = fine ? i : i * 4;
        // A beat is four sixteenths, or two when the signature counts eighths (6/8).
        const beatSixteenths = 16 / v.beatUnit;
        const isBar = sixteenths % (beatSixteenths * v.beatsPerBar) === 0;
        const isBeat = sixteenths % beatSixteenths === 0;
        ctx.fillStyle = isBar ? "rgba(226, 232, 240, 0.4)" : isBeat ? "rgba(148, 163, 184, 0.22)" : "rgba(148, 163, 184, 0.09)";
        ctx.fillRect(Math.round(xOf(i * gridStep)), 0, 1, HEIGHT);
      }
      v.notes.forEach((note, index) => {
        if (note.p < v.low || note.p > v.high) return;
        const x = xOf(note.t);
        const w = Math.max(3, note.d * v.pxPerSec);
        if (x + w < KEYS || x > KEYS + width) return;
        const y = (v.high - note.p) * v.rowH;
        const chosen = v.selected.has(index);
        // Velocity shows as opacity, so soft notes look lighter.
        ctx.globalAlpha = 0.45 + 0.55 * note.v;
        ctx.fillStyle = v.color;
        ctx.fillRect(x, y + 0.5, w, Math.max(2, v.rowH - 1));
        ctx.globalAlpha = 1;
        ctx.lineWidth = chosen ? 2 : 1;
        ctx.strokeStyle = chosen ? "#ffffff" : "rgba(2, 6, 23, 0.9)";
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, Math.max(2, v.rowH - 1));
      });
      if (v.marquee) {
        const x0 = xOf(v.marquee.t0);
        const y0 = (v.high - v.marquee.p1) * v.rowH;
        const boxW = xOf(v.marquee.t1) - x0;
        const boxH = (v.marquee.p1 - v.marquee.p0 + 1) * v.rowH;
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fillRect(x0, y0, boxW, boxH);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, boxW, boxH);
      }
      const playhead = v.getPosition() - v.clip.start + v.clip.offset;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(xOf(playhead)), 0, 1, HEIGHT);
      ctx.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [width]);

  // Wheel: Ctrl/Cmd zooms, anything else scrolls sideways when zoomed in.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const v = view.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        setZoom((z) => Math.min(32, Math.max(1, z * Math.exp(-event.deltaY * 0.004))));
      } else if (v.pxPerSec * v.clip.duration > width + 1) {
        event.preventDefault();
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        setScroll((s) => Math.max(0, Math.min(v.clip.duration - width / v.pxPerSec, s + delta / v.pxPerSec)));
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [width]);

  const snapTime = (time: number, bypass: boolean) => (snap && !bypass ? Math.round(time / step) * step : time);

  /** Step input: put a note at the playhead and move the playhead on by its length. */
  const stepInput = useEffectEvent((pitch: number, velocity: number, preview: boolean) => {
    const length = lengthRef.current || step * 2;
    const local = snapTime(getPosition() - clip.start + clip.offset, false);
    if (preview) onPreview(pitch);
    if (local < clip.offset - 1e-6 || local >= clip.offset + clip.duration - 0.01) return;
    onNotes([...notes, { t: local, d: length, p: pitch, v: velocity }], "commit");
    onSeek(clip.start + local - clip.offset + length);
  });

  useEffect(() => {
    if (!typing) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.closest("input, textarea, select")) return;
      const offset = TYPING[event.key.toLowerCase()];
      if (offset === undefined) return;
      // These letters are editor shortcuts too; while typing notes they belong to the keyboard.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) stepInput(60 + offset, 0.8, true);
    };
    window.addEventListener("keydown", onKey, true);
    // A connected MIDI keyboard enters notes the same way. It is already heard through the
    // editor's live play-through, so it is not previewed a second time here.
    void midiHub.connect();
    const unsubscribe = midiHub.subscribe((event) => {
      if (event.kind === "on") stepInput(event.pitch, event.velocity, false);
    });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      unsubscribe();
    };
  }, [typing]);

  const locate = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left - KEYS;
    const y = Math.min(HEIGHT - 1, Math.max(0, event.clientY - rect.top));
    return { x, time: viewStart + x / pxPerSec, pitch: Math.min(high, Math.max(low, high - Math.floor(y / rowH))) };
  };

  const hit = (time: number, pitch: number): { index: number; edge: boolean } | null => {
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note.p !== pitch) continue;
      const length = Math.max(3 / pxPerSec, note.d);
      if (time >= note.t - 1 / pxPerSec && time <= note.t + length + 1 / pxPerSec) {
        return { index: i, edge: (note.t + length - time) * pxPerSec <= Math.min(EDGE, (length * pxPerSec) / 2) };
      }
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
    const found = hit(point.time, point.pitch);
    if (!found && event.shiftKey) {
      dragRef.current = { kind: "marquee", t: point.time, p: point.pitch };
      setMarquee({ t0: point.time, t1: point.time, p0: point.pitch, p1: point.pitch });
      return;
    }
    onNotes(notes, "start");
    if (found) {
      const note = notes[found.index];
      let ids = selected;
      if (event.shiftKey) {
        ids = new Set(selected);
        if (ids.has(found.index)) ids.delete(found.index);
        else ids.add(found.index);
      } else if (!selected.has(found.index)) {
        ids = new Set([found.index]);
      }
      setSelected(ids);
      lengthRef.current = note.d;
      dragRef.current = found.edge
        ? { kind: "resize", index: found.index, base: notes }
        : { kind: "move", anchor: found.index, grabT: point.time - note.t, grabP: point.pitch, lastP: point.pitch, ids, base: notes };
      onPreview(note.p);
      return;
    }
    // An empty spot adds a note there; keep dragging to set its length.
    const start = Math.max(clip.offset, Math.min(snapTime(point.time, event.altKey), clip.offset + clip.duration - step / 2));
    const created: Note = { t: start, d: lengthRef.current || step * 2, p: point.pitch, v: 0.8 };
    const next = [...notes, created];
    setSelected(new Set([next.length - 1]));
    dragRef.current = { kind: "resize", index: next.length - 1, base: next };
    onNotes(next, "move");
    onPreview(point.pitch);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const point = locate(event);
    if (!drag) {
      const found = point.x >= 0 ? hit(point.time, point.pitch) : null;
      event.currentTarget.style.cursor = found ? (found.edge ? "ew-resize" : "grab") : point.x < 0 ? "pointer" : "crosshair";
      return;
    }
    if (drag.kind === "marquee") {
      const box = {
        t0: Math.min(drag.t, point.time),
        t1: Math.max(drag.t, point.time),
        p0: Math.min(drag.p, point.pitch),
        p1: Math.max(drag.p, point.pitch)
      };
      setMarquee(box);
      const inside = new Set<number>();
      notes.forEach((note, index) => {
        if (note.p >= box.p0 && note.p <= box.p1 && note.t < box.t1 && note.t + note.d > box.t0) inside.add(index);
      });
      setSelected(inside);
      return;
    }
    if (drag.kind === "move") {
      const anchor = drag.base[drag.anchor];
      const wantedT = snapTime(point.time - drag.grabT, event.altKey);
      // The whole group moves together and stops when its first note reaches the clip start.
      const earliest = Math.min(...[...drag.ids].map((i) => drag.base[i].t));
      const dt = Math.max(clip.offset - earliest, wantedT - anchor.t);
      const dp = point.pitch - drag.grabP;
      if (point.pitch !== drag.lastP) {
        drag.lastP = point.pitch;
        onPreview(Math.min(127, Math.max(0, anchor.p + dp)));
      }
      onNotes(
        drag.base.map((note, index) =>
          drag.ids.has(index) ? { ...note, t: note.t + dt, p: Math.min(127, Math.max(0, note.p + dp)) } : note
        ),
        "move"
      );
      return;
    }
    const original = drag.base[drag.index];
    const end = Math.max(original.t + step / 2, snapTime(point.time, event.altKey));
    lengthRef.current = Math.max(0.02, end - original.t);
    onNotes(drag.base.map((note, index) => (index === drag.index ? { ...note, d: lengthRef.current } : note)), "move");
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "marquee") setMarquee(null);
    else onNotes(notes, "end");
  };

  const chosen = [...selected].filter((index) => index < notes.length);
  const first = chosen.length ? notes[chosen[0]] : undefined;
  const removeSelected = () => {
    onNotes(notes.filter((_, index) => !selected.has(index)), "commit");
    setSelected(new Set());
  };
  const paste = () => {
    if (!noteClipboard.length) return;
    const at = snapTime(getPosition() - clip.start + clip.offset, false);
    const origin = Math.min(...noteClipboard.map((note) => note.t));
    const added = noteClipboard.map((note) => ({ ...note, t: Math.max(clip.offset, at + note.t - origin) }));
    onNotes([...notes, ...added], "commit");
    setSelected(new Set(added.map((_, index) => notes.length + index)));
  };

  let status = drums
    ? "Click a row to add a hit. Shift-drag to select several."
    : "Click to add a note, drag to move, drag the right edge to resize. Shift-drag to select several; right-click deletes.";
  if (chosen.length > 1) status = `${chosen.length} notes selected`;
  else if (first) status = `${pitchName(first.p, drums)} · starts ${(first.t - clip.offset).toFixed(2)} s · ${first.d.toFixed(2)} s long`;
  if (typing) status = "Note input is on: A W S E D F T G Y H U J K (or a MIDI keyboard) add notes at the playhead.";

  return (
    <section className="shrink-0 border-t border-white/10 bg-slate-950" aria-label="Piano roll">
      <div className="flex h-9 items-center gap-2 px-3 text-[11px] text-slate-300">
        <h3 className="display-font shrink-0 whitespace-nowrap font-semibold uppercase tracking-wider">{drums ? "Drum grid" : "Piano roll"}</h3>
        <span className="min-w-0 flex-1 truncate text-slate-400" aria-live="polite">
          {status}
        </span>
        {first ? (
          <div className="w-48 shrink-0">
            <Slider
              label="Velocity"
              value={first.v}
              min={0.05}
              max={1}
              step={0.01}
              defaultValue={0.8}
              format={(v) => `${Math.round(v * 127)}`}
              onChange={(v) => onNotes(notes.map((note, index) => (selected.has(index) ? { ...note, v } : note)), "commit")}
            />
          </div>
        ) : null}
        <ActionButton
          disabled={!chosen.length}
          title="Copy the selected notes"
          onClick={() => {
            noteClipboard = chosen.map((index) => ({ ...notes[index] }));
          }}
        >
          Copy
        </ActionButton>
        <ActionButton title="Paste the copied notes at the playhead" onClick={paste}>
          Paste
        </ActionButton>
        <ActionButton variant="danger" disabled={!chosen.length} onClick={removeSelected}>
          Delete
        </ActionButton>
        <ActionButton
          aria-pressed={typing}
          className={typing ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : undefined}
          title="Enter notes from the computer keyboard or a MIDI keyboard"
          onClick={() => setTyping((on) => !on)}
        >
          Note input
        </ActionButton>
        <ActionButton aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 2))}>
          −
        </ActionButton>
        <ActionButton aria-label="Zoom in" disabled={zoom >= 32} onClick={() => setZoom((z) => Math.min(32, z * 2))}>
          +
        </ActionButton>
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
          aria-label={`${drums ? "Drum grid" : "Piano roll"} with ${notes.length} notes. Click to add a note; right-click a note to delete it.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(event) => {
            event.preventDefault();
            const point = locate(event);
            const found = point.x >= 0 ? hit(point.time, point.pitch) : null;
            if (!found) return;
            onNotes(notes.filter((_, index) => index !== found.index), "commit");
            setSelected(new Set());
          }}
        />
      </div>
    </section>
  );
}
