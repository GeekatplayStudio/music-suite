"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Download, ExternalLink, Globe, KeyRound, Loader2, Power } from "lucide-react";

import { generationApi, type GenerationSettings, type Overview, type ProviderInfo } from "@/lib/generation/api";
import { cn } from "@/lib/utils";

const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";
const primary = cn(button, "bg-cyan-400 text-slate-950 hover:bg-cyan-300");
const quiet = cn(button, "bg-slate-800 text-slate-100 hover:bg-slate-700");
const input =
  "h-10 rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50";

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <p className={cn("flex items-start gap-2 text-sm", ok ? "text-emerald-300" : "text-amber-200")}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Card({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <section className="glass space-y-3 rounded-2xl border border-white/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display-font text-base font-semibold text-slate-100">{title}</h2>
        {tag ? <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{tag}</span> : null}
      </div>
      {children}
    </section>
  );
}

interface NumberSettingProps {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onCommit: (value: number) => void;
}

function NumberSetting({ label, help, value, min, max, step, unit, disabled, onCommit }: NumberSettingProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(Math.min(max, Math.max(min, parsed)));
  };
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={draft ?? value}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && commit()}
          className={cn(input, "w-28 tabular-nums")}
        />
        <span className="text-xs text-slate-400">{unit}</span>
      </span>
      <span className="block text-xs leading-snug text-slate-400">{help}</span>
    </label>
  );
}

const KEY_SOURCES: Record<string, string> = {
  environment: "from an environment variable",
  keychain: "in this computer's keychain",
  file: "in a private file on this computer (no keychain was available)"
};

