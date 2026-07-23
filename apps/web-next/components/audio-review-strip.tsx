"use client";

import { useMemo, useRef } from "react";

import type { Marker } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AudioReviewStripProps {
  figure?: Record<string, unknown>;
  duration: number;
  selectionStart: number;
  selectionEnd: number;
  scrubTime: number;
  markers: Marker[];
  onScrub: (time: number) => void;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

function finiteNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function severityTone(severity: string | undefined): string {
  const key = (severity ?? "info").toLowerCase();
  if (key === "high" || key === "critical" || key === "error") return "bg-red-400/85";
  if (key === "medium" || key === "warning") return "bg-amber-300/85";
  if (key === "low") return "bg-sky-300/85";
  return "bg-emerald-300/85";
}

export function AudioReviewStrip({
  figure,
  duration,
  selectionStart,
  selectionEnd,
  scrubTime,
  markers,
  onScrub,
  className,
}: AudioReviewStripProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const points = useMemo(() => {
    const data = Array.isArray(figure?.data) ? figure.data : [];
    const scatter = data.find((trace) => {
      if (!trace || typeof trace !== "object") return false;
      return (trace as Record<string, unknown>).type === "scatter";
    }) as Record<string, unknown> | undefined;
    if (!scatter) return [] as Point[];

    const xs = finiteNumberList(scatter.x);
    const ys = finiteNumberList(scatter.y);
    const count = Math.min(xs.length, ys.length);
    if (count < 2) return [] as Point[];

    const step = Math.max(1, Math.ceil(count / 900));
    const sampled: Point[] = [];
    let peak = 0;
    for (let index = 0; index < count; index += step) {
      const y = ys[index];
      peak = Math.max(peak, Math.abs(y));
      sampled.push({ x: xs[index], y });
    }
    if (sampled[sampled.length - 1]?.x !== xs[count - 1]) {
      sampled.push({ x: xs[count - 1], y: ys[count - 1] });
      peak = Math.max(peak, Math.abs(ys[count - 1]));
    }

    const safePeak = peak > 1e-6 ? peak : 1;
    return sampled.map((point) => ({ x: point.x, y: point.y / safePeak }));
  }, [figure]);

  const waveformBars = useMemo(() => {
    if (points.length < 2 || duration <= 0) return [] as Array<{ x: number; top: number; bottom: number }>;
    return points.map((point) => {
      const x = clamp01(point.x / duration) * 100;
      const amplitude = Math.min(0.92, Math.abs(point.y));
      const spread = 6 + amplitude * 36;
      return {
        x,
        top: 50 - spread,
        bottom: 50 + spread,
      };
    });
  }, [duration, points]);

  const selectionLeft = clamp01(selectionStart / Math.max(duration, 1)) * 100;
  const selectionWidth = clamp01((selectionEnd - selectionStart) / Math.max(duration, 1)) * 100;
  const playheadLeft = clamp01(scrubTime / Math.max(duration, 1)) * 100;

  const resolveTimeFromPointer = (clientX: number): number | null => {
    const surface = surfaceRef.current;
    if (!surface || duration <= 0) return null;
    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = clamp01((clientX - rect.left) / rect.width);
    return ratio * duration;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const nextTime = resolveTimeFromPointer(event.clientX);
    if (nextTime === null) return;
    activePointerIdRef.current = event.pointerId;
    dragStartRef.current = nextTime;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (dragStartRef.current === null) return;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    const nextTime = resolveTimeFromPointer(event.clientX);
    if (nextTime === null || dragStartRef.current === null) {
      activePointerIdRef.current = null;
      dragStartRef.current = null;
      return;
    }
    if (Math.abs(nextTime - dragStartRef.current) <= 0.25) {
      onScrub(nextTime);
    }
    activePointerIdRef.current = null;
    dragStartRef.current = null;
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    dragStartRef.current = null;
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Waveform Review Strip</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Click to scrub. Use the Start and End buttons below to mark the active review window.
          </p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p>Playhead {scrubTime.toFixed(2)}s</p>
          <p>Selection {selectionStart.toFixed(2)}s to {selectionEnd.toFixed(2)}s</p>
        </div>
      </div>

      <div
        ref={surfaceRef}
        className="relative h-24 overflow-hidden rounded-2xl border border-border/80 bg-[linear-gradient(180deg,rgba(7,13,24,0.98),rgba(15,24,40,0.94))] shadow-inner [touch-action:none]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/40" />
        <div className="pointer-events-none absolute inset-x-0 top-[22%] h-px bg-border/15" />
        <div className="pointer-events-none absolute inset-x-0 top-[78%] h-px bg-border/15" />
        <div
          className="pointer-events-none absolute inset-y-0 bg-primary/10 ring-1 ring-inset ring-primary/35"
          style={{ left: `${selectionLeft}%`, width: `${Math.max(selectionWidth, 0.35)}%` }}
        />

        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {waveformBars.map((bar, index) => (
            <line
              key={`${bar.x}-${index}`}
              x1={bar.x}
              x2={bar.x}
              y1={bar.top}
              y2={bar.bottom}
              stroke="rgba(82, 214, 190, 0.88)"
              strokeWidth="0.18"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {markers.slice(0, 80).map((marker, index) => {
          const left = clamp01(marker.start_seconds / Math.max(duration, 1)) * 100;
          const width = Math.max(clamp01((marker.end_seconds - marker.start_seconds) / Math.max(duration, 1)) * 100, 0.25);
          return (
            <div
              key={`${marker.type}-${marker.start_seconds}-${index}`}
              className={cn("pointer-events-none absolute bottom-0 h-[18%] opacity-80", severityTone(marker.severity))}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${marker.type} ${marker.start_seconds.toFixed(2)}s - ${marker.end_seconds.toFixed(2)}s`}
            />
          );
        })}

        <div className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ left: `${playheadLeft}%` }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-between px-2 text-[10px] text-muted-foreground/85">
          <span>0s</span>
          <span>{(duration / 2).toFixed(1)}s</span>
          <span>{duration.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}
