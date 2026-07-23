import {
  ChartPayload,
  ChartsPayload,
  ConversionState,
  MasteringState,
  RunDetail,
  RunSummary,
  UpdateResult,
  UpdateStatus,
  UploadResponse
} from "@/lib/types";

function resolveApiBase(): string {
  const envBase = process.env.NEXT_PUBLIC_AUDIOQI_API_URL?.trim();
  if (envBase) {
    return envBase.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8008`;
  }
  return "http://127.0.0.1:8008";
}

const API_BASE = resolveApiBase();

export function getApiBase(): string {
  return API_BASE;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store" });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw err;
    }
    throw new Error(
      `Failed to reach API at ${API_BASE}. ` +
        "Make sure backend is running on port 8000 and CORS/network is allowed."
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listRuns(): Promise<RunSummary[]> {
  return request<RunSummary[]>("/runs");
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  return request<UpdateStatus>("/system/update");
}

export async function installUpdate(): Promise<UpdateResult> {
  return request<UpdateResult>("/system/update", {
    method: "POST",
    headers: { "X-Music-Suite-Action": "update" }
  });
}

export interface ClearRunsResponse {
  deleted: number;
  skipped_active: number;
  hard_reset?: boolean;
  jobs_reset?: {
    pending: number;
    running: number;
    done: number;
    cancelled: number;
  };
}

export async function clearRunHistory(hardReset = false): Promise<ClearRunsResponse> {
  const path = hardReset ? "/runs?hard_reset=true" : "/runs";
  return request<ClearRunsResponse>(path, { method: "DELETE" });
}

export async function getRun(runId: string, signal?: AbortSignal): Promise<RunDetail> {
  return request<RunDetail>(`/runs/${runId}`, { signal });
}

export async function getCharts(runId: string): Promise<ChartsPayload> {
  return request<ChartsPayload>(`/runs/${runId}/charts`);
}

export async function getChart(runId: string, chartKey: string, tinyTest = false): Promise<ChartPayload> {
  const suffix = tinyTest ? "?tiny_test=true" : "";
  return request<ChartPayload>(`/runs/${runId}/charts/${encodeURIComponent(chartKey)}${suffix}`);
}

export async function uploadAudio(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request<UploadResponse>("/runs/upload", {
    method: "POST",
    body: formData
  });
}

export async function analyzeRun(runId: string, useGpu: boolean): Promise<RunSummary> {
  return request<RunSummary>(`/runs/${runId}/analyze?use_gpu=${useGpu ? "true" : "false"}`, {
    method: "POST"
  });
}

export async function convertRun(
  runId: string,
  formats: string[],
  mp3BitrateKbps: number,
  aacBitrateKbps: number
): Promise<ConversionState> {
  const params = new URLSearchParams({
    formats: formats.join(","),
    mp3_bitrate_kbps: `${Math.round(mp3BitrateKbps)}`,
    aac_bitrate_kbps: `${Math.round(aacBitrateKbps)}`
  });
  return request<ConversionState>(`/runs/${runId}/convert?${params.toString()}`, {
    method: "POST"
  });
}

export function convertedFileUrl(runId: string, format: string): string {
  return `${API_BASE}/runs/${runId}/conversions/${encodeURIComponent(format)}/download`;
}

export async function runMastering(
  runId: string,
  mode: "v1" | "v2" | "v3",
  preset: "streaming" | "club" | "film" | "voice",
  targetLufs: number | null,
  truePeakDbfs: number | null,
  optimizerVariants: number,
  normalizationProfile:
    | "off"
    | "youtube"
    | "spotify"
    | "apple_music"
    | "instagram"
    | "tiktok"
    | "broadcast_ebu"
    | "podcast_voice"
    | null = null,
  backend: "auto" | "internal" | "ffmpeg" | "pedalboard" | "matchering" = "internal",
  referenceRunId: string | null = null,
  maxRefinePasses = 3
): Promise<MasteringState> {
  const params = new URLSearchParams({
    mode,
    preset,
    optimizer_variants: `${Math.max(2, Math.min(8, Math.round(optimizerVariants)))}`,
    backend,
    max_refine_passes: `${Math.max(1, Math.min(5, Math.round(maxRefinePasses)))}`
  });
  if (targetLufs !== null && Number.isFinite(targetLufs)) {
    params.set("target_lufs", `${targetLufs}`);
  }
  if (truePeakDbfs !== null && Number.isFinite(truePeakDbfs)) {
    params.set("true_peak_dbfs", `${truePeakDbfs}`);
  }
  if (normalizationProfile) {
    params.set("normalization_profile", normalizationProfile);
  }
  if (referenceRunId) {
    params.set("reference_run_id", referenceRunId);
  }
  return request<MasteringState>(`/runs/${runId}/master?${params.toString()}`, {
    method: "POST"
  });
}

export function masteredFileUrl(runId: string, outputId: string): string {
  return `${API_BASE}/runs/${runId}/mastering/${encodeURIComponent(outputId)}/download`;
}

export function audioUrl(runId: string): string {
  return `${API_BASE}/runs/${runId}/audio`;
}

export function exportUrl(runId: string, kind: "json" | "html" | "pdf"): string {
  return `${API_BASE}/runs/${runId}/export/${kind}`;
}
