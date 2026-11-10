"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";

import { IconButton, Slider, formatDb, formatPan } from "@/components/editor/controls";
import { TRACK_HEIGHT } from "@/components/editor/timeline";
import type { Track } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

interface TrackHeaderProps {
  track: Track;
  index: number;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Track>, key: string) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  meterRef: (element: HTMLDivElement | null) => void;
}

export function TrackHeader({
  track,
  index,
  count,
  selected,
  onSelect,
  onChange,
  onRemove,
  onMove,
  meterRef
}: TrackHeaderProps) {
  return (
    <div
      className={cn(
        "relative flex border-b border-white/10 pl-3 pr-4",
        selected ? "bg-slate-800/80" : "bg-slate-900/80"
      )}
      style={{ height: TRACK_HEIGHT }}
      onPointerDown={onSelect}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: track.color }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex items-center gap-1.5">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-slate-950"
            style={{ backgroundColor: track.color }}
          >
            {index + 1}
          </span>
          <input
            value={track.name}
            aria-label={`Track ${index + 1} name`}
            onChange={(event) => onChange({ name: event.target.value.slice(0, 60) }, `name:${track.id}`)}
            className="h-6 min-w-0 flex-1 rounded bg-transparent px-1 text-xs font-semibold text-slate-100 hover:bg-white/5 focus-visible:bg-slate-950 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-cyan-300"
          />
          <button
            type="button"
            aria-label={`Mute ${track.name}`}
            aria-pressed={track.mute}
            title="Mute (M)"
            onClick={() => onChange({ mute: !track.mute }, "")}
            className={cn(
              "h-6 w-6 shrink-0 rounded text-[11px] font-bold",
              track.mute ? "bg-amber-400 text-slate-950" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
            )}
          >
            M
          </button>
          <button
            type="button"
            aria-label={`Solo ${track.name}`}
            aria-pressed={track.solo}
            title="Solo (Shift+S)"
            onClick={() => onChange({ solo: !track.solo }, "")}
            className={cn(
              "h-6 w-6 shrink-0 rounded text-[11px] font-bold",
              track.solo ? "bg-emerald-400 text-slate-950" : "bg-slate-700 text-slate-200 hover:bg-slate-600"
            )}
          >
            S
          </button>
        </div>
        <Slider
          compact
          label="Vol"
          value={track.volumeDb}
          min={-60}
          max={6}
          step={0.5}
          defaultValue={0}
          format={formatDb}
          onChange={(volumeDb) => onChange({ volumeDb }, `vol:${track.id}`)}
        />
        <Slider
          compact
          label="Pan"
          value={track.pan}
          min={-1}
          max={1}
          step={0.01}
          defaultValue={0}
          format={formatPan}
          onChange={(pan) => onChange({ pan }, `pan:${track.id}`)}
        />
        <div className="flex items-center gap-1">
          <IconButton size="sm" label="Move track up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton size="sm" label="Move track down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ChevronDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton size="sm" label={`Delete ${track.name}`} onClick={onRemove} className="ml-auto">
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      <div
        className="absolute inset-y-2 right-1 w-1.5 overflow-hidden rounded-full bg-slate-950"
        role="meter"
        aria-label={`${track.name} level`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={0}
      >
        <div
          ref={meterRef}
          className="absolute inset-x-0 bottom-0 h-full origin-bottom rounded-full bg-emerald-400"
          style={{ transform: "scaleY(0)" }}
        />
      </div>
    </div>
  );
}
