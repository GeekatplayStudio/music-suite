"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, PanelSection, Slider, fieldClass, formatDb } from "@/components/editor/controls";
import { type PluginSession, PluginInstrumentSection } from "@/components/editor/plugin-instrument";
import { SynthEditor } from "@/components/editor/synth-editor";
import { AiEditSection } from "@/components/generation/ai-edit-section";
import { FACTORY_PRESETS, loadUserPresets, normalizePatch, type Patch } from "@/lib/editor/synth";
import type { ProviderInfo } from "@/lib/generation/api";
import { editorApi } from "@/lib/editor/api";
import type { Favourite, ProcessStep } from "@/lib/editor/favourites";
import { type WamCatalogueEntry, isAllowedWamUrl, loadWamCatalogue, wamConsent } from "@/lib/editor/wam";
import {
  type Asset,
  type AssetMeta,
  type Bus,
  type Capabilities,
  type Clip,
  type FadeCurve,
  type GenerationStatus,
  type Job,
  type JobOp,
  type PluginInfo,
  type PluginSound,
  type ProjectState,
  type TimeRange,
  type Track,
  type TrackFx,
  type VoiceFx,
  type VoiceMode,
  EQ_DEFAULTS,
  TRACK_COLORS,
  VOICE_MODES,
  VOICE_PRESETS,
  formatTime
} from "@/lib/editor/types";

export interface JobEntry {
  job: Job;
  clipId: string;
  title: string;
}

interface InspectorProps {
  state: ProjectState;
  assets: Map<string, Asset>;
  capabilities: Capabilities | null;
  plugins: PluginInfo[];
  clip: Clip | null;
  selectionCount: number;
  track: Track | null;
  range: TimeRange | null;
  jobs: JobEntry[];
  onDismissJob: (jobId: string) => void;
  onPatchState: (patch: Partial<ProjectState>, key: string) => void;
  onPatchClip: (patch: Partial<Clip>, key: string) => void;
  onPatchTrack: (patch: Partial<Track>, key: string) => void;
  onRunJob: (op: JobOp, params: Record<string, unknown>, title: string) => void;
  onAddMidiTrack: () => void;
  onOpenWam: (trackId: string) => void;
  /** Render a MIDI clip through its track's plugin instrument. */
  onRenderWithPlugin: (clipId: string) => void;
  /** Open the track's plugin instrument window for a MIDI clip. */
  onOpenPluginWindow: (clipId: string) => void;
  onClosePluginWindow: (jobId: string) => void;
  /** Hear a MIDI clip through its track's plugin instrument (starts a session if needed). */
  onPlayPlugin: (clipId: string) => void;
  onStopPlugin: (clipId: string) => void;
  onPickPluginSound: (clipId: string, sound: PluginSound) => void;
  onImportPluginSound: (clipId: string, sound: { name: string; state: string }) => void;
  onRefreshPlugins: () => void;
  generation: GenerationStatus | null;
  /** Generators that can edit the selected clip (local engine first). */
  songProviders: ProviderInfo[];
  projectId: string;
  onCheckGeneration: () => void;
  /** Opens AI Song Studio set to generate into this project. */
  onOpenSongStudio: () => void;
  /** Sound one note on a track's instrument. */
  onPreviewNote: (trackId: string, pitch: number) => void;
  onOpenPianoRoll: () => void;
  onExportMidi: () => void;
  getPosition: () => number;
  getBusLevel: (busId: string) => number;
  getTrackSpectrum: (trackId: string) => Float32Array | null;
  getEqResponse: (trackId: string, freqs: Float32Array<ArrayBuffer>) => Float32Array | null;
  favourites: Favourite[];
  recentSteps: ProcessStep[];
  onSaveFavourite: (name: string, count: number) => void;
  onRunFavourite: (id: string) => void;
  onRemoveFavourite: (id: string) => void;
  onAudition: (pluginId: string, values: Record<string, number>) => void;
  onComp: (clipId: string, useRange: boolean) => void;
  onUseAsProject: (meta: AssetMeta) => void;
  onAddAsset: (asset: Asset) => void;
  onSeek: (time: number) => void;
  getScope: () => { left: Float32Array; right: Float32Array } | null;
  onAddSection: () => void;
  onRegion: (action: "select" | "rename" | "repeat" | "cut" | "remove", id: string, value?: string) => void;
  onAddBus: (kind: "reverb" | "delay" | "group") => void;
  onPatchBus: (id: string, patch: Partial<Bus>, key: string) => void;
  onRemoveBus: (id: string) => void;
  onRenameMarker: (id: string, name: string) => void;
  onRemoveMarker: (id: string) => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEYS = NOTES.flatMap((note) => [`${note} major`, `${note} minor`]);

const CURVES: [FadeCurve, string][] = [
  ["linear", "Linear"],
  ["equal", "Equal power"],
  ["scurve", "S-curve"]
];

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-6 cursor-pointer items-start gap-2 text-[11px] text-slate-200" title={hint}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-400"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {hint ? <span className="block text-slate-400">{hint}</span> : null}
      </span>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-slate-400">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="number"
        className={fieldClass}
        value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
      {suffix ? <span className="w-8 shrink-0 text-slate-400">{suffix}</span> : null}
    </label>
  );
}

