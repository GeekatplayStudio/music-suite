import { editorApi } from "@/lib/editor/api";
import type { EditorEngine } from "@/lib/editor/engine";
import { type Peaks, computePeaks, parsePeaks } from "@/lib/editor/peaks";

type Listener = (loaded: boolean) => void;

/** Fetches, decodes and summarises asset audio once per asset. */
export class MediaStore {
  private requested = new Set<string>();
  private peaks = new Map<string, Peaks>();
  private listeners = new Set<Listener>();

  constructor(
    private engine: EditorEngine,
    private projectId: string
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  peaksFor(assetId: string): Peaks | undefined {
    return this.peaks.get(assetId);
  }

  ensure(assetId: string): void {
    if (this.requested.has(assetId)) return;
    this.requested.add(assetId);
    void this.load(assetId);
  }

  private async load(assetId: string): Promise<void> {
    let loaded = true;
    // The small overview arrives first, so waveforms appear before the audio has decoded.
    void fetch(`${editorApi.assetAudioUrl(this.projectId, assetId).replace(/audio$/, "peaks")}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((data) => {
        const overview = data ? parsePeaks(data) : null;
        if (!overview || this.peaks.has(assetId)) return;
        this.peaks.set(assetId, overview);
        for (const listener of this.listeners) listener(true);
      })
      .catch(() => undefined);
    try {
      const res = await fetch(editorApi.assetAudioUrl(this.projectId, assetId), { cache: "no-store" });
      if (!res.ok) throw new Error(`Audio request failed (${res.status})`);
      const buffer = await this.engine.decode(assetId, await res.arrayBuffer());
      this.peaks.set(assetId, computePeaks(buffer));
    } catch {
      this.requested.delete(assetId);
      loaded = false;
    }
    for (const listener of this.listeners) listener(loaded);
  }
}
