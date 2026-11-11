/** Optional engines and models: what is installed, and installing more (``/addons``). */

const BASE = "/suite-api/addons";
// Installs change Music Suite's environment, so the API wants this header on every change.
const ACTION = { "X-Music-Suite-Action": "addons" };

export interface AddonInstallState {
  running: boolean;
  pack: string | null;
  step: string;
  percent: number;
  detail: string;
  error: string | null;
  finished_at: number | null;
  log: string[];
}

export interface AddonPack {
  id: string;
  label: string;
  summary: string;
  unlocks: string[];
  download_note: string;
  installed: boolean;
  versions: Record<string, string | null>;
}

export interface AddonModel {
  file: string;
  label: string;
  used_for: string;
  default: boolean;
  downloaded: boolean;
}

export interface AddonsOverview {
  gpu: { vendor: string; name: string; memory_gb?: number | null; driver?: string } | null;
  torch: {
    installed: boolean;
    version?: string;
    cuda?: boolean;
    plan: { index: string | null; build: string; device: string; note?: string };
  };
  packs: AddonPack[];
  models: AddonModel[];
  models_bytes: number;
  install: AddonInstallState;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new Error("Could not reach the Music Suite API. Restart Music Suite with its start launcher.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const addonsApi = {
  overview: () => request<AddonsOverview>(""),
  installState: () => request<AddonInstallState>("/install"),
  installPack: (packId: string, models: string[]) =>
    request<AddonInstallState>(`/packs/${packId}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ACTION },
      body: JSON.stringify({ models })
    }),
  downloadModel: (file: string) =>
    request<AddonInstallState>(`/models/${encodeURIComponent(file)}/download`, { method: "POST", headers: ACTION }),
  deleteModels: () => request<{ freed_bytes: number }>("/models", { method: "DELETE", headers: ACTION })
};

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}
