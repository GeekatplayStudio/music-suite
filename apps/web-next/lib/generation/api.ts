import type { Job } from "@/lib/editor/types";

const BASE = "/suite-api";

export type FieldType = "text" | "lyrics" | "int" | "float" | "bool" | "enum" | "seed" | "model";
export type FieldValue = string | number | boolean | null;
export type FieldValues = Record<string, FieldValue>;

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  type: FieldType;
  group: string;
  label: string;
  help?: string;
  required?: boolean;
  /** May be left empty so the model decides. */
  auto?: boolean;
  advanced?: boolean;
  multiline?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default?: FieldValue;
  options?: (FieldOption | string)[];
  sections?: string[];
  tasks?: string[];
  required_tasks?: string[];
  /** Filled in by the editor (for example, a highlighted range); never shown as a control. */
  editor?: boolean;
}

export interface ProviderTask {
  id: string;
  label: string;
  /** True for tasks that change an existing clip. */
  source?: boolean;
  available?: boolean;
  reason?: string;
}

export interface ProviderSchema {
  tasks: ProviderTask[];
  groups: string[];
  fields: FieldSpec[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  kind: "local" | "external";
  enabled: boolean;
  status: {
    ready: boolean;
    message: string;
    running?: boolean;
    key?: { configured: boolean; source: "environment" | "keychain" | "file" | null; env: string };
    terms_url?: string;
  };
  schema: ProviderSchema;
}

export interface SetupState {
  running: boolean;
  step: string;
  percent: number;
  detail: string;
  error: string | null;
  download_gb?: number;
  editing_download_gb?: number;
  installed?: boolean;
}

export interface GenerationSettings {
  engine_dir: string;
  engine_dir_default: boolean;
  idle_minutes: number;
  min_free_percent: number;
  writer_model: string;
  normalize: boolean;
  target_lufs: number;
  providers: Record<string, boolean>;
}

export interface WriterStatus {
  available: boolean;
  model: string;
  model_installed: boolean;
  models: string[];
}

export interface Overview {
  providers: ProviderInfo[];
  planned: { id: string; name: string; kind: string; message: string }[];
  writer: WriterStatus;
  engine: {
    built: boolean;
    installed: boolean;
    running: boolean;
    missing_models: string[];
    editing_ready?: boolean;
  };
  setup: SetupState;
  memory_free_percent: number | null;
  settings: GenerationSettings;
}

export interface SongBrief {
  title: string;
  caption: string;
  lyrics: string;
  bpm?: number;
  keyscale?: string;
  timesignature?: string;
  vocal_language?: string;
  duration?: number;
}

export interface HistoryRecord {
  id: string;
  created_at: string;
  provider: string;
  task: string;
  title: string;
  fields: FieldValues;
  project_id: string;
  asset_ids: string[];
  seconds_taken: number;
  outputs: Record<string, unknown>[];
}

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

export const generationApi = {
  overview: () => request<Overview>("/generation/providers"),
  saveSettings: (patch: Partial<GenerationSettings>) =>
    request<GenerationSettings>("/generation/settings", json(patch)),
  startSetup: (writer: boolean, editing = false) =>
    request<SetupState>("/generation/setup", json({ writer, editing })),
  setupState: () => request<SetupState>("/generation/setup"),
  /** Saves the key in this computer's keychain and switches the service on. The key is never sent back. */
  saveKey: (providerId: string, key: string) =>
    request<{ configured: boolean }>(`/generation/providers/${providerId}/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Music-Suite-Action": "generation-key" },
      body: JSON.stringify({ key })
    }),
  removeKey: (providerId: string) =>
    request<{ configured: boolean }>(`/generation/providers/${providerId}/key`, {
      method: "DELETE",
      headers: { "X-Music-Suite-Action": "generation-key" }
    }),
  stopEngine: () => request<{ running: boolean }>("/generation/engine/stop", { method: "POST" }),
  write: (body: { mode: "brief" | "lyrics"; idea: string; caption?: string; lyrics?: string; instrumental?: boolean }) =>
    request<{ brief: SongBrief; engine: string }>("/generation/lyrics", json(body)),
  history: () => request<HistoryRecord[]>("/generation/history"),
  deleteHistory: (id: string) => request<{ deleted: boolean }>(`/generation/history/${id}`, { method: "DELETE" }),
  startSong: (projectId: string, params: { provider: string; task: string; title: string; fields: FieldValues }) =>
    request<Job>(`/editor/projects/${projectId}/jobs`, json({ op: "generate_song", asset_id: null, params })),
  cancelJob: (projectId: string, jobId: string) =>
    request<Job>(`/editor/projects/${projectId}/jobs/${jobId}/cancel`, { method: "POST" })
};

export function optionValue(option: FieldOption | string): string {
  return typeof option === "string" ? option : option.value;
}

export function optionLabel(option: FieldOption | string): string {
  return typeof option === "string" ? option : option.label;
}

/** Starting values for a schema: declared defaults, everything else unset. */
export function defaultValues(schema: ProviderSchema): FieldValues {
  const values: FieldValues = {};
  for (const field of schema.fields) {
    if (field.default !== undefined) values[field.key] = field.default;
    else if (field.type === "text" || field.type === "lyrics") values[field.key] = "";
    else values[field.key] = null;
  }
  return values;
}

/** Only what the server should see: unset and empty optional fields are left out. */
export function submitValues(schema: ProviderSchema, values: FieldValues, task = "text2music"): FieldValues {
  const out: FieldValues = {};
  for (const field of schema.fields) {
    if (field.editor || (field.tasks && !field.tasks.includes(task))) continue;
    const value = values[field.key];
    if (value === null || value === undefined || value === "") continue;
    out[field.key] = value;
  }
  return out;
}
