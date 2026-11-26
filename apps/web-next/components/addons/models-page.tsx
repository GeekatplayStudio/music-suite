"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Cpu, Download, HardDrive, Loader2, Music2, Piano, Scissors, Trash2 } from "lucide-react";

import { addonsApi, formatBytes, type AddonsOverview } from "@/lib/addons/api";
import { editorApi } from "@/lib/editor/api";
import type { InstrumentOffer } from "@/lib/editor/types";
import { generationApi, type Overview } from "@/lib/generation/api";
import { cn } from "@/lib/utils";
import { LocalDownloads } from "@/components/generation/local-downloads";
import { AppPrefs } from "@/components/app-prefs";
import { type I18n, useI18n } from "@/lib/i18n";

const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 " +
  "hover:bg-cyan-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:pointer-events-none disabled:opacity-40";
const quiet =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 " +
  "hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function Progress({ percent, detail, label }: { percent: number; detail: string; label: string }) {
  const { t } = useI18n();
  return (
    <div aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {detail || t("models.working")}
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-700" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        ok ? "bg-emerald-400/15 text-emerald-300" : "bg-slate-800 text-slate-400"
      )}
    >
      {ok ? <Check className="h-3 w-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

/**
 * What the installed music engine runs on, for its row. A processor-only build on a computer
 * with a graphics card is several times slower (measured: a 30 s song in 49 s on the processor,
 * 7.8 s on an RTX 3090 with Vulkan), so it says how to rebuild it for the card.
 */
function engineHardware(engine: { installed: boolean; backend?: string }, hasGpu: boolean, t: I18n["t"]): string {
  if (!engine.installed || !engine.backend) return "";
  if (engine.backend === "vulkan") return t("models.hardware.vulkan");
  if (engine.backend === "cuda") return t("models.hardware.cuda");
  if (engine.backend === "metal") return t("models.hardware.metal");
  return hasGpu ? t("models.hardware.cpuWithGpu") : t("models.hardware.cpu");
}

/** One place to see and install every optional engine and model, all running on this computer. */
export function ModelsPage() {
  const { t } = useI18n();
  const [addons, setAddons] = useState<AddonsOverview | null>(null);
  const [music, setMusic] = useState<Overview | null>(null);
  const [instruments, setInstruments] = useState<InstrumentOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = useCallback(([nextAddons, nextMusic]: [PromiseSettledResult<AddonsOverview>, PromiseSettledResult<Overview>]) => {
    if (nextAddons.status === "fulfilled") setAddons(nextAddons.value);
    else setError(message(nextAddons.reason, t("models.loadFailed")));
    if (nextMusic.status === "fulfilled") setMusic(nextMusic.value);
  }, [t]);
  const loadInstruments = useCallback(
    () =>
      editorApi
        .instruments()
        .then(setInstruments)
        .catch(() => undefined),
    []
  );
  const refresh = useCallback(
    () => Promise.all([Promise.allSettled([addonsApi.overview(), generationApi.overview()]).then(apply), loadInstruments()]),
    [apply, loadInstruments]
  );

  useEffect(() => {
    let alive = true;
    void Promise.allSettled([addonsApi.overview(), generationApi.overview()]).then((results) => alive && apply(results));
    void editorApi
      .instruments()
      .then((items) => alive && setInstruments(items))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [apply]);

  // Follow an install while one runs.
  const instrumentBusy = instruments.some((item) => item.running);
  const busy = Boolean(addons?.install.running || music?.setup.running || instrumentBusy);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(message(err, fallback));
    }
    await refresh();
  };

  const stems = addons?.packs.find((p) => p.id === "stems") ?? null;
  const notes = addons?.packs.find((p) => p.id === "notes") ?? null;
  const models = addons?.models ?? [];
  const selected = chosen ?? new Set(models.filter((m) => m.default || m.downloaded).map((m) => m.file));
  const toggle = (file: string) => {
    const next = new Set(selected);
    if (next.has(file)) next.delete(file);
    else next.add(file);
    setChosen(next);
  };
  const plan = addons?.torch.plan;
  const install = addons?.install;
  const stemsInstalling = Boolean(install?.running && install.pack !== null && !["notes", "mega53", "sam-audio"].includes(install.pack));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-4 pb-16 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="display-font text-2xl font-semibold text-slate-100">
            {t("common.appName")} <span className="text-cyan-300">/ {t("common.workspaces.models")}</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">{t("models.intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/editor" className={quiet}>
            {t("common.workspaces.editor")}
          </Link>
          <Link href="/generate" className={quiet}>
            {t("common.workspaces.studio")}
          </Link>
          <Link href="/synth" className={quiet}>
            {t("common.workspaces.synth")}
          </Link>
          <a href="/help#models-and-engines" target="_blank" rel="noreferrer" className={quiet}>
            {t("common.workspaces.help")}
          </a>
          <Link href="/" className={quiet}>
            {t("common.back")}
          </Link>
          <AppPrefs />
        </div>
      </header>

      {error ? (
        <p role="alert" className="whitespace-pre-wrap rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {!addons && !error ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("models.checking")}
        </p>
      ) : null}

      {addons ? (
        <section className="glass rounded-2xl border border-white/10 p-4" aria-label={t("models.computer.heading")}>
          <h2 className="display-font flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Cpu className="h-4 w-4 text-cyan-300" aria-hidden /> {t("models.computer.heading")}
          </h2>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-900/70 p-3">
              <dt className="text-xs text-slate-400">{t("models.computer.gpu")}</dt>
              <dd className="font-semibold text-slate-100">
                {addons.gpu
                  ? `${addons.gpu.name}${addons.gpu.memory_gb ? ` · ${addons.gpu.memory_gb} GB` : ""}`
                  : t("models.computer.gpuNone")}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-900/70 p-3">
              <dt className="text-xs text-slate-400">{t("models.computer.torch")}</dt>
              <dd className="font-semibold text-slate-100">
                {addons.torch.installed
                  ? `${addons.torch.version}${addons.torch.cuda ? t("models.computer.usingGpu") : ""}`
                  : plan?.device === "cuda"
                    ? t("models.computer.willUseCuda", { build: plan.build })
                    : plan?.device === "mps"
                      ? t("models.computer.willUseMps")
                      : t("models.computer.willUseCpu")}
              </dd>
              {plan?.note ? <p className="mt-1 text-xs text-amber-200">{plan.note}</p> : null}
            </div>
          </dl>
        </section>
      ) : null}

      <LocalDownloads settings onChanged={async () => { await refresh(); }} only={["mega53", "sam-audio"]} />
      {notes ? (
        <section className="glass space-y-3 rounded-2xl border border-white/10 p-4" aria-label={notes.label}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="display-font text-base font-semibold text-slate-100">{notes.label}</h2>
              <p className="mt-1 text-sm text-slate-400">{notes.summary}</p>
            </div>
            <Status ok={notes.installed}>{notes.installed ? t("common.installed") : t("common.notInstalled")}</Status>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            {notes.unlocks.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {install?.running && install.pack === "notes" ? (
            <Progress percent={install.percent} detail={install.detail} label={t("models.installProgress")} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {!notes.installed ? (
                <button
                  type="button"
                  className={primary}
                  disabled={busy}
                  onClick={() => void run(() => addonsApi.installPack("notes", []), t("models.installFailed"))}
                >
                  <Download className="h-4 w-4" aria-hidden /> {t("models.notes.install")}
                </button>
              ) : null}
              <p className="text-xs text-slate-400">{notes.installed ? t("models.readyReload") : notes.download_note}</p>
            </div>
          )}
          {addons?.whole_mix ? (
            <div className="space-y-2 rounded-xl border border-white/10 bg-slate-950/40 p-3" aria-label="MuScriptor">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-100">{t("models.muscriptor.title")}</h3>
                  <p className="mt-1 text-xs leading-snug text-slate-400">
                    {t("models.muscriptor.bodyBefore")} <strong className="text-slate-200">{t("models.muscriptor.nonCommercial")}</strong>{" "}
                    {t("models.muscriptor.bodyAfter")}
                  </p>
                </div>
                <Status ok={addons.whole_mix.status === "ready"}>
                  {addons.whole_mix.status === "ready"
                    ? addons.whole_mix.size
                      ? t("models.muscriptor.readySize", { size: addons.whole_mix.size })
                      : t("models.muscriptor.ready")
                    : addons.whole_mix.status === "needs-access"
                      ? t("models.muscriptor.needsSignIn")
                      : t("common.notInstalled")}
                </Status>
              </div>
              {addons.whole_mix.status === "ready" ? (
                <p className="text-xs text-slate-400">
                  {addons.whole_mix.downloaded.length
                    ? t("models.muscriptor.downloadedList", { list: addons.whole_mix.downloaded.join(", ") })
                    : t("models.muscriptor.signedIn")}{" "}
                  {t("models.muscriptor.sizeHint")}
                </p>
              ) : (
                <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-300">
                  {addons.whole_mix.status === "not-installed" ? (
                    <li>
                      {t("models.muscriptor.stepCode")}{" "}
                      <code className="rounded bg-black/40 px-1">.venv\Scripts\python -m pip install git+https://github.com/muscriptor/muscriptor.git</code>
                    </li>
                  ) : null}
                  <li>
                    {t("models.muscriptor.stepTerms")}{" "}
                    <a className="text-cyan-300 underline" href="https://huggingface.co/MuScriptor/muscriptor-large" target="_blank" rel="noreferrer">
                      muscriptor-large
                    </a>
                    .
                  </li>
                  <li>
                    {t("models.muscriptor.stepSignIn")} <code className="rounded bg-black/40 px-1">.venv\Scripts\hf auth login</code>.{" "}
                    {t("models.muscriptor.stepSignInAfter")}
                  </li>
                  <li>{t("models.muscriptor.stepRestart")}</li>
                </ol>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
      {stems ? (
        <section className="glass space-y-3 rounded-2xl border border-white/10 p-4" aria-label={stems.label}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
                <Scissors className="h-4 w-4 text-cyan-300" aria-hidden /> {stems.label}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{stems.summary}</p>
            </div>
            <Status ok={stems.installed}>{stems.installed ? t("common.installed") : t("common.notInstalled")}</Status>
          </div>
          <ul className="grid gap-1 text-sm text-slate-300 sm:grid-cols-2">
            {stems.unlocks.map((line) => (
              <li key={line} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden /> {line}
              </li>
            ))}
          </ul>

          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-xs font-semibold text-slate-300">{t("models.stems.legend")}</legend>
            {models.map((model) => (
              <div key={model.file} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900/70 px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="accent-cyan-400"
                    checked={model.downloaded || selected.has(model.file)}
                    disabled={model.downloaded}
                    onChange={() => toggle(model.file)}
                  />
                  <span className="min-w-0">
                    <span className="font-semibold text-slate-100">{model.label}</span>
                    <span className="block text-xs text-slate-400">{model.used_for}</span>
                  </span>
                </label>
                {model.downloaded ? (
                  <Status ok>{t("common.downloaded")}</Status>
                ) : stems.installed ? (
                  <button
                    type="button"
                    className={quiet}
                    onClick={() => void run(() => addonsApi.downloadModel(model.file), t("models.stems.downloadFailed"))}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> {t("common.download")}
                  </button>
                ) : null}
              </div>
            ))}
            <p className="text-xs text-slate-400">
              {t("models.stems.onDemand")}
              {addons && addons.models_bytes > 0 ? t("models.stems.downloadedSoFar", { size: formatBytes(addons.models_bytes) }) : ""}
            </p>
          </fieldset>

          {install?.running && stemsInstalling ? (
            <Progress percent={install.percent} detail={install.detail} label={t("models.installProgress")} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {!stems.installed ? (
                <button
                  type="button"
                  className={primary}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => addonsApi.installPack("stems", [...selected].filter((f) => !models.find((m) => m.file === f)?.downloaded)),
                      t("models.installFailed")
                    )
                  }
                >
                  <Download className="h-4 w-4" aria-hidden /> {t("models.stems.install")}
                </button>
              ) : null}
              <p className="text-xs text-slate-400">{stems.installed ? t("models.readyReload") : stems.download_note}</p>
              {addons && addons.models_bytes > 0 ? (
                confirmDelete ? (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={cn(quiet, "bg-rose-600 hover:bg-rose-500")}
                      onClick={() => {
                        setConfirmDelete(false);
                        void run(() => addonsApi.deleteModels(), t("models.stems.deleteFailed"));
                      }}
                    >
                      {t("models.stems.deleteSize", { size: formatBytes(addons.models_bytes) })}
                    </button>
                    <button type="button" className={quiet} onClick={() => setConfirmDelete(false)}>
                      {t("common.keep")}
                    </button>
                  </span>
                ) : (
                  <button type="button" className={quiet} disabled={busy} onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("models.stems.deleteModels")}
                  </button>
                )
              ) : null}
            </div>
          )}
          {install?.error && !install.running ? (
            <p role="alert" className="whitespace-pre-wrap rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {install.error}
            </p>
          ) : null}
          {install && install.log.length ? (
            <details className="rounded-lg bg-black/30 px-3 py-2 text-xs text-slate-400">
              <summary className="cursor-pointer font-semibold text-slate-300">{t("models.stems.log")}</summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{install.log.join("\n")}</pre>
            </details>
          ) : null}
        </section>
      ) : null}

      {music ? (
        <section className="glass space-y-3 rounded-2xl border border-white/10 p-4" aria-label={t("models.music.label")}>
          <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
            <Music2 className="h-4 w-4 text-cyan-300" aria-hidden /> {t("models.music.heading")}
          </h2>
          {music.setup.running ? (
            <Progress percent={music.setup.percent} detail={music.setup.detail} label={t("models.music.progress")} />
          ) : null}
          {music.setup.error && !music.setup.running ? (
            <p role="alert" className="whitespace-pre-wrap rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {music.setup.error}
            </p>
          ) : null}
          {[
            {
              label: t("models.music.engine"),
              note: `${t("models.music.engineNote", { gb: music.setup.download_gb ?? 5.3 })}${engineHardware(music.engine, Boolean(addons?.gpu), t)}`,
              ok: music.engine.installed,
              action: () => generationApi.startSetup(false)
            },
            {
              label: t("models.music.editing"),
              note: t("models.music.editingNote", { gb: music.setup.editing_download_gb ?? 2.4 }),
              ok: Boolean(music.engine.editing_ready),
              action: () => generationApi.startSetup(false, true),
              needsEngine: true
            },
            {
              label: t("models.music.xl"),
              note: t("models.music.xlNote", { gb: music.setup.quality_download_gb ?? 4.9 }),
              ok: Boolean(music.engine.quality_ready),
              action: () => generationApi.startSetup(false, false, true),
              needsEngine: true
            },
            {
              label: t("models.music.writer", { model: music.writer.model }),
              note: music.writer.available ? t("models.music.writerReady") : t("models.music.writerMissing"),
              ok: music.writer.model_installed,
              action: () => generationApi.startSetup(true),
              disabled: !music.writer.available
            }
          ].map((row) => (
            <div key={row.label} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900/70 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">{row.label}</p>
                <p className="text-xs text-slate-400">{row.note}</p>
              </div>
              {row.ok ? (
                <Status ok>{t("common.installed")}</Status>
              ) : (
                <button
                  type="button"
                  className={quiet}
                  disabled={busy || row.disabled || (row.needsEngine && !music.engine.installed)}
                  onClick={() => void run(row.action, t("models.installFailed"))}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> {t("common.install")}
                </button>
              )}
            </div>
          ))}
          <p className="text-xs text-slate-400">
            {t("models.music.settingsBefore")}{" "}
            <Link href="/generate" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
              {t("models.music.settingsLink")}
            </Link>
            .
          </p>
        </section>
      ) : null}

      {instruments.length ? (
        <section className="glass space-y-3 rounded-2xl border border-white/10 p-4" aria-label={t("models.instruments.label")}>
          <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
            <Piano className="h-4 w-4 text-cyan-300" aria-hidden /> {t("models.instruments.heading")}
          </h2>
          <p className="text-sm text-slate-400">{t("models.instruments.intro")}</p>
          {instruments.map((item) => (
            <div key={item.id} className="space-y-2 rounded-xl bg-slate-900/70 px-3 py-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">
                    {item.name} {item.version} <span className="font-normal text-slate-400">· {item.license}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.summary} {item.installed ? "" : t("models.instruments.download", { size: formatBytes(item.download_bytes) })}
                  </p>
                </div>
                {item.installed && !item.running ? (
                  <Status ok>{t("common.installed")}</Status>
                ) : !item.supported ? (
                  <Status ok={false}>{t("models.instruments.platformOnly")}</Status>
                ) : item.running ? null : (
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() => void run(() => editorApi.installInstrument(item.id), t("models.installFailed"))}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> {t("common.install")}
                  </button>
                )}
              </div>
              {item.running ? <Progress percent={item.percent} detail={item.detail} label={t("models.instruments.progress", { name: item.name })} /> : null}
              {item.error && !item.running ? (
                <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {item.error}
                </p>
              ) : null}
            </div>
          ))}
          <p className="text-xs text-slate-400">
            {t("models.instruments.useBefore")}{" "}
            <Link href="/editor" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
              {t("common.workspaces.editor")}
            </Link>{" "}
            {t("models.instruments.useMiddle")}{" "}
            <Link href="/synth" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
              {t("common.workspaces.synth")}
            </Link>
            .
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-dashed border-white/15 p-4 text-xs text-slate-400" aria-label={t("models.terminal.heading")}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <HardDrive className="h-4 w-4" aria-hidden /> {t("models.terminal.heading")}
        </h2>
        <p className="mt-1">
          {t("models.terminal.before")}{" "}
          <code className="rounded bg-black/40 px-1">.venv\Scripts\python -m audioqi.addons install stems</code> {t("models.terminal.windowsOr")}{" "}
          <code className="rounded bg-black/40 px-1">.venv/bin/python -m audioqi.addons install stems</code> {t("models.terminal.mac")}{" "}
          <code className="rounded bg-black/40 px-1">list</code> {t("models.terminal.list")}{" "}
          <code className="rounded bg-black/40 px-1">python -m audioqi.editor.instruments install surge-xt</code>.
        </p>
      </section>
    </main>
  );
}
