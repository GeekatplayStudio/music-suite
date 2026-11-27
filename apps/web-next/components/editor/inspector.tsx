"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, PanelSection, Slider, fieldClass, formatDb } from "@/components/editor/controls";
import { ArrangeSection } from "@/components/editor/arrange-section";
import { GmInstrumentSection } from "@/components/editor/gm-instrument";
import { type PluginSession, PluginInstrumentSection } from "@/components/editor/plugin-instrument";
import { SynthEditor } from "@/components/editor/synth-editor";
import { AiEditSection } from "@/components/generation/ai-edit-section";
import { FACTORY_PRESETS, loadUserPresets, normalizePatch, type Patch } from "@/lib/editor/synth";
import { generationApi, type ProviderInfo } from "@/lib/generation/api";
import { editorApi } from "@/lib/editor/api";
import { viewOf } from "@/lib/windows";
import { type I18n, type MessageKey, useI18n } from "@/lib/i18n";
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
  /** Start the plugin without the loop, to play it from a MIDI keyboard. */
  onLivePlugin: (clipId: string) => void;
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
  /** Write an arrangement as notes; it needs no clip. */
  onArrange: (params: Record<string, unknown>, title: string) => void;
  /** Sound one note on a track's instrument. */
  onPreviewNote: (trackId: string, pitch: number) => void;
  onOpenPianoRoll: () => void;
  /** Show the selected MIDI clip as sheet music. */
  onOpenSheet: () => void;
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

const CURVES: FadeCurve[] = ["linear", "equal", "scurve"];

type Translate = I18n["t"];