function OnlineService({
  provider,
  working,
  run
}: {
  provider: ProviderInfo;
  working: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const key = provider.status.key;
  const fromEnvironment = key?.source === "environment";
  return (
    <li className="space-y-2 rounded-xl bg-slate-900/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-200">{provider.name}</p>
        {provider.status.terms_url ? (
          <a
            href={provider.status.terms_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline"
          >
            Terms and pricing <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
      {key?.configured ? (
        <Status ok>
          On. Key saved {KEY_SOURCES[key.source ?? ""] ?? ""}. {provider.status.message}
        </Status>
      ) : (
        <p className="text-xs text-slate-400">
          Off. Adding your key switches it on. Your style text and lyrics are then sent to this service when you choose it
          as the generator; it bills your account. Audio is never uploaded.
        </p>
      )}
      {fromEnvironment ? (
        <p className="text-xs text-slate-400">To change it, edit the {key?.env} environment variable.</p>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft;
            setDraft("");
            void run(() => generationApi.saveKey(provider.id, value));
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            disabled={working}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`${provider.name} API key`}
            placeholder={key?.configured ? "Paste a new key to replace it" : "Paste your API key"}
            className={cn(input, "min-w-0 flex-1")}
          />
          <button type="submit" className={primary} disabled={working || draft.trim().length < 16}>
            <KeyRound className="h-4 w-4" aria-hidden /> {key?.configured ? "Replace key" : "Save key"}
          </button>
          {key?.configured ? (
            <button
              type="button"
              className={quiet}
              disabled={working}
              onClick={() => void run(() => generationApi.removeKey(provider.id))}
            >
              Remove key
            </button>
          ) : null}
        </form>
      )}
    </li>
  );
}

export function SettingsPanel({ overview, onChanged }: { overview: Overview; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const { engine, setup, writer, settings, memory_free_percent: free } = overview;

  const run = async (action: () => Promise<unknown>) => {
    setWorking(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work. Please try again.");
    } finally {
      setWorking(false);
    }
  };
  const save = (patch: Partial<GenerationSettings>) => void run(() => generationApi.saveSettings(patch));
  const local = overview.providers.filter((p) => p.kind === "local");
  const online = overview.providers.filter((p) => p.kind === "external");
  const writerReady = writer.available && writer.model_installed;

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <Card title="Local music engine" tag="On this computer">
        <p className="text-sm text-slate-300">
          ACE-Step 1.5 generates full songs with vocals on this computer. Nothing you write or generate leaves it.
        </p>
        {engine.installed ? (
          <Status ok>
            Installed{engine.running ? " and loaded" : ""}. It starts by itself when you generate and unloads after{" "}
            {settings.idle_minutes} idle minutes.
          </Status>
        ) : setup.running ? null : (
          <Status ok={false}>
            {engine.built ? "The engine is built, but its models are missing." : "Not installed yet."} Installing downloads about{" "}
            {setup.download_gb ?? 5.3} GB and takes a few minutes.
          </Status>
        )}
        {setup.running ? (
          <div aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-slate-200">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {setup.detail}
            </p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(setup.percent)}
              aria-label="Install progress"
            >
              <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-700" style={{ width: `${setup.percent}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-400">You can keep using Music Suite while this runs.</p>
          </div>
        ) : null}
        {setup.error && !setup.running ? (
          <p role="alert" className="whitespace-pre-wrap rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {setup.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {!engine.installed && !setup.running ? (
            <button type="button" className={primary} disabled={working} onClick={() => void run(() => generationApi.startSetup(false))}>
              <Download className="h-4 w-4" aria-hidden />
              {setup.error ? "Try the install again" : "Install local engine"}
            </button>
          ) : null}
          {engine.running ? (
            <button type="button" className={quiet} disabled={working} onClick={() => void run(() => generationApi.stopEngine())}>
              <Power className="h-4 w-4" aria-hidden /> Unload now
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-400">
          Installing fetches the engine&apos;s source code from GitHub (one fixed version) and its models from Hugging Face, and
          checks each model file against a known fingerprint. After that it works offline.
        </p>
      </Card>

      <Card title="Lyrics and style writer" tag="On this computer">
        <p className="text-sm text-slate-300">
          A language model running in Ollama turns an idea into a style description and lyrics.
        </p>
        {writerReady ? (
          <Status ok>Ready, using {writer.model}.</Status>
        ) : writer.available ? (
          <Status ok={false}>Ollama is running, but the model “{writer.model}” is not downloaded yet (about 8 GB).</Status>
        ) : (
          <Status ok={false}>
            Ollama is not running. Without it, the music engine&apos;s own planner writes a simpler draft. Get Ollama from
            ollama.com, start it, then come back here.
          </Status>
        )}
        <div className="flex flex-wrap items-end gap-3">
          {writer.available && writer.models.length ? (
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-300">Model</span>
              <select
                value={writer.models.includes(writer.model) ? writer.model : ""}
                disabled={working}
                onChange={(event) => event.target.value && save({ writer_model: event.target.value })}
                className={cn(input, "min-w-56")}
              >
                {writer.models.includes(writer.model) ? null : <option value="">{writer.model} (not downloaded)</option>}
                {writer.models.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {writer.available && !writer.model_installed && !setup.running ? (
            <button type="button" className={quiet} disabled={working} onClick={() => void run(() => generationApi.startSetup(true))}>
              <Download className="h-4 w-4" aria-hidden /> Download {writer.model}
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-400">
          Models much larger than 12 GB will not fit in memory next to the music engine on a 24 GB computer.
        </p>
      </Card>

      <Card title="Keeping your computer responsive">
        <Status ok={free === null || free >= settings.min_free_percent}>
          {free === null ? "Free memory could not be read on this system." : `${Math.round(free)}% of memory is free right now.`} One song
          generates at a time, and the lyrics model is unloaded before music starts.
        </Status>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberSetting
            label="Do not start below"
            help="Generation waits, then stops with a message, if less memory than this is free."
            value={settings.min_free_percent}
            min={5}
            max={80}
            step={5}
            unit="% free memory"
            disabled={working}
            onCommit={(value) => save({ min_free_percent: Math.round(value) })}
          />
          <NumberSetting
            label="Unload the engine after"
            help="The engine gives its memory back when it has not been used for this long."
            value={settings.idle_minutes}
            min={1}
            max={240}
            step={1}
            unit="idle minutes"
            disabled={working}
            onCommit={(value) => save({ idle_minutes: Math.round(value) })}
          />
        </div>
      </Card>

      <Card title="Loudness of new songs">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={settings.normalize}
            disabled={working}
            onChange={(event) => save({ normalize: event.target.checked })}
            className="mt-0.5 h-5 w-5 cursor-pointer accent-cyan-400"
          />
          <span>
            Level each new song when it is imported
            <span className="mt-0.5 block text-xs text-slate-400">
              One gain change towards the target, never letting peaks pass −1 dBTP. The dynamics are not touched.
            </span>
          </span>
        </label>
        <NumberSetting
          label="Target loudness"
          help="−14 LUFS suits streaming services."
          value={settings.target_lufs}
          min={-30}
          max={-6}
          step={0.5}
          unit="LUFS"
          disabled={working || !settings.normalize}
          onCommit={(value) => save({ target_lufs: value })}
        />
      </Card>

      <Card title="Online services" tag="Optional">
        <p className="flex items-start gap-2 text-sm text-slate-300">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span>
            These run on the provider&apos;s servers with your own account. Each stays off until you add its key. Keys are kept
            on this computer and are never shown again, even here.
          </span>
        </p>
        <ul className="space-y-3">
          {online.map((provider) => (
            <OnlineService key={provider.id} provider={provider} working={working} run={run} />
          ))}
        </ul>
      </Card>

      <Card title="Generators">
        <ul className="space-y-3">
          {local.map((provider) => (
            <li key={provider.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200">{provider.name}</p>
                <p className="text-xs text-slate-400">{provider.status.message}</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={provider.enabled}
                  disabled={working}
                  onChange={(event) => save({ providers: { [provider.id]: event.target.checked } })}
                  className="h-5 w-5 cursor-pointer accent-cyan-400"
                />
                On
              </label>
            </li>
          ))}
          {overview.planned.map((planned) => (
            <li key={planned.id} className="flex items-start justify-between gap-4 opacity-80">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-200">{planned.name}</p>
                <p className="text-xs text-slate-400">{planned.message}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                Online service
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
