/**
 * Sound files (.mssound): a synth sound or a plugin instrument's sound saved to disk,
 * so it can be backed up, moved to another computer or shared.
 */
import { normalizePatch, type Patch } from "@/lib/editor/synth";
import { downloadBlob } from "@/lib/editor/wav";

export const SOUND_FILE_EXTENSION = ".mssound";
const FORMAT = "music-suite-sound";
/** A plugin's saved state can be large; anything bigger than this is not a sound file. */
const MAX_FILE_BYTES = 24 * 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export type SoundFile =
  | { kind: "synth"; patch: Patch }
  | { kind: "plugin"; plugin: string; name: string; state: string };

function fileName(name: string): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").trim().slice(0, 80);
  return `${clean || "Sound"}${SOUND_FILE_EXTENSION}`;
}

export function serializeSound(sound: SoundFile): string {
  const body = sound.kind === "synth" ? { patch: sound.patch } : { plugin: sound.plugin, name: sound.name, state: sound.state };
  return JSON.stringify({ format: FORMAT, version: 1, kind: sound.kind, ...body }, null, sound.kind === "synth" ? 2 : 0);
}

export function exportSound(sound: SoundFile): void {
  const name = sound.kind === "synth" ? sound.patch.name : `${sound.name} (${sound.plugin})`;
  downloadBlob(new Blob([serializeSound(sound)], { type: "application/json" }), fileName(name));
}

/** Read a sound file's text. Throws an Error with a message fit to show. */
export function parseSound(text: string): SoundFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not a Music Suite sound.");
  }
  const data = (raw ?? {}) as Record<string, unknown>;
  if (data.format !== FORMAT) throw new Error("That file is not a Music Suite sound.");
  if (typeof data.version !== "number" || data.version > 1) throw new Error("That sound was saved by a newer Music Suite. Update to open it.");
  if (data.kind === "synth" && data.patch && typeof data.patch === "object") {
    return { kind: "synth", patch: normalizePatch(data.patch) };
  }
  if (data.kind === "plugin" && typeof data.state === "string" && typeof data.plugin === "string") {
    const state = data.state;
    if (!state || state.length % 4 !== 0 || !BASE64.test(state)) throw new Error("That sound file is damaged.");
    const name = typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 120) : "Imported sound";
    return { kind: "plugin", plugin: data.plugin.slice(0, 120), name, state };
  }
  throw new Error("That file is not a Music Suite sound.");
}

export async function readSoundFile(file: File): Promise<SoundFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error("That file is too large to be a sound.");
  return parseSound(await file.text());
}

/* ---------- Favourite plugin sounds (this browser) ---------- */

const FAVOURITES_KEY = "music-suite-plugin-favourites";

/** Ids of the library sounds starred for a plugin. */
export function loadFavourites(pluginId: string): string[] {
  try {
    const all = JSON.parse(window.localStorage.getItem(FAVOURITES_KEY) ?? "{}") as Record<string, unknown>;
    const list = all[pluginId];
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
  } catch {
    return [];
  }
}

export function toggleFavourite(pluginId: string, soundId: string): string[] {
  const current = loadFavourites(pluginId);
  const next = current.includes(soundId) ? current.filter((id) => id !== soundId) : [...current, soundId];
  try {
    const all = JSON.parse(window.localStorage.getItem(FAVOURITES_KEY) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify({ ...all, [pluginId]: next }));
  } catch {
    /* storage unavailable: favourites last for this visit */
  }
  return next;
}