function JobList({ jobs, onDismiss }: { jobs: JobEntry[]; onDismiss: (id: string) => void }) {
  if (!jobs.length) return null;
  return (
    <section className="border-b border-white/10 px-4 py-3" aria-live="polite">
      <h3 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-300">Processing</h3>
      <ul className="mt-2 space-y-2">
        {jobs.map(({ job, title }) => {
          const failed = job.status === "failed";
          const done = job.status === "completed";
          return (
            <li key={job.id} className="rounded-lg bg-slate-900 p-2 text-[11px]">
              <div className="flex items-center gap-2">
                {!failed && !done ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-300" /> : null}
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{title}</span>
                {failed || done ? (
                  <button
                    type="button"
                    aria-label="Dismiss"
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-slate-100"
                    onClick={() => onDismiss(job.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="font-mono tabular-nums text-slate-300">{Math.round(job.progress)}%</span>
                )}
              </div>
              {failed ? (
                <p className="mt-1 text-rose-300">{job.error || "Processing failed."}</p>
              ) : (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={done ? "h-full bg-emerald-400" : "h-full bg-cyan-400 transition-[width] duration-300"}
                      style={{ width: `${done ? 100 : Math.max(4, job.progress)}%` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-slate-400">{done ? "Done" : job.detail || job.stage}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Inspector(props: InspectorProps) {
  const { state, clip, track, capabilities } = props;
  const [stems, setStems] = useState(4);
  const [drumKit, setDrumKit] = useState(false);
  const [leadBacking, setLeadBacking] = useState(false);
  const [strength, setStrength] = useState(0.6);
  const [targetLufs, setTargetLufs] = useState(-14);
  const [semitones, setSemitones] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [matchTempo, setMatchTempo] = useState(true);
  const [matchKey, setMatchKey] = useState(true);
  const [matchLoudness, setMatchLoudness] = useState(false);
  const [matchTarget, setMatchTarget] = useState("project");
  const [pluginId, setPluginId] = useState("");
  const [pluginValues, setPluginValues] = useState<Record<string, number>>({});
  const [pluginDetail, setPluginDetail] = useState<
    | { status: "idle" | "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; parameters: PluginInfo["parameters"] }
  >({ status: "idle" });
  const [restoreAmount, setRestoreAmount] = useState(0.5);
  const [favouriteName, setFavouriteName] = useState("");
  const [genPrompt, setGenPrompt] = useState("");
  const [genSeconds, setGenSeconds] = useState(15);
  const [genModel, setGenModel] = useState("");
  const [favouriteCount, setFavouriteCount] = useState(1);
  const pluginRequest = useRef(0);

  const choosePlugin = (id: string) => {
    setPluginId(id);
    setPluginValues({});
    const request = ++pluginRequest.current;
    if (!id) {
      setPluginDetail({ status: "idle" });
      return;
    }
    setPluginDetail({ status: "loading" });
    editorApi
      .describePlugin(id)
      .then((info) => {
        if (pluginRequest.current === request) setPluginDetail({ status: "ready", parameters: info.parameters });
      })
      .catch((err: unknown) => {
        if (pluginRequest.current !== request) return;
        setPluginDetail({ status: "error", message: err instanceof Error ? err.message : "The plugin could not be loaded." });
      });
  };
  const [openBusId, setOpenBusId] = useState<string | null>(null);
  const [eqDetail, setEqDetail] = useState(false);

  const busy = clip ? props.jobs.some((j) => j.clipId === clip.id && j.job.status !== "completed" && j.job.status !== "failed") : false;
  const meta = clip ? state.assetMeta[clip.assetId] : undefined;
  const windowJob = clip
    ? props.jobs.find((j) => j.clipId === clip.id && j.job.op === "plugin_window" && (j.job.status === "queued" || j.job.status === "running"))
    : undefined;
  const session: PluginSession = !windowJob
    ? "none"
    : windowJob.job.stage === "window"
      ? "window"
      : windowJob.job.stage === "listening"
        ? "listening"
        : "starting";
  const stemOptions = capabilities?.separation.stem_options ?? [2, 4];
  const stemChoice = stemOptions.includes(stems) ? stems : (stemOptions[stemOptions.length - 1] ?? 4);
  // Kit pieces and lead/backing vocals need the AI stem separation pack.
  const fineSplit = Boolean(capabilities?.separation.detail);
  const clipLabel = clip ? (props.assets.get(clip.assetId)?.label ?? "").toLowerCase() : "";
  const drumsOn = fineSplit && drumKit && stemChoice !== 2;
  const leadOn = fineSplit && leadBacking;
  const stemTotal = stemChoice + (drumsOn ? 5 : 0) + (leadOn ? 1 : 0);
  const accelerator = capabilities?.separation.accelerator;

  const noisePrint = (() => {
    if (!clip || !props.range || clip.reversed) return null;
    const start = Math.max(props.range.start, clip.start);
    const end = Math.min(props.range.end, clip.start + clip.duration);
    if (end - start < 0.1) return null;
    return { start: clip.offset + start - clip.start, end: clip.offset + end - clip.start };
  })();

  const otherAssets = (() => {
    if (!clip) return [];
    const seen = new Set<string>([clip.assetId]);
    const list: { id: string; label: string }[] = [];
    for (const other of state.clips) {
      if (seen.has(other.assetId)) continue;
      seen.add(other.assetId);
      const trackName = state.tracks.find((t) => t.id === other.trackId)?.name ?? "Track";
      list.push({ id: other.assetId, label: `${trackName}: ${other.name}` });
    }
    return list;
  })();

  const unusedAssets = [...props.assets.values()];
  const automationPoints = track
    ? track.volumeAuto.length + track.panAuto.length + Object.values(track.auto).reduce((n, points) => n + (points?.length ?? 0), 0)
    : 0;

  return (
    <aside
      className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-slate-950/80"
      aria-label="Inspector"
    >
      <JobList jobs={props.jobs} onDismiss={props.onDismissJob} />

      {clip ? (
        <>
          <PanelSection
            title={props.selectionCount > 1 ? `Clip (${props.selectionCount} selected)` : "Clip"}
            hint={`${formatTime(clip.start)} → ${formatTime(clip.start + clip.duration)} · ${clip.duration.toFixed(2)} s`}
          >
            <input
              className={fieldClass}
              value={clip.name}
              aria-label="Clip name"
              onChange={(event) => props.onPatchClip({ name: event.target.value.slice(0, 80) }, "clip-name")}
            />
            <Slider
              label="Gain"
              value={clip.gainDb}
              min={-24}
              max={24}
              step={0.5}
              defaultValue={0}
              format={formatDb}
              onChange={(gainDb) => props.onPatchClip({ gainDb }, "clip-gain")}
            />
            <Slider
              label="Fade in"
              value={clip.fadeIn}
              min={0}
              max={Math.max(0.01, Math.min(10, clip.duration - clip.fadeOut))}
              step={0.01}
              defaultValue={0}
              format={(v) => `${v.toFixed(2)} s`}
              onChange={(fadeIn) => props.onPatchClip({ fadeIn }, "clip-fadein")}
            />
            <Slider
              label="Fade out"
              value={clip.fadeOut}
              min={0}
              max={Math.max(0.01, Math.min(10, clip.duration - clip.fadeIn))}
              step={0.01}
              defaultValue={0}
              format={(v) => `${v.toFixed(2)} s`}
              onChange={(fadeOut) => props.onPatchClip({ fadeOut }, "clip-fadeout")}
            />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["Fade-in shape", "fadeInCurve", clip.fadeInCurve],
                  ["Fade-out shape", "fadeOutCurve", clip.fadeOutCurve]
                ] as const
              ).map(([label, field, value]) => (
                <label key={field} className="text-[11px] text-slate-400">
                  {label}
                  <select
                    className={`${fieldClass} mt-1`}
                    value={value}
                    aria-label={label}
                    onChange={(event) => props.onPatchClip({ [field]: event.target.value as FadeCurve }, "")}
                  >
                    {CURVES.map(([curve, name]) => (
                      <option key={curve} value={curve}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton aria-pressed={clip.reversed} onClick={() => props.onPatchClip({ reversed: !clip.reversed }, "")}>
                {clip.reversed ? "Reversed ✓" : "Reverse"}
              </ActionButton>
              <ActionButton aria-pressed={clip.muted} onClick={() => props.onPatchClip({ muted: !clip.muted }, "")}>
                {clip.muted ? "Muted ✓" : "Mute clip"}
              </ActionButton>
              <ActionButton onClick={props.onSplit} title="Split at playhead (S)">
                Split
              </ActionButton>
              <ActionButton onClick={props.onDuplicate} title="Duplicate (Ctrl/Cmd+D)">
                Duplicate
              </ActionButton>
            </div>
            <ActionButton variant="danger" className="w-full" onClick={props.onDelete} title="Delete (Del)">
              Delete clip
            </ActionButton>
          </PanelSection>

          {clip.notes ? (
            <>
              <PanelSection
                title="MIDI clip"
                hint={`${clip.notes.length} notes. This clip plays the track's instrument; edit the notes in the piano roll.`}
              >
                <ActionButton variant="primary" className="w-full" onClick={props.onOpenPianoRoll} title="P">
                  Open the piano roll
                </ActionButton>
                <div className="grid grid-cols-4 gap-1.5">
                  {[-12, -1, 1, 12].map((shift) => (
                    <ActionButton
                      key={shift}
                      title={`Transpose every note by ${shift} semitone${Math.abs(shift) === 1 ? "" : "s"}`}
                      onClick={() =>
                        props.onPatchClip(
                          { notes: (clip.notes ?? []).map((note) => ({ ...note, p: Math.min(127, Math.max(0, note.p + shift)) })) },
                          ""
                        )
                      }
                    >
                      {shift > 0 ? `+${shift}` : shift}
                    </ActionButton>
                  ))}
                </div>
                <ActionButton
                  className="w-full"
                  title="Move every note start onto the nearest sixteenth of the project tempo"
                  onClick={() => {
                    const step = 60 / state.bpm / 4;
                    props.onPatchClip({ notes: (clip.notes ?? []).map((note) => ({ ...note, t: Math.round(note.t / step) * step })) }, "");
                  }}
                >
                  Quantise notes to 1/16
                </ActionButton>
                <ActionButton className="w-full" disabled={!clip.notes.length} onClick={props.onExportMidi}>
                  Export as a .mid file
                </ActionButton>
              </PanelSection>
              {track ? (
                <PanelSection title="Instrument" hint="Built in. It feeds the track's EQ, effects and sends like any audio.">
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="w-16 shrink-0">Type</span>
                    <select
                      className={fieldClass}
                      value={track.synth.kind}
                      aria-label="Instrument type"
                      onChange={(event) => props.onPatchTrack({ synth: { ...track.synth, kind: event.target.value as typeof track.synth.kind } }, "")}
                    >
                      <option value="synth">Synth (pitched notes)</option>
                      <option value="drums">Drum kit (kick 36, snare 38, hat 42…)</option>
                    </select>
                  </label>
                  {track.synth.kind === "drums" ? (
                    <p className="text-[11px] text-slate-400">
                      Each row of the grid is a drum: kick, snare, clap, hats, toms and cymbal. Note length is ignored.
                    </p>
                  ) : null}
                  {track.synth.kind === "synth" ? (
                    <InstrumentControls
                      track={track}
                      onPatch={(patch, key) => props.onPatchTrack({ synth: { ...track.synth, patch } }, key ? `syn-${key}` : "")}
                      onPreview={(pitch) => props.onPreviewNote(track.id, pitch)}
                    />
                  ) : null}
                </PanelSection>
              ) : null}
              {track ? (
                <PluginInstrumentSection
                  key={track.id}
                  track={track}
                  available={Boolean(capabilities?.plugins.available)}
                  plugins={props.plugins}
                  busy={busy}
                  session={session}
                  hasNotes={Boolean(clip.notes?.length)}
                  onSet={(pluginInstrument) => props.onPatchTrack({ pluginInstrument }, "")}
                  onPickSound={(sound) => props.onPickPluginSound(clip.id, sound)}
                  onImportSound={(sound) => props.onImportPluginSound(clip.id, sound)}
                  onPlay={() => props.onPlayPlugin(clip.id)}
                  onStop={() => props.onStopPlugin(clip.id)}
                  onOpenWindow={() => props.onOpenPluginWindow(clip.id)}
                  onCloseWindow={() => windowJob && props.onClosePluginWindow(windowJob.job.id)}
                  onRender={() => props.onRenderWithPlugin(clip.id)}
                  onRefreshPlugins={props.onRefreshPlugins}
                />
              ) : null}
            </>
          ) : (
            <>
          <PanelSection
            title="Separate stems"
            hint={
              capabilities
                ? `Engine: ${capabilities.separation.engine}${
                    accelerator === "cuda" ? " on the GPU" : accelerator === "mps" ? " on the Apple GPU" : ""
                  }. Each stem lands on its own track, aligned with this clip; the original is muted, not removed.`
                : undefined
            }
          >
            <div className="flex gap-2">
              <select
                className={fieldClass}
                value={stemChoice}
                aria-label="Number of stems"
                onChange={(event) => setStems(Number(event.target.value))}
              >
                {stemOptions.map((count) => (
                  <option key={count} value={count}>
                    {count === 2 ? "2 stems: vocals + instrumental" : count === 4 ? "4 stems: vocals, drums, bass, other" : "6 stems: + guitar, piano"}
                  </option>
                ))}
              </select>
            </div>
            <label className={`flex items-start gap-2 text-[11px] ${fineSplit && stemChoice !== 2 ? "text-slate-300" : "text-slate-500"}`}>
              <input
                type="checkbox"
                className="mt-0.5 accent-cyan-400"
                checked={drumsOn}
                disabled={!fineSplit || stemChoice === 2}
                onChange={(event) => setDrumKit(event.target.checked)}
              />
              <span>Split the drums into kick, snare, toms, hi-hat, ride and crash</span>
            </label>
            <label className={`flex items-start gap-2 text-[11px] ${fineSplit ? "text-slate-300" : "text-slate-500"}`}>
              <input
                type="checkbox"
                className="mt-0.5 accent-cyan-400"
                checked={leadOn}
                disabled={!fineSplit}
                onChange={(event) => setLeadBacking(event.target.checked)}
              />
              <span>Split the vocals into lead and backing</span>
            </label>
            {!fineSplit ? (
              <p className="text-[11px] leading-snug text-slate-400">
                6 stems, drum kit pieces and lead/backing vocals need AI stem separation.{" "}
                <a href="/models" target="_blank" rel="noreferrer" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
                  Install it from Models &amp; engines
                </a>
                , then reload this page.
              </p>
            ) : null}
            <ActionButton
              variant="primary"
              className="w-full"
              disabled={busy}
              onClick={() =>
                props.onRunJob(
                  "separate",
                  { stems: stemChoice, drum_kit: drumsOn, lead_backing: leadOn },
                  `Separating ${clip.name} into ${stemTotal} stems`
                )
              }
            >
              Separate into {stemTotal} stems
            </ActionButton>
            {fineSplit && clipLabel === "drums" ? (
              <ActionButton
                className="w-full"
                disabled={busy}
                onClick={() => props.onRunJob("separate", { part: "drums" }, `Splitting ${clip.name} into kit pieces`)}
              >
                Split this drum stem into kit pieces
              </ActionButton>
            ) : null}
            {fineSplit && clipLabel === "vocals" ? (
              <ActionButton
                className="w-full"
                disabled={busy}
                onClick={() => props.onRunJob("separate", { part: "vocals" }, `Splitting ${clip.name} into lead and backing`)}
              >
                Split this vocal stem into lead and backing
              </ActionButton>
            ) : null}
          </PanelSection>

          <PanelSection
            title="Repair"
            hint={
              noisePrint
                ? "The highlighted range will be used as the noise print."
                : "Tip: with the Range tool, highlight a passage of pure noise inside this clip to use it as a noise print."
            }
          >
            <Slider
              label="Strength"
              value={strength}
              min={0.1}
              max={1}
              step={0.05}
              defaultValue={0.6}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setStrength}
            />
            <ActionButton
              className="w-full"
              disabled={busy}
              onClick={() =>
                props.onRunJob(
                  "denoise",
                  { strength, mode: "auto", noise_start: noisePrint?.start ?? null, noise_end: noisePrint?.end ?? null },
                  `Reducing noise in ${clip.name}`
                )
              }
            >
              Reduce noise
            </ActionButton>
            <NumberField label="Loudness" value={targetLufs} min={-30} max={-6} step={0.5} suffix="LUFS" onChange={setTargetLufs} />
            <ActionButton
              className="w-full"
              disabled={busy}
              onClick={() =>
                props.onRunJob("normalize", { target_lufs: targetLufs, true_peak_dbfs: -1 }, `Normalising ${clip.name}`)
              }
            >
              Normalise loudness
            </ActionButton>
          </PanelSection>

          {clip.takeGroup ? (
            <PanelSection
              title="Takes"
              hint="Each pass of the loop is a take on its own lane. Choose which one is heard, for the whole passage or only inside a highlighted range."
            >
              <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300">
                {state.clips.filter((c) => c.takeGroup === clip.takeGroup && !c.muted).length} of{" "}
                {state.clips.filter((c) => c.takeGroup === clip.takeGroup).length} pieces audible. This piece is{" "}
                <strong className={clip.muted ? "text-slate-400" : "text-emerald-300"}>{clip.muted ? "silent" : "audible"}</strong>.
              </p>
              <ActionButton variant="primary" className="w-full" onClick={() => props.onComp(clip.id, false)}>
                Use this take
              </ActionButton>
              <ActionButton
                className="w-full"
                disabled={!props.range}
                title={props.range ? undefined : "Highlight a range with the Range tool first"}
                onClick={() => props.onComp(clip.id, true)}
              >
                Use this take in the highlighted range
              </ActionButton>
            </PanelSection>
          ) : null}

          {props.selectionCount === 1 && !clip.reversed ? (
            <PanelSection
              title="Warp"
              hint="Pin a moment, then say where it should land. Applying renders the clip with each stretch between markers adjusted; pitch is kept."
            >
              <ActionButton
                className="w-full"
                onClick={() => {
                  const local = props.getPosition() - clip.start;
                  if (local < 0.1 || local > clip.duration - 0.1) return;
                  const next = [...(clip.warp ?? []), { s: local, t: local }].sort((a, b) => a.s - b.s);
                  props.onPatchClip({ warp: next }, "");
                }}
              >
                Add marker at the playhead
              </ActionButton>
              {(clip.warp ?? []).map((marker, index) => {
                const setMarker = (t: number | null) =>
                  props.onPatchClip(
                    { warp: (clip.warp ?? []).flatMap((m, i) => (i !== index ? [m] : t === null ? [] : [{ ...m, t }])) },
                    t === null ? "" : `warp-${index}`
                  );
                return (
                  <div key={`${marker.s}-${index}`} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                    <span className="w-14 shrink-0 font-mono tabular-nums text-orange-300">{marker.s.toFixed(2)} s</span>
                    <span aria-hidden>→</span>
                    <input
                      type="number"
                      className={fieldClass}
                      aria-label={`Target time for the marker at ${marker.s.toFixed(2)} seconds`}
                      step={0.01}
                      min={0}
                      value={Number(marker.t.toFixed(3))}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value >= 0) setMarker(value);
                      }}
                    />
                    <ActionButton
                      title="Move this moment to the playhead"
                      onClick={() => setMarker(Math.max(0.05, props.getPosition() - clip.start))}
                    >
                      Here
                    </ActionButton>
                    <button
                      type="button"
                      aria-label="Remove marker"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                      onClick={() => setMarker(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              <ActionButton
                variant="primary"
                className="w-full"
                disabled={busy || !(clip.warp ?? []).some((m) => Math.abs(m.t - m.s) > 0.005)}
                onClick={() => {
                  const markers = (clip.warp ?? []).map((m) => [clip.offset + m.s, clip.offset + m.t]);
                  // Audio before the clip's own start must stay where it is.
                  if (clip.offset >= 0.1) markers.unshift([clip.offset, clip.offset]);
                  props.onRunJob("warp", { markers }, `Warping ${clip.name}`);
                }}
              >
                Apply warp
              </ActionButton>
              <ActionButton
                className="w-full"
                disabled={busy}
                title="Detect the played beats and move each onto the project tempo grid"
                onClick={() => props.onRunJob("quantize", { bpm: state.bpm }, `Quantising ${clip.name}`)}
              >
                Quantise beats to {state.bpm} BPM
              </ActionButton>
              {props.range && props.range.end - props.range.start > 0.1 ? (
                <ActionButton
                  className="w-full"
                  disabled={busy || clip.duration / (props.range.end - props.range.start) < 0.25 || clip.duration / (props.range.end - props.range.start) > 4}
                  onClick={() => {
                    const length = (props.range?.end ?? 0) - (props.range?.start ?? 0);
                    props.onRunJob("stretch", { rate: clip.duration / length }, `Fitting ${clip.name} to ${length.toFixed(2)} s`);
                  }}
                >
                  Stretch to the length of the highlighted range
                </ActionButton>
              ) : null}
            </PanelSection>
          ) : null}

          <PanelSection
            title="Restore"
            hint="Each tool renders a new take and keeps the original. For one-off sounds, open the spectral view (W) and draw a box around them."
          >
            <div className="grid grid-cols-2 gap-2">
              <ActionButton disabled={busy} title="Remove clicks, pops and crackle" onClick={() => props.onRunJob("declick", { sensitivity: restoreAmount }, `Removing clicks from ${clip.name}`)}>
                DeClick
              </ActionButton>
              <ActionButton disabled={busy} title="Remove 50/60 Hz mains hum and its harmonics (detected automatically)" onClick={() => props.onRunJob("dehum", {}, `Removing hum from ${clip.name}`)}>
                DeHum
              </ActionButton>
              <ActionButton disabled={busy} title="Rebuild peaks flattened by clipping" onClick={() => props.onRunJob("declip", {}, `Repairing clipping in ${clip.name}`)}>
                DeClip
              </ActionButton>
              <ActionButton disabled={busy} title="Reduce room reverberation" onClick={() => props.onRunJob("dereverb", { strength: restoreAmount }, `Reducing reverb in ${clip.name}`)}>
                DeReverb
              </ActionButton>
            </div>
            <Slider
              label="Amount"
              value={restoreAmount}
              min={0.1}
              max={1}
              step={0.05}
              defaultValue={0.5}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setRestoreAmount}
            />
            <p className="text-[11px] text-slate-400">Amount sets DeClick sensitivity and DeReverb strength.</p>
            {props.selectionCount > 1 ? (
              <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-cyan-200">
                Batch: every processing button here runs on all {props.selectionCount} selected clips.
              </p>
            ) : null}
          </PanelSection>

          <PanelSection
            title="Pitch and time"
            hint={capabilities ? `Engine: ${capabilities.stretch.engine}. Renders a new take; the original is kept.` : undefined}
          >
            <Slider
              label="Pitch"
              value={semitones}
              min={-12}
              max={12}
              step={1}
              defaultValue={0}
              format={(v) => `${v > 0 ? "+" : ""}${v} st`}
              onChange={setSemitones}
            />
            <ActionButton
              className="w-full"
              disabled={busy || semitones === 0}
              onClick={() => props.onRunJob("pitch", { semitones }, `Shifting ${clip.name} by ${semitones} st`)}
            >
              Apply pitch shift
            </ActionButton>
            <Slider
              label="Speed"
              value={speed}
              min={50}
              max={200}
              step={1}
              defaultValue={100}
              format={(v) => `${v}%`}
              onChange={setSpeed}
            />
            <ActionButton
              className="w-full"
              disabled={busy || speed === 100}
              onClick={() => props.onRunJob("stretch", { rate: speed / 100 }, `Stretching ${clip.name} to ${speed}%`)}
            >
              Apply time stretch
            </ActionButton>
          </PanelSection>

          <PanelSection
            title="AI match"
            hint="Fits this clip to the target's tempo and key, then lines its first downbeat up with the bar grid."
          >
            <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300">
              {meta
                ? `Detected: ${meta.bpm ? `${meta.bpm.toFixed(1)} BPM` : "tempo unknown"} · ${meta.keyLabel ?? "key unknown"}${
                    meta.lufs !== null ? ` · ${meta.lufs.toFixed(1)} LUFS` : ""
                  }`
                : "Not analysed yet."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton disabled={busy} onClick={() => props.onRunJob("analyze", {}, `Analysing ${clip.name}`)}>
                {meta ? "Re-analyse" : "Detect tempo & key"}
              </ActionButton>
              <ActionButton
                disabled={!meta || (!meta.bpm && !meta.keyLabel)}
                onClick={() => meta && props.onUseAsProject(meta)}
                title="Use this clip's tempo and key for the project"
              >
                Set as project
              </ActionButton>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-16 shrink-0">Match to</span>
              <select
                className={fieldClass}
                value={matchTarget}
                aria-label="Match target"
                onChange={(event) => setMatchTarget(event.target.value)}
              >
                <option value="project">
                  Project ({state.bpm} BPM{state.keyLabel ? `, ${state.keyLabel}` : ""})
                </option>
                {otherAssets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
              {(
                [
                  ["Tempo", matchTempo, setMatchTempo],
                  ["Key", matchKey, setMatchKey],
                  ["Loudness", matchLoudness, setMatchLoudness]
                ] as const
              ).map(([label, value, setter]) => (
                <label key={label} className="flex h-6 cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-cyan-400"
                    checked={value}
                    onChange={(event) => setter(event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <ActionButton
              variant="primary"
              className="w-full"
              disabled={busy || (!matchTempo && !matchKey && !matchLoudness)}
              onClick={() => {
                const toProject = matchTarget === "project" || !otherAssets.some((a) => a.id === matchTarget);
                props.onRunJob(
                  "match",
                  {
                    target_bpm: toProject ? state.bpm : null,
                    target_key: toProject ? state.keyLabel : null,
                    target_asset_id: toProject ? null : matchTarget,
                    match_tempo: matchTempo,
                    match_key: matchKey,
                    match_loudness_lufs: matchLoudness ? targetLufs : null
                  },
                  `Matching ${clip.name}`
                );
              }}
            >
              Match clip
            </ActionButton>
          </PanelSection>

          {capabilities?.plugins.available && props.plugins.length ? (
            <PanelSection
              title="Plugins"
              hint={`Renders this clip through a ${capabilities.plugins.formats.join(" / ").toUpperCase()} plugin. Choose one to load its controls.`}
            >
              <select
                className={fieldClass}
                value={pluginId}
                aria-label="Plugin"
                onChange={(event) => choosePlugin(event.target.value)}
              >
                <option value="">Choose a plugin…</option>
                {props.plugins.map((plugin) => (
                  <option key={plugin.id} value={plugin.id}>
                    {plugin.name} ({plugin.format.toUpperCase()})
                  </option>
                ))}
              </select>
              {pluginDetail.status === "loading" ? (
                <p className="text-[11px] text-slate-400" aria-live="polite">Loading the plugin controls…</p>
              ) : null}
              {pluginDetail.status === "error" ? (
                <p className="text-[11px] text-rose-300" role="alert">{pluginDetail.message}</p>
              ) : null}
              {pluginDetail.status === "ready" ? (
                pluginDetail.parameters.length ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto border-l-2 border-cyan-400/40 pl-2">
                    {pluginDetail.parameters.slice(0, 64).map((parameter) => (
                      <Slider
                        key={parameter.name}
                        label={parameter.name.replace(/_/g, " ")}
                        value={pluginValues[parameter.name] ?? parameter.default}
                        min={parameter.min}
                        max={parameter.max}
                        step={(parameter.max - parameter.min) / 200}
                        defaultValue={parameter.default}
                        format={(v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2))}
                        onChange={(value) => setPluginValues((current) => ({ ...current, [parameter.name]: value }))}
                      />
                    ))}
                    {pluginDetail.parameters.length > 64 ? (
                      <p className="text-[11px] text-slate-400">Showing the first 64 of {pluginDetail.parameters.length} controls.</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">This plugin exposes no adjustable controls.</p>
                )
              ) : null}
              <ActionButton
                className="w-full"
                disabled={!pluginId || pluginDetail.status !== "ready"}
                title="Renders 8 seconds from the playhead through the plugin and plays them. Nothing in the session changes."
                onClick={() => props.onAudition(pluginId, pluginValues)}
              >
                Audition 8 s from the playhead
              </ActionButton>
              <ActionButton
                className="w-full"
                disabled={busy || !pluginId || pluginDetail.status === "loading" || pluginDetail.status === "error"}
                onClick={() => {
                  const plugin = props.plugins.find((item) => item.id === pluginId);
                  props.onRunJob("plugin", { plugin_id: pluginId, parameters: pluginValues }, `Applying ${plugin?.name ?? "plugin"}`);
                }}
              >
                Render through plugin
              </ActionButton>
            </PanelSection>
          ) : null}
          <PanelSection title="Compose" hint="Turn what is in the audio into things you can edit.">
            <ActionButton
              className="w-full"
              disabled={busy}
              title={
                capabilities?.transcription?.engine === "basic-pitch"
                  ? "Transcribes chords and melodies"
                  : "Transcribes one note at a time: best on vocals, bass and lead lines"
              }
              onClick={() => props.onRunJob("to_midi", {}, `Transcribing ${clip.name}`)}
            >
              Convert to MIDI notes
            </ActionButton>
            <ActionButton
              className="w-full"
              disabled={busy}
              title="Finds where the song changes and labels repeated parts alike"
              onClick={() => props.onRunJob("structure", {}, `Finding sections in ${clip.name}`)}
            >
              Detect song sections
            </ActionButton>
          </PanelSection>

          <AiEditSection
            key={clip.id}
            clip={clip}
            selection={noisePrint}
            providers={props.songProviders}
            projectId={props.projectId}
            busy={busy}
            onRun={(params, title) => props.onRunJob("generate_song", params, title)}
            onOpenSongStudio={props.onOpenSongStudio}
          />

          <PanelSection
            title="Generate a part"
            hint="Describe a new part to go with this clip. It is generated on this machine by ComfyUI (MusicGen) at the project tempo and lands on a new track."
          >
            {props.generation?.available && props.generation.node_installed ? (
              <>
                <textarea
                  className={`${fieldClass} h-16 resize-none py-1.5`}
                  placeholder="e.g. warm upright bass, walking line, jazz trio"
                  aria-label="Describe the part to generate"
                  maxLength={300}
                  value={genPrompt}
                  onChange={(event) => setGenPrompt(event.target.value)}
                />
                <Slider label="Length" value={genSeconds} min={4} max={60} step={1} defaultValue={15} format={(v) => `${v} s`} onChange={setGenSeconds} />
                {props.generation.models.length ? (
                  <select
                    className={fieldClass}
                    aria-label="Generation model"
                    value={genModel || props.generation.models[0]}
                    onChange={(event) => setGenModel(event.target.value)}
                  >
                    {props.generation.models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : null}
                <ActionButton
                  variant="primary"
                  className="w-full"
                  disabled={busy || genPrompt.trim().length < 3}
                  onClick={() => {
                    const context = [genPrompt.trim(), `${Math.round(state.bpm)} BPM`, state.keyLabel ? `in ${state.keyLabel}` : ""].filter(Boolean).join(", ");
                    props.onRunJob(
                      "generate",
                      { prompt: context, seconds: genSeconds, bpm: Math.round(Math.min(200, Math.max(60, state.bpm))), model: genModel || props.generation?.models[0] || "facebook/musicgen-stereo-medium" },
                      `Generating “${genPrompt.trim().slice(0, 30)}”`
                    );
                  }}
                >
                  Generate
                </ActionButton>
              </>
            ) : (
              <>
                <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300">
                  {props.generation?.available
                    ? "ComfyUI is running, but the Sonic Holodeck nodes are not installed in it. Run the installer with your ComfyUI path."
                    : "ComfyUI is not running. Start it (with the Sonic Holodeck nodes installed) on this machine, then check again."}
                </p>
                <ActionButton className="w-full" onClick={props.onCheckGeneration}>
                  Check again
                </ActionButton>
              </>
            )}
          </PanelSection>

          <PanelSection
            title="Favourites"
            hint="Save the processing you just ran as a one-click chain. Favourites are kept in this browser and work in every session."
          >
            {props.favourites.map((favourite) => (
              <div key={favourite.id} className="flex items-center gap-1.5">
                <ActionButton
                  className="min-w-0 flex-1 justify-start"
                  disabled={busy}
                  title={favourite.steps.map((step) => step.label).join(" → ")}
                  onClick={() => props.onRunFavourite(favourite.id)}
                >
                  <span className="truncate">
                    ★ {favourite.name} <span className="font-normal text-slate-400">· {favourite.steps.length} step{favourite.steps.length > 1 ? "s" : ""}</span>
                  </span>
                </ActionButton>
                <button
                  type="button"
                  aria-label={`Remove favourite ${favourite.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                  onClick={() => props.onRemoveFavourite(favourite.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {props.recentSteps.length ? (
              <>
                <p className="text-[11px] text-slate-400">
                  Just run: {props.recentSteps.slice(-3).map((step) => step.label).join(" → ")}
                </p>
                <div className="flex items-center gap-1.5">
                  <select
                    className={`${fieldClass} w-24 shrink-0`}
                    style={{ width: "6rem" }}
                    aria-label="How many of the last steps to save"
                    value={Math.min(favouriteCount, props.recentSteps.length)}
                    onChange={(event) => setFavouriteCount(Number(event.target.value))}
                  >
                    {[1, 2, 3].filter((n) => n <= props.recentSteps.length).map((n) => (
                      <option key={n} value={n}>
                        Last {n}
                      </option>
                    ))}
                  </select>
                  <input
                    className={fieldClass}
                    placeholder="Name"
                    aria-label="Favourite name"
                    maxLength={40}
                    value={favouriteName}
                    onChange={(event) => setFavouriteName(event.target.value)}
                  />
                  <ActionButton
                    disabled={!favouriteName.trim()}
                    onClick={() => {
                      props.onSaveFavourite(favouriteName.trim(), Math.min(favouriteCount, props.recentSteps.length));
                      setFavouriteName("");
                    }}
                  >
                    Save
                  </ActionButton>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-400">Run a tool above, then save it here.</p>
            )}
          </PanelSection>
            </>
          )}
        </>
      ) : (
        <PanelSection title="Project" hint="Select a clip to edit it. These settings apply to the whole session.">
          <NumberField
            label="Tempo"
            value={state.bpm}
            min={40}
            max={240}
            step={0.1}
            suffix="BPM"
            onChange={(bpm) => props.onPatchState({ bpm }, "bpm")}
          />
          <NumberField
            label="Beats / bar"
            value={state.beatsPerBar}
            min={2}
            max={12}
            step={1}
            onChange={(beatsPerBar) => props.onPatchState({ beatsPerBar: Math.round(beatsPerBar) }, "beats")}
          />
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">Key</span>
            <select
              className={fieldClass}
              value={state.keyLabel ?? ""}
              aria-label="Project key"
              onChange={(event) => props.onPatchState({ keyLabel: event.target.value || null }, "")}
            >
              <option value="">Not set</option>
              {KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="Master"
            value={state.masterDb}
            min={-60}
            max={6}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(masterDb) => props.onPatchState({ masterDb }, "master")}
          />
          <Toggle
            label="True-peak limiter on the master"
            hint="Looks 5 ms ahead and holds inter-sample peaks under the ceiling."
            checked={state.limiter}
            onChange={(limiter) => props.onPatchState({ limiter }, "")}
          />
          {state.limiter ? (
            <Slider
              label="Ceiling"
              value={state.limiterCeiling}
              min={-6}
              max={-0.1}
              step={0.1}
              defaultValue={-1}
              format={(v) => `${v.toFixed(1)} dBTP`}
              onChange={(limiterCeiling) => props.onPatchState({ limiterCeiling }, "ceiling")}
            />
          ) : null}
          <Toggle
            label="Crossfade overlapping clips"
            hint="Where two clips overlap on a track, they blend with equal-power fades."
            checked={state.autoCrossfade}
            onChange={(autoCrossfade) => props.onPatchState({ autoCrossfade }, "")}
          />
          <ActionButton className="w-full" onClick={props.onAddMidiTrack} title="Adds a track with a four-bar MIDI clip at the playhead and opens the piano roll">
            Add an instrument (MIDI) track
          </ActionButton>
        </PanelSection>
      )}
      {!clip ? (
        <PanelSection
          title="Create a song"
          hint="Write a style and lyrics and generate a whole song with vocals, on this computer or with an online service you have set up. Each version lands on its own track in this project."
        >
          <ActionButton variant="primary" className="w-full" onClick={props.onOpenSongStudio}>
            Open AI Song Studio
          </ActionButton>
        </PanelSection>
      ) : null}

      {track ? (
        <PanelSection title={`Track: ${track.name}`} hint="Equaliser and stereo image, applied live.">
          <Slider
            label="Low"
            value={track.eqLow}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(eqLow) => props.onPatchTrack({ eqLow }, "eq-low")}
          />
          <Slider
            label="Mid"
            value={track.eqMid}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(eqMid) => props.onPatchTrack({ eqMid }, "eq-mid")}
          />
          <Slider
            label="High"
            value={track.eqHigh}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(eqHigh) => props.onPatchTrack({ eqHigh }, "eq-high")}
          />
          <Slider
            label="Width"
            value={track.width}
            min={0}
            max={2}
            step={0.05}
            defaultValue={1}
            format={(v) => (v === 0 ? "Mono" : `${Math.round(v * 100)}%`)}
            onChange={(width) => props.onPatchTrack({ width }, "width")}
          />
          <EqDisplay
            trackId={track.id}
            signature={`${track.eqLow}|${track.eqMid}|${track.eqHigh}|${track.eqLowFreq}|${track.eqMidFreq}|${track.eqMidQ}|${track.eqHighFreq}`}
            getSpectrum={props.getTrackSpectrum}
            getResponse={props.getEqResponse}
          />
          <button
            type="button"
            className="h-6 text-left text-[11px] text-cyan-300 underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-expanded={eqDetail}
            onClick={() => setEqDetail((open) => !open)}
          >
            {eqDetail ? "Hide EQ frequencies" : "Set EQ frequencies and width (Q)…"}
          </button>
          {eqDetail ? (
            <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
              <FreqSlider label="Low at" value={track.eqLowFreq} min={30} max={600} fallback={EQ_DEFAULTS.eqLowFreq} onChange={(eqLowFreq) => props.onPatchTrack({ eqLowFreq }, "eq-lf")} />
              <FreqSlider label="Mid at" value={track.eqMidFreq} min={150} max={8000} fallback={EQ_DEFAULTS.eqMidFreq} onChange={(eqMidFreq) => props.onPatchTrack({ eqMidFreq }, "eq-mf")} />
              <Slider label="Mid Q" value={track.eqMidQ} min={0.2} max={8} step={0.1} defaultValue={EQ_DEFAULTS.eqMidQ} format={(v) => v.toFixed(1)} onChange={(eqMidQ) => props.onPatchTrack({ eqMidQ }, "eq-mq")} />
              <FreqSlider label="High at" value={track.eqHighFreq} min={1500} max={16000} fallback={EQ_DEFAULTS.eqHighFreq} onChange={(eqHighFreq) => props.onPatchTrack({ eqHighFreq }, "eq-hf")} />
            </div>
          ) : null}
          {state.buses.length ? (
            <>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="w-16 shrink-0">Output</span>
                <select
                  className={fieldClass}
                  value={state.buses.some((b) => b.id === track.output) ? track.output : "master"}
                  aria-label="Track output"
                  onChange={(event) => props.onPatchTrack({ output: event.target.value }, "")}
                >
                  <option value="master">Master</option>
                  {state.buses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.name} bus
                    </option>
                  ))}
                </select>
              </label>
              {state.buses
                .filter((bus) => bus.id !== track.output)
                .map((bus) => {
                  const level = track.sends[bus.id];
                  const sending = level !== undefined;
                  return (
                    <div key={bus.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-cyan-400"
                        aria-label={`Send to ${bus.name}`}
                        title={`Send to ${bus.name}`}
                        checked={sending}
                        onChange={(event) => {
                          const sends = { ...track.sends };
                          if (event.target.checked) sends[bus.id] = -12;
                          else delete sends[bus.id];
                          props.onPatchTrack({ sends }, "");
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <Slider
                          label={`→ ${bus.name}`}
                          value={level ?? -12}
                          min={-48}
                          max={6}
                          step={0.5}
                          defaultValue={-12}
                          disabled={!sending}
                          format={formatDb}
                          onChange={(value) => props.onPatchTrack({ sends: { ...track.sends, [bus.id]: value } }, `send:${bus.id}`)}
                        />
                      </div>
                    </div>
                  );
                })}
            </>
          ) : null}
          {automationPoints ? (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="min-w-0 flex-1">Automation: {automationPoints} points on this track</span>
              <ActionButton onClick={() => props.onPatchTrack({ volumeAuto: [], panAuto: [], auto: {} }, "")}>Clear</ActionButton>
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">Colour</span>
            <div className="flex flex-wrap gap-1.5">
              {TRACK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Track colour ${color}`}
                  aria-pressed={track.color === color}
                  onClick={() => props.onPatchTrack({ color }, "")}
                  className="h-6 w-6 rounded-full ring-offset-2 ring-offset-slate-950 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 aria-pressed:ring-2 aria-pressed:ring-white"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </PanelSection>
      ) : null}

      {track ? <EffectRack fx={track.fx} onChange={(fx, key) => props.onPatchTrack({ fx }, key)} /> : null}

      {track ? (
        <WamSection
          key={track.id}
          current={track.wam}
          onLoad={(wam) => props.onPatchTrack({ wam }, "")}
          onOpen={() => props.onOpenWam(track.id)}
        />
      ) : null}

      {!clip ? (
        <PanelSection title="Phase scope" hint="A vertical shape is mono-safe; a wide or horizontal one will thin out in mono.">
          <PhaseScope getScope={props.getScope} />
        </PanelSection>
      ) : null}

      {!clip ? (
        <PanelSection title="Buses" hint="Send several tracks to a shared reverb or delay, or group them under one fader.">
          <div className="grid grid-cols-3 gap-1.5">
            <ActionButton onClick={() => props.onAddBus("reverb")}>+ Reverb</ActionButton>
            <ActionButton onClick={() => props.onAddBus("delay")}>+ Delay</ActionButton>
            <ActionButton onClick={() => props.onAddBus("group")}>+ Group</ActionButton>
          </div>
          {state.buses.map((bus) => (
            <div key={bus.id} className="space-y-1 rounded-lg bg-slate-900 p-2">
              <div className="flex items-center gap-1.5">
                <input
                  className={fieldClass}
                  value={bus.name}
                  aria-label="Bus name"
                  onChange={(event) => props.onPatchBus(bus.id, { name: event.target.value.slice(0, 30) }, "bus-name")}
                />
                <button
                  type="button"
                  aria-label={`Mute ${bus.name} bus`}
                  aria-pressed={bus.mute}
                  onClick={() => props.onPatchBus(bus.id, { mute: !bus.mute }, "")}
                  className={`h-8 w-8 shrink-0 rounded-lg text-[11px] font-bold ${bus.mute ? "bg-amber-400 text-slate-950" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}
                >
                  M
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${bus.name} bus`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                  onClick={() => props.onRemoveBus(bus.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Slider label="Level" value={bus.volumeDb} min={-60} max={6} step={0.5} defaultValue={0} format={formatDb} onChange={(volumeDb) => props.onPatchBus(bus.id, { volumeDb }, "bus-vol")} />
              <LevelBar label={`${bus.name} bus level`} getLevel={() => props.getBusLevel(bus.id)} />
              <button
                type="button"
                className="h-6 text-left text-[11px] text-cyan-300 underline-offset-2 hover:underline"
                aria-expanded={openBusId === bus.id}
                onClick={() => setOpenBusId(openBusId === bus.id ? null : bus.id)}
              >
                {openBusId === bus.id ? "Hide effects" : "Edit effects…"}
              </button>
              {openBusId === bus.id ? (
                <EffectRack bare fx={bus.fx} onChange={(fx, key) => props.onPatchBus(bus.id, { fx }, key)} />
              ) : null}
            </div>
          ))}
          {state.buses.length ? (
            <p className="text-[11px] text-slate-400">Select a track to route it to a bus or set its send levels.</p>
          ) : null}
        </PanelSection>
      ) : null}

      {!clip ? (
        <PanelSection title="Sections" hint="Name parts of the song, then repeat or cut them as a block.">
          <ActionButton className="w-full" disabled={!props.range} onClick={props.onAddSection} title="Shift+R">
            {props.range ? "Add section from highlighted range" : "Highlight a range to add a section"}
          </ActionButton>
          {state.regions.map((region) => (
            <div key={region.id} className="space-y-1 rounded-lg bg-slate-900 p-2">
              <div className="flex items-center gap-1.5">
                <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: region.color }} aria-hidden />
                <input
                  className={fieldClass}
                  value={region.name}
                  aria-label="Section name"
                  onChange={(event) => props.onRegion("rename", region.id, event.target.value.slice(0, 40))}
                />
                <button
                  type="button"
                  aria-label={`Remove the ${region.name} label`}
                  title="Remove the label (keeps the audio)"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                  onClick={() => props.onRegion("remove", region.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="font-mono text-[10px] tabular-nums text-slate-400">
                {formatTime(region.start).slice(0, -2)} → {formatTime(region.end).slice(0, -2)}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <ActionButton onClick={() => props.onRegion("select", region.id)}>Select</ActionButton>
                <ActionButton onClick={() => props.onRegion("repeat", region.id)} title="Insert a copy straight after, moving later audio along">
                  Repeat
                </ActionButton>
                <ActionButton variant="danger" onClick={() => props.onRegion("cut", region.id)} title="Remove this section and close the gap">
                  Cut out
                </ActionButton>
              </div>
            </div>
          ))}
        </PanelSection>
      ) : null}

      {!clip && state.markers.length ? (
        <PanelSection title="Markers" hint="Press K to add one at the playhead. Drag them on the ruler.">
          <ul className="space-y-1">
            {state.markers.map((marker) => (
              <li key={marker.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="h-8 w-16 shrink-0 rounded-lg bg-slate-900 font-mono text-[11px] tabular-nums text-orange-300 hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  title="Jump to this marker"
                  onClick={() => props.onSeek(marker.time)}
                >
                  {formatTime(marker.time).slice(0, -2)}
                </button>
                <input
                  className={fieldClass}
                  value={marker.name}
                  aria-label="Marker name"
                  onChange={(event) => props.onRenameMarker(marker.id, event.target.value.slice(0, 40))}
                />
                <button
                  type="button"
                  aria-label={`Delete ${marker.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  onClick={() => props.onRemoveMarker(marker.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </PanelSection>
      ) : null}

      {!clip ? (
        <PanelSection title="Media" hint="Every file and rendered take in this project. Click one to place it on a new track.">
          {unusedAssets.length ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {unusedAssets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="flex h-8 w-full items-center gap-2 rounded-lg bg-slate-900 px-2 text-left text-[11px] text-slate-200 hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                    onClick={() => props.onAddAsset(asset)}
                    title="Add to a new track at the playhead"
                  >
                    <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">{formatTime(asset.duration_seconds)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400">No audio yet. Use Import, or drop files onto the timeline.</p>
          )}
        </PanelSection>
      ) : null}
    </aside>
  );
}

function EffectRack({ fx, onChange, bare }: { fx: TrackFx; onChange: (fx: TrackFx, key: string) => void; bare?: boolean }) {
  const set = <K extends keyof TrackFx>(unit: K, patch: Partial<TrackFx[K]>, key: string) =>
    onChange({ ...fx, [unit]: { ...fx[unit], ...patch } }, key);
  const units = (
    <>
      <Toggle label="Gate" checked={fx.gate.on} onChange={(on) => set("gate", { on }, "")} />
      {fx.gate.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label="Threshold" value={fx.gate.threshold} min={-80} max={0} step={1} defaultValue={-45} format={(v) => `${v} dB`} onChange={(threshold) => set("gate", { threshold }, "fx-gt")} />
          <Slider label="Attack" value={fx.gate.attack} min={0.001} max={0.1} step={0.001} defaultValue={0.002} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(attack) => set("gate", { attack }, "fx-ga")} />
          <Slider label="Hold" value={fx.gate.hold} min={0} max={0.5} step={0.01} defaultValue={0.06} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(hold) => set("gate", { hold }, "fx-gh")} />
          <Slider label="Release" value={fx.gate.release} min={0.01} max={1} step={0.01} defaultValue={0.15} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(release) => set("gate", { release }, "fx-gr")} />
        </div>
      ) : null}
      <Toggle label="Voice (vocoder, chipmunk, robot…)" checked={fx.voice.on} onChange={(on) => set("voice", { on }, "")} />
      {fx.voice.on ? <VoiceUnit voice={fx.voice} onChange={(patch, key) => set("voice", patch, key)} /> : null}
      <Toggle label="Distortion" checked={fx.dist.on} onChange={(on) => set("dist", { on }, "")} />
      {fx.dist.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label="Drive" value={fx.dist.drive} min={0} max={1} step={0.01} defaultValue={0.4} format={(v) => `${Math.round(v * 100)}%`} onChange={(drive) => set("dist", { drive }, "fx-dd")} />
          <Slider label="Mix" value={fx.dist.mix} min={0} max={1} step={0.01} defaultValue={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => set("dist", { mix }, "fx-dx")} />
        </div>
      ) : null}
      <Toggle label="Compressor" checked={fx.comp.on} onChange={(on) => set("comp", { on }, "")} />
      {fx.comp.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label="Threshold" value={fx.comp.threshold} min={-60} max={0} step={1} defaultValue={-18} format={(v) => `${v} dB`} onChange={(threshold) => set("comp", { threshold }, "fx-ct")} />
          <Slider label="Ratio" value={fx.comp.ratio} min={1} max={20} step={0.5} defaultValue={3} format={(v) => `${v.toFixed(1)}:1`} onChange={(ratio) => set("comp", { ratio }, "fx-cr")} />
          <Slider label="Attack" value={fx.comp.attack} min={0.001} max={0.2} step={0.001} defaultValue={0.01} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(attack) => set("comp", { attack }, "fx-ca")} />
          <Slider label="Release" value={fx.comp.release} min={0.02} max={1} step={0.01} defaultValue={0.2} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(release) => set("comp", { release }, "fx-cl")} />
          <Slider label="Make-up" value={fx.comp.makeup} min={0} max={18} step={0.5} defaultValue={0} format={formatDb} onChange={(makeup) => set("comp", { makeup }, "fx-cm")} />
        </div>
      ) : null}
      <Toggle label="Delay" checked={fx.delay.on} onChange={(on) => set("delay", { on }, "")} />
      {fx.delay.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label="Time" value={fx.delay.time} min={0.02} max={1.5} step={0.005} defaultValue={0.375} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(time) => set("delay", { time }, "fx-dt")} />
          <Slider label="Feedback" value={fx.delay.feedback} min={0} max={0.9} step={0.01} defaultValue={0.35} format={(v) => `${Math.round(v * 100)}%`} onChange={(feedback) => set("delay", { feedback }, "fx-df")} />
          <Slider label="Mix" value={fx.delay.mix} min={0} max={1} step={0.01} defaultValue={0.25} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => set("delay", { mix }, "fx-dm")} />
        </div>
      ) : null}
      <Toggle label="Reverb" checked={fx.reverb.on} onChange={(on) => set("reverb", { on }, "")} />
      {fx.reverb.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label="Size" value={fx.reverb.size} min={0.3} max={6} step={0.1} defaultValue={1.8} format={(v) => `${v.toFixed(1)} s`} onChange={(size) => set("reverb", { size }, "fx-rs")} />
          <Slider label="Mix" value={fx.reverb.mix} min={0} max={1} step={0.01} defaultValue={0.2} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => set("reverb", { mix }, "fx-rm")} />
        </div>
      ) : null}
    </>
  );
  if (bare) return <div className="space-y-2">{units}</div>;
  return (
    <PanelSection title="Effects" hint="Applied live and in exports, in this order: EQ, gate, voice, distortion, compressor, then delay and reverb.">
      {units}
    </PanelSection>
  );
}

const VOICE_MODE_LABELS: Record<VoiceMode, string> = {
  vocoder: "Vocoder (robot singer)",
  pitch: "Pitch shift (chipmunk / monster)",
  robot: "Robot (ring modulator)",
  synth: "Synth voice (follows your pitch)",
  distort: "Vox distortion (megaphone)"
};

function noteName(note: number): string {
  const n = Math.round(note);
  return `${NOTES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

function VoiceUnit({ voice, onChange }: { voice: VoiceFx; onChange: (patch: Partial<VoiceFx>, key: string) => void }) {
  const carrierMode = voice.mode === "vocoder" || voice.mode === "synth";
  const semis = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} st`;
  return (
    <div className="space-y-1.5 border-l-2 border-cyan-400/40 pl-2">
      <select
        className={fieldClass}
        aria-label="Voice preset"
        value=""
        onChange={(event) => {
          const preset = VOICE_PRESETS.find((p) => p.id === event.target.value);
          if (preset) onChange(preset.voice, "");
        }}
      >
        <option value="">Load a preset…</option>
        {VOICE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="w-16 shrink-0">Type</span>
        <select className={fieldClass} aria-label="Voice effect type" value={voice.mode} onChange={(event) => onChange({ mode: event.target.value as VoiceMode }, "")}>
          {VOICE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {VOICE_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>
      {carrierMode ? (
        <>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">Notes</span>
            <select
              className={fieldClass}
              aria-label="Where the robot voice's notes come from"
              value={voice.carrier}
              onChange={(event) => onChange({ carrier: event.target.value as VoiceFx["carrier"] }, "")}
            >
              <option value="follow">Follow the singing, snapped to semitones</option>
              <option value="note">Hold one note (monotone)</option>
            </select>
          </label>
          {voice.carrier === "follow" ? (
            <Slider label="Transpose" value={voice.semitones} min={-24} max={24} step={1} defaultValue={0} format={semis} onChange={(semitones) => onChange({ semitones }, "vx-st")} />
          ) : (
            <Slider label="Note" value={voice.note} min={24} max={84} step={1} defaultValue={48} format={noteName} onChange={(note) => onChange({ note }, "vx-n")} />
          )}
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">Wave</span>
            <select className={fieldClass} aria-label="Robot voice wave" value={voice.wave} onChange={(event) => onChange({ wave: event.target.value as VoiceFx["wave"] }, "")}>
              <option value="saw">Saw (bright, classic)</option>
              <option value="square">Square (hollow, 8-bit)</option>
            </select>
          </label>
          <p className="text-[11px] leading-snug text-slate-400">
            Hold keys on a MIDI keyboard while this track plays to choose the notes yourself, chords included. Exports use the setting above.
          </p>
        </>
      ) : null}
      {voice.mode === "pitch" ? (
        <Slider label="Shift" value={voice.semitones} min={-24} max={24} step={1} defaultValue={12} format={semis} onChange={(semitones) => onChange({ semitones }, "vx-st")} />
      ) : null}
      {voice.mode === "robot" ? (
        <Slider label="Rate" value={voice.rate} min={5} max={400} step={1} defaultValue={50} format={(v) => `${Math.round(v)} Hz`} onChange={(rate) => onChange({ rate }, "vx-r")} />
      ) : null}
      {voice.mode === "distort" ? (
        <Slider label="Drive" value={voice.drive} min={0} max={1} step={0.01} defaultValue={0.6} format={(v) => `${Math.round(v * 100)}%`} onChange={(drive) => onChange({ drive }, "vx-d")} />
      ) : null}
      <Slider label="Mix" value={voice.mix} min={0} max={1} step={0.01} defaultValue={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => onChange({ mix }, "vx-m")} />
      {voice.mode === "vocoder" || voice.mode === "synth" ? (
        <p className="text-[11px] leading-snug text-slate-400">Works best on a solo voice; on a full mix it follows whichever note is loudest.</p>
      ) : null}
    </div>
  );
}

/** Frequency slider on a logarithmic scale, the way pitch is heard. */
/** Preset, a few quick controls, and the full sound editor for a track's built-in synth. */
function InstrumentControls({
  track,
  onPatch,
  onPreview
}: {
  track: Track;
  onPatch: (patch: Patch, key: string) => void;
  onPreview: (pitch: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const patch = track.synth.patch;
  const presets = [...FACTORY_PRESETS, ...(editing ? [] : loadUserPresetsSafe())];
  return (
    <>
      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="w-16 shrink-0">Sound</span>
        <select
          className={fieldClass}
          value={presets.some((p) => p.name === patch.name) ? patch.name : ""}
          aria-label="Sound preset"
          onChange={(event) => {
            const found = presets.find((p) => p.name === event.target.value);
            if (found) {
              onPatch(normalizePatch(found), "");
              onPreview(60);
            }
          }}
        >
          {presets.some((p) => p.name === patch.name) ? null : <option value="">{patch.name} (edited)</option>}
          {presets.map((p, i) => (
            <option key={`${i}-${p.name}`} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <FreqSlider
        label="Brightness"
        value={patch.filter.cutoff}
        min={60}
        max={18000}
        fallback={3200}
        onChange={(cutoff) => onPatch({ ...patch, filter: { ...patch.filter, cutoff } }, "cut")}
      />
      <Slider label="Attack" value={patch.ampEnv.attack} min={0.001} max={2} step={0.001} defaultValue={0.01} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(attack) => onPatch({ ...patch, ampEnv: { ...patch.ampEnv, attack } }, "a")} />
      <Slider label="Release" value={patch.ampEnv.release} min={0.005} max={4} step={0.005} defaultValue={0.2} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(release) => onPatch({ ...patch, ampEnv: { ...patch.ampEnv, release } }, "r")} />
      <ActionButton variant="primary" className="w-full" onClick={() => setEditing(true)}>
        Edit sound: oscillators, filter, LFOs, modulation…
      </ActionButton>
      {editing ? (
        <SynthEditor
          patch={patch}
          trackName={track.name}
          onChange={onPatch}
          onPreview={onPreview}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

function loadUserPresetsSafe(): Patch[] {
  return typeof window === "undefined" ? [] : loadUserPresets();
}

function FreqSlider({
  label,
  value,
  min,
  max,
  fallback,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  fallback: number;
  onChange: (hz: number) => void;
}) {
  return (
    <Slider
      label={label}
      value={Math.log10(value)}
      min={Math.log10(min)}
      max={Math.log10(max)}
      step={0.005}
      defaultValue={Math.log10(fallback)}
      format={(v) => {
        const hz = Math.pow(10, v);
        return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
      }}
      onChange={(v) => onChange(Math.round(Math.pow(10, v)))}
    />
  );
}

/** Goniometer: mid on the vertical axis, side on the horizontal, plus a correlation bar. */
function PhaseScope({ getScope }: { getScope: () => { left: Float32Array; right: Float32Array } | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = 132;
    const bar = 14;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = (size + bar) * dpr;
    let frame = 0;
    let held = 0;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Fade the previous frame rather than clearing, so the trace has persistence.
      ctx.fillStyle = "rgba(2, 6, 23, 0.35)";
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(size / 2, 4);
      ctx.lineTo(size / 2, size - 4);
      ctx.moveTo(4, size / 2);
      ctx.lineTo(size - 4, size / 2);
      ctx.stroke();

      const data = getScope();
      let correlation: number | null = null;
      if (data) {
        let cross = 0;
        let powerLeft = 0;
        let powerRight = 0;
        ctx.fillStyle = "#22d3ee";
        const half = size / 2;
        for (let i = 0; i < data.left.length; i += 2) {
          const l = data.left[i];
          const r = data.right[i];
          cross += l * r;
          powerLeft += l * l;
          powerRight += r * r;
          const x = half + (r - l) * 0.7071 * half;
          const y = half - (l + r) * 0.7071 * half;
          ctx.fillRect(x, y, 1.2, 1.2);
        }
        const denominator = Math.sqrt(powerLeft * powerRight);
        if (denominator > 1e-9) correlation = cross / denominator;
      }
      if (correlation !== null) held += (correlation - held) * 0.15;

      ctx.fillStyle = "#020617";
      ctx.fillRect(0, size, size, bar);
      ctx.fillStyle = "rgba(148, 163, 184, 0.3)";
      ctx.fillRect(0, size + 5, size, 4);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(size / 2, size + 3, 1, 8);
      if (correlation !== null) {
        ctx.fillStyle = held < 0 ? "#f43f5e" : "#34d399";
        const x = size / 2 + (held * size) / 2;
        ctx.fillRect(Math.min(x, size / 2), size + 5, Math.abs(x - size / 2), 4);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [getScope]);
  return (
    <div className="flex items-end gap-3">
      <canvas
        ref={canvasRef}
        className="rounded-lg bg-slate-950"
        style={{ width: 132, height: 146 }}
        role="img"
        aria-label="Stereo phase scope and correlation meter"
      />
      <dl className="space-y-1 text-[10px] text-slate-400">
        <div>
          <dt className="font-semibold text-slate-300">Bar</dt>
          <dd>−1 · 0 · +1 correlation</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-300">Green</dt>
          <dd>in phase</dd>
        </div>
        <div>
          <dt className="font-semibold text-rose-300">Red</dt>
          <dd>out of phase</dd>
        </div>
      </dl>
    </div>
  );
}

/** Horizontal peak meter fed from the audio engine. */
function LevelBar({ label, getLevel }: { label: string; getLevel: () => number }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const levelRef = useRef(getLevel);
  useEffect(() => {
    levelRef.current = getLevel;
  });
  useEffect(() => {
    let frame = 0;
    let held = 0;
    const draw = () => {
      const peak = levelRef.current();
      held = peak > held ? peak : held * 0.92;
      const shown = held <= 0.001 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(held) + 60) / 60));
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${shown.toFixed(3)})`;
        barRef.current.style.backgroundColor = held >= 0.999 ? "#f43f5e" : held > 0.7 ? "#fbbf24" : "#34d399";
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-950" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={0}>
      <div ref={barRef} className="h-full origin-left bg-emerald-400" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

const EQ_W = 272;
const EQ_H = 84;
const EQ_POINTS = 136;
const EQ_FREQS = new Float32Array(EQ_POINTS).map((_, i) => 20 * Math.pow(1000, i / (EQ_POINTS - 1)));

/** The track's live spectrum with the EQ curve drawn over it. */
function EqDisplay({
  trackId,
  signature,
  getSpectrum,
  getResponse
}: {
  trackId: string;
  signature: string;
  getSpectrum: (trackId: string) => Float32Array | null;
  getResponse: (trackId: string, freqs: Float32Array<ArrayBuffer>) => Float32Array | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const source = useRef({ getSpectrum, getResponse });
  useEffect(() => {
    source.current = { getSpectrum, getResponse };
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = EQ_W * dpr;
    canvas.height = EQ_H * dpr;
    let frame = 0;
    let tick = 0;
    let response: Float32Array | null = null;
    const xOf = (hz: number) => (Math.log10(hz / 20) / 3) * EQ_W;
    const draw = () => {
      // The curve is re-read a few times a second so slider moves show promptly.
      if (tick++ % 6 === 0) response = source.current.getResponse(trackId, EQ_FREQS);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, EQ_W, EQ_H);
      ctx.fillStyle = "rgba(148, 163, 184, 0.18)";
      for (const hz of [100, 1000, 10000]) ctx.fillRect(Math.round(xOf(hz)), 0, 1, EQ_H);
      ctx.fillRect(0, EQ_H / 2, EQ_W, 1);

      const spectrum = source.current.getSpectrum(trackId);
      if (spectrum) {
        const binHz = 24000 / spectrum.length;
        ctx.beginPath();
        ctx.moveTo(0, EQ_H);
        for (let i = 0; i < EQ_POINTS; i++) {
          const bin = Math.min(spectrum.length - 1, Math.max(1, Math.round(EQ_FREQS[i] / binHz)));
          const level = Math.min(1, Math.max(0, (spectrum[bin] + 100) / 80));
          ctx.lineTo((i / (EQ_POINTS - 1)) * EQ_W, EQ_H - level * EQ_H);
        }
        ctx.lineTo(EQ_W, EQ_H);
        ctx.closePath();
        ctx.fillStyle = "rgba(34, 211, 238, 0.35)";
        ctx.fill();
      }
      if (response) {
        ctx.beginPath();
        for (let i = 0; i < EQ_POINTS; i++) {
          const y = EQ_H / 2 - (response[i] / 15) * (EQ_H / 2);
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo((i / (EQ_POINTS - 1)) * EQ_W, y);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fde047";
        ctx.stroke();
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText("Press play to see the spectrum and EQ curve", 10, EQ_H / 2 - 12);
      }
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("100", xOf(100) + 3, EQ_H - 3);
      ctx.fillText("1k", xOf(1000) + 3, EQ_H - 3);
      ctx.fillText("10k", xOf(10000) + 3, EQ_H - 3);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [trackId, signature]);
  return (
    <canvas
      ref={canvasRef}
      className="block w-full rounded-lg"
      style={{ aspectRatio: `${EQ_W} / ${EQ_H}` }}
      role="img"
      aria-label="Track spectrum with the equaliser curve. The centre line is 0 dB; the curve spans plus and minus 15 dB."
    />
  );
}

/** One in-browser plugin (Web Audio Module) per track, loaded from the internet once the user allows it. */
function WamSection({
  current,
  onLoad,
  onOpen
}: {
  current: Track["wam"];
  onLoad: (wam: Track["wam"]) => void;
  onOpen: () => void;
}) {
  const allowed = useSyncExternalStore(wamConsent.subscribe, wamConsent.getSnapshot, wamConsent.getServerSnapshot);
  const [catalogue, setCatalogue] = useState<WamCatalogueEntry[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    loadWamCatalogue()
      .then((items) => !cancelled && setCatalogue(items.filter((item) => !item.instrument)))
      .catch((err: unknown) => !cancelled && setFailure(err instanceof Error ? err.message : "The plugin catalogue could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed) {
    return (
      <PanelSection title="In-browser plugin" hint="Web Audio Modules: effects that run live in the browser, loaded from the internet.">
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
          This is the one part of Music Suite that reaches the internet. A plugin is someone else&apos;s code: it is downloaded
          when you load it and runs inside this page, where it can read this session. Your audio is still processed on this
          machine. Only load plugins you trust.
        </p>
        <ActionButton className="w-full" onClick={() => wamConsent.set(true)}>
          Allow internet plugins in this browser
        </ActionButton>
      </PanelSection>
    );
  }

  const picked = catalogue?.find((item) => item.url === choice);
  return (
    <PanelSection
      title="In-browser plugin"
      hint="Runs live after this track's effects and is included in exports when the plugin supports it."
    >
      {current ? (
        <>
          <p className="truncate rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200" title={current.url}>
            Loaded: <strong>{current.name}</strong>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton variant="primary" onClick={onOpen}>
              Open controls
            </ActionButton>
            <ActionButton variant="danger" onClick={() => onLoad(undefined)}>
              Remove
            </ActionButton>
          </div>
        </>
      ) : (
        <>
          {failure ? <p className="text-[11px] text-rose-300" role="alert">{failure}</p> : null}
          <select className={fieldClass} aria-label="Community plugin" value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">{catalogue ? "Choose a community plugin…" : failure ? "Catalogue unavailable" : "Loading the catalogue…"}</option>
            {(catalogue ?? []).map((item) => (
              <option key={item.url} value={item.url}>
                {item.name}
                {item.vendor ? ` — ${item.vendor}` : ""}
              </option>
            ))}
          </select>
          {picked?.description ? <p className="text-[11px] text-slate-400">{picked.description}</p> : null}
          <ActionButton className="w-full" disabled={!picked} onClick={() => picked && onLoad({ url: picked.url, name: picked.name })}>
            Load plugin
          </ActionButton>
          <input
            className={fieldClass}
            placeholder="…or paste a plugin address (https://…/index.js)"
            aria-label="Plugin address"
            value={custom}
            onChange={(event) => setCustom(event.target.value.trim())}
          />
          {custom ? (
            <ActionButton
              className="w-full"
              disabled={!isAllowedWamUrl(custom)}
              onClick={() => onLoad({ url: custom, name: new URL(custom).pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? "Plugin" })}
            >
              {isAllowedWamUrl(custom) ? "Load from this address" : "The address must start with https://"}
            </ActionButton>
          ) : null}
        </>
      )}
      <button
        type="button"
        className="h-6 text-left text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
        onClick={() => wamConsent.set(false)}
      >
        Switch internet plugins off again
      </button>
    </PanelSection>
  );
}
