"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActionButton } from "@/components/editor/controls";
import { type Spectrogram, computeSpectrogram, fractionToHz, hzToFraction } from "@/lib/editor/spectrogram";
import type { Clip } from "@/lib/editor/types";

const HEIGHT = 220;
const AXIS = 44;
const TICKS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

interface Selection {
  /** Seconds from the start of the clip. */
  t0: number;
  t1: number;
  f0: number;
  f1: number;
}

interface SpectralPanelProps {
  clip: Clip | null;
  buffer: AudioBuffer | undefined;
  getPosition: () => number;
  busy: boolean;
  onRepair: (params: Record<string, unknown>, title: string) => void;
  onClose: () => void;
}

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz` : `${Math.round(hz)} Hz`;
}

export function SpectralPanel({ clip, buffer, getPosition, busy, onRepair, onClose }: SpectralPanelProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const [picture, setPicture] = useState<{ key: string; spec: Spectrogram } | null>(null);
  const [selection, setSelection] = useState<{ key: string; box: Selection } | null>(null);
  const [amount, setAmount] = useState(24);
  const dragRef = useRef<{ t: number; f: number } | null>(null);

  const usable = clip && buffer && !clip.reversed ? clip : null;
  const key = usable ? `${usable.assetId}:${usable.offset.toFixed(4)}:${usable.duration.toFixed(4)}:${width}` : "";
  const spec = picture && picture.key === key ? picture.spec : null;
  const box = selection && usable && selection.key === usable.id ? selection.box : null;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(200, Math.floor(wrap.clientWidth) - AXIS)));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!usable || !buffer || !key) return;
    // Computing takes a few tens of milliseconds; a timer keeps resizing responsive.
    const timer = setTimeout(() => {
      const columns = Math.min(1200, width);
      setPicture({ key, spec: computeSpectrogram(buffer, usable.offset, usable.offset + usable.duration, columns) });
    }, 60);
    return () => clearTimeout(timer);
  }, [usable, buffer, key, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = (width + AXIS) * dpr;
    canvas.height = HEIGHT * dpr;
    let frame = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width + AXIS, HEIGHT);
      if (spec) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(spec.canvas, AXIS, 0, width, HEIGHT);
      }
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      for (const hz of TICKS) {
        const y = hzToFraction(hz) * HEIGHT;
        ctx.fillStyle = "#aab6c8";
        ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : `${hz}`, 4, Math.min(HEIGHT - 6, Math.max(6, y)));
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fillRect(AXIS, Math.round(y), width, 1);
      }
      if (usable) {
        if (box) {
          const x0 = AXIS + (box.t0 / usable.duration) * width;
          const x1 = AXIS + (box.t1 / usable.duration) * width;
          const y0 = hzToFraction(box.f1) * HEIGHT;
          const y1 = hzToFraction(box.f0) * HEIGHT;
          ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
          ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
          // Black under white reads against every colour in the picture.
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#000000";
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#ffffff";
          ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        }
        const local = getPosition() - usable.start;
        if (local >= 0 && local <= usable.duration) {
          const x = Math.round(AXIS + (local / usable.duration) * width);
          ctx.fillStyle = "#000000";
          ctx.fillRect(x - 1, 0, 3, HEIGHT);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, 0, 1, HEIGHT);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [spec, box, usable, width, getPosition]);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(width, Math.max(0, event.clientX - rect.left - AXIS));
    const y = Math.min(HEIGHT, Math.max(0, event.clientY - rect.top));
    return { t: (x / width) * (usable?.duration ?? 0), f: fractionToHz(y / HEIGHT) };
  };

  const repair = (mode: "attenuate" | "heal") => {
    if (!usable || !box) return;
    onRepair(
      {
        start: usable.offset + box.t0,
        end: usable.offset + box.t1,
        freq_low: box.f0,
        freq_high: box.f1,
        mode,
        amount_db: amount
      },
      mode === "heal" ? `Healing a selection in ${usable.name}` : `Attenuating a selection in ${usable.name}`
    );
    setSelection(null);
  };

  let message: string | null = null;
  if (!clip) message = "Select a clip to see its frequency content over time.";
  else if (clip.reversed) message = "The spectral view is not available for reversed clips.";
  else if (!buffer) message = "Loading audio…";

  return (
    <section className="shrink-0 border-t border-white/10 bg-slate-950" aria-label="Spectral view">
      <div className="flex h-9 items-center gap-2 px-3 text-[11px] text-slate-300">
        <h3 className="display-font shrink-0 whitespace-nowrap font-semibold uppercase tracking-wider text-slate-300">Spectral view</h3>
        <span className="min-w-0 flex-1 truncate text-slate-400">
          {box
            ? `${box.t0.toFixed(2)}–${box.t1.toFixed(2)} s · ${formatHz(box.f0)}–${formatHz(box.f1)}`
            : usable
              ? `${usable.name} — drag a box around a sound to reduce or remove it.`
              : ""}
        </span>
        <select
          className="h-8 w-24 shrink-0 rounded-lg border border-white/10 bg-slate-900 px-2 text-xs text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label="Attenuation amount"
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
        >
          {[6, 12, 24, 48, 96].map((db) => (
            <option key={db} value={db}>
              −{db} dB
            </option>
          ))}
        </select>
        <ActionButton disabled={!box || busy} onClick={() => repair("attenuate")} title="Turn the selected frequencies down by the chosen amount">
          Attenuate
        </ActionButton>
        <ActionButton variant="primary" disabled={!box || busy} onClick={() => repair("heal")} title="Replace the selection with a blend of the sound just before and after it">
          Heal
        </ActionButton>
        <button
          type="button"
          aria-label="Close spectral view"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={wrapRef} className="relative" style={{ height: HEIGHT }}>
        <canvas
          ref={canvasRef}
          className="block touch-none"
          style={{ width: width + AXIS, height: HEIGHT, cursor: usable ? "crosshair" : "default" }}
          role="img"
          aria-label="Spectrogram of the selected clip. Drag to select a time and frequency range."
          onPointerDown={(event) => {
            if (!usable || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = pointAt(event);
            setSelection(null);
          }}
          onPointerMove={(event) => {
            const anchor = dragRef.current;
            if (!anchor || !usable) return;
            const point = pointAt(event);
            setSelection({
              key: usable.id,
              box: {
                t0: Math.min(anchor.t, point.t),
                t1: Math.max(anchor.t, point.t),
                f0: Math.min(anchor.f, point.f),
                f1: Math.max(anchor.f, point.f)
              }
            });
          }}
          onPointerUp={() => {
            dragRef.current = null;
            // A click without a drag clears the selection.
            setSelection((current) =>
              current && current.box.t1 - current.box.t0 > 0.01 && current.box.f1 > current.box.f0 * 1.02 ? current : null
            );
          }}
        />
        {message ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">{message}</p>
        ) : null}
      </div>
    </section>
  );
}
