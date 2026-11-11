"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  BarChart3,
  Cpu,
  Disc3,
  Download,
  FileAudio,
  History,
  Loader2,
  Plus,
  Scissors,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Wand2
} from "lucide-react";

import { AlbumPanel } from "@/components/generation/album-panel";
import { PlanEditor } from "@/components/generation/plan-editor";
import { SchemaForm } from "@/components/generation/schema-form";
import { SettingsPanel } from "@/components/generation/settings-panel";
import { NEW_IN_ITS_STYLE, SourceSongPanel, type SourceSong } from "@/components/generation/source-song";
import { editorApi } from "@/lib/editor/api";
import { addAssetOnNewTrack } from "@/lib/editor/store";
import { emptyProjectState, type Asset, type Job, type ProjectState } from "@/lib/editor/types";
import {
  defaultValues,
  generationApi,
  submitValues,
  type FieldSpec,
  type FieldValue,
  type FieldValues,
  type CostEstimate,
  type HistoryRecord,
  type Overview,
  type PlanSection,
  type ProviderInfo,
  type ProviderSchema
} from "@/lib/generation/api";
import { analyseClip, type ClipRef, type Incoming, placeIncoming, placeInEditorUrl } from "@/lib/handoff";
import { cn } from "@/lib/utils";

type Tab = "create" | "album" | "history" | "settings";

interface Result {
  projectId: string;
  title: string;
  assets: Asset[];
  outputs: Record<string, unknown>[];
  secondsTaken: number;
}

const primaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 text-sm font-semibold text-slate-950 " +
  "hover:bg-cyan-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200 " +
  "disabled:pointer-events-none disabled:opacity-40";
const quietButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-slate-100 " +
  "hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 " +
  "disabled:pointer-events-none disabled:opacity-40";
