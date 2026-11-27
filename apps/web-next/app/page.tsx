"use client";

import {
  AlertTriangle,
  AudioWaveform,
  Check,
  CircleHelp,
  Copy,
  Cpu,
  Piano,
  Download,
  FileAudio2,
  Network,
  Pause,
  Play,
  Sparkles,
  RefreshCcw,
  Repeat,
  Rocket,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Upload,
  Waves
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { type ColumnDef, DataTable } from "@/components/data-table";
import { AudioReviewStrip } from "@/components/audio-review-strip";
import { EqualizerPanel } from "@/components/equalizer-panel";
import { KpiTile } from "@/components/kpi-tile";
import { PlotPanel } from "@/components/plot-panel";
import { SonicVisualizer } from "@/components/sonic-visualizer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  analyzeRun,
  audioUrl,
  checkForUpdates,
  clearRunHistory,
  convertRun,
  convertedFileUrl,
  exportUrl,
  getApiBase,
  getChart,
  getCharts,
  getRun,
  listRuns,
  masteredFileUrl,
  installUpdate,
  runMastering,
  uploadAudio
} from "@/lib/api";
import {
  ChartsPayload,
  ConvertedFile,
  Marker,
  MasteringOutput,
  RunDetail,
  RunSummary,
  UpdateStatus
} from "@/lib/types";
import { startSongUrl } from "@/lib/handoff";
import { AppPrefs } from "@/components/app-prefs";
import { DetachButton, DetachedPlaceholder, FloatButton, Floatable, useDetachable } from "@/components/detachable";
import { HelpLink } from "@/components/help-link";
import { type I18n, type MessageKey, useI18n } from "@/lib/i18n";

const ALL_CHARTS: Array<{ key: string; height: number }> = [
  { key: "waveform", height: 680 },
  { key: "loudness", height: 620 },
  { key: "spectrum", height: 620 },
  { key: "stereo", height: 620 },
  { key: "correlation_meter", height: 620 },
  { key: "ms_view", height: 620 },
  { key: "vectorscope", height: 680 },
  { key: "spectrogram_stft_linear", height: 760 },
  { key: "spectrogram_stft_log", height: 760 },
  { key: "spectrogram_mel", height: 760 },
  { key: "spectrogram_cqt", height: 760 }
];

type ChartKey = (typeof ALL_CHARTS)[number]["key"];

const CHART_GROUPS: Array<{
  id: "all" | "mix" | "stereo" | "spectral";
  keys: ChartKey[];
}> = [
  {
    id: "all",
    keys: ALL_CHARTS.map((chart) => chart.key)
  },
  {
    id: "mix",
    keys: ["waveform", "loudness", "spectrum", "stereo", "correlation_meter", "ms_view", "vectorscope"]
  },
  {
    id: "stereo",
    keys: ["stereo", "correlation_meter", "ms_view", "vectorscope"]
  },
  {
    id: "spectral",
    keys: ["spectrogram_stft_linear", "spectrogram_stft_log", "spectrogram_mel", "spectrogram_cqt"]
  }
];

type ChartGroupId = (typeof CHART_GROUPS)[number]["id"];
const EQ_BANDS = [
  20, 32, 50, 64, 80, 125, 160, 250, 315, 500,
  630, 1000, 1250, 2000, 2500, 4000, 5000, 8000, 12000, 16000
] as const;
const DEFAULT_EQ_GAINS = EQ_BANDS.map(() => 0);

/** Rows of the glossary (analyser.guide.rows.<id>). */
const ELEMENT_GUIDE_ROWS = [
  "compressionLoss",
  "peakToNoise",
  "peakToLufs",
  "compressionAssessment",
  "metadataTags",
  "rawMetadata",
  "integratedLufs",
  "truePeak",
  "crestFactor",
  "noiseFloor",
  "markersAround",
  "stageTicker",
  "hardReset",
  "masteringBackend",
  "masteringReference",
  "refinePasses",
  "adaptation",
  "selfCheckAssessment",
  "selfCheckScore",
  "selfCheckLists",
  "selfCheckMatch",
  "refinementDiagnostics",
  "proModules",
  "naValues"
] as const;

/** Statuses and severities that come from the backend and have a translation. */
const STATUS_WORDS = ["idle", "uploaded", "queued", "running", "completed", "failed", "cancelled"] as const;
const SEVERITY_WORDS = ["critical", "high", "medium", "low", "info", "warning", "error"] as const;

function statusWord(t: I18n["t"], status: string): string {
  const known = (STATUS_WORDS as readonly string[]).includes(status);
  return known ? t(`analyser.status.${status as (typeof STATUS_WORDS)[number]}`) : status;
}

function severityWord(t: I18n["t"], severity: string): string {
  const known = (SEVERITY_WORDS as readonly string[]).includes(severity);
  return known ? t(`analyser.severity.${severity as (typeof SEVERITY_WORDS)[number]}`) : severity;
}

function chartTitle(t: I18n["t"], key: string): string {
  return t(`analyser.chartTitles.${key}` as MessageKey);
}

function chartHelp(t: I18n["t"], key: string): string {
  return t(`analyser.chartHelp.${key}` as MessageKey);
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  queued: "secondary",
  uploaded: "outline",
  failed: "destructive"
};

const conversionStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  idle: "outline",
  completed: "default",
  running: "secondary",
  queued: "secondary",
  failed: "destructive"
};

const FORMAT_OPTIONS = ["mp3", "wav", "flac", "aac", "ogg", "m4a"] as const;
const MASTER_MODES = ["v1", "v2", "v3"] as const;
const MASTER_PRESETS = ["streaming", "club", "film", "voice"] as const;
const MASTER_BACKENDS = ["auto", "internal", "ffmpeg", "pedalboard", "matchering"] as const;
// "" keeps whatever the preset (and the adaptive preflight) decides; "0" turns bass mono off.
const BASS_MONO_OPTIONS = [
  { value: "", label: "" },
  { value: "0", label: "" },
  { value: "80", label: "80 Hz" },
  { value: "100", label: "100 Hz" },
  { value: "120", label: "120 Hz" },
  { value: "150", label: "150 Hz" }
] as const;
const ANALYSIS_STALE_WARNING_SECONDS = 300;
const NORMALIZATION_PROFILE_OPTIONS = [
  {
    id: "off",
    targetLufs: null,
    truePeakDbfs: null
  },
  {
    id: "youtube",
    targetLufs: -14.0,
    truePeakDbfs: -1.0
  },
  {
    id: "spotify",
    targetLufs: -14.0,
    truePeakDbfs: -1.0
  },
  {
    id: "apple_music",
    targetLufs: -16.0,
    truePeakDbfs: -1.0
  },
  {
    id: "instagram",
    targetLufs: -14.0,
    truePeakDbfs: -1.0
  },
  {
    id: "tiktok",
    targetLufs: -14.0,
    truePeakDbfs: -1.0
  },
  {
    id: "broadcast_ebu",
    targetLufs: -23.0,
    truePeakDbfs: -1.0
  },
  {
    id: "podcast_voice",
    targetLufs: -16.0,
    truePeakDbfs: -1.5
  }
] as const;
type NormalizationProfileId = (typeof NORMALIZATION_PROFILE_OPTIONS)[number]["id"];
const TIME_SELECTION_CHART_KEYS = new Set([
  "waveform",
  "loudness",
  "stereo",
  "correlation_meter",
  "ms_view",
  "spectrogram_stft_linear",
  "spectrogram_stft_log",
  "spectrogram_mel",
  "spectrogram_cqt"
]);
const RUN_DETAIL_MIN_INTERVAL_MS = 1200;
const DEBUG_TINY_LOUDNESS_TEST = false;
const CHART_LOAD_PRIORITY: Record<string, number> = {
  waveform: 10,
  loudness: 11,
  spectrum: 12,
  stereo: 13,
  correlation_meter: 14,
  ms_view: 15,
  vectorscope: 16,
  spectrogram_cqt: 40,
  spectrogram_mel: 41,
  spectrogram_stft_log: 42,
  spectrogram_stft_linear: 43
};

interface PendingSaveOutput {
  id: string;
  source: "conversion" | "mastering";
  filename: string;
  url: string;
  detail: string;
}

interface PendingConversionPrompt {
  requestId: string;
  requestedFormats: string[];
}

interface PendingMasteringPrompt {
  requestId: string;
  mode: (typeof MASTER_MODES)[number];
  preset: (typeof MASTER_PRESETS)[number];
}

interface TimelinePanState {
  startClientX: number;
  startSelectionStart: number;
  windowSeconds: number;
  containerWidth: number;
}

const masteringStatusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  idle: "outline",
  completed: "default",
  running: "secondary",
  queued: "secondary",
  failed: "destructive"
};

const markerSeverityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
  info: "default"
};

function formatDate(value: string, locale: string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale)}`;
}

function metricNumber(obj: Record<string, unknown> | undefined, path: string[], fallback = 0): number {
  let node: unknown = obj;
  for (const segment of path) {
    if (!node || typeof node !== "object" || !(segment in node)) {
      return fallback;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === "number" ? node : fallback;
}

function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function maybeNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown, fallback = "N/A"): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value || fallback;
  return String(value);
}

function stageLabel(stage: string | null | undefined, t: I18n["t"]): string {
  const raw = text(stage, "").trim();
  if (!raw || raw === "idle") return t("analyser.idle");
  // A run's status standing in for its stage ("queued", "completed"…) is shown in the interface language.
  if ((STATUS_WORDS as readonly string[]).includes(raw)) {
    const word = t(`analyser.status.${raw as (typeof STATUS_WORDS)[number]}`);
    return `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
  }
  return raw
    .split("_")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function stageTickerText(detail: string | null | undefined, stage: string | null | undefined, t: I18n["t"]): string {
  const cleanedDetail = text(detail, "").trim();
  if (cleanedDetail) return cleanedDetail;
  return `${stageLabel(stage, t)}.`;
}

