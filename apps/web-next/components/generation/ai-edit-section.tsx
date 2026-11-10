"use client";

import { useState } from "react";

import { ActionButton, PanelSection, Slider, fieldClass } from "@/components/editor/controls";
import type { Clip } from "@/lib/editor/types";
import { optionLabel, optionValue, type ProviderInfo } from "@/lib/generation/api";

/** What each edit does, in the words shown to the user. */
const TASK_HINTS: Record<string, string> = {
  repaint: "Regenerates the highlighted part of this clip and keeps everything around it exactly as it is.",
  extend: "Adds new music before or after this clip that continues it.",
  cover: "Plays the same song in a new style.",
  extract: "Recreates one instrument from this clip on its own track. For exact stems, use Separate instead.",
  add_layer: "Writes a new instrument part that fits this clip, on its own track.",
  complete:
    "Builds a full arrangement around this part, for example a band around a vocal. Works best on a single part, such as a stem from Separate.",
};
const TASK_TITLES: Record<string, string> = {
  repaint: "regenerated",
  extend: "extended",
  cover: "restyled",
  extract: "extracted",
  add_layer: "new part",
  complete: "full song",
};
const NEEDS_STYLE = new Set(["repaint", "extend", "cover", "add_layer", "complete"]);
const EXTEND_CHOICES = [10, 20, 30, 60];

interface AiEditSectionProps {
  clip: Clip;
  /** The highlighted range inside this clip's audio, in seconds of the audio file. */
  selection: { start: number; end: number } | null;
  provider: ProviderInfo | null;
  busy: boolean;
  onRun: (params: Record<string, unknown>, title: string) => void;
  onOpenSongStudio: () => void;
}

