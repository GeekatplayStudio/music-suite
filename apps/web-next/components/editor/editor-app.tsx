"use client";

import {
  ArrowLeft,
  AudioLines,
  Bookmark,
  Download,
  Keyboard,
  Magnet,
  Maximize2,
  Mic,
  MousePointer2,
  MoveHorizontal,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Scissors,
  SkipBack,
  Spline,
  Undo2,
  Upload,
  Sparkles,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, IconButton } from "@/components/editor/controls";
import { Inspector, type JobEntry } from "@/components/editor/inspector";
import { MidiControl } from "@/components/editor/midi-control";
import { PianoRoll } from "@/components/editor/piano-roll";
import { SpectralPanel } from "@/components/editor/spectral-panel";
import { RULER_HEIGHT, Timeline } from "@/components/editor/timeline";
import { TrackHeader } from "@/components/editor/track-header";
import { analyzeRun, uploadAudio } from "@/lib/api";
import { editorApi } from "@/lib/editor/api";
import { generationApi, type ProviderInfo } from "@/lib/generation/api";
import { type SplitDepth, splitParams, startSongUrl } from "@/lib/handoff";
import { EditorEngine, playsCarrier } from "@/lib/editor/engine";
import { type ProcessStep, favouriteStore } from "@/lib/editor/favourites";
import { MediaStore } from "@/lib/editor/media";
import { type MidiEvent, midiHub } from "@/lib/editor/midi";
import { parseMidi, writeMidi } from "@/lib/editor/smf";
import {
  addAssetOnNewTrack,
  addBus,
  addMarker,
  addRegion,
  addTrack,
  compTake,
  deleteClips,
  deleteRange,
  deleteSection,
  duplicateClips,
  duplicateSection,
  gridStep,
  historyReducer,
  initialHistory,
  makeClip,
  makeMidiClip,
  makeTrack,
  moveTrack,
  pasteClips,
  removeBus,
  removeMarker,
  removeRegion,
  removeTrack,
  rescaleClip,
  splitAt,
  stripExtension,
  updateBus,
  updateClips,
  updateMarker,
  updateRegion,
  updateTrack,
  warpTime
} from "@/lib/editor/store";
import {
  type Analysis,
  type Asset,
  type AssetMeta,
  type AutomationView,
  type Capabilities,
  type Clip,
  type GenerationStatus,
  type Job,
  type JobOp,
  type Note,
  type PluginInfo,
  type PluginSound,
  type ProjectState,
  type TimeRange,
  type Tool,
  type Track,
  LANES,
  TRACK_COLORS,
  clamp,
  emptyProjectState,
  formatBars,
  formatTime,
  newId,
  normalizeBus,
  normalizeClip,
  normalizeTrack,
  projectDuration
} from "@/lib/editor/types";
import { downloadBlob, encodeWav } from "@/lib/editor/wav";
import { cn } from "@/lib/utils";

const HEADER_WIDTH = 236;

/** Tempo for display: at most one decimal, so float noise such as 120.30000000000001 never shows. */
function formatBpm(bpm: number): string {
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}
const MIN_ZOOM = 2;
const MAX_ZOOM = 6000;
/** Seconds rendered after a MIDI clip ends so a plugin instrument's release is not cut off. */
const PLUGIN_TAIL_SECONDS = 2;

interface MenuState {
  x: number;
  y: number;
  clipId: string | null;
  time: number;
}

/** Notes being recorded from a MIDI keyboard, in timeline seconds. */
interface MidiTake {
  trackId: string;
  from: number;
  /** Furthest timeline position heard while recording. */
  furthest: number;
  notes: Note[];
  held: Map<number, { t: number; v: number }>;
  pedal: boolean;
  /** Keys let go while the sustain pedal was down: they end when it comes up. */
  pedalled: Set<number>;
}

/** Finish a held note at `at`. A note that wrapped round the loop ends at the loop's end. */
function closeTakeNote(take: MidiTake, pitch: number, at: number, loopEnd: number | null): void {
  const start = take.held.get(pitch);
  if (!start) return;
  take.held.delete(pitch);
  take.pedalled.delete(pitch);
  const length = at > start.t ? at - start.t : loopEnd !== null && loopEnd > start.t ? loopEnd - start.t : 0;
  const d = Math.max(0.03, length);
  take.notes.push({ t: start.t, d, p: pitch, v: start.v });
  take.furthest = Math.max(take.furthest, start.t + d);
}

const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause"],
  ["Home / End", "Jump to start / end"],
  ["V · C · R", "Select · Razor · Range tool"],
  ["S or Ctrl/Cmd+E", "Split at the playhead"],
  ["Delete", "Delete clips or the highlighted range"],
  ["Shift+Delete", "Ripple delete (close the gap)"],
  ["Ctrl/Cmd+D", "Duplicate"],
  ["Ctrl/Cmd+C · X · V", "Copy · cut · paste at the playhead"],
  ["Ctrl/Cmd+A", "Select every clip"],
  ["Ctrl/Cmd+Z · Shift+Z", "Undo · redo"],
  ["← / →", "Nudge clips, or step the playhead"],
  ["M · Shift+S", "Mute · solo the selected track"],
  ["L", "Toggle loop (uses the range if one is set)"],
  ["N", "Toggle snapping (hold Alt while dragging to bypass)"],
  ["+ / − / F", "Zoom in · out · fit"],
  ["Ctrl/Cmd+wheel", "Zoom at the pointer"],
  ["Shift+wheel", "Scroll sideways"],
  ["Shift+drag on ruler", "Draw a loop region"],
  ["Double-click a clip", "Highlight its range"],
  ["Shift+T", "Add a track"],
  ["Alt+click a selected clip", "Pin a warp marker; drag its dashed line to where it should land"],
  ["W", "Show or hide the spectral view of the selected clip"],
  ["P", "Show or hide the piano roll for the selected MIDI clip"],
  ["A", "Show volume automation · pan automation · none"],
  ["Click / drag the automation line", "Add or move a point (double-click a point to remove it)"],
  ["K", "Add a marker at the playhead"],
  ["[ / ]", "Jump to the previous / next marker"],
  ["Alt+click a marker", "Delete the marker"],
  ["Shift+R", "Turn the highlighted range into a named section"],
  ["Click a section on the ruler", "Highlight it, ready to loop, export, repeat or cut"],
  ["?", "Show this list"]
];

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeState(raw: unknown, assets: Map<string, Asset>): ProjectState {
  const base = emptyProjectState();
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base, ...(raw as Partial<ProjectState>) };
  const tracks = (Array.isArray(merged.tracks) ? merged.tracks : []).map(normalizeTrack);
  const trackIds = new Set(tracks.map((t) => t.id));
  const clips = (Array.isArray(merged.clips) ? merged.clips : [])
    .filter((clip) => trackIds.has(clip.trackId) && (Array.isArray(clip.notes) || assets.has(clip.assetId)))
    .map(normalizeClip);
  return {
    ...merged,
    version: 1,
    tracks,
    clips,
    buses: (Array.isArray(merged.buses) ? merged.buses : []).map(normalizeBus),
    markers: Array.isArray(merged.markers) ? merged.markers : [],
    regions: Array.isArray(merged.regions) ? merged.regions : [],
    limiterCeiling: typeof merged.limiterCeiling === "number" ? merged.limiterCeiling : -1,
    loop: { ...base.loop, ...merged.loop },
    assetMeta: merged.assetMeta ?? {}
  };
}

function metaFromAnalysis(analysis: Analysis): AssetMeta {
  return {
    bpm: analysis.bpm,
    keyLabel: analysis.key_label,
    firstDownbeat: analysis.first_downbeat,
    lufs: analysis.lufs
  };
}

/**
 * Place the result of an AI edit on a clip.
 * Repaint, restyle and extend replace the clip's audio (undoable); extract, add a part and
 * build a song add new tracks under it. Extra versions go on muted tracks to compare.
 */