const inputClass =
  "w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50";

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function formatSeconds(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Rough time for a local song, from benchmarks on Apple Silicon. */
function estimateSeconds(values: FieldValues): number {
  const length = typeof values.duration === "number" ? values.duration : 120;
  const versions = typeof values.variations === "number" ? values.variations : 1;
  const plan = values.use_lm === false ? 0 : 10 + length / 8;
  return plan + (10 + length * 0.3) * (1 + 0.9 * (versions - 1));
}

/** Tasks whose result replaces listening to the original, so the original's track is muted. */
const MUTES_ORIGINAL = new Set([NEW_IN_ITS_STYLE, "cover"]);

/** Only the measured values the form can take: known fields, inside their ranges and options. */
function fitToSchema(schema: ProviderSchema, patch: FieldValues): FieldValues {
  const out: FieldValues = {};
  for (const field of schema.fields) {
    const value = patch[field.key];
    if (value === undefined || value === null || field.editor) continue;
    if (typeof value === "number" && (field.type === "int" || field.type === "float")) {
      const low = typeof field.min === "number" ? field.min : -Infinity;
      const high = typeof field.max === "number" ? field.max : Infinity;
      out[field.key] = Math.min(high, Math.max(low, value));
    } else if (field.type === "enum") {
      const allowed = (field.options ?? []).map((o) => (typeof o === "string" ? o : String(o.value)));
      if (allowed.includes(String(value))) out[field.key] = String(value);
    } else if (typeof value === "string") {
      out[field.key] = value;
    }
  }
  return out;
}

/**
 * Add each generated version to the project on its own track; extra versions start muted.
 * ``muteAssetId`` mutes the original song's tracks, so the new version is what plays.
 */
async function placeInProject(
  projectId: string,
  assets: Asset[],
  meta: Record<string, unknown>,
  muteAssetId: string | null = null
): Promise<void> {
  const project = await editorApi.getProject(projectId);
  let state: ProjectState = project.state ?? emptyProjectState();
  if (!project.state) {
    // A brand-new project takes the song's tempo and key, so the grid lines up with the music.
    const bpm = typeof meta.bpm === "number" && meta.bpm >= 40 && meta.bpm <= 240 ? meta.bpm : state.bpm;
    const keyLabel = typeof meta.keyscale === "string" && meta.keyscale ? meta.keyscale : state.keyLabel;
    state = { ...state, bpm, keyLabel };
  }
  if (muteAssetId) {
    const original = new Set(state.clips.filter((c) => c.assetId === muteAssetId).map((c) => c.trackId));
    state = { ...state, tracks: state.tracks.map((t) => (original.has(t.id) ? { ...t, mute: true } : t)) };
  }
  assets.forEach((asset, index) => {
    const added = addAssetOnNewTrack(state, asset);
    state = index === 0
      ? added.state
      : { ...added.state, tracks: added.state.tracks.map((t) => (t.id === added.track.id ? { ...t, mute: true } : t)) };
  });
  await editorApi.saveState(projectId, state);
}

const linkButton =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";

/** Where a finished song can go next. Each one is a copy or a new track: nothing is replaced. */
function SendActions({
  clip,
  onAnalyse,
  onStartFrom
}: {
  clip: ClipRef;
  onAnalyse: (clip: ClipRef) => void;
  onStartFrom: (clip: ClipRef) => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={`Send ${clip.name}`}>
      <Link href={placeInEditorUrl(clip)} className={linkButton} title="Add it on a new track in a new or existing editor session">
        <Plus className="h-3.5 w-3.5" aria-hidden /> Add to a session
      </Link>
      <Link
        href={placeInEditorUrl(clip, true)}
        className={linkButton}
        title="Add it to a session and split it into vocals, drums, bass and the rest"
      >
        <Scissors className="h-3.5 w-3.5" aria-hidden /> Split into stems
      </Link>
      <button type="button" className={linkButton} onClick={() => onAnalyse(clip)} title="Open a copy in the analyser and measure it">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Analyse
      </button>
      <button
        type="button"
        className={linkButton}
        onClick={() => onStartFrom(clip)}
        title="Make another song from this one: restyle, extend, add a part…"
      >
        <FileAudio className="h-3.5 w-3.5" aria-hidden /> Start a song from it
      </button>
    </div>
  );
}

function stripName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "");
}

