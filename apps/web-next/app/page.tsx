"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CircleHelp,
  Cpu,
  Download,
  FileAudio2,
  Network,
  Pause,
  Play,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
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

const ALL_CHARTS: Array<{ key: string; title: string; height: number }> = [
  { key: "waveform", title: "Waveform + Envelope", height: 680 },
  { key: "loudness", title: "Loudness Timeline", height: 620 },
  { key: "spectrum", title: "Average Spectrum", height: 620 },
  { key: "stereo", title: "Stereo Correlation + M/S", height: 620 },
  { key: "correlation_meter", title: "Correlation Meter", height: 620 },
  { key: "ms_view", title: "Mid/Side View", height: 620 },
  { key: "vectorscope", title: "Vectorscope / Goniometer", height: 680 },
  { key: "spectrogram_stft_linear", title: "STFT Spectrogram (Linear)", height: 760 },
  { key: "spectrogram_stft_log", title: "STFT Spectrogram (Log)", height: 760 },
  { key: "spectrogram_mel", title: "Mel Spectrogram", height: 760 },
  { key: "spectrogram_cqt", title: "CQT Spectrogram", height: 760 }
];

type ChartKey = (typeof ALL_CHARTS)[number]["key"];

const CHART_GROUPS: Array<{
  id: "all" | "mix" | "stereo" | "spectral";
  label: string;
  description: string;
  keys: ChartKey[];
}> = [
  {
    id: "all",
    label: "All Views",
    description: "Complete analysis surface for technical review.",
    keys: ALL_CHARTS.map((chart) => chart.key)
  },
  {
    id: "mix",
    label: "Mix Review",
    description: "Waveform, loudness, tonal balance, and issue markers.",
    keys: ["waveform", "loudness", "spectrum", "stereo", "correlation_meter", "ms_view", "vectorscope"]
  },
  {
    id: "stereo",
    label: "Stereo Focus",
    description: "Width, mono compatibility, and spatial balance.",
    keys: ["stereo", "correlation_meter", "ms_view", "vectorscope"]
  },
  {
    id: "spectral",
    label: "Spectral",
    description: "Detailed time-frequency inspection across STFT, mel, and CQT views.",
    keys: ["spectrogram_stft_linear", "spectrogram_stft_log", "spectrogram_mel", "spectrogram_cqt"]
  }
];

type ChartGroupId = (typeof CHART_GROUPS)[number]["id"];
const EQ_BANDS = [
  20, 32, 50, 64, 80, 125, 160, 250, 315, 500,
  630, 1000, 1250, 2000, 2500, 4000, 5000, 8000, 12000, 16000
] as const;
const DEFAULT_EQ_GAINS = EQ_BANDS.map(() => 0);

const CHART_HELP: Record<string, string> = {
  waveform:
    "Shows amplitude over time plus peak/RMS envelopes. Use it to spot transients, dense limiting, and envelope shape.",
  loudness:
    "Momentary and short-term LUFS over time. Look for consistency and dips/spikes against your target delivery level.",
  spectrum:
    "Average frequency balance. Useful for tonal tilt checks and identifying too much sub, harshness, or missing air.",
  stereo:
    "Correlation and Mid/Side ratio together. Negative correlation warns of mono compatibility issues.",
  correlation_meter:
    "Correlation from -1 to +1. Values near +1 are mono-compatible; values below 0 can collapse in mono.",
  ms_view:
    "Mid/Side ratio and L-R balance trends. Helps detect width imbalance or side-heavy passages.",
  vectorscope:
    "Stereo image scatter of Left vs Right. Vertical tendency is mono-ish; wide cloud indicates broader stereo spread.",
  spectrogram_stft_linear:
    "Time-frequency energy with linear frequency axis. Good for detailed technical inspection of full spectrum content.",
  spectrogram_stft_log:
    "STFT on logarithmic frequency scale. Easier to read musically, especially low-frequency structure.",
  spectrogram_mel:
    "Perceptually-weighted spectrogram aligned to how hearing groups frequency bands.",
  spectrogram_cqt:
    "Constant-Q spectrogram with musical spacing across octaves, useful for pitch/harmonic structure."
};

const ELEMENT_GUIDE_ROWS: Array<{ element: string; meaning: string }> = [
  {
    element: "Compression Loss % of Nyquist",
    meaning:
      "Estimated high-frequency loss as a percentage of Nyquist (sample-rate/2). Higher values can indicate stronger top-end roll-off."
  },
  {
    element: "Range Detail | Peak to Noise",
    meaning:
      "Difference between peak level and estimated noise floor. Larger values usually indicate cleaner dynamic span."
  },
  {
    element: "Range Detail | Peak to LUFS",
    meaning:
      "Difference between true peak and integrated loudness. Useful for headroom and transient contrast context."
  },
  {
    element: "Compression Assessment",
    meaning:
      "Heuristic summary from codec/container metadata and spectral behavior. Informative, but not a forensic codec detector."
  },
  {
    element: "Metadata Tags",
    meaning:
      "Embedded tags like artist/title/album. 'No embedded tags detected' means tags are absent or unreadable in this file."
  },
  {
    element: "Show Raw Metadata JSON",
    meaning:
      "Unfiltered metadata payload from ffprobe and mutagen for technical inspection."
  },
  {
    element: "Integrated LUFS",
    meaning:
      "Overall perceived loudness of the full track measured with BS.1770-style loudness modeling."
  },
  {
    element: "True Peak dBFS",
    meaning:
      "Oversampled peak estimate including possible inter-sample peaks that can clip during playback/encoding."
  },
  {
    element: "Crest Factor dB",
    meaning:
      "Peak-to-RMS contrast. Higher crest factor often means more transient punch and less constant limiting."
  },
  {
    element: "Noise Floor dBFS",
    meaning:
      "Estimated low-level floor from quieter windows. More negative is generally cleaner."
  },
  {
    element: "Markers Around Current Timeline Position",
    meaning:
      "Warnings active near current playback cursor. 'No rows' means no active warnings at that timeline point."
  },
  {
    element: "Session Control | Stage Ticker",
    meaning:
      "Live progress detail for current analysis stage (decode, scan, spectrograms, report generation). Useful when percent appears static."
  },
  {
    element: "Session Control | Hard Reset",
    meaning:
      "Clears run history and resets queued/running worker jobs to recover from stalled analysis loops."
  },
  {
    element: "AI Mastering | Backend",
    meaning:
      "Execution path for mastering. 'auto' chooses best available backend at runtime; unavailable backends fall back safely."
  },
  {
    element: "AI Mastering | Reference Run ID",
    meaning:
      "Optional analyzed run id used as tonal/loudness reference (primarily for matchering-style reference mastering)."
  },
  {
    element: "AI Mastering | Refine Passes",
    meaning:
      "Maximum marker-aware corrective passes. More passes can improve stubborn issues but are bounded to prevent loops."
  },
  {
    element: "AI Mastering | Source-Aware Adaptation",
    meaning:
      "Before rendering outputs, AudioQI can nudge de-ess, low/high balance, compression, limiter drive, and peak headroom from detected source issues. Manual loudness targets stay in place unless extra peak safety is required."
  },
  {
    element: "Post-Master Self-Check | Assessment",
    meaning:
      "Overall result label: strong improvement, partial improvement, unchanged, or regression (rollback protection is applied)."
  },
  {
    element: "Post-Master Self-Check | Issue Score",
    meaning:
      "Weighted count of active issue classes before vs after mastering. Lower after-score indicates improvement."
  },
  {
    element: "Post-Master Self-Check | Remaining/Resolved/Worsened",
    meaning:
      "Issue classes still present, removed, or increased after mastering. Remaining high-severity issues usually need mix/stem fixes."
  },
  {
    element: "Post-Master Self-Check | AI Recommendation Match",
    meaning:
      "Compares applied mode/preset/targets to analyzer recommendations. Match does not guarantee issue resolution."
  },
  {
    element: "Refinement Diagnostics",
    meaning:
      "Shows accepted passes, rollbacks, final issue score, and whether stem fallback was used."
  },
  {
    element: "Pro Modules",
    meaning:
      "Runtime availability for optional integrations (ffmpeg, pedalboard, matchering, pyebur128)."
  },
  {
    element: "N/A values",
    meaning:
      "Shown when signal/metadata is insufficient for a metric (e.g., no stable noise floor or missing codec metadata)."
  }
];