function applySongEdit(state: ProjectState, job: Job, source: Clip): ProjectState {
  const outputs = (job.result.outputs as Record<string, unknown>[] | undefined) ?? [];
  const meta = outputs[0] ?? {};
  const task = typeof meta.task === "string" ? meta.task : "";
  const sourceIndex = state.tracks.findIndex((t) => t.id === source.trackId);
  const tracks = state.tracks.slice();
  let clips = state.clips.slice();

  const geometry = (clip: Clip, asset: Asset): Clip => {
    if (task !== "extend") return { ...clip, assetId: asset.id };
    const added = typeof meta.extended_seconds === "number" ? meta.extended_seconds : 0;
    if (meta.extend_at === "start") {
      // The new audio sits before the old: shift the clip left as far as the timeline allows.
      const shift = Math.min(added, clip.start);
      return { ...clip, assetId: asset.id, start: clip.start - shift, offset: clip.offset + added - shift, duration: clip.duration + shift };
    }
    const sourceSeconds = typeof meta.source_seconds === "number" ? meta.source_seconds : clip.offset + clip.duration;
    const reachedEnd = clip.offset + clip.duration >= sourceSeconds - 0.05;
    return reachedEnd ? { ...clip, assetId: asset.id, duration: clip.duration + added } : { ...clip, assetId: asset.id };
  };

  const addTrackBelow = (name: string, at: number, clip: Clip, muted: boolean) => {
    const track: Track = { ...makeTrack({ ...state, tracks }, name), mute: muted };
    tracks.splice(at, 0, track);
    clips.push({ ...clip, id: newId(), trackId: track.id });
  };

  const inPlace = task === "repaint" || task === "cover" || task === "extend";
  job.result_assets.forEach((asset, index) => {
    const name = stripExtension(asset.name);
    if (inPlace && index === 0) {
      clips = clips.map((c) => (c.id === source.id ? { ...geometry(c, asset), name } : c));
      return;
    }
    const placed = { ...geometry(source, asset), name };
    addTrackBelow(name.slice(0, 60), sourceIndex + 1 + index, placed, index > 0);
  });
  if (task === "complete") {
    // The new arrangement already contains the part, so the original would double it.
    clips = clips.map((c) => (c.id === source.id ? { ...c, muted: true } : c));
  }
  return { ...state, tracks, clips };
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** Fold a finished backend job into the project as a single undoable edit. */
/** A MIDI clip's notes as a plugin instrument plays them: from the clip's start, cut at its end. */
function pluginNotes(clip: Clip): Note[] {
  const end = clip.offset + clip.duration;
  return (clip.notes ?? [])
    .filter((note) => note.t >= clip.offset - 1e-6 && note.t < end)
    .map((note) => ({
      t: Math.max(0, note.t - clip.offset),
      d: Math.max(0.005, Math.min(note.d, end - note.t)),
      p: clamp(Math.round(note.p), 0, 127),
      v: clamp(note.v, 0, 1)
    }));
}

function applyJob(state: ProjectState, job: Job, clipId: string): ProjectState {
  const source = state.clips.find((c) => c.id === clipId);
  if (job.op === "plugin_window" && source) {
    // The sound shaped in the plugin's own window is kept with the track. A session without a
    // window cannot change the sound, and the track already holds the last one picked.
    const sound = typeof job.result.state === "string" && job.result.window !== false ? job.result.state : undefined;
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id === source.trackId && t.pluginInstrument && sound ? { ...t, pluginInstrument: { ...t.pluginInstrument, state: sound } } : t
      )
    };
  }
  if (job.op === "analyze" && job.asset_id) {
    return { ...state, assetMeta: { ...state.assetMeta, [job.asset_id]: metaFromAnalysis(job.result as unknown as Analysis) } };
  }
  if (job.op === "generate" && source && job.result_assets.length) {
    const asset = job.result_assets[0];
    const index = state.tracks.findIndex((t) => t.id === source.trackId);
    const track = makeTrack(state, "Generated");
    const tracks = [...state.tracks.slice(0, index + 1), track, ...state.tracks.slice(index + 1)];
    const clip = { ...makeClip(asset, track.id, source.start), name: stripExtension(asset.name) };
    return { ...state, tracks, clips: [...state.clips, clip] };
  }
  if (job.op === "to_midi" && source) {
    const notes = (job.result.notes as Note[] | undefined) ?? [];
    const index = state.tracks.findIndex((t) => t.id === source.trackId);
    const track = makeTrack(state, `${source.name} (MIDI)`);
    const tracks = [...state.tracks.slice(0, index + 1), track, ...state.tracks.slice(index + 1)];
    const clip = { ...makeMidiClip(track.id, source.start, source.duration, notes, `${source.name} (notes)`), offset: source.offset };
    return { ...state, tracks, clips: [...state.clips, clip] };
  }
  if (job.op === "structure" && source) {
    const found = (job.result.sections as { start: number; end: number; label: string }[] | undefined) ?? [];
    const regions = found
      .map((section) => ({
        id: newId(),
        // Sections are measured in the clip's audio; this places them on the timeline.
        start: Math.max(source.start, source.start + section.start - source.offset),
        end: Math.min(source.start + source.duration, source.start + section.end - source.offset),
        name: `Section ${section.label}`,
        color: TRACK_COLORS[(section.label.charCodeAt(0) - 65 + 3) % TRACK_COLORS.length]
      }))
      .filter((region) => region.end - region.start > 0.5);
    // Detecting again replaces the earlier automatic sections over this clip; named ones are kept.
    const end = source.start + source.duration;
    const kept = state.regions.filter((r) => !(/^Section [A-Z]$/.test(r.name) && r.start < end && r.end > source.start));
    return { ...state, regions: [...kept, ...regions].sort((a, b) => a.start - b.start) };
  }
  if (!source || !job.result_assets.length) return state;

  if (job.op === "generate_song") return applySongEdit(state, job, source);

  if (job.op === "render_instrument") {
    // The rendered audio goes on a new track under the MIDI one, which is muted so it is not heard twice.
    const asset = job.result_assets[0];
    const index = state.tracks.findIndex((t) => t.id === source.trackId);
    const track = makeTrack(state, `${source.name} (${String(job.result.plugin ?? "plugin")})`);
    const tracks = [...state.tracks.slice(0, index + 1), track, ...state.tracks.slice(index + 1)];
    const clip = { ...makeClip(asset, track.id, source.start), name: source.name };
    const clips = state.clips.map((c) => (c.id === clipId ? { ...c, muted: true } : c));
    return { ...state, tracks, clips: [...clips, clip] };
  }

  if (job.op === "separate") {
    const sourceIndex = state.tracks.findIndex((t) => t.id === source.trackId);
    const tracks = state.tracks.slice();
    const clips = state.clips.map((c) => (c.id === clipId ? { ...c, muted: true } : c));
    job.result_assets.forEach((asset, i) => {
      const track: Track = makeTrack({ ...state, tracks }, capitalize(asset.label ?? stripExtension(asset.name)));
      tracks.splice(sourceIndex + 1 + i, 0, track);
      clips.push({
        ...source,
        id: newId(),
        trackId: track.id,
        assetId: asset.id,
        name: asset.label ?? stripExtension(asset.name),
        muted: false
      });
    });
    return { ...state, tracks, clips };
  }

  const asset = job.result_assets[0];
  const name = stripExtension(asset.name);
  if (job.op === "stretch" || job.op === "match") {
    const rate = typeof job.result.rate === "number" && job.result.rate > 0 ? job.result.rate : 1;
    let next = updateClips(state, [clipId], (c) => ({ ...rescaleClip(c, rate, asset.id), name }));
    const analysis = job.result.analysis as Analysis | undefined;
    if (job.op === "match" && analysis) {
      next = { ...next, assetMeta: { ...next.assetMeta, [asset.id]: metaFromAnalysis(analysis) } };
      const downbeat = analysis.first_downbeat;
      next = updateClips(next, [clipId], (c) => {
        if (c.reversed || downbeat === null || downbeat < c.offset || downbeat > c.offset + c.duration) return c;
        const bar = (60 / next.bpm) * next.beatsPerBar;
        const onTimeline = c.start + downbeat - c.offset;
        const start = c.start + Math.round(onTimeline / bar) * bar - onTimeline;
        return start >= 0 ? { ...c, start } : c;
      });
    }
    return next;
  }
  if (job.op === "warp" || job.op === "quantize") {
    const anchors = (job.result.anchors as [number, number][] | undefined) ?? [];
    return updateClips(state, [clipId], (c) => {
      const offset = warpTime(anchors, c.offset);
      const duration = Math.max(0.02, warpTime(anchors, c.offset + c.duration) - offset);
      return { ...c, assetId: asset.id, name, offset, duration, warp: undefined, fadeIn: Math.min(c.fadeIn, duration / 2), fadeOut: Math.min(c.fadeOut, duration / 2) };
    });
  }
  return updateClips(state, [clipId], (c) => ({ ...c, assetId: asset.id, name }));
}

function levelToMeter(peak: number): number {
  if (peak <= 0.001) return 0;
  return clamp((20 * Math.log10(peak) + 60) / 60, 0, 1);
}

type ExportKind = "wav24" | "wav32" | "tracks" | "range" | "mp3" | "flac" | "mastering" | "studio";

const EXPORT_ITEMS: { kind: ExportKind; label: string; needsRange?: boolean }[] = [
  { kind: "wav24", label: "Mixdown · WAV 24-bit" },
  { kind: "wav32", label: "Mixdown · WAV 32-bit float" },
  { kind: "flac", label: "Mixdown · FLAC" },
  { kind: "mp3", label: "Mixdown · MP3 320 kbps" },
  { kind: "range", label: "Highlighted range · WAV 24-bit", needsRange: true },
  { kind: "tracks", label: "Each track · WAV 24-bit" },
  { kind: "mastering", label: "Send mix to the analyser and mastering →" },
  { kind: "studio", label: "Start an AI song from the mix →" }
];

