"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Cpu, Download, HardDrive, Loader2, Music2, Piano, Scissors, Trash2 } from "lucide-react";

import { addonsApi, formatBytes, type AddonsOverview } from "@/lib/addons/api";
import { editorApi } from "@/lib/editor/api";
import type { InstrumentOffer } from "@/lib/editor/types";
import { generationApi, type Overview } from "@/lib/generation/api";
import { cn } from "@/lib/utils";

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
  return (
    <div aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {detail || "Working…"}
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

/** One place to see and install every optional engine and model, all running on this computer. */
export function ModelsPage() {
  const [addons, setAddons] = useState<AddonsOverview | null>(null);
  const [music, setMusic] = useState<Overview | null>(null);
  const [instruments, setInstruments] = useState<InstrumentOffer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = useCallback(([nextAddons, nextMusic]: [PromiseSettledResult<AddonsOverview>, PromiseSettledResult<Overview>]) => {
    if (nextAddons.status === "fulfilled") setAddons(nextAddons.value);
    else setError(message(nextAddons.reason, "Models & engines could not be loaded."));
    if (nextMusic.status === "fulfilled") setMusic(nextMusic.value);
  }, []);
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
  const stemsInstalling = Boolean(install?.running && install.pack !== null);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-5 px-4 pb-16 pt-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="display-font text-2xl font-semibold text-slate-100">
            Music Suite <span className="text-cyan-300">/ Models &amp; engines</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Optional engines and AI models. Everything here runs on this computer; installing never changes what is
            already installed.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/editor" className={quiet}>
            Studio Editor
          </Link>
          <Link href="/generate" className={quiet}>
            AI Song Studio
          </Link>
          <Link href="/synth" className={quiet}>
            Synth Studio
          </Link>
          <Link href="/" className={quiet}>
            Back to Music Suite
          </Link>
        </div>
      </header>

      {error ? (
        <p role="alert" className="whitespace-pre-wrap rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {!addons && !error ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking this computer…
        </p>
      ) : null}

      {addons ? (
        <section className="glass rounded-2xl border border-white/10 p-4" aria-label="This computer">
          <h2 className="display-font flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Cpu className="h-4 w-4 text-cyan-300" aria-hidden /> This computer
          </h2>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-900/70 p-3">
              <dt className="text-xs text-slate-400">Graphics card</dt>
              <dd className="font-semibold text-slate-100">
                {addons.gpu
                  ? `${addons.gpu.name}${addons.gpu.memory_gb ? ` · ${addons.gpu.memory_gb} GB` : ""}`
                  : "None found: AI models run on the processor (slower)"}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-900/70 p-3">
              <dt className="text-xs text-slate-400">PyTorch (runs the AI models)</dt>
              <dd className="font-semibold text-slate-100">
                {addons.torch.installed
                  ? `${addons.torch.version}${addons.torch.cuda ? " · using the GPU" : ""}`
                  : plan?.device === "cuda"
                    ? `Not installed · will use the GPU (${plan.build})`
                    : plan?.device === "mps"
                      ? "Not installed · will use the Apple GPU"
                      : "Not installed · will use the processor"}
              </dd>
              {plan?.note ? <p className="mt-1 text-xs text-amber-200">{plan.note}</p> : null}
            </div>
          </dl>
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
            <Status ok={stems.installed}>{stems.installed ? "Installed" : "Not installed"}</Status>
          </div>
          <ul className="grid gap-1 text-sm text-slate-300 sm:grid-cols-2">
            {stems.unlocks.map((line) => (
              <li key={line} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden /> {line}
              </li>
            ))}
          </ul>

          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-xs font-semibold text-slate-300">Models</legend>
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
                  <Status ok>Downloaded</Status>
                ) : stems.installed ? (
                  <button
                    type="button"
                    className={quiet}
                    onClick={() => void run(() => addonsApi.downloadModel(model.file), "The model could not be downloaded.")}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> Download
                  </button>
                ) : null}
              </div>
            ))}
            <p className="text-xs text-slate-400">
              Models not downloaded here download the first time a split needs them.
              {addons && addons.models_bytes > 0 ? ` Downloaded so far: ${formatBytes(addons.models_bytes)}.` : ""}
            </p>
          </fieldset>

          {install?.running && stemsInstalling ? (
            <Progress percent={install.percent} detail={install.detail} label="Install progress" />
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
                      "The install could not be started."
                    )
                  }
                >
                  <Download className="h-4 w-4" aria-hidden /> Install AI stem separation
                </button>
              ) : null}
              <p className="text-xs text-slate-400">{stems.installed ? "Ready. Reload open editor pages to use it." : stems.download_note}</p>
              {addons && addons.models_bytes > 0 ? (
                confirmDelete ? (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className={cn(quiet, "bg-rose-600 hover:bg-rose-500")}
                      onClick={() => {
                        setConfirmDelete(false);
                        void run(() => addonsApi.deleteModels(), "The models could not be deleted.");
                      }}
                    >
                      Delete {formatBytes(addons.models_bytes)}
                    </button>
                    <button type="button" className={quiet} onClick={() => setConfirmDelete(false)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" className={quiet} disabled={busy} onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete downloaded models
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
              <summary className="cursor-pointer font-semibold text-slate-300">Install log</summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">{install.log.join("\n")}</pre>
            </details>
          ) : null}
        </section>
      ) : null}

      {music ? (
        <section className="glass space-y-3 rounded-2xl border border-white/10 p-4" aria-label="AI music">
          <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
            <Music2 className="h-4 w-4 text-cyan-300" aria-hidden /> AI music (AI Song Studio)
          </h2>
          {music.setup.running ? (
            <Progress percent={music.setup.percent} detail={music.setup.detail} label="Music engine install progress" />
          ) : null}
          {music.setup.error && !music.setup.running ? (
            <p role="alert" className="whitespace-pre-wrap rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {music.setup.error}
            </p>
          ) : null}
          {[
            {
              label: "Music engine (ACE-Step 1.5)",
              note: `Makes full songs with vocals, offline. About ${music.setup.download_gb ?? 5.3} GB; needs CMake and a C++ compiler.`,
              ok: music.engine.installed,
              action: () => generationApi.startSetup(false)
            },
            {
              label: "Editing model",
              note: `Extract an instrument, add a part, build a song around a part. ${music.setup.editing_download_gb ?? 2.4} GB.`,
              ok: Boolean(music.engine.editing_ready),
              action: () => generationApi.startSetup(false, true),
              needsEngine: true
            },
            {
              label: "High-quality (XL) model",
              note: `Better songs, a little slower. ${music.setup.quality_download_gb ?? 4.9} GB.`,
              ok: Boolean(music.engine.quality_ready),
              action: () => generationApi.startSetup(false, false, true),
              needsEngine: true
            },
            {
              label: `Lyrics writer (${music.writer.model})`,
              note: music.writer.available
                ? "Writes lyrics and style descriptions with Ollama."
                : "Needs Ollama (ollama.com) running on this computer.",
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
                <Status ok>Installed</Status>
              ) : (
                <button
                  type="button"
                  className={quiet}
                  disabled={busy || row.disabled || (row.needsEngine && !music.engine.installed)}
                  onClick={() => void run(row.action, "The install could not be started.")}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> Install
                </button>
              )}
            </div>
          ))}
          <p className="text-xs text-slate-400">
            Memory limits, loudness and online services are in{" "}
            <Link href="/generate" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
              AI Song Studio ▸ Settings
            </Link>
            .
          </p>
        </section>
      ) : null}

      {instruments.length ? (
        <section className="glass space-y-3 rounded-2xl border border-white/10 p-4" aria-label="Instruments">
          <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
            <Piano className="h-4 w-4 text-cyan-300" aria-hidden /> Instruments (Studio Editor)
          </h2>
          <p className="text-sm text-slate-400">
            Free synthesizers that play the notes of a MIDI clip. Each download is a fixed release file from the
            instrument&apos;s own project, checked before it is installed for your user only.
          </p>
          {instruments.map((item) => (
            <div key={item.id} className="space-y-2 rounded-xl bg-slate-900/70 px-3 py-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-100">
                    {item.name} {item.version} <span className="font-normal text-slate-400">· {item.license}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.summary} {item.installed ? "" : `Download: ${formatBytes(item.download_bytes)}.`}
                  </p>
                </div>
                {item.installed && !item.running ? (
                  <Status ok>Installed</Status>
                ) : !item.supported ? (
                  <Status ok={false}>macOS and Windows only</Status>
                ) : item.running ? null : (
                  <button
                    type="button"
                    className={quiet}
                    disabled={busy}
                    onClick={() => void run(() => editorApi.installInstrument(item.id), "The install could not be started.")}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden /> Install
                  </button>
                )}
              </div>
              {item.running ? <Progress percent={item.percent} detail={item.detail} label={`${item.name} install progress`} /> : null}
              {item.error && !item.running ? (
                <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {item.error}
                </p>
              ) : null}
            </div>
          ))}
          <p className="text-xs text-slate-400">
            To use one, select a MIDI clip in the{" "}
            <Link href="/editor" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
              Studio Editor
            </Link>{" "}
            and open its Plugin instrument section, or try the sounds in{" "}
            <Link href="/synth" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
              Synth Studio
            </Link>
            .
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-dashed border-white/15 p-4 text-xs text-slate-400" aria-label="From a terminal">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <HardDrive className="h-4 w-4" aria-hidden /> From a terminal
        </h2>
        <p className="mt-1">
          The same installs work from the Music Suite folder:{" "}
          <code className="rounded bg-black/40 px-1">.venv\Scripts\python -m audioqi.addons install stems</code> (Windows) or{" "}
          <code className="rounded bg-black/40 px-1">.venv/bin/python -m audioqi.addons install stems</code> (macOS).{" "}
          <code className="rounded bg-black/40 px-1">list</code> shows what is installed. Instruments:{" "}
          <code className="rounded bg-black/40 px-1">python -m audioqi.editor.instruments install surge-xt</code>.
        </p>
      </section>
    </main>
  );
}
