"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioWaveform, Disc3, Loader2, Square, Trash2 } from "lucide-react";

import { editorApi } from "@/lib/editor/api";
import { addAssetOnNewTrack } from "@/lib/editor/store";
import { emptyProjectState, type ProjectState } from "@/lib/editor/types";
import { generationApi, type Album, type CostEstimate, type FieldValues, type Overview } from "@/lib/generation/api";
import { cn } from "@/lib/utils";

const MAX_TRACKS = 20;
const GAP_SECONDS = 2;
const input =
  "w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50";
const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 text-sm font-semibold text-slate-950 " +
  "hover:bg-cyan-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:pointer-events-none disabled:opacity-40";
const quiet =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-semibold text-slate-100 " +
  "hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";

const STATUS_LABEL: Record<string, string> = {
  queued: "Waiting",
  writing: "Writing",
  generating: "Generating",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  running: "Running",
  partial: "Partly done",
};

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Put the finished, not yet placed songs one after another, each on its own track. */
async function placeAlbum(album: Album): Promise<void> {
  const project = await editorApi.getProject(album.project_id);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  let state: ProjectState = project.state ?? emptyProjectState();
  let cursor = state.clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), 0);
  if (cursor > 0) cursor += GAP_SECONDS;
  const placed: number[] = [];
  for (const track of [...album.tracks].sort((a, b) => a.index - b.index)) {
    if (track.status !== "done" || track.placed) continue;
    const asset = assets.get(track.asset_ids[0]);
    if (!asset) continue;
    state = addAssetOnNewTrack(state, asset, cursor).state;
    cursor += asset.duration_seconds + GAP_SECONDS;
    placed.push(track.index);
  }
  if (!placed.length) return;
  await editorApi.saveState(album.project_id, state);
  await generationApi.albumPlaced(album.id, placed);
}

