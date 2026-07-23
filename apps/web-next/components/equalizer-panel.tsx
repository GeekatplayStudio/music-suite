"use client";

import { cn } from "@/lib/utils";

interface EqualizerPanelProps {
  enabled: boolean;
  bands: number[];
  gains: number[];
  exporting: boolean;
  onToggle: (enabled: boolean) => void;
  onGainChange: (index: number, gain: number) => void;
  onReset: () => void;
  onExport: () => void;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatBandLabel(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k` : `${hz}`;
}

function solveSpline(gains: number[], bandsLength: number): string {
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < bandsLength; index += 1) {
    const x = bandsLength === 1 ? 50 : (index / Math.max(1, bandsLength - 1)) * 100;
    const y = 50 - clamp(gains[index] / 12, -1, 1) * 42;
    points.push({ x, y });
  }
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 3;
    const cp1y = p0.y;
    const cp2x = p1.x - (p1.x - p0.x) / 3;
    const cp2y = p1.y;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }
  return d;
}

export function EqualizerPanel({
  enabled,
  bands,
  gains,
  exporting,
  onToggle,
  onGainChange,
  onReset,
  onExport,
  className,
}: EqualizerPanelProps) {
  const splinePath = solveSpline(gains, bands.length);
  const fillPath = splinePath ? `M 0 50 L ${splinePath.slice(2)} L 100 50 Z` : "";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Optional Equalizer</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Preview the loaded file through a manual EQ curve and export the processed result as WAV.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Enable EQ
        </label>
      </div>

      <div className="rounded-2xl border border-border/80 bg-[linear-gradient(180deg,rgba(8,16,29,0.96),rgba(18,29,46,0.92))] p-3">
        <svg viewBox="0 0 100 100" className="h-36 w-full" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="eq-fill-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={enabled ? "rgb(82,214,190)" : "rgb(141,154,176)"} stopOpacity="0.25" />
              <stop offset="100%" stopColor={enabled ? "rgb(82,214,190)" : "rgb(141,154,176)"} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(230,236,245,0.24)" strokeWidth="0.8" />
          <line x1="0" y1="15" x2="100" y2="15" stroke="rgba(230,236,245,0.12)" strokeWidth="0.6" strokeDasharray="2 2" />
          <line x1="0" y1="85" x2="100" y2="85" stroke="rgba(230,236,245,0.12)" strokeWidth="0.6" strokeDasharray="2 2" />
          {fillPath && (
            <path
              d={fillPath}
              fill="url(#eq-fill-grad)"
              aria-hidden="true"
            />
          )}
          {bands.map((band, index) => {
            const x = bands.length === 1 ? 50 : (index / Math.max(1, bands.length - 1)) * 100;
            const y = 50 - clamp(gains[index] / 12, -1, 1) * 42;
            return (
              <g key={band}>
                <line x1={x} y1="6" x2={x} y2="94" stroke="rgba(230,236,245,0.08)" strokeWidth="0.5" />
                <circle cx={x} cy={y} r="1.8" fill={enabled ? "rgba(82,214,190,0.95)" : "rgba(141,154,176,0.65)"} />
              </g>
            );
          })}
          {splinePath && (
            <path
              d={splinePath}
              fill="none"
              stroke={enabled ? "rgba(82,214,190,0.96)" : "rgba(141,154,176,0.72)"}
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>+12 dB</span>
          <span>0 dB</span>
          <span>-12 dB</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {bands.map((band, index) => (
          <label key={`${band}-${index}`} className="rounded-xl border border-border/70 bg-secondary/45 p-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{formatBandLabel(band)} Hz</span>
              <span>{gains[index].toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={gains[index]}
              disabled={!enabled}
              onChange={(event) => onGainChange(index, Number(event.target.value))}
              className="mt-3 w-full accent-[hsl(var(--primary))]"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-border/70 bg-secondary px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary/80"
        >
          Reset EQ
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
        >
          {exporting ? "Exporting EQ WAV..." : "Export EQ WAV"}
        </button>
      </div>
    </div>
  );
}
