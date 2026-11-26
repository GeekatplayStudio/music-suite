"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioWaveform, Disc3, Loader2, Square, Trash2 } from "lucide-react";

import { editorApi } from "@/lib/editor/api";
import { addAssetOnNewTrack } from "@/lib/editor/store";
import { emptyProjectState, type ProjectState } from "@/lib/editor/types";
import { generationApi, type Album, type CostEstimate, type FieldValues, type Overview } from "@/lib/generation/api";
import { useI18n } from "@/lib/i18n";
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

/** Album and song states with a label in the dictionary (studioTabs.album.status.*). */
const STATUSES = ["queued", "writing", "generating", "done", "failed", "cancelled", "running", "partial"] as const;
const isStatus = (value: string): value is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(value);

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
  const { t, tp, locale } = useI18n();
  const statusLabel = (status: string) => (isStatus(status) ? t(`studioTabs.album.status.${status}`) : status);
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
        title: title.trim() || t("studioTabs.album.untitled"),
        provider: provider.id,
        concept: concept.trim(),
        fields,
        tracks: lines.map((idea) => ({ idea })),
        write_lyrics: writeLyrics,
      });
      setIdeas("");
      refresh();
    } catch (err) {
      setError(message(err, t("studioTabs.album.startFailed")));
    } finally {
      setBusy(false);
    }
  };

  const open = async (album: Album) => {
    try {
      await placeAlbum(album);
      router.push(`/editor?project=${album.project_id}`);
    } catch (err) {
      setError(message(err, t("studioTabs.album.placeFailed")));
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

      <section className="glass space-y-4 rounded-2xl border border-white/10 p-4" aria-label={t("studioTabs.album.newAlbum")}>
        <div>
          <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
            <Disc3 className="h-5 w-5 text-cyan-300" aria-hidden /> {t("studioTabs.album.make")}
          </h2>
          <p className="mt-1 text-sm text-slate-400">{t("studioTabs.album.intro")}</p>
        </div>
        {!provider ? (
          <p className="text-sm text-amber-200">{t("studioTabs.album.noGenerator")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                <span>{t("studioTabs.album.albumTitle")}</span>
                <input className={cn(input, "h-10")} aria-label={t("studioTabs.album.albumTitle")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t("studioTabs.album.titlePlaceholder")} />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-300">
                <span>{t("studioTabs.album.generator")}</span>
                <select aria-label={t("studioTabs.album.generator")} className={cn(input, "h-10")} value={provider.id} onChange={(e) => setProviderId(e.target.value)}>
                  {usable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>{t("studioTabs.album.about")}</span>
              <textarea className={cn(input, "py-2")} aria-label={t("studioTabs.album.about")} rows={2} maxLength={1000} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={t("studioTabs.album.aboutPlaceholder")} />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>{t("studioTabs.album.sharedStyle")}</span>
              <input className={cn(input, "h-10")} aria-label={t("studioTabs.album.sharedStyle")} maxLength={1000} value={style} onChange={(e) => setStyle(e.target.value)} placeholder={t("studioTabs.album.stylePlaceholder")} />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>{t("studioTabs.album.songs", { count: lines.length, max: MAX_TRACKS })}</span>
              <textarea
                className={cn(input, "py-2 leading-relaxed")}
                aria-label={t("studioTabs.album.songsLabel")}
                rows={6}
                value={ideas}
                onChange={(e) => setIdeas(e.target.value)}
                placeholder={t("studioTabs.album.songsPlaceholder")}
              />
            </label>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {has("duration") ? (
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <span>{t("studioTabs.album.eachAbout")}</span>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    step={10}
                    aria-label={t("studioTabs.album.lengthLabel")}
                    value={seconds}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value)) setSeconds(Math.min(300, Math.max(30, value)));
                    }}
                    className={cn(input, "h-10 w-24 tabular-nums")}
                  />
                  <span className="text-xs text-slate-400">{t("studioTabs.album.seconds")}</span>
                </label>
              ) : null}
              {has("instrumental") ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" aria-label={t("studioTabs.album.instrumental")} checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
                  {t("studioTabs.album.instrumental")}
                </label>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" aria-label={t("studioTabs.album.writeLyrics")} checked={writeLyrics} onChange={(e) => setWriteLyrics(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
                {t("studioTabs.album.writeLyrics")}
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={cn("text-xs", online ? "text-amber-200" : "text-slate-400")}>
                {online && estimate && lines.length
                  ? tp("studioTabs.album.onlineCost", lines.length, {
                      usd: (estimate.usd * lines.length).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                      date: estimate.as_of
                    })
                  : localMinutes
                    ? tp("studioTabs.album.localTime", localMinutes)
                    : " "}
              </p>
              <button type="button" className={primary} disabled={busy || !lines.length || !provider} onClick={() => void start()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Disc3 className="h-4 w-4" aria-hidden />}
                {lines.length ? tp("studioTabs.album.makeSongs", lines.length) : t("studioTabs.album.makeNone")}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-3" aria-label={t("studioTabs.album.albums")}>
        {albums === null ? (
          <p className="py-6 text-center text-sm text-slate-400">{t("studioTabs.album.loading")}</p>
        ) : albums.length === 0 ? (
          <p className="rounded-2xl bg-slate-900/70 px-4 py-8 text-center text-sm text-slate-400">{t("studioTabs.album.none")}</p>
        ) : (
          albums.map((album) => {
            const running = album.status === "queued" || album.status === "running";
            return (
              <article key={album.id} className="glass rounded-2xl border border-white/10 p-4" aria-label={t("studioTabs.album.albumLabel", { title: album.title })}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="display-font truncate text-base font-semibold text-slate-100">{album.title}</h3>
                    <p className="text-xs text-slate-400" aria-live="polite">
                      {t("studioTabs.album.ready", { status: statusLabel(album.status), done: album.done, total: album.total })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {album.done > 0 ? (
                      <button type="button" className={cn(quiet, "bg-cyan-400 text-slate-950 hover:bg-cyan-300")} onClick={() => void open(album)}>
                        <AudioWaveform className="h-4 w-4" aria-hidden /> {t("studioTabs.album.openEditor")}
                      </button>
                    ) : null}
                    {running ? (
                      <button
                        type="button"
                        className={quiet}
                        onClick={() => void generationApi.cancelAlbum(album.id).then(refresh).catch((err: unknown) => setError(message(err, t("studioTabs.album.cancelFailed"))))}
                      >
                        <Square className="h-3.5 w-3.5" aria-hidden /> {t("studioTabs.album.stop")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={cn(quiet, "w-10 px-0")}
                        aria-label={t("studioTabs.album.removeLabel", { title: album.title })}
                        title={t("studioTabs.album.removeTitle")}
                        onClick={() => void generationApi.deleteAlbum(album.id).then(refresh).catch((err: unknown) => setError(message(err, t("studioTabs.album.removeFailed"))))}
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
                        {statusLabel(track.status)}
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
        {t("studioTabs.album.footer")}{" "}
        <Link href="/editor" className="underline">
          {t("studioTabs.album.allProjects")}
        </Link>
      </p>
    </div>
  );
}