const CHART_GUIDE_ROWS = ALL_CHARTS.map((chart) => ({
  element: chart.title,
  meaning: CHART_HELP[chart.key] ?? "Graph interpretation description unavailable."
}));

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
const ANALYSIS_STALE_WARNING_SECONDS = 300;
const NORMALIZATION_PROFILE_OPTIONS = [
  {
    id: "off",
    label: "Off (Preset/Manual)",
    targetLufs: null,
    truePeakDbfs: null,
    help: "Use preset defaults or manual LUFS/TP values."
  },
  {
    id: "youtube",
    label: "YouTube",
    targetLufs: -14.0,
    truePeakDbfs: -1.0,
    help: "Common YouTube normalization target."
  },
  {
    id: "spotify",
    label: "Spotify",
    targetLufs: -14.0,
    truePeakDbfs: -1.0,
    help: "Typical Spotify normalization alignment."
  },
  {
    id: "apple_music",
    label: "Apple Music",
    targetLufs: -16.0,
    truePeakDbfs: -1.0,
    help: "Conservative Apple Music-style loudness."
  },
  {
    id: "instagram",
    label: "Instagram",
    targetLufs: -14.0,
    truePeakDbfs: -1.0,
    help: "Social/mobile balanced target."
  },
  {
    id: "tiktok",
    label: "TikTok",
    targetLufs: -14.0,
    truePeakDbfs: -1.0,
    help: "Short-form platform target."
  },
  {
    id: "broadcast_ebu",
    label: "Broadcast EBU",
    targetLufs: -23.0,
    truePeakDbfs: -1.0,
    help: "EBU R128 broadcast delivery."
  },
  {
    id: "podcast_voice",
    label: "Podcast Voice",
    targetLufs: -16.0,
    truePeakDbfs: -1.5,
    help: "Speech-forward podcast normalization."
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

function formatDate(value: string): string {
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
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

function stageLabel(stage: string | null | undefined): string {
  const raw = text(stage, "").trim();
  if (!raw) return "Idle";
  return raw
    .split("_")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function stageTickerText(detail: string | null | undefined, stage: string | null | undefined): string {
  const cleanedDetail = text(detail, "").trim();
  if (cleanedDetail) return cleanedDetail;
  return `${stageLabel(stage)}.`;
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

function maybeHz(value: number | null): string {
  if (value === null) return "N/A";
  return hz(value);
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
    throw new Error(`Download failed: ${response.status}`);
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

export default function HomePage() {
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
  const [optimizerVariants, setOptimizerVariants] = useState(4);
  const [maxRefinePasses, setMaxRefinePasses] = useState(2);
  const [statusMessage, setStatusMessage] = useState("Pick an audio file to begin.");
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
    window.addEventListener("mousemove", handleWindowMouseMove, { passive: false });
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("contextmenu", handleWindowContextMenu, true);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("contextmenu", handleWindowContextMenu, true);
    };
  }, [applySelectionRange]);

  const savePendingOutput = async (item: PendingSaveOutput) => {
    setSavingOutputId(item.id);
    try {
      await saveFileWithPicker(item.url, item.filename);
      setPendingSaveOutputs((prev) => prev.filter((row) => row.id !== item.id));
      setStatusMessage(`Saved ${item.filename}.`);
    } catch (err) {
      const message = toErrorMessage(err, `Failed to save ${item.filename}.`);
      if (message.toLowerCase().includes("timed out")) {
        triggerBrowserDownload(item.url, item.filename);
        setPendingSaveOutputs((prev) => prev.filter((row) => row.id !== item.id));
        setStatusMessage(`Save dialog timed out. Started browser download for ${item.filename}.`);
      } else {
        setStatusMessage(message);
      }
    } finally {
      setSavingOutputId(null);
    }
  };

  const runColumns = useMemo<ColumnDef<RunSummary>[]>(
    () => [
      { header: "File", accessorKey: "filename" },
      {
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={statusVariant[row.original.status] ?? "outline"}>{row.original.status}</Badge>
        )
      },
      {
        header: "Stage",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {stageTickerText(row.original.stage_detail ?? null, row.original.stage ?? row.original.status)}
          </span>
        )
      },
      {
        header: "Progress",
        cell: ({ row }) => <span>{row.original.progress.toFixed(1)}%</span>
      },
      {
        header: "Updated",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.updated_at)}</span>
      }
    ],
    []
  );

  const markerColumns = useMemo<ColumnDef<Marker>[]>(
    () => [
      { header: "Type", accessorKey: "type" },
      {
        header: "Severity",
        cell: ({ row }) => {
          const sev = text(row.original.severity, "info").toLowerCase();
          return <Badge variant={markerSeverityVariant[sev] ?? "outline"}>{sev}</Badge>;
        }
      },
      {
        header: "Window",
        cell: ({ row }) => (
          <span>
            {row.original.start_seconds.toFixed(2)}s - {row.original.end_seconds.toFixed(2)}s
          </span>
        )
      },
      {
        header: "Note",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.message ?? "-"}</span>
      }
    ],
    []
  );

  const convertedColumns = useMemo<ColumnDef<ConvertedFile>[]>(
    () => [
      { header: "Format", accessorKey: "format" },
      {
        header: "Details",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {text(row.original.codec, "codec?")} | {text(row.original.container, "container?")}
          </span>
        )
      },
      {
        header: "Size",
        cell: ({ row }) => <span>{bytesLabel(num(row.original.size_bytes, 0))}</span>
      },
      {
        header: "Download",
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
    [selectedRunId]
  );

  const masteredColumns = useMemo<ColumnDef<MasteringOutput>[]>(
    () => [
      { header: "Output", accessorKey: "id" },
      {
        header: "Score",
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
        header: "True Peak",
        cell: ({ row }) => {
          const v = maybeNum(asRecord(row.original.metrics).true_peak_dbfs);
          return <span>{v !== null ? `${v.toFixed(2)} dBFS` : "-"}</span>;
        }
      },
      {
        header: "Verify",
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
        header: "Download",
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
    [selectedRunId]
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
      setSelectedRunId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setStatusMessage(
        `${toErrorMessage(err, "Failed to fetch runs.")} (API: ${getApiBase()})`
      );
    }
  }, []);

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
          `Loaded ${loadedCount}/${uniqueChartNames.length} charts. Retrying missing: ${failedChartNames.join(", ")}`
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
  }, []);

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
      const masteringTicker = masteringStageDetail || (masteringStage ? `${stageLabel(masteringStage)}.` : "");
      const analysisTicker = stageTickerText(detail.stage_detail ?? null, detail.stage ?? detail.status);
      const stageAgeSeconds = secondsSinceIso(detail.stage_updated_at ?? null);
      const staleLoopHint =
        (detail.status === "running" || detail.status === "queued") &&
        stageAgeSeconds !== null &&
        stageAgeSeconds > ANALYSIS_STALE_WARNING_SECONDS
          ? ` (no stage update for ${stageAgeSeconds}s)`
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
            `Analysis complete. Loading charts (${loaded}/${expectedChartNames.length})... Missing: ${unresolvedChartNames.join(", ")}`
          );
        } else if (masteringStatus === "queued" || masteringStatus === "running") {
          setStatusMessage(
            `Mastering ${masteringStatus}... ${masteringProgress.toFixed(1)}%${masteringTicker ? ` | ${masteringTicker}` : ""}`
          );
        } else if (masteringStatus === "failed") {
          setStatusMessage(detail.mastering?.error_message || "Mastering failed.");
        } else if (conversionStatus === "queued" || conversionStatus === "running") {
          setStatusMessage(`Conversion ${conversionStatus}... ${conversionProgress.toFixed(1)}%`);
        } else if (conversionStatus === "failed") {
          setStatusMessage(detail.conversions?.error_message || "Conversion failed.");
        } else {
          setStatusMessage(analysisTicker || "Analysis complete.");
        }
      } else if (detail.status === "failed") {
        setStatusMessage(detail.error_message || "Analysis failed.");
      } else if (masteringStatus === "queued" || masteringStatus === "running") {
        setStatusMessage(
          `Mastering ${masteringStatus}... ${masteringProgress.toFixed(1)}%${masteringTicker ? ` | ${masteringTicker}` : ""}`
        );
      } else if (conversionStatus === "queued" || conversionStatus === "running") {
        setStatusMessage(`Conversion ${conversionStatus}... ${conversionProgress.toFixed(1)}%`);
      } else {
        setStatusMessage(`${detail.status}... ${detail.progress.toFixed(1)}% | ${analysisTicker}${staleLoopHint}`);
      }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          return;
        }
        setStatusMessage(
          `${toErrorMessage(err, "Failed to fetch run details.")} (API: ${getApiBase()})`
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
  }, [loadChartsForRun]);

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
              detail: `${item.id} | ${lufs !== null ? `${lufs.toFixed(2)} LUFS` : "LUFS N/A"} | ${bytesLabel(num(item.size_bytes, 0))}`
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
    setStatusMessage(`New output files ready. Select where to save ${nextPending.length} file(s).`);
  }, [
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
    setStatusMessage("Uploading...");
    try {
      console.log("[AudioQI Debug] Starting upload for file:", file.name);
      const payload = await uploadAudio(file);
      console.log("[AudioQI Debug] Upload completed successfully. Payload:", payload);
      setSelectedRunId(payload.run.id);
      console.log("[AudioQI Debug] Refreshing runs...");
      await refreshRuns();
      setStatusMessage(`Uploaded ${payload.run.filename}. Ready to analyze.`);
    } catch (err) {
      console.error("[AudioQI Debug] Error during upload:", err);
      setStatusMessage(toErrorMessage(err, "Upload failed."));
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
      setStatusMessage("Analysis queued.");
    } catch (err) {
      setStatusMessage(toErrorMessage(err, "Failed to start analysis."));
    } finally {
      setIsBusy(false);
    }
  };

  const onConvert = async () => {
    if (!selectedRunId) return;
    const formats = FORMAT_OPTIONS.filter((fmt) => formatSelection[fmt]);
    if (formats.length === 0) {
      setStatusMessage("Select at least one target format for conversion.");
      return;
    }
    setIsConverting(true);
    setStatusMessage("Queueing conversion...");
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
      setStatusMessage(`Conversion queued: ${formats.join(", ").toUpperCase()}`);
    } catch (err) {
      conversionPromptRequestsRef.current.delete(selectedRunId);
      setStatusMessage(toErrorMessage(err, "Failed to start conversion."));
    } finally {
      setIsConverting(false);
    }
  };

  const onMaster = async () => {
    if (!selectedRunId) return;
    setIsMastering(true);
    setStatusMessage("Queueing mastering...");
    try {
      const parsedTargetLufs = parseOptionalNumberInput(masterTargetLufsInput);
      const parsedTruePeak = parseOptionalNumberInput(masterTruePeakDbfsInput);
      const targetLufs =
        parsedTargetLufs === null ? null : Math.max(-30, Math.min(-6, parsedTargetLufs));
      const truePeak = parsedTruePeak === null ? null : Math.max(-6, Math.min(0, parsedTruePeak));
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
        Math.max(1, Math.min(5, maxRefinePasses))
      );
      masteringPromptRequestsRef.current.set(selectedRunId, {
        requestId: nextPromptRequestId("mastering", selectedRunId),
        mode: masterMode,
        preset: masterPreset
      });
      await refreshRunDetail(selectedRunId);
      setStatusMessage(
        `Mastering queued (${masterMode.toUpperCase()}, ${masterPreset}, ${masterBackend}, norm: ${normalizationProfile}).`
      );
    } catch (err) {
      masteringPromptRequestsRef.current.delete(selectedRunId);
      setStatusMessage(toErrorMessage(err, "Failed to start mastering."));
    } finally {
      setIsMastering(false);
    }
  };

  const onClearHistory = async (hardReset = false) => {
    const confirmed = hardReset
      ? window.confirm(
          "Hard reset services and clear all runs (including active/queued jobs)? This will cancel queued workers."
        )
      : window.confirm("Clear run history for all non-active runs?");
    if (!confirmed) return;
    setIsBusy(true);
    setStatusMessage(hardReset ? "Hard resetting services and clearing history..." : "Clearing run history...");
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
      setPendingSaveOutputs([]);
      setSaveDialogOpen(false);
      conversionPromptRequestsRef.current.clear();
      masteringPromptRequestsRef.current.clear();
      initializedSelectionRunRef.current = null;
      await refreshRuns();
      const suffix = result.skipped_active > 0 ? ` (${result.skipped_active} active run(s) kept)` : "";
      const hardResetSuffix = hardReset
        ? ` Jobs reset: cancelled ${result.jobs_reset?.cancelled ?? 0}, running ${result.jobs_reset?.running ?? 0}.`
        : "";
      setStatusMessage(`Cleared ${result.deleted} run(s).${suffix}${hardResetSuffix}`);
    } catch (err) {
      setStatusMessage(
        toErrorMessage(err, hardReset ? "Failed to hard reset services." : "Failed to clear run history.")
      );
    } finally {
      setIsBusy(false);
    }
  };

  const currentStatus = runDetail?.status ?? "idle";
  const progress = runDetail?.progress ?? 0;
  const analysisStage = runDetail?.stage ?? currentStatus;
  const analysisTicker = stageTickerText(runDetail?.stage_detail ?? null, analysisStage);
  const analysisStageAgeSeconds = secondsSinceIso(runDetail?.stage_updated_at ?? null);
  const analysisStageMeta =
    analysisStageAgeSeconds !== null
      ? `Stage: ${stageLabel(analysisStage)} | Updated ${analysisStageAgeSeconds}s ago`
      : `Stage: ${stageLabel(analysisStage)}`;
  const conversionInfo = runDetail?.conversions;
  const conversionStatus = conversionInfo?.status ?? "idle";
  const conversionProgress = conversionInfo?.progress ?? 0;
  const conversionFiles = conversionInfo?.manifest?.files ?? [];
  const masteringInfo = runDetail?.mastering;
  const masteringStatus = masteringInfo?.status ?? "idle";
  const masteringProgress = masteringInfo?.progress ?? 0;
  const masteringOutputs = masteringInfo?.manifest?.outputs ?? [];
  const bestMasterId = text(masteringInfo?.manifest?.best_output_id, "N/A");
  const masteringStage = text(masteringInfo?.stage, "idle");
  const masteringDetail = text(masteringInfo?.detail, "");
  const masteringSelfCheck = asRecord(masteringInfo?.manifest?.self_check);
  const selfCheckAssessment = text(masteringSelfCheck.assessment, "n/a");
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
  const dynamicSpan = maybeNum(dynamicInfo.peak_to_noise_span_db);
  const peakToLoudness = maybeNum(dynamicInfo.peak_to_loudness_ratio_db);
  const lossHz = maybeNum(compression.estimated_high_freq_loss_hz);
  const lossPctNyquist = maybeNum(compression.estimated_high_freq_loss_percent_of_nyquist);
  const selectedSegmentLength = Math.max(0, selectionEnd - selectionStart);
  const masteringRecommendations = Array.isArray(metrics.mastering_recommendations)
    ? metrics.mastering_recommendations
        .map((item) => asRecord(item))
        .map((item) => ({
          priority: text(item.priority, "info"),
          issue: text(item.issue, "N/A"),
          action: text(item.action, "N/A")
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
  const recommendationConfidence = text(aiMasteringAdvice.confidence, "N/A");
  const recommendationIssueScore = maybeNum(aiMasteringAdvice.issue_score);
  const recommendationReasons = Array.isArray(aiMasteringAdvice.reasons)
    ? aiMasteringAdvice.reasons.map((r) => text(r, "")).filter((r) => r.length > 0)
    : [];
  const canApplyAiMasteringAdvice = recommendedMode !== null && recommendedPreset !== null;
  const selectedNormalizationProfile =
    NORMALIZATION_PROFILE_OPTIONS.find((profile) => profile.id === normalizationProfile) ??
    NORMALIZATION_PROFILE_OPTIONS[0];
  const integratedLufs = metricNumber(metrics, ["loudness", "integrated_lufs"], 0);
  const truePeakDbfs = metricNumber(metrics, ["dynamics", "true_peak_dbfs"], 0);
  const crestFactorDb = metricNumber(metrics, ["dynamics", "crest_factor_db"], 0);
  const noiseFloorDbfs = metricNumber(metrics, ["noise_floor_dbfs"], 0);
  const selectedRunSummary = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null;
  const selectedRunFilename = text(runDetail?.filename, selectedRunSummary?.filename ?? "No run selected");
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
    : "Awaiting analyzer recommendation";
  const loudnessTargetForReadiness = selectedNormalizationProfile.targetLufs ?? -14.0;
  const loudnessOffset = integratedLufs - loudnessTargetForReadiness;
  const loudnessReadiness = Math.abs(loudnessOffset) <= 1.5 ? "Aligned" : loudnessOffset > 0 ? "Hot" : "Quiet";
  const peakReadiness = truePeakDbfs <= -1.0 ? "Safe" : truePeakDbfs <= -0.2 ? "Tight" : "Risk";
  const markerReadiness = highlightedMarkerCount === 0 ? "Clean" : highlightedMarkerCount <= 3 ? "Review" : "Attention";
  const dynamicsReadiness = crestFactorDb >= 8 ? "Open" : crestFactorDb >= 5 ? "Controlled" : "Dense";
  const unavailableHints: string[] = [];
  if (lossPctNyquist === null) {
    unavailableHints.push("Compression-loss estimate unavailable because codec metadata or spectral estimate is missing.");
  }
  if (dynamicSpan === null) {
    unavailableHints.push("Peak-to-noise is unavailable because a stable noise floor could not be estimated.");
  }
  if (peakToLoudness === null) {
    unavailableHints.push("Peak-to-LUFS is unavailable when integrated loudness is undefined (very short/silent material).");
  }
  if (tagEntries.length === 0 && suppressedTagCount === 0) {
    unavailableHints.push("No embedded metadata tags detected in this file.");
  }
  if (tagEntries.length === 0 && suppressedTagCount > 0) {
    unavailableHints.push(
      `No descriptive embedded tags were found. Hidden ${suppressedTagCount} bulky or system tag(s); open raw metadata JSON to inspect them.`
    );
  }

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
      `Applied suggested mastering settings (${recommendedMode.toUpperCase()} / ${recommendedPreset} / ${recommendedBackend ?? masterBackend}).`
    );
  };

  const scrollToChart = (chartKey: string) => {
    const target = document.getElementById(`chart-${chartKey}`);
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
        setStatusMessage(toErrorMessage(err, "Playback failed to start."));
      }
      return;
    }
    audio.pause();
  }, [ensurePlaybackGraph, eqEnabled]);

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
      setStatusMessage("Select a run before exporting EQ audio.");
      return;
    }
    setIsEqExporting(true);
    try {
      const response = await fetch(audioUrl(selectedRunId), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to fetch source audio: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const AudioContextCtor = window.AudioContext;
      if (!AudioContextCtor || typeof OfflineAudioContext === "undefined") {
        throw new Error("Web Audio offline rendering is not available in this browser.");
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
      setStatusMessage("EQ export complete. Saved processed WAV.");
    } catch (err) {
      setStatusMessage(toErrorMessage(err, "EQ export failed."));
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
      setStatusMessage(result.update_available ? "A Music Suite update is available." : result.message);
    } catch (err) {
      setStatusMessage(toErrorMessage(err, "Update check failed."));
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
      setStatusMessage(toErrorMessage(err, "Update installation failed."));
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1800px] px-4 py-6 md:px-8">
      <section className="glass mb-5 rounded-3xl border border-border/80 p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-secondary/75 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Rocket className="h-3.5 w-3.5" /> Geekatplay Studio
            </p>
            <h1 className="mt-3 display-font text-3xl font-semibold md:text-4xl">
              Music Suite by Geekatplay Studio
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Backend stack: FFmpeg/ffprobe, SoundFile (libsndfile), Mutagen, NumPy, SciPy, Librosa, pyloudnorm,
              Plotly, and optional CUDA spectrogram acceleration with torchaudio + nnAudio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onToggleConfiguration} disabled={isBusy}>
              <Settings className="mr-2 h-4 w-4" />
              Configuration
            </Button>
            <Button variant="secondary" onClick={() => void refreshRuns()} disabled={isBusy}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Runs
            </Button>
            <Button
              variant="secondary"
              disabled={!selectedRunId}
              title={selectedRunId ? "Open the selected song in Geometry Mapper" : "Select or upload a song first"}
              onClick={() => {
                if (!selectedRunId) return;
                const params = new URLSearchParams({ run: selectedRunId, name: selectedRunFilename });
                window.location.assign(`/mapper?${params.toString()}`);
              }}
            >
              <Network className="mr-2 h-4 w-4" />
              Geometry Mapper
            </Button>
            <Button variant="danger" onClick={() => void onClearHistory()} disabled={isBusy || runs.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear History
            </Button>
            <Button
              variant="danger"
              onClick={() => void onClearHistory(true)}
              disabled={isBusy || runs.length === 0}
              title="Force reset job workers and clear all runs (including active ones)."
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Hard Reset
            </Button>
          </div>
        </div>
      </section>

      {configurationOpen ? (
        <Card className="mb-5 border-cyan-500/25 bg-slate-950/70">
          <CardHeader>
            <CardTitle>Configuration &amp; Updates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Product</p>
                <p className="mt-1 font-semibold">Geekatplay Studio Music Suite</p>
                <p className="text-xs text-muted-foreground">Created by Vladimir Chopine</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Installed version</p>
                <p className="mt-1 font-semibold">{updateStatus?.version ?? "1.0.0"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Revision {updateStatus?.current_commit?.slice(0, 12) ?? "not available"}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Official source</p>
                <a
                  className="mt-1 block font-semibold text-cyan-300 hover:text-cyan-200"
                  href="https://github.com/GeekatplayStudio/music-suite"
                  target="_blank"
                  rel="noreferrer"
                >
                  GeekatplayStudio/music-suite
                </a>
                <p className="text-xs text-muted-foreground">Stable branch: main</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
              <div>
                <p className="font-medium">
                  {updateStatus
                    ? updateStatus.update_available
                      ? "Update available"
                      : "Music Suite is up to date"
                    : "Ready to check for updates"}
                </p>
                <p className="max-w-3xl text-xs text-muted-foreground">
                  {updateStatus?.working_tree_dirty
                    ? "Local changes detected. Installation is blocked until they are committed or removed."
                    : updateStatus?.message ??
                      "Checks only the official Geekatplay Studio repository. Updates are fast-forward-only and never overwrite local changes."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void refreshUpdateStatus()}
                  disabled={isCheckingUpdate || isInstallingUpdate}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {isCheckingUpdate ? "Checking..." : "Check for Updates"}
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
                  {isInstallingUpdate ? "Installing..." : "Install Update"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {visualizerOpen && selectedRunId ? (
        <div ref={visualizerRef} className="mb-5 scroll-mt-4">
          <SonicVisualizer audioSrc={audioUrl(selectedRunId)} filename={selectedRunFilename} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileAudio2 className="h-5 w-5 text-primary" /> Session Control
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
                    "Drag & drop audio here or browse"
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
                    document.getElementById("drag-drop-file-input")?.click();
                  }}
                  variant="secondary"
                  size="sm"
                >
                  Browse File
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void onUpload()} disabled={!selectedFile || isBusy}>
                  Upload
                </Button>
                <Button variant="secondary" onClick={() => void onAnalyze()} disabled={!selectedRunId || isBusy}>
                  Analyze
                </Button>
                <Button
                  variant="secondary"
                  onClick={openVisualizer}
                  disabled={!selectedRunId}
                  title="Open real-time visuals for the uploaded song"
                >
                  <Waves className="mr-2 h-4 w-4" />
                  Visual AI
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useGpu}
                  onChange={(e) => setUseGpu(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Cpu className="h-4 w-4" />
                Use optional GPU spectrogram path
              </label>
              <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Badge variant={statusVariant[currentStatus] ?? "outline"}>{currentStatus}</Badge>
                  <span className="text-xs text-muted-foreground">{progress.toFixed(1)}%</span>
                </div>
                <Progress value={progress} />
                <p className="mt-2 text-xs font-semibold text-primary">{analysisTicker}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{analysisStageMeta}</p>
                {analysisStageAgeSeconds !== null &&
                (currentStatus === "running" || currentStatus === "queued") &&
                analysisStageAgeSeconds > ANALYSIS_STALE_WARNING_SECONDS ? (
                  <p className="mt-1 text-xs text-amber-300">
                    Stage heartbeat is unusually old. Long spectrogram work can take time, but the backend loop guard will still abort truly stalled analysis automatically.
                  </p>
                ) : null}
                {statusMessage && (
                  <p className={cn(
                    "mt-2 text-sm transition-colors duration-200",
                    statusMessage.toLowerCase().includes("fail") || statusMessage.toLowerCase().includes("error") || statusMessage.toLowerCase().includes("not found")
                      ? "text-red-400 font-semibold bg-red-950/20 border border-red-900/30 rounded-lg p-2"
                      : "text-muted-foreground"
                  )}>
                    {statusMessage}
                  </p>
                )}
              </div>
              {selectedRunId ? (
                <div className="text-sm">
                  <p className="font-semibold">Exports</p>
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
                  Save Ready Files ({pendingSaveOutputs.length})
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Format Conversion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Convert the selected song into additional delivery formats with async progress.
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
                      className="h-4 w-4 rounded border-input"
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
                Convert Selected
              </Button>

              <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Badge variant={conversionStatusVariant[conversionStatus] ?? "outline"}>
                    {conversionStatus}
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
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Converted Files</p>
                  <DataTable data={conversionFiles} columns={convertedColumns} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No converted files generated yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI Mastering</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                <p className="text-xs text-muted-foreground">
                  V1 = transparent chain, V2 = optimizer variants, V3 = stem-aware corrective workflow.
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  AudioQI now applies a source-aware preflight adjustment pass before rendering variants or stem rescue.
                  Use Backend, Refine Passes, and Reference Run ID for advanced pro mastering control.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Suggested From Analysis</p>
                  <Badge variant={canApplyAiMasteringAdvice ? "default" : "outline"}>
                    {canApplyAiMasteringAdvice ? recommendationConfidence : "No advice"}
                  </Badge>
                </div>
                {canApplyAiMasteringAdvice ? (
                  <div className="space-y-2">
                    <p className="text-sm">
                      Mode <span className="font-semibold">{recommendedMode?.toUpperCase()}</span> | Preset{" "}
                      <span className="font-semibold">{recommendedPreset}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Target LUFS {recommendedTargetLufs !== null ? recommendedTargetLufs.toFixed(1) : "N/A"} | True Peak{" "}
                      {recommendedTruePeak !== null ? `${recommendedTruePeak.toFixed(1)} dBFS` : "N/A"} | Variants{" "}
                      {recommendedVariants ?? "N/A"} | Backend {recommendedBackend ?? "N/A"} | Refine {recommendedRefinePasses ?? "N/A"}
                      {recommendationIssueScore !== null ? ` | Issue score ${recommendationIssueScore.toFixed(0)}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Score policy: dense, lossy, or peak-sensitive sources stay on V1; cleaner corrective cases move to V2; V3 is reserved for stronger intervention on recoverable material.
                    </p>
                    {recommendationReasons.length > 0 ? (
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {recommendationReasons.slice(0, 4).map((reason, idx) => (
                          <li key={`${reason}-${idx}`}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={onApplyAiMasteringAdvice}>
                      Apply Suggested Settings
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Analyze a track first to get recommended AI mastering mode, preset, and targets.
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Mastering Settings</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Mode</span>
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
                    <span className="font-medium text-foreground">Preset</span>
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
                    <span className="font-medium text-foreground">Normalization Profile</span>
                    <select
                      value={normalizationProfile}
                      onChange={(e) => applyNormalizationProfile(e.target.value as NormalizationProfileId)}
                      className="w-full rounded-xl border border-input bg-input px-3 py-2 text-sm text-foreground"
                    >
                      {NORMALIZATION_PROFILE_OPTIONS.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Profile Targets</span>
                    <div className="rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-sm text-foreground">
                      {selectedNormalizationProfile.targetLufs !== null
                        ? `${selectedNormalizationProfile.targetLufs.toFixed(1)} LUFS | ${selectedNormalizationProfile.truePeakDbfs?.toFixed(1)} dBFS TP`
                        : "Using preset/manual targets"}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{selectedNormalizationProfile.help}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Backend</span>
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
                    <span className="font-medium text-foreground">Reference Run ID (matchering)</span>
                    <Input
                      type="text"
                      placeholder="optional run id"
                      value={masterReferenceRunId}
                      onChange={(e) => setMasterReferenceRunId(e.target.value)}
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Target LUFS</span>
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
                    <span className="font-medium text-foreground">True Peak dBFS</span>
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
                    <span className="font-medium text-foreground">V2 Variants</span>
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
                    <span className="font-medium text-foreground">Refine Passes</span>
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
                  Backend notes: `internal` is the safest default, `auto` is for advanced backend selection, and `matchering`
                  requires a valid Reference Run ID. Refine Passes are loop-guarded. Normalization profile sets
                  platform targets; manual LUFS/TP values override profile defaults. Source-aware adaptation can
                  trim harshness, sub energy, density, or true-peak risk before the main master renders.
                </p>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => void onMaster()}
                disabled={!selectedRunId || isMastering || isBusy}
              >
                Run Mastering
              </Button>

              <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <Badge variant={masteringStatusVariant[masteringStatus] ?? "outline"}>
                    {masteringStatus}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{masteringProgress.toFixed(1)}%</span>
                </div>
                <Progress value={masteringProgress} />
                <p className="mt-2 text-xs font-semibold text-primary">
                  {masteringDetail || `${stageLabel(masteringStage)}.`}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Best output: {bestMasterId}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Backend selected: {backendSelected}
                </p>
                {bestOutputHash ? (
                  <p className="mt-1 text-[11px] text-muted-foreground" title={bestOutputHash}>
                    Output SHA256: {bestOutputHash.slice(0, 12)}...
                  </p>
                ) : null}
                {masteringInfo?.error_message ? (
                  <p className="mt-2 text-xs text-red-300">{masteringInfo.error_message}</p>
                ) : null}
                {(refineAcceptedPasses !== null || refineFinalScore !== null) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Refinement: {refineAcceptedPasses !== null ? refineAcceptedPasses.toFixed(0) : "0"}
                    {" / "}
                    {refineMaxPasses !== null ? refineMaxPasses.toFixed(0) : "?"} accepted
                    {refineFinalScore !== null ? ` | Final issue score ${refineFinalScore.toFixed(0)}` : ""}
                    {refineRollbackCount !== null ? ` | Rollbacks ${refineRollbackCount.toFixed(0)}` : ""}
                    {refineFallbackApplied ? " | Stem fallback applied" : ""}
                    {refineNonRegressionApplied
                      ? ` | Non-regression safeguard (${refineNonRegressionReason || "applied"})`
                      : ""}
                  </p>
                ) : null}
                {proFeatureEntries.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pro modules:{" "}
                    {proFeatureEntries
                      .map(([key, value]) => `${key}:${value ? "yes" : "no"}`)
                      .join(" | ")}
                  </p>
                ) : null}
              </div>

              {Object.keys(adaptationInfo).length > 0 ? (
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Source-Aware Adaptation</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source issue score: {adaptationSourceIssueScore !== null ? adaptationSourceIssueScore.toFixed(0) : "N/A"}
                    {adaptationAdjustmentCount !== null ? ` | Adjustments ${adaptationAdjustmentCount.toFixed(0)}` : ""}
                  </p>
                  {adaptationAdjustments.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {adaptationAdjustments.slice(0, 6).map((row) => (
                        <p key={`${row.field}-${row.reason}`} className="text-xs text-muted-foreground">
                          {row.field}: {row.before !== null ? row.before.toFixed(2) : "N/A"} {"->"} {row.after !== null ? row.after.toFixed(2) : "N/A"} | {row.reason}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No preflight parameter changes were required for this source.
                    </p>
                  )}
                </div>
              ) : null}

              {Object.keys(masteringSelfCheck).length > 0 ? (
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Post-Master Self-Check</p>
                  <p className="mt-1 text-sm">
                    Assessment: <span className="font-semibold">{selfCheckAssessment}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Issue score:{" "}
                    {selfCheckScoreBefore !== null ? selfCheckScoreBefore.toFixed(0) : "N/A"} {"->"}{" "}
                    {selfCheckScoreAfter !== null ? selfCheckScoreAfter.toFixed(0) : "N/A"}
                    {selfCheckScoreDelta !== null
                      ? ` (${selfCheckScoreDelta > 0 ? "+" : ""}${selfCheckScoreDelta.toFixed(0)})`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applied settings: {text(appliedSettings.name, masterPreset)} | Target{" "}
                    {appliedTargetLufs !== null ? `${appliedTargetLufs.toFixed(1)} LUFS` : "N/A"}{" "}
                    | TP{" "}
                    {appliedTargetTruePeak !== null ? `${appliedTargetTruePeak.toFixed(1)} dBFS` : "N/A"} | Norm{" "}
                    {appliedNormalizationProfile}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    AI recommendation match: mode {aiModeMatch === null ? "N/A" : aiModeMatch ? "yes" : "no"} | preset{" "}
                    {aiPresetMatch === null ? "N/A" : aiPresetMatch ? "yes" : "no"} | target{" "}
                    {aiTargetLufsMatch === null ? "N/A" : aiTargetLufsMatch ? "yes" : "no"} | TP{" "}
                    {aiTruePeakMatch === null ? "N/A" : aiTruePeakMatch ? "yes" : "no"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Compliance: {selfCheckCompliancePassed ? "pass" : "review required"}
                    {selfCheckComplianceLufsDelta !== null ? ` | LUFS delta ${selfCheckComplianceLufsDelta > 0 ? "+" : ""}${selfCheckComplianceLufsDelta.toFixed(2)}` : ""}
                    {selfCheckComplianceTruePeakDelta !== null ? ` | TP delta ${selfCheckComplianceTruePeakDelta > 0 ? "+" : ""}${selfCheckComplianceTruePeakDelta.toFixed(2)} dB` : ""}
                    {selfCheckComplianceCrestDelta !== null ? ` | Crest delta ${selfCheckComplianceCrestDelta > 0 ? "+" : ""}${selfCheckComplianceCrestDelta.toFixed(2)} dB` : ""}
                  </p>
                  {selfCheckComplianceFailed.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-300">
                      Compliance issues: {selfCheckComplianceFailed.join(", ")}
                    </p>
                  ) : null}
                  {postCheckRepairAttempted ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Post-check rescue: {postCheckRepairApplied ? "applied" : "attempted only"}
                      {postCheckRepairRound !== null && postCheckRepairRound > 0 ? ` | round ${postCheckRepairRound.toFixed(0)}` : ""}
                    </p>
                  ) : null}
                  {selfCheckResolved.length > 0 ? (
                    <p className="mt-2 text-xs text-emerald-300">
                      Resolved: {selfCheckResolved.join(", ")}
                    </p>
                  ) : null}
                  {selfCheckRemaining.length > 0 ? (
                    <p className="mt-1 text-xs text-amber-300">
                      Remaining: {selfCheckRemaining.join(", ")}
                    </p>
                  ) : null}
                  {selfCheckWorsened.length > 0 ? (
                    <p className="mt-1 text-xs text-red-300">
                      Worsened: {selfCheckWorsened.join(", ")}
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
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Mastered Outputs</p>
                  <DataTable data={masteringOutputs} columns={masteredColumns} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No mastering outputs generated yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Run History</CardTitle>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Waves className="h-5 w-5 text-primary" /> Playback + Timeline
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
                  const t = (e.target as HTMLAudioElement).currentTime;
                  if (isLoopSelection && t >= selectionEnd - 0.02) {
                    (e.target as HTMLAudioElement).currentTime = selectionStart;
                    scrubTimeRef.current = selectionStart;
                    setScrubTime(selectionStart);
                    return;
                  }
                  if (Math.abs(t - scrubTimeRef.current) < 0.025) {
                    return;
                  }
                  scrubTimeRef.current = t;
                  setScrubTime(t);
                }}
                onPlay={handleAudioPlay}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onError={() => setStatusMessage("Audio playback failed to load for this run.")}
              />
              <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Playhead</p>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.01}
                  value={scrubTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    setScrubTime(t);
                    if (audioRef.current) {
                      audioRef.current.currentTime = t;
                    }
                  }}
                  className="mt-2 w-full accent-[hsl(var(--primary))]"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {scrubTime.toFixed(2)}s / {duration.toFixed(2)}s
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Playback {playbackRate.toFixed(2)}x</span>
                  <span>|</span>
                  <span>{isLoopSelection ? "Selection loop active" : "Selection loop off"}</span>
                  <span>|</span>
                  <span>{eqEnabled ? "EQ monitoring enabled" : "EQ bypassed"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Selected Segment (Zoom Range)</p>
                  <Button size="sm" variant="ghost" onClick={() => applySelectionRange(0, duration)}>
                    Full Track
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Start {selectionStart.toFixed(2)}s | End {selectionEnd.toFixed(2)}s | Length{" "}
                  {selectedSegmentLength.toFixed(2)}s
                </p>
                <label className="mt-3 block text-xs text-muted-foreground">
                  Left Marker
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
                  Right Marker
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
                <p className="text-xs font-semibold uppercase text-muted-foreground">Markers (Click To Jump + Zoom)</p>
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
                  <p className="mt-2 text-xs text-muted-foreground">No markers available yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-9">
          <section className="grid gap-3 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Active Run
              </p>
              <p className="mt-2 truncate display-font text-lg font-semibold text-foreground">
                {selectedRunFilename}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedRunId ? `Run ID ${selectedRunId.slice(0, 8)}...` : "Upload a file to create a run."}
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Analysis State
              </p>
              <p className="mt-2 display-font text-lg font-semibold text-foreground">
                {stageLabel(analysisStage)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{analysisTicker}</p>
              <p className="mt-2 text-xs text-primary">{progress.toFixed(1)}% complete</p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Review Assets
              </p>
              <p className="mt-2 display-font text-lg font-semibold text-foreground">
                {loadedChartNames.length}/{availableChartNames.length || ALL_CHARTS.length} charts loaded
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {allMarkers.length} markers detected | {highlightedMarkerCount} attention items
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Selection window {selectedSegmentLength.toFixed(2)}s
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Mastering Strategy
              </p>
              <p className="mt-2 display-font text-lg font-semibold text-foreground">
                {masteringRecommendationSummary}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Backend {masterBackend} | Profile {normalizationProfile}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {masteringOutputs.length > 0
                  ? `${masteringOutputs.length} mastered output${masteringOutputs.length === 1 ? "" : "s"} ready`
                  : "No mastered outputs yet"}
              </p>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Overview Deck</CardTitle>
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
                      {isPlaying ? "Pause" : "Play"}
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
                      Selection Start
                    </Button>
                    <Button
                      size="sm"
                      variant={isLoopSelection ? "default" : "ghost"}
                      onClick={() => setIsLoopSelection((value) => !value)}
                      disabled={!selectedRunId}
                    >
                      <Repeat className="mr-2 h-4 w-4" />
                      Loop Selection
                    </Button>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-sm text-foreground">
                      Speed
                      <select
                        value={playbackRate}
                        onChange={(event) => setPlaybackRate(Number(event.target.value))}
                        className="bg-transparent text-sm text-foreground outline-none"
                      >
                        {[0.75, 1, 1.25, 1.5].map((rate) => (
                          <option key={rate} value={rate} className="bg-slate-950 text-foreground">
                            {rate.toFixed(2)}x
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button size="sm" variant="ghost" onClick={markSelectionStartAtScrub} disabled={!selectedRunId}>
                      Set Start @ {scrubTime.toFixed(2)}s
                    </Button>
                    <Button size="sm" variant="ghost" onClick={markSelectionEndAtScrub} disabled={!selectedRunId}>
                      Set End @ {scrubTime.toFixed(2)}s
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetReviewSelection} disabled={!selectedRunId}>
                      Reset Range
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Delivery Readiness</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                      <p className="text-xs text-muted-foreground">Loudness</p>
                      <p className="mt-1 text-base font-semibold">{loudnessReadiness}</p>
                      <p className="text-xs text-muted-foreground">{integratedLufs.toFixed(2)} LUFS vs {loudnessTargetForReadiness.toFixed(1)} target</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                      <p className="text-xs text-muted-foreground">True Peak</p>
                      <p className="mt-1 text-base font-semibold">{peakReadiness}</p>
                      <p className="text-xs text-muted-foreground">{truePeakDbfs.toFixed(2)} dBFS current ceiling</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                      <p className="text-xs text-muted-foreground">Marker Load</p>
                      <p className="mt-1 text-base font-semibold">{markerReadiness}</p>
                      <p className="text-xs text-muted-foreground">{highlightedMarkerCount} high-attention markers</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                      <p className="text-xs text-muted-foreground">Dynamics</p>
                      <p className="mt-1 text-base font-semibold">{dynamicsReadiness}</p>
                      <p className="text-xs text-muted-foreground">Crest {crestFactorDb.toFixed(2)} dB | Noise floor {noiseFloorDbfs.toFixed(2)} dBFS</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <SlidersHorizontal className="h-4 w-4 text-primary" />
                    Manual EQ
                    {eqEnabled ? <Badge variant="default">Live</Badge> : <Badge variant="outline">Bypass</Badge>}
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
                    EQ export renders a full-track WAV in the browser so your backend pipeline remains unchanged.
                  </div>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Review Guidance</p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <p>Use the review strip to jump quickly through the file before opening the full analysis plots.</p>
                    <p>Keep the chart group on Mix Review for first-pass diagnostics, then switch to Spectral for root-cause inspection.</p>
                    <p>If delivery readiness is not aligned, apply the suggested mastering profile before running a new mastering pass.</p>
                    <p>Use the optional EQ for manual auditioning and export the processed full track as WAV when you want to keep that curve.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                File Intelligence
                <span
                  title="Top-level recording/encoding details, estimated frequency content, compression implications, and dynamic range context."
                  className="inline-flex cursor-help rounded-full bg-secondary/80 p-1 text-muted-foreground"
                >
                  <CircleHelp className="h-4 w-4" />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title="Container format and codec tell you how audio was stored and encoded.">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Format / Codec</p>
                  <p className="mt-1 text-sm font-semibold">
                    {text(metadata.format)} / {text(metadata.codec)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Compression: <span className="font-medium">{compressionType}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title="Sample rate defines Nyquist limit; practical hearing reference is about 20 Hz to 20 kHz.">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Frequency Range</p>
                  <p className="mt-1 text-sm font-semibold">{hzRange(theoLowHz, theoHighHz)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Estimated content:{" "}
                    {estLowHz !== null && estHighHz !== null ? hzRange(estLowHz, estHighHz) : "N/A"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title="Dynamic range combines crest factor, loudness range, and peak-to-noise span.">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Dynamic Range Snapshot</p>
                  <p className="mt-1 text-sm font-semibold">
                    Crest {metricNumber(metrics, ["dynamics", "crest_factor_db"], 0).toFixed(2)} dB
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    LRA {metricNumber(metrics, ["loudness", "lra_approx"], 0).toFixed(2)} LU
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title="Bitrate and bit depth influence potential quality and headroom.">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Signal Properties</p>
                  <p className="mt-1 text-sm font-semibold">
                    {num(metadata.sample_rate, metricNumber(metrics, ["technical", "sample_rate"], 0)).toLocaleString()} Hz,{" "}
                    {num(metadata.channels, metricNumber(metrics, ["technical", "channels"], 0))} ch
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {bitrateKbps > 0 ? `${bitrateKbps.toFixed(0)} kbps` : "Bitrate N/A"} |{" "}
                    {text(metadata.bit_depth, "Bit depth N/A")}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title="Estimated high-frequency loss is inferred from measured top-band content vs Nyquist limit.">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Compression Loss Estimate</p>
                  <p className="mt-1 text-sm font-semibold">
                    {maybeHz(lossHz)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lossPctNyquist !== null ? `${lossPctNyquist.toFixed(1)}% of Nyquist` : "N/A"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3" title="Peak-to-loudness ratio and peak-to-noise span help evaluate punch and usable dynamic headroom.">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Range Detail</p>
                  <p className="mt-1 text-sm font-semibold">
                    Peak to Noise: {dynamicSpan !== null ? `${dynamicSpan.toFixed(2)} dB` : "N/A"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Peak to LUFS: {peakToLoudness !== null ? `${peakToLoudness.toFixed(2)} dB` : "N/A"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Compression Assessment</p>
                <p className="mt-1 text-sm text-foreground">{text(compression.assessment, "No assessment available.")}</p>
              </div>

              {unavailableHints.length > 0 ? (
                <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Why Some Values Are N/A</p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {unavailableHints.map((hint, idx) => (
                      <li key={`${hint}-${idx}`}>{hint}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Metadata Tags</p>
                {suppressedTagCount > 0 ? (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Hidden {suppressedTagCount} bulky or system tag{suppressedTagCount === 1 ? "" : "s"}
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
                        <p className="text-sm">{text(value)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No embedded tags detected.</p>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">Show Raw Metadata JSON</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-900/95 p-3 text-xs text-slate-100">
                    {JSON.stringify(metadata, null, 2)}
                  </pre>
                </details>
              </div>

              <div className="rounded-xl border border-border/80 bg-card/70 p-3">
                <details>
                  <summary className="cursor-pointer text-xs font-semibold uppercase text-primary">
                    Guide: What Everything Means
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This glossary explains every metric and graph in this view so you can interpret results quickly.
                  </p>

                  <div className="mt-3 overflow-x-auto rounded-lg border border-border/70">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Element</th>
                          <th className="px-3 py-2">What it tells you</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ELEMENT_GUIDE_ROWS.map((row) => (
                          <tr key={row.element} className="border-t border-border/60">
                            <td className="px-3 py-2 font-medium text-foreground">{row.element}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.meaning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-border/70">
                    <table className="w-full min-w-[700px] text-left text-sm">
                      <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Graph</th>
                          <th className="px-3 py-2">How to read it</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CHART_GUIDE_ROWS.map((row) => (
                          <tr key={row.element} className="border-t border-border/60">
                            <td className="px-3 py-2 font-medium text-foreground">{row.element}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.meaning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div title="Integrated LUFS: overall perceived loudness across the full track.">
              <KpiTile
                label="Integrated LUFS"
                value={`${integratedLufs.toFixed(2)}`}
              />
            </div>
            <div title="True Peak dBFS: oversampled peak estimate including inter-sample peaks.">
              <KpiTile
                label="True Peak dBFS"
                value={`${truePeakDbfs.toFixed(2)}`}
              />
            </div>
            <div title="Crest Factor: transient punch/peak contrast relative to RMS level.">
              <KpiTile
                label="Crest Factor dB"
                value={`${crestFactorDb.toFixed(2)}`}
              />
            </div>
            <div title="Estimated noise floor from low-level windows in the signal.">
              <KpiTile
                label="Noise Floor dBFS"
                value={`${noiseFloorDbfs.toFixed(2)}`}
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Remastering Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {masteringRecommendations.length > 0 ? (
                <div className="space-y-2">
                  {masteringRecommendations.map((rec, idx) => (
                    <div key={`${rec.issue}-${idx}`} className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant={markerSeverityVariant[rec.priority.toLowerCase()] ?? "outline"}>
                          {rec.priority}
                        </Badge>
                        <p className="text-sm font-semibold">{rec.issue}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{rec.action}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No remastering recommendations available yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Markers Near Playhead / Selection</CardTitle>
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
                Click a marker row to jump and set timeline selection. Table is de-duplicated and prioritized by playhead proximity.
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Chart Studio</CardTitle>
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
                      {group.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">View Focus</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{activeChartGroupConfig.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{activeChartGroupConfig.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing {visibleCharts.length} panel{visibleCharts.length === 1 ? "" : "s"}. Loaded {loadedChartNames.length} of{" "}
                    {availableChartNames.length || ALL_CHARTS.length} expected charts.
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-secondary/45 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Quick Jump</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {visibleCharts.map((chart) => (
                      <button
                        key={chart.key}
                        type="button"
                        onClick={() => scrollToChart(chart.key)}
                        className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-foreground transition hover:border-primary/50 hover:text-primary"
                      >
                        {chart.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-border/70 bg-secondary/45 px-3 py-2 text-xs text-muted-foreground">
            Timeline tip: right-click and drag on the chart area to pan the selected time window.
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
                  title={chart.title}
                  height={chart.height}
                  helpText={CHART_HELP[chart.key]}
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
      </div>

      {saveDialogOpen && pendingSaveOutputs.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-border/80 bg-card/95 p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Outputs Ready To Save</p>
                <p className="text-xs text-muted-foreground">
                  Choose where to save each converted/mastered file.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSaveDialogOpen(false)}>
                Later
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
                      {item.source === "conversion" ? "Conversion" : "Mastering"} | {item.detail}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void savePendingOutput(item)}
                      disabled={savingOutputId === item.id}
                    >
                      {savingOutputId === item.id ? "Saving..." : "Save As..."}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => triggerBrowserDownload(item.url, item.filename)}
                    >
                      Quick Download
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setPendingSaveOutputs((prev) => prev.filter((row) => row.id !== item.id))
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <footer className="mt-12 border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Geekatplay Studio. All rights reserved.</p>
        <p className="mt-1 text-[11px] opacity-75">
          Music Suite &bull; Created by Vladimir Chopine &bull; Version 1.0.0
        </p>
      </footer>
    </main>
  );
}
