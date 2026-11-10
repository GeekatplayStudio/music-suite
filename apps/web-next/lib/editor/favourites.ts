import type { JobOp } from "@/lib/editor/types";

export interface ProcessStep {
  op: JobOp;
  params: Record<string, unknown>;
  label: string;
}

export interface Favourite {
  id: string;
  name: string;
  steps: ProcessStep[];
}

const KEY = "music-suite-editor-favourites";
const EMPTY: Favourite[] = [];
let cache: Favourite[] | null = null;
const listeners = new Set<() => void>();

function read(): Favourite[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? (parsed as Favourite[]).filter((f) => f && Array.isArray(f.steps)) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: Favourite[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: favourites last for this visit only */
  }
  for (const listener of listeners) listener();
}

/** Saved processing chains, kept in this browser. Shaped for useSyncExternalStore. */
export const favouriteStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: read,
  getServerSnapshot: (): Favourite[] => EMPTY,
  add(name: string, steps: ProcessStep[]): void {
    write([...read(), { id: crypto.randomUUID(), name, steps }]);
  },
  remove(id: string): void {
    write(read().filter((f) => f.id !== id));
  }
};
