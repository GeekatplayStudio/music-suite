"use client";

import { useEffect, useRef, useState } from "react";
import { generationApi, type LocalRuntime, type RuntimeReview } from "@/lib/generation/api";
import { formatBytes } from "@/lib/addons/api";
import { useI18n } from "@/lib/i18n";

const names: Record<string, string> = {
  acestep_local: "ACE-Step 1.5 / XL", heartmula: "HeartMuLa 3B", stable_audio3: "Stable Audio 3",
  minimax3: "MiniMax Music 3", diffrhythm: "DiffRhythm", magenta_rt2: "Magenta RealTime 2",
  yue2: "YuE2 3B", mega53: "MVSep Mega 53", "sam-audio": "Meta SAM Audio"
};
// "Installing…" also marks a start requested here; the backend reports the same English texts,
// which is what these compare against. Only their display is translated.
const INSTALLING = "Installing…";
const installing = (row: LocalRuntime) => [INSTALLING, "Downloading reviewed checkpoints…"].includes(row.message);
const hasUpdate = (row: LocalRuntime) => Boolean((row.latest && row.latest !== row.revision) || row.dependency_updates?.length || row.checkpoint_updates?.length);

export function LocalDownloads({ settings, onChanged, only }: {
  settings: boolean; onChanged: () => Promise<void>; only?: string[];
}) {
  const { t, tp } = useI18n();
  // The first check runs once; it reads the current language through this ref.
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const [rows, setRows] = useState<LocalRuntime[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [review, setReview] = useState<RuntimeReview | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [refreshRuntime, setRefreshRuntime] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<string[]>([]);
  const running = rows.some(installing);
  useEffect(() => {
    let active = true;
    generationApi.localRuntimes(true).then(result => { if (active) setRows(result); })
      .catch(() => { if (active) setError(tRef.current("source.downloads.loadError")); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!running) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const next = await generationApi.localRuntimes();
        if (!active) return;
        setRows(old => next.map(row => ({ ...old.find(item => item.id === row.id), ...row,
          latest: old.find(item => item.id === row.id)?.latest ?? null })));
        if (!next.some(installing)) await onChanged();
      } catch { if (active) setError(t("source.downloads.progressError")); }
    }, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [running, onChanged, t]);
  async function openReview(row: LocalRuntime) {
    setBusy(row.id); setError(""); setReview(null);
    try { setReview(await generationApi.reviewRuntime(row.id, selected[row.id] || row.variant, refreshRuntime[row.id] ?? false)); }
    catch (err) { setError(err instanceof Error ? err.message : t("source.downloads.reviewError")); }
    finally { setBusy(""); }
  }
  async function install(plan: RuntimeReview) {
    setBusy(plan.id); setError("");
    try {
      await generationApi.installRuntime(plan.id, plan.revision, plan.review_id);
      setRows(old => old.map(row => row.id === plan.id ? { ...row, message: INSTALLING } : row));
      setReview(null);
    } catch (err) { setError(err instanceof Error ? err.message : t("source.downloads.installError")); }
    finally { setBusy(""); }
  }
  const visible = rows.filter(row => (!only || only.includes(row.id)) && (settings || (hasUpdate(row) && !hidden.includes(row.id))));
  if (!visible.length && !(settings && error)) return null;
  return <section className="glass space-y-3 rounded-2xl border border-white/10 p-4">
    <h2 className="display-font font-semibold">{settings ? t("source.downloads.titleSettings") : t("source.downloads.titleUpdates")}</h2>
    <p className="text-xs text-slate-400">{t("source.downloads.intro")}</p>
    {visible.map(row => <div key={row.id} className="space-y-2 rounded-xl bg-slate-900/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong>{names[row.id] ?? row.id}</strong>
        <button className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          disabled={!!busy || installing(row) || !row.supported} onClick={() => void openReview(row)}>
          {busy === row.id ? t("source.downloads.checking") : row.revision ? t("source.downloads.reviewUpdate") : t("source.downloads.review")}
        </button>
      </div>
      <p className="text-sm text-slate-300">{row.hardware}</p>
      {!row.supported && <p className="text-sm text-amber-200">{row.reason}</p>}
      {settings && row.variants.length > 1 && <label className="block text-sm">{t("source.downloads.checkpoint")}
        <select aria-label={t("source.downloads.checkpointLabel", { name: names[row.id] ?? row.id })} value={selected[row.id] || row.variant}
          onChange={event => { setSelected({ ...selected, [row.id]: event.target.value }); setReview(null); }}
          className="ml-3 rounded-lg bg-slate-800 p-2">
          {row.variants.map(variant => <option key={variant}>{variant}</option>)}
        </select>
      </label>}
      {row.revision && <p className="text-xs text-slate-400">{t("source.downloads.installed", { revision: row.revision.slice(0,8) })}{row.latest && row.latest !== row.revision ? ` → ${row.latest.slice(0,8)}` : ""}</p>}
      {row.revision && <label className="flex gap-2 text-xs text-slate-300"><input type="checkbox"
        checked={refreshRuntime[row.id] ?? false} onChange={event => { setRefreshRuntime({ ...refreshRuntime, [row.id]: event.target.checked }); setReview(null); }} />{t("source.downloads.rebuild")}</label>}
      {!!row.dependency_updates?.length && <details className="text-xs text-slate-300"><summary>{tp("source.downloads.libraryUpdates", row.dependency_updates.length)}</summary>
        <p>{t("source.downloads.libraryNote")}</p>
        {row.dependency_updates.map(dep => <p key={dep.name}>{dep.name}: {dep.version} → {dep.latest_version}</p>)}
      </details>}
      {!!row.checkpoint_updates?.length && <p className="text-xs text-cyan-200">{t("source.downloads.checkpointUpdates")}</p>}
      {row.check_error && <p role="status" className="text-xs text-amber-200">{row.check_error}</p>}
      {row.message && <p role="status" className="break-words text-sm">{row.message === INSTALLING ? t("source.downloads.installing") : row.message}</p>}
      {review?.id === row.id && <div className="space-y-3 border-t border-white/10 pt-3 text-sm">
        <p>{t("source.downloads.reviewLine", { revision: review.revision.slice(0,8), variant: review.variant })}</p>
        <p>{review.download_bytes !== null ? t("source.downloads.downloadSize", { size: formatBytes(review.download_bytes) }) : t("source.downloads.sizeUnknown")}</p>
        {review.checkpoints.map(model => <div key={model.repo} className="rounded-lg bg-slate-800 p-2">
          <a className="text-cyan-300 underline" href={model.url} target="_blank" rel="noreferrer">{model.repo}</a>
          <p>{model.bytes !== null ? formatBytes(model.bytes) : t("source.downloads.modelSizeUnknown")} · {model.license || t("source.downloads.licenceUnknown")} · {model.revision?.slice(0,8) || t("source.downloads.revisionUnknown")}</p>
          {model.gated && <p className="text-amber-200">{t("source.downloads.gated")}</p>}
          {model.error && <p role="alert">{model.error}</p>}
        </div>)}
        <a className="text-cyan-300 underline" href={`https://github.com/${row.repo}`} target="_blank" rel="noreferrer">{t("source.downloads.docs")}</a>
        <p>{review.note}</p>
        <div className="flex gap-4">
          <button className="rounded-lg bg-cyan-400 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40"
            disabled={!!busy || !review.supported || review.checkpoints.some(model => !!model.error)} onClick={() => void install(review)}>
            {t("source.downloads.confirm")}
          </button><button onClick={() => setReview(null)}>{t("common.cancel")}</button>
        </div>
      </div>}
      {!settings && <button className="text-xs underline" onClick={() => setHidden([...hidden, row.id])}>{t("source.downloads.later")}</button>}
    </div>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