function secondsSinceIso(isoValue: string | null | undefined): number | null {
  const raw = text(isoValue, "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

function hz(v: number): string {
  return `${Math.round(v).toLocaleString()} Hz`;
}

function hzRange(low: number, high: number): string {
  return `${hz(low)} - ${hz(high)}`;
}

function bytesLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const kb = 1024;
  const mb = kb * 1024;
  if (value >= mb) return `${(value / mb).toFixed(2)} MB`;
  if (value >= kb) return `${(value / kb).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function asMasterMode(value: unknown): (typeof MASTER_MODES)[number] | null {
  if (value !== "v1" && value !== "v2" && value !== "v3") return null;
  return value;
}

function asMasterPreset(value: unknown): (typeof MASTER_PRESETS)[number] | null {
  if (value !== "streaming" && value !== "club" && value !== "film" && value !== "voice") return null;
  return value;
}

function asMasterBackend(value: unknown): (typeof MASTER_BACKENDS)[number] | null {
  if (value !== "auto" && value !== "internal" && value !== "ffmpeg" && value !== "pedalboard" && value !== "matchering") {
    return null;
  }
  return value;
}

function parseOptionalNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSelectionBounds(start: number, end: number, maxDuration: number): [number, number] {
  const safeDuration = Number.isFinite(maxDuration) && maxDuration > 0 ? maxDuration : 1;
  const minSpan = Math.min(0.25, safeDuration);
  let left = Number.isFinite(start) ? start : 0;
  let right = Number.isFinite(end) ? end : safeDuration;
  left = Math.max(0, Math.min(safeDuration, left));
  right = Math.max(0, Math.min(safeDuration, right));
  if (left > right) {
    [left, right] = [right, left];
  }
  if (right - left < minSpan) {
    right = Math.min(safeDuration, left + minSpan);
    left = Math.max(0, right - minSpan);
  }
  return [left, right];
}

function triggerBrowserDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function saveFileWithPicker(url: string, filename: string): Promise<void> {
  const pickerHost = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob | Uint8Array) => Promise<void>;
        close: () => Promise<void>;
        abort?: () => Promise<void>;
      }>;
    }>;
  };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new Error("Save timed out while downloading. Use Quick Download if needed.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (pickerHost.showSaveFilePicker) {
    const handle = await pickerHost.showSaveFilePicker({
      suggestedName: filename
    });
    const writable = await handle.createWritable();
    try {
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            await writable.write(value);
          }
        }
      } else {
        const blob = await response.blob();
        await writable.write(blob);
      }
      await writable.close();
      return;
    } catch (err) {
      if (writable.abort) {
        await writable.abort();
      }
      throw err;
    }
  }

  // Fallback for browsers without the File System Access API.
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(blobUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}

async function saveBlobWithPicker(blob: Blob, filename: string): Promise<void> {
  const pickerHost = window as Window & {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob | Uint8Array) => Promise<void>;
        close: () => Promise<void>;
        abort?: () => Promise<void>;
      }>;
    }>;
  };

  if (pickerHost.showSaveFilePicker) {
    const handle = await pickerHost.showSaveFilePicker({ suggestedName: filename });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (writable.abort) {
        await writable.abort();
      }
      throw err;
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  triggerBrowserDownload(blobUrl, filename);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
}

function createEqFilters(context: BaseAudioContext): BiquadFilterNode[] {
  return EQ_BANDS.map((frequency, index) => {
    const filter = context.createBiquadFilter();
    filter.frequency.value = frequency;
    filter.gain.value = 0;
    filter.type = index === 0 ? "lowshelf" : index === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
    filter.Q.value = index === 0 || index === EQ_BANDS.length - 1 ? 0.7 : 1.0;
    return filter;
  });
}

function applyEqGains(filters: BiquadFilterNode[], gains: number[], enabled: boolean): void {
  filters.forEach((filter, index) => {
    filter.gain.value = enabled ? gains[index] ?? 0 : 0;
  });
}

function encodeAudioBufferToWav(audioBuffer: AudioBuffer): Blob {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const sampleCount = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = sampleCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
    offset += value.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  for (let frame = 0; frame < sampleCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

const POPOUT_BUTTON =
  "inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300";

export default function HomePage() {
  const router = useRouter();
  const { t, tp, locale } = useI18n();
  const na = t("analyser.na");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const initializedSelectionRunRef = useRef<string | null>(null);
  const selectedRunInitRef = useRef<string | null>(null);
  const promptSequenceRef = useRef(0);
  const conversionPromptRequestsRef = useRef<Map<string, PendingConversionPrompt>>(new Map());
  const masteringPromptRequestsRef = useRef<Map<string, PendingMasteringPrompt>>(new Map());
  const chartsLoadRequestRef = useRef(0);
  const chartsLoadedRunRef = useRef<string | null>(null);
  const chartLoadInFlightRef = useRef<{ runId: string; promise: Promise<void> } | null>(null);
  const chartRetryAttemptsRef = useRef<Record<string, number>>({});
  const chartsRef = useRef<ChartsPayload>({});
  const runDetailAbortRef = useRef<AbortController | null>(null);
  const runDetailRequestSeqRef = useRef(0);
  const runDetailInFlightRef = useRef<{ runId: string; seq: number; promise: Promise<void> } | null>(null);
  const lastRunDetailFetchRef = useRef<{ runId: string | null; at: number }>({ runId: null, at: 0 });
  const refreshRunDetailRef = useRef<(runId: string, force?: boolean) => Promise<void>>(async () => {});
  const scrubTimeRef = useRef(0);
  const chartsTimelineRef = useRef<HTMLDivElement | null>(null);
  const timelinePanRef = useRef<TimelinePanState | null>(null);
  const visualizerRef = useRef<HTMLDivElement | null>(null);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runIdCopied, setRunIdCopied] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [charts, setCharts] = useState<ChartsPayload>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [useGpu, setUseGpu] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isMastering, setIsMastering] = useState(false);
  const [formatSelection, setFormatSelection] = useState<Record<string, boolean>>({
    mp3: true,
    wav: true,
    flac: true,
    aac: false,
    ogg: false,
    m4a: false
  });
  const [mp3BitrateKbps, setMp3BitrateKbps] = useState(320);
  const [aacBitrateKbps, setAacBitrateKbps] = useState(256);
  const [masterMode, setMasterMode] = useState<(typeof MASTER_MODES)[number]>("v1");
  const [masterPreset, setMasterPreset] = useState<(typeof MASTER_PRESETS)[number]>("streaming");
  const [normalizationProfile, setNormalizationProfile] = useState<NormalizationProfileId>("off");
  const [masterBackend, setMasterBackend] = useState<(typeof MASTER_BACKENDS)[number]>("internal");
  const [masterReferenceRunId, setMasterReferenceRunId] = useState("");
  const [masterTargetLufsInput, setMasterTargetLufsInput] = useState("-14");
  const [masterTruePeakDbfsInput, setMasterTruePeakDbfsInput] = useState("-1");
  const [masterInputGainDbInput, setMasterInputGainDbInput] = useState("0");
  const [masterBassMonoHz, setMasterBassMonoHz] = useState("");
  const [masterStereoWidthInput, setMasterStereoWidthInput] = useState("");
  const [optimizerVariants, setOptimizerVariants] = useState(4);
  const [maxRefinePasses, setMaxRefinePasses] = useState(2);
  const [statusMessage, setStatusMessage] = useState(() => t("analyser.msg.pickFile"));
  const [scrubTime, setScrubTime] = useState(0);
  const [duration, setDuration] = useState(1);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(1);
  const [activeChartGroup, setActiveChartGroup] = useState<ChartGroupId>("all");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoopSelection, setIsLoopSelection] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [eqEnabled, setEqEnabled] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>([...DEFAULT_EQ_GAINS]);
  const [isEqExporting, setIsEqExporting] = useState(false);
  const [pendingSaveOutputs, setPendingSaveOutputs] = useState<PendingSaveOutput[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savingOutputId, setSavingOutputId] = useState<string | null>(null);
  const [visualizerOpen, setVisualizerOpen] = useState(false);
  // Visual AI and the charts can each go to a window of their own, for another monitor.
  const visualPop = useDetachable("visual", t("analyser.popout.visualTitle"), { width: 1100, height: 720 }, visualizerOpen && selectedRunId !== null);
  const chartsPop = useDetachable("charts", t("analyser.popout.chartsTitle"), { width: 1200, height: 900 });
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

  useEffect(() => {
    chartsRef.current = charts;
  }, [charts]);

  useEffect(() => {
    scrubTimeRef.current = scrubTime;
  }, [scrubTime]);

  useEffect(() => {
    return () => {
      runDetailAbortRef.current?.abort();
      runDetailInFlightRef.current = null;
      chartLoadInFlightRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      mediaElementSourceRef.current = null;
      eqFiltersRef.current = [];
    };
  }, []);


  const ensurePlaybackGraph = useCallback(async (enabledOverride?: boolean) => {
    const audio = audioRef.current;
    if (!audio || typeof window === "undefined") return audio;

    const activeEqEnabled = enabledOverride ?? eqEnabled;

    if (!activeEqEnabled) {
      applyEqGains(eqFiltersRef.current, eqGains, false);
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
      return audio;
    }

    const AudioContextCtor = window.AudioContext;
    if (!AudioContextCtor) {
      return audio;
    }

    if (!audioContextRef.current) {
      const context = new AudioContextCtor();
      const source = context.createMediaElementSource(audio);
      const filters = createEqFilters(context);
      source.connect(filters[0]);
      for (let index = 0; index < filters.length - 1; index += 1) {
        filters[index].connect(filters[index + 1]);
      }
      filters[filters.length - 1].connect(context.destination);
      audioContextRef.current = context;
      mediaElementSourceRef.current = source;
      eqFiltersRef.current = filters;
    }

    applyEqGains(eqFiltersRef.current, eqGains, activeEqEnabled);
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audio;
  }, [eqEnabled, eqGains]);

  useEffect(() => {
    applyEqGains(eqFiltersRef.current, eqGains, eqEnabled);
  }, [eqEnabled, eqGains]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    audio.load();
    setScrubTime(0);
    setIsPlaying(false);
  }, [selectedRunId]);

  // Reset per-run transport controls when switching to a different run.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setEqGains([...DEFAULT_EQ_GAINS]);
    setEqEnabled(false);
    setPlaybackRate(1);
    setIsLoopSelection(false);
    setIsPlaying(false);
  }, [selectedRunId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const nextPromptRequestId = (kind: "conversion" | "mastering", runId: string): string => {
    promptSequenceRef.current += 1;
    return `${kind}:${runId}:${Date.now()}:${promptSequenceRef.current}`;
  };

  const applyNormalizationProfile = (profileId: NormalizationProfileId) => {
    setNormalizationProfile(profileId);
    const profile = NORMALIZATION_PROFILE_OPTIONS.find((item) => item.id === profileId);
    if (!profile) return;
    if (profile.targetLufs !== null) {
      setMasterTargetLufsInput(profile.targetLufs.toFixed(1));
    }
    if (profile.truePeakDbfs !== null) {
      setMasterTruePeakDbfsInput(profile.truePeakDbfs.toFixed(1));
    }
  };

  const applySelectionRange = useCallback((start: number, end: number) => {
    const [nextStart, nextEnd] = normalizeSelectionBounds(start, end, duration);
    setSelectionStart(nextStart);
    setSelectionEnd(nextEnd);
    if (scrubTime < nextStart || scrubTime > nextEnd) {
      setScrubTime(nextStart);
      if (audioRef.current) {
        audioRef.current.currentTime = nextStart;
      }
    }
  }, [duration, scrubTime]);

  const zoomToMarker = useCallback((marker: Marker) => {
    applySelectionRange(marker.start_seconds - 0.2, marker.end_seconds + 0.2);
  }, [applySelectionRange]);

  const beginTimelinePan = useCallback((clientX: number) => {
    const container = chartsTimelineRef.current;
    if (!container) return;
    const windowSeconds = Math.max(0.25, selectionEnd - selectionStart);
    const rect = container.getBoundingClientRect();
    timelinePanRef.current = {
      startClientX: clientX,
      startSelectionStart: selectionStart,
      windowSeconds,
      containerWidth: Math.max(1, rect.width),
    };
  }, [selectionStart, selectionEnd]);

  const handleChartsMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    event.preventDefault();
    beginTimelinePan(event.clientX);
  }, [beginTimelinePan]);

  const handleChartsPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 2) return;
    event.preventDefault();
    beginTimelinePan(event.clientX);
  }, [beginTimelinePan]);

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const pan = timelinePanRef.current;
      if (!pan) return;
      event.preventDefault();
      const deltaX = event.clientX - pan.startClientX;
      const deltaSeconds = (deltaX / pan.containerWidth) * pan.windowSeconds;
      const nextStart = pan.startSelectionStart + deltaSeconds;
      applySelectionRange(nextStart, nextStart + pan.windowSeconds);
    };
    const handleWindowMouseUp = () => {
      timelinePanRef.current = null;
    };
    const handleWindowContextMenu = (event: MouseEvent) => {
      if (timelinePanRef.current) {
        event.preventDefault();
      }
    };
    // The charts may be in a window of their own: listen there as well as here.
    const views = new Set<Window>([window, chartsTimelineRef.current?.ownerDocument.defaultView ?? window]);
    for (const view of views) {
      view.addEventListener("mousemove", handleWindowMouseMove, { passive: false });
      view.addEventListener("mouseup", handleWindowMouseUp);
      view.addEventListener("contextmenu", handleWindowContextMenu, true);
    }
    return () => {
      for (const view of views) {
        view.removeEventListener("mousemove", handleWindowMouseMove);
        view.removeEventListener("mouseup", handleWindowMouseUp);
        view.removeEventListener("contextmenu", handleWindowContextMenu, true);
      }
    };
  }, [applySelectionRange, chartsPop.detached]);

  const savePendingOutput = async (item: PendingSaveOutput) => {
    setSavingOutputId(item.id);
    try {
      await saveFileWithPicker(item.url, item.filename);
      setPendingSaveOutputs((prev) => prev.filter((row) => row.id !== item.id));
      setStatusMessage(t("analyser.msg.saved", { name: item.filename }));
    } catch (err) {
      // saveFileWithPicker's timeout message is English on purpose: it is checked here.
      const message = toErrorMessage(err, "");
      if (message.toLowerCase().includes("timed out")) {
        triggerBrowserDownload(item.url, item.filename);
        setPendingSaveOutputs((prev) => prev.filter((row) => row.id !== item.id));
        setStatusMessage(t("analyser.msg.saveTimedOut", { name: item.filename }));
      } else {
        setStatusMessage(t("analyser.msg.saveFailed", { name: item.filename, reason: message || "?" }));
      }
    } finally {
      setSavingOutputId(null);
    }
  };

  const runColumns = useMemo<ColumnDef<RunSummary>[]>(
    () => [
      { header: t("analyser.columns.file"), accessorKey: "filename" },
      {
        header: t("analyser.columns.status"),
        cell: ({ row }) => (
          <Badge variant={statusVariant[row.original.status] ?? "outline"}>{statusWord(t, row.original.status)}</Badge>
        )
      },
      {
        header: t("analyser.columns.stage"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {stageTickerText(row.original.stage_detail ?? null, row.original.stage ?? row.original.status, t)}
          </span>
        )
      },
      {
        header: t("analyser.columns.progress"),
        cell: ({ row }) => <span>{row.original.progress.toFixed(1)}%</span>
      },
      {
        header: t("analyser.columns.updated"),
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.updated_at, locale)}</span>
      }
    ],
    [t, locale]
  );

  const markerColumns = useMemo<ColumnDef<Marker>[]>(
    () => [
      { header: t("analyser.columns.type"), accessorKey: "type" },
      {
        header: t("analyser.columns.severity"),
        cell: ({ row }) => {
          const sev = text(row.original.severity, "info").toLowerCase();
          return <Badge variant={markerSeverityVariant[sev] ?? "outline"}>{severityWord(t, sev)}</Badge>;
        }
      },
      {
        header: t("analyser.columns.window"),
        cell: ({ row }) => (
          <span>
            {row.original.start_seconds.toFixed(2)}s - {row.original.end_seconds.toFixed(2)}s
          </span>
        )
      },
      {
        header: t("analyser.columns.note"),
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.message ?? "-"}</span>
      }
    ],
    [t]
  );

  const convertedColumns = useMemo<ColumnDef<ConvertedFile>[]>(
    () => [
      { header: t("analyser.columns.format"), accessorKey: "format" },
      {
        header: t("analyser.columns.details"),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {text(row.original.codec, "codec?")} | {text(row.original.container, "container?")}
          </span>
        )
      },
      {
        header: t("analyser.columns.size"),
        cell: ({ row }) => <span>{bytesLabel(num(row.original.size_bytes, 0))}</span>
      },
      {
        header: t("analyser.columns.download"),
        cell: ({ row }) =>
          selectedRunId ? (
            <a
              href={convertedFileUrl(selectedRunId, row.original.format)}
              target="_blank"
              rel="noreferrer"
              className="text-primary"
            >
              {row.original.filename}
            </a>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
      }
    ],
    [selectedRunId, t]
  );

  const masteredColumns = useMemo<ColumnDef<MasteringOutput>[]>(
    () => [
      { header: t("analyser.columns.output"), accessorKey: "id" },
      {
        header: t("analyser.columns.score"),
        cell: ({ row }) =>
          typeof row.original.score === "number" ? (
            <span>{row.original.score.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
      },
      {
        header: "LUFS",
        cell: ({ row }) => {
          const v = maybeNum(asRecord(row.original.metrics).integrated_lufs);
          return <span>{v !== null ? v.toFixed(2) : "-"}</span>;
        }
      },
      {
        header: t("analyser.columns.truePeak"),
        cell: ({ row }) => {
          const v = maybeNum(asRecord(row.original.metrics).true_peak_dbfs);
          return <span>{v !== null ? `${v.toFixed(2)} dBFS` : "-"}</span>;
        }
      },
      {
        header: t("analyser.columns.verify"),
        cell: ({ row }) => {
          const hash = text(row.original.sha256, "");
          if (!hash) return <span className="text-muted-foreground">-</span>;
          return (
            <span className="text-xs text-muted-foreground" title={hash}>
              {hash.slice(0, 8)}...
            </span>
          );
        }
      },
      {
        header: t("analyser.columns.download"),
        cell: ({ row }) =>
          selectedRunId ? (
            <a
              href={masteredFileUrl(selectedRunId, row.original.id)}
              target="_blank"
              rel="noreferrer"
              className="text-primary"
            >
              {row.original.filename}
            </a>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
      }
    ],
    [selectedRunId, t]
  );

  const activeMarkers = useMemo(() => {
    const markers = runDetail?.markers ?? [];
    if (markers.length === 0) return [];

    const segmentLength = Math.max(0, selectionEnd - selectionStart);
    const contextWindow = Math.max(0.75, Math.min(2.5, segmentLength > 0 ? segmentLength / 8 : 1.0));
    const nearStart = Math.max(0, scrubTime - contextWindow);
    const nearEnd = scrubTime + contextWindow;
    const aroundPlayhead = markers.filter((m) => m.end_seconds >= nearStart && m.start_seconds <= nearEnd);
    if (aroundPlayhead.length > 0) {
      return aroundPlayhead;
    }

    const fromSelection = markers.filter(
      (m) => m.end_seconds >= selectionStart && m.start_seconds <= selectionEnd
    );
    if (fromSelection.length > 0 && segmentLength < duration - 0.25) {
      return fromSelection.slice(0, 25);
    }

    return [...markers]
      .map((m) => {
        let distance = 0;
        if (scrubTime < m.start_seconds) distance = m.start_seconds - scrubTime;
        else if (scrubTime > m.end_seconds) distance = scrubTime - m.end_seconds;
        return { marker: m, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12)
      .map((row) => row.marker);
  }, [runDetail?.markers, scrubTime, selectionStart, selectionEnd, duration]);

  const markerRows = useMemo(() => {
    const ordered = [...activeMarkers, ...(runDetail?.markers ?? [])];
    const unique = new Map<string, Marker>();
    for (const marker of ordered) {
      const key = `${marker.type}|${marker.start_seconds.toFixed(4)}|${marker.end_seconds.toFixed(4)}|${text(marker.severity, "")}`;
      if (!unique.has(key)) {
        unique.set(key, marker);
      }
    }
    return Array.from(unique.values());
  }, [activeMarkers, runDetail?.markers]);

  const refreshRuns = useCallback(async () => {
    try {
      const data = await listRuns();
      setRuns(data);
      // A song sent here from the editor or the AI Song Studio arrives as ?run=<id>.
      const wanted = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("run");
      const sent = wanted && data.some((run) => run.id === wanted) ? wanted : null;
      if (sent) window.history.replaceState(null, "", "/");
      setSelectedRunId((current) => sent ?? current ?? data[0]?.id ?? null);
    } catch (err) {
      setStatusMessage(
        `${toErrorMessage(err, t("analyser.msg.fetchRunsFailed"))} (API: ${getApiBase()})`
      );
    }
  }, [t]);

  const loadChartsForRun = useCallback(async (runId: string, chartNames: string[]) => {
    const inFlight = chartLoadInFlightRef.current;
    if (inFlight && inFlight.runId === runId) {
      return inFlight.promise;
    }

    const requestId = chartsLoadRequestRef.current + 1;
    chartsLoadRequestRef.current = requestId;

    const uniqueChartNames = Array.from(
      new Set(
        chartNames
          .map((name) => text(name, "").trim())
          .filter((name) => name.length > 0)
      )
    ).sort((a, b) => (CHART_LOAD_PRIORITY[a] ?? 100) - (CHART_LOAD_PRIORITY[b] ?? 100));
    let loadedCount = 0;
    const failedChartNames: string[] = [];
    const loadPromise = (async () => {
      for (const chartName of uniqueChartNames) {
        if (chartsLoadRequestRef.current !== requestId) {
          return;
        }
        let figure: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            figure = await getChart(
              runId,
              chartName,
              DEBUG_TINY_LOUDNESS_TEST && chartName === "loudness"
            );
            break;
          } catch {
            if (attempt === 0) {
              await delay(160);
            }
          }
        }
        if (!figure) {
          failedChartNames.push(chartName);
          continue;
        }
        if (chartsLoadRequestRef.current !== requestId) {
          return;
        }
        setCharts((prev) => {
          const next = { ...prev, [chartName]: figure };
          chartsRef.current = next;
          return next;
        });
        loadedCount += 1;
      }

      if (chartsLoadRequestRef.current !== requestId) {
        return;
      }

      if (loadedCount === 0) {
        const payload = await getCharts(runId);
        if (chartsLoadRequestRef.current !== requestId) {
          return;
        }
        chartsRef.current = payload;
        setCharts(payload);
        chartsLoadedRunRef.current = runId;
        chartRetryAttemptsRef.current[runId] = 0;
        return;
      }
      if (failedChartNames.length > 0) {
        chartsLoadedRunRef.current = null;
        setStatusMessage(
          t("analyser.msg.chartsPartial", {
            loaded: loadedCount,
            total: uniqueChartNames.length,
            missing: failedChartNames.join(", ")
          })
        );
      } else {
        chartsLoadedRunRef.current = runId;
        chartRetryAttemptsRef.current[runId] = 0;
      }
    })();

    chartLoadInFlightRef.current = { runId, promise: loadPromise };
    try {
      await loadPromise;
    } finally {
      if (chartLoadInFlightRef.current?.promise === loadPromise) {
        chartLoadInFlightRef.current = null;
      }
    }
  }, [t]);

  const refreshRunDetail = useCallback(async (runId: string, force = false) => {
    const inFlight = runDetailInFlightRef.current;
    if (!force && inFlight && inFlight.runId === runId) {
      return inFlight.promise;
    }

    const now = Date.now();
    const lastFetch = lastRunDetailFetchRef.current;
    if (!force && lastFetch.runId === runId && now - lastFetch.at < RUN_DETAIL_MIN_INTERVAL_MS) {
      return;
    }

    if (runDetailAbortRef.current && inFlight && inFlight.runId !== runId) {
      runDetailAbortRef.current.abort();
    }

    const controller = new AbortController();
    runDetailAbortRef.current = controller;
    lastRunDetailFetchRef.current = { runId, at: now };

    const requestSeq = runDetailRequestSeqRef.current + 1;
    runDetailRequestSeqRef.current = requestSeq;
    const requestPromise = (async () => {
      try {
      const detail = await getRun(runId, controller.signal);
      setRunDetail(detail);
      const conversionStatus = detail.conversions?.status;
      const conversionProgress = detail.conversions?.progress ?? 0;
      const masteringStatus = detail.mastering?.status;
      const masteringProgress = detail.mastering?.progress ?? 0;
      const masteringStageDetail = text(detail.mastering?.detail, "").trim();
      const masteringStage = text(detail.mastering?.stage, "").trim();
      const masteringTicker = masteringStageDetail || (masteringStage ? `${stageLabel(masteringStage, t)}.` : "");
      const analysisTicker = stageTickerText(detail.stage_detail ?? null, detail.stage ?? detail.status, t);
      const stageAgeSeconds = secondsSinceIso(detail.stage_updated_at ?? null);
      const staleLoopHint =
        (detail.status === "running" || detail.status === "queued") &&
        stageAgeSeconds !== null &&
        stageAgeSeconds > ANALYSIS_STALE_WARNING_SECONDS
          ? t("analyser.msg.noStageUpdate", { n: stageAgeSeconds })
          : "";
      if (detail.status === "completed") {
        const expectedChartNames = (detail.chart_names ?? []).filter((name) => name.length > 0);
        const missingChartNames = expectedChartNames.filter((name) => !(name in chartsRef.current));
        if (chartsLoadedRunRef.current !== runId || missingChartNames.length > 0) {
          await loadChartsForRun(
            runId,
            missingChartNames.length > 0 ? missingChartNames : expectedChartNames
          );
        }
        const unresolvedChartNames = expectedChartNames.filter((name) => !(name in chartsRef.current));
        if (unresolvedChartNames.length > 0) {
          const loaded = expectedChartNames.length - unresolvedChartNames.length;
          setStatusMessage(
            t("analyser.msg.chartsLoading", {
              loaded,
              total: expectedChartNames.length,
              missing: unresolvedChartNames.join(", ")
            })
          );
        } else if (masteringStatus === "queued" || masteringStatus === "running") {
          setStatusMessage(
            `${t("analyser.msg.masteringProgress", { status: statusWord(t, masteringStatus), pct: masteringProgress.toFixed(1) })}${masteringTicker ? ` | ${masteringTicker}` : ""}`
          );
        } else if (masteringStatus === "failed") {
          setStatusMessage(detail.mastering?.error_message || t("analyser.msg.masteringFailed"));
        } else if (conversionStatus === "queued" || conversionStatus === "running") {
          setStatusMessage(t("analyser.msg.conversionProgress", { status: statusWord(t, conversionStatus), pct: conversionProgress.toFixed(1) }));
        } else if (conversionStatus === "failed") {
          setStatusMessage(detail.conversions?.error_message || t("analyser.msg.conversionFailed"));
        } else {
          setStatusMessage(analysisTicker || t("analyser.msg.analysisComplete"));
        }
      } else if (detail.status === "failed") {
        setStatusMessage(detail.error_message || t("analyser.msg.analysisFailed"));
      } else if (masteringStatus === "queued" || masteringStatus === "running") {
        setStatusMessage(
          `${t("analyser.msg.masteringProgress", { status: statusWord(t, masteringStatus), pct: masteringProgress.toFixed(1) })}${masteringTicker ? ` | ${masteringTicker}` : ""}`
        );
      } else if (conversionStatus === "queued" || conversionStatus === "running") {
        setStatusMessage(t("analyser.msg.conversionProgress", { status: statusWord(t, conversionStatus), pct: conversionProgress.toFixed(1) }));
      } else {
        setStatusMessage(
          `${t("analyser.msg.runProgress", { status: statusWord(t, detail.status), pct: detail.progress.toFixed(1), ticker: analysisTicker })}${staleLoopHint}`
        );
      }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          return;
        }
        setStatusMessage(
          `${toErrorMessage(err, t("analyser.msg.fetchRunFailed"))} (API: ${getApiBase()})`
        );
      } finally {
        if (runDetailAbortRef.current === controller) {
          runDetailAbortRef.current = null;
        }
        if (runDetailInFlightRef.current?.seq === requestSeq) {
          runDetailInFlightRef.current = null;
        }
      }
    })();

    runDetailInFlightRef.current = { runId, seq: requestSeq, promise: requestPromise };
    return requestPromise;
  }, [loadChartsForRun, t]);

  useEffect(() => {
    refreshRunDetailRef.current = refreshRunDetail;
  }, [refreshRunDetail]);

  // Load the run list after mount so the initial selection hydrates from the API.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!selectedRunId) return;
    if (selectedRunInitRef.current === selectedRunId) return;
    selectedRunInitRef.current = selectedRunId;
    if (chartsLoadedRunRef.current !== selectedRunId) {
      chartsLoadRequestRef.current += 1;
      chartsLoadedRunRef.current = null;
      chartLoadInFlightRef.current = null;
      chartRetryAttemptsRef.current[selectedRunId] = 0;
      chartsRef.current = {};
      setCharts({});
    }
    initializedSelectionRunRef.current = null;
    setScrubTime(0);
    setSelectionStart(0);
    setSelectionEnd(1);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    void refreshRunDetailRef.current(selectedRunId, true);
  }, [selectedRunId]);

  useEffect(() => {
    if (selectedRunId) return;
    selectedRunInitRef.current = null;
    chartRetryAttemptsRef.current = {};
  }, [selectedRunId]);

  const shouldPollRunDetail = (() => {
    if (!runDetail) return false;
    const conversionStatus = runDetail.conversions?.status;
    const masteringStatus = runDetail.mastering?.status;
    return (
      runDetail.status === "queued" ||
      runDetail.status === "running" ||
      conversionStatus === "queued" ||
      conversionStatus === "running" ||
      masteringStatus === "queued" ||
      masteringStatus === "running"
    );
  })();

  useEffect(() => {
    if (!selectedRunId || !shouldPollRunDetail) return;
    const id = window.setInterval(() => {
      void refreshRunDetailRef.current(selectedRunId);
    }, 3000);
    return () => window.clearInterval(id);
  }, [selectedRunId, shouldPollRunDetail]);

  useEffect(() => {
    if (!selectedRunId || runDetail?.status !== "completed") return;
    const expectedChartNames = (runDetail.chart_names ?? []).filter((name) => name.length > 0);
    if (expectedChartNames.length === 0) return;
    const missingChartNames = expectedChartNames.filter((name) => !(name in charts));
    if (missingChartNames.length === 0) {
      chartRetryAttemptsRef.current[selectedRunId] = 0;
      return;
    }
    const attempts = chartRetryAttemptsRef.current[selectedRunId] ?? 0;
    if (attempts >= 3) return;
    chartRetryAttemptsRef.current[selectedRunId] = attempts + 1;
    const timerId = window.setTimeout(() => {
      void loadChartsForRun(selectedRunId, missingChartNames);
    }, 900);
    return () => window.clearTimeout(timerId);
  }, [selectedRunId, runDetail?.status, runDetail?.chart_names, charts, loadChartsForRun]);

  // Keep duration and first-pass review bounds in sync with analyzed metadata.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const tech = asRecord(runDetail?.metrics?.technical);
    const measuredDuration = maybeNum(tech.duration_seconds);
    if (measuredDuration !== null && measuredDuration > 0) {
      setDuration(measuredDuration);
      if (selectedRunId && initializedSelectionRunRef.current !== selectedRunId) {
        setSelectionStart(0);
        setSelectionEnd(measuredDuration);
        initializedSelectionRunRef.current = selectedRunId;
      }
      return;
    }
    setDuration((prev) => (prev > 0 ? prev : 1));
  }, [runDetail?.metrics, selectedRunId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Clamp the review window and scrubber whenever the effective duration changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const [nextStart, nextEnd] = normalizeSelectionBounds(selectionStart, selectionEnd, duration);
    if (Math.abs(nextStart - selectionStart) > 1e-6) {
      setSelectionStart(nextStart);
    }
    if (Math.abs(nextEnd - selectionEnd) > 1e-6) {
      setSelectionEnd(nextEnd);
    }
    if (scrubTime < nextStart || scrubTime > nextEnd) {
      setScrubTime(nextStart);
      if (audioRef.current) {
        audioRef.current.currentTime = nextStart;
      }
    }
  }, [duration, scrubTime, selectionEnd, selectionStart]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Surface newly finished conversion/mastering outputs in the save dialog.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedRunId || !runDetail) return;
    const nextPending: PendingSaveOutput[] = [];

    const conversionPrompt = conversionPromptRequestsRef.current.get(selectedRunId);
    if (conversionPrompt) {
      const conversionStatus = runDetail.conversions?.status;
      if (conversionStatus === "failed") {
        conversionPromptRequestsRef.current.delete(selectedRunId);
      } else if (conversionStatus === "completed") {
        const requestedFormats = new Set(conversionPrompt.requestedFormats.map((fmt) => fmt.toLowerCase()));
        for (const file of runDetail.conversions?.manifest?.files ?? []) {
          const format = text(file.format, "").toLowerCase();
          if (!requestedFormats.has(format)) continue;
          nextPending.push({
            id: `${conversionPrompt.requestId}:conversion:${format}:${file.filename}`,
            source: "conversion",
            filename: file.filename,
            url: convertedFileUrl(selectedRunId, file.format),
            detail: `${file.format.toUpperCase()} | ${text(file.codec, "codec?")} | ${bytesLabel(num(file.size_bytes, 0))}`
          });
        }
        conversionPromptRequestsRef.current.delete(selectedRunId);
      }
    }

    const masteringPrompt = masteringPromptRequestsRef.current.get(selectedRunId);
    if (masteringPrompt) {
      const masteringStatus = runDetail.mastering?.status;
      if (masteringStatus === "failed") {
        masteringPromptRequestsRef.current.delete(selectedRunId);
      } else if (masteringStatus === "completed") {
        const manifest = runDetail.mastering?.manifest;
        const modeMatches = text(manifest?.mode, "").toLowerCase() === masteringPrompt.mode.toLowerCase();
        const presetMatches = text(manifest?.preset, "").toLowerCase() === masteringPrompt.preset.toLowerCase();
        if (modeMatches && presetMatches) {
          const outputs = manifest?.outputs ?? [];
          const bestId = text(manifest?.best_output_id, "").toLowerCase();
          let selectedOutputs = outputs;
          if (bestId) {
            const best = outputs.find((item) => text(item.id, "").toLowerCase() === bestId);
            if (best) {
              selectedOutputs = [best];
            }
          } else if (outputs.length > 0) {
            selectedOutputs = [outputs[0]];
          }

          for (const item of selectedOutputs) {
            const metrics = asRecord(item.metrics);
            const lufs = maybeNum(metrics.integrated_lufs);
            nextPending.push({
              id: `${masteringPrompt.requestId}:mastering:${item.id}:${item.filename}`,
              source: "mastering",
              filename: item.filename,
              url: masteredFileUrl(selectedRunId, item.id),
              detail: `${item.id} | ${lufs !== null ? `${lufs.toFixed(2)} LUFS` : `LUFS ${t("analyser.na")}`} | ${bytesLabel(num(item.size_bytes, 0))}`
            });
          }
          masteringPromptRequestsRef.current.delete(selectedRunId);
        }
      }
    }

    if (nextPending.length === 0) return;
    setPendingSaveOutputs((prev) => {
      const merged = [...prev];
      const keyToIndex = new Map<string, number>();
      for (let i = 0; i < merged.length; i += 1) {
        keyToIndex.set(`${merged[i].source}:${merged[i].filename}`, i);
      }
      for (const row of nextPending) {
        const key = `${row.source}:${row.filename}`;
        const existingIndex = keyToIndex.get(key);
        if (existingIndex === undefined) {
          keyToIndex.set(key, merged.length);
          merged.push(row);
        } else {
          merged[existingIndex] = row;
        }
      }
      return merged;
    });
    setSaveDialogOpen(true);
    setStatusMessage(tp("analyser.msg.outputsReady", nextPending.length));
  }, [
    t,
    tp,
    selectedRunId,
    runDetail,
    runDetail?.conversions?.status,
    runDetail?.conversions?.manifest?.files,
    runDetail?.mastering?.status,
    runDetail?.mastering?.manifest?.mode,
    runDetail?.mastering?.manifest?.preset,
    runDetail?.mastering?.manifest?.outputs
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Close the save dialog once all pending outputs have been handled.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (pendingSaveOutputs.length === 0) {
      setSaveDialogOpen(false);
    }
  }, [pendingSaveOutputs.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleAutoUpload = async (file: File) => {
    setIsBusy(true);
    setStatusMessage(t("analyser.msg.uploading"));
    try {
      console.log("[AudioQI Debug] Starting upload for file:", file.name);
      const payload = await uploadAudio(file);
      console.log("[AudioQI Debug] Upload completed successfully. Payload:", payload);
      setSelectedRunId(payload.run.id);
      console.log("[AudioQI Debug] Refreshing runs...");
      await refreshRuns();
      setStatusMessage(t("analyser.msg.uploaded", { name: payload.run.filename }));
    } catch (err) {
      console.error("[AudioQI Debug] Error during upload:", err);
      setStatusMessage(toErrorMessage(err, t("analyser.msg.uploadFailed")));
    } finally {
      setIsBusy(false);
    }
  };

  const onUpload = async () => {
    console.log("[AudioQI Debug] onUpload clicked. selectedFile:", selectedFile);
    if (selectedFile) {
      await handleAutoUpload(selectedFile);
    }
  };

  const onAnalyze = async () => {
    if (!selectedRunId) return;
    setIsBusy(true);
    try {
      chartsLoadRequestRef.current += 1;
      chartsLoadedRunRef.current = null;
      chartLoadInFlightRef.current = null;
      setCharts({});
      await analyzeRun(selectedRunId, useGpu);
      await refreshRunDetail(selectedRunId);
      setStatusMessage(t("analyser.msg.analysisQueued"));
    } catch (err) {
      setStatusMessage(toErrorMessage(err, t("analyser.msg.analysisStartFailed")));
    } finally {
      setIsBusy(false);
    }
  };

  const onConvert = async () => {
    if (!selectedRunId) return;
    const formats = FORMAT_OPTIONS.filter((fmt) => formatSelection[fmt]);
    if (formats.length === 0) {
      setStatusMessage(t("analyser.msg.pickFormat"));
      return;
    }
    setIsConverting(true);
    setStatusMessage(t("analyser.msg.queueingConversion"));
    try {
      await convertRun(
        selectedRunId,
        formats,
        Math.max(96, Math.min(320, mp3BitrateKbps)),
        Math.max(96, Math.min(320, aacBitrateKbps))
      );
      conversionPromptRequestsRef.current.set(selectedRunId, {
        requestId: nextPromptRequestId("conversion", selectedRunId),
        requestedFormats: formats.map((fmt) => fmt.toLowerCase())
      });
      await refreshRunDetail(selectedRunId);
      setStatusMessage(t("analyser.msg.conversionQueued", { formats: formats.join(", ").toUpperCase() }));
    } catch (err) {
      conversionPromptRequestsRef.current.delete(selectedRunId);
      setStatusMessage(toErrorMessage(err, t("analyser.msg.conversionStartFailed")));
    } finally {
      setIsConverting(false);
    }
  };

  const onMaster = async () => {
    if (!selectedRunId) return;
    setIsMastering(true);
    setStatusMessage(t("analyser.msg.queueingMastering"));
    try {
      const parsedTargetLufs = parseOptionalNumberInput(masterTargetLufsInput);
      const parsedTruePeak = parseOptionalNumberInput(masterTruePeakDbfsInput);
      const targetLufs =
        parsedTargetLufs === null ? null : Math.max(-30, Math.min(-6, parsedTargetLufs));
      const truePeak = parsedTruePeak === null ? null : Math.max(-6, Math.min(0, parsedTruePeak));
      const parsedInputGain = parseOptionalNumberInput(masterInputGainDbInput);
      const inputGainDb = parsedInputGain === null ? 0 : Math.max(-12, Math.min(12, parsedInputGain));
      const bassMonoHz = masterBassMonoHz === "" ? null : Number(masterBassMonoHz);
      const parsedStereoWidth = parseOptionalNumberInput(masterStereoWidthInput);
      const stereoWidth =
        parsedStereoWidth === null ? null : Math.max(0.5, Math.min(1.5, parsedStereoWidth));
      await runMastering(
        selectedRunId,
        masterMode,
        masterPreset,
        targetLufs,
        truePeak,
        Math.max(2, Math.min(8, optimizerVariants)),
        normalizationProfile,
        masterBackend,
        masterReferenceRunId.trim() || null,
        Math.max(1, Math.min(5, maxRefinePasses)),
        inputGainDb,
        bassMonoHz,
        stereoWidth
      );
      masteringPromptRequestsRef.current.set(selectedRunId, {
        requestId: nextPromptRequestId("mastering", selectedRunId),
        mode: masterMode,
        preset: masterPreset
      });
      await refreshRunDetail(selectedRunId);
      setStatusMessage(
        t("analyser.msg.masteringQueued", {
          mode: masterMode.toUpperCase(),
          preset: masterPreset,
          backend: masterBackend,
          norm: normalizationProfile,
          gain: `${inputGainDb >= 0 ? "+" : ""}${inputGainDb.toFixed(1)}`
        })
      );
    } catch (err) {
      masteringPromptRequestsRef.current.delete(selectedRunId);
      setStatusMessage(toErrorMessage(err, t("analyser.msg.masteringStartFailed")));
    } finally {
      setIsMastering(false);
    }
  };

  const onClearHistory = async (hardReset = false) => {
    const confirmed = hardReset
      ? window.confirm(t("analyser.msg.confirmHardReset"))
      : window.confirm(t("analyser.msg.confirmClear"));
    if (!confirmed) return;
    setIsBusy(true);
    setStatusMessage(hardReset ? t("analyser.msg.hardResetting") : t("analyser.msg.clearing"));
    try {
      const result = await clearRunHistory(hardReset);
      setSelectedRunId(null);
      setRunDetail(null);
      setCharts({});
      chartsLoadRequestRef.current += 1;
      chartsLoadedRunRef.current = null;
      chartLoadInFlightRef.current = null;
      setScrubTime(0);
      setDuration(1);
      setSelectionStart(0);
      setSelectionEnd(1);
      setNormalizationProfile("off");
      setMasterTargetLufsInput("-14");
      setMasterTruePeakDbfsInput("-1");
      setMasterInputGainDbInput("0");
      setMasterBassMonoHz("");
      setMasterStereoWidthInput("");
      setPendingSaveOutputs([]);
      setSaveDialogOpen(false);
      conversionPromptRequestsRef.current.clear();
      masteringPromptRequestsRef.current.clear();
      initializedSelectionRunRef.current = null;
      await refreshRuns();
      const suffix = result.skipped_active > 0 ? tp("analyser.msg.keptActive", result.skipped_active) : "";
      const hardResetSuffix = hardReset
        ? t("analyser.msg.jobsReset", {
            cancelled: result.jobs_reset?.cancelled ?? 0,
            running: result.jobs_reset?.running ?? 0
          })
        : "";
      setStatusMessage(`${tp("analyser.msg.cleared", result.deleted)}${suffix}${hardResetSuffix}`);
    } catch (err) {
      setStatusMessage(
        toErrorMessage(err, hardReset ? t("analyser.msg.hardResetFailed") : t("analyser.msg.clearFailed"))
      );
    } finally {
      setIsBusy(false);
    }
  };

  const currentStatus = runDetail?.status ?? "idle";
  const progress = runDetail?.progress ?? 0;
  const analysisStage = runDetail?.stage ?? currentStatus;
  const analysisTicker = stageTickerText(runDetail?.stage_detail ?? null, analysisStage, t);
  const analysisStageAgeSeconds = secondsSinceIso(runDetail?.stage_updated_at ?? null);
  const analysisStageMeta =
    analysisStageAgeSeconds !== null
      ? t("analyser.session.stageUpdated", { stage: stageLabel(analysisStage, t), n: analysisStageAgeSeconds })
      : t("analyser.session.stage", { stage: stageLabel(analysisStage, t) });
  const conversionInfo = runDetail?.conversions;
  const conversionStatus = conversionInfo?.status ?? "idle";
  const conversionProgress = conversionInfo?.progress ?? 0;
  const conversionFiles = conversionInfo?.manifest?.files ?? [];
  const masteringInfo = runDetail?.mastering;
  const masteringStatus = masteringInfo?.status ?? "idle";
  const masteringProgress = masteringInfo?.progress ?? 0;
  const masteringOutputs = masteringInfo?.manifest?.outputs ?? [];
  const bestMasterId = text(masteringInfo?.manifest?.best_output_id, na);
  const masteringStage = text(masteringInfo?.stage, "");
  const masteringDetail = text(masteringInfo?.detail, "");
  const masteringSelfCheck = asRecord(masteringInfo?.manifest?.self_check);
  const selfCheckAssessment = text(masteringSelfCheck.assessment, na);
  const selfCheckScoreBefore = maybeNum(masteringSelfCheck.score_before);
  const selfCheckScoreAfter = maybeNum(masteringSelfCheck.score_after);
  const selfCheckScoreDelta = maybeNum(masteringSelfCheck.score_delta);
  const selfCheckResolved = Array.isArray(masteringSelfCheck.resolved)
    ? masteringSelfCheck.resolved.map((x) => text(x, "")).filter((x) => x.length > 0)
    : [];
  const selfCheckRemaining = Array.isArray(masteringSelfCheck.remaining)
    ? masteringSelfCheck.remaining.map((x) => text(x, "")).filter((x) => x.length > 0)
    : [];
  const selfCheckWorsened = Array.isArray(masteringSelfCheck.worsened)
    ? masteringSelfCheck.worsened.map((x) => text(x, "")).filter((x) => x.length > 0)
    : [];
  const selfCheckRecommendedFixes = Array.isArray(masteringSelfCheck.recommended_fixes)
    ? masteringSelfCheck.recommended_fixes
        .map((x) => asRecord(x))
        .map((x) => ({
          issue: text(x.issue, ""),
          action: text(x.action, "")
        }))
        .filter((x) => x.issue.length > 0 && x.action.length > 0)
    : [];
  const selfCheckComplianceMastered = asRecord(masteringSelfCheck.compliance_mastered);
  const selfCheckCompliancePassed = selfCheckComplianceMastered.passed === true;
  const selfCheckComplianceFailed = Array.isArray(selfCheckComplianceMastered.failed)
    ? selfCheckComplianceMastered.failed.map((item) => text(item, "")).filter((item) => item.length > 0)
    : [];
  const selfCheckComplianceLufsDelta = maybeNum(selfCheckComplianceMastered.loudness_delta_lu);
  const selfCheckComplianceTruePeakDelta = maybeNum(selfCheckComplianceMastered.true_peak_delta_db);
  const selfCheckComplianceCrestDelta = maybeNum(selfCheckComplianceMastered.crest_delta_db);
  const postCheckRepair = asRecord(masteringSelfCheck.post_check_repair);
  const postCheckRepairAttempted = postCheckRepair.attempted === true;
  const postCheckRepairApplied = postCheckRepair.applied === true;
  const postCheckRepairRound = maybeNum(postCheckRepair.applied_round);
  const appliedSettings = asRecord(masteringInfo?.manifest?.applied_settings);
  const appliedTargetLufs = maybeNum(appliedSettings.target_lufs);
  const appliedTargetTruePeak = maybeNum(appliedSettings.target_true_peak_dbfs);
  const appliedNormalizationProfile = text(appliedSettings.normalization_profile, "off");
  const appliedInputGainDb = maybeNum(appliedSettings.input_gain_db);
  const appliedBassMonoHz = maybeNum(appliedSettings.bass_mono_hz);
  const appliedStereoWidth = maybeNum(appliedSettings.stereo_width);
  const inputGainInfo = asRecord(masteringInfo?.manifest?.input_gain);
  const inputGainNotes = Array.isArray(inputGainInfo.notes)
    ? inputGainInfo.notes.map((note) => text(note, "")).filter((note) => note.length > 0)
    : [];
  const appliedMode = text(masteringInfo?.manifest?.mode, "").toLowerCase();
  const appliedPreset = text(masteringInfo?.manifest?.preset, "").toLowerCase();
  const bestOutputVerification = masteringOutputs.find((row) => row.id === bestMasterId);
  const bestOutputHash = text(bestOutputVerification?.sha256, "");
  const backendInfo = asRecord(masteringInfo?.manifest?.backend);
  const backendSelected = text(backendInfo.selected, text(masteringInfo?.backend, "auto"));
  const refinementInfo = asRecord(masteringInfo?.manifest?.refinement);
  const refineAcceptedPasses = maybeNum(refinementInfo.accepted_passes);
  const refineMaxPasses = maybeNum(refinementInfo.max_passes);
  const refineFinalScore = maybeNum(refinementInfo.final_issue_score);
  const refineRollbackCount = maybeNum(refinementInfo.rollback_count);
  const refineFallbackApplied = refinementInfo.fallback_applied === true;
  const refineNonRegressionApplied = refinementInfo.non_regression_applied === true;
  const refineNonRegressionReason = text(refinementInfo.non_regression_reason, "").trim();
  const adaptationInfo = asRecord(masteringInfo?.manifest?.adaptation);
  const adaptationAdjustmentCount = maybeNum(adaptationInfo.adjustment_count);
  const adaptationSourceIssueScore = maybeNum(adaptationInfo.source_issue_score);
  const adaptationAdjustments = Array.isArray(adaptationInfo.adjustments)
    ? adaptationInfo.adjustments
        .map((item) => asRecord(item))
        .map((item) => ({
          field: text(item.field, ""),
          before: maybeNum(item.before),
          after: maybeNum(item.after),
          reason: text(item.reason, "")
        }))
        .filter((item) => item.field.length > 0)
    : [];
  const proFeatures = asRecord(masteringInfo?.manifest?.pro_features);
  const proFeatureEntries = Object.entries(proFeatures).filter(([, value]) => typeof value === "boolean");
  const metrics = asRecord(runDetail?.metrics);
  const metadata = asRecord(runDetail?.metadata);
  const allMarkers = runDetail?.markers ?? [];
  const metadataDisplayTags = asRecord(metadata.display_tags);
  const fileInsights = asRecord(metrics.file_insights);
  const compression = asRecord(fileInsights.compression);
  const dynamicInfo = asRecord(fileInsights.dynamic_range);
  const estimatedRange = asRecord(fileInsights.estimated_content_range_hz);
  const theoreticalRange = asRecord(fileInsights.theoretical_usable_range_hz);
  const warnings = ((metrics.warnings as string[] | undefined) ?? []).slice(0, 6);
  const tagEntries = Object.entries(metadataDisplayTags).slice(0, 30);
  const suppressedTagKeys = Array.isArray(metadata.suppressed_tag_keys)
    ? metadata.suppressed_tag_keys.map((item) => text(item, "")).filter((item) => item.length > 0)
    : [];
  const suppressedTagCountRaw = maybeNum(metadata.suppressed_tag_count);
  const suppressedTagCount = suppressedTagCountRaw !== null ? Math.max(0, Math.round(suppressedTagCountRaw)) : suppressedTagKeys.length;
  const nyquistHz =
    maybeNum(fileInsights.file_nyquist_hz) ??
    metricNumber(metrics, ["technical", "sample_rate"], 0) / 2;
  const estLowHz = maybeNum(estimatedRange.low_hz);
  const estHighHz = maybeNum(estimatedRange.high_hz);
  const theoLowHz = maybeNum(theoreticalRange.low_hz) ?? 20;
  const theoHighHz = maybeNum(theoreticalRange.high_hz) ?? Math.min(20_000, nyquistHz || 20_000);
  const compressionType = text(compression.compression_type, "unknown");
  const bitrateKbps = num(metadata.bitrate, 0) / 1000;
  // The analyzer returns no noise floor when the music never drops out far
  // enough to expose one; showing the quietest music instead would mislead.
  // Runs from before that fix lack the `noise_floor` block and are treated as stale.
  const noiseFloorStatus = text(asRecord(metrics.noise_floor).status, "stale");
  const noiseFloorDbfs = noiseFloorStatus === "stale" ? null : maybeNum(metrics.noise_floor_dbfs);
  const dynamicSpan = noiseFloorStatus === "stale" ? null : maybeNum(dynamicInfo.peak_to_noise_span_db);
  const peakToLoudness = maybeNum(dynamicInfo.peak_to_loudness_ratio_db);
  const lossHz = maybeNum(compression.estimated_high_freq_loss_hz);
  const lossPct = maybeNum(compression.estimated_high_freq_loss_percent);
  const lossReferenceHz = maybeNum(compression.loss_reference_hz);
  const bitDepth = maybeNum(metadata.bit_depth);
  const bitDepthLabel =
    bitDepth !== null && bitDepth > 0
      ? t(text(metadata.codec, "").toLowerCase().startsWith("pcm_f") ? "analyser.file.bitDepthFloat" : "analyser.file.bitDepth", {
          n: bitDepth
        })
      : t("analyser.file.bitDepthNa");
  const selectedSegmentLength = Math.max(0, selectionEnd - selectionStart);
  const masteringRecommendations = Array.isArray(metrics.mastering_recommendations)
    ? metrics.mastering_recommendations
        .map((item) => asRecord(item))
        .map((item) => ({
          priority: text(item.priority, "info"),
          issue: text(item.issue, na),
          action: text(item.action, na)
        }))
    : [];
  const aiMasteringAdvice = asRecord(metrics.ai_mastering_advice);
  const recommendedMode = asMasterMode(text(aiMasteringAdvice.recommended_mode, "").toLowerCase());
  const recommendedPreset = asMasterPreset(text(aiMasteringAdvice.recommended_preset, "").toLowerCase());
  const recommendedBackend = asMasterBackend(text(aiMasteringAdvice.recommended_backend, "").toLowerCase());
  const recommendedRefinePassesRaw = maybeNum(aiMasteringAdvice.recommended_refine_passes);
  const recommendedRefinePasses =
    recommendedRefinePassesRaw !== null ? Math.max(1, Math.min(5, Math.round(recommendedRefinePassesRaw))) : null;
  const recommendedTargetLufs = maybeNum(aiMasteringAdvice.target_lufs);
  const recommendedTruePeak = maybeNum(aiMasteringAdvice.true_peak_dbfs);
  const recommendedVariantsRaw = maybeNum(aiMasteringAdvice.optimizer_variants);
  const recommendedVariants =
    recommendedVariantsRaw !== null ? Math.max(2, Math.min(8, Math.round(recommendedVariantsRaw))) : null;
  const aiModeMatch = recommendedMode ? appliedMode === recommendedMode : null;
  const aiPresetMatch = recommendedPreset ? appliedPreset === recommendedPreset : null;
  const aiTargetLufsMatch =
    recommendedTargetLufs !== null && appliedTargetLufs !== null
      ? Math.abs(recommendedTargetLufs - appliedTargetLufs) <= 0.2
      : null;
  const aiTruePeakMatch =
    recommendedTruePeak !== null && appliedTargetTruePeak !== null
      ? Math.abs(recommendedTruePeak - appliedTargetTruePeak) <= 0.2
      : null;
  const recommendationConfidence = severityWord(t, text(aiMasteringAdvice.confidence, na).toLowerCase());
  const recommendationIssueScore = maybeNum(aiMasteringAdvice.issue_score);
  const recommendationReasons = Array.isArray(aiMasteringAdvice.reasons)
    ? aiMasteringAdvice.reasons.map((r) => text(r, "")).filter((r) => r.length > 0)
    : [];
  const canApplyAiMasteringAdvice = recommendedMode !== null && recommendedPreset !== null;
  const selectedNormalizationProfile =
    NORMALIZATION_PROFILE_OPTIONS.find((profile) => profile.id === normalizationProfile) ??
    NORMALIZATION_PROFILE_OPTIONS[0];
  const parsedMasterInputGain = parseOptionalNumberInput(masterInputGainDbInput);
  const masterInputGainDb =
    parsedMasterInputGain === null ? 0 : Math.max(-12, Math.min(12, parsedMasterInputGain));
  const masterInputGainSummary =
    masterInputGainDb === 0
      ? t("analyser.mastering.unity")
      : t("analyser.mastering.gainBefore", { gain: `${masterInputGainDb > 0 ? "+" : ""}${masterInputGainDb.toFixed(1)}` });
  const integratedLufs = metricNumber(metrics, ["loudness", "integrated_lufs"], 0);
  const truePeakDbfs = metricNumber(metrics, ["dynamics", "true_peak_dbfs"], 0);
  const crestFactorDb = metricNumber(metrics, ["dynamics", "crest_factor_db"], 0);
  const loudnessRangeLu = metricNumber(metrics, ["loudness", "lra_approx"], 0);
  const selectedRunSummary = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null;
  const selectedRunFilename = text(runDetail?.filename, selectedRunSummary?.filename ?? t("analyser.tiles.noRun"));
  const availableChartNames = (runDetail?.chart_names ?? []).filter((name) => name.length > 0);
  const loadedChartNames = Object.keys(charts).filter((name) => charts[name]);
  const activeChartGroupConfig = CHART_GROUPS.find((group) => group.id === activeChartGroup) ?? CHART_GROUPS[0];
  const visibleCharts = ALL_CHARTS.filter(
    (chart) => activeChartGroup === "all" || activeChartGroupConfig.keys.includes(chart.key)
  );
  const markerSeverityCounts = allMarkers.reduce<Record<string, number>>((acc, marker) => {
    const key = text(marker.severity, "info").toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const highlightedMarkerCount =
    (markerSeverityCounts.critical ?? 0) +
    (markerSeverityCounts.high ?? 0) +
    (markerSeverityCounts.error ?? 0) +
    (markerSeverityCounts.warning ?? 0);
  const masteringRecommendationSummary = canApplyAiMasteringAdvice
    ? `${recommendedMode?.toUpperCase()} / ${recommendedPreset}`
    : t("analyser.mastering.awaiting");
  const loudnessTargetForReadiness = selectedNormalizationProfile.targetLufs ?? -14.0;
  const loudnessOffset = integratedLufs - loudnessTargetForReadiness;
  const loudnessReadiness = t(
    Math.abs(loudnessOffset) <= 1.5 ? "analyser.readiness.aligned" : loudnessOffset > 0 ? "analyser.readiness.hot" : "analyser.readiness.quiet"
  );
  const peakReadiness = t(
    truePeakDbfs <= -1.0 ? "analyser.readiness.safe" : truePeakDbfs <= -0.2 ? "analyser.readiness.tight" : "analyser.readiness.risk"
  );
  const markerReadiness = t(
    highlightedMarkerCount === 0
      ? "analyser.readiness.clean"
      : highlightedMarkerCount <= 3
        ? "analyser.readiness.review"
        : "analyser.readiness.attention"
  );
  const dynamicsReadiness = t(
    crestFactorDb >= 8 ? "analyser.readiness.open" : crestFactorDb >= 5 ? "analyser.readiness.controlled" : "analyser.readiness.dense"
  );
  const unavailableHints: string[] = [];
  if (lossPct === null) {
    unavailableHints.push(t("analyser.hints.lossUnavailable"));
  }
  if (dynamicSpan === null) {
    unavailableHints.push(
      noiseFloorStatus === "stale"
        ? t("analyser.hints.noiseStale")
        : noiseFloorStatus === "digital_silence"
          ? t("analyser.hints.noiseDigital")
          : t("analyser.hints.noiseMasked")
    );
  }
  if (peakToLoudness === null) {
    unavailableHints.push(t("analyser.hints.peakLufs"));
  }
  if (tagEntries.length === 0 && suppressedTagCount === 0) {
    unavailableHints.push(t("analyser.hints.noTags"));
  }
  if (tagEntries.length === 0 && suppressedTagCount > 0) {
    unavailableHints.push(tp("analyser.hints.hiddenOnly", suppressedTagCount));
  }

  const yesNo = (value: boolean | null) => (value === null ? na : value ? t("analyser.yes") : t("analyser.no"));
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

  const onApplyAiMasteringAdvice = () => {
    if (!canApplyAiMasteringAdvice || !recommendedMode || !recommendedPreset) return;
    setMasterMode(recommendedMode);
    setMasterPreset(recommendedPreset);
    if (recommendedTargetLufs !== null) {
      setMasterTargetLufsInput(recommendedTargetLufs.toFixed(1));
    }
    if (recommendedTruePeak !== null) {
      setMasterTruePeakDbfsInput(recommendedTruePeak.toFixed(1));
    }
    if (recommendedVariants !== null) {
      setOptimizerVariants(recommendedVariants);
    }
    if (recommendedBackend) {
      setMasterBackend(recommendedBackend);
    }
    if (recommendedRefinePasses !== null) {
      setMaxRefinePasses(recommendedRefinePasses);
    }
    const matchedProfile = NORMALIZATION_PROFILE_OPTIONS.find((profile) => {
      if (profile.targetLufs === null || profile.truePeakDbfs === null) {
        return false;
      }
      if (recommendedTargetLufs === null || recommendedTruePeak === null) {
        return false;
      }
      return (
        Math.abs(profile.targetLufs - recommendedTargetLufs) <= 0.2 &&
        Math.abs(profile.truePeakDbfs - recommendedTruePeak) <= 0.2
      );
    });
    setNormalizationProfile(matchedProfile?.id ?? "off");
    setStatusMessage(
      t("analyser.msg.appliedAdvice", {
        mode: recommendedMode.toUpperCase(),
        preset: recommendedPreset,
        backend: recommendedBackend ?? masterBackend
      })
    );
  };

  const scrollToChart = (chartKey: string) => {
    const target = (chartsTimelineRef.current?.ownerDocument ?? document).getElementById(`chart-${chartKey}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrubToTime = useCallback((time: number) => {
    setScrubTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const setReviewSelectionRange = useCallback((start: number, end: number) => {
    const [nextStart, nextEnd] = normalizeSelectionBounds(start, end, duration);
    setSelectionStart(nextStart);
    setSelectionEnd(nextEnd);
  }, [duration]);

  const markSelectionStartAtScrub = () => {
    setReviewSelectionRange(scrubTime, selectionEnd);
  };

  const markSelectionEndAtScrub = () => {
    setReviewSelectionRange(selectionStart, scrubTime);
  };

  const resetReviewSelection = () => {
    setReviewSelectionRange(0, duration);
    setIsLoopSelection(false);
  };

  const togglePlayback = useCallback(async () => {
    const audio = eqEnabled ? await ensurePlaybackGraph(true) : audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch (err) {
        setStatusMessage(toErrorMessage(err, t("analyser.msg.playbackFailed")));
      }
      return;
    }
    audio.pause();
  }, [ensurePlaybackGraph, eqEnabled, t]);

  const seekBySeconds = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
    scrubToTime(nextTime);
  }, [duration, scrubToTime]);

  const togglePlaybackRef = useRef(togglePlayback);
  const seekBySecondsRef = useRef(seekBySeconds);

  useEffect(() => {
    togglePlaybackRef.current = togglePlayback;
    seekBySecondsRef.current = seekBySeconds;
  }, [togglePlayback, seekBySeconds]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.getAttribute("contenteditable") === "true"
      )) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        void togglePlaybackRef.current();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekBySecondsRef.current(-5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekBySecondsRef.current(5);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  const exportEqWav = async () => {
    if (!selectedRunId) {
      setStatusMessage(t("analyser.msg.selectRunForEq"));
      return;
    }
    setIsEqExporting(true);
    try {
      const response = await fetch(audioUrl(selectedRunId), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(t("analyser.msg.sourceFetchFailed", { status: response.status }));
      }
      const arrayBuffer = await response.arrayBuffer();
      const AudioContextCtor = window.AudioContext;
      if (!AudioContextCtor || typeof OfflineAudioContext === "undefined") {
        throw new Error(t("analyser.msg.noOfflineRendering"));
      }

      const decodeContext = new AudioContextCtor();
      try {
        const decoded = await decodeContext.decodeAudioData(arrayBuffer.slice(0));
        const offlineContext = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
        const source = offlineContext.createBufferSource();
        source.buffer = decoded;
        const filters = createEqFilters(offlineContext);
        applyEqGains(filters, eqGains, eqEnabled);
        source.connect(filters[0]);
        for (let index = 0; index < filters.length - 1; index += 1) {
          filters[index].connect(filters[index + 1]);
        }
        filters[filters.length - 1].connect(offlineContext.destination);
        source.start(0);
        const rendered = await offlineContext.startRendering();
        const blob = encodeAudioBufferToWav(rendered);
        const baseName = selectedRunFilename.replace(/\.[^.]+$/, "") || "audioqi_run";
        await saveBlobWithPicker(blob, `${baseName}_eq.wav`);
      } finally {
        void decodeContext.close();
      }
      setStatusMessage(t("analyser.msg.eqExported"));
    } catch (err) {
      setStatusMessage(toErrorMessage(err, t("analyser.msg.eqExportFailed")));
    } finally {
      setIsEqExporting(false);
    }
  };

  const handleAudioPlay = () => {
    setIsPlaying(true);
    if (eqEnabled) {
      void ensurePlaybackGraph(true);
    }
  };

  const openVisualizer = () => {
    setVisualizerOpen(true);
    window.requestAnimationFrame(() => visualizerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const refreshUpdateStatus = async () => {
    setIsCheckingUpdate(true);
    try {
      const result = await checkForUpdates();
      setUpdateStatus(result);
      setStatusMessage(result.update_available ? t("analyser.msg.updateAvailable") : result.message);
    } catch (err) {
      setStatusMessage(toErrorMessage(err, t("analyser.msg.updateCheckFailed")));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const onToggleConfiguration = () => {
    const opening = !configurationOpen;
    setConfigurationOpen(opening);
    if (opening && !updateStatus && !isCheckingUpdate) {
      void refreshUpdateStatus();
    }
  };

  const onInstallUpdate = async () => {
    setIsInstallingUpdate(true);
    try {
      const result = await installUpdate();
      setStatusMessage(result.message);
      if (result.updated) {
        setUpdateStatus((previous) =>
          previous
            ? {
                ...previous,
                current_commit: result.current_commit,
                remote_commit: result.current_commit,
                update_available: false,
                message: result.message
              }
            : previous
        );
      }
    } catch (err) {
      setStatusMessage(toErrorMessage(err, t("analyser.msg.updateInstallFailed")));
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6 md:px-8">
      <section className="glass relative z-30 mb-5 rounded-3xl border border-border/80 p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-secondary/75 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Rocket className="h-3.5 w-3.5" /> Geekatplay Studio
            </p>
            <h1 className="mt-3 display-font text-3xl font-semibold md:text-4xl">
              {t("analyser.header.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("analyser.header.stack")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onToggleConfiguration} disabled={isBusy}>
              <Settings className="mr-2 h-4 w-4" />
              {t("analyser.header.configuration")}
            </Button>
            <Button variant="secondary" onClick={() => void refreshRuns()} disabled={isBusy}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {t("analyser.header.refreshRuns")}
            </Button>
            <Button
              variant="secondary"
              disabled={!selectedRunId}
              title={selectedRunId ? t("analyser.header.mapperTitle") : t("analyser.header.needSong")}
              onClick={() => {
                if (!selectedRunId) return;
                const params = new URLSearchParams({ run: selectedRunId, name: selectedRunFilename });
                router.push(`/mapper?${params.toString()}`);
              }}
            >
              <Network className="mr-2 h-4 w-4" />
              {t("common.workspaces.mapper")}
            </Button>
            <Button
              variant="secondary"
              title={
                selectedRunId
                  ? t("analyser.header.songFromThisTitle")
                  : t("analyser.header.newSongTitle")
              }
              onClick={() =>
                router.push(
                  selectedRunId ? startSongUrl({ runId: selectedRunId, name: selectedRunFilename }) : "/generate"
                )
              }
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {selectedRunId ? t("analyser.header.songFromThis") : t("common.workspaces.studio")}
            </Button>
            <Button
              variant="secondary"
              title={
                selectedRunId
                  ? t("analyser.header.editorAddTitle")
                  : t("analyser.header.editorOpenTitle")
              }
              onClick={() => {
                if (!selectedRunId) {
                  router.push("/editor");
                  return;
                }
                const params = new URLSearchParams({ run: selectedRunId, name: selectedRunFilename });
                router.push(`/editor?${params.toString()}`);
              }}
            >
              <AudioWaveform className="mr-2 h-4 w-4" />
              {t("common.workspaces.editor")}
            </Button>
            <Button variant="secondary" title={t("analyser.header.synthTitle")} onClick={() => router.push("/synth")}>
              <Piano className="mr-2 h-4 w-4" />
              {t("common.workspaces.synth")}
            </Button>
            <Button
              variant="secondary"
              title={t("analyser.header.modelsTitle")}
              onClick={() => router.push("/models")}
            >
              <Cpu className="mr-2 h-4 w-4" />
              {t("common.workspaces.models")}
            </Button>
            <AppPrefs />
            <Button
              variant="secondary"
              title={t("analyser.header.helpTitle")}
              onClick={() => window.open("/help#analyser-and-mastering", "_blank", "noreferrer")}
            >
              <CircleHelp className="mr-2 h-4 w-4" />
              {t("common.workspaces.help")}
            </Button>
            <Button variant="danger" onClick={() => void onClearHistory()} disabled={isBusy || runs.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("analyser.header.clearHistory")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void onClearHistory(true)}
              disabled={isBusy || runs.length === 0}
              title={t("analyser.header.hardResetTitle")}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("analyser.header.hardReset")}
            </Button>
          </div>
        </div>
      </section>

      {configurationOpen ? (
        <Floatable id="analyser-config" title={t("analyser.config.title")}>
          <Card className="mb-5 border-cyan-500/25 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">{t("analyser.config.title")}<FloatButton className="ml-auto" /></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("analyser.config.product")}</p>
                  <p className="mt-1 font-semibold">Geekatplay Studio Music Suite</p>
                  <p className="text-xs text-muted-foreground">{t("analyser.config.createdBy")}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("analyser.config.installedVersion")}</p>
                  <p className="mt-1 font-semibold">{updateStatus?.version ?? "1.0.0"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("analyser.config.revision", { rev: updateStatus?.current_commit?.slice(0, 12) ?? t("analyser.config.notAvailable") })}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("analyser.config.officialSource")}</p>
                  <a
                    className="mt-1 block font-semibold text-cyan-300 hover:text-cyan-200"
                    href="https://github.com/GeekatplayStudio/music-suite"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GeekatplayStudio/music-suite
                  </a>
                  <p className="text-xs text-muted-foreground">{t("analyser.config.stableBranch")}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                <div>
                  <p className="font-medium">
                    {updateStatus
                      ? updateStatus.update_available
                        ? t("analyser.config.updateAvailable")
                        : t("analyser.config.upToDate")
                      : t("analyser.config.readyToCheck")}
                  </p>
                  <p className="max-w-3xl text-xs text-muted-foreground">
                    {updateStatus?.working_tree_dirty
                      ? t("analyser.config.dirty")
                      : updateStatus?.message ?? t("analyser.config.officialOnly")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void refreshUpdateStatus()}
                    disabled={isCheckingUpdate || isInstallingUpdate}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {isCheckingUpdate ? t("analyser.config.checking") : t("analyser.config.check")}
                  </Button>
                  <Button
                    onClick={() => void onInstallUpdate()}
                    disabled={
                      isCheckingUpdate ||
                      isInstallingUpdate ||
                      !updateStatus?.update_available ||
                      !updateStatus.update_supported ||
                      updateStatus.working_tree_dirty
                    }
                  >
                    {isInstallingUpdate ? t("analyser.config.installing") : t("analyser.config.install")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </Floatable>
      ) : null}

      {visualizerOpen && selectedRunId ? (
        <div ref={visualizerRef} className="mb-5 scroll-mt-4">
          {visualPop.detached ? <DetachedPlaceholder state={visualPop} label={t("analyser.popout.visual")} /> : null}
          {visualPop.render(
            <div className={visualPop.detached ? "min-h-0 flex-1 overflow-auto bg-slate-950 p-3" : undefined}>
              <SonicVisualizer
                audioSrc={audioUrl(selectedRunId)}
                filename={selectedRunFilename}
                headerExtra={<DetachButton state={visualPop} label={t("analyser.popout.visual")} className={POPOUT_BUTTON} />}
              />
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-3">
          <Floatable id="analyser-session" title={t("analyser.session.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileAudio2 className="h-5 w-5 text-primary" /> {t("analyser.session.title")}
                  <FloatButton className="ml-auto" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.length) {
                      const file = e.dataTransfer.files[0];
                      console.log("[AudioQI Debug] File dropped. File:", file);
                      setSelectedFile(file);
                      void handleAutoUpload(file);
                    }
                  }}
                  className={`flex flex-col items-center justify-center border border-dashed rounded-2xl p-4 transition-colors ${
                    isDragging ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50"
                  }`}
                >
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <p className="text-xs text-center text-muted-foreground mb-2">
                    {selectedFile ? (
                      <span className="font-semibold text-foreground">{selectedFile.name}</span>
                    ) : (
                      t("analyser.session.dropHint")
                    )}
                  </p>
                  <input
                    type="file"
                    accept=".wav,.flac,.mp3,.aac,.ogg,.m4a,.aiff,.aif"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      console.log("[AudioQI Debug] File input changed. File:", file);
                      setSelectedFile(file);
                      if (file) {
                        void handleAutoUpload(file);
                      }
                    }}
                    className="hidden"
                    id="drag-drop-file-input"
                  />
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.currentTarget.ownerDocument ?? document).getElementById("drag-drop-file-input")?.click();
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    {t("analyser.session.browse")}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void onUpload()} disabled={!selectedFile || isBusy}>
                    {t("analyser.session.upload")}
                  </Button>
                  <Button variant="secondary" onClick={() => void onAnalyze()} disabled={!selectedRunId || isBusy}>
                    {t("analyser.session.analyze")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={openVisualizer}
                    disabled={!selectedRunId}
                    title={t("analyser.session.visualTitle")}
                  >
                    <Waves className="mr-2 h-4 w-4" />
                    {t("analyser.session.visual")}
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={useGpu}
                    onChange={(e) => setUseGpu(e.target.checked)}
                    className="h-4 w-4 rounded-[0.25rem] border-input"
                  />
                  <Cpu className="h-4 w-4" />
                  {t("analyser.session.useGpu")}
                </label>
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant={statusVariant[currentStatus] ?? "outline"}>{statusWord(t, currentStatus)}</Badge>
                    <span className="text-xs text-muted-foreground">{progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={progress} />
                  <p className="mt-2 text-xs font-semibold text-primary">{analysisTicker}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{analysisStageMeta}</p>
                  {analysisStageAgeSeconds !== null &&
                  (currentStatus === "running" || currentStatus === "queued") &&
                  analysisStageAgeSeconds > ANALYSIS_STALE_WARNING_SECONDS ? (
                    <p className="mt-1 text-xs text-amber-300">
                      {t("analyser.session.staleHeartbeat")}
                    </p>
                  ) : null}
                  {statusMessage && (
                    <p className={cn(
                      "mt-2 text-sm transition-colors duration-200",
                      /fail|error|not found|не удал|ошибк|не найден/i.test(statusMessage)
                        ? "text-red-400 font-semibold bg-red-950/20 border border-red-900/30 rounded-lg p-2"
                        : "text-muted-foreground"
                    )}>
                      {statusMessage}
                    </p>
                  )}
                </div>
                {selectedRunId ? (
                  <div className="text-sm">
                    <p className="font-semibold">{t("analyser.session.exports")}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-primary">
                      <a href={exportUrl(selectedRunId, "json")} target="_blank" rel="noreferrer">
                        JSON
                      </a>
                      <a href={exportUrl(selectedRunId, "html")} target="_blank" rel="noreferrer">
                        HTML
                      </a>
                      <a href={exportUrl(selectedRunId, "pdf")} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    </div>
                  </div>
                ) : null}
                {pendingSaveOutputs.length > 0 ? (
                  <Button variant="secondary" size="sm" onClick={() => setSaveDialogOpen(true)}>
                    {t("analyser.session.saveReady", { n: pendingSaveOutputs.length })}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-convert" title={t("analyser.convert.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">{t("analyser.convert.title")}<FloatButton className="ml-auto" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {t("analyser.convert.intro")}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {FORMAT_OPTIONS.map((fmt) => (
                    <label key={fmt} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(formatSelection[fmt])}
                        onChange={(e) =>
                          setFormatSelection((prev) => ({
                            ...prev,
                            [fmt]: e.target.checked
                          }))
                        }
                        className="h-4 w-4 rounded-[0.25rem] border-input"
                      />
                      {fmt.toUpperCase()}
                    </label>
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    MP3 kbps
                    <Input
                      type="number"
                      min={96}
                      max={320}
                      value={mp3BitrateKbps}
                      onChange={(e) => setMp3BitrateKbps(Number(e.target.value))}
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    AAC kbps
                    <Input
                      type="number"
                      min={96}
                      max={320}
                      value={aacBitrateKbps}
                      onChange={(e) => setAacBitrateKbps(Number(e.target.value))}
                    />
                  </label>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => void onConvert()}
                  disabled={!selectedRunId || isConverting || isBusy}
                >
                  {t("analyser.convert.convertSelected")}
                </Button>

                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant={conversionStatusVariant[conversionStatus] ?? "outline"}>
                      {statusWord(t, conversionStatus)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{conversionProgress.toFixed(1)}%</span>
                  </div>
                  <Progress value={conversionProgress} />
                  {conversionInfo?.error_message ? (
                    <p className="mt-2 text-xs text-red-300">{conversionInfo.error_message}</p>
                  ) : null}
                </div>

                {conversionFiles.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.convert.files")}</p>
                    <DataTable data={conversionFiles} columns={convertedColumns} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("analyser.convert.none")}</p>
                )}
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-mastering" title={t("analyser.mastering.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {t("analyser.mastering.title")}
                  <HelpLink section="ai-mastering" label={t("analyser.mastering.helpLabel")} className="ml-auto" />
                  <FloatButton />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("analyser.mastering.modesIntro")}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("analyser.mastering.preflightIntro")}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.mastering.suggested")}</p>
                    <Badge variant={canApplyAiMasteringAdvice ? "default" : "outline"}>
                      {canApplyAiMasteringAdvice ? recommendationConfidence : t("analyser.mastering.noAdvice")}
                    </Badge>
                  </div>
                  {canApplyAiMasteringAdvice ? (
                    <div className="space-y-2">
                      <p className="text-sm">
                        {t("analyser.mastering.mode")} <span className="font-semibold">{recommendedMode?.toUpperCase()}</span> |{" "}
                        {t("analyser.mastering.preset")}{" "}
                        <span className="font-semibold">{recommendedPreset}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("analyser.mastering.targetsLine", {
                          lufs: recommendedTargetLufs !== null ? recommendedTargetLufs.toFixed(1) : na,
                          tp: recommendedTruePeak !== null ? `${recommendedTruePeak.toFixed(1)} dBFS` : na,
                          variants: recommendedVariants ?? na,
                          backend: recommendedBackend ?? na,
                          refine: recommendedRefinePasses ?? na
                        })}
                        {recommendationIssueScore !== null
                          ? t("analyser.mastering.issueScore", { n: recommendationIssueScore.toFixed(0) })
                          : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("analyser.mastering.scorePolicy")}
                      </p>
                      {recommendationReasons.length > 0 ? (
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {recommendationReasons.slice(0, 4).map((reason, idx) => (
                            <li key={`${reason}-${idx}`}>{reason}</li>
                          ))}
                        </ul>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={onApplyAiMasteringAdvice}>
                        {t("analyser.mastering.apply")}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("analyser.mastering.analyzeFirst")}
                    </p>
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.mastering.settings")}</p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.mode")}</span>
                      <select
                        value={masterMode}
                        onChange={(e) => setMasterMode(e.target.value as (typeof MASTER_MODES)[number])}
                        className="w-full rounded-xl border border-input bg-input px-3 py-2 text-sm text-foreground"
                      >
                        {MASTER_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.preset")}</span>
                      <select
                        value={masterPreset}
                        onChange={(e) => setMasterPreset(e.target.value as (typeof MASTER_PRESETS)[number])}
                        className="w-full rounded-xl border border-input bg-input px-3 py-2 text-sm text-foreground"
                      >
                        {MASTER_PRESETS.map((preset) => (
                          <option key={preset} value={preset}>
                            {preset}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.normProfile")}</span>
                      <select
                        value={normalizationProfile}
                        onChange={(e) => applyNormalizationProfile(e.target.value as NormalizationProfileId)}
                        className="w-full rounded-xl border border-input bg-input px-3 py-2 text-sm text-foreground"
                      >
                        {NORMALIZATION_PROFILE_OPTIONS.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {t(`analyser.norm.${profile.id}.label`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.profileTargets")}</span>
                      <div className="rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-sm text-foreground">
                        {selectedNormalizationProfile.targetLufs !== null
                          ? t("analyser.mastering.profileTargetsValue", {
                              lufs: selectedNormalizationProfile.targetLufs.toFixed(1),
                              tp: selectedNormalizationProfile.truePeakDbfs?.toFixed(1) ?? na
                            })
                          : t("analyser.mastering.presetTargets")}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{t(`analyser.norm.${selectedNormalizationProfile.id}.help`)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.backend")}</span>
                      <select
                        value={masterBackend}
                        onChange={(e) => setMasterBackend(e.target.value as (typeof MASTER_BACKENDS)[number])}
                        className="w-full rounded-xl border border-input bg-input px-3 py-2 text-sm text-foreground"
                      >
                        {MASTER_BACKENDS.map((backend) => (
                          <option key={backend} value={backend}>
                            {backend}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.reference")}</span>
                      {/* Chosen by name: the run ID it needs is not something anyone can read off the page. */}
                      <select
                        value={masterReferenceRunId}
                        onChange={(e) => setMasterReferenceRunId(e.target.value)}
                        className="w-full rounded-xl border border-input bg-input px-3 py-2 text-sm text-foreground"
                        aria-label={t("analyser.mastering.referenceAria")}
                      >
                        <option value="">{t("analyser.mastering.none")}</option>
                        {runs
                          .filter((run) => run.id !== selectedRunId)
                          .map((run) => (
                            <option key={run.id} value={run.id}>
                              {run.filename} · {new Date(run.created_at).toLocaleDateString(locale)}
                            </option>
                          ))}
                        {masterReferenceRunId && !runs.some((run) => run.id === masterReferenceRunId) ? (
                          <option value={masterReferenceRunId}>{t("analyser.mastering.runShort", { id: masterReferenceRunId.slice(0, 8) })}</option>
                        ) : null}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.targetLufs")}</span>
                      <Input
                        type="number"
                        step={0.1}
                        min={-30}
                        max={-6}
                        value={masterTargetLufsInput}
                        onChange={(e) => setMasterTargetLufsInput(e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.truePeak")}</span>
                      <Input
                        type="number"
                        step={0.1}
                        min={-6}
                        max={0}
                        value={masterTruePeakDbfsInput}
                        onChange={(e) => setMasterTruePeakDbfsInput(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.inputGain")}</span>
                      <Input
                        type="number"
                        step={0.5}
                        min={-12}
                        max={12}
                        value={masterInputGainDbInput}
                        onChange={(e) => setMasterInputGainDbInput(e.target.value)}
                      />
                    </label>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.gainStaging")}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-sm text-foreground">
                          {masterInputGainSummary}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setMasterInputGainDbInput("0")}
                          disabled={masterInputGainDb === 0}
                        >
                          {t("analyser.mastering.reset")}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.bassMono")}</span>
                      <select
                        value={masterBassMonoHz}
                        onChange={(e) => setMasterBassMonoHz(e.target.value)}
                        className="w-full rounded-xl border border-input bg-input px-3 py-2 text-sm text-foreground"
                      >
                        {BASS_MONO_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.value === ""
                              ? t("analyser.bassMono.presetDefault")
                              : option.value === "0"
                                ? t("analyser.bassMono.off")
                                : `${option.value} Hz`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.stereoWidth")}</span>
                      <Input
                        type="number"
                        step={0.05}
                        min={0.5}
                        max={1.5}
                        placeholder={t("analyser.mastering.widthPlaceholder")}
                        value={masterStereoWidthInput}
                        onChange={(e) => setMasterStereoWidthInput(e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.variants")}</span>
                      <Input
                        type="number"
                        min={2}
                        max={8}
                        value={optimizerVariants}
                        disabled={masterMode !== "v2"}
                        onChange={(e) => setOptimizerVariants(Number(e.target.value))}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("analyser.mastering.refinePasses")}</span>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={maxRefinePasses}
                        onChange={(e) => setMaxRefinePasses(Number(e.target.value))}
                      />
                    </label>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {t("analyser.mastering.backendNotes")}
                  </p>
                </div>

                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void onMaster()}
                  disabled={!selectedRunId || isMastering || isBusy}
                >
                  {t("analyser.mastering.run")}
                </Button>

                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant={masteringStatusVariant[masteringStatus] ?? "outline"}>
                      {statusWord(t, masteringStatus)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{masteringProgress.toFixed(1)}%</span>
                  </div>
                  <Progress value={masteringProgress} />
                  <p className="mt-2 text-xs font-semibold text-primary">
                    {masteringDetail || `${stageLabel(masteringStage, t)}.`}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">{t("analyser.mastering.bestOutput", { id: bestMasterId })}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("analyser.mastering.backendSelected", { backend: backendSelected })}
                  </p>
                  {bestOutputHash ? (
                    <p className="mt-1 text-[11px] text-muted-foreground" title={bestOutputHash}>
                      {t("analyser.mastering.outputHash", { hash: bestOutputHash.slice(0, 12) })}
                    </p>
                  ) : null}
                  {masteringInfo?.error_message ? (
                    <p className="mt-2 text-xs text-red-300">{masteringInfo.error_message}</p>
                  ) : null}
                  {(refineAcceptedPasses !== null || refineFinalScore !== null) ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.refinement", {
                        accepted: refineAcceptedPasses !== null ? refineAcceptedPasses.toFixed(0) : "0",
                        max: refineMaxPasses !== null ? refineMaxPasses.toFixed(0) : "?"
                      })}
                      {refineFinalScore !== null ? t("analyser.mastering.finalScore", { n: refineFinalScore.toFixed(0) }) : ""}
                      {refineRollbackCount !== null ? t("analyser.mastering.rollbacks", { n: refineRollbackCount.toFixed(0) }) : ""}
                      {refineFallbackApplied ? t("analyser.mastering.stemFallback") : ""}
                      {refineNonRegressionApplied
                        ? t("analyser.mastering.nonRegression", {
                            reason: refineNonRegressionReason || t("analyser.mastering.applied")
                          })
                        : ""}
                    </p>
                  ) : null}
                  {proFeatureEntries.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.proModules")}{" "}
                      {proFeatureEntries
                        .map(([key, value]) => `${key}:${value ? t("analyser.yes") : t("analyser.no")}`)
                        .join(" | ")}
                    </p>
                  ) : null}
                </div>

                {Object.keys(adaptationInfo).length > 0 ? (
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.mastering.adaptationTitle")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.sourceScore", {
                        n: adaptationSourceIssueScore !== null ? adaptationSourceIssueScore.toFixed(0) : na
                      })}
                      {adaptationAdjustmentCount !== null
                        ? t("analyser.mastering.adjustments", { n: adaptationAdjustmentCount.toFixed(0) })
                        : ""}
                    </p>
                    {adaptationAdjustments.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {adaptationAdjustments.slice(0, 6).map((row) => (
                          <p key={`${row.field}-${row.reason}`} className="text-xs text-muted-foreground">
                            {row.field}: {row.before !== null ? row.before.toFixed(2) : na} {"->"} {row.after !== null ? row.after.toFixed(2) : na} | {row.reason}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("analyser.mastering.noChanges")}
                      </p>
                    )}
                  </div>
                ) : null}

                {Object.keys(masteringSelfCheck).length > 0 ? (
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.mastering.selfCheckTitle")}</p>
                    <p className="mt-1 text-sm">
                      {t("analyser.mastering.assessment")} <span className="font-semibold">{selfCheckAssessment}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.issueScoreLabel")}{" "}
                      {selfCheckScoreBefore !== null ? selfCheckScoreBefore.toFixed(0) : na} {"->"}{" "}
                      {selfCheckScoreAfter !== null ? selfCheckScoreAfter.toFixed(0) : na}
                      {selfCheckScoreDelta !== null
                        ? ` (${selfCheckScoreDelta > 0 ? "+" : ""}${selfCheckScoreDelta.toFixed(0)})`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.appliedSettings", {
                        name: text(appliedSettings.name, masterPreset),
                        target: appliedTargetLufs !== null ? `${appliedTargetLufs.toFixed(1)} LUFS` : na,
                        tp: appliedTargetTruePeak !== null ? `${appliedTargetTruePeak.toFixed(1)} dBFS` : na,
                        norm: appliedNormalizationProfile,
                        gain:
                          appliedInputGainDb !== null
                            ? `${appliedInputGainDb > 0 ? "+" : ""}${appliedInputGainDb.toFixed(1)} dB`
                            : "0.0 dB"
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.stereoStage", {
                        bass:
                          appliedBassMonoHz !== null
                            ? appliedBassMonoHz > 0
                              ? `${appliedBassMonoHz.toFixed(0)} Hz`
                              : t("analyser.mastering.off")
                            : na,
                        width: appliedStereoWidth !== null ? appliedStereoWidth.toFixed(2) : na
                      })}
                    </p>
                    {inputGainNotes.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
                        {inputGainNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.aiMatch", {
                        mode: yesNo(aiModeMatch),
                        preset: yesNo(aiPresetMatch),
                        target: yesNo(aiTargetLufsMatch),
                        tp: yesNo(aiTruePeakMatch)
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.mastering.compliance", {
                        result: selfCheckCompliancePassed ? t("analyser.mastering.pass") : t("analyser.mastering.reviewRequired")
                      })}
                      {selfCheckComplianceLufsDelta !== null
                        ? t("analyser.mastering.lufsDelta", { n: signed(selfCheckComplianceLufsDelta) })
                        : ""}
                      {selfCheckComplianceTruePeakDelta !== null
                        ? t("analyser.mastering.tpDelta", { n: signed(selfCheckComplianceTruePeakDelta) })
                        : ""}
                      {selfCheckComplianceCrestDelta !== null
                        ? t("analyser.mastering.crestDelta", { n: signed(selfCheckComplianceCrestDelta) })
                        : ""}
                    </p>
                    {selfCheckComplianceFailed.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-300">
                        {t("analyser.mastering.complianceIssues", { list: selfCheckComplianceFailed.join(", ") })}
                      </p>
                    ) : null}
                    {postCheckRepairAttempted ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("analyser.mastering.rescue", {
                          state: postCheckRepairApplied ? t("analyser.mastering.applied") : t("analyser.mastering.rescueAttempted")
                        })}
                        {postCheckRepairRound !== null && postCheckRepairRound > 0
                          ? t("analyser.mastering.round", { n: postCheckRepairRound.toFixed(0) })
                          : ""}
                      </p>
                    ) : null}
                    {selfCheckResolved.length > 0 ? (
                      <p className="mt-2 text-xs text-emerald-300">
                        {t("analyser.mastering.resolved", { list: selfCheckResolved.join(", ") })}
                      </p>
                    ) : null}
                    {selfCheckRemaining.length > 0 ? (
                      <p className="mt-1 text-xs text-amber-300">
                        {t("analyser.mastering.remaining", { list: selfCheckRemaining.join(", ") })}
                      </p>
                    ) : null}
                    {selfCheckWorsened.length > 0 ? (
                      <p className="mt-1 text-xs text-red-300">
                        {t("analyser.mastering.worsened", { list: selfCheckWorsened.join(", ") })}
                      </p>
                    ) : null}
                    {selfCheckRecommendedFixes.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {selfCheckRecommendedFixes.slice(0, 4).map((row) => (
                          <p key={`${row.issue}-${row.action}`} className="text-xs text-muted-foreground">
                            {row.issue}: {row.action}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {masteringOutputs.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.mastering.outputs")}</p>
                    <DataTable data={masteringOutputs} columns={masteredColumns} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("analyser.mastering.noOutputs")}</p>
                )}
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-history" title={t("analyser.history.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">{t("analyser.history.title")}<FloatButton className="ml-auto" /></CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={runs}
                  columns={runColumns}
                  onRowClick={(row) => setSelectedRunId(row.id)}
                  rowClassName={(row) => (row.id === selectedRunId ? "bg-secondary/75" : "")}
                />
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-playback" title={t("analyser.playback.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Waves className="h-5 w-5 text-primary" /> {t("analyser.playback.title")}
                  <FloatButton className="ml-auto" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <audio
                  ref={audioRef}
                  controls
                  crossOrigin="anonymous"
                  preload="metadata"
                  playsInline
                  className="w-full rounded-lg"
                  src={selectedRunId ? audioUrl(selectedRunId) : undefined}
                  onLoadedMetadata={(e) => {
                    const loadedDuration = (e.target as HTMLAudioElement).duration;
                    if (Number.isFinite(loadedDuration) && loadedDuration > 0) {
                      setDuration(loadedDuration);
                      // Initialize full-track selection as soon as audio metadata is available.
                      if (selectedRunId && initializedSelectionRunRef.current !== selectedRunId) {
                        setSelectionStart(0);
                        setSelectionEnd(loadedDuration);
                        initializedSelectionRunRef.current = selectedRunId;
                        setScrubTime(0);
                        if (audioRef.current) {
                          audioRef.current.currentTime = 0;
                        }
                      }
                    }
                  }}
                  onTimeUpdate={(e) => {
                    const time = (e.target as HTMLAudioElement).currentTime;
                    if (isLoopSelection && time >= selectionEnd - 0.02) {
                      (e.target as HTMLAudioElement).currentTime = selectionStart;
                      scrubTimeRef.current = selectionStart;
                      setScrubTime(selectionStart);
                      return;
                    }
                    if (Math.abs(time - scrubTimeRef.current) < 0.025) {
                      return;
                    }
                    scrubTimeRef.current = time;
                    setScrubTime(time);
                  }}
                  onPlay={handleAudioPlay}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onError={() => setStatusMessage(t("analyser.msg.audioLoadFailed"))}
                />
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.playback.playhead")}</p>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={scrubTime}
                    onChange={(e) => {
                      const time = Number(e.target.value);
                      setScrubTime(time);
                      if (audioRef.current) {
                        audioRef.current.currentTime = time;
                      }
                    }}
                    className="mt-2 w-full accent-[hsl(var(--primary))]"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {scrubTime.toFixed(2)}s / {duration.toFixed(2)}s
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("analyser.playback.rate", { rate: playbackRate.toFixed(2) })}</span>
                    <span>|</span>
                    <span>{isLoopSelection ? t("analyser.playback.loopOn") : t("analyser.playback.loopOff")}</span>
                    <span>|</span>
                    <span>{eqEnabled ? t("analyser.playback.eqOn") : t("analyser.playback.eqOff")}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.playback.segment")}</p>
                    <Button size="sm" variant="ghost" onClick={() => applySelectionRange(0, duration)}>
                      {t("analyser.playback.fullTrack")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("analyser.playback.segmentLine", {
                      start: selectionStart.toFixed(2),
                      end: selectionEnd.toFixed(2),
                      length: selectedSegmentLength.toFixed(2)
                    })}
                  </p>
                  <label className="mt-3 block text-xs text-muted-foreground">
                    {t("analyser.playback.leftMarker")}
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.01}
                      value={selectionStart}
                      onChange={(e) => applySelectionRange(Number(e.target.value), selectionEnd)}
                      className="mt-1 w-full accent-[hsl(var(--primary))]"
                    />
                  </label>
                  <label className="mt-3 block text-xs text-muted-foreground">
                    {t("analyser.playback.rightMarker")}
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      step={0.01}
                      value={selectionEnd}
                      onChange={(e) => applySelectionRange(selectionStart, Number(e.target.value))}
                      className="mt-1 w-full accent-[hsl(var(--accent))]"
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.playback.markers")}</p>
                  {allMarkers.length > 0 ? (
                    <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                      {allMarkers.map((marker, idx) => (
                        <button
                          key={`${marker.type}-${marker.start_seconds}-${idx}`}
                          onClick={() => zoomToMarker(marker)}
                          className="rounded-full border border-border/70 bg-card px-2 py-1 text-[11px] text-foreground transition hover:border-primary/70"
                          title={marker.message ?? marker.type}
                        >
                          {marker.type} @ {marker.start_seconds.toFixed(2)}s
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{t("analyser.playback.noMarkers")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </Floatable>
        </div>

        <div className="space-y-4 lg:col-span-9">
          <Floatable id="analyser-summary" title={t("detach.titles.summary")} corner>
            <section className="grid gap-3 xl:grid-cols-4">
              <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("analyser.tiles.activeRun")}
                </p>
                <p className="mt-2 truncate display-font text-lg font-semibold text-foreground">
                  {selectedRunFilename}
                </p>
                {selectedRunId ? (
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate font-mono" title={selectedRunId}>
                      {t("analyser.tiles.runId", { id: selectedRunId })}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 hover:bg-white/10 hover:text-foreground"
                      title={t("analyser.tiles.copyRunId")}
                      aria-label={t("analyser.tiles.copyRunId")}
                      onClick={() => {
                        void navigator.clipboard?.writeText(selectedRunId).then(() => {
                          setRunIdCopied(true);
                          window.setTimeout(() => setRunIdCopied(false), 1500);
                        });
                      }}
                    >
                      {runIdCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">{t("analyser.tiles.uploadToCreate")}</p>
                )}
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("analyser.tiles.analysisState")}
                </p>
                <p className="mt-2 display-font text-lg font-semibold text-foreground">
                  {stageLabel(analysisStage, t)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{analysisTicker}</p>
                <p className="mt-2 text-xs text-primary">{t("analyser.tiles.complete", { pct: progress.toFixed(1) })}</p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("analyser.tiles.reviewAssets")}
                </p>
                <p className="mt-2 display-font text-lg font-semibold text-foreground">
                  {t("analyser.tiles.chartsLoaded", {
                    loaded: loadedChartNames.length,
                    total: availableChartNames.length || ALL_CHARTS.length
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("analyser.tiles.markersLine", { markers: allMarkers.length, attention: highlightedMarkerCount })}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("analyser.tiles.selectionWindow", { length: selectedSegmentLength.toFixed(2) })}
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("analyser.tiles.strategy")}
                </p>
                <p className="mt-2 display-font text-lg font-semibold text-foreground">
                  {masteringRecommendationSummary}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("analyser.tiles.backendProfile", { backend: masterBackend, profile: normalizationProfile })}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {masteringOutputs.length > 0
                    ? tp("analyser.tiles.masteredReady", masteringOutputs.length)
                    : t("analyser.tiles.noMastered")}
                </p>
              </div>
            </section>
          </Floatable>

          <Floatable id="analyser-overview" title={t("analyser.overview.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">{t("analyser.overview.title")}<FloatButton className="ml-auto" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                    <AudioReviewStrip
                      figure={charts.waveform as Record<string, unknown> | undefined}
                      duration={duration}
                      selectionStart={selectionStart}
                      selectionEnd={selectionEnd}
                      scrubTime={scrubTime}
                      markers={allMarkers}
                      onScrub={scrubToTime}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void togglePlayback()} disabled={!selectedRunId}>
                        {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                        {isPlaying ? t("analyser.overview.pause") : t("analyser.overview.play")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => seekBySeconds(-5)} disabled={!selectedRunId}>
                        <SkipBack className="mr-2 h-4 w-4" />
                        -5s
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => seekBySeconds(5)} disabled={!selectedRunId}>
                        <SkipForward className="mr-2 h-4 w-4" />
                        +5s
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => scrubToTime(selectionStart)} disabled={!selectedRunId}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t("analyser.overview.selectionStart")}
                      </Button>
                      <Button
                        size="sm"
                        variant={isLoopSelection ? "default" : "ghost"}
                        onClick={() => setIsLoopSelection((value) => !value)}
                        disabled={!selectedRunId}
                      >
                        <Repeat className="mr-2 h-4 w-4" />
                        {t("analyser.overview.loopSelection")}
                      </Button>
                      <label className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-sm text-foreground">
                        {t("analyser.overview.speed")}
                        <select
                          value={playbackRate}
                          onChange={(event) => setPlaybackRate(Number(event.target.value))}
                          className="bg-transparent text-sm text-foreground outline-hidden"
                        >
                          {[0.75, 1, 1.25, 1.5].map((rate) => (
                            <option key={rate} value={rate} className="bg-slate-950 text-foreground">
                              {rate.toFixed(2)}x
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button size="sm" variant="ghost" onClick={markSelectionStartAtScrub} disabled={!selectedRunId}>
                        {t("analyser.overview.setStart", { time: scrubTime.toFixed(2) })}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={markSelectionEndAtScrub} disabled={!selectedRunId}>
                        {t("analyser.overview.setEnd", { time: scrubTime.toFixed(2) })}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={resetReviewSelection} disabled={!selectedRunId}>
                        {t("analyser.overview.resetRange")}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("analyser.overview.readiness")}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                        <p className="text-xs text-muted-foreground">{t("analyser.overview.loudness")}</p>
                        <p className="mt-1 text-base font-semibold">{loudnessReadiness}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("analyser.overview.loudnessLine", {
                            lufs: integratedLufs.toFixed(2),
                            target: loudnessTargetForReadiness.toFixed(1)
                          })}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                        <p className="text-xs text-muted-foreground">{t("analyser.overview.truePeak")}</p>
                        <p className="mt-1 text-base font-semibold">{peakReadiness}</p>
                        <p className="text-xs text-muted-foreground">{t("analyser.overview.peakLine", { tp: truePeakDbfs.toFixed(2) })}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                        <p className="text-xs text-muted-foreground">{t("analyser.overview.markerLoad")}</p>
                        <p className="mt-1 text-base font-semibold">{markerReadiness}</p>
                        <p className="text-xs text-muted-foreground">{tp("analyser.overview.markerLine", highlightedMarkerCount)}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                        <p className="text-xs text-muted-foreground">{t("analyser.overview.dynamics")}</p>
                        <p className="mt-1 text-base font-semibold">{dynamicsReadiness}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("analyser.overview.dynamicsLine", { crest: crestFactorDb.toFixed(2), lra: loudnessRangeLu.toFixed(1) })}
                          {loudnessRangeLu < 3 ? t("analyser.overview.flatSections") : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                      <SlidersHorizontal className="h-4 w-4 text-primary" />
                      {t("analyser.overview.manualEq")}
                      {eqEnabled ? (
                        <Badge variant="default">{t("analyser.overview.live")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("analyser.overview.bypass")}</Badge>
                      )}
                    </div>
                    <EqualizerPanel
                      enabled={eqEnabled}
                      bands={[...EQ_BANDS]}
                      gains={eqGains}
                      exporting={isEqExporting}
                      onToggle={(enabled) => {
                        setEqEnabled(enabled);
                          if (enabled) {
                            void ensurePlaybackGraph(true);
                          } else {
                            applyEqGains(eqFiltersRef.current, eqGains, false);
                          }
                      }}
                      onGainChange={(index, gain) => {
                        setEqGains((current) => current.map((value, itemIndex) => (itemIndex === index ? gain : value)));
                      }}
                      onReset={() => setEqGains([...DEFAULT_EQ_GAINS])}
                      onExport={() => void exportEqWav()}
                    />
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Download className="h-3.5 w-3.5" />
                      {t("analyser.overview.eqExportNote")}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("analyser.overview.guidanceTitle")}</p>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <p>{t("analyser.overview.guidance1")}</p>
                      <p>{t("analyser.overview.guidance2")}</p>
                      <p>{t("analyser.overview.guidance3")}</p>
                      <p>{t("analyser.overview.guidance4")}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-file" title={t("analyser.file.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {t("analyser.file.title")}
                  <span
                    title={t("analyser.file.titleHelp")}
                    className="inline-flex cursor-help rounded-full bg-secondary/80 p-1 text-muted-foreground"
                  >
                    <CircleHelp className="h-4 w-4" />
                  </span>
                  <FloatButton className="ml-auto" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title={t("analyser.file.formatHelp")}>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.formatCodec")}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {text(metadata.format, na)} / {text(metadata.codec, na)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.file.compression")} <span className="font-medium">{compressionType}</span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title={t("analyser.file.freqHelp")}>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.freqRange")}</p>
                    <p className="mt-1 text-sm font-semibold">{hzRange(theoLowHz, theoHighHz)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.file.estimatedContent")}{" "}
                      {estLowHz !== null && estHighHz !== null ? hzRange(estLowHz, estHighHz) : na}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title={t("analyser.file.dynHelp")}>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.dynSnapshot")}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {t("analyser.file.crest", { n: metricNumber(metrics, ["dynamics", "crest_factor_db"], 0).toFixed(2) })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.file.lra", { n: loudnessRangeLu.toFixed(2) })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title={t("analyser.file.signalHelp")}>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.signal")}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {t("analyser.file.channels", {
                        rate: num(metadata.sample_rate, metricNumber(metrics, ["technical", "sample_rate"], 0)).toLocaleString(locale),
                        ch: num(metadata.channels, metricNumber(metrics, ["technical", "channels"], 0))
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {bitrateKbps > 0 ? t("analyser.file.kbps", { n: bitrateKbps.toFixed(0) }) : t("analyser.file.bitrateNa")} |{" "}
                      {bitDepthLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title={t("analyser.file.lossHelp")}>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.lossEstimate")}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {/* Runs analysed before the audible-band fix carry only the old Nyquist-based figure. */}
                      {lossPct !== null && lossHz !== null ? hz(lossHz) : na}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {lossPct !== null
                        ? t("analyser.file.lossOfBand", {
                            pct: lossPct.toFixed(1),
                            band: lossReferenceHz !== null ? hz(lossReferenceHz) : t("analyser.file.audible")
                          })
                        : na}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title={t("analyser.file.rangeHelp")}>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.rangeDetail")}</p>
                    <p className="mt-1 text-sm font-semibold">
                      {t("analyser.file.peakToNoise", { value: dynamicSpan !== null ? `${dynamicSpan.toFixed(2)} dB` : na })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("analyser.file.peakToLufs", { value: peakToLoudness !== null ? `${peakToLoudness.toFixed(2)} dB` : na })}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.compressionAssessment")}</p>
                  <p className="mt-1 text-sm text-foreground">{text(compression.assessment, t("analyser.file.noAssessment"))}</p>
                </div>

                {unavailableHints.length > 0 ? (
                  <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.whyNa")}</p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {unavailableHints.map((hint, idx) => (
                        <li key={`${hint}-${idx}`}>{hint}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t("analyser.file.metadataTags")}</p>
                  {suppressedTagCount > 0 ? (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {tp("analyser.file.hiddenTags", suppressedTagCount)}
                      {suppressedTagKeys.length > 0
                        ? ` (${suppressedTagKeys.slice(0, 3).join(", ")}${suppressedTagKeys.length > 3 ? ", ..." : ""})`
                        : ""}
                      .
                    </p>
                  ) : null}
                  {tagEntries.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tagEntries.map(([key, value]) => (
                        <div key={key} className="rounded-lg bg-secondary/45 p-2">
                          <p className="text-[11px] font-semibold uppercase text-muted-foreground">{key}</p>
                          <p className="text-sm">{text(value, na)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("analyser.file.noTags")}</p>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">{t("analyser.file.rawJson")}</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900/95 p-3 text-xs text-slate-100">
                      {JSON.stringify(metadata, null, 2)}
                    </pre>
                  </details>
                </div>

                <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold uppercase text-primary">
                      {t("analyser.guide.title")}
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("analyser.guide.intro")}
                    </p>

                    <div className="mt-3 overflow-x-auto rounded-lg border border-border/70">
                      <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">{t("analyser.guide.element")}</th>
                            <th className="px-3 py-2">{t("analyser.guide.whatItTells")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ELEMENT_GUIDE_ROWS.map((row) => (
                            <tr key={row} className="border-t border-border/60">
                              <td className="px-3 py-2 font-medium text-foreground">{t(`analyser.guide.rows.${row}.element`)}</td>
                              <td className="px-3 py-2 text-muted-foreground">{t(`analyser.guide.rows.${row}.meaning`)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 overflow-x-auto rounded-lg border border-border/70">
                      <table className="w-full min-w-[700px] text-left text-sm">
                        <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">{t("analyser.guide.graph")}</th>
                            <th className="px-3 py-2">{t("analyser.guide.howToRead")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ALL_CHARTS.map((chart) => (
                            <tr key={chart.key} className="border-t border-border/60">
                              <td className="px-3 py-2 font-medium text-foreground">{chartTitle(t, chart.key)}</td>
                              <td className="px-3 py-2 text-muted-foreground">{chartHelp(t, chart.key)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-loudness" title={t("detach.titles.loudness")} corner>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div title={t("analyser.kpi.integratedHelp")}>
                <KpiTile
                  label={t("analyser.kpi.integrated")}
                  value={`${integratedLufs.toFixed(2)}`}
                />
              </div>
              <div title={t("analyser.kpi.truePeakHelp")}>
                <KpiTile
                  label={t("analyser.kpi.truePeak")}
                  value={`${truePeakDbfs.toFixed(2)}`}
                />
              </div>
              <div title={t("analyser.kpi.crestHelp")}>
                <KpiTile
                  label={t("analyser.kpi.crest")}
                  value={`${crestFactorDb.toFixed(2)}`}
                />
              </div>
              <div title={t("analyser.kpi.noiseHelp")}>
                <KpiTile
                  label={t("analyser.kpi.noise")}
                  value={noiseFloorDbfs !== null ? noiseFloorDbfs.toFixed(2) : na}
                  hint={
                    noiseFloorDbfs !== null
                      ? undefined
                      : noiseFloorStatus === "stale"
                        ? t("analyser.kpi.reanalyze")
                        : noiseFloorStatus === "digital_silence"
                          ? t("analyser.kpi.digitalSilence")
                          : t("analyser.kpi.masked")
                  }
                />
              </div>
            </div>
          </Floatable>

          <Floatable id="analyser-recs" title={t("analyser.recs.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">{t("analyser.recs.title")}<FloatButton className="ml-auto" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {masteringRecommendations.length > 0 ? (
                  <div className="space-y-2">
                    {masteringRecommendations.map((rec, idx) => (
                      <div key={`${rec.issue}-${idx}`} className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant={markerSeverityVariant[rec.priority.toLowerCase()] ?? "outline"}>
                            {severityWord(t, rec.priority.toLowerCase())}
                          </Badge>
                          <p className="text-sm font-semibold">{rec.issue}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.action}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("analyser.recs.none")}</p>
                )}
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-markers" title={t("analyser.markers.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">{t("analyser.markers.title")}<FloatButton className="ml-auto" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {warnings.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {warnings.map((warning, idx) => (
                      <span
                        key={`${warning}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-300"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {warning}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {t("analyser.markers.hint")}
                </p>
                <DataTable
                  data={markerRows}
                  columns={markerColumns}
                  onRowClick={(marker) => zoomToMarker(marker)}
                  rowClassName={(marker) =>
                    selectionStart <= marker.end_seconds && selectionEnd >= marker.start_seconds
                      ? "bg-secondary/80"
                      : ""
                  }
                />
              </CardContent>
            </Card>
          </Floatable>

          <Floatable id="analyser-chart-studio" title={t("analyser.chartStudio.title")}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">{t("analyser.chartStudio.title")}<FloatButton className="ml-auto" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {CHART_GROUPS.map((group) => {
                    const active = group.id === activeChartGroup;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveChartGroup(group.id)}
                        className={
                          active
                            ? "rounded-full border border-primary/60 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
                            : "rounded-full border border-border/70 bg-secondary/45 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                        }
                      >
                        {t(`analyser.groups.${group.id}.label`)}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.chartStudio.viewFocus")}</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{t(`analyser.groups.${activeChartGroupConfig.id}.label`)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t(`analyser.groups.${activeChartGroupConfig.id}.description`)}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {tp("analyser.chartStudio.showing", visibleCharts.length)}{" "}
                      {t("analyser.chartStudio.loadedOf", {
                        loaded: loadedChartNames.length,
                        total: availableChartNames.length || ALL_CHARTS.length
                      })}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("analyser.chartStudio.quickJump")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {visibleCharts.map((chart) => (
                        <button
                          key={chart.key}
                          type="button"
                          onClick={() => scrollToChart(chart.key)}
                          className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-foreground transition hover:border-primary/50 hover:text-primary"
                        >
                          {chartTitle(t, chart.key)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Floatable>

          {chartsPop.detached ? <DetachedPlaceholder state={chartsPop} label={t("analyser.popout.charts")} /> : null}
          {chartsPop.render(
          <div className={chartsPop.detached ? "min-h-0 flex-1 space-y-4 overflow-auto p-4" : "space-y-4"}>
          <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex-1">{t("analyser.chartStudio.timelineTip")}</span>
            <DetachButton state={chartsPop} label={t("analyser.popout.charts")} />
          </div>

          <div
            ref={chartsTimelineRef}
            onMouseDownCapture={handleChartsMouseDown}
            onPointerDownCapture={handleChartsPointerDown}
            onContextMenuCapture={(event) => event.preventDefault()}
            className="space-y-5 select-none"
          >
            {visibleCharts.map((chart) => (
              <div key={chart.key} id={`chart-${chart.key}`} className="scroll-mt-24">
                <PlotPanel
                  title={chartTitle(t, chart.key)}
                  height={chart.height}
                  helpText={chartHelp(t, chart.key)}
                  figure={charts[chart.key] as Record<string, unknown>}
                  xRange={
                    TIME_SELECTION_CHART_KEYS.has(chart.key)
                      ? [selectionStart, selectionEnd]
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
          </div>
          )}
        </div>
      </div>

      {saveDialogOpen && pendingSaveOutputs.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-border/80 bg-card/95 p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{t("analyser.saveDialog.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("analyser.saveDialog.intro")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSaveDialogOpen(false)}>
                {t("analyser.saveDialog.later")}
              </Button>
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {pendingSaveOutputs.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/45 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.source === "conversion" ? t("analyser.saveDialog.conversion") : t("analyser.saveDialog.mastering")} | {item.detail}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void savePendingOutput(item)}
                      disabled={savingOutputId === item.id}
                    >
                      {savingOutputId === item.id ? t("analyser.saveDialog.saving") : t("analyser.saveDialog.saveAs")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => triggerBrowserDownload(item.url, item.filename)}
                    >
                      {t("analyser.saveDialog.quickDownload")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPendingSaveOutputs((prev) => prev.filter((row) => row.id !== item.id))
                      }
                    >
                      {t("analyser.saveDialog.dismiss")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <footer className="mt-12 border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        <p>{t("analyser.footer.rights", { year: new Date().getFullYear() })}</p>
        <p className="mt-1 text-[11px] opacity-75">{t("analyser.footer.version")}</p>
      </footer>
    </main>
  );
}
