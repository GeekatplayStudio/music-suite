"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Download, ExternalLink, Globe, KeyRound, Loader2, Power } from "lucide-react";

import { generationApi, type GenerationSettings, type Overview, type ProviderInfo } from "@/lib/generation/api";
import { useI18n } from "@/lib/i18n";
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

const KEY_SOURCES = ["environment", "keychain", "file"] as const;
const isKeySource = (value: string | null | undefined): value is (typeof KEY_SOURCES)[number] =>
  (KEY_SOURCES as readonly (string | null | undefined)[]).includes(value);

function OnlineService({
  provider,
  working,
  run
}: {
  provider: ProviderInfo;
  working: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
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
            {t("studioTabs.settings.online.terms")} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
      {key?.configured ? (
        <Status ok>
          {t("studioTabs.settings.online.on", {
            source: isKeySource(key.source) ? t(`studioTabs.settings.keySources.${key.source}`) : "",
            message: provider.status.message
          })}
        </Status>
      ) : (
        <p className="text-xs text-slate-400">{t("studioTabs.settings.online.off")}</p>
      )}
      {fromEnvironment ? (
        <p className="text-xs text-slate-400">{t("studioTabs.settings.online.fromEnvironment", { env: key?.env ?? "" })}</p>
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
            aria-label={t("studioTabs.settings.online.keyLabel", { name: provider.name })}
            placeholder={key?.configured ? t("studioTabs.settings.online.pasteNew") : t("studioTabs.settings.online.paste")}
            className={cn(input, "min-w-0 flex-1")}
          />
          <button type="submit" className={primary} disabled={working || draft.trim().length < 16}>
            <KeyRound className="h-4 w-4" aria-hidden /> {key?.configured ? t("studioTabs.settings.online.replace") : t("studioTabs.settings.online.save")}
          </button>
          {key?.configured ? (
            <button
              type="button"
              className={quiet}
              disabled={working}
              onClick={() => void run(() => generationApi.removeKey(provider.id))}
            >
              {t("studioTabs.settings.online.remove")}
            </button>
          ) : null}
        </form>
      )}
    </li>
  );
}

