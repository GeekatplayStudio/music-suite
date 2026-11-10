"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Wand2 } from "lucide-react";

import type { PlanSection } from "@/lib/generation/api";
import { cn } from "@/lib/utils";

const input =
  "w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50";
const small =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 " +
  "hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";

const SECTION_NAMES = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Instrumental", "Outro"];

function splitStyles(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** A comma-separated list that is only split when the box loses focus, so commas can be typed. */
function StyleInput({
  value,
  disabled,
  placeholder,
  onCommit
}: {
  value: string[];
  disabled: boolean;
  placeholder: string;
  onCommit: (styles: string[]) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    onCommit(splitStyles(draft));
    setDraft(null);
  };
  return (
    <input
      className={cn(input, "h-9")}
      value={draft ?? value.join(", ")}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && commit()}
    />
  );
}

export function newSection(index: number, styles: string[] = []): PlanSection {
  return {
    name: SECTION_NAMES[Math.min(index, SECTION_NAMES.length - 1)],
    lyrics: "",
    seconds: 20,
    styles,
    avoid: [],
    adherence: "high"
  };
}

interface PlanEditorProps {
  sections: PlanSection[] | null;
  disabled: boolean;
  drafting: boolean;
  maxSections: number;
  maxSeconds: number;
  /** Styles for a new first section, taken from the style description. */
  defaultStyles: string;
  onChange: (sections: PlanSection[] | null) => void;
  onDraft: () => void;
}

/** Edit a song as an ordered list of sections, each with its own lyrics, length and styles. */
export function PlanEditor({ sections, disabled, drafting, maxSections, maxSeconds, defaultStyles, onChange, onDraft }: PlanEditorProps) {
  const list = sections ?? [];
  const total = list.reduce((sum, section) => sum + section.seconds, 0);
  const update = (index: number, patch: Partial<PlanSection>) =>
    onChange(list.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  const move = (index: number, by: number) => {
    const next = list.slice();
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  };

  return (
    <section className="glass space-y-3 rounded-2xl border border-white/10 p-4" aria-label="Song plan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="display-font text-sm font-semibold text-slate-200">Song plan</h3>
          <p className="text-xs text-slate-400">
            Optional. Shape the song section by section. With a plan, the Length and Lyrics fields above are not used.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={small} disabled={disabled || drafting} onClick={onDraft}>
            {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" aria-hidden />}
            {list.length ? "Draft again" : "Draft a plan (free)"}
          </button>
          {list.length ? (
            <button type="button" className={small} disabled={disabled} onClick={() => onChange(null)}>
              Clear plan
            </button>
          ) : null}
        </div>
      </div>

      {list.length ? (
        <ol className="space-y-3">
          {list.map((section, index) => (
            <li key={index} className="space-y-2 rounded-xl bg-slate-900/70 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <span className="w-6 pb-2 text-xs font-semibold tabular-nums text-slate-500">{index + 1}</span>
                <label className="min-w-32 flex-1 space-y-1 text-xs text-slate-400">
                  <span>Section</span>
                  <input
                    className={cn(input, "h-9")}
                    value={section.name}
                    maxLength={100}
                    disabled={disabled}
                    list="plan-section-names"
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </label>
                <label className="w-24 space-y-1 text-xs text-slate-400">
                  <span>Seconds</span>
                  <input
                    className={cn(input, "h-9 tabular-nums")}
                    type="number"
                    min={3}
                    max={120}
                    step={1}
                    value={section.seconds}
                    disabled={disabled}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) update(index, { seconds: Math.min(120, Math.max(3, value)) });
                    }}
                  />
                </label>
                <label className="w-32 space-y-1 text-xs text-slate-400">
                  <span>Follow neighbours</span>
                  <select
                    className={cn(input, "h-9")}
                    value={section.adherence}
                    disabled={disabled}
                    onChange={(event) => update(index, { adherence: event.target.value as PlanSection["adherence"] })}
                  >
                    <option value="high">Closely</option>
                    <option value="medium">Somewhat</option>
                    <option value="low">Loosely</option>
                  </select>
                </label>
                <div className="flex gap-1 pb-0.5">
                  <button type="button" className={cn(small, "w-9 px-0")} aria-label={`Move section ${index + 1} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button type="button" className={cn(small, "w-9 px-0")} aria-label={`Move section ${index + 1} down`} disabled={disabled || index === list.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button type="button" className={cn(small, "w-9 px-0")} aria-label={`Remove section ${index + 1}`} disabled={disabled} onClick={() => onChange(list.length > 1 ? list.filter((_, i) => i !== index) : null)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <label className="block space-y-1 text-xs text-slate-400">
                <span>Lyrics (one line per sung line; leave empty for instrumental)</span>
                <textarea
                  className={cn(input, "py-2 font-mono text-[13px] leading-relaxed")}
                  rows={Math.min(8, Math.max(2, section.lyrics.split("\n").length))}
                  value={section.lyrics}
                  disabled={disabled}
                  onChange={(event) => update(index, { lyrics: event.target.value })}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-400">
                  <span>Styles{index === 0 ? " (sets the genre — use several)" : ""}</span>
                  <StyleInput
                    value={section.styles}
                    disabled={disabled}
                    placeholder="e.g. dream pop, airy female vocal, analog synths"
                    onCommit={(styles) => update(index, { styles })}
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-400">
                  <span>Avoid</span>
                  <StyleInput
                    value={section.avoid}
                    disabled={disabled}
                    placeholder="e.g. distorted guitars"
                    onCommit={(avoid) => update(index, { avoid })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <datalist id="plan-section-names">
        {SECTION_NAMES.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className={small}
          disabled={disabled || list.length >= maxSections}
          onClick={() => onChange([...list, newSection(list.length, list.length ? [] : splitStyles(defaultStyles))])}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add a section
        </button>
        {list.length ? (
          <p className={cn("text-xs tabular-nums", total > maxSeconds ? "text-rose-300" : "text-slate-400")}>
            {list.length} section{list.length === 1 ? "" : "s"} · {Math.floor(total / 60)}:{String(Math.round(total % 60)).padStart(2, "0")} of up to{" "}
            {maxSeconds / 60} min
          </p>
        ) : null}
      </div>
    </section>
  );
}