function ResultCard({
  result,
  onReuseSeed,
  onAnalyse,
  onStartFrom
}: {
  result: Result;
  onReuseSeed: (seed: number) => void;
  onAnalyse: (clip: ClipRef) => void;
  onStartFrom: (clip: ClipRef) => void;
}) {
  return (
    <section className="glass rounded-2xl border border-cyan-300/30 p-4" aria-label={`Result: ${result.title}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="display-font text-base font-semibold text-slate-100">{result.title}</h3>
          <p className="text-xs text-slate-400">
            {result.assets.length} version{result.assets.length === 1 ? "" : "s"} · made in {formatSeconds(result.secondsTaken)}
          </p>
        </div>
        <Link href={`/editor?project=${result.projectId}`} className={primaryButton}>
          <AudioWaveform className="h-4 w-4" aria-hidden />
          Open in Studio Editor
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {result.assets.map((asset, index) => {
          const meta = result.outputs[index] ?? {};
          const seed = typeof meta.seed === "number" ? meta.seed : null;
          const facts = [
            typeof meta.bpm === "number" && meta.bpm > 0 ? `${meta.bpm} BPM` : null,
            typeof meta.keyscale === "string" && meta.keyscale ? meta.keyscale : null,
            typeof meta.output_lufs === "number" ? `${meta.output_lufs.toFixed(1)} LUFS` : null,
            seed !== null ? `seed ${seed}` : null
          ].filter(Boolean);
          return (
            <li key={asset.id} className="rounded-xl bg-slate-900/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-200">{asset.name}</p>
                <p className="text-xs tabular-nums text-slate-400">{facts.join(" · ")}</p>
              </div>
              <audio
                controls
                preload="none"
                src={editorApi.assetAudioUrl(result.projectId, asset.id)}
                className="mt-2 h-10 w-full"
                aria-label={`Play ${asset.name}`}
              />
              <SendActions
                clip={{ projectId: result.projectId, assetId: asset.id, name: stripName(asset.name) }}
                onAnalyse={onAnalyse}
                onStartFrom={onStartFrom}
              />
              {seed !== null ? (
                <button type="button" className={linkButton} onClick={() => onReuseSeed(seed)}>
                  Keep this seed for the next version
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function GenerateStudio({ projectId, start = null }: { projectId: string | null; start?: Incoming | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [source, setSource] = useState<SourceSong | null>(null);
  const [sourceWorking, setSourceWorking] = useState<string | null>(null);
  const [sourceTaskId, setSourceTaskId] = useState(NEW_IN_ITS_STYLE);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [valuesByProvider, setValuesByProvider] = useState<Record<string, FieldValues>>({});
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [revise, setRevise] = useState("");
  const [writing, setWriting] = useState(false);
  const [writerNote, setWriterNote] = useState<string | null>(null);
  const [job, setJob] = useState<{ projectId: string; job: Job; startedAt: number; muteAssetId: string | null } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [history, setHistory] = useState<HistoryRecord[] | null>(null);
  const [now, setNow] = useState(0);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await generationApi.overview();
      if (!aliveRef.current) return;
      setOverview(next);
      setLoadError(null);
    } catch (err) {
      if (aliveRef.current) setLoadError(message(err, "AI generation could not be loaded."));
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    generationApi
      .overview()
      .then((next) => aliveRef.current && setOverview(next))
      .catch((err: unknown) => aliveRef.current && setLoadError(message(err, "AI generation could not be loaded.")));
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // While the engine installs, keep the progress fresh.
  const installing = overview?.setup.running ?? false;
  useEffect(() => {
    if (!installing) return;
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [installing, refresh]);

  const usable = useMemo(() => (overview?.providers ?? []).filter((p) => p.enabled), [overview]);
  const provider: ProviderInfo | null =
    usable.find((p) => p.id === providerId) ?? usable.find((p) => p.status.ready) ?? usable[0] ?? null;
  const values = useMemo(
    () => (provider ? (valuesByProvider[provider.id] ?? defaultValues(provider.schema)) : {}),
    [provider, valuesByProvider]
  );
  const setValue = (key: string, value: FieldValue) => {
    if (!provider) return;
    setValuesByProvider((all) => ({ ...all, [provider.id]: { ...values, [key]: value } }));
  };
  const mergeValues = (patch: FieldValues) => {
    if (!provider) return;
    const known = new Set(provider.schema.fields.map((f) => f.key));
    const clean = Object.fromEntries(Object.entries(patch).filter(([key]) => known.has(key)));
    setValuesByProvider((all) => ({ ...all, [provider.id]: { ...values, ...clean } }));
  };

  // Tasks the creator can run on a whole song (regenerating a section needs an editor selection).
  const sourceTasks = useMemo(
    () =>
      (provider?.schema.tasks ?? []).filter(
        (t) => t.source && !provider?.schema.fields.some((f) => f.editor && f.required_tasks?.includes(t.id))
      ),
    [provider]
  );
  const task =
    source && sourceTasks.some((t) => t.id === sourceTaskId && t.available !== false) ? sourceTaskId : NEW_IN_ITS_STYLE;
  const usesSource = source !== null && task !== NEW_IN_ITS_STYLE;
  // Pulling out an instrument needs no description; everything else reads a style.
  const needsStyle = task !== "extract";

  const busy = job !== null;
  const hasLyricsField = provider?.schema.fields.some((f) => f.key === "lyrics") ?? false;
  const instrumental = values.instrumental === true;
  const planField = provider?.schema.fields.find((f) => f.type === "plan") ?? null;
  const plan = Array.isArray(values.plan) ? (values.plan as PlanSection[]) : null;
  const [drafting, setDrafting] = useState(false);
  const draftPlan = async () => {
    if (!provider) return;
    setDrafting(true);
    setError(null);
    try {
      const { plan: drafted } = await generationApi.draftPlan(provider.id, submitValues(provider.schema, values));
      setValue("plan", drafted);
    } catch (err) {
      setError(message(err, "The plan could not be drafted."));
    } finally {
      setDrafting(false);
    }
  };

  // What an online service would charge for this request, refreshed as the form changes.
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const online = provider?.kind === "external" && provider.status.ready;
  useEffect(() => {
    if (!online || !provider) return;
    const timer = setTimeout(() => {
      generationApi
        .estimate({
          params: { provider: provider.id, task, fields: submitValues(provider.schema, values, task) },
          ...(usesSource && source ? { project_id: source.projectId, asset_id: source.assetId } : {})
        })
        .then((result) => {
          setEstimate(result.estimate);
          setEstimateError(null);
        })
        .catch((err: unknown) => {
          // The estimate checks the request the same way generating would, so show why.
          setEstimate(null);
          setEstimateError(message(err, "The cost could not be estimated."));
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [online, provider, values, task, usesSource, source]);

  const hidden = (field: FieldSpec) =>
    field.type === "plan" ||
    (plan !== null && (field.key === "duration" || field.key === "lyrics" || field.key === "instrumental")) ||
    Boolean(field.editor) ||
    (field.tasks !== undefined && !field.tasks.includes(task)) ||
    (instrumental && (field.key === "lyrics" || field.key === "vocal_language"));

  const write = async (mode: "brief" | "lyrics") => {
    setWriting(true);
    setError(null);
    setWriterNote(null);
    try {
      const { brief, engine } = await generationApi.write(
        mode === "brief"
          ? { mode, idea: idea.trim(), instrumental }
          : { mode, idea: revise.trim(), caption: String(values.caption ?? ""), lyrics: String(values.lyrics ?? "") }
      );
      const { title: briefTitle, ...fields } = brief;
      mergeValues(instrumental ? { ...fields, lyrics: "" } : fields);
      if (mode === "brief" || !title.trim()) setTitle(briefTitle);
      if (mode === "lyrics") setRevise("");
      setWriterNote(
        engine.startsWith("ollama:")
          ? `Written on this computer by ${engine.slice(7)}. Edit anything before generating.`
          : "Drafted by the music engine's planner. For fuller lyrics, set up Ollama in Settings."
      );
    } catch (err) {
      setError(message(err, "The song could not be written."));
    } finally {
      setWriting(false);
    }
  };

  const generate = async () => {
    if (!provider) return;
    setError(null);
    const songTitle = title.trim() || "Generated song";
    try {
      // Starting from a song keeps everything in that song's session, next to the original.
      const target = source?.projectId ?? projectId ?? (await editorApi.createProject(songTitle)).id;
      const started = await generationApi.startSong(
        target,
        { provider: provider.id, task, title: songTitle, fields: submitValues(provider.schema, values, task) },
        usesSource && source ? source.assetId : null
      );
      setNow(Date.now());
      setJob({
        projectId: target,
        job: started,
        startedAt: Date.now(),
        muteAssetId: source && MUTES_ORIGINAL.has(task) ? source.assetId : null
      });
    } catch (err) {
      setError(message(err, "Generation could not be started."));
    }
  };

  // Follow the running job.
  const jobId = job?.job.id;
  const jobProject = job?.projectId;
  const jobMutes = job?.muteAssetId ?? null;
  useEffect(() => {
    if (!jobId || !jobProject) return;
    let stopped = false;
    const timer = setInterval(() => {
      setNow(Date.now());
      editorApi
        .getJob(jobProject, jobId)
        .then(async (latest) => {
          if (stopped) return;
          if (latest.status === "completed") {
            stopped = true;
            clearInterval(timer);
            const result = latest.result as { title?: string; outputs?: Record<string, unknown>[]; seconds_taken?: number };
            try {
              await placeInProject(jobProject, latest.result_assets, result.outputs?.[0] ?? {}, jobMutes);
            } catch {
              setError("The song was generated, but could not be placed on the timeline. Add it from the editor's asset list.");
            }
            setResults((list) => [
              {
                projectId: jobProject,
                title: result.title ?? "Generated song",
                assets: latest.result_assets,
                outputs: result.outputs ?? [],
                secondsTaken: result.seconds_taken ?? 0
              },
              ...list
            ]);
            setJob(null);
            setHistory(null);
          } else if (latest.status === "failed") {
            stopped = true;
            clearInterval(timer);
            setError(latest.error ?? "Generation failed.");
            setJob(null);
          } else {
            setJob((current) => (current ? { ...current, job: latest } : current));
          }
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobId, jobProject, jobMutes]);

  /* ---------- Starting from a song ---------- */

  /** Read the song's tempo, key, metre, length and style into the form. */
  const adoptSource = async (clip: ClipRef) => {
    setSource({ ...clip, measured: null });
    setSourceWorking("Reading tempo, key and style…");
    setError(null);
    try {
      const found = await generationApi.inspire(clip.projectId, clip.assetId);
      setSource({ ...clip, measured: found.measured });
      if (provider) mergeValues(fitToSchema(provider.schema, found.fields));
      if (!title.trim()) setTitle(`${clip.name} (new version)`.slice(0, 80));
    } catch (err) {
      setError(message(err, "The song could not be read. You can still use it; fill in the form yourself."));
    } finally {
      setSourceWorking(null);
    }
  };

  /** Upload a song into this session (or a new one) on its own track and start from it. */
  const uploadSource = async (file: File) => {
    const name = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Song";
    setSourceWorking(`Uploading ${name}…`);
    setError(null);
    try {
      const target = projectId ?? (await editorApi.createProject(name)).id;
      const asset = await editorApi.uploadAsset(target, file);
      const project = await editorApi.getProject(target);
      await editorApi.saveState(target, addAssetOnNewTrack(project.state ?? emptyProjectState(), asset).state);
      await adoptSource({ projectId: target, assetId: asset.id, name });
    } catch (err) {
      setError(message(err, "The song could not be uploaded."));
      setSourceWorking(null);
    }
  };

  const analyse = async (clip: ClipRef) => {
    setError(null);
    try {
      router.push(`/?run=${await analyseClip(clip)}`);
    } catch (err) {
      setError(message(err, "The song could not be sent to the analyser."));
    }
  };

  const startFrom = (clip: ClipRef) => {
    setTab("create");
    setSourceTaskId(NEW_IN_ITS_STYLE);
    void adoptSource(clip);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // A song sent here (?run= from the analyser, ?from=&asset= from a session) is the starting song.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!start || !overview || startedRef.current) return;
    startedRef.current = true;
    window.history.replaceState(null, "", projectId ? `/generate?project=${projectId}` : "/generate");
    void (async () => {
      if (start.kind === "clip") {
        await adoptSource(start);
        return;
      }
      setSourceWorking(`Bringing in ${start.name || "the song"}…`);
      try {
        const placed = await placeIncoming(projectId, start);
        await adoptSource({ projectId: placed.projectId, assetId: placed.asset.id, name: start.name || stripName(placed.asset.name) });
      } catch (err) {
        setError(message(err, "The song could not be brought in."));
        setSourceWorking(null);
      }
    })();
    // Runs once, when the generators are known (so the form can take the measured values).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, overview]);

  const cancel = () => {
    if (job) void generationApi.cancelJob(job.projectId, job.job.id).catch(() => undefined);
  };

  const openHistory = () => {
    setTab("history");
    generationApi
      .history()
      .then(setHistory)
      .catch((err: unknown) => setError(message(err, "History could not be loaded.")));
  };

  const reuse = (record: HistoryRecord) => {
    setProviderId(record.provider);
    const target = overview?.providers.find((p) => p.id === record.provider);
    if (target) {
      const known = new Set(target.schema.fields.map((f) => f.key));
      const kept = Object.fromEntries(Object.entries(record.fields).filter(([key]) => known.has(key)));
      setValuesByProvider((all) => ({ ...all, [target.id]: { ...defaultValues(target.schema), ...kept } }));
    }
    setTitle(record.title);
    setTab("create");
  };

  const tabs: { id: Tab; label: string; icon: typeof Sparkles }[] = [
    { id: "create", label: "Create", icon: Sparkles },
    { id: "album", label: "Album", icon: Disc3 },
    { id: "history", label: "History", icon: History },
    { id: "settings", label: "Settings", icon: Settings2 }
  ];
  const elapsed = job ? Math.max(0, (now - job.startedAt) / 1000) : 0;
  const needsInstall = provider?.id === "acestep_local" && !provider.status.ready;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-4 pb-16 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="display-font text-2xl font-semibold text-slate-100">
            Music Suite <span className="text-cyan-300">/ AI Song Studio</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Describe a song, edit the lyrics, and generate it on this computer. Results open in the Studio Editor.
          </p>
        </div>
        <Link href={projectId ? `/editor?project=${projectId}` : "/"} className={quietButton}>
          {projectId ? "Back to the editor" : "Back to Music Suite"}
        </Link>
      </header>

      <div role="tablist" aria-label="AI Song Studio sections" className="flex gap-1 rounded-2xl bg-slate-900/80 p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => (id === "history" ? openHistory() : setTab(id))}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300",
              tab === id ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {loadError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {!overview && !loadError ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : null}

      {overview && tab === "settings" ? <SettingsPanel overview={overview} onChanged={refresh} /> : null}
      {overview && tab === "album" ? <AlbumPanel overview={overview} /> : null}

      {overview && tab === "history" ? (
        <section className="space-y-3" aria-label="Generation history">
          {history === null ? (
            <p className="py-10 text-center text-sm text-slate-400">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="rounded-2xl bg-slate-900/70 px-4 py-10 text-center text-sm text-slate-400">
              Nothing generated yet. Songs you make appear here with the settings that made them.
            </p>
          ) : (
            history.map((record) => (
              <article key={record.id} className="glass rounded-2xl border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="display-font truncate text-base font-semibold text-slate-100">{record.title}</h3>
                    <p className="text-xs text-slate-400">
                      {new Date(record.created_at).toLocaleString()} · {record.asset_ids.length} version
                      {record.asset_ids.length === 1 ? "" : "s"} · {formatSeconds(record.seconds_taken)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={quietButton} onClick={() => reuse(record)}>
                      Use these settings
                    </button>
                    <Link href={`/editor?project=${record.project_id}`} className={quietButton}>
                      Open project
                    </Link>
                    <button
                      type="button"
                      aria-label={`Remove ${record.title} from history`}
                      title="Remove from history (the audio stays in its project)"
                      className={cn(quietButton, "w-10 px-0")}
                      onClick={() =>
                        generationApi
                          .deleteHistory(record.id)
                          .then(() => setHistory((list) => (list ?? []).filter((r) => r.id !== record.id)))
                          .catch((err: unknown) => setError(message(err, "The entry could not be removed.")))
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
                {typeof record.fields.caption === "string" ? (
                  <p className="mt-2 line-clamp-2 text-xs text-slate-400">{record.fields.caption}</p>
                ) : null}
                {record.asset_ids[0] ? (
                  <SendActions
                    clip={{ projectId: record.project_id, assetId: record.asset_ids[0], name: record.title }}
                    onAnalyse={(clip) => void analyse(clip)}
                    onStartFrom={startFrom}
                  />
                ) : null}
                {record.asset_ids.map((assetId) => (
                  <audio
                    key={assetId}
                    controls
                    preload="none"
                    src={editorApi.assetAudioUrl(record.project_id, assetId)}
                    className="mt-2 h-10 w-full"
                    aria-label={`Play ${record.title}`}
                  />
                ))}
              </article>
            ))
          )}
        </section>
      ) : null}

      {overview && tab === "create" ? (
        <>
          {needsInstall ? (
            <section className="glass rounded-2xl border border-amber-300/40 p-5">
              <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
                <Cpu className="h-5 w-5 text-amber-300" aria-hidden /> One step before your first song
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                The local music engine is not installed yet. Installing downloads about {overview.setup.download_gb ?? 5.3} GB
                and takes a few minutes. After that, songs are made on this computer, offline.
              </p>
              {overview.setup.running ? (
                <div className="mt-3" aria-live="polite">
                  <p className="flex items-center gap-2 text-sm text-slate-200">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {overview.setup.detail}
                  </p>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(overview.setup.percent)}
                    aria-label="Install progress"
                  >
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-[width] duration-700"
                      style={{ width: `${overview.setup.percent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {overview.setup.error ? (
                    <p role="alert" className="mt-2 whitespace-pre-wrap rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {overview.setup.error}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={cn(primaryButton, "mt-3")}
                    onClick={() =>
                      void generationApi
                        .startSetup(false)
                        .then(refresh)
                        .catch((err: unknown) => setError(message(err, "The install could not be started.")))
                    }
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    {overview.setup.error ? "Try the install again" : "Install local engine"}
                  </button>
                </>
              )}
            </section>
          ) : null}

          {usable.length > 1 ? (
            <label className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="font-semibold">Generator</span>
              <select
                value={provider?.id ?? ""}
                disabled={busy}
                onChange={(event) => setProviderId(event.target.value)}
                className={cn(inputClass, "h-10 w-auto min-w-64")}
              >
                {usable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.status.ready ? "" : " — not ready"}
                  </option>
                ))}
              </select>
              {provider && !provider.status.ready ? <span className="text-xs text-amber-200">{provider.status.message}</span> : null}
            </label>
          ) : null}

          {provider ? (
            <SourceSongPanel
              source={source}
              working={sourceWorking}
              disabled={busy}
              tasks={sourceTasks}
              taskId={task}
              onTask={setSourceTaskId}
              onUpload={(file) => void uploadSource(file)}
              onAnalyse={() => source && void analyse(source)}
              onClear={() => {
                setSource(null);
                setSourceTaskId(NEW_IN_ITS_STYLE);
              }}
            />
          ) : null}

          {provider && hasLyricsField && !usesSource ? (
            <section className="glass rounded-2xl border border-white/10 p-4" aria-label="Start from an idea">
              <h2 className="display-font flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Wand2 className="h-4 w-4 text-cyan-300" aria-hidden /> Start from an idea
              </h2>
              <textarea
                rows={3}
                value={idea}
                maxLength={1000}
                disabled={busy || writing}
                onChange={(event) => setIdea(event.target.value)}
                aria-label="Describe the song you want"
                placeholder="A late-night drive along the coast after a breakup, hopeful by the end. Dreamy synth-pop, female voice."
                className={cn(inputClass, "mt-2 py-2 leading-relaxed")}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={quietButton}
                  disabled={busy || writing || idea.trim().length < 3}
                  onClick={() => void write("brief")}
                >
                  {writing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                  {writing ? "Writing… (about 30 s)" : "Write style and lyrics"}
                </button>
                <p className="text-xs text-slate-400" aria-live="polite">
                  {writerNote ?? "Optional. Fills the form below; you can also type everything yourself."}
                </p>
              </div>
            </section>
          ) : null}

          {provider ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-300">Song title</span>
                <input
                  type="text"
                  value={title}
                  maxLength={80}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Untitled song"
                  className={cn(inputClass, "h-10")}
                />
              </label>

              <SchemaForm schema={provider.schema} values={values} disabled={busy || writing} onChange={setValue} hidden={hidden} />

              {planField ? (
                <PlanEditor
                  sections={plan}
                  disabled={busy || writing}
                  drafting={drafting}
                  maxSections={planField.max_sections ?? 30}
                  maxSeconds={planField.max_total_seconds ?? 600}
                  defaultStyles={String(values.caption ?? "")}
                  onChange={(sections) => setValue("plan", sections)}
                  onDraft={() => void draftPlan()}
                />
              ) : null}

              {hasLyricsField && !instrumental && String(values.lyrics ?? "").trim() ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={revise}
                    maxLength={300}
                    disabled={busy || writing}
                    onChange={(event) => setRevise(event.target.value)}
                    aria-label="How to change the lyrics"
                    placeholder="Change the lyrics: e.g. “add a bridge”, “make the chorus simpler”, “translate to Spanish”"
                    className={cn(inputClass, "h-10 min-w-0 flex-1")}
                  />
                  <button
                    type="button"
                    className={quietButton}
                    disabled={busy || writing || revise.trim().length < 3}
                    onClick={() => void write("lyrics")}
                  >
                    Rewrite
                  </button>
                </div>
              ) : null}

              <div className="glass sticky bottom-3 z-10 rounded-2xl border border-white/10 p-3 shadow-lg">
                {job ? (
                  <div aria-live="polite">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm text-slate-200">
                        {job.job.detail || "Working…"}{" "}
                        <span className="tabular-nums text-slate-400">· {formatSeconds(elapsed)}</span>
                      </p>
                      <button type="button" className={quietButton} onClick={cancel}>
                        <Square className="h-3.5 w-3.5" aria-hidden /> Cancel
                      </button>
                    </div>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(job.job.progress)}
                      aria-label="Generation progress"
                    >
                      <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-700" style={{ width: `${job.job.progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={cn("text-xs", provider.kind === "external" ? "text-amber-200" : "text-slate-400")}>
                      {provider.status.ready
                        ? provider.id === "acestep_local"
                          ? `About ${formatSeconds(estimateSeconds(values))} on this computer. One song at a time.`
                          : online && estimate
                            ? estimate.summary
                            : online && estimateError
                              ? `Not ready to send yet: ${estimateError}`
                              : provider.status.message
                        : provider.status.message}
                      {online && estimate ? (
                        <>
                          {" "}
                          <a href={estimate.url} target="_blank" rel="noreferrer noopener" className="underline">
                            Prices as of {estimate.as_of}
                          </a>
                        </>
                      ) : null}
                    </p>
                    <button
                      type="button"
                      className={primaryButton}
                      disabled={
                        !provider.status.ready ||
                        writing ||
                        (needsStyle && String(values.caption ?? values.prompt ?? "").trim().length < 3 && !plan?.length)
                      }
                      onClick={() => void generate()}
                    >
                      <Sparkles className="h-4 w-4" aria-hidden />
                      {usesSource
                        ? `${sourceTasks.find((t) => t.id === task)?.label ?? "Make it"} from “${source?.name}”`
                        : `Generate${source ? " in its style" : projectId ? " into this project" : ""}`}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-2xl bg-slate-900/70 px-4 py-10 text-center text-sm text-slate-400">
              Every generator is switched off. Turn one on in Settings.
            </p>
          )}

          {results.map((result) => (
            <ResultCard
              key={result.assets[0]?.id ?? result.title}
              result={result}
              onReuseSeed={(seed) => setValue("seed", seed)}
              onAnalyse={(clip) => void analyse(clip)}
              onStartFrom={startFrom}
            />
          ))}
        </>
      ) : null}
    </main>
  );
}
