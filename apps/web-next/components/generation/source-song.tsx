"use client";

import Link from "next/link";
import { useRef } from "react";
import { BarChart3, FileAudio, Loader2, Scissors, Upload, X } from "lucide-react";

import { editorApi } from "@/lib/editor/api";
import type { Inspiration, ProviderTask } from "@/lib/generation/api";
import type { ClipRef } from "@/lib/handoff";
import { cn } from "@/lib/utils";

/** The song the creator starts from, with what was measured in it. */
export interface SourceSong extends ClipRef {
  measured: Inspiration["measured"] | null;
}

/** What the creator does with the song: "text2music" makes a new one in its style. */
export const NEW_IN_ITS_STYLE = "text2music";

const TASK_HELP: Record<string, string> = {
  [NEW_IN_ITS_STYLE]: "A brand-new song with the same tempo, key, length and feel. Describe the rest below.",
  cover: "The same song in a new style: keep its structure, change the sound.",
  extend: "Continue it: new music before the start or after the end.",
  extract: "Pull one instrument out of it as its own track, for sampling or practice.",
  add_layer: "Write a new part (drums, bass, guitar…) that fits over it.",
  complete: "Build a full arrangement around it, for example around a vocal or a riff."
};

const smallButton =
  "inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 hover:bg-slate-700 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";

function formatLength(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

interface SourceSongPanelProps {
  source: SourceSong | null;
  /** What is happening right now ("Reading tempo, key and style…"), or null. */
  working: string | null;
  disabled: boolean;
  /** Tasks this generator can run on a song, besides making a new one in its style. */
  tasks: ProviderTask[];
  taskId: string;
  onTask: (taskId: string) => void;
  onUpload: (file: File) => void;
  onAnalyse: () => void;
  onClear: () => void;
}

/** "Start from a song": upload or bring in a song, read it, and choose what to make from it. */
export function SourceSongPanel({ source, working, disabled, tasks, taskId, onTask, onUpload, onAnalyse, onClear }: SourceSongPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const choices: ProviderTask[] = [{ id: NEW_IN_ITS_STYLE, label: "New song in its style" }, ...tasks];

  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aiff,.aif"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) onUpload(file);
      }}
    />
  );

  if (!source) {
    return (
      <section className="glass rounded-2xl border border-white/10 p-4" aria-label="Start from a song">
        {picker}
        <h2 className="display-font flex items-center gap-2 text-sm font-semibold text-slate-200">
          <FileAudio className="h-4 w-4 text-cyan-300" aria-hidden /> Start from a song
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Optional. Bring in a song to match its tempo, key and feel, restyle it, extend it, add a part to it, pull out an
          instrument, or split it into stems in the editor.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className={smallButton} disabled={disabled || working !== null} onClick={() => fileRef.current?.click()}>
            {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            {working ?? "Choose a song file"}
          </button>
          <Link href="/" className="text-xs font-semibold text-cyan-300 underline-offset-2 hover:underline">
            or pick one you analysed
          </Link>
        </div>
      </section>
    );
  }

  const measured = source.measured;
  const facts = measured
    ? [
        measured.bpm ? `${Math.round(measured.bpm)} BPM` : "no steady tempo",
        measured.key ?? "no clear key",
        measured.beats_per_bar ? `${measured.beats_per_bar}/4` : null,
        formatLength(measured.duration_seconds)
      ].filter(Boolean)
    : [];

  return (
    <section className="glass space-y-3 rounded-2xl border border-cyan-300/30 p-4" aria-label={`Starting from ${source.name}`}>
      {picker}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">Starting from</p>
          <h2 className="display-font truncate text-base font-semibold text-slate-100">{source.name}</h2>
          <p className="text-xs tabular-nums text-slate-400" aria-live="polite">
            {working ?? (facts.length ? `${facts.join(" · ")} · filled into the form below` : "")}
          </p>
        </div>
        <button
          type="button"
          aria-label="Stop starting from this song"
          title="Stop starting from this song (it stays in its session)"
          className={cn(smallButton, "w-9 justify-center px-0")}
          disabled={disabled}
          onClick={onClear}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <audio
        controls
        preload="none"
        src={editorApi.assetAudioUrl(source.projectId, source.assetId)}
        className="h-10 w-full"
        aria-label={`Play ${source.name}`}
      />

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-xs font-semibold text-slate-300">What to make from it</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((task) => {
            const unavailable = task.available === false;
            return (
              <label
                key={task.id}
                className={cn(
                  "flex cursor-pointer gap-2 rounded-xl border p-3 text-sm",
                  taskId === task.id ? "border-cyan-300/60 bg-cyan-400/10" : "border-white/10 bg-slate-900/70 hover:bg-slate-800",
                  unavailable && "cursor-not-allowed opacity-50"
                )}
              >
                <input
                  type="radio"
                  name="source-task"
                  className="mt-0.5 accent-cyan-400"
                  checked={taskId === task.id}
                  disabled={unavailable}
                  onChange={() => onTask(task.id)}
                />
                <span>
                  <span className="font-semibold text-slate-100">{task.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {unavailable ? task.reason : (TASK_HELP[task.id] ?? "")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/editor?project=${source.projectId}&split=${source.assetId}`}
          className={smallButton}
          title="Open its session and split it into vocals, drums, bass and the rest, each on its own track"
        >
          <Scissors className="h-4 w-4" aria-hidden /> Split into stems in the editor
        </Link>
        <button type="button" className={smallButton} disabled={disabled} onClick={onAnalyse}>
          <BarChart3 className="h-4 w-4" aria-hidden /> Analyse it
        </button>
        <button type="button" className={smallButton} disabled={disabled || working !== null} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden /> Use another song
        </button>
      </div>
    </section>
  );
}