/** A key as stored ("C major") in the interface language. */
function keyText(t: Translate, label: string): string {
  const match = /^([A-G]#?) (major|minor)$/.exec(label);
  return match ? t(match[2] === "major" ? "inspector.major" : "inspector.minor", { note: match[1] }) : label;
}

/** Seconds with the interface's unit. */
function secs(t: Translate, value: number, digits = 2): string {
  return t("inspector.seconds", { v: value.toFixed(digits) });
}

/** A voice preset's name, falling back to its English label for presets added later. */
function presetLabel(t: Translate, preset: { id: string; label: string }): string {
  const key = `inspector.voice.presets.${preset.id}` as MessageKey;
  const text = t(key);
  return text === key ? preset.label : text;
}

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

function JobList({ jobs, onDismiss, projectId }: { jobs: JobEntry[]; onDismiss: (id: string) => void; projectId: string }) {
  const { t } = useI18n();
  if (!jobs.length) return null;
  return (
    <section className="border-b border-white/10 px-4 py-3" aria-live="polite">
      <h3 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-300">{t("inspector.jobs.title")}</h3>
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
                    aria-label={t("inspector.jobs.dismiss")}
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
                <p className="mt-1 text-rose-300">{job.error || t("inspector.jobs.failed")}</p>
              ) : (
                <>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={done ? "h-full bg-emerald-400" : "h-full bg-cyan-400 transition-[width] duration-300"}
                      style={{ width: `${done ? 100 : Math.max(4, job.progress)}%` }}
                    />
                  </div>
                  <p className="mt-1 truncate text-slate-400">{done ? t("inspector.jobs.done") : job.detail || job.stage}</p>
                </>
              )}
              {!failed && !done && ["generate_song", "separate"].includes(job.op) && <button
                className="mt-2 rounded bg-slate-800 px-2 py-1 text-cyan-200" type="button"
                onClick={() => void generationApi.cancelJob(projectId, job.id).catch(() => undefined)}>
                {t("inspector.jobs.stop")}
              </button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Inspector(props: InspectorProps) {
  const { state, clip, track, capabilities } = props;
  const { t, tp } = useI18n();
  const [splitModel, setSplitModel] = useState("standard");
  const [soundPrompt, setSoundPrompt] = useState("");
  const [stems, setStems] = useState(4);
  /** Song to MIDI engine: "auto" lets the backend choose the best one installed. */
  const [midiEngine, setMidiEngine] = useState<"auto" | "stems" | "muscriptor">("auto");
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
        setPluginDetail({ status: "error", message: err instanceof Error ? err.message : t("inspector.plugins.loadFailed") });
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
        : windowJob.job.stage === "live"
          ? "live"
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
      const trackName = state.tracks.find((item) => item.id === other.trackId)?.name ?? t("inspector.track");
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
      aria-label={t("inspector.label")}
    >
      <JobList jobs={props.jobs} onDismiss={props.onDismissJob} projectId={props.projectId} />

      {clip ? (
        <>
          <PanelSection
            title={props.selectionCount > 1 ? t("inspector.clip.titleMany", { n: props.selectionCount }) : t("inspector.clip.title")}
            help="clip"
            hint={`${formatTime(clip.start)} → ${formatTime(clip.start + clip.duration)} · ${secs(t, clip.duration)}`}
          >
            <input
              className={fieldClass}
              value={clip.name}
              aria-label={t("inspector.clip.name")}
              onChange={(event) => props.onPatchClip({ name: event.target.value.slice(0, 80) }, "clip-name")}
            />
            <Slider
              label={t("inspector.clip.gain")}
              value={clip.gainDb}
              min={-24}
              max={24}
              step={0.5}
              defaultValue={0}
              format={formatDb}
              onChange={(gainDb) => props.onPatchClip({ gainDb }, "clip-gain")}
            />
            <Slider
              label={t("inspector.clip.fadeIn")}
              value={clip.fadeIn}
              min={0}
              max={Math.max(0.01, Math.min(10, clip.duration - clip.fadeOut))}
              step={0.01}
              defaultValue={0}
              format={(v) => secs(t, v)}
              onChange={(fadeIn) => props.onPatchClip({ fadeIn }, "clip-fadein")}
            />
            <Slider
              label={t("inspector.clip.fadeOut")}
              value={clip.fadeOut}
              min={0}
              max={Math.max(0.01, Math.min(10, clip.duration - clip.fadeIn))}
              step={0.01}
              defaultValue={0}
              format={(v) => secs(t, v)}
              onChange={(fadeOut) => props.onPatchClip({ fadeOut }, "clip-fadeout")}
            />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [t("inspector.clip.fadeInShape"), "fadeInCurve", clip.fadeInCurve],
                  [t("inspector.clip.fadeOutShape"), "fadeOutCurve", clip.fadeOutCurve]
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
                    {CURVES.map((curve) => (
                      <option key={curve} value={curve}>
                        {t(`inspector.clip.curves.${curve}`)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton aria-pressed={clip.reversed} onClick={() => props.onPatchClip({ reversed: !clip.reversed }, "")}>
                {clip.reversed ? t("inspector.clip.reversed") : t("inspector.clip.reverse")}
              </ActionButton>
              <ActionButton aria-pressed={clip.muted} onClick={() => props.onPatchClip({ muted: !clip.muted }, "")}>
                {clip.muted ? t("inspector.clip.muted") : t("inspector.clip.mute")}
              </ActionButton>
              <ActionButton onClick={props.onSplit} title={t("inspector.clip.splitTitle")}>
                {t("inspector.clip.split")}
              </ActionButton>
              <ActionButton onClick={props.onDuplicate} title={t("inspector.clip.duplicateTitle")}>
                {t("inspector.clip.duplicate")}
              </ActionButton>
            </div>
            <ActionButton variant="danger" className="w-full" onClick={props.onDelete} title={t("inspector.clip.deleteTitle")}>
              {t("inspector.clip.delete")}
            </ActionButton>
          </PanelSection>

          {clip.notes ? (
            <>
              <PanelSection
                title={t("inspector.midi.title")}
                help="midi-clip"
                hint={tp("inspector.midi.hint", clip.notes.length)}
              >
                <ActionButton variant="primary" className="w-full" onClick={props.onOpenPianoRoll} title="P">
                  {t("inspector.midi.openPianoRoll")}
                </ActionButton>
                <ActionButton className="w-full" onClick={props.onOpenSheet} title={t("inspector.midi.sheetTitle")}>
                  {t("inspector.midi.sheet")}
                </ActionButton>
                <div className="grid grid-cols-4 gap-1.5">
                  {[-12, -1, 1, 12].map((shift) => (
                    <ActionButton
                      key={shift}
                      title={tp(shift > 0 ? "inspector.midi.transposeUp" : "inspector.midi.transposeDown", Math.abs(shift))}
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
                  title={t("inspector.midi.quantiseTitle")}
                  onClick={() => {
                    const step = 60 / state.bpm / 4;
                    props.onPatchClip({ notes: (clip.notes ?? []).map((note) => ({ ...note, t: Math.round(note.t / step) * step })) }, "");
                  }}
                >
                  {t("inspector.midi.quantise")}
                </ActionButton>
                <ActionButton className="w-full" disabled={!clip.notes.length} onClick={props.onExportMidi}>
                  {t("inspector.midi.export")}
                </ActionButton>
              </PanelSection>
              {track ? (
                <PanelSection title={t("inspector.instrument.title")} help="instrument-types" hint={t("inspector.instrument.hint")}>
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="w-16 shrink-0">{t("inspector.instrument.type")}</span>
                    <select
                      className={fieldClass}
                      value={track.synth.kind}
                      aria-label={t("inspector.instrument.typeLabel")}
                      onChange={(event) => props.onPatchTrack({ synth: { ...track.synth, kind: event.target.value as typeof track.synth.kind } }, "")}
                    >
                      <option value="synth">{t("inspector.instrument.synth")}</option>
                      <option value="drums">{t("inspector.instrument.drums")}</option>
                    </select>
                  </label>
                  <GmInstrumentSection synth={track.synth} onSet={(synth) => props.onPatchTrack({ synth }, "")} />
                  {track.synth.kind === "drums" ? (
                    <p className="text-[11px] text-slate-400">
                      {t("inspector.instrument.drumsHelp")}
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
                  onLive={() => props.onLivePlugin(clip.id)}
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
            title={t("inspector.stems.title")}
            help="separate-stems"
            hint={
              capabilities
                ? t("inspector.stems.hint", {
                    engine: capabilities.separation.engine,
                    where: accelerator === "cuda" ? t("inspector.stems.onGpu") : accelerator === "mps" ? t("inspector.stems.onAppleGpu") : ""
                  })
                : undefined
            }
          >
            <select className={fieldClass} aria-label={t("inspector.stems.model")} value={splitModel}
              onChange={(event) => setSplitModel(event.target.value)}>
              <option value="standard">{t("inspector.stems.standard")}</option>
              <option value="mega53">{t("inspector.stems.mega53")}</option>
              <option value="sam-audio">{t("inspector.stems.sam")}</option>
            </select>
            {splitModel !== "standard" ? <>
              {splitModel === "sam-audio" && <input className={fieldClass} aria-label={t("inspector.stems.soundLabel")}
                placeholder={t("inspector.stems.soundPlaceholder")} maxLength={160} value={soundPrompt}
                onChange={(event) => setSoundPrompt(event.target.value)} />}
              <a href="/models" className="text-xs text-cyan-300">{t("inspector.stems.install")}</a>
              <ActionButton variant="primary" className="w-full"
                disabled={busy || (splitModel === "sam-audio" && !soundPrompt.trim())}
                onClick={() => props.onRunJob("separate", splitModel === "mega53"
                  ? { model: splitModel } : { model: splitModel, prompt: soundPrompt.trim() },
                  t("inspector.stems.jobExtract", { name: clip.name }))}>
                {splitModel === "mega53" ? t("inspector.stems.extractTracks") : t("inspector.stems.extractSound")}
              </ActionButton>
            </> : <>
            <div className="flex gap-2">
              <select
                className={fieldClass}
                value={stemChoice}
                aria-label={t("inspector.stems.count")}
                onChange={(event) => setStems(Number(event.target.value))}
              >
                {stemOptions.map((count) => (
                  <option key={count} value={count}>
                    {count === 2 ? t("inspector.stems.two") : count === 4 ? t("inspector.stems.four") : t("inspector.stems.six")}
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
              <span>{t("inspector.stems.drumKit")}</span>
            </label>
            <label className={`flex items-start gap-2 text-[11px] ${fineSplit ? "text-slate-300" : "text-slate-500"}`}>
              <input
                type="checkbox"
                className="mt-0.5 accent-cyan-400"
                checked={leadOn}
                disabled={!fineSplit}
                onChange={(event) => setLeadBacking(event.target.checked)}
              />
              <span>{t("inspector.stems.leadBacking")}</span>
            </label>
            {!fineSplit ? (
              <p className="text-[11px] leading-snug text-slate-400">
                {t("inspector.stems.needsPack")}{" "}
                <a href="/models" target="_blank" rel="noreferrer" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
                  {t("inspector.stems.installIt")}
                </a>
                {t("inspector.stems.thenReload")}
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
                  tp("inspector.stems.jobSeparate", stemTotal, { name: clip.name })
                )
              }
            >
              {tp("inspector.stems.separate", stemTotal)}
            </ActionButton>
            </>}
            {fineSplit && clipLabel === "drums" ? (
              <ActionButton
                className="w-full"
                disabled={busy}
                onClick={() => props.onRunJob("separate", { part: "drums" }, t("inspector.stems.jobKit", { name: clip.name }))}
              >
                {t("inspector.stems.kit")}
              </ActionButton>
            ) : null}
            {fineSplit && clipLabel === "vocals" ? (
              <ActionButton
                className="w-full"
                disabled={busy}
                onClick={() => props.onRunJob("separate", { part: "vocals" }, t("inspector.stems.jobLead", { name: clip.name }))}
              >
                {t("inspector.stems.lead")}
              </ActionButton>
            ) : null}
          </PanelSection>

          <PanelSection
            title={t("inspector.repair.title")}
            help="repair"
            hint={noisePrint ? t("inspector.repair.hintRange") : t("inspector.repair.hintTip")}
          >
            <Slider
              label={t("inspector.repair.strength")}
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
                  t("inspector.repair.jobDenoise", { name: clip.name })
                )
              }
            >
              {t("inspector.repair.denoise")}
            </ActionButton>
            <NumberField label={t("inspector.repair.loudness")} value={targetLufs} min={-30} max={-6} step={0.5} suffix="LUFS" onChange={setTargetLufs} />
            <ActionButton
              className="w-full"
              disabled={busy}
              onClick={() =>
                props.onRunJob("normalize", { target_lufs: targetLufs, true_peak_dbfs: -1 }, t("inspector.repair.jobNormalise", { name: clip.name }))
              }
            >
              {t("inspector.repair.normalise")}
            </ActionButton>
          </PanelSection>

          {clip.takeGroup ? (
            <PanelSection
              title={t("inspector.takes.title")}
              help="takes"
              hint={t("inspector.takes.hint")}
            >
              <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300">
                {t("inspector.takes.summary", {
                  audible: state.clips.filter((c) => c.takeGroup === clip.takeGroup && !c.muted).length,
                  total: state.clips.filter((c) => c.takeGroup === clip.takeGroup).length
                })}{" "}
                {t("inspector.takes.pieceState").split("{state}")[0]}
                <strong className={clip.muted ? "text-slate-400" : "text-emerald-300"}>
                  {clip.muted ? t("inspector.takes.silent") : t("inspector.takes.audible")}
                </strong>
                {t("inspector.takes.pieceState").split("{state}")[1]}
              </p>
              <ActionButton variant="primary" className="w-full" onClick={() => props.onComp(clip.id, false)}>
                {t("inspector.takes.useTake")}
              </ActionButton>
              <ActionButton
                className="w-full"
                disabled={!props.range}
                title={props.range ? undefined : t("inspector.takes.rangeFirst")}
                onClick={() => props.onComp(clip.id, true)}
              >
                {t("inspector.takes.useInRange")}
              </ActionButton>
            </PanelSection>
          ) : null}

          {props.selectionCount === 1 && !clip.reversed ? (
            <PanelSection
              title={t("inspector.warp.title")}
              help="warp"
              hint={t("inspector.warp.hint")}
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
                {t("inspector.warp.addMarker")}
              </ActionButton>
              {(clip.warp ?? []).map((marker, index) => {
                const setMarker = (t: number | null) =>
                  props.onPatchClip(
                    { warp: (clip.warp ?? []).flatMap((m, i) => (i !== index ? [m] : t === null ? [] : [{ ...m, t }])) },
                    t === null ? "" : `warp-${index}`
                  );
                return (
                  <div key={`${marker.s}-${index}`} className="flex items-center gap-1.5 text-[11px] text-slate-300">
                    <span className="w-14 shrink-0 font-mono tabular-nums text-orange-300">{secs(t, marker.s)}</span>
                    <span aria-hidden>→</span>
                    <input
                      type="number"
                      className={fieldClass}
                      aria-label={t("inspector.warp.targetLabel", { s: marker.s.toFixed(2) })}
                      step={0.01}
                      min={0}
                      value={Number(marker.t.toFixed(3))}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value >= 0) setMarker(value);
                      }}
                    />
                    <ActionButton
                      title={t("inspector.warp.hereTitle")}
                      onClick={() => setMarker(Math.max(0.05, props.getPosition() - clip.start))}
                    >
                      {t("inspector.warp.here")}
                    </ActionButton>
                    <button
                      type="button"
                      aria-label={t("inspector.warp.removeMarker")}
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
                  props.onRunJob("warp", { markers }, t("inspector.warp.jobWarp", { name: clip.name }));
                }}
              >
                {t("inspector.warp.apply")}
              </ActionButton>
              <ActionButton
                className="w-full"
                disabled={busy}
                title={t("inspector.warp.quantiseTitle")}
                onClick={() => props.onRunJob("quantize", { bpm: state.bpm }, t("inspector.warp.jobQuantise", { name: clip.name }))}
              >
                {t("inspector.warp.quantise", { bpm: state.bpm })}
              </ActionButton>
              {props.range && props.range.end - props.range.start > 0.1 ? (
                <ActionButton
                  className="w-full"
                  disabled={busy || clip.duration / (props.range.end - props.range.start) < 0.25 || clip.duration / (props.range.end - props.range.start) > 4}
                  onClick={() => {
                    const length = (props.range?.end ?? 0) - (props.range?.start ?? 0);
                    props.onRunJob("stretch", { rate: clip.duration / length }, t("inspector.warp.jobFit", { name: clip.name, length: secs(t, length) }));
                  }}
                >
                  {t("inspector.warp.stretchToRange")}
                </ActionButton>
              ) : null}
            </PanelSection>
          ) : null}

          <PanelSection
            title={t("inspector.restore.title")}
            help="restore"
            hint={t("inspector.restore.hint")}
          >
            <div className="grid grid-cols-2 gap-2">
              <ActionButton disabled={busy} title={t("inspector.restore.declickTitle")} onClick={() => props.onRunJob("declick", { sensitivity: restoreAmount }, t("inspector.restore.jobDeclick", { name: clip.name }))}>
                DeClick
              </ActionButton>
              <ActionButton disabled={busy} title={t("inspector.restore.dehumTitle")} onClick={() => props.onRunJob("dehum", {}, t("inspector.restore.jobDehum", { name: clip.name }))}>
                DeHum
              </ActionButton>
              <ActionButton disabled={busy} title={t("inspector.restore.declipTitle")} onClick={() => props.onRunJob("declip", {}, t("inspector.restore.jobDeclip", { name: clip.name }))}>
                DeClip
              </ActionButton>
              <ActionButton disabled={busy} title={t("inspector.restore.dereverbTitle")} onClick={() => props.onRunJob("dereverb", { strength: restoreAmount }, t("inspector.restore.jobDereverb", { name: clip.name }))}>
                DeReverb
              </ActionButton>
            </div>
            <Slider
              label={t("inspector.restore.amount")}
              value={restoreAmount}
              min={0.1}
              max={1}
              step={0.05}
              defaultValue={0.5}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={setRestoreAmount}
            />
            <p className="text-[11px] text-slate-400">{t("inspector.restore.amountHint")}</p>
            {props.selectionCount > 1 ? (
              <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-cyan-200">
                {t("inspector.restore.batch", { n: props.selectionCount })}
              </p>
            ) : null}
          </PanelSection>

          <PanelSection
            title={t("inspector.pitch.title")}
            help="pitch-and-time"
            hint={capabilities ? t("inspector.pitch.hint", { engine: capabilities.stretch.engine }) : undefined}
          >
            <Slider
              label={t("inspector.pitch.pitch")}
              value={semitones}
              min={-12}
              max={12}
              step={1}
              defaultValue={0}
              format={(v) => t("inspector.semitones", { v: `${v > 0 ? "+" : ""}${v}` })}
              onChange={setSemitones}
            />
            <ActionButton
              className="w-full"
              disabled={busy || semitones === 0}
              onClick={() => props.onRunJob("pitch", { semitones }, t("inspector.pitch.jobPitch", { name: clip.name, st: t("inspector.semitones", { v: semitones }) }))}
            >
              {t("inspector.pitch.applyPitch")}
            </ActionButton>
            <Slider
              label={t("inspector.pitch.speed")}
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
              onClick={() => props.onRunJob("stretch", { rate: speed / 100 }, t("inspector.pitch.jobStretch", { name: clip.name, speed }))}
            >
              {t("inspector.pitch.applyStretch")}
            </ActionButton>
          </PanelSection>

          <PanelSection
            title={t("inspector.match.title")}
            help="ai-match"
            hint={t("inspector.match.hint")}
          >
            <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300">
              {meta
                ? t("inspector.match.detected", {
                    tempo: meta.bpm ? `${meta.bpm.toFixed(1)} BPM` : t("inspector.match.tempoUnknown"),
                    key: meta.keyLabel ? keyText(t, meta.keyLabel) : t("inspector.match.keyUnknown"),
                    lufs: meta.lufs !== null ? ` · ${meta.lufs.toFixed(1)} LUFS` : ""
                  })
                : t("inspector.match.notAnalysed")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton disabled={busy} onClick={() => props.onRunJob("analyze", {}, t("inspector.match.jobAnalyse", { name: clip.name }))}>
                {meta ? t("inspector.match.reanalyse") : t("inspector.match.detect")}
              </ActionButton>
              <ActionButton
                disabled={!meta || (!meta.bpm && !meta.keyLabel)}
                onClick={() => meta && props.onUseAsProject(meta)}
                title={t("inspector.match.setProjectTitle")}
              >
                {t("inspector.match.setProject")}
              </ActionButton>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-16 shrink-0">{t("inspector.match.matchTo")}</span>
              <select
                className={fieldClass}
                value={matchTarget}
                aria-label={t("inspector.match.target")}
                onChange={(event) => setMatchTarget(event.target.value)}
              >
                <option value="project">
                  {t("inspector.match.project", { bpm: state.bpm, key: state.keyLabel ? `, ${keyText(t, state.keyLabel)}` : "" })}
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
                  [t("inspector.match.tempo"), matchTempo, setMatchTempo],
                  [t("inspector.match.key"), matchKey, setMatchKey],
                  [t("inspector.match.loudness"), matchLoudness, setMatchLoudness]
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
                  t("inspector.match.jobMatch", { name: clip.name })
                );
              }}
            >
              {t("inspector.match.run")}
            </ActionButton>
          </PanelSection>

          {capabilities?.plugins.available && props.plugins.length ? (
            <PanelSection
              title={t("inspector.plugins.title")}
              help="plugins"
              hint={t("inspector.plugins.hint", { formats: capabilities.plugins.formats.join(" / ").toUpperCase() })}
            >
              <select
                className={fieldClass}
                value={pluginId}
                aria-label={t("inspector.plugins.label")}
                onChange={(event) => choosePlugin(event.target.value)}
              >
                <option value="">{t("inspector.plugins.choose")}</option>
                {props.plugins.map((plugin) => (
                  <option key={plugin.id} value={plugin.id}>
                    {plugin.name} ({plugin.format.toUpperCase()})
                  </option>
                ))}
              </select>
              {pluginDetail.status === "loading" ? (
                <p className="text-[11px] text-slate-400" aria-live="polite">{t("inspector.plugins.loading")}</p>
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
                      <p className="text-[11px] text-slate-400">{t("inspector.plugins.showing", { n: pluginDetail.parameters.length })}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">{t("inspector.plugins.none")}</p>
                )
              ) : null}
              <ActionButton
                className="w-full"
                disabled={!pluginId || pluginDetail.status !== "ready"}
                title={t("inspector.plugins.auditionTitle")}
                onClick={() => props.onAudition(pluginId, pluginValues)}
              >
                {t("inspector.plugins.audition")}
              </ActionButton>
              <ActionButton
                className="w-full"
                disabled={busy || !pluginId || pluginDetail.status === "loading" || pluginDetail.status === "error"}
                onClick={() => {
                  const plugin = props.plugins.find((item) => item.id === pluginId);
                  props.onRunJob("plugin", { plugin_id: pluginId, parameters: pluginValues }, t("inspector.plugins.jobApply", { name: plugin?.name ?? t("inspector.plugin") }));
                }}
              >
                {t("inspector.plugins.render")}
              </ActionButton>
            </PanelSection>
          ) : null}
          <PanelSection title={t("inspector.compose.title")} help="compose" hint={t("inspector.compose.hint")}>
            <ActionButton
              className="w-full"
              disabled={busy}
              title={
                capabilities?.transcription?.engine === "basic-pitch"
                  ? t("inspector.compose.toMidiChords")
                  : t("inspector.compose.toMidiMono")
              }
              onClick={() => props.onRunJob("to_midi", {}, t("inspector.compose.jobToMidi", { name: clip.name }))}
            >
              {t("inspector.compose.toMidi")}
            </ActionButton>
            {capabilities?.song_to_midi?.whole_mix === "ready" ? (
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="w-16 shrink-0">{t("inspector.compose.method")}</span>
                <select
                  className={fieldClass}
                  value={midiEngine}
                  aria-label={t("inspector.compose.methodLabel")}
                  disabled={busy}
                  onChange={(event) => setMidiEngine(event.target.value as typeof midiEngine)}
                >
                  <option value="auto">{t("inspector.compose.auto")}</option>
                  <option value="muscriptor">{t("inspector.compose.muscriptor")}</option>
                  <option value="stems">{t("inspector.compose.stemsMethod")}</option>
                </select>
              </label>
            ) : null}
            <ActionButton
              variant="primary"
              className="w-full"
              disabled={busy}
              title={
                capabilities?.song_to_midi
                  ? t("inspector.compose.wholeTitle", {
                      stems: capabilities.song_to_midi.stems,
                      piano: capabilities.song_to_midi.piano,
                      poly: capabilities.song_to_midi.poly,
                      drums: capabilities.song_to_midi.drums
                    })
                  : t("inspector.compose.wholeTitleDefault")
              }
              onClick={() =>
                props.onRunJob("song_to_midi", { engine: midiEngine }, t("inspector.compose.jobWhole", { name: clip.name }))
              }
            >
              {t("inspector.compose.whole")}
            </ActionButton>
            <p className="text-[11px] leading-snug text-slate-400">
              {capabilities?.song_to_midi?.whole_mix === "ready"
                ? t("inspector.compose.muscriptorNote")
                : t("inspector.compose.stemsNote")}
              {t("inspector.compose.checkByEar")}
              {capabilities?.song_to_midi?.whole_mix === "needs-access" ? t("inspector.compose.needsAccess") : ""}
            </p>
            <ActionButton
              className="w-full"
              disabled={busy}
              title={t("inspector.compose.sectionsTitle")}
              onClick={() => props.onRunJob("structure", {}, t("inspector.compose.jobSections", { name: clip.name }))}
            >
              {t("inspector.compose.sections")}
            </ActionButton>
          </PanelSection>

          <AiEditSection
            sourceSeconds={props.assets.get(clip.assetId)?.duration_seconds ?? clip.offset + clip.duration}
            stemLabel={props.assets.get(clip.assetId)?.source === "stem" ? clipLabel : undefined}
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
            title={t("inspector.generate.title")}
            help="generate-a-part"
            hint={t("inspector.generate.hint")}
          >
            {props.generation?.available && props.generation.node_installed ? (
              <>
                <textarea
                  className={`${fieldClass} h-16 resize-none py-1.5`}
                  placeholder={t("inspector.generate.placeholder")}
                  aria-label={t("inspector.generate.label")}
                  maxLength={300}
                  value={genPrompt}
                  onChange={(event) => setGenPrompt(event.target.value)}
                />
                <Slider label={t("inspector.generate.length")} value={genSeconds} min={4} max={60} step={1} defaultValue={15} format={(v) => t("inspector.seconds", { v })} onChange={setGenSeconds} />
                {props.generation.models.length ? (
                  <select
                    className={fieldClass}
                    aria-label={t("inspector.generate.model")}
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
                      t("inspector.generate.jobGenerate", { prompt: genPrompt.trim().slice(0, 30) })
                    );
                  }}
                >
                  {t("inspector.generate.run")}
                </ActionButton>
              </>
            ) : (
              <>
                <p className="rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-300">
                  {props.generation?.available
                    ? t("inspector.generate.noNodes")
                    : t("inspector.generate.notRunning")}
                </p>
                <ActionButton className="w-full" onClick={props.onCheckGeneration}>
                  {t("inspector.generate.checkAgain")}
                </ActionButton>
              </>
            )}
          </PanelSection>

          <PanelSection
            title={t("inspector.favourites.title")}
            help="favourites"
            hint={t("inspector.favourites.hint")}
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
                    ★ {favourite.name} <span className="font-normal text-slate-400">· {tp("inspector.favourites.steps", favourite.steps.length)}</span>
                  </span>
                </ActionButton>
                <button
                  type="button"
                  aria-label={t("inspector.favourites.remove", { name: favourite.name })}
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
                  {t("inspector.favourites.justRun", { steps: props.recentSteps.slice(-3).map((step) => step.label).join(" → ") })}
                </p>
                <div className="flex items-center gap-1.5">
                  <select
                    className={`${fieldClass} w-24 shrink-0`}
                    style={{ width: "6rem" }}
                    aria-label={t("inspector.favourites.countLabel")}
                    value={Math.min(favouriteCount, props.recentSteps.length)}
                    onChange={(event) => setFavouriteCount(Number(event.target.value))}
                  >
                    {[1, 2, 3].filter((n) => n <= props.recentSteps.length).map((n) => (
                      <option key={n} value={n}>
                        {t("inspector.favourites.last", { n })}
                      </option>
                    ))}
                  </select>
                  <input
                    className={fieldClass}
                    placeholder={t("inspector.favourites.name")}
                    aria-label={t("inspector.favourites.nameLabel")}
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
                    {t("inspector.favourites.save")}
                  </ActionButton>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-400">{t("inspector.favourites.empty")}</p>
            )}
          </PanelSection>
            </>
          )}
        </>
      ) : (
        <PanelSection title={t("inspector.project.title")} help="project" hint={t("inspector.project.hint")}>
          <NumberField
            label={t("inspector.project.tempo")}
            value={state.bpm}
            min={40}
            max={240}
            step={0.1}
            suffix="BPM"
            onChange={(bpm) => props.onPatchState({ bpm }, "bpm")}
          />
          <NumberField
            label={t("inspector.project.beatsPerBar")}
            value={state.beatsPerBar}
            min={2}
            max={12}
            step={1}
            onChange={(beatsPerBar) => props.onPatchState({ beatsPerBar: Math.round(beatsPerBar) }, "beats")}
          />
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">{t("inspector.project.beatIs")}</span>
            <select
              className={fieldClass}
              value={state.beatUnit ?? 4}
              aria-label={t("inspector.project.beatUnitLabel")}
              title={t("inspector.project.beatUnitTitle")}
              onChange={(event) => props.onPatchState({ beatUnit: event.target.value === "8" ? 8 : 4 }, "")}
            >
              <option value={4}>{t("inspector.project.quarter", { sig: `${state.beatsPerBar}/4` })}</option>
              <option value={8}>{t("inspector.project.eighth", { sig: `${state.beatsPerBar}/8` })}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">{t("inspector.project.key")}</span>
            <select
              className={fieldClass}
              value={state.keyLabel ?? ""}
              aria-label={t("inspector.project.keyLabel")}
              onChange={(event) => props.onPatchState({ keyLabel: event.target.value || null }, "")}
            >
              <option value="">{t("inspector.project.notSet")}</option>
              {KEYS.map((key) => (
                <option key={key} value={key}>
                  {keyText(t, key)}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label={t("inspector.project.master")}
            value={state.masterDb}
            min={-60}
            max={6}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(masterDb) => props.onPatchState({ masterDb }, "master")}
          />
          <Toggle
            label={t("inspector.project.limiter")}
            hint={t("inspector.project.limiterHint")}
            checked={state.limiter}
            onChange={(limiter) => props.onPatchState({ limiter }, "")}
          />
          {state.limiter ? (
            <Slider
              label={t("inspector.project.ceiling")}
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
            label={t("inspector.project.crossfade")}
            hint={t("inspector.project.crossfadeHint")}
            checked={state.autoCrossfade}
            onChange={(autoCrossfade) => props.onPatchState({ autoCrossfade }, "")}
          />
          <ActionButton className="w-full" onClick={props.onAddMidiTrack} title={t("inspector.project.addMidiTitle")}>
            {t("inspector.project.addMidi")}
          </ActionButton>
        </PanelSection>
      )}
      {!clip ? (
        <ArrangeSection
          providers={props.songProviders}
          busy={props.jobs.some((j) => j.clipId === "" && j.job.status !== "completed" && j.job.status !== "failed")}
          projectTempo={state.clips.length ? state.bpm : null}
          projectKey={state.clips.length ? state.keyLabel : null}
          beatsPerBar={state.beatsPerBar}
          beatUnit={state.beatUnit ?? 4}
          onRun={props.onArrange}
        />
      ) : null}
      {!clip ? (
        <PanelSection
          title={t("inspector.createSong.title")}
          help="ai-song-studio"
          hint={t("inspector.createSong.hint")}
        >
          <ActionButton variant="primary" className="w-full" onClick={props.onOpenSongStudio}>
            {t("inspector.createSong.open")}
          </ActionButton>
        </PanelSection>
      ) : null}

      {track ? (
        <PanelSection title={t("inspector.trackPanel.title", { name: track.name })} help="track-effects-and-buses" hint={t("inspector.trackPanel.hint")}>
          <Slider
            label={t("inspector.trackPanel.low")}
            value={track.eqLow}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(eqLow) => props.onPatchTrack({ eqLow }, "eq-low")}
          />
          <Slider
            label={t("inspector.trackPanel.mid")}
            value={track.eqMid}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(eqMid) => props.onPatchTrack({ eqMid }, "eq-mid")}
          />
          <Slider
            label={t("inspector.trackPanel.high")}
            value={track.eqHigh}
            min={-12}
            max={12}
            step={0.5}
            defaultValue={0}
            format={formatDb}
            onChange={(eqHigh) => props.onPatchTrack({ eqHigh }, "eq-high")}
          />
          <Slider
            label={t("inspector.trackPanel.width")}
            value={track.width}
            min={0}
            max={2}
            step={0.05}
            defaultValue={1}
            format={(v) => (v === 0 ? t("inspector.trackPanel.mono") : `${Math.round(v * 100)}%`)}
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
            {eqDetail ? t("inspector.trackPanel.eqHide") : t("inspector.trackPanel.eqShow")}
          </button>
          {eqDetail ? (
            <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
              <FreqSlider label={t("inspector.trackPanel.lowAt")} value={track.eqLowFreq} min={30} max={600} fallback={EQ_DEFAULTS.eqLowFreq} onChange={(eqLowFreq) => props.onPatchTrack({ eqLowFreq }, "eq-lf")} />
              <FreqSlider label={t("inspector.trackPanel.midAt")} value={track.eqMidFreq} min={150} max={8000} fallback={EQ_DEFAULTS.eqMidFreq} onChange={(eqMidFreq) => props.onPatchTrack({ eqMidFreq }, "eq-mf")} />
              <Slider label={t("inspector.trackPanel.midQ")} value={track.eqMidQ} min={0.2} max={8} step={0.1} defaultValue={EQ_DEFAULTS.eqMidQ} format={(v) => v.toFixed(1)} onChange={(eqMidQ) => props.onPatchTrack({ eqMidQ }, "eq-mq")} />
              <FreqSlider label={t("inspector.trackPanel.highAt")} value={track.eqHighFreq} min={1500} max={16000} fallback={EQ_DEFAULTS.eqHighFreq} onChange={(eqHighFreq) => props.onPatchTrack({ eqHighFreq }, "eq-hf")} />
            </div>
          ) : null}
          {state.buses.length ? (
            <>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="w-16 shrink-0">{t("inspector.trackPanel.output")}</span>
                <select
                  className={fieldClass}
                  value={state.buses.some((b) => b.id === track.output) ? track.output : "master"}
                  aria-label={t("inspector.trackPanel.outputLabel")}
                  onChange={(event) => props.onPatchTrack({ output: event.target.value }, "")}
                >
                  <option value="master">{t("inspector.trackPanel.master")}</option>
                  {state.buses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {t("inspector.trackPanel.bus", { name: bus.name })}
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
                        aria-label={t("inspector.trackPanel.sendTo", { name: bus.name })}
                        title={t("inspector.trackPanel.sendTo", { name: bus.name })}
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
              <span className="min-w-0 flex-1">{tp("inspector.trackPanel.automation", automationPoints)}</span>
              <ActionButton onClick={() => props.onPatchTrack({ volumeAuto: [], panAuto: [], auto: {} }, "")}>{t("inspector.trackPanel.clear")}</ActionButton>
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">{t("inspector.trackPanel.colour")}</span>
            <div className="flex flex-wrap gap-1.5">
              {TRACK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={t("inspector.trackPanel.colourLabel", { color })}
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
        <PanelSection title={t("inspector.phase.title")} help="sections-markers-and-media" hint={t("inspector.phase.hint")}>
          <PhaseScope getScope={props.getScope} />
        </PanelSection>
      ) : null}

      {!clip ? (
        <PanelSection title={t("inspector.buses.title")} help="track-effects-and-buses" hint={t("inspector.buses.hint")}>
          <div className="grid grid-cols-3 gap-1.5">
            <ActionButton onClick={() => props.onAddBus("reverb")}>{t("inspector.buses.reverb")}</ActionButton>
            <ActionButton onClick={() => props.onAddBus("delay")}>{t("inspector.buses.delay")}</ActionButton>
            <ActionButton onClick={() => props.onAddBus("group")}>{t("inspector.buses.group")}</ActionButton>
          </div>
          {state.buses.map((bus) => (
            <div key={bus.id} className="space-y-1 rounded-lg bg-slate-900 p-2">
              <div className="flex items-center gap-1.5">
                <input
                  className={fieldClass}
                  value={bus.name}
                  aria-label={t("inspector.buses.name")}
                  onChange={(event) => props.onPatchBus(bus.id, { name: event.target.value.slice(0, 30) }, "bus-name")}
                />
                <button
                  type="button"
                  aria-label={t("inspector.buses.mute", { name: bus.name })}
                  aria-pressed={bus.mute}
                  onClick={() => props.onPatchBus(bus.id, { mute: !bus.mute }, "")}
                  className={`h-8 w-8 shrink-0 rounded-lg text-[11px] font-bold ${bus.mute ? "bg-amber-400 text-slate-950" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}
                >
                  M
                </button>
                <button
                  type="button"
                  aria-label={t("inspector.buses.delete", { name: bus.name })}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                  onClick={() => props.onRemoveBus(bus.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Slider label={t("inspector.buses.level")} value={bus.volumeDb} min={-60} max={6} step={0.5} defaultValue={0} format={formatDb} onChange={(volumeDb) => props.onPatchBus(bus.id, { volumeDb }, "bus-vol")} />
              <LevelBar label={t("inspector.buses.levelLabel", { name: bus.name })} getLevel={() => props.getBusLevel(bus.id)} />
              <button
                type="button"
                className="h-6 text-left text-[11px] text-cyan-300 underline-offset-2 hover:underline"
                aria-expanded={openBusId === bus.id}
                onClick={() => setOpenBusId(openBusId === bus.id ? null : bus.id)}
              >
                {openBusId === bus.id ? t("inspector.buses.hideFx") : t("inspector.buses.showFx")}
              </button>
              {openBusId === bus.id ? (
                <EffectRack bare fx={bus.fx} onChange={(fx, key) => props.onPatchBus(bus.id, { fx }, key)} />
              ) : null}
            </div>
          ))}
          {state.buses.length ? (
            <p className="text-[11px] text-slate-400">{t("inspector.buses.routeHint")}</p>
          ) : null}
        </PanelSection>
      ) : null}

      {!clip ? (
        <PanelSection title={t("inspector.sections.title")} help="sections-markers-and-media" hint={t("inspector.sections.hint")}>
          <ActionButton className="w-full" disabled={!props.range} onClick={props.onAddSection} title="Shift+R">
            {props.range ? t("inspector.sections.add") : t("inspector.sections.highlightFirst")}
          </ActionButton>
          {state.regions.map((region) => (
            <div key={region.id} className="space-y-1 rounded-lg bg-slate-900 p-2">
              <div className="flex items-center gap-1.5">
                <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: region.color }} aria-hidden />
                <input
                  className={fieldClass}
                  value={region.name}
                  aria-label={t("inspector.sections.name")}
                  onChange={(event) => props.onRegion("rename", region.id, event.target.value.slice(0, 40))}
                />
                <button
                  type="button"
                  aria-label={t("inspector.sections.removeLabel", { name: region.name })}
                  title={t("inspector.sections.removeTitle")}
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
                <ActionButton onClick={() => props.onRegion("select", region.id)}>{t("inspector.sections.select")}</ActionButton>
                <ActionButton onClick={() => props.onRegion("repeat", region.id)} title={t("inspector.sections.repeatTitle")}>
                  {t("inspector.sections.repeat")}
                </ActionButton>
                <ActionButton variant="danger" onClick={() => props.onRegion("cut", region.id)} title={t("inspector.sections.cutTitle")}>
                  {t("inspector.sections.cut")}
                </ActionButton>
              </div>
            </div>
          ))}
        </PanelSection>
      ) : null}

      {!clip && state.markers.length ? (
        <PanelSection title={t("inspector.markers.title")} help="sections-markers-and-media" hint={t("inspector.markers.hint")}>
          <ul className="space-y-1">
            {state.markers.map((marker) => (
              <li key={marker.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="h-8 w-16 shrink-0 rounded-lg bg-slate-900 font-mono text-[11px] tabular-nums text-orange-300 hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  title={t("inspector.markers.jump")}
                  onClick={() => props.onSeek(marker.time)}
                >
                  {formatTime(marker.time).slice(0, -2)}
                </button>
                <input
                  className={fieldClass}
                  value={marker.name}
                  aria-label={t("inspector.markers.name")}
                  onChange={(event) => props.onRenameMarker(marker.id, event.target.value.slice(0, 40))}
                />
                <button
                  type="button"
                  aria-label={t("inspector.markers.delete", { name: marker.name })}
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
        <PanelSection title={t("inspector.media.title")} help="sections-markers-and-media" hint={t("inspector.media.hint")}>
          {unusedAssets.length ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {unusedAssets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className="flex h-8 w-full items-center gap-2 rounded-lg bg-slate-900 px-2 text-left text-[11px] text-slate-200 hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                    onClick={() => props.onAddAsset(asset)}
                    title={t("inspector.media.addTitle")}
                  >
                    <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-slate-400">{formatTime(asset.duration_seconds)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400">{t("inspector.media.empty")}</p>
          )}
        </PanelSection>
      ) : null}
    </aside>
  );
}

function EffectRack({ fx, onChange, bare }: { fx: TrackFx; onChange: (fx: TrackFx, key: string) => void; bare?: boolean }) {
  const { t } = useI18n();
  const set = <K extends keyof TrackFx>(unit: K, patch: Partial<TrackFx[K]>, key: string) =>
    onChange({ ...fx, [unit]: { ...fx[unit], ...patch } }, key);
  const units = (
    <>
      <Toggle label={t("inspector.fx.gate")} checked={fx.gate.on} onChange={(on) => set("gate", { on }, "")} />
      {fx.gate.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label={t("inspector.fx.threshold")} value={fx.gate.threshold} min={-80} max={0} step={1} defaultValue={-45} format={(v) => `${v} dB`} onChange={(threshold) => set("gate", { threshold }, "fx-gt")} />
          <Slider label={t("inspector.fx.attack")} value={fx.gate.attack} min={0.001} max={0.1} step={0.001} defaultValue={0.002} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(attack) => set("gate", { attack }, "fx-ga")} />
          <Slider label={t("inspector.fx.hold")} value={fx.gate.hold} min={0} max={0.5} step={0.01} defaultValue={0.06} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(hold) => set("gate", { hold }, "fx-gh")} />
          <Slider label={t("inspector.fx.release")} value={fx.gate.release} min={0.01} max={1} step={0.01} defaultValue={0.15} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(release) => set("gate", { release }, "fx-gr")} />
        </div>
      ) : null}
      <Toggle label={t("inspector.fx.voice")} checked={fx.voice.on} onChange={(on) => set("voice", { on }, "")} />
      {fx.voice.on ? <VoiceUnit voice={fx.voice} onChange={(patch, key) => set("voice", patch, key)} /> : null}
      <Toggle label={t("inspector.fx.distortion")} checked={fx.dist.on} onChange={(on) => set("dist", { on }, "")} />
      {fx.dist.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label={t("inspector.fx.drive")} value={fx.dist.drive} min={0} max={1} step={0.01} defaultValue={0.4} format={(v) => `${Math.round(v * 100)}%`} onChange={(drive) => set("dist", { drive }, "fx-dd")} />
          <Slider label={t("inspector.fx.mix")} value={fx.dist.mix} min={0} max={1} step={0.01} defaultValue={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => set("dist", { mix }, "fx-dx")} />
        </div>
      ) : null}
      <Toggle label={t("inspector.fx.compressor")} checked={fx.comp.on} onChange={(on) => set("comp", { on }, "")} />
      {fx.comp.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label={t("inspector.fx.threshold")} value={fx.comp.threshold} min={-60} max={0} step={1} defaultValue={-18} format={(v) => `${v} dB`} onChange={(threshold) => set("comp", { threshold }, "fx-ct")} />
          <Slider label={t("inspector.fx.ratio")} value={fx.comp.ratio} min={1} max={20} step={0.5} defaultValue={3} format={(v) => `${v.toFixed(1)}:1`} onChange={(ratio) => set("comp", { ratio }, "fx-cr")} />
          <Slider label={t("inspector.fx.attack")} value={fx.comp.attack} min={0.001} max={0.2} step={0.001} defaultValue={0.01} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(attack) => set("comp", { attack }, "fx-ca")} />
          <Slider label={t("inspector.fx.release")} value={fx.comp.release} min={0.02} max={1} step={0.01} defaultValue={0.2} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(release) => set("comp", { release }, "fx-cl")} />
          <Slider label={t("inspector.fx.makeup")} value={fx.comp.makeup} min={0} max={18} step={0.5} defaultValue={0} format={formatDb} onChange={(makeup) => set("comp", { makeup }, "fx-cm")} />
        </div>
      ) : null}
      <Toggle label={t("inspector.fx.delay")} checked={fx.delay.on} onChange={(on) => set("delay", { on }, "")} />
      {fx.delay.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label={t("inspector.fx.time")} value={fx.delay.time} min={0.02} max={1.5} step={0.005} defaultValue={0.375} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(time) => set("delay", { time }, "fx-dt")} />
          <Slider label={t("inspector.fx.feedback")} value={fx.delay.feedback} min={0} max={0.9} step={0.01} defaultValue={0.35} format={(v) => `${Math.round(v * 100)}%`} onChange={(feedback) => set("delay", { feedback }, "fx-df")} />
          <Slider label={t("inspector.fx.mix")} value={fx.delay.mix} min={0} max={1} step={0.01} defaultValue={0.25} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => set("delay", { mix }, "fx-dm")} />
        </div>
      ) : null}
      <Toggle label={t("inspector.fx.reverb")} checked={fx.reverb.on} onChange={(on) => set("reverb", { on }, "")} />
      {fx.reverb.on ? (
        <div className="space-y-1 border-l-2 border-cyan-400/40 pl-2">
          <Slider label={t("inspector.fx.size")} value={fx.reverb.size} min={0.3} max={6} step={0.1} defaultValue={1.8} format={(v) => secs(t, v, 1)} onChange={(size) => set("reverb", { size }, "fx-rs")} />
          <Slider label={t("inspector.fx.mix")} value={fx.reverb.mix} min={0} max={1} step={0.01} defaultValue={0.2} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => set("reverb", { mix }, "fx-rm")} />
        </div>
      ) : null}
    </>
  );
  if (bare) return <div className="space-y-2">{units}</div>;
  return (
    <PanelSection title={t("inspector.fx.title")} help="track-effects-and-buses" hint={t("inspector.fx.hint")}>
      {units}
    </PanelSection>
  );
}

function noteName(note: number): string {
  const n = Math.round(note);
  return `${NOTES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

function VoiceUnit({ voice, onChange }: { voice: VoiceFx; onChange: (patch: Partial<VoiceFx>, key: string) => void }) {
  const { t } = useI18n();
  const carrierMode = voice.mode === "vocoder" || voice.mode === "synth";
  const semis = (v: number) => t("inspector.semitones", { v: `${v > 0 ? "+" : ""}${Math.round(v)}` });
  return (
    <div className="space-y-1.5 border-l-2 border-cyan-400/40 pl-2">
      <select
        className={fieldClass}
        aria-label={t("inspector.voice.preset")}
        value=""
        onChange={(event) => {
          const preset = VOICE_PRESETS.find((p) => p.id === event.target.value);
          if (preset) onChange(preset.voice, "");
        }}
      >
        <option value="">{t("inspector.voice.loadPreset")}</option>
        {VOICE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {presetLabel(t, preset)}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="w-16 shrink-0">{t("inspector.voice.type")}</span>
        <select className={fieldClass} aria-label={t("inspector.voice.typeLabel")} value={voice.mode} onChange={(event) => onChange({ mode: event.target.value as VoiceMode }, "")}>
          {VOICE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`inspector.voice.modes.${mode}`)}
            </option>
          ))}
        </select>
      </label>
      {carrierMode ? (
        <>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">{t("inspector.voice.notes")}</span>
            <select
              className={fieldClass}
              aria-label={t("inspector.voice.notesLabel")}
              value={voice.carrier}
              onChange={(event) => onChange({ carrier: event.target.value as VoiceFx["carrier"] }, "")}
            >
              <option value="follow">{t("inspector.voice.follow")}</option>
              <option value="note">{t("inspector.voice.hold")}</option>
            </select>
          </label>
          {voice.carrier === "follow" ? (
            <Slider label={t("inspector.voice.transpose")} value={voice.semitones} min={-24} max={24} step={1} defaultValue={0} format={semis} onChange={(semitones) => onChange({ semitones }, "vx-st")} />
          ) : (
            <Slider label={t("inspector.voice.note")} value={voice.note} min={24} max={84} step={1} defaultValue={48} format={noteName} onChange={(note) => onChange({ note }, "vx-n")} />
          )}
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">{t("inspector.voice.wave")}</span>
            <select className={fieldClass} aria-label={t("inspector.voice.waveLabel")} value={voice.wave} onChange={(event) => onChange({ wave: event.target.value as VoiceFx["wave"] }, "")}>
              <option value="saw">{t("inspector.voice.saw")}</option>
              <option value="square">{t("inspector.voice.square")}</option>
            </select>
          </label>
          <p className="text-[11px] leading-snug text-slate-400">
            {t("inspector.voice.keysHint")}
          </p>
        </>
      ) : null}
      {voice.mode === "pitch" ? (
        <Slider label={t("inspector.voice.shift")} value={voice.semitones} min={-24} max={24} step={1} defaultValue={12} format={semis} onChange={(semitones) => onChange({ semitones }, "vx-st")} />
      ) : null}
      {voice.mode === "robot" ? (
        <Slider label={t("inspector.voice.rate")} value={voice.rate} min={5} max={400} step={1} defaultValue={50} format={(v) => `${Math.round(v)} Hz`} onChange={(rate) => onChange({ rate }, "vx-r")} />
      ) : null}
      {voice.mode === "distort" ? (
        <Slider label={t("inspector.fx.drive")} value={voice.drive} min={0} max={1} step={0.01} defaultValue={0.6} format={(v) => `${Math.round(v * 100)}%`} onChange={(drive) => onChange({ drive }, "vx-d")} />
      ) : null}
      <Slider label={t("inspector.fx.mix")} value={voice.mix} min={0} max={1} step={0.01} defaultValue={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(mix) => onChange({ mix }, "vx-m")} />
      {voice.mode === "vocoder" || voice.mode === "synth" ? (
        <p className="text-[11px] leading-snug text-slate-400">{t("inspector.voice.soloHint")}</p>
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
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const patch = track.synth.patch;
  const presets = [...FACTORY_PRESETS, ...(editing ? [] : loadUserPresetsSafe())];
  return (
    <>
      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="w-16 shrink-0">{t("inspector.instrument.sound")}</span>
        <select
          className={fieldClass}
          value={presets.some((p) => p.name === patch.name) ? patch.name : ""}
          aria-label={t("inspector.instrument.soundPreset")}
          onChange={(event) => {
            const found = presets.find((p) => p.name === event.target.value);
            if (found) {
              onPatch(normalizePatch(found), "");
              onPreview(60);
            }
          }}
        >
          {presets.some((p) => p.name === patch.name) ? null : <option value="">{t("inspector.instrument.edited", { name: patch.name })}</option>}
          {presets.map((p, i) => (
            <option key={`${i}-${p.name}`} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <FreqSlider
        label={t("inspector.instrument.brightness")}
        value={patch.filter.cutoff}
        min={60}
        max={18000}
        fallback={3200}
        onChange={(cutoff) => onPatch({ ...patch, filter: { ...patch.filter, cutoff } }, "cut")}
      />
      <Slider label={t("inspector.fx.attack")} value={patch.ampEnv.attack} min={0.001} max={2} step={0.001} defaultValue={0.01} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(attack) => onPatch({ ...patch, ampEnv: { ...patch.ampEnv, attack } }, "a")} />
      <Slider label={t("inspector.fx.release")} value={patch.ampEnv.release} min={0.005} max={4} step={0.005} defaultValue={0.2} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(release) => onPatch({ ...patch, ampEnv: { ...patch.ampEnv, release } }, "r")} />
      <ActionButton variant="primary" className="w-full" onClick={() => setEditing(true)}>
        {t("inspector.instrument.editSound")}
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
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    // Drawn in the window this panel is in (it can float on another monitor).
    const view = viewOf(canvasRef.current);
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
      frame = view.requestAnimationFrame(draw);
    };
    frame = view.requestAnimationFrame(draw);
    return () => view.cancelAnimationFrame(frame);
  }, [getScope]);
  return (
    <div className="flex items-end gap-3">
      <canvas
        ref={canvasRef}
        className="rounded-lg bg-slate-950"
        style={{ width: 132, height: 146 }}
        role="img"
        aria-label={t("inspector.phase.label")}
      />
      <dl className="space-y-1 text-[10px] text-slate-400">
        <div>
          <dt className="font-semibold text-slate-300">{t("inspector.phase.bar")}</dt>
          <dd>{t("inspector.phase.barText")}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-300">{t("inspector.phase.green")}</dt>
          <dd>{t("inspector.phase.inPhase")}</dd>
        </div>
        <div>
          <dt className="font-semibold text-rose-300">{t("inspector.phase.red")}</dt>
          <dd>{t("inspector.phase.outOfPhase")}</dd>
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
    // Drawn in the window this panel is in (it can float on another monitor).
    const view = viewOf(barRef.current);
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
      frame = view.requestAnimationFrame(draw);
    };
    frame = view.requestAnimationFrame(draw);
    return () => view.cancelAnimationFrame(frame);
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
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const source = useRef({ getSpectrum, getResponse });
  useEffect(() => {
    source.current = { getSpectrum, getResponse };
  });
  useEffect(() => {
    // Drawn in the window this panel is in (it can float on another monitor).
    const view = viewOf(canvasRef.current);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = EQ_W * dpr;
    canvas.height = EQ_H * dpr;
    let frame = 0;
    let tick = 0;
    let response: Float32Array | null = null;
    const pressPlay = t("inspector.eq.pressPlay");
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
        ctx.fillText(pressPlay, 10, EQ_H / 2 - 12);
      }
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("100", xOf(100) + 3, EQ_H - 3);
      ctx.fillText("1k", xOf(1000) + 3, EQ_H - 3);
      ctx.fillText("10k", xOf(10000) + 3, EQ_H - 3);
      frame = view.requestAnimationFrame(draw);
    };
    frame = view.requestAnimationFrame(draw);
    return () => view.cancelAnimationFrame(frame);
  }, [trackId, signature, t]);
  return (
    <canvas
      ref={canvasRef}
      className="block w-full rounded-lg"
      style={{ aspectRatio: `${EQ_W} / ${EQ_H}` }}
      role="img"
      aria-label={t("inspector.eq.label")}
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
  const { t } = useI18n();
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
      .catch((err: unknown) => !cancelled && setFailure(err instanceof Error ? err.message : t("inspector.wam.catalogueFailed")));
    return () => {
      cancelled = true;
    };
  }, [allowed, t]);

  if (!allowed) {
    return (
      <PanelSection title={t("inspector.wam.title")} help="track-effects-and-buses" hint={t("inspector.wam.hintOff")}>
        <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
          {t("inspector.wam.warning")}
        </p>
        <ActionButton className="w-full" onClick={() => wamConsent.set(true)}>
          {t("inspector.wam.allow")}
        </ActionButton>
      </PanelSection>
    );
  }

  const picked = catalogue?.find((item) => item.url === choice);
  return (
    <PanelSection
      title={t("inspector.wam.title")}
      help="track-effects-and-buses"
      hint={t("inspector.wam.hintOn")}
    >
      {current ? (
        <>
          <p className="truncate rounded-lg bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200" title={current.url}>
            {t("inspector.wam.loaded")} <strong>{current.name}</strong>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton variant="primary" onClick={onOpen}>
              {t("inspector.wam.open")}
            </ActionButton>
            <ActionButton variant="danger" onClick={() => onLoad(undefined)}>
              {t("inspector.wam.remove")}
            </ActionButton>
          </div>
        </>
      ) : (
        <>
          {failure ? <p className="text-[11px] text-rose-300" role="alert">{failure}</p> : null}
          <select className={fieldClass} aria-label={t("inspector.wam.label")} value={choice} onChange={(event) => setChoice(event.target.value)}>
            <option value="">{catalogue ? t("inspector.wam.choose") : failure ? t("inspector.wam.unavailable") : t("inspector.wam.loading")}</option>
            {(catalogue ?? []).map((item) => (
              <option key={item.url} value={item.url}>
                {item.name}
                {item.vendor ? ` — ${item.vendor}` : ""}
              </option>
            ))}
          </select>
          {picked?.description ? <p className="text-[11px] text-slate-400">{picked.description}</p> : null}
          <ActionButton className="w-full" disabled={!picked} onClick={() => picked && onLoad({ url: picked.url, name: picked.name })}>
            {t("inspector.wam.load")}
          </ActionButton>
          <input
            className={fieldClass}
            placeholder={t("inspector.wam.paste")}
            aria-label={t("inspector.wam.address")}
            value={custom}
            onChange={(event) => setCustom(event.target.value.trim())}
          />
          {custom ? (
            <ActionButton
              className="w-full"
              disabled={!isAllowedWamUrl(custom)}
              onClick={() => onLoad({ url: custom, name: new URL(custom).pathname.split("/").filter(Boolean).slice(-2, -1)[0] ?? t("inspector.wam.plugin") })}
            >
              {isAllowedWamUrl(custom) ? t("inspector.wam.fromAddress") : t("inspector.wam.httpsOnly")}
            </ActionButton>
          ) : null}
        </>
      )}
      <button
        type="button"
        className="h-6 text-left text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
        onClick={() => wamConsent.set(false)}
      >
        {t("inspector.wam.off")}
      </button>
    </PanelSection>
  );
}
