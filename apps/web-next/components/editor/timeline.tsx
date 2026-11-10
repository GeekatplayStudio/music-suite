"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import type { Peaks } from "@/lib/editor/peaks";
import { traceWaveform } from "@/lib/editor/peaks";
import {
  gridStep,
  removeMarker,
  setAutomation,
  setFade,
  splitAt,
  trimLeft,
  trimRight,
  updateClips,
  updateMarker
} from "@/lib/editor/store";
import {
  type Asset,
  type AutoPoint,
  type Clip,
  type FadeCurve,
  type LaneId,
  type ProjectState,
  type TimeRange,
  type Tool,
  type Track,
  AUTO_RANGE,
  clamp,
  dbToGain,
  effectiveClips,
  evalAuto,
  fadeShape,
  formatLaneValue,
  laneDefault,
  lanePoints
} from "@/lib/editor/types";

export const RULER_HEIGHT = 44;
/** Top strip of the ruler that carries sections and markers. */
const BAND = 14;
export const TRACK_HEIGHT = 104;
const EDGE_PX = 8;
const FADE_HANDLE_PX = 12;
const SNAP_PX = 9;
const CLIP_PAD = 4;
const LABEL_HEIGHT = 18;
const AUTO_POINT_PX = 8;
const AUTO_LINE_PX = 6;
const MARKER_ZONE = BAND;

const COLORS = {
  lane: "#0c1220",
  laneAlt: "#0f1627",
  laneSelected: "#131d33",
  gridMinor: "rgba(148, 163, 184, 0.07)",
  gridMajor: "rgba(148, 163, 184, 0.18)",
  ruler: "#0a0f1c",
  rulerText: "#aab6c8",
  playhead: "#ffffff",
  range: "rgba(250, 204, 21, 0.16)",
  rangeEdge: "#facc15",
  loop: "rgba(52, 211, 153, 0.85)",
  snap: "#facc15",
  selected: "#ffffff",
  marker: "#fb923c",
  automation: "#fde047"
};

type Lane = LaneId;

function laneBounds(index: number): { top: number; bottom: number } {
  return {
    top: index * TRACK_HEIGHT + CLIP_PAD + LABEL_HEIGHT + 3,
    bottom: (index + 1) * TRACK_HEIGHT - CLIP_PAD - 3
  };
}

function valueToY(lane: Lane, value: number, index: number): number {
  const { min, max } = AUTO_RANGE[lane];
  const { top, bottom } = laneBounds(index);
  return bottom - ((clamp(value, min, max) - min) / (max - min)) * (bottom - top);
}

function yToValue(lane: Lane, y: number, index: number, rest: number): number {
  const { min, max } = AUTO_RANGE[lane];
  const { top, bottom } = laneBounds(index);
  // The resting value (0 dB, centre, or the control's setting) is magnetic so it is easy to return to.
  if (Math.abs(y - valueToY(lane, rest, index)) <= 3) return rest;
  return clamp(min + ((bottom - y) / (bottom - top)) * (max - min), min, max);
}

/** Shade the part of a clip that a fade attenuates, following the fade's curve. */
function shadeFade(
  ctx: CanvasRenderingContext2D,
  curve: FadeCurve,
  edgeX: number,
  innerX: number,
  top: number,
  bottom: number
): void {
  const steps = 14;
  ctx.beginPath();
  ctx.moveTo(edgeX, top);
  ctx.lineTo(innerX, top);
  for (let i = steps - 1; i >= 0; i--) {
    const f = i / steps;
    ctx.lineTo(edgeX + (innerX - edgeX) * f, bottom - fadeShape(curve, f) * (bottom - top));
  }
  ctx.closePath();
  ctx.fill();
}

export interface TimelineProps {
  state: ProjectState;
  assets: Map<string, Asset>;
  getBuffer: (assetId: string) => AudioBuffer | undefined;
  getPeaks: (assetId: string) => Peaks | undefined;
  mediaVersion: number;
  selection: Set<string>;
  onSelect: (ids: Set<string>, trackId: string | null) => void;
  selectedTrackId: string | null;
  range: TimeRange | null;
  onRange: (range: TimeRange | null) => void;
  tool: Tool;
  pxPerSec: number;
  scrollSec: number;
  onView: (pxPerSec: number, scrollSec: number) => void;
  getPosition: () => number;
  playing: boolean;
  onSeek: (time: number) => void;
  onGestureStart: () => void;
  onTransient: (state: ProjectState) => void;
  onGestureEnd: () => void;
  onCommit: (state: ProjectState) => void;
  onContextMenu: (clientX: number, clientY: number, clipId: string | null, time: number) => void;
  onDropFiles: (files: File[], time: number, trackId: string | null) => void;
  onWidth: (width: number) => void;
  /** Height available for lanes, so the timeline fills the viewport. */
  minLanesHeight: number;
}

type Zone = "body" | "left" | "right" | "fadeIn" | "fadeOut";

type Drag =
  | { kind: "seek" }
  | { kind: "warp"; base: ProjectState; clip: Clip; index: number }
  | { kind: "marker"; base: ProjectState; id: string; time: number; moved: boolean }
  | { kind: "auto"; base: ProjectState; trackId: string; trackIndex: number; lane: Lane; points: AutoPoint[]; index: number; rest: number }
  | { kind: "loop"; anchor: number; moved: boolean }
  | { kind: "range"; anchor: number }
  | {
      kind: "move";
      base: ProjectState;
      ids: Set<string>;
      primary: Clip;
      anchorTime: number;
      anchorTrack: number;
      moved: boolean;
      deselectOnClick: boolean;
    }
  | { kind: "trim"; base: ProjectState; clip: Clip; edge: "left" | "right" }
  | { kind: "fade"; base: ProjectState; clip: Clip; edge: "in" | "out" };