export function AiEditSection({ clip, selection, provider, busy, onRun, onOpenSongStudio }: AiEditSectionProps) {
  const tasks = (provider?.schema.tasks ?? []).filter((task) => task.source);
  const [taskId, setTaskId] = useState("repaint");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [extendSeconds, setExtendSeconds] = useState(20);
  const [extendAt, setExtendAt] = useState<"end" | "start">("end");
  const [strength, setStrength] = useState(0.5);
  const [faithful, setFaithful] = useState(false);
  const [track, setTrack] = useState("vocals");
  const [versions, setVersions] = useState(1);

  const hint =
    "Change this clip with the local AI engine. Results are new audio, so every change can be undone.";
  if (!provider || !provider.status.ready) {
    return (
      <PanelSection title="AI edit" hint={hint}>
        <p className="text-[11px] text-slate-400">
          {provider ? provider.status.message : "The local AI engine is not available."} Install it from AI Song Studio.
        </p>
        <ActionButton className="w-full" onClick={onOpenSongStudio}>
          Open AI Song Studio
        </ActionButton>
      </PanelSection>
    );
  }

  const task = tasks.find((t) => t.id === taskId) ?? tasks[0];
  if (!task) return null;
  const trackField = provider.schema.fields.find((f) => f.key === "track");
  const unavailable = task.available === false;
  const reversed = Boolean(clip.reversed);
  const needsSelection = task.id === "repaint";
  const selectionOk = Boolean(selection && selection.end - selection.start >= 1);
  const styleOk = !NEEDS_STYLE.has(task.id) || style.trim().length >= 3;
  const ready = !busy && !unavailable && !reversed && styleOk && (!needsSelection || selectionOk);

  const run = () => {
    const fields: Record<string, unknown> = { variations: versions };
    if (style.trim()) fields.caption = style.trim();
    if (task.id === "repaint" && selection) {
      fields.region_start = Number(selection.start.toFixed(3));
      fields.region_end = Number(selection.end.toFixed(3));
    }
    if ((task.id === "repaint" || task.id === "extend" || task.id === "cover") && lyrics.trim()) {
      fields.lyrics = lyrics.trim();
    }
    if (task.id === "extend") {
      fields.extend_seconds = extendSeconds;
      fields.extend_at = extendAt;
    }
    if (task.id === "cover") {
      fields.strength = strength;
      fields.faithful = faithful;
    }
    if (task.id === "extract" || task.id === "add_layer" || task.id === "complete") fields.track = track;
    const label = TASK_TITLES[task.id] ?? task.id;
    const instrument = optionLabel(trackField?.options?.find((o) => optionValue(o) === track) ?? track);
    const title =
      task.id === "extract"
        ? `${instrument} (from ${clip.name})`
        : task.id === "add_layer"
          ? `New ${instrument.toLowerCase()} part`
          : `${clip.name} (${label})`;
    onRun(
      { provider: provider.id, task: task.id, title: title.slice(0, 80), fields },
      `${task.label}: ${clip.name}`
    );
  };

  return (
    <PanelSection title="AI edit" hint={hint}>
      <label className="block space-y-1 text-[11px] text-slate-400">
        <span>What to do</span>
        <select
          className={fieldClass}
          value={task.id}
          aria-label="AI edit"
          onChange={(event) => setTaskId(event.target.value)}
        >
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.available === false ? " (needs the editing model)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] leading-snug text-slate-400">{TASK_HINTS[task.id]}</p>

      {unavailable ? (
        <>
          <p className="text-[11px] text-amber-200">{task.reason}</p>
          <ActionButton className="w-full" onClick={onOpenSongStudio}>
            Open AI Song Studio Settings
          </ActionButton>
        </>
      ) : null}
      {reversed ? <p className="text-[11px] text-amber-200">Un-reverse the clip first.</p> : null}
      {needsSelection && !selectionOk ? (
        <p className="text-[11px] text-amber-200">
          Highlight at least one second of this clip with the Range tool (R), then come back here.
        </p>
      ) : null}
      {needsSelection && selection && selectionOk ? (
        <p className="text-[11px] tabular-nums text-slate-300">
          Section: {selection.start.toFixed(1)} s to {selection.end.toFixed(1)} s of the clip&apos;s audio
        </p>
      ) : null}

      {task.id === "extract" || task.id === "add_layer" || task.id === "complete" ? (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>{task.id === "extract" ? "Instrument to pull out" : task.id === "add_layer" ? "Part to add" : "This clip is"}</span>
          <select className={fieldClass} value={track} aria-label="Instrument" onChange={(event) => setTrack(event.target.value)}>
            {(trackField?.options ?? []).map((option) => (
              <option key={optionValue(option)} value={optionValue(option)}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {NEEDS_STYLE.has(task.id) || task.id === "extract" ? (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>{task.id === "cover" ? "New style" : task.id === "extract" ? "Describe it (optional)" : "Style"}</span>
          <textarea
            rows={2}
            value={style}
            maxLength={1500}
            aria-label="Style for the AI edit"
            placeholder={
              task.id === "cover" ? "e.g. lo-fi hip hop, dusty drums, mellow piano" : "e.g. warm acoustic folk, male vocal"
            }
            onChange={(event) => setStyle(event.target.value)}
            className={`${fieldClass} h-auto py-1.5 leading-snug`}
          />
        </label>
      ) : null}

      {task.id === "repaint" || task.id === "extend" || task.id === "cover" ? (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>Lyrics (optional)</span>
          <textarea
            rows={2}
            value={lyrics}
            maxLength={6000}
            aria-label="Lyrics for the AI edit"
            placeholder="Leave empty for an instrumental part"
            onChange={(event) => setLyrics(event.target.value)}
            className={`${fieldClass} h-auto py-1.5 font-mono leading-snug`}
          />
        </label>
      ) : null}

      {task.id === "extend" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-slate-400">
            <span>Add</span>
            <select className={fieldClass} value={extendSeconds} onChange={(event) => setExtendSeconds(Number(event.target.value))}>
              {EXTEND_CHOICES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} s
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] text-slate-400">
            <span>Where</span>
            <select
              className={fieldClass}
              value={extendAt}
              onChange={(event) => setExtendAt(event.target.value === "start" ? "start" : "end")}
            >
              <option value="end">After the end</option>
              <option value="start">Before the start</option>
            </select>
          </label>
        </div>
      ) : null}

      {task.id === "cover" ? (
        <>
          <Slider
            label="Keep"
            value={strength}
            min={0.05}
            max={1}
            step={0.05}
            defaultValue={0.5}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={setStrength}
          />
          <label className="flex min-h-6 cursor-pointer items-start gap-2 text-[11px] text-slate-200">
            <input
              type="checkbox"
              checked={faithful}
              onChange={(event) => setFaithful(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cyan-400"
            />
            <span>Stay close to the original (keeps melody and timing, changes the production)</span>
          </label>
        </>
      ) : null}

      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>Versions</span>
        <select className={`${fieldClass} w-20`} value={versions} onChange={(event) => setVersions(Number(event.target.value))}>
          {[1, 2, 3, 4].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
      <ActionButton variant="primary" className="w-full" disabled={!ready} onClick={run}>
        {task.label}
      </ActionButton>
      {versions > 1 ? (
        <p className="text-[11px] text-slate-400">The first version replaces or adds the clip; the others go on muted tracks to compare.</p>
      ) : null}
    </PanelSection>
  );
}