export function EditorApp({
  projectId,
  splitAssetId = null,
  splitDepth = "auto"
}: {
  projectId: string;
  splitAssetId?: string | null;
  splitDepth?: SplitDepth;
}) {
  const router = useRouter();
  const [engine] = useState(() => new EditorEngine(emptyProjectState()));
  const [media] = useState(() => new MediaStore(engine, projectId));
  const [history, dispatch] = useReducer(historyReducer, emptyProjectState(), initialHistory);
  const state = history.present;

  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map());
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [generation, setGeneration] = useState<GenerationStatus | null>(null);
  const [songProviders, setSongProviders] = useState<ProviderInfo[]>([]);
  const checkGeneration = useCallback(() => {
    editorApi
      .generation()
      .then(setGeneration)
      .catch(() => setGeneration({ available: false, node_installed: false, models: [] }));
    // Generators that can edit clips power the AI edit panel: the local engine, then online ones.
    generationApi
      .overview()
      .then((overview) =>
        setSongProviders(
          overview.providers.filter(
            (p) => p.id === "acestep_local" || (p.enabled && p.kind === "external" && p.schema.tasks.some((t) => t.source))
          )
        )
      )
      .catch(() => setSongProviders([]));
  }, []);
  const [savedState, setSavedState] = useState<ProjectState | null>(null);
  const [saveError, setSaveError] = useState(false);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [pxPerSec, setPxPerSec] = useState(40);
  const [scrollSec, setScrollSec] = useState(0);
  const [viewWidth, setViewWidth] = useState(800);
  const [lanesHeight, setLanesHeight] = useState(320);
  const [playing, setPlaying] = useState(false);
  const [, setTransportTick] = useState(0);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  // Event handlers read the latest jobs without being re-created for each update.
  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [showSpectral, setShowSpectral] = useState(false);
  const [wamWindow, setWamWindow] = useState<string | null>(null);
  const [showPiano, setShowPiano] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recentSteps, setRecentSteps] = useState<ProcessStep[]>([]);
  const favourites = useSyncExternalStore(favouriteStore.subscribe, favouriteStore.getSnapshot, favouriteStore.getServerSnapshot);
  const punchRef = useRef<TimeRange | null>(null);
  const stoppingRef = useRef(false);

  const stateRef = useRef(state);
  const aliveRef = useRef(true);
  const clipboardRef = useRef<Clip[]>([]);
  const meterEls = useRef(new Map<string, HTMLDivElement>());
  const masterMeterRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<HTMLButtonElement | null>(null);
  const statsRef = useRef<HTMLSpanElement | null>(null);
  const viewWidthRef = useRef(800);
  const hscrollRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    stateRef.current = state;
    engine.setState(state);
  }, [engine, state]);

  const commit = useCallback((next: ProjectState, key?: string) => {
    dispatch({ type: "set", state: next, key: key || undefined, at: performance.now() });
  }, []);

  /* ---------- Loading ---------- */

  useEffect(
    () =>
      media.subscribe((loaded) => {
        if (loaded) setMediaVersion((v) => v + 1);
        else setNotice("Some audio could not be loaded. Check that Music Suite is still running.");
      }),
    [media]
  );

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const [project, caps] = await Promise.all([
          editorApi.getProject(projectId),
          editorApi.capabilities().catch(() => null)
        ]);
        if (cancelled) return;
        const assetMap = new Map(project.assets.map((a) => [a.id, a]));
        const loaded = normalizeState(project.state, assetMap);
        setName(project.name);
        setAssets(assetMap);
        setCapabilities(caps);
        dispatch({ type: "load", state: loaded });
        setSavedState(loaded);
        const duration = projectDuration(loaded);
        if (duration > 0) setPxPerSec(clamp((viewWidthRef.current - 48) / duration, MIN_ZOOM, MAX_ZOOM));
        setReady(true);
        checkGeneration();
        if (caps?.plugins.available) {
          editorApi
            .plugins()
            .then((list) => !cancelled && setPlugins(list.plugins))
            .catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, "The project could not be opened."));
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [projectId, checkGeneration]);

  useEffect(() => {
    for (const clip of state.clips) if (!clip.notes) media.ensure(clip.assetId);
  }, [state.clips, media]);

  useEffect(() => {
    const unsubscribe = engine.subscribe(() => {
      setPlaying(engine.playing);
      setTransportTick((n) => n + 1);
    });
    return () => {
      unsubscribe();
      engine.dispose();
    };
  }, [engine]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setLanesHeight(Math.max(200, element.clientHeight - RULER_HEIGHT)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  /* ---------- In-browser plugins ---------- */

  const wamSignature = state.tracks.map((t) => `${t.id}=${t.wam?.url ?? ""}`).join("|");
  useEffect(() => {
    if (!ready) return;
    for (const track of stateRef.current.tracks) {
      engine.syncWam(track.id, track.wam?.url ?? null, track.wam?.state).catch((err: unknown) => {
        setNotice(`${track.wam?.name ?? "The plugin"} could not be loaded: ${errorMessage(err, "unknown error")}`);
      });
    }
  }, [engine, ready, wamSignature]);

  /** Copy every loaded plugin's current settings into the session so they are saved with it. */
  const captureWamStates = async () => {
    let next = stateRef.current;
    for (const track of next.tracks) {
      if (!track.wam || !engine.hasWam(track.id)) continue;
      const settings = await engine.wamState(track.id).catch(() => null);
      if (settings !== null) next = updateTrack(next, track.id, { wam: { ...track.wam, state: settings } });
    }
    if (next !== stateRef.current) commit(next);
  };

  const wamHostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = wamHostRef.current;
    if (!wamWindow || !host) return;
    let cancelled = false;
    // The plugin may still be loading when its window is opened, so wait for it briefly.
    const show = async () => {
      for (let attempt = 0; attempt < 40 && !cancelled && !engine.hasWam(wamWindow); attempt++) await delay(250);
      const element = cancelled ? null : await engine.wamGui(wamWindow).catch(() => null);
      if (cancelled) return;
      if (element) host.replaceChildren(element);
      else host.textContent = "This plugin has no controls of its own, or it is not loaded.";
    };
    void show();
    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [engine, wamWindow, wamSignature]);

  /** Save first so generated tracks are added to the latest version of the project. */
  const openSongStudio = () => {
    void editorApi
      .saveState(projectId, state)
      .catch(() => undefined)
      .then(() => router.push(`/generate?project=${projectId}`));
  };

  /* ---------- Autosave ---------- */

  useEffect(() => {
    if (!ready || state === savedState) return;
    const timer = setTimeout(() => {
      editorApi
        .saveState(projectId, state)
        .then(() => {
          setSavedState(state);
          setSaveError(false);
        })
        .catch(() => setSaveError(true));
    }, 800);
    return () => clearTimeout(timer);
  }, [ready, state, savedState, projectId]);

  /* ---------- Meters and clock ---------- */

  useEffect(() => {
    let frame = 0;
    const held = new Map<string, number>();
    const paint = (element: HTMLDivElement | null, id: string, peak: number) => {
      if (!element) return;
      const previous = held.get(id) ?? 0;
      const level = peak > previous ? peak : previous * 0.92;
      held.set(id, level);
      element.style.transform =
        id === "master" ? `scaleX(${levelToMeter(level).toFixed(3)})` : `scaleY(${levelToMeter(level).toFixed(3)})`;
      element.style.backgroundColor = level >= 0.999 ? "#f43f5e" : level > 0.7 ? "#fbbf24" : "#34d399";
    };
    let tick = 0;
    const loop = () => {
      const current = stateRef.current;
      const position = engine.position();
      tick += 1;
      if (statsRef.current && tick % 6 === 0) {
        const stats = engine.masterStats();
        const show = (value: number | null) => (value === null ? "   —" : value.toFixed(1)).padStart(5, " ");
        const over = stats.truePeakDb !== null && stats.truePeakDb > current.limiterCeiling + 0.1 && current.limiter;
        statsRef.current.textContent = `I${show(stats.integrated)} S${show(stats.shortTerm)} M${show(stats.momentary)} LUFS · TP${show(stats.truePeakDb)}`;
        statsRef.current.style.color = over || (stats.truePeakDb ?? -99) > 0 ? "#fda4af" : "";
      }
      if (timeRef.current) {
        timeRef.current.textContent =
          current.rulerMode === "bars"
            ? formatBars(position, current.bpm, current.beatsPerBar)
            : formatTime(position);
      }
      for (const [id, element] of meterEls.current) paint(element, id, engine.trackLevel(id));
      paint(masterMeterRef.current, "master", engine.masterLevel());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  /* ---------- Derived ---------- */

  const selectedClips = useMemo(() => state.clips.filter((c) => selection.has(c.id)), [state.clips, selection]);
  const primaryClip = selectedClips[0] ?? null;
  const selectedTrack =
    state.tracks.find((t) => t.id === (primaryClip?.trackId ?? selectedTrackId)) ?? null;
  const midiStatus = useSyncExternalStore(midiHub.watch, midiHub.snapshot, midiHub.serverSnapshot);
  const keyboardConnected =
    midiStatus.state === "ready" && midiStatus.inputs.some((input) => midiStatus.selected === "all" || input.id === midiStatus.selected);
  const hasNotes = (trackId: string) => state.clips.some((c) => c.trackId === trackId && c.notes);
  // The keyboard plays the selected track, or else the first track that holds MIDI notes.
  const midiTrack = selectedTrack ?? state.tracks.find((t) => hasNotes(t.id)) ?? null;
  const midiPlaysVoice = midiTrack !== null && playsCarrier(midiTrack);
  // Recording captures keyboard notes on an instrument track; everywhere else it records the microphone.
  const recordsNotes = keyboardConnected && midiTrack !== null && hasNotes(midiTrack.id) && !midiPlaysVoice;
  const duration = projectDuration(state);
  const totalSec = Math.max(duration * 1.2 + 20, viewWidth / pxPerSec);

  /* ---------- View ---------- */

  const setView = useCallback((nextPx: number, nextScroll: number) => {
    setPxPerSec(clamp(nextPx, MIN_ZOOM, MAX_ZOOM));
    setScrollSec(Math.max(0, nextScroll));
  }, []);

  const zoomBy = (factor: number) => {
    const next = clamp(pxPerSec * factor, MIN_ZOOM, MAX_ZOOM);
    const anchor = engine.position();
    const anchorX = clamp((anchor - scrollSec) * pxPerSec, 0, viewWidth);
    setView(next, anchor - anchorX / next);
  };

  const zoomFit = () => {
    if (duration <= 0) return;
    setView((viewWidth - 48) / duration, 0);
  };

  useEffect(() => {
    const element = hscrollRef.current;
    if (!element) return;
    const target = scrollSec * pxPerSec;
    if (Math.abs(element.scrollLeft - target) > 1) element.scrollLeft = target;
  }, [scrollSec, pxPerSec, totalSec]);

  /* ---------- Transport ---------- */

  const togglePlay = () => {
    if (engine.playing) engine.pause();
    else void engine.play();
  };

  const seek = useCallback((time: number) => engine.seek(time), [engine]);
  const getPosition = useCallback(() => engine.position(), [engine]);
  const getBuffer = useCallback((assetId: string) => engine.buffer(assetId), [engine]);
  const getScope = useCallback(() => engine.scope(), [engine]);
  const getPeaks = useCallback((assetId: string) => media.peaksFor(assetId), [media]);

  const toggleLoop = () => {
    const { loop } = state;
    if (range && range.end > range.start) {
      commit({ ...state, loop: { enabled: true, start: range.start, end: range.end } });
    } else if (loop.end > loop.start) {
      commit({ ...state, loop: { ...loop, enabled: !loop.enabled } });
    } else if (duration > 0) {
      commit({ ...state, loop: { enabled: true, start: 0, end: duration } });
    }
  };

  /* ---------- Editing ---------- */

  const select = useCallback((ids: Set<string>, trackId: string | null) => {
    setSelection(ids);
    if (trackId) setSelectedTrackId(trackId);
  }, []);

  const splitAtTime = (time: number, ids: Set<string> | null) => {
    const result = splitAt(state, time, ids);
    if (result.created.length) commit(result.state);
  };

  const removeSelection = (ripple: boolean) => {
    if (selection.size) {
      commit(deleteClips(state, selection, ripple));
      setSelection(new Set());
    } else if (range) {
      commit(deleteRange(state, range, ripple, null));
      setRange(null);
    }
  };

  const duplicate = () => {
    const result = duplicateClips(state, selection);
    if (!result.created.length) return;
    commit(result.state);
    setSelection(new Set(result.created));
  };

  const copy = () => {
    if (selectedClips.length) clipboardRef.current = selectedClips.map((c) => ({ ...c }));
  };

  const paste = (time: number) => {
    const result = pasteClips(state, clipboardRef.current, time, selectedTrackId);
    if (!result.created.length) return;
    commit(result.state);
    setSelection(new Set(result.created));
  };

  const patchClips = (patch: Partial<Clip>, key: string) => {
    commit(
      updateClips(state, selection, (c) => {
        const next = { ...c, ...patch };
        next.fadeIn = clamp(next.fadeIn, 0, next.duration);
        next.fadeOut = clamp(next.fadeOut, 0, next.duration - next.fadeIn);
        return next;
      }),
      key
    );
  };

  const patchTrack = (trackId: string, patch: Partial<Track>, key: string) => {
    commit(updateTrack(state, trackId, patch), key ? `${key}:${trackId}` : undefined);
  };

  const addEmptyTrack = () => {
    const added = addTrack(state);
    commit(added.state);
    setSelectedTrackId(added.track.id);
  };

  const placeAsset = (asset: Asset, time: number, trackId: string | null) => {
    const current = stateRef.current;
    if (trackId && current.tracks.some((t) => t.id === trackId)) {
      const clip = makeClip(asset, trackId, time);
      commit({ ...current, clips: [...current.clips, clip] });
      select(new Set([clip.id]), trackId);
    } else {
      const added = addAssetOnNewTrack(current, asset, time);
      commit(added.state);
      select(new Set([added.clip.id]), added.track.id);
    }
  };

  const importFiles = async (files: File[], time: number, trackId: string | null) => {
    const wasEmpty = stateRef.current.clips.length === 0;
    for (const [index, file] of files.entries()) {
      setWorking(`Importing ${file.name} (${index + 1} of ${files.length})…`);
      if (/\.midi?$/i.test(file.name)) {
        // MIDI files are read here in the browser; there is no audio to upload.
        try {
          const midi = parseMidi(await file.arrayBuffer());
          if (!midi.tracks.length) throw new Error("it contains no notes");
          let current = stateRef.current;
          const created: Clip[] = [];
          for (const part of midi.tracks) {
            const added = addTrack(current, part.name);
            current = added.state;
            const length = Math.max(1, ...part.notes.map((note) => note.t + note.d));
            created.push(makeMidiClip(added.track.id, time, length, part.notes, part.name));
          }
          commit({ ...current, clips: [...current.clips, ...created] });
          select(new Set([created[0].id]), created[0].trackId);
          await delay(0);
        } catch (err) {
          setNotice(`${file.name}: ${errorMessage(err, "could not be read")}`);
        }
        continue;
      }
      try {
        const asset = await editorApi.uploadAsset(projectId, file);
        if (!aliveRef.current) return;
        setAssets((prev) => new Map(prev).set(asset.id, asset));
        placeAsset(asset, time, files.length === 1 ? trackId : null);
        // Let React apply the edit so the next file sees the new track.
        await delay(0);
      } catch (err) {
        setNotice(`${file.name}: ${errorMessage(err, "import failed")}`);
      }
    }
    setWorking(null);
    if (wasEmpty) {
      const length = projectDuration(stateRef.current);
      if (length > 0) setView((viewWidthRef.current - 48) / length, 0);
    }
  };

  /* ---------- Backend jobs ---------- */

  /** Selected clips grouped by the audio they use, so shared audio is processed once. */
  const targetGroups = (single: boolean): string[][] => {
    const byAsset = new Map<string, string[]>();
    for (const clip of single ? selectedClips.slice(0, 1) : selectedClips) {
      // Audio processing does not apply to MIDI clips.
      if (clip.notes) continue;
      byAsset.set(clip.assetId, [...(byAsset.get(clip.assetId) ?? []), clip.id]);
    }
    return [...byAsset.values()];
  };

  /** Run a processing job on every selected clip (one-clip tools: the first only). */
  const runJobs = (op: JobOp, params: Record<string, unknown>, title: string) => {
    const single =
      op === "spectral_repair" || op === "warp" || op === "match" || op === "generate" || op === "generate_song";
    const groups = targetGroups(single);
    const many = selectedClips.length > 1 && !single;
    // A noise print is measured in one clip's audio, so it cannot be shared across a batch.
    const shared = many && op === "denoise" ? { ...params, noise_start: null, noise_end: null } : params;
    const verb = title.split(" ").slice(0, 2).join(" ");
    if (!["spectral_repair", "warp", "match", "analyze", "separate", "to_midi", "structure", "generate", "generate_song"].includes(op)) {
      setRecentSteps((prev) => [...prev, { op, params: shared, label: verb }].slice(-6));
    }
    for (const ids of groups) void runJob(op, shared, many ? `${verb} (${ids.length} clip${ids.length > 1 ? "s" : ""})` : title, ids);
  };

  /** Run a saved chain: each step works on the result of the one before. */
  const runFavourite = (steps: ProcessStep[]) => {
    for (const ids of targetGroups(false)) {
      void (async () => {
        for (const [index, step] of steps.entries()) {
          const ok = await runJob(step.op, step.params, `${step.label} (step ${index + 1} of ${steps.length})`, ids);
          if (!ok) return;
          // Let the edit land so the next step picks up the new audio.
          await delay(120);
        }
      })();
    }
  };

  const runJob = async (op: JobOp, params: Record<string, unknown>, title: string, clipIds: string[]): Promise<boolean> => {
    const clip = stateRef.current.clips.find((c) => c.id === clipIds[0]);
    if (!clip) return false;
    let job: Job;
    try {
      // MIDI clips have no audio of their own: their jobs start from the notes.
      job = await editorApi.startJob(projectId, op, clip.notes ? null : clip.assetId, params);
    } catch (err) {
      setNotice(errorMessage(err, "The job could not be started."));
      return false;
    }
    const jobId = job.id;
    const publish = (latest: Job) =>
      setJobs((prev) => {
        const entry = { job: latest, clipId: clip.id, title };
        return prev.some((j) => j.job.id === jobId)
          ? prev.map((j) => (j.job.id === jobId ? entry : j))
          : [...prev, entry];
      });
    publish(job);
    let failures = 0;
    while (aliveRef.current && (job.status === "queued" || job.status === "running")) {
      await delay(600);
      try {
        job = await editorApi.getJob(projectId, jobId);
        failures = 0;
        publish(job);
      } catch {
        failures += 1;
        if (failures > 8) {
          publish({ ...job, status: "failed", error: "Lost contact with the Music Suite API." });
          return false;
        }
      }
    }
    if (!aliveRef.current || job.status !== "completed") return false;
    if (job.result_assets.length) {
      setAssets((prev) => {
        const next = new Map(prev);
        for (const asset of job.result_assets) next.set(asset.id, asset);
        return next;
      });
    }
    let next = stateRef.current;
    for (const id of clipIds) next = applyJob(next, job, id);
    commit(next);
    setTimeout(() => {
      if (aliveRef.current) setJobs((prev) => prev.filter((j) => j.job.id !== jobId));
    }, 3500);
    return true;
  };

  // A song sent with "split into stems" is separated once, as soon as the session is open.
  const splitStartedRef = useRef(false);
  const startSplit = useEffectEvent(() => {
    window.history.replaceState(null, "", `/editor?project=${projectId}`);
    const clip = stateRef.current.clips.find((c) => c.assetId === splitAssetId && !c.notes);
    if (!clip) {
      setNotice("The song to split into stems is not on the timeline. Select it and use Separate stems.");
      return;
    }
    const options = capabilities?.separation.stem_options ?? [2, 4];
    const fine = Boolean(capabilities?.separation.detail);
    // Without the AI separators a "full" split falls back to the most stems available.
    const params = splitParams(splitDepth === "full" && !fine ? "auto" : splitDepth, options);
    void runJob("separate", params, `Separating ${clip.name}`, [clip.id]);
  });
  useEffect(() => {
    if (!ready || !splitAssetId || splitStartedRef.current) return;
    splitStartedRef.current = true;
    startSplit();
  }, [ready, splitAssetId]);

  /** Play a MIDI clip's notes through the track's plugin instrument into a new audio track. */
  const renderWithPlugin = (clipId: string) => {
    const clip = stateRef.current.clips.find((c) => c.id === clipId);
    const track = clip ? stateRef.current.tracks.find((t) => t.id === clip.trackId) : undefined;
    const instrument = track?.pluginInstrument;
    if (!clip?.notes || !instrument) return;
    const notes = pluginNotes(clip);
    if (!notes.length) {
      setNotice("This clip has no notes to play.");
      return;
    }
    const params = {
      plugin_id: instrument.id,
      state: instrument.state ?? null,
      notes,
      // Room for the last notes to ring out.
      seconds: clip.duration + PLUGIN_TAIL_SECONDS,
      name: clip.name.slice(0, 120) || "MIDI"
    };
    void runJob("render_instrument", params, `Playing ${clip.name} through ${instrument.name}`, [clip.id]);
  };

  /** Open the plugin instrument's own window on this computer; its sound is kept when it closes. */
  const openPluginWindow = (clipId: string) => {
    const clip = stateRef.current.clips.find((c) => c.id === clipId);
    const instrument = clip ? stateRef.current.tracks.find((t) => t.id === clip.trackId)?.pluginInstrument : undefined;
    if (!clip || !instrument) return;
    // The clip's notes come along so they can be played live while the window is open.
    const params = { plugin_id: instrument.id, state: instrument.state ?? null, notes: pluginNotes(clip), seconds: clamp(clip.duration, 0.25, 600), live: true };
    void runJob("plugin_window", params, `${instrument.name} window open: close it to keep the sound`, [clip.id]);
  };

  /** The running plugin session (window or listening) for a clip, if any. */
  const pluginSession = (clipId: string) =>
    jobsRef.current.find((j) => j.clipId === clipId && j.job.op === "plugin_window" && (j.job.status === "queued" || j.job.status === "running"));

  /** Play the clip through its plugin instrument: in the open window, or in a new listening session. */
  const playPlugin = (clipId: string, loop = true) => {
    const running = pluginSession(clipId);
    if (running) {
      if (!loop) return;
      void editorApi.previewInPluginWindow(projectId, running.job.id, true).catch((err: unknown) => setNotice(errorMessage(err, "Playing could not start.")));
      return;
    }
    const clip = stateRef.current.clips.find((c) => c.id === clipId);
    const instrument = clip ? stateRef.current.tracks.find((t) => t.id === clip.trackId)?.pluginInstrument : undefined;
    if (!clip || !instrument) return;
    const params = {
      plugin_id: instrument.id,
      state: instrument.state ?? null,
      notes: pluginNotes(clip),
      seconds: clamp(clip.duration, 0.25, 600),
      window: false,
      play: loop,
      live: true
    };
    const title = loop ? `Playing ${clip.name} through ${instrument.name}` : `${instrument.name} is live: play your MIDI keyboard`;
    void runJob("plugin_window", params, title, [clip.id]);
  };

  /** The running plugin session that plays a track, if any: live notes go to it. */
  const liveSession = (trackId: string | undefined) =>
    trackId
      ? jobsRef.current.find(
          (j) =>
            j.job.op === "plugin_window" &&
            (j.job.status === "queued" || j.job.status === "running") &&
            stateRef.current.clips.find((c) => c.id === j.clipId)?.trackId === trackId
        )
      : undefined;
  const sendLive = (jobId: string, messages: number[][]) =>
    void editorApi.midiToPluginWindow(projectId, jobId, messages).catch(() => undefined);

  /** Stop playing: a listening session ends; an open window stays open, silent. */
  const stopPlugin = (clipId: string) => {
    const running = pluginSession(clipId);
    if (!running) return;
    const call =
      // In the plugin's window Stop only silences the loop; otherwise it ends the session.
      running.job.stage === "window"
        ? editorApi.previewInPluginWindow(projectId, running.job.id, false)
        : editorApi.closePluginWindow(projectId, running.job.id);
    void call.catch((err: unknown) => setNotice(errorMessage(err, "Playing could not be stopped.")));
  };

  /** Switch the track to a sound from the plugin's library, live if a session is running. */
  const pickPluginSound = async (clipId: string, sound: PluginSound) => {
    const clip = stateRef.current.clips.find((c) => c.id === clipId);
    const track = clip ? stateRef.current.tracks.find((t) => t.id === clip.trackId) : undefined;
    const instrument = track?.pluginInstrument;
    if (!track || !instrument) return;
    try {
      await applyPluginSound(clipId, await editorApi.pluginSoundState(instrument.id, sound.id));
    } catch (err) {
      setNotice(errorMessage(err, "That sound could not be loaded."));
    }
  };

  /** Put a sound (from the library or a file) on the clip's track, live if a session is running. */
  const applyPluginSound = async (clipId: string, built: { name: string; state: string }) => {
    const clip = stateRef.current.clips.find((c) => c.id === clipId);
    const track = clip ? stateRef.current.tracks.find((t) => t.id === clip.trackId) : undefined;
    const instrument = track?.pluginInstrument;
    if (!track || !instrument) return;
    try {
      const latest = stateRef.current.tracks.find((t) => t.id === track.id)?.pluginInstrument;
      if (latest?.id !== instrument.id) return; // The instrument changed meanwhile.
      commit(updateTrack(stateRef.current, track.id, { pluginInstrument: { ...latest, state: built.state, soundName: built.name } }));
      const running = pluginSession(clipId);
      if (running) await editorApi.loadInPluginWindow(projectId, running.job.id, built.state);
    } catch (err) {
      setNotice(errorMessage(err, "That sound could not be loaded."));
    }
  };

  const refreshPlugins = () => {
    editorApi
      .plugins()
      .then((list) => aliveRef.current && setPlugins(list.plugins))
      .catch(() => undefined);
  };

  /** Render a few seconds through a plugin and play them, without changing the session. */
  const auditionPlugin = async (pluginId: string, parameters: Record<string, number>) => {
    const clip = primaryClip;
    if (!clip || working) return;
    engine.pause();
    setWorking("Rendering a plugin audition…");
    try {
      const local = clamp(engine.position() - clip.start, 0, Math.max(0, clip.duration - 1));
      let job = await editorApi.startJob(projectId, "plugin", clip.assetId, {
        plugin_id: pluginId,
        parameters,
        preview_start: clip.offset + local,
        preview_seconds: 8
      });
      while (aliveRef.current && (job.status === "queued" || job.status === "running")) {
        await delay(400);
        job = await editorApi.getJob(projectId, job.id);
      }
      if (job.status !== "completed" || !job.result_assets.length) throw new Error(job.error ?? "The audition failed.");
      const assetId = job.result_assets[0].id;
      const player = new Audio(editorApi.assetAudioUrl(projectId, assetId));
      // The excerpt is only for listening, so it is removed once it has played.
      const discard = () => void editorApi.deleteAsset(projectId, assetId).catch(() => undefined);
      player.addEventListener("ended", discard, { once: true });
      player.addEventListener("error", discard, { once: true });
      setWorking("Playing the audition…");
      await player.play();
      await delay(8200);
    } catch (err) {
      setNotice(errorMessage(err, "The audition failed."));
    }
    setWorking(null);
  };

  /* ---------- Recording ---------- */

  /* MIDI keyboard: live play-through, and note recording onto instrument tracks. */

  const midiTakeRef = useRef<MidiTake | null>(null);

  const onMidi = useEffectEvent((event: MidiEvent) => {
    const take = midiTakeRef.current;
    const loopEnd = state.loop.enabled && state.loop.end > state.loop.start ? state.loop.end : null;
    // Where the key went down on the timeline: what was audible then, not what was being scheduled.
    const at = () => Math.max(0, engine.heardPosition() - Math.max(0, (performance.now() - event.timeStamp) / 1000));
    // While a plugin instrument is running for the track, it sounds the keys instead of the built-in synth.
    const live = liveSession(take?.trackId ?? midiTrack?.id)?.job.id;
    if (live) {
      if (event.kind === "on") sendLive(live, [[0x90, event.pitch, clamp(Math.round(event.velocity * 127), 1, 127)]]);
      else if (event.kind === "off") sendLive(live, [[0x80, event.pitch, 0]]);
      else if (event.kind === "sustain") sendLive(live, [[0xb0, 64, event.down ? 127 : 0]]);
      else if (event.kind === "bend") {
        const wheel = clamp(Math.round(((event.value + 1) / 2) * 16383), 0, 16383);
        sendLive(live, [[0xe0, wheel & 0x7f, wheel >> 7]]);
      } else sendLive(live, [[0xb0, 123, 0]]);
    }
    if (event.kind === "reset") {
      engine.allNotesOff();
      if (take) for (const pitch of [...take.held.keys()]) closeTakeNote(take, pitch, at(), loopEnd);
    } else if (event.kind === "sustain") {
      engine.setSustain(event.down);
      if (take) {
        take.pedal = event.down;
        if (!event.down) for (const pitch of [...take.pedalled]) closeTakeNote(take, pitch, at(), loopEnd);
      }
    } else if (event.kind === "bend") {
      // Two semitones each way, the General MIDI default.
      engine.pitchBend(event.value * 2);
    } else if (event.kind === "on") {
      const trackId = take?.trackId ?? midiTrack?.id;
      if (trackId && !live) engine.liveNoteOn(trackId, event.pitch, event.velocity);
      if (take) {
        const time = at();
        closeTakeNote(take, event.pitch, time, loopEnd);
        take.held.set(event.pitch, { t: time, v: event.velocity });
      }
    } else {
      engine.liveNoteOff(event.pitch);
      if (take?.held.has(event.pitch)) {
        if (take.pedal) take.pedalled.add(event.pitch);
        else closeTakeNote(take, event.pitch, at(), loopEnd);
      }
    }
  });
  useEffect(() => midiHub.subscribe((event) => onMidi(event)), []);
  useEffect(() => () => engine.allNotesOff(), [engine]);

  const finishMidiTake = () => {
    const take = midiTakeRef.current;
    if (!take) return;
    midiTakeRef.current = null;
    const end = engine.heardPosition();
    engine.pause();
    setRecording(false);
    let current = stateRef.current;
    const loopEnd = current.loop.enabled && current.loop.end > current.loop.start ? current.loop.end : null;
    for (const pitch of [...take.held.keys()]) closeTakeNote(take, pitch, end, loopEnd);
    if (!take.notes.length) {
      setNotice("No keys were played, so nothing was recorded.");
      return;
    }
    let start = take.from;
    let stop = Math.max(take.furthest, end);
    for (const note of take.notes) {
      start = Math.min(start, note.t);
      stop = Math.max(stop, note.t + note.d);
    }
    if (current.snap) {
      // With snapping on, the new clip covers whole bars.
      const bar = (60 / current.bpm) * current.beatsPerBar;
      start = Math.floor(start / bar + 1e-6) * bar;
      stop = Math.max(start + bar, Math.ceil(stop / bar - 1e-6) * bar);
    }
    let trackId = take.trackId;
    const source = current.tracks.find((t) => t.id === trackId);
    // Like audio, a take never lands on top of existing clips: it gets a track of its own.
    const occupied = current.clips.some((c) => c.trackId === trackId && c.start < stop && c.start + c.duration > start);
    if (!source || occupied) {
      const added = addTrack(current, source ? `${source.name} (take)` : "Keyboard");
      current = source ? updateTrack(added.state, added.track.id, { synth: source.synth, fx: source.fx }) : added.state;
      trackId = added.track.id;
    }
    const notes = take.notes.map((note) => ({ ...note, t: note.t - start })).sort((a, b) => a.t - b.t);
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const clip = makeMidiClip(trackId, start, stop - start, notes, `Played ${stamp}`);
    commit({ ...current, clips: [...current.clips, clip] });
    select(new Set([clip.id]), trackId);
  };

  /** A track with an empty four-bar MIDI clip at the playhead, opened in the piano roll. */
  const addInstrumentTrack = () => {
    const added = addTrack(state, `Instrument ${state.tracks.length + 1}`);
    const bar = (60 / state.bpm) * state.beatsPerBar;
    const start = Math.floor(engine.position() / bar + 1e-6) * bar;
    const clip = makeMidiClip(added.track.id, start, bar * 4, []);
    commit({ ...added.state, clips: [...added.state.clips, clip] });
    select(new Set([clip.id]), added.track.id);
    setShowPiano(true);
  };

  const stopRecording = async () => {
    if (midiTakeRef.current) {
      finishMidiTake();
      return;
    }
    // The stop button and the end-of-range watcher can both fire; only the first counts.
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const take = await engine.stopRecording();
    stoppingRef.current = false;
    const punch = punchRef.current;
    punchRef.current = null;
    setRecording(false);
    if (!take) {
      setNotice("Nothing was recorded.");
      return;
    }
    setWorking("Saving the recording…");
    try {
      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const file = new File([encodeWav(take.buffer, 24)], `Recording ${stamp.replace(/[^0-9]+/g, " ").trim().replace(/ /g, "-")}.wav`, { type: "audio/wav" });
      const asset = await editorApi.uploadAsset(projectId, file);
      if (!aliveRef.current) return;
      setAssets((prev) => new Map(prev).set(asset.id, asset));
      let current = stateRef.current;
      // Passes too short to be a real attempt (stopping just after the loop wrapped) are dropped.
      const passes = take.segments.filter((segment, index) => index === 0 || segment.duration > 0.75);
      const created: Clip[] = [];
      if (passes.length > 1 && !punch) {
        // Loop recording: every pass becomes a take on its own lane, with the newest one audible.
        const takeGroup = newId();
        passes.forEach((pass, index) => {
          const added = addTrack(current, `Take ${index + 1}`);
          current = added.state;
          created.push({
            ...makeClip(asset, added.track.id, pass.position),
            name: `Take ${index + 1}`,
            offset: pass.offset,
            // A pass ends at the loop point; the few milliseconds recorded during the jump are dropped.
            duration: current.loop.enabled ? Math.min(pass.duration, Math.max(0.05, current.loop.end - pass.position)) : pass.duration,
            fadeIn: 0.005,
            fadeOut: 0.005,
            muted: index !== passes.length - 1,
            takeGroup
          });
        });
      } else {
        const pass = passes[0];
        let trackId = selectedTrackId && current.tracks.some((t) => t.id === selectedTrackId) ? selectedTrackId : null;
        let start = pass.position;
        let end = pass.position + pass.duration;
        if (punch) {
          // A punch-in keeps only what was played inside the highlighted range.
          start = Math.max(punch.start, start);
          end = Math.min(punch.end, end);
          if (end - start < 0.05) {
            setNotice("The recording stopped before the punch-in range began.");
            setWorking(null);
            return;
          }
        }
        // Never record on top of existing audio: a busy stretch of track gets a new track instead.
        const occupied = current.clips.some((c) => c.trackId === trackId && c.start < end && c.start + c.duration > start);
        if (!trackId || occupied) {
          const added = addTrack(current, "Recording");
          current = added.state;
          trackId = added.track.id;
        }
        created.push({
          ...makeClip(asset, trackId, start),
          name: `Take ${stamp}`,
          offset: pass.offset + (start - pass.position),
          duration: end - start,
          fadeIn: punch ? 0.01 : 0,
          fadeOut: punch ? 0.01 : 0
        });
      }
      commit({ ...current, clips: [...current.clips, ...created] });
      const last = created[created.length - 1];
      select(new Set([last.id]), last.trackId);
    } catch (err) {
      setNotice(errorMessage(err, "The recording could not be saved."));
    }
    setWorking(null);
  };
  const onRecordingEnded = useEffectEvent(() => void stopRecording());

  const toggleRecording = async () => {
    if (engine.isRecording() || midiTakeRef.current) {
      await stopRecording();
      return;
    }
    if (recordsNotes && midiTrack) {
      const from = engine.position();
      await engine.play(from);
      midiTakeRef.current = { trackId: midiTrack.id, from, furthest: from, notes: [], held: new Map(), pedal: false, pedalled: new Set() };
      setRecording(true);
      return;
    }
    const punch = range && range.end - range.start > 0.1 ? range : null;
    try {
      // Two seconds of pre-roll lets the performer come in on time.
      await engine.startRecording(punch ? Math.max(0, punch.start - 2) : engine.position());
      punchRef.current = punch;
      setRecording(true);
    } catch (err) {
      setNotice(errorMessage(err, "Recording could not start."));
    }
  };

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const take = midiTakeRef.current;
      if (take && engine.playing) take.furthest = Math.max(take.furthest, engine.heardPosition());
      const punch = punchRef.current;
      // Stop at the end of a punch-in range, or if playback was stopped another way.
      if ((punch && engine.position() >= punch.end + 0.15) || !engine.playing) onRecordingEnded();
    }, 50);
    return () => clearInterval(timer);
  }, [recording, engine]);

  /* ---------- Export ---------- */

  const exportAudio = async (kind: ExportKind) => {
    setExportOpen(false);
    const clean = (value: string) => value.replace(/[^\w .-]+/g, "_");
    const safeName = clean(name || "mix");
    try {
      await captureWamStates();
      if (kind === "tracks") {
        const used = state.tracks.filter((t) => state.clips.some((c) => c.trackId === t.id));
        for (const [index, track] of used.entries()) {
          setWorking(`Rendering ${track.name} (${index + 1} of ${used.length})…`);
          const buffer = await engine.render({ trackId: track.id });
          downloadBlob(encodeWav(buffer, 24), `${safeName} - ${clean(track.name)}.wav`);
        }
      } else {
        setWorking(kind === "range" ? "Rendering the highlighted range…" : "Rendering mixdown…");
        const buffer = await engine.render({ range: kind === "range" ? range : null });
        const wav = encodeWav(buffer, kind === "wav32" ? 32 : 24);
        if (kind === "mp3" || kind === "flac") {
          setWorking(`Encoding ${kind.toUpperCase()}…`);
          downloadBlob(await editorApi.encode(wav, kind), `${safeName}.${kind}`);
        } else if (kind === "mastering") {
          setWorking("Sending the mix to the analyser…");
          const { run } = await uploadAudio(new File([wav], `${safeName} (editor mix).wav`, { type: "audio/wav" }));
          await analyzeRun(run.id, false);
          router.push(`/?run=${run.id}`);
          return;
        } else if (kind === "studio") {
          // The mix is kept in this session's clip list (not on the timeline) as the song to start from.
          setWorking("Sending the mix to the AI Song Studio…");
          const mix = await editorApi.uploadAsset(projectId, new File([wav], `${safeName} (mix).wav`, { type: "audio/wav" }));
          router.push(startSongUrl({ projectId, assetId: mix.id, name: `${name || "Mix"} (mix)` }));
          return;
        } else {
          downloadBlob(wav, kind === "range" ? `${safeName} (range).wav` : `${safeName}.wav`);
        }
      }
      if (engine.renderWarnings.length) {
        setNotice(`Exported without these in-browser plugins, which could not run offline: ${engine.renderWarnings.join(", ")}.`);
      }
    } catch (err) {
      setNotice(errorMessage(err, "Export failed."));
    }
    setWorking(null);
  };

  /* ---------- Markers and automation view ---------- */

  const dropMarker = () => commit(addMarker(state, engine.position()).state);

  const jumpMarker = (direction: -1 | 1) => {
    const position = engine.position();
    const ordered = direction > 0 ? state.markers : state.markers.slice().reverse();
    const target = ordered.find((m) => (direction > 0 ? m.time > position + 0.01 : m.time < position - 0.01));
    if (target) seek(target.time);
  };

  const addSection = () => {
    if (range && range.end - range.start > 0.05) commit(addRegion(state, range).state);
    else setNotice("Highlight a stretch of time with the Range tool first, then add it as a section.");
  };

  const cycleAutomation = () => {
    const next = state.automationView === "off" ? "volume" : state.automationView === "volume" ? "pan" : "off";
    commit({ ...state, automationView: next });
  };

  /* ---------- Keyboard ---------- */

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    // An open dialog (such as the sound editor) handles its own keys.
    if (target?.closest('[aria-modal="true"]')) return;
    const field = target?.closest("input, textarea, select, [contenteditable='true']") as HTMLInputElement | null;
    if (field) {
      const passive = field.tagName === "INPUT" && ["range", "checkbox"].includes(field.type);
      if (!passive) {
        if (event.key === "Escape") field.blur();
        return;
      }
      // A focused slider keeps its own keys; everything else still reaches the editor.
      if (event.key.startsWith("Arrow") || ["Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
    }
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const handled = () => event.preventDefault();

    if (key === "Escape") {
      setMenu(null);
      setShowHelp(false);
      setExportOpen(false);
      setRange(null);
      setSelection(new Set());
      return;
    }
    if (mod) {
      if (key === "z") {
        handled();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        handled();
        dispatch({ type: "redo" });
      } else if (key === "c") {
        copy();
      } else if (key === "x") {
        copy();
        removeSelection(false);
      } else if (key === "v") {
        handled();
        paste(engine.position());
      } else if (key === "d") {
        handled();
        duplicate();
      } else if (key === "a") {
        handled();
        setSelection(new Set(state.clips.map((c) => c.id)));
      } else if (key === "e") {
        handled();
        splitAtTime(engine.position(), selection.size ? selection : null);
      }
      return;
    }
    if (event.altKey) return;

    switch (key) {
      case " ":
        handled();
        togglePlay();
        break;
      case "Home":
        handled();
        seek(0);
        setScrollSec(0);
        break;
      case "End":
        handled();
        seek(duration);
        break;
      case "v":
        setTool("select");
        break;
      case "c":
        setTool("razor");
        break;
      case "r":
        if (event.shiftKey) addSection();
        else setTool("range");
        break;
      case "s":
        if (event.shiftKey) {
          if (selectedTrack) patchTrack(selectedTrack.id, { solo: !selectedTrack.solo }, "");
        } else {
          splitAtTime(engine.position(), selection.size ? selection : null);
        }
        break;
      case "m":
        if (selectedTrack) patchTrack(selectedTrack.id, { mute: !selectedTrack.mute }, "");
        break;
      case "t":
        if (event.shiftKey) addEmptyTrack();
        break;
      case "l":
        toggleLoop();
        break;
      case "a":
        cycleAutomation();
        break;
      case "w":
        setShowSpectral((open) => !open);
        break;
      case "p":
        setShowPiano((open) => !open);
        break;
      case "k":
        dropMarker();
        break;
      case "[":
        jumpMarker(-1);
        break;
      case "]":
        jumpMarker(1);
        break;
      case "n":
        commit({ ...state, snap: !state.snap });
        break;
      case "f":
        zoomFit();
        break;
      case "=":
      case "+":
        zoomBy(1.4);
        break;
      case "-":
      case "_":
        zoomBy(1 / 1.4);
        break;
      case "?":
        setShowHelp(true);
        break;
      case "Delete":
      case "Backspace":
        handled();
        removeSelection(event.shiftKey);
        break;
      case "ArrowLeft":
      case "ArrowRight": {
        handled();
        const step = gridStep(state, pxPerSec) * (key === "ArrowLeft" ? -1 : 1);
        if (selection.size) {
          commit(updateClips(state, selection, (c) => ({ ...c, start: Math.max(0, c.start + step) })), "nudge");
        } else {
          seek(engine.position() + step);
        }
        break;
      }
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    if (!menu && !exportOpen) return;
    const close = () => {
      setMenu(null);
      setExportOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu, exportOpen]);

  /* ---------- Render ---------- */

  if (loadError) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
        <p className="display-font text-lg font-semibold text-slate-100">This project could not be opened</p>
        <p className="max-w-md text-sm text-slate-400">{loadError}</p>
        <Link href="/editor" className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">
          Back to projects
        </Link>
      </main>
    );
  }

  const saveLabel = saveError ? "Save failed — retrying on next edit" : state === savedState ? "Saved" : "Saving…";
  const menuClip = menu?.clipId ? state.clips.find((c) => c.id === menu.clipId) : null;
  type MenuAction = "split" | "duplicate" | "reverse" | "mute" | "copy" | "delete" | "ripple" | "paste" | "seek" | "track" | "loop";
  const menuItems: { label: string; hint?: string; danger?: boolean; action: MenuAction }[] = menu
    ? menuClip
      ? [
          { label: "Split here", hint: "S", action: "split" },
          { label: "Duplicate", hint: "Ctrl/Cmd+D", action: "duplicate" },
          { label: menuClip.reversed ? "Play forwards" : "Reverse", action: "reverse" },
          { label: menuClip.muted ? "Unmute clip" : "Mute clip", action: "mute" },
          { label: "Copy", hint: "Ctrl/Cmd+C", action: "copy" },
          { label: "Delete", hint: "Del", danger: true, action: "delete" },
          { label: "Ripple delete", hint: "Shift+Del", danger: true, action: "ripple" }
        ]
      : [
          { label: "Paste here", hint: "Ctrl/Cmd+V", action: "paste" },
          { label: "Move playhead here", action: "seek" },
          { label: "Add track", hint: "Shift+T", action: "track" },
          ...(range
            ? ([
                { label: "Loop the highlighted range", hint: "L", action: "loop" },
                { label: "Delete range", hint: "Del", danger: true, action: "delete" },
                { label: "Ripple delete range", hint: "Shift+Del", danger: true, action: "ripple" }
              ] as const)
            : [])
        ]
    : [];

  const runMenuAction = (action: MenuAction) => {
    if (!menu) return;
    const clip = menu.clipId ? state.clips.find((c) => c.id === menu.clipId) : null;
    if (action === "split" && clip) splitAtTime(menu.time, new Set([clip.id]));
    else if (action === "duplicate") duplicate();
    else if (action === "reverse" && clip) patchClips({ reversed: !clip.reversed }, "");
    else if (action === "mute" && clip) patchClips({ muted: !clip.muted }, "");
    else if (action === "copy") copy();
    else if (action === "delete") removeSelection(false);
    else if (action === "ripple") removeSelection(true);
    else if (action === "paste") paste(menu.time);
    else if (action === "seek") seek(menu.time);
    else if (action === "track") addEmptyTrack();
    else if (action === "loop") toggleLoop();
    setMenu(null);
  };

  return (
    <main className="flex h-screen min-h-[600px] flex-col overflow-hidden bg-[#070b14] text-slate-100">
      <header className="z-40 flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950 px-3">
        <Link
          href="/editor"
          aria-label="Back to projects"
          title="Back to projects"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="hidden w-44 min-w-28 flex-col lg:flex">
          <input
            value={name}
            title={name}
            aria-label="Project name"
            onChange={(event) => setName(event.target.value.slice(0, 120))}
            onBlur={() => {
              const trimmed = name.trim();
              if (trimmed) editorApi.renameProject(projectId, trimmed).catch(() => undefined);
            }}
            className="h-6 rounded bg-transparent px-1 text-sm font-semibold text-slate-100 hover:bg-white/5 focus-visible:bg-slate-900 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-cyan-300"
          />
          <span className={cn("px-1 text-[10px]", saveError ? "text-rose-300" : "text-slate-400")} aria-live="polite">
            {saveLabel}
          </span>
        </div>

        <IconButton label="Generate a song with AI into this project" onClick={openSongStudio}>
          <Sparkles className="h-4 w-4" />
        </IconButton>
        <div className="flex items-center gap-1.5 border-l border-white/10 pl-2">
          <IconButton label="Return to start" shortcut="Home" onClick={() => { seek(0); setScrollSec(0); }}>
            <SkipBack className="h-4 w-4" />
          </IconButton>
          <IconButton
            size="lg"
            label={playing ? "Pause" : "Play"}
            shortcut="Space"
            onClick={togglePlay}
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-px" />}
          </IconButton>
          <IconButton label="Loop" shortcut="L" active={state.loop.enabled} onClick={toggleLoop}>
            <Repeat className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={
              recording
                ? "Stop recording"
                : recordsNotes && midiTrack
                  ? `Record the MIDI keyboard as notes on ${midiTrack.name}`
                  : range
                  ? "Record into the highlighted range (punch-in, 2 s pre-roll)"
                  : state.loop.enabled
                    ? "Record takes: each pass of the loop becomes its own take"
                    : "Record from the playhead onto the selected track"
            }
            active={recording}
            disabled={!ready || working !== null}
            onClick={() => void toggleRecording()}
            className={recording ? "bg-rose-500 text-white hover:bg-rose-400" : "text-rose-300"}
          >
            <Mic className="h-4 w-4" />
          </IconButton>
          <MidiControl
            targetName={midiTrack?.name ?? null}
            playsVoice={midiPlaysVoice}
            recordsNotes={recordsNotes}
            onAddInstrument={addInstrumentTrack}
          />
        </div>

        <div className="flex flex-col items-stretch">
          <button
            ref={timeRef}
            type="button"
            title="Click to switch between time and bars"
            aria-label="Playhead position. Click to switch between time and bars."
            onClick={() => commit({ ...state, rulerMode: state.rulerMode === "time" ? "bars" : "time" })}
            className="h-8 w-32 rounded-lg bg-black/50 px-2 text-center font-mono text-lg tabular-nums text-cyan-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            0:00.000
          </button>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-800" role="meter" aria-label="Master level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={0}>
            <div ref={masterMeterRef} className="h-full origin-left bg-emerald-400" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>
        {/* A fixed width: tempo, key and loudness readings changing must never shift the buttons beside them. */}
        <div className="hidden w-60 shrink-0 flex-col overflow-hidden text-[11px] leading-tight text-slate-400 xl:flex">
          <span className="truncate tabular-nums">
            {formatBpm(state.bpm)} BPM · {state.beatsPerBar}/4{state.keyLabel ? ` · ${state.keyLabel}` : ""}
          </span>
          <span
            ref={statsRef}
            className="whitespace-pre font-mono tabular-nums text-slate-300"
            title="Master loudness per EBU R 128 for this playback pass: Integrated, Short-term (3 s), Momentary (0.4 s), and the highest true peak in dBTP."
          >
            {"I    — S    — M    — LUFS · TP    —"}
          </span>
        </div>

        <div className="flex items-center gap-1 border-l border-white/10 pl-2" role="radiogroup" aria-label="Tool">
          <IconButton label="Select tool" shortcut="V" active={tool === "select"} onClick={() => setTool("select")}>
            <MousePointer2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Razor tool" shortcut="C" active={tool === "razor"} onClick={() => setTool("razor")}>
            <Scissors className="h-4 w-4" />
          </IconButton>
          <IconButton label="Range tool" shortcut="R" active={tool === "range"} onClick={() => setTool("range")}>
            <MoveHorizontal className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex items-center gap-1 border-l border-white/10 pl-2">
          <IconButton label="Snapping" shortcut="N" active={state.snap} onClick={() => commit({ ...state, snap: !state.snap })}>
            <Magnet className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={
              state.automationView === "off"
                ? "Automation: hidden"
                : `Automation: ${state.automationView} (click the line to add points)`
            }
            shortcut="A"
            active={state.automationView !== "off"}
            onClick={cycleAutomation}
          >
            <Spline className="h-4 w-4" />
          </IconButton>
          <select
            aria-label="Automation lane"
            title="Which automation lane to show on the tracks"
            value={state.automationView}
            onChange={(event) => commit({ ...state, automationView: event.target.value as AutomationView })}
            className="hidden h-9 w-28 rounded-lg border border-white/10 bg-slate-900 px-1 text-[11px] text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 2xl:block"
          >
            <option value="off">No lane</option>
            {LANES.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.label}
              </option>
            ))}
          </select>
          <IconButton label="Spectral view" shortcut="W" active={showSpectral} onClick={() => setShowSpectral((open) => !open)}>
            <AudioLines className="h-4 w-4" />
          </IconButton>
          <IconButton label="Add marker at playhead" shortcut="K" onClick={dropMarker}>
            <Bookmark className="h-4 w-4" />
          </IconButton>
          <IconButton label="Undo" shortcut="Ctrl/Cmd+Z" disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo" shortcut="Ctrl/Cmd+Shift+Z" disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="hidden items-center gap-1 border-l border-white/10 pl-2 md:flex">
          <IconButton label="Zoom out" shortcut="−" onClick={() => zoomBy(1 / 1.4)}>
            <ZoomOut className="h-4 w-4" />
          </IconButton>
          <IconButton label="Zoom in" shortcut="+" onClick={() => zoomBy(1.4)}>
            <ZoomIn className="h-4 w-4" />
          </IconButton>
          <IconButton label="Zoom to fit" shortcut="F" onClick={zoomFit}>
            <Maximize2 className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.wav,.flac,.mp3,.aac,.ogg,.m4a,.aiff,.aif,.mid,.midi"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void importFiles(files, 0, null);
            }}
          />
          <ActionButton className="h-9" onClick={() => fileInputRef.current?.click()} disabled={!ready || working !== null}>
            <Upload className="h-4 w-4" /> Import
          </ActionButton>
          <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
            <ActionButton
              variant="primary"
              className="h-9"
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              disabled={duration <= 0 || working !== null}
              onClick={() => setExportOpen((open) => !open)}
            >
              <Download className="h-4 w-4" /> Export
            </ActionButton>
            {exportOpen ? (
              <div role="menu" className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl">
                {EXPORT_ITEMS.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitem"
                    disabled={item.needsRange && !range}
                    title={item.needsRange && !range ? "Highlight a range with the Range tool first" : undefined}
                    className="flex h-9 w-full items-center rounded-lg px-3 text-left text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
                    onClick={() => void exportAudio(item.kind)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => setShowHelp(true)}>
            <Keyboard className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex min-h-full">
              <div className="sticky left-0 z-30 shrink-0 border-r border-white/10 bg-slate-950" style={{ width: HEADER_WIDTH }}>
                <div
                  className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-950 pl-3 pr-2"
                  style={{ height: RULER_HEIGHT }}
                >
                  <span className="display-font text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Tracks
                  </span>
                  <IconButton size="sm" label="Add track" shortcut="Shift+T" onClick={addEmptyTrack}>
                    <Plus className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
                {state.tracks.map((track, index) => (
                  <TrackHeader
                    key={track.id}
                    track={track}
                    index={index}
                    count={state.tracks.length}
                    selected={selectedTrack?.id === track.id}
                    onSelect={() => setSelectedTrackId(track.id)}
                    onChange={(patch, key) => patchTrack(track.id, patch, key)}
                    onRemove={() => {
                      commit(removeTrack(state, track.id));
                      meterEls.current.delete(track.id);
                    }}
                    onMove={(direction) => commit(moveTrack(state, track.id, direction))}
                    meterRef={(element) => {
                      if (element) meterEls.current.set(track.id, element);
                      else meterEls.current.delete(track.id);
                    }}
                  />
                ))}
              </div>
              <Timeline
                state={state}
                assets={assets}
                getBuffer={getBuffer}
                getPeaks={getPeaks}
                mediaVersion={mediaVersion}
                selection={selection}
                onSelect={select}
                selectedTrackId={selectedTrack?.id ?? null}
                range={range}
                onRange={setRange}
                tool={tool}
                pxPerSec={pxPerSec}
                scrollSec={scrollSec}
                onView={setView}
                getPosition={getPosition}
                playing={playing}
                onSeek={seek}
                onGestureStart={() => dispatch({ type: "gestureStart" })}
                onTransient={(next) => dispatch({ type: "transient", state: next })}
                onGestureEnd={() => dispatch({ type: "gestureEnd" })}
                onCommit={commit}
                onContextMenu={(x, y, clipId, time) => setMenu({ x, y, clipId, time })}
                onDropFiles={(files, time, trackId) => void importFiles(files, time, trackId)}
                minLanesHeight={lanesHeight}
                onWidth={(width) => {
                  viewWidthRef.current = width;
                  setViewWidth(width);
                }}
              />
            </div>
          </div>

          {ready && !state.tracks.length ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ left: HEADER_WIDTH, top: RULER_HEIGHT }}>
              <div className="pointer-events-auto max-w-sm rounded-2xl border border-dashed border-white/20 bg-slate-950/80 p-6 text-center">
                <p className="display-font text-base font-semibold text-slate-100">Drop audio here to begin</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Each file becomes a track. Load one song and split it into stems, or load several and mix them.
                </p>
                <ActionButton variant="primary" className="mt-4 h-10 px-5 text-sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Import audio
                </ActionButton>
              </div>
            </div>
          ) : null}

          <div className="flex shrink-0 border-t border-white/10 bg-slate-950">
            <div className="shrink-0 border-r border-white/10" style={{ width: HEADER_WIDTH }} />
            <div
              ref={hscrollRef}
              className="h-3.5 min-w-0 flex-1 overflow-x-scroll overflow-y-hidden"
              aria-label="Timeline horizontal scroll"
              onScroll={(event) => {
                const next = event.currentTarget.scrollLeft / pxPerSec;
                if (Math.abs(next - scrollSec) * pxPerSec > 1) setScrollSec(next);
              }}
            >
              <div style={{ width: totalSec * pxPerSec, height: 1 }} />
            </div>
          </div>

          {showPiano && primaryClip?.notes ? (
            <PianoRoll
              key={`${primaryClip.id}:${state.tracks.find((t) => t.id === primaryClip.trackId)?.synth.kind}`}
              clip={primaryClip}
              color={state.tracks.find((t) => t.id === primaryClip.trackId)?.color ?? "#22d3ee"}
              bpm={state.bpm}
              beatsPerBar={state.beatsPerBar}
              snap={state.snap}
              drums={state.tracks.find((t) => t.id === primaryClip.trackId)?.synth.kind === "drums"}
              onSeek={seek}
              getPosition={getPosition}
              onNotes={(notes, phase) => {
                if (phase === "start") dispatch({ type: "gestureStart" });
                else if (phase === "end") dispatch({ type: "gestureEnd" });
                else {
                  const next = updateClips(stateRef.current, [primaryClip.id], (c) => ({ ...c, notes }));
                  if (phase === "move") dispatch({ type: "transient", state: next });
                  else commit(next);
                }
              }}
              onPreview={(pitch) => engine.previewNote(primaryClip.trackId, pitch)}
              onClose={() => setShowPiano(false)}
            />
          ) : showSpectral ? (
            <SpectralPanel
              clip={primaryClip}
              buffer={primaryClip ? engine.buffer(primaryClip.assetId) : undefined}
              getPosition={getPosition}
              busy={primaryClip ? jobs.some((j) => j.clipId === primaryClip.id && (j.job.status === "queued" || j.job.status === "running")) : false}
              onRepair={(params, title) => runJobs("spectral_repair", params, title)}
              onClose={() => setShowSpectral(false)}
            />
          ) : null}

          <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-white/10 bg-slate-950 px-3 text-[11px] text-slate-400" aria-live="polite">
            {working ? (
              <span className="text-cyan-200">{working}</span>
            ) : notice ? (
              <>
                <span className="min-w-0 truncate text-amber-200">{notice}</span>
                <button type="button" className="shrink-0 underline hover:text-slate-100" onClick={() => setNotice(null)}>
                  Dismiss
                </button>
              </>
            ) : (
              <span className="min-w-0 truncate">
                {state.automationView !== "off" && tool === "select"
                  ? `Automation (${LANES.find((lane) => lane.id === state.automationView)?.label ?? ""}): click the yellow line to add a point, drag to shape it, double-click a point to remove it. Press A to switch or hide.`
                  : tool === "razor"
                  ? "Razor: click a clip to split it."
                  : tool === "range"
                    ? "Range: drag to highlight time, then Delete, Shift+Delete to close the gap, or L to loop it."
                    : "Drag clips to move, edges to trim, corner handles to fade. Right-click for more."}
              </span>
            )}
            <span className="ml-auto shrink-0 font-mono tabular-nums">
              {state.tracks.length} tracks · {state.clips.length} clips · {formatTime(duration)}
            </span>
          </footer>
        </div>

        <Inspector
          state={state}
          assets={assets}
          capabilities={capabilities}
          plugins={plugins}
          clip={primaryClip}
          selectionCount={selectedClips.length}
          track={selectedTrack}
          range={range}
          jobs={jobs}
          onDismissJob={(id) => setJobs((prev) => prev.filter((j) => j.job.id !== id))}
          onPatchState={(patch, key) => commit({ ...state, ...patch }, key)}
          onPatchClip={patchClips}
          onPatchTrack={(patch, key) => selectedTrack && patchTrack(selectedTrack.id, patch, key)}
          onRunJob={runJobs}
          onOpenWam={(trackId) => setWamWindow(trackId)}
          onRenderWithPlugin={renderWithPlugin}
          onOpenPluginWindow={openPluginWindow}
          onPlayPlugin={playPlugin}
          onLivePlugin={(clipId) => playPlugin(clipId, false)}
          onStopPlugin={stopPlugin}
          onPickPluginSound={(clipId, sound) => void pickPluginSound(clipId, sound)}
          onImportPluginSound={(clipId, sound) => void applyPluginSound(clipId, sound)}
          onClosePluginWindow={(jobId) =>
            void editorApi.closePluginWindow(projectId, jobId).catch((err: unknown) => setNotice(errorMessage(err, "The window could not be closed.")))
          }
          onRefreshPlugins={refreshPlugins}
          generation={generation}
          onCheckGeneration={checkGeneration}
          onOpenSongStudio={openSongStudio}
          onPreviewNote={(trackId, pitch) => engine.previewNote(trackId, pitch)}
          songProviders={songProviders}
          projectId={projectId}
          onAddMidiTrack={addInstrumentTrack}
          onOpenPianoRoll={() => setShowPiano(true)}
          onExportMidi={() => {
            if (!primaryClip?.notes) return;
            const inside = primaryClip.notes
              .filter((note) => note.t >= primaryClip.offset && note.t < primaryClip.offset + primaryClip.duration)
              .map((note) => ({ ...note, t: note.t - primaryClip.offset }));
            downloadBlob(writeMidi(inside, state.bpm, primaryClip.name), `${primaryClip.name.replace(/[^\w .-]+/g, "_")}.mid`);
          }}
          getPosition={getPosition}
          getBusLevel={(id) => engine.busLevel(id)}
          getTrackSpectrum={(id) => engine.trackSpectrum(id)}
          getEqResponse={(id, freqs) => engine.eqResponse(id, freqs)}
          favourites={favourites}
          recentSteps={recentSteps}
          onSaveFavourite={(name, count) => favouriteStore.add(name, recentSteps.slice(-count))}
          onRunFavourite={(id) => {
            const favourite = favourites.find((f) => f.id === id);
            if (favourite) runFavourite(favourite.steps);
          }}
          onRemoveFavourite={(id) => favouriteStore.remove(id)}
          onAudition={(pluginId, values) => void auditionPlugin(pluginId, values)}
          onComp={(clipId, useRange) => commit(compTake(state, clipId, useRange ? range : null))}
          onUseAsProject={(meta) =>
            commit({ ...state, bpm: meta.bpm ? Number(meta.bpm.toFixed(1)) : state.bpm, keyLabel: meta.keyLabel ?? state.keyLabel, rulerMode: "bars" })
          }
          onAddAsset={(asset) => placeAsset(asset, engine.position(), null)}
          onSeek={seek}
          getScope={getScope}
          onAddSection={addSection}
          onRegion={(action, id, value) => {
            const region = state.regions.find((r) => r.id === id);
            if (!region) return;
            if (action === "rename") commit(updateRegion(state, id, { name: value ?? region.name }), `region:${id}`);
            else if (action === "remove") commit(removeRegion(state, id));
            else if (action === "repeat") commit(duplicateSection(state, id));
            else if (action === "cut") {
              commit(deleteSection(state, id));
              setRange(null);
            } else {
              setRange({ start: region.start, end: region.end });
              seek(region.start);
            }
          }}
          onAddBus={(kind) => commit(addBus(state, kind).state)}
          onPatchBus={(id, patch, key) => commit(updateBus(state, id, patch), key ? `${key}:${id}` : undefined)}
          onRemoveBus={(id) => commit(removeBus(state, id))}
          onRenameMarker={(id, markerName) => commit(updateMarker(state, id, { name: markerName }), `marker:${id}`)}
          onRemoveMarker={(id) => commit(removeMarker(state, id))}
          onSplit={() => splitAtTime(engine.position(), selection.size ? selection : null)}
          onDuplicate={duplicate}
          onDelete={() => removeSelection(false)}
        />
      </div>

      {menu && menuItems.length ? (
        <div
          role="menu"
          className="fixed z-50 w-56 rounded-xl border border-white/10 bg-slate-900 p-1 shadow-2xl"
          style={{ left: Math.min(menu.x, window.innerWidth - 232), top: Math.min(menu.y, window.innerHeight - menuItems.length * 34 - 12) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cn(
                "flex h-8 w-full items-center justify-between rounded-lg px-3 text-left text-xs hover:bg-slate-800",
                item.danger ? "text-rose-300" : "text-slate-100"
              )}
              onClick={() => runMenuAction(item.action)}
            >
              {item.label}
              {item.hint ? <span className="font-mono text-[10px] text-slate-400">{item.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {wamWindow ? (
        <div
          className="fixed bottom-10 left-4 z-40 max-h-[70vh] max-w-[min(90vw,900px)] overflow-auto rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
          role="dialog"
          aria-label="Plugin controls"
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/10 bg-slate-900 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-100">
              {state.tracks.find((t) => t.id === wamWindow)?.wam?.name ?? "Plugin"}
              <span className="font-normal text-slate-400"> · {state.tracks.find((t) => t.id === wamWindow)?.name}</span>
            </p>
            <ActionButton onClick={() => void captureWamStates()} title="Store the plugin's current settings in the session">
              Save settings
            </ActionButton>
            <ActionButton
              onClick={() => {
                void captureWamStates();
                setWamWindow(null);
              }}
            >
              Close
            </ActionButton>
          </div>
          {/* The plugin draws its own interface here; it is third-party content. */}
          <div ref={wamHostRef} className="min-h-24 min-w-64 bg-white p-2 text-xs text-slate-700" />
        </div>
      ) : null}

      {showHelp ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowHelp(false)}
        >
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="display-font text-base font-semibold text-slate-100">Keyboard shortcuts</h2>
              <ActionButton onClick={() => setShowHelp(false)}>Close</ActionButton>
            </div>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              {SHORTCUTS.map(([keys, description]) => (
                <div key={keys} className="contents">
                  <dt className="font-mono text-cyan-200">{keys}</dt>
                  <dd className="text-slate-300">{description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </main>
  );
}