export function AlbumPanel({ overview }: { overview: Overview }) {
  const router = useRouter();
  const usable = useMemo(() => overview.providers.filter((p) => p.enabled && p.status.ready), [overview]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const provider = usable.find((p) => p.id === providerId) ?? usable[0] ?? null;
  const has = (key: string) => provider?.schema.fields.some((f) => f.key === key && (!f.tasks || f.tasks.includes("text2music"))) ?? false;

  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [style, setStyle] = useState("");
  const [ideas, setIdeas] = useState("");
  const [seconds, setSeconds] = useState(150);
  const [instrumental, setInstrumental] = useState(false);
  const [writeLyrics, setWriteLyrics] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);

  const lines = ideas
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_TRACKS);

  const fields = useMemo(() => {
    const out: FieldValues = {};
    if (style.trim()) out.caption = style.trim();
    if (has("duration")) out.duration = seconds;
    if (instrumental && has("instrumental")) out.instrumental = true;
    return out;
    // `has` reads the provider, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, seconds, instrumental, provider]);

  const refresh = useCallback(() => {
    generationApi
      .albums()
      .then(setAlbums)
      .catch(() => undefined);
  }, []);

  // Load once, then follow albums that are still being made.
  const active = albums?.some((a) => a.status === "queued" || a.status === "running") ?? false;
  useEffect(() => {
    let stopped = false;
    generationApi
      .albums()
      .then((list) => !stopped && setAlbums(list))
      .catch(() => !stopped && setAlbums([]));
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  // An online album costs one song per track.
  const online = provider?.kind === "external";
  useEffect(() => {
    if (!online || !provider || !lines.length) return;
    const timer = setTimeout(() => {
      generationApi
        .estimate({
          params: { provider: provider.id, task: "text2music", fields: { ...fields, caption: fields.caption ?? lines[0] } }
        })
        .then((result) => setEstimate(result.estimate))
        .catch(() => setEstimate(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [online, provider, fields, lines.length, lines]);

  const start = async () => {
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      await generationApi.createAlbum({
        title: title.trim() || "Untitled album",
        provider: provider.id,
        concept: concept.trim(),
        fields,
        tracks: lines.map((idea) => ({ idea })),
        write_lyrics: writeLyrics,
      });
      setIdeas("");
      refresh();
    } catch (err) {
      setError(message(err, "The album could not be started."));
    } finally {
      setBusy(false);
    }
  };

  const open = async (album: Album) => {
    try {
      await placeAlbum(album);
      router.push(`/editor?project=${album.project_id}`);
    } catch (err) {
      setError(message(err, "The songs could not be placed in the editor."));
    }
  };

  const localMinutes = provider?.id === "acestep_local" ? Math.ceil((lines.length * (60 + seconds * 0.45)) / 60) : null;

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <section className="glass space-y-4 rounded-2xl border border-white/10 p-4" aria-label="New album">
        <div>
          <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
            <Disc3 className="h-5 w-5 text-cyan-300" aria-hidden /> Make an album
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Give one idea per song. The songs are written and generated one after another in the background, so you can
            close this page or leave it overnight; an album also continues after Music Suite restarts.
          </p>
        </div>
        {!provider ? (
          <p className="text-sm text-amber-200">No generator is ready. Install the local engine or add an online service in Settings.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                <span>Album title</span>
                <input className={cn(input, "h-10")} aria-label="Album title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Night Drives" />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                <span>Generator</span>
                <select aria-label="Generator" className={cn(input, "h-10")} value={provider.id} onChange={(e) => setProviderId(e.target.value)}>
                  {usable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>What the album is about</span>
              <textarea className={cn(input, "py-2")} aria-label="What the album is about" rows={2} maxLength={1000} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="A synth-pop album about driving through a city at night, from leaving to sunrise." />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>Shared style</span>
              <input className={cn(input, "h-10")} aria-label="Shared style" maxLength={1000} value={style} onChange={(e) => setStyle(e.target.value)} placeholder="dreamy synth-pop, airy female vocal, analog synths" />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>
                Songs, one idea per line ({lines.length} of up to {MAX_TRACKS})
              </span>
              <textarea
                className={cn(input, "py-2 leading-relaxed")}
                aria-label="Songs, one idea per line"
                rows={6}
                value={ideas}
                onChange={(e) => setIdeas(e.target.value)}
                placeholder={"Leaving the city lights behind\nThe empty coastal road\nA gas station at 3 a.m.\nSunrise over the bridge"}
              />
            </label>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {has("duration") ? (
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <span>Each song about</span>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    step={10}
                    aria-label="Length of each song in seconds"
                    value={seconds}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value)) setSeconds(Math.min(300, Math.max(30, value)));
                    }}
                    className={cn(input, "h-10 w-24 tabular-nums")}
                  />
                  <span className="text-xs text-slate-400">seconds</span>
                </label>
              ) : null}
              {has("instrumental") ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" aria-label="Instrumental" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
                  Instrumental
                </label>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" aria-label="Write lyrics and style for each song" checked={writeLyrics} onChange={(e) => setWriteLyrics(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
                Write lyrics and style for each song
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={cn("text-xs", online ? "text-amber-200" : "text-slate-400")}>
                {online && estimate && lines.length
                  ? `About $${(estimate.usd * lines.length).toFixed(2)} for ${lines.length} songs on your account (prices as of ${estimate.as_of}).`
                  : localMinutes
                    ? `Roughly ${localMinutes} minutes on this computer, one song at a time.`
                    : " "}
              </p>
              <button type="button" className={primary} disabled={busy || !lines.length || !provider} onClick={() => void start()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Disc3 className="h-4 w-4" aria-hidden />}
                Make {lines.length || ""} song{lines.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3" aria-label="Albums">
        {albums === null ? (
          <p className="py-6 text-center text-sm text-slate-400">Loading albums…</p>
        ) : albums.length === 0 ? (
          <p className="rounded-2xl bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-400">No albums yet.</p>
        ) : (
          albums.map((album) => {
            const running = album.status === "queued" || album.status === "running";
            return (
              <article key={album.id} className="glass rounded-2xl border border-white/10 p-4" aria-label={`Album ${album.title}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="display-font truncate text-base font-semibold text-slate-100">{album.title}</h3>
                    <p className="text-xs text-slate-400" aria-live="polite">
                      {STATUS_LABEL[album.status] ?? album.status} · {album.done} of {album.total} songs ready
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {album.done > 0 ? (
                      <button type="button" className={cn(quiet, "bg-cyan-400 text-slate-950 hover:bg-cyan-300")} onClick={() => void open(album)}>
                        <AudioWaveform className="h-4 w-4" aria-hidden /> Open in Studio Editor
                      </button>
                    ) : null}
                    {running ? (
                      <button
                        type="button"
                        className={quiet}
                        onClick={() => void generationApi.cancelAlbum(album.id).then(refresh).catch((err: unknown) => setError(message(err, "Could not cancel.")))}
                      >
                        <Square className="h-3.5 w-3.5" aria-hidden /> Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={cn(quiet, "w-10 px-0")}
                        aria-label={`Remove album ${album.title} from the list`}
                        title="Remove from the list (the project and songs are kept)"
                        onClick={() => void generationApi.deleteAlbum(album.id).then(refresh).catch((err: unknown) => setError(message(err, "Could not remove.")))}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
                <ol className="mt-3 space-y-1.5">
                  {album.tracks.map((track) => (
                    <li key={track.index} className="flex items-center gap-3 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-500">{track.index}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-200">{track.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          track.status === "done" && "bg-emerald-500/15 text-emerald-300",
                          track.status === "failed" && "bg-rose-500/15 text-rose-300",
                          (track.status === "generating" || track.status === "writing") && "bg-cyan-400/15 text-cyan-200",
                          (track.status === "queued" || track.status === "cancelled") && "bg-slate-800 text-slate-400"
                        )}
                        title={track.error ?? track.detail}
                      >
                        {STATUS_LABEL[track.status] ?? track.status}
                        {track.status === "generating" ? ` ${Math.round(track.progress)}%` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
                {album.tracks.some((t) => t.status === "failed") ? (
                  <p className="mt-2 text-xs text-rose-200">
                    {album.tracks.find((t) => t.status === "failed")?.error}
                  </p>
                ) : null}
              </article>
            );
          })
        )}
      </section>
      <p className="text-xs text-slate-500">
        Each album is its own project. Opening it places the finished songs one after another on separate tracks.{" "}
        <Link href="/editor" className="underline">
          All projects
        </Link>
      </p>
    </div>
  );
}