function hexToRgba(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function rulerLabel(state: ProjectState, time: number, step: number): string {
  if (state.rulerMode === "bars") {
    const beats = (time * state.bpm) / 60;
    const bar = Math.floor(beats / state.beatsPerBar + 1e-6) + 1;
    const beat = Math.floor((beats % state.beatsPerBar) + 1e-6) + 1;
    return beat === 1 ? `${bar}` : `${bar}.${beat}`;
  }
  const minutes = Math.floor(time / 60);
  const seconds = time - minutes * 60;
  if (step >= 1) return `${minutes}:${Math.round(seconds).toString().padStart(2, "0")}`;
  const digits = step >= 0.1 ? 1 : 2;
  return `${minutes}:${seconds.toFixed(digits).padStart(digits + 3, "0")}`;
}

export function Timeline(props: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLCanvasElement | null>(null);
  const contentRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 800, dpr: 1 });
  const dragRef = useRef<Drag | null>(null);
  const snapLineRef = useRef<number | null>(null);
  const autoLabelRef = useRef<{ x: number; y: number; text: string } | null>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  const lanesHeight = Math.max(props.state.tracks.length * TRACK_HEIGHT + 96, props.minLanesHeight);

  const timeToX = (time: number, p = propsRef.current) => (time - p.scrollSec) * p.pxPerSec;
  const xToTime = (x: number, p = propsRef.current) => Math.max(0, p.scrollSec + x / p.pxPerSec);

  /* ---------- Drawing ---------- */

  const drawRuler = useCallback(() => {
    const canvas = rulerRef.current;
    if (!canvas) return;
    const p = propsRef.current;
    const { width, dpr } = sizeRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.ruler;
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    const { loop } = p.state;
    if (loop.end > loop.start) {
      const x0 = timeToX(loop.start, p);
      const x1 = timeToX(loop.end, p);
      ctx.fillStyle = loop.enabled ? COLORS.loop : "rgba(148, 163, 184, 0.35)";
      ctx.fillRect(x0, BAND, Math.max(2, x1 - x0), 4);
    }

    const minor = gridStep(p.state, p.pxPerSec, 14);
    const major = gridStep(p.state, p.pxPerSec, 76);
    const first = Math.floor(p.scrollSec / minor) * minor;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "middle";
    for (let t = first; timeToX(t, p) < width; t += minor) {
      const x = Math.round(timeToX(t, p)) + 0.5;
      if (x < -1) continue;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? "rgba(170, 182, 200, 0.7)" : "rgba(170, 182, 200, 0.3)";
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? BAND + 14 : BAND + 22);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = COLORS.rulerText;
        ctx.fillText(rulerLabel(p.state, Math.max(0, t), major), x + 4, BAND + 12);
      }
    }
    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(width, RULER_HEIGHT - 0.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(2, 6, 23, 0.9)";
    ctx.fillRect(0, 0, width, BAND);
    ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
    for (const region of p.state.regions) {
      const rx0 = timeToX(region.start, p);
      const rx1 = timeToX(region.end, p);
      if (rx1 < 0 || rx0 > width) continue;
      ctx.fillStyle = hexToRgba(region.color, 0.38);
      ctx.fillRect(rx0, 0, rx1 - rx0, BAND - 1);
      ctx.fillStyle = region.color;
      ctx.fillRect(rx0, 0, 2, BAND - 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx0, 0, rx1 - rx0, BAND);
      ctx.clip();
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(region.name, Math.max(rx0, 0) + 6, 6.5);
      ctx.restore();
    }
    for (const marker of p.state.markers) {
      const mx = Math.round(timeToX(marker.time, p));
      if (mx < -80 || mx > width) continue;
      ctx.fillStyle = COLORS.marker;
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx + 8, 0);
      ctx.lineTo(mx + 8, 7);
      ctx.lineTo(mx, MARKER_ZONE);
      ctx.closePath();
      ctx.fill();
      // A solid plate keeps the name readable where it crosses the ruler's time labels.
      const plate = ctx.measureText(marker.name).width + 6;
      ctx.fillStyle = COLORS.ruler;
      ctx.fillRect(mx + 9, 0, plate, 13);
      ctx.fillStyle = COLORS.marker;
      ctx.fillText(marker.name, mx + 12, 6.5);
    }

    const px = timeToX(p.getPosition(), p);
    if (px >= -8 && px <= width + 8) {
      ctx.fillStyle = COLORS.playhead;
      ctx.beginPath();
      ctx.moveTo(px - 6, RULER_HEIGHT - 12);
      ctx.lineTo(px + 6, RULER_HEIGHT - 12);
      ctx.lineTo(px, RULER_HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
  }, []);

  const drawContent = useCallback(() => {
    const canvas = contentRef.current;
    if (!canvas) return;
    const p = propsRef.current;
    const { width, dpr } = sizeRef.current;
    const height = canvas.height / dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { tracks, clips } = p.state;
    tracks.forEach((track, index) => {
      const y = index * TRACK_HEIGHT;
      ctx.fillStyle =
        track.id === p.selectedTrackId ? COLORS.laneSelected : index % 2 ? COLORS.laneAlt : COLORS.lane;
      ctx.fillRect(0, y, width, TRACK_HEIGHT);
      ctx.fillStyle = "rgba(148, 163, 184, 0.14)";
      ctx.fillRect(0, y + TRACK_HEIGHT - 1, width, 1);
    });

    const minor = gridStep(p.state, p.pxPerSec, 14);
    const major = gridStep(p.state, p.pxPerSec, 76);
    const first = Math.floor(p.scrollSec / minor) * minor;
    const gridBottom = tracks.length * TRACK_HEIGHT;
    for (let t = first; timeToX(t, p) < width; t += minor) {
      const x = Math.round(timeToX(t, p));
      if (x < 0) continue;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      ctx.fillStyle = isMajor ? COLORS.gridMajor : COLORS.gridMinor;
      ctx.fillRect(x, 0, 1, gridBottom);
    }

    const trackIndex = new Map(tracks.map((t, i) => [t.id, i]));
    const anySolo = tracks.some((t) => t.solo);
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";

    const audible = effectiveClips(p.state);
    for (let c = 0; c < clips.length; c++) {
      const clip = clips[c];
      const shaped = audible[c] ?? clip;
      const index = trackIndex.get(clip.trackId);
      if (index === undefined) continue;
      const track = tracks[index];
      const x0 = timeToX(clip.start, p);
      const x1 = timeToX(clip.start + clip.duration, p);
      if (x1 < 0 || x0 > width) continue;
      const y = index * TRACK_HEIGHT + CLIP_PAD;
      const h = TRACK_HEIGHT - CLIP_PAD * 2;
      const w = Math.max(2, x1 - x0);
      const silent = clip.muted || track.mute || (anySolo && !track.solo);
      const selected = p.selection.has(clip.id);
      // 0.65 keeps a muted waveform at 3:1 against its clip (WCAG 1.4.11).
      const alpha = silent ? 0.65 : 1;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x0, y, w, h, 5);
      ctx.clip();
      ctx.fillStyle = hexToRgba(track.color, 0.16 * alpha + (selected ? 0.1 : 0));
      ctx.fillRect(x0, y, w, h);
      ctx.fillStyle = hexToRgba(track.color, 0.34 * alpha);
      ctx.fillRect(x0, y, w, LABEL_HEIGHT);

      const peaks = clip.notes ? undefined : p.getPeaks(clip.assetId);
      const vis0 = Math.max(0, Math.floor(x0));
      const vis1 = Math.min(width, Math.ceil(x1));
      const waveTop = y + LABEL_HEIGHT;
      const waveH = h - LABEL_HEIGHT;
      if (peaks && vis1 > vis0) {
        const localA = (vis0 - x0) / p.pxPerSec;
        const localB = (vis1 - x0) / p.pxPerSec;
        const a = clip.reversed ? clip.offset + clip.duration - localB : clip.offset + localA;
        const b = clip.reversed ? clip.offset + clip.duration - localA : clip.offset + localB;
        ctx.fillStyle = hexToRgba(track.color, 0.95 * alpha);
        traceWaveform(
          ctx,
          peaks,
          p.getBuffer(clip.assetId),
          vis0,
          vis1,
          a,
          b,
          waveTop + waveH / 2,
          waveH / 2 - 2,
          dbToGain(clip.gainDb),
          clip.reversed
        );
      } else if (clip.notes) {
        // MIDI clips show their notes as a miniature piano roll.
        const inside = clip.notes.filter((note) => note.t >= clip.offset - 1e-6 && note.t < clip.offset + clip.duration);
        if (inside.length) {
          let lowest = 127;
          let highest = 0;
          for (const note of inside) {
            if (note.p < lowest) lowest = note.p;
            if (note.p > highest) highest = note.p;
          }
          const span = Math.max(12, highest - lowest + 1);
          const rowH = Math.max(2, Math.min(6, (waveH - 6) / span));
          ctx.fillStyle = hexToRgba(track.color, 0.95 * alpha);
          for (const note of inside) {
            const nx = x0 + (note.t - clip.offset) * p.pxPerSec;
            const nw = Math.max(1.5, Math.min(note.d, clip.offset + clip.duration - note.t) * p.pxPerSec - 0.5);
            const ny = waveTop + 3 + (1 - (note.p - lowest + 0.5) / span) * (waveH - 6) - rowH / 2;
            ctx.fillRect(nx, ny, nw, rowH);
          }
        } else {
          ctx.fillStyle = hexToRgba(track.color, 0.6);
          ctx.fillText("Empty MIDI clip — press P to add notes", Math.max(x0, 0) + 8, waveTop + waveH / 2);
        }
      } else if (!peaks) {
        ctx.fillStyle = hexToRgba(track.color, 0.5);
        ctx.fillText("Loading audio…", Math.max(x0, 0) + 8, waveTop + waveH / 2);
      }

      // Fades are drawn as the attenuated corner so the shape reads as "less signal here".
      ctx.fillStyle = "rgba(4, 8, 16, 0.6)";
      if (shaped.fadeIn > 0) {
        shadeFade(ctx, shaped.fadeInCurve, x0, x0 + shaped.fadeIn * p.pxPerSec, waveTop, y + h);
      }
      if (shaped.fadeOut > 0) {
        shadeFade(ctx, shaped.fadeOutCurve, x1, x1 - shaped.fadeOut * p.pxPerSec, waveTop, y + h);
      }

      for (const marker of clip.warp ?? []) {
        // Where the moment is now (solid) and where it will land once applied (dashed).
        const from = Math.round(x0 + marker.s * p.pxPerSec);
        const to = Math.round(x0 + marker.t * p.pxPerSec);
        ctx.fillStyle = "#fb923c";
        ctx.fillRect(from, waveTop, 2, waveH);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(to + 0.5, waveTop);
        ctx.lineTo(to + 0.5, y + h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = silent ? "rgba(226, 232, 240, 0.6)" : "#f1f5f9";
      const label = `${clip.reversed ? "◀ " : ""}${clip.name}${clip.muted ? " (muted)" : ""}`;
      ctx.fillText(label, Math.max(x0, 0) + 8, y + LABEL_HEIGHT / 2 + 0.5);
      ctx.restore();

      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeStyle = selected ? COLORS.selected : hexToRgba(track.color, 0.75 * alpha);
      ctx.beginPath();
      ctx.roundRect(x0 + 0.5, y + 0.5, w - 1, h - 1, 5);
      ctx.stroke();

      if (selected && w > 40) {
        ctx.fillStyle = COLORS.selected;
        const inX = x0 + clip.fadeIn * p.pxPerSec;
        const outX = x1 - clip.fadeOut * p.pxPerSec;
        ctx.fillRect(inX - 1, waveTop, FADE_HANDLE_PX - 2, FADE_HANDLE_PX - 2);
        ctx.fillRect(outX - FADE_HANDLE_PX + 3, waveTop, FADE_HANDLE_PX - 2, FADE_HANDLE_PX - 2);
      }
    }

    if (p.range && p.range.end > p.range.start) {
      const rx0 = timeToX(p.range.start, p);
      const rx1 = timeToX(p.range.end, p);
      ctx.fillStyle = COLORS.range;
      ctx.fillRect(rx0, 0, rx1 - rx0, Math.max(gridBottom, height));
      ctx.fillStyle = COLORS.rangeEdge;
      ctx.fillRect(Math.round(rx0), 0, 1, Math.max(gridBottom, height));
      ctx.fillRect(Math.round(rx1), 0, 1, Math.max(gridBottom, height));
    }

    for (const region of p.state.regions) {
      ctx.fillStyle = hexToRgba(region.color, 0.4);
      for (const edge of [region.start, region.end]) {
        const ex = Math.round(timeToX(edge, p));
        if (ex >= 0 && ex <= width) ctx.fillRect(ex, 0, 1, Math.max(gridBottom, height));
      }
    }
    ctx.fillStyle = "rgba(251, 146, 60, 0.55)";
    for (const marker of p.state.markers) {
      const mx = Math.round(timeToX(marker.time, p));
      if (mx >= 0 && mx <= width) ctx.fillRect(mx, 0, 1, Math.max(gridBottom, height));
    }

    const lane = p.state.automationView;
    if (lane !== "off") {
      const t0 = p.scrollSec;
      const t1 = p.scrollSec + width / p.pxPerSec;
      tracks.forEach((track, index) => {
        const points = lanePoints(track, lane);
        const path = new Path2D();
        const startValue = evalAuto(points, t0) ?? laneDefault(track, lane);
        path.moveTo(0, valueToY(lane, startValue, index));
        for (const point of points) {
          if (point.t <= t0 || point.t >= t1) continue;
          path.lineTo(timeToX(point.t, p), valueToY(lane, point.v, index));
        }
        path.lineTo(width, valueToY(lane, evalAuto(points, t1) ?? laneDefault(track, lane), index));
        // Dark underlay first so the line stays readable over any waveform colour.
        ctx.setLineDash(points.length ? [] : [5, 4]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(4, 8, 16, 0.85)";
        ctx.stroke(path);
        ctx.lineWidth = 1.75;
        ctx.strokeStyle = COLORS.automation;
        ctx.stroke(path);
        ctx.setLineDash([]);
        for (const point of points) {
          const px = timeToX(point.t, p);
          if (px < -6 || px > width + 6) continue;
          const py = valueToY(lane, point.v, index);
          ctx.beginPath();
          ctx.arc(px, py, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = COLORS.automation;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#0b1220";
          ctx.stroke();
        }
      });
    }
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const p = propsRef.current;
    const { width, dpr } = sizeRef.current;
    const height = canvas.height / dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const snap = snapLineRef.current;
    if (snap !== null) {
      ctx.fillStyle = COLORS.snap;
      ctx.fillRect(Math.round(timeToX(snap, p)), 0, 1, height);
    }
    const label = autoLabelRef.current;
    if (label) {
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      const w = ctx.measureText(label.text).width + 10;
      const lx = clamp(label.x + 10, 2, width - w - 2);
      const ly = Math.max(2, label.y - 24);
      ctx.fillStyle = "#020617";
      ctx.fillRect(lx, ly, w, 18);
      ctx.fillStyle = COLORS.automation;
      ctx.textBaseline = "middle";
      ctx.fillText(label.text, lx + 5, ly + 9.5);
    }
    const px = Math.round(timeToX(p.getPosition(), p));
    if (px >= 0 && px <= width) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(px - 1, 0, 3, height);
      ctx.fillStyle = COLORS.playhead;
      ctx.fillRect(px, 0, 1, height);
    }
  }, []);

  /* ---------- Sizing ---------- */

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const resize = () => {
      const width = Math.max(200, Math.floor(wrap.clientWidth));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width, dpr };
      const sizes: [HTMLCanvasElement | null, number][] = [
        [rulerRef.current, RULER_HEIGHT],
        [contentRef.current, lanesHeight],
        [overlayRef.current, lanesHeight]
      ];
      for (const [canvas, h] of sizes) {
        if (!canvas) continue;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${h}px`;
      }
      propsRef.current.onWidth(width);
      drawRuler();
      drawContent();
      drawOverlay();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [lanesHeight, drawRuler, drawContent, drawOverlay]);

  useEffect(() => {
    drawRuler();
    drawContent();
    drawOverlay();
  });

  /* ---------- Playhead animation ---------- */

  useEffect(() => {
    if (!props.playing) return;
    let frame = 0;
    const loop = () => {
      const p = propsRef.current;
      const x = timeToX(p.getPosition(), p);
      const { width } = sizeRef.current;
      if (!dragRef.current && (x > width - 24 || x < 0)) {
        p.onView(p.pxPerSec, Math.max(0, p.getPosition() - (width * 0.1) / p.pxPerSec));
      } else {
        drawRuler();
        drawOverlay();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [props.playing, drawRuler, drawOverlay]);

  /* ---------- Wheel: zoom and horizontal scroll ---------- */

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (event: WheelEvent) => {
      const p = propsRef.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const anchor = p.scrollSec + x / p.pxPerSec;
        const next = clamp(p.pxPerSec * Math.exp(-event.deltaY * 0.0045), 2, 6000);
        p.onView(next, Math.max(0, anchor - x / next));
      } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        p.onView(p.pxPerSec, Math.max(0, p.scrollSec + delta / p.pxPerSec));
      }
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, []);

  /* ---------- Hit testing and snapping ---------- */

  const hitClip = (x: number, y: number): { clip: Clip; zone: Zone } | null => {
    const p = propsRef.current;
    const index = Math.floor(y / TRACK_HEIGHT);
    const track = p.state.tracks[index];
    if (!track) return null;
    const localY = y - index * TRACK_HEIGHT;
    if (localY < CLIP_PAD || localY > TRACK_HEIGHT - CLIP_PAD) return null;
    for (let i = p.state.clips.length - 1; i >= 0; i--) {
      const clip = p.state.clips[i];
      if (clip.trackId !== track.id) continue;
      const x0 = timeToX(clip.start, p);
      const x1 = timeToX(clip.start + clip.duration, p);
      if (x < x0 - 2 || x > x1 + 2) continue;
      const w = x1 - x0;
      if (p.tool === "select" && p.selection.has(clip.id) && w > 40) {
        const handleTop = CLIP_PAD + LABEL_HEIGHT;
        if (localY >= handleTop - 2 && localY <= handleTop + FADE_HANDLE_PX + 2) {
          const inX = x0 + clip.fadeIn * p.pxPerSec;
          const outX = x1 - clip.fadeOut * p.pxPerSec;
          if (Math.abs(x - (inX + 4)) <= FADE_HANDLE_PX) return { clip, zone: "fadeIn" };
          if (Math.abs(x - (outX - 4)) <= FADE_HANDLE_PX) return { clip, zone: "fadeOut" };
        }
      }
      const edge = Math.min(EDGE_PX, w / 3);
      if (p.tool === "select" && x - x0 <= edge) return { clip, zone: "left" };
      if (p.tool === "select" && x1 - x <= edge) return { clip, zone: "right" };
      return { clip, zone: "body" };
    }
    return null;
  };

  const snapTime = (time: number, exclude: Set<string> | null, bypass: boolean): number => {
    const p = propsRef.current;
    snapLineRef.current = null;
    if (bypass || !p.state.snap) return Math.max(0, time);
    const tolerance = SNAP_PX / p.pxPerSec;
    let best = time;
    let bestDistance = tolerance;
    let hard = false;
    const consider = (candidate: number, isHard: boolean) => {
      const distance = Math.abs(candidate - time);
      // Edges and the playhead win ties against the grid.
      if (distance < bestDistance || (isHard && !hard && distance <= bestDistance)) {
        best = candidate;
        bestDistance = distance;
        hard = isHard;
      }
    };
    const step = gridStep(p.state, p.pxPerSec, 14);
    consider(Math.round(time / step) * step, false);
    consider(p.getPosition(), true);
    consider(0, true);
    for (const marker of p.state.markers) consider(marker.time, true);
    for (const region of p.state.regions) {
      consider(region.start, true);
      consider(region.end, true);
    }
    for (const clip of p.state.clips) {
      if (exclude?.has(clip.id)) continue;
      consider(clip.start, true);
      consider(clip.start + clip.duration, true);
    }
    if (best !== time && hard) snapLineRef.current = best;
    return Math.max(0, best);
  };

  const hitAutomation = (
    x: number,
    y: number
  ): { track: Track; trackIndex: number; lane: Lane; index: number; onLine: boolean } | null => {
    const p = propsRef.current;
    const lane = p.state.automationView;
    if (lane === "off" || p.tool !== "select") return null;
    const trackIndex = Math.floor(y / TRACK_HEIGHT);
    const track = p.state.tracks[trackIndex];
    if (!track) return null;
    const points = lanePoints(track, lane);
    for (let i = 0; i < points.length; i++) {
      const dx = timeToX(points[i].t, p) - x;
      const dy = valueToY(lane, points[i].v, trackIndex) - y;
      if (dx * dx + dy * dy <= AUTO_POINT_PX * AUTO_POINT_PX) {
        return { track, trackIndex, lane, index: i, onLine: false };
      }
    }
    const value = evalAuto(points, xToTime(x)) ?? laneDefault(track, lane);
    if (Math.abs(valueToY(lane, value, trackIndex) - y) <= AUTO_LINE_PX) {
      return { track, trackIndex, lane, index: -1, onLine: true };
    }
    return null;
  };

  /** A pending warp marker's target line on a selected clip. */
  const hitWarp = (x: number, y: number): { clip: Clip; index: number } | null => {
    const p = propsRef.current;
    if (p.tool !== "select") return null;
    const track = p.state.tracks[Math.floor(y / TRACK_HEIGHT)];
    if (!track) return null;
    for (const clip of p.state.clips) {
      if (clip.trackId !== track.id || !clip.warp?.length || !p.selection.has(clip.id)) continue;
      for (let i = 0; i < clip.warp.length; i++) {
        if (Math.abs(timeToX(clip.start + clip.warp[i].t, p) - x) <= 5) return { clip, index: i };
      }
    }
    return null;
  };

  const hitMarker = (x: number, y: number): string | null => {
    if (y > MARKER_ZONE) return null;
    const p = propsRef.current;
    for (const marker of p.state.markers) {
      const mx = timeToX(marker.time, p);
      if (x >= mx - 3 && x <= mx + 12) return marker.id;
    }
    return null;
  };

  const cursorFor = (zone: Zone | null): string => {
    const tool = propsRef.current.tool;
    if (tool === "razor") return zone ? "crosshair" : "default";
    if (tool === "range") return "text";
    if (zone === "left" || zone === "right") return "ew-resize";
    if (zone === "fadeIn" || zone === "fadeOut") return "pointer";
    if (zone === "body") return "grab";
    return "default";
  };

  /* ---------- Pointer handling ---------- */

  const localPoint = (event: React.PointerEvent | React.MouseEvent | React.DragEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onRulerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const markerId = hitMarker(event.clientX - rect.left, event.clientY - rect.top);
    if (markerId) {
      const p = propsRef.current;
      if (event.altKey) {
        p.onCommit(removeMarker(p.state, markerId));
        return;
      }
      const marker = p.state.markers.find((m) => m.id === markerId);
      if (marker) dragRef.current = { kind: "marker", base: p.state, id: markerId, time: marker.time, moved: false };
      return;
    }
    if (event.clientY - rect.top <= BAND) {
      const p = propsRef.current;
      const at = xToTime(event.clientX - rect.left);
      const region = p.state.regions.find((r) => at >= r.start && at <= r.end);
      if (region) {
        // Clicking a section highlights it, ready to loop, export, delete or repeat.
        p.onRange({ start: region.start, end: region.end });
        p.onSeek(region.start);
        return;
      }
    }
    const time = snapTime(xToTime(event.clientX - rect.left), null, event.altKey);
    snapLineRef.current = null;
    if (event.shiftKey) {
      dragRef.current = { kind: "loop", anchor: time, moved: false };
    } else {
      dragRef.current = { kind: "seek" };
      propsRef.current.onSeek(time);
    }
  };

  const onRulerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = propsRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = snapTime(xToTime(event.clientX - rect.left), null, event.altKey);
    snapLineRef.current = null;
    if (drag.kind === "marker") {
      if (!drag.moved) {
        if (Math.abs(time - drag.time) * p.pxPerSec < 3) return;
        drag.moved = true;
        p.onGestureStart();
      }
      p.onTransient(updateMarker(drag.base, drag.id, { time }));
    } else if (drag.kind === "seek") {
      p.onSeek(time);
    } else if (drag.kind === "loop") {
      if (!drag.moved) {
        drag.moved = true;
        p.onGestureStart();
      }
      p.onTransient({
        ...p.state,
        loop: { enabled: true, start: Math.min(drag.anchor, time), end: Math.max(drag.anchor, time) }
      });
    }
  };

  const onRulerUp = () => {
    const drag = dragRef.current;
    if (drag?.kind === "loop" && drag.moved) propsRef.current.onGestureEnd();
    if (drag?.kind === "marker") {
      if (drag.moved) propsRef.current.onGestureEnd();
      else propsRef.current.onSeek(drag.time);
    }
    dragRef.current = null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const p = propsRef.current;
    const { x, y } = localPoint(event);
    const time = xToTime(x);
    const hit = hitClip(x, y);
    const trackAtY = p.state.tracks[Math.floor(y / TRACK_HEIGHT)] ?? null;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (p.tool === "razor") {
      if (hit) {
        const at = snapTime(time, new Set([hit.clip.id]), event.altKey);
        snapLineRef.current = null;
        const result = splitAt(p.state, at, new Set([hit.clip.id]));
        if (result.created.length) p.onCommit(result.state);
      }
      return;
    }

    if (p.tool === "range") {
      const anchor = snapTime(time, null, event.altKey);
      dragRef.current = { kind: "range", anchor };
      p.onRange(null);
      p.onSelect(new Set(), trackAtY?.id ?? null);
      return;
    }

    const warp = hitWarp(x, y);
    if (warp) {
      p.onGestureStart();
      dragRef.current = { kind: "warp", base: p.state, clip: warp.clip, index: warp.index };
      return;
    }
    if (event.altKey && hit && hit.zone === "body" && p.selection.has(hit.clip.id) && !hit.clip.notes && !hit.clip.reversed) {
      // Alt-click on a selected clip pins that moment as a warp marker.
      const local = time - hit.clip.start;
      if (local > 0.1 && local < hit.clip.duration - 0.1) {
        const next = [...(hit.clip.warp ?? []), { s: local, t: local }].sort((a, b) => a.s - b.s);
        p.onCommit(updateClips(p.state, [hit.clip.id], (c) => ({ ...c, warp: next })));
      }
      return;
    }

    const auto = hitAutomation(x, y);
    if (auto) {
      let points = lanePoints(auto.track, auto.lane).slice();
      let index = auto.index;
      if (auto.onLine) {
        const point = { t: snapTime(time, null, event.altKey), v: yToValue(auto.lane, y, auto.trackIndex, laneDefault(auto.track, auto.lane)) };
        snapLineRef.current = null;
        index = points.findIndex((existing) => existing.t > point.t);
        if (index < 0) index = points.length;
        points = [...points.slice(0, index), point, ...points.slice(index)];
      }
      p.onSelect(new Set(), auto.track.id);
      p.onGestureStart();
      if (auto.onLine) p.onTransient(setAutomation(p.state, auto.track.id, auto.lane, points));
      dragRef.current = {
        kind: "auto",
        base: p.state,
        trackId: auto.track.id,
        trackIndex: auto.trackIndex,
        lane: auto.lane,
        points,
        index,
        rest: laneDefault(auto.track, auto.lane)
      };
      autoLabelRef.current = { x, y, text: formatLaneValue(auto.lane, points[index].v) };
      return;
    }

    if (!hit) {
      p.onSelect(new Set(), trackAtY?.id ?? null);
      p.onRange(null);
      p.onSeek(snapTime(time, null, event.altKey));
      snapLineRef.current = null;
      dragRef.current = { kind: "seek" };
      return;
    }

    const { clip, zone } = hit;
    if (zone === "left" || zone === "right") {
      p.onSelect(new Set([clip.id]), clip.trackId);
      p.onGestureStart();
      dragRef.current = { kind: "trim", base: p.state, clip, edge: zone };
      return;
    }
    if (zone === "fadeIn" || zone === "fadeOut") {
      p.onGestureStart();
      dragRef.current = { kind: "fade", base: p.state, clip, edge: zone === "fadeIn" ? "in" : "out" };
      return;
    }

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    let ids = p.selection;
    let deselectOnClick = false;
    if (additive) {
      ids = new Set(p.selection);
      if (ids.has(clip.id)) deselectOnClick = true;
      else ids.add(clip.id);
    } else if (!p.selection.has(clip.id)) {
      ids = new Set([clip.id]);
    }
    p.onSelect(ids, clip.trackId);
    p.onGestureStart();
    dragRef.current = {
      kind: "move",
      base: p.state,
      ids,
      primary: clip,
      anchorTime: time,
      anchorTrack: Math.floor(y / TRACK_HEIGHT),
      moved: false,
      deselectOnClick
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    const { x, y } = localPoint(event);
    const drag = dragRef.current;
    const canvas = event.currentTarget;

    if (!drag) {
      if (hitWarp(x, y)) {
        canvas.style.cursor = "col-resize";
        return;
      }
      const auto = hitAutomation(x, y);
      if (auto) {
        canvas.style.cursor = auto.onLine ? "copy" : "move";
        return;
      }
      const hit = hitClip(x, y);
      canvas.style.cursor = cursorFor(hit?.zone ?? null);
      return;
    }

    const time = xToTime(x);
    if (drag.kind === "seek") {
      p.onSeek(snapTime(time, null, event.altKey));
      snapLineRef.current = null;
      return;
    }
    if (drag.kind === "range") {
      const at = snapTime(time, null, event.altKey);
      p.onRange({ start: Math.min(drag.anchor, at), end: Math.max(drag.anchor, at) });
      drawOverlay();
      return;
    }
    if (drag.kind === "warp") {
      const markers = drag.clip.warp ?? [];
      // A target may not cross its neighbours' targets, which would fold time back on itself.
      const lower = (markers[drag.index - 1]?.t ?? 0) + 0.05;
      const upper = (markers[drag.index + 1]?.t ?? Number.POSITIVE_INFINITY) - 0.05;
      const t = clamp(snapTime(time, new Set([drag.clip.id]), event.altKey) - drag.clip.start, lower, upper);
      p.onTransient(
        updateClips(drag.base, [drag.clip.id], (c) => ({
          ...c,
          warp: (c.warp ?? []).map((marker, i) => (i === drag.index ? { ...marker, t } : marker))
        }))
      );
      return;
    }
    if (drag.kind === "auto") {
      const before = drag.points[drag.index - 1]?.t ?? 0;
      const after = drag.points[drag.index + 1]?.t ?? Number.POSITIVE_INFINITY;
      const t = clamp(snapTime(time, null, event.altKey), before, after);
      const v = yToValue(drag.lane, y, drag.trackIndex, drag.rest);
      const points = drag.points.map((point, i) => (i === drag.index ? { t, v } : point));
      autoLabelRef.current = { x: timeToX(t), y: valueToY(drag.lane, v, drag.trackIndex), text: formatLaneValue(drag.lane, v) };
      p.onTransient(setAutomation(drag.base, drag.trackId, drag.lane, points));
      return;
    }
    if (drag.kind === "trim") {
      // A MIDI clip has no audio behind it, so it can be extended freely.
      const duration = drag.clip.notes
        ? 3600
        : (p.assets.get(drag.clip.assetId)?.duration_seconds ?? drag.clip.offset + drag.clip.duration);
      const at = snapTime(time, new Set([drag.clip.id]), event.altKey);
      const next =
        drag.edge === "left" ? trimLeft(drag.clip, at, duration) : trimRight(drag.clip, at, duration);
      p.onTransient(updateClips(drag.base, [drag.clip.id], () => next));
      return;
    }
    if (drag.kind === "fade") {
      const local = time - drag.clip.start;
      const seconds = drag.edge === "in" ? local : drag.clip.duration - local;
      p.onTransient(updateClips(drag.base, [drag.clip.id], (c) => setFade(c, drag.edge, seconds)));
      return;
    }
    if (drag.kind === "move") {
      const deltaPx = Math.abs((time - drag.anchorTime) * p.pxPerSec);
      const trackNow = clamp(Math.floor(y / TRACK_HEIGHT), 0, p.state.tracks.length - 1);
      if (!drag.moved && deltaPx < 3 && trackNow === drag.anchorTrack) return;
      drag.moved = true;
      canvas.style.cursor = "grabbing";

      const moving = drag.base.clips.filter((c) => drag.ids.has(c.id));
      const proposed = drag.primary.start + (time - drag.anchorTime);
      let start = snapTime(proposed, drag.ids, event.altKey);
      if (snapLineRef.current === null && !event.altKey && p.state.snap) {
        // Nothing caught the left edge, so let the right edge try.
        const end = snapTime(proposed + drag.primary.duration, drag.ids, false);
        if (snapLineRef.current !== null) start = end - drag.primary.duration;
        else start = snapTime(proposed, drag.ids, false);
      }
      const earliest = Math.min(...moving.map((c) => c.start));
      const delta = Math.max(start - drag.primary.start, -earliest);

      const order = new Map(drag.base.tracks.map((t, i) => [t.id, i]));
      const indices = moving.map((c) => order.get(c.trackId) ?? 0);
      const shift = clamp(
        trackNow - drag.anchorTrack,
        -Math.min(...indices),
        drag.base.tracks.length - 1 - Math.max(...indices)
      );
      p.onTransient(
        updateClips(drag.base, drag.ids, (c) => ({
          ...c,
          start: Math.max(0, c.start + delta),
          trackId: drag.base.tracks[(order.get(c.trackId) ?? 0) + shift].id
        }))
      );
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    snapLineRef.current = null;
    autoLabelRef.current = null;
    if (!drag) return;
    if (drag.kind === "auto" || drag.kind === "warp") {
      p.onGestureEnd();
    } else if (drag.kind === "move") {
      p.onGestureEnd();
      if (!drag.moved && drag.deselectOnClick) {
        const ids = new Set(drag.ids);
        ids.delete(drag.primary.id);
        p.onSelect(ids, drag.primary.trackId);
      }
    } else if (drag.kind === "trim" || drag.kind === "fade") {
      p.onGestureEnd();
    } else if (drag.kind === "range") {
      if (p.range && p.range.end - p.range.start < 2 / p.pxPerSec) p.onRange(null);
    }
    const { x, y } = localPoint(event);
    event.currentTarget.style.cursor = cursorFor(hitClip(x, y)?.zone ?? null);
    drawOverlay();
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    const { x, y } = localPoint(event);
    const auto = hitAutomation(x, y);
    if (auto) {
      // The first click of the pair may have added a point under the cursor; remove whichever is there.
      const points = lanePoints(auto.track, auto.lane);
      const near = points.findIndex(
        (point) => Math.abs(timeToX(point.t, p) - x) <= AUTO_POINT_PX && Math.abs(valueToY(auto.lane, point.v, auto.trackIndex) - y) <= AUTO_POINT_PX
      );
      if (near >= 0) p.onCommit(setAutomation(p.state, auto.track.id, auto.lane, points.filter((_, i) => i !== near)));
      return;
    }
    const hit = hitClip(x, y);
    if (hit && p.tool === "select") {
      p.onRange({ start: hit.clip.start, end: hit.clip.start + hit.clip.duration });
    }
  };

  const onContext = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const p = propsRef.current;
    const { x, y } = localPoint(event);
    const hit = hitClip(x, y);
    if (hit && !p.selection.has(hit.clip.id)) p.onSelect(new Set([hit.clip.id]), hit.clip.trackId);
    p.onContextMenu(event.clientX, event.clientY, hit?.clip.id ?? null, xToTime(x));
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    const p = propsRef.current;
    const { x, y } = localPoint(event);
    const track = y >= 0 ? (p.state.tracks[Math.floor(y / TRACK_HEIGHT)] ?? null) : null;
    p.onDropFiles(files, snapTime(xToTime(x), null, false), track?.id ?? null);
    snapLineRef.current = null;
  };

  return (
    <div
      ref={wrapRef}
      className="relative min-w-0 flex-1 select-none"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <canvas
        ref={rulerRef}
        className="sticky top-0 z-20 block cursor-pointer touch-none"
        onPointerDown={onRulerDown}
        onPointerMove={onRulerMove}
        onPointerUp={onRulerUp}
        onPointerCancel={onRulerUp}
        aria-label="Time ruler. Click to move the playhead, shift-drag to set the loop, drag a marker to move it, alt-click a marker to delete it."
      />
      <div className="relative" style={{ height: lanesHeight }}>
        <canvas ref={contentRef} className="absolute inset-0 block" />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 block touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContext}
          role="application"
          aria-label="Multitrack timeline"
        />
      </div>
    </div>
  );
}
