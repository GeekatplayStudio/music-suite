import type {
  Asset,
  Capabilities,
  GenerationStatus,
  Job,
  JobOp,
  PluginInfo,
  ProjectDetail,
  ProjectState,
  ProjectSummary,
  SongCloudProvider,
  SongEnginesStatus,
  SongKeyStatus,
  SongParams
} from "@/lib/editor/types";

const BASE = "/suite-api/editor";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new Error("Could not reach the Music Suite API. Restart Music Suite with its start launcher.");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const editorApi = {
  capabilities: () => request<Capabilities>("/capabilities"),
  /** Whether a local ComfyUI with the generator nodes is reachable. */
  generation: () => request<GenerationStatus>("/generation"),
  /** Song engines (local ACE-Step / YuE2, cloud ElevenLabs / fal.ai) and whether each can run. */
  songEngines: () => request<SongEnginesStatus>("/songs"),
  /** Keys are write-only: the API reports whether one is set, never the key itself. */
  saveSongKey: (provider: SongCloudProvider, key: string) =>
    request<Record<SongCloudProvider, SongKeyStatus>>(`/songs/keys/${provider}`, {
      ...json({ key }),
      headers: { "Content-Type": "application/json", "X-Music-Suite-Action": "save-key" }
    }),
  removeSongKey: (provider: SongCloudProvider) =>
    request<Record<SongCloudProvider, SongKeyStatus>>(`/songs/keys/${provider}`, {
      method: "DELETE",
      headers: { "X-Music-Suite-Action": "save-key" }
    }),
  /** Generate a whole song; it has no source asset. */
  startSong: (id: string, params: SongParams) =>
    request<Job>(`/projects/${id}/jobs`, json({ op: "song", asset_id: null, params })),
  plugins: () => request<{ available: boolean; plugins: PluginInfo[] }>("/plugins"),
  /** Loads the plugin on the server (in an isolated process) to read its parameters. */
  describePlugin: (pluginId: string) => request<PluginInfo>(`/plugins/${pluginId}`),
  listProjects: () => request<ProjectSummary[]>("/projects"),
  createProject: (name: string) => request<ProjectDetail>("/projects", json({ name })),
  getProject: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  renameProject: (id: string, name: string) =>
    request<ProjectSummary>(`/projects/${id}/rename`, json({ name })),
  deleteProject: (id: string) => request<{ deleted: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  saveState: (id: string, state: ProjectState) =>
    request<{ ok: boolean; updated_at: string }>(`/projects/${id}/state`, json(state)),
  uploadAsset: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Asset>(`/projects/${id}/assets`, { method: "POST", body: form });
  },
  importRun: (id: string, runId: string) =>
    request<Asset>(`/projects/${id}/assets/from-run/${runId}`, { method: "POST" }),
  deleteAsset: (id: string, assetId: string) =>
    request<{ deleted: boolean }>(`/projects/${id}/assets/${assetId}`, { method: "DELETE" }),
  assetAudioUrl: (id: string, assetId: string) => `${BASE}/projects/${id}/assets/${assetId}/audio`,
  startJob: (id: string, op: JobOp, assetId: string, params: Record<string, unknown>) =>
    request<Job>(`/projects/${id}/jobs`, json({ op, asset_id: assetId, params })),
  getJob: (id: string, jobId: string) => request<Job>(`/projects/${id}/jobs/${jobId}`),
  /** Encode a rendered WAV to MP3 or FLAC with the suite's FFmpeg. */
  encode: async (wav: Blob, format: "mp3" | "flac"): Promise<Blob> => {
    const form = new FormData();
    form.append("file", new File([wav], "mix.wav", { type: "audio/wav" }));
    const res = await fetch(`${BASE}/export/${format}`, { method: "POST", body: form, cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
      throw new Error(typeof body?.detail === "string" ? body.detail : `Encoding failed (${res.status})`);
    }
    return res.blob();
  }
};
