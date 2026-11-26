"use client";

import { useEffect, useState } from "react";
import { generationApi, type LocalRuntime, type RuntimeReview } from "@/lib/generation/api";
import { formatBytes } from "@/lib/addons/api";

const names: Record<string, string> = {
  acestep_local: "ACE-Step 1.5 / XL", heartmula: "HeartMuLa 3B", stable_audio3: "Stable Audio 3",
  minimax3: "MiniMax Music 3", diffrhythm: "DiffRhythm", magenta_rt2: "Magenta RealTime 2",
  yue2: "YuE2 3B", mega53: "MVSep Mega 53", "sam-audio": "Meta SAM Audio"
};
const installing = (row: LocalRuntime) => ["Installing…", "Downloading reviewed checkpoints…"].includes(row.message);
const hasUpdate = (row: LocalRuntime) => Boolean((row.latest && row.latest !== row.revision) || row.dependency_updates?.length || row.checkpoint_updates?.length);

export function LocalDownloads({ settings, onChanged, only }: {
  settings: boolean; onChanged: () => Promise<void>; only?: string[];
}) {
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
      .catch(() => { if (active) setError("Could not check local model versions. Installed models remain available."); });
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
      } catch { if (active) setError("Could not read installation progress."); }
    }, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [running, onChanged]);
  async function openReview(row: LocalRuntime) {
    setBusy(row.id); setError(""); setReview(null);
    try { setReview(await generationApi.reviewRuntime(row.id, selected[row.id] || row.variant, refreshRuntime[row.id] ?? false)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not review this download."); }
    finally { setBusy(""); }
  }
  async function install(plan: RuntimeReview) {
    setBusy(plan.id); setError("");
    try {
      await generationApi.installRuntime(plan.id, plan.revision, plan.review_id);
      setRows(old => old.map(row => row.id === plan.id ? { ...row, message: "Installing…" } : row));
      setReview(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Installation failed."); }
    finally { setBusy(""); }
  }
  const visible = rows.filter(row => (!only || only.includes(row.id)) && (settings || (hasUpdate(row) && !hidden.includes(row.id))));
  if (!visible.length && !(settings && error)) return null;
  return <section className="glass space-y-3 rounded-2xl border border-white/10 p-4">
    <h2 className="display-font font-semibold">{settings ? "Local model downloads and updates" : "Local model updates available"}</h2>
    <p className="text-xs text-slate-400">Downloads and updates happen only after review and confirmation. Keep using the installed version by choosing Later.</p>
    {visible.map(row => <div key={row.id} className="space-y-2 rounded-xl bg-slate-900/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <strong>{names[row.id] ?? row.id}</strong>
        <button className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          disabled={!!busy || installing(row) || !row.supported} onClick={() => void openReview(row)}>
          {busy === row.id ? "Checking…" : row.revision ? "Review models / update" : "Review download"}
        </button>
      </div>
      <p className="text-sm text-slate-300">{row.hardware}</p>
      {!row.supported && <p className="text-sm text-amber-200">{row.reason}</p>}
      {settings && row.variants.length > 1 && <label className="block text-sm">Checkpoint
        <select aria-label={`${names[row.id]} checkpoint`} value={selected[row.id] || row.variant}
          onChange={event => { setSelected({ ...selected, [row.id]: event.target.value }); setReview(null); }}
          className="ml-3 rounded-lg bg-slate-800 p-2">
          {row.variants.map(variant => <option key={variant}>{variant}</option>)}
        </select>
      </label>}
      {row.revision && <p className="text-xs text-slate-400">Installed {row.revision.slice(0,8)}{row.latest && row.latest !== row.revision ? ` → ${row.latest.slice(0,8)}` : ""}</p>}
      {row.revision && <label className="flex gap-2 text-xs text-slate-300"><input type="checkbox"
        checked={refreshRuntime[row.id] ?? false} onChange={event => { setRefreshRuntime({ ...refreshRuntime, [row.id]: event.target.checked }); setReview(null); }} />Rebuild runtime and refresh compatible libraries</label>}
      {!!row.dependency_updates?.length && <details className="text-xs text-slate-300"><summary>{row.dependency_updates.length} newer library versions available</summary>
        <p>Rebuilding resolves versions compatible with this model. Upstream pins are retained.</p>
        {row.dependency_updates.map(dep => <p key={dep.name}>{dep.name}: {dep.version} → {dep.latest_version}</p>)}
      </details>}
      {!!row.checkpoint_updates?.length && <p className="text-xs text-cyan-200">New checkpoint revisions available. Review before downloading.</p>}
      {row.check_error && <p role="status" className="text-xs text-amber-200">{row.check_error}</p>}
      {row.message && <p role="status" className="break-words text-sm">{row.message}</p>}
      {review?.id === row.id && <div className="space-y-3 border-t border-white/10 pt-3 text-sm">
        <p>Runtime {review.revision.slice(0,8)} · checkpoint {review.variant}</p>
        <p>{review.download_bytes !== null ? `${formatBytes(review.download_bytes)} of checkpoint files, plus libraries.` : "Checkpoint size is not available from this publisher. Libraries require additional space."}</p>
        {review.checkpoints.map(model => <div key={model.repo} className="rounded-lg bg-slate-800 p-2">
          <a className="text-cyan-300 underline" href={model.url} target="_blank" rel="noreferrer">{model.repo}</a>
          <p>{model.bytes !== null ? formatBytes(model.bytes) : "Size unavailable"} · {model.license || "See publisher terms"} · {model.revision?.slice(0,8) || "Revision unavailable"}</p>
          {model.gated && <p className="text-amber-200">Access required: accept the publisher terms and sign in locally with hf auth login.</p>}
          {model.error && <p role="alert">{model.error}</p>}
        </div>)}
        <a className="text-cyan-300 underline" href={`https://github.com/${row.repo}`} target="_blank" rel="noreferrer">Runtime documentation and requirements</a>
        <p>{review.note}</p>
        <div className="flex gap-4">
          <button className="rounded-lg bg-cyan-400 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40"
            disabled={!!busy || !review.supported || review.checkpoints.some(model => !!model.error)} onClick={() => void install(review)}>
            Confirm download and setup
          </button><button onClick={() => setReview(null)}>Cancel</button>
        </div>
      </div>}
      {!settings && <button className="text-xs underline" onClick={() => setHidden([...hidden, row.id])}>Later</button>}
    </div>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