export function SettingsPanel({ overview, onChanged }: { overview: Overview; onChanged: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const gb = (value: number) => value.toLocaleString(locale);
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
      setError(err instanceof Error ? err.message : t("studioTabs.settings.failed"));
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

      <Card title={t("studioTabs.settings.engine.title")} tag={t("studioTabs.settings.onThisComputer")}>
        <p className="text-sm text-slate-300">{t("studioTabs.settings.engine.intro")}</p>
        {engine.installed ? (
          <Status ok={Boolean(engine.editing_ready)}>
            {engine.editing_ready
              ? t("studioTabs.settings.engine.editingReady")
              : t("studioTabs.settings.engine.editingMissing")}
          </Status>
        ) : null}
        {engine.installed ? (
          <Status ok>
            {t(engine.running ? "studioTabs.settings.engine.installedLoaded" : "studioTabs.settings.engine.installed", {
              minutes: settings.idle_minutes
            })}
          </Status>
        ) : setup.running ? null : (
          <Status ok={false}>
            {engine.built ? t("studioTabs.settings.engine.builtNoModels") : t("studioTabs.settings.engine.notInstalled")}{" "}
            {t("studioTabs.settings.engine.installSize", { gb: gb(setup.download_gb ?? 5.3) })}
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
              aria-label={t("studioTabs.settings.engine.progress")}
            >
              <div className="h-full rounded-full bg-cyan-400 transition-[width] duration-700" style={{ width: `${setup.percent}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-400">{t("studioTabs.settings.engine.keepUsing")}</p>
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
              {setup.error ? t("studioTabs.settings.engine.retry") : t("studioTabs.settings.engine.install")}
            </button>
          ) : null}
          {engine.installed && !engine.quality_ready && !setup.running ? (
            <button
              type="button"
              className={quiet}
              disabled={working}
              onClick={() => void run(() => generationApi.startSetup(false, false, true))}
              title={t("studioTabs.settings.engine.qualityTitle")}
            >
              <Download className="h-4 w-4" aria-hidden /> {t("studioTabs.settings.engine.quality", { gb: gb(setup.quality_download_gb ?? 4.9) })}
            </button>
          ) : null}
          {engine.installed && !engine.editing_ready && !setup.running ? (
            <button
              type="button"
              className={quiet}
              disabled={working}
              onClick={() => void run(() => generationApi.startSetup(false, true))}
              title={t("studioTabs.settings.engine.editingTitle")}
            >
              <Download className="h-4 w-4" aria-hidden /> {t("studioTabs.settings.engine.editing", { gb: gb(setup.editing_download_gb ?? 2.4) })}
            </button>
          ) : null}
          {engine.running ? (
            <button type="button" className={quiet} disabled={working} onClick={() => void run(() => generationApi.stopEngine())}>
              <Power className="h-4 w-4" aria-hidden /> {t("studioTabs.settings.engine.unload")}
            </button>
          ) : null}
        </div>
        {engine.quality_ready ? (
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={settings.use_quality_model}
              disabled={working}
              onChange={(event) => save({ use_quality_model: event.target.checked })}
              className="mt-0.5 h-5 w-5 cursor-pointer accent-cyan-400"
            />
            <span>
              {t("studioTabs.settings.engine.useQuality")}
              <span className="mt-0.5 block text-xs text-slate-400">{t("studioTabs.settings.engine.useQualityHelp")}</span>
            </span>
          </label>
        ) : null}
        <p className="text-xs text-slate-400">{t("studioTabs.settings.engine.sources")}</p>
      </Card>

      <Card title={t("studioTabs.settings.writer.title")} tag={t("studioTabs.settings.onThisComputer")}>
        <p className="text-sm text-slate-300">{t("studioTabs.settings.writer.intro")}</p>
        {writerReady ? (
          <Status ok>{t("studioTabs.settings.writer.ready", { model: writer.model })}</Status>
        ) : writer.available ? (
          <Status ok={false}>{t("studioTabs.settings.writer.noModel", { model: writer.model })}</Status>
        ) : (
          <Status ok={false}>{t("studioTabs.settings.writer.noOllama")}</Status>
        )}
        <div className="flex flex-wrap items-end gap-3">
          {writer.available && writer.models.length ? (
            <label className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-300">{t("studioTabs.settings.writer.model")}</span>
              <select
                value={writer.models.includes(writer.model) ? writer.model : ""}
                disabled={working}
                onChange={(event) => event.target.value && save({ writer_model: event.target.value })}
                className={cn(input, "min-w-56")}
              >
                {writer.models.includes(writer.model) ? null : <option value="">{t("studioTabs.settings.writer.notDownloaded", { model: writer.model })}</option>}
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
              <Download className="h-4 w-4" aria-hidden /> {t("studioTabs.settings.writer.download", { model: writer.model })}
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-400">{t("studioTabs.settings.writer.sizeNote")}</p>
      </Card>

      <Card title={t("studioTabs.settings.memory.title")}>
        <Status ok={free === null || free >= settings.min_free_percent}>
          {free === null ? t("studioTabs.settings.memory.unknown") : t("studioTabs.settings.memory.free", { percent: Math.round(free) })}{" "}
          {t("studioTabs.settings.memory.oneAtATime")}
        </Status>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberSetting
            label={t("studioTabs.settings.memory.minLabel")}
            help={t("studioTabs.settings.memory.minHelp")}
            value={settings.min_free_percent}
            min={5}
            max={80}
            step={5}
            unit={t("studioTabs.settings.memory.minUnit")}
            disabled={working}
            onCommit={(value) => save({ min_free_percent: Math.round(value) })}
          />
          <NumberSetting
            label={t("studioTabs.settings.memory.idleLabel")}
            help={t("studioTabs.settings.memory.idleHelp")}
            value={settings.idle_minutes}
            min={1}
            max={240}
            step={1}
            unit={t("studioTabs.settings.memory.idleUnit")}
            disabled={working}
            onCommit={(value) => save({ idle_minutes: Math.round(value) })}
          />
        </div>
      </Card>

      <Card title={t("studioTabs.settings.loudness.title")}>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={settings.normalize}
            disabled={working}
            onChange={(event) => save({ normalize: event.target.checked })}
            className="mt-0.5 h-5 w-5 cursor-pointer accent-cyan-400"
          />
          <span>
            {t("studioTabs.settings.loudness.level")}
            <span className="mt-0.5 block text-xs text-slate-400">{t("studioTabs.settings.loudness.levelHelp")}</span>
          </span>
        </label>
        <NumberSetting
          label={t("studioTabs.settings.loudness.target")}
          help={t("studioTabs.settings.loudness.targetHelp")}
          value={settings.target_lufs}
          min={-30}
          max={-6}
          step={0.5}
          unit="LUFS"
          disabled={working || !settings.normalize}
          onCommit={(value) => save({ target_lufs: value })}
        />
      </Card>

      <Card title={t("studioTabs.settings.services.title")} tag={t("studioTabs.settings.optional")}>
        <p className="flex items-start gap-2 text-sm text-slate-300">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span>{t("studioTabs.settings.services.intro")}</span>
        </p>
        <ul className="space-y-3">
          {online.map((provider) => (
            <OnlineService key={provider.id} provider={provider} working={working} run={run} />
          ))}
        </ul>
      </Card>

      <Card title={t("studioTabs.settings.generators.title")}>
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
                {t("studioTabs.settings.generators.on")}
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
                {t("studioTabs.settings.generators.online")}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
