"use client";

import { useEffect, useState } from "react";

import { ActionButton, PanelSection, Slider, fieldClass } from "@/components/editor/controls";
import type { Clip } from "@/lib/editor/types";
import { generationApi, optionLabel, optionValue, type CostEstimate, type ProviderInfo, type FieldValues } from "@/lib/generation/api";
import { SchemaForm } from "@/components/generation/schema-form";
import { useI18n } from "@/lib/i18n";

/** Edits with a hint in the dictionary (studioTabs.aiEdit.hints.*). */
const TASK_HINTS = ["restyle", "inpaint", "continue", "reference", "repaint", "extend", "cover", "extract", "add_layer", "complete"] as const;
const hasHint = (id: string): id is (typeof TASK_HINTS)[number] => (TASK_HINTS as readonly string[]).includes(id);
/** Edits whose new clip gets a word added to its name (studioTabs.aiEdit.titles.*). */
const TASK_TITLES = ["repaint", "extend", "cover", "extract", "add_layer", "complete"] as const;
const hasTitle = (id: string): id is (typeof TASK_TITLES)[number] => (TASK_TITLES as readonly string[]).includes(id);
const NEEDS_STYLE = new Set(["restyle", "inpaint", "continue", "reference", "repaint", "extend", "cover", "add_layer", "complete"]);
const EXTEND_CHOICES = [10, 20, 30, 60];

interface AiEditSectionProps {
  stemLabel?: string;
  sourceSeconds: number;
  projectId: string;
  clip: Clip;
  /** The highlighted range inside this clip's audio, in seconds of the audio file. */
  selection: { start: number; end: number } | null;
  /** Generators that can edit clips: the local engine first, then online services that are ready. */
  providers: ProviderInfo[];
  busy: boolean;
  onRun: (params: Record<string, unknown>, title: string) => void;
  onOpenSongStudio: () => void;
}

export function AiEditSection({ sourceSeconds, stemLabel, projectId, clip, selection, providers, busy, onRun, onOpenSongStudio }: AiEditSectionProps) {
  const { t: tr, locale } = useI18n();
  const usable = providers.filter((p) => p.status.ready && p.schema.tasks.some((t) => t.source));
  const [providerId, setProviderId] = useState<string | null>(null);
  const provider = usable.find((p) => p.id === providerId) ?? usable[0] ?? providers[0] ?? null;
  const online = provider?.kind === "external";
  const tasks = (provider?.schema.tasks ?? []).filter((task) => task.source);
  const [taskId, setTaskId] = useState("repaint");
  const [allowUpload, setAllowUpload] = useState(false);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [abc, setAbc] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [advancedValues, setAdvancedValues] = useState<FieldValues>({});
  const [extendSeconds, setExtendSeconds] = useState(20);
  const [extendAt, setExtendAt] = useState<"end" | "start">("end");
  const [strength, setStrength] = useState(0.5);
  const [faithful, setFaithful] = useState(false);
  const [track, setTrack] = useState("vocals");
  const [versions, setVersions] = useState(1);

  // An online edit is billed; show what it would cost before it is sent.
  const estimateKey = online && provider
    ? JSON.stringify([provider.id, taskId, extendSeconds, clip.assetId, selection?.start, selection?.end, style.length > 2])
    : null;
  useEffect(() => {
    if (!estimateKey || !provider) return;
    const timer = setTimeout(() => {
      const fields: Record<string, string | number | boolean> = { caption: style.trim() || "music" };
      if (taskId === "extend") fields.extend_seconds = extendSeconds;
      if (taskId === "repaint" && selection) {
        fields.region_start = Number(selection.start.toFixed(3));
        fields.region_end = Number(selection.end.toFixed(3));
      }
      generationApi
        .estimate({ params: { provider: provider.id, task: taskId, fields }, project_id: projectId, asset_id: clip.assetId })
        .then((result) => setEstimate(result.estimate))
        .catch(() => setEstimate(null));
    }, 400);
    return () => clearTimeout(timer);
    // Recomputed when what is billed changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateKey]);

  const hint = tr("studioTabs.aiEdit.hint");
  if (!provider || !provider.status.ready) {
    return (
      <PanelSection title={tr("studioTabs.aiEdit.title")} hint={hint}>
        <p className="text-[11px] text-slate-400">
          {provider ? provider.status.message : tr("studioTabs.aiEdit.noEngine")} {tr("studioTabs.aiEdit.installFromStudio")}
        </p>
        <ActionButton className="w-full" onClick={onOpenSongStudio}>
          {tr("studioTabs.aiEdit.openStudio")}
        </ActionButton>
      </PanelSection>
    );
  }

  const task = tasks.find((t) => t.id === taskId) ?? tasks[0];
  if (!task) return null;
  const has = (key: string) =>
    provider.schema.fields.some((f) => f.key === key && (!f.tasks || f.tasks.includes(task.id)));
  const trackField = provider.schema.fields.find((f) => f.key === "track");
  const unavailable = task.available === false;
  const reversed = Boolean(clip.reversed);
  const needsSelection = task.id === "repaint" || task.id === "inpaint";
  const stableEdit = provider.id === "stable_audio3" && ["restyle", "continue", "inpaint"].includes(task.id);
  const diffEdit = provider.id === "diffrhythm" && task.id === "inpaint";
  const renderSeconds = Math.ceil(sourceSeconds + (task.id === "continue" ? extendSeconds : 0));
  const selectionOk = Boolean(selection && selection.end - selection.start >= 1);
  const styleOk = !NEEDS_STYLE.has(task.id) || style.trim().length >= 3;
  const yueCover = provider.id === "yue2" && task.id === "cover";
  const handled = new Set(["caption", "lyrics", "variations", "allow_upload", "follow_original", "extend_seconds", "extend_at", "strength", "faithful", "track", "region_start", "region_end"]);
  if (stableEdit) ["duration", "start", "end"].forEach(key => handled.add(key));
  if (diffEdit) ["duration", "edit_segments"].forEach(key => handled.add(key));
  if (yueCover) ["abc", "cot", "accept_noncommercial"].forEach(key => handled.add(key));
  const extraFields = provider.schema.fields.filter(f => !handled.has(f.key) && !f.editor && f.type !== "plan" && (!f.tasks || f.tasks.includes(task.id)));
  const extraValues: FieldValues = Object.fromEntries(extraFields.map(f => [f.key, advancedValues[`${provider.id}:${task.id}:${f.key}`] ?? f.default ?? null]));
  const stableLimit = String(extraValues.model ?? "medium").startsWith("small") ? 120 : 380;
  const ready = (!yueCover || (abc.trim().length > 0 && acceptTerms)) && (!stableEdit || renderSeconds <= stableLimit) && (!diffEdit || sourceSeconds <= 285) && !busy && !unavailable && !reversed && styleOk && (!needsSelection || selectionOk);

  const run = () => {
    onRun({ provider: provider.id, task: task.id, title: editTitle().slice(0, 80), fields: editFields() }, `${task.label}: ${clip.name}`);
  };

  function editTitle(): string {
    const label = hasTitle(task.id) ? tr(`studioTabs.aiEdit.titles.${task.id}`) : task.id;
    const instrument = optionLabel(trackField?.options?.find((o) => optionValue(o) === track) ?? track);
    if (task.id === "extract") return tr("studioTabs.aiEdit.extractedTitle", { instrument, clip: clip.name });
    if (task.id === "add_layer") return tr("studioTabs.aiEdit.newPartTitle", { instrument: instrument.toLocaleLowerCase(locale) });
    return `${clip.name} (${label})`;
  }

  function editFields(): Record<string, string | number | boolean> {
    const fields: Record<string, string | number | boolean> = Object.fromEntries(Object.entries(extraValues)
      .filter(([,value]) => value !== null && value !== "" && !Array.isArray(value))) as Record<string, string | number | boolean>;
    if (has("variations")) fields.variations = versions;
    if (has("allow_upload")) fields.allow_upload = allowUpload;
    if (has("follow_original")) fields.follow_original = faithful;
    if (stableEdit) fields.duration = renderSeconds;
    if (task.id === "inpaint" && selection) {
      if (diffEdit) { fields.edit_segments = JSON.stringify([[selection.start, selection.end]]); fields.duration = sourceSeconds <= 95 ? "95" : "285"; }
      else { fields.start = selection.start; fields.end = selection.end; }
    }
    if (style.trim()) fields.caption = style.trim();
    if (task.id === "repaint" && selection) {
      fields.region_start = Number(selection.start.toFixed(3));
      fields.region_end = Number(selection.end.toFixed(3));
    }
    if ((task.id === "repaint" || task.id === "extend" || task.id === "cover") && lyrics.trim()) {
      fields.lyrics = lyrics.trim();
    }
    if (task.id === "extend") {
      fields.extend_seconds = extendSeconds;
      fields.extend_at = extendAt;
    }
    if (task.id === "cover") {
      if (has("strength")) fields.strength = strength;
      if (has("faithful")) fields.faithful = faithful;
      if (yueCover) { fields.abc = abc; fields.cot = "melody"; fields.accept_noncommercial = acceptTerms; }
    }
    if (task.id === "extract" || task.id === "add_layer" || task.id === "complete") fields.track = track;
    return fields;
  }

  return (
    <PanelSection title={tr("studioTabs.aiEdit.title")} hint={hint}>
      {stemLabel && tasks.some((t) => ["cover", "restyle"].includes(t.id) && t.available !== false) && (
        <ActionButton className="w-full" disabled={busy} onClick={() => {
          setTaskId(tasks.find((t) => ["cover", "restyle"].includes(t.id) && t.available !== false)!.id);
          setStyle(`Solo ${stemLabel}, clean isolated performance, preserve the reference phrasing and tempo`);
          setFaithful(true);
        }}>
          {tr("studioTabs.aiEdit.reconstruct")}
        </ActionButton>
      )}
      {usable.length > 1 ? (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>{tr("studioTabs.aiEdit.generator")}</span>
          <select
            className={fieldClass}
            value={provider.id}
            aria-label={tr("studioTabs.aiEdit.generatorLabel")}
            onChange={(event) => {
              setProviderId(event.target.value);
              setTaskId("repaint");
            }}
          >
            {usable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block space-y-1 text-[11px] text-slate-400">
        <span>{tr("studioTabs.aiEdit.whatToDo")}</span>
        <select
          className={fieldClass}
          value={task.id}
          aria-label={tr("studioTabs.aiEdit.title")}
          onChange={(event) => setTaskId(event.target.value)}
        >
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
              {t.available === false ? tr("studioTabs.aiEdit.needsEditing") : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] leading-snug text-slate-400">{stemLabel && ["cover", "restyle"].includes(task.id) ? tr("studioTabs.aiEdit.hints.stem") : hasHint(task.id) ? tr(`studioTabs.aiEdit.hints.${task.id}`) : ""}</p>

      {unavailable ? (
        <>
          <p className="text-[11px] text-amber-200">{task.reason}</p>
          <ActionButton className="w-full" onClick={onOpenSongStudio}>
            {tr("studioTabs.aiEdit.openSettings")}
          </ActionButton>
        </>
      ) : null}
      {yueCover && <div className="space-y-2 text-xs text-slate-300">
        <label className="block">{tr("studioTabs.aiEdit.abc")}
          <textarea aria-label={tr("studioTabs.aiEdit.abcLabel")} value={abc} onChange={event => setAbc(event.target.value)}
            rows={6} maxLength={20000} className={`${fieldClass} h-auto font-mono`} />
        </label>
        <p>{tr("studioTabs.aiEdit.abcHelp")}</p>
        <label className="flex gap-2"><input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} />{tr("studioTabs.aiEdit.abcTerms")}</label>
      </div>}
      {reversed ? <p className="text-[11px] text-amber-200">{tr("studioTabs.aiEdit.unreverse")}</p> : null}
      {needsSelection && !selectionOk ? (
        <p className="text-[11px] text-amber-200">{tr("studioTabs.aiEdit.needSelection")}</p>
      ) : null}
      {needsSelection && selection && selectionOk ? (
        <p className="text-[11px] tabular-nums text-slate-300">
          {tr("studioTabs.aiEdit.section", {
            start: selection.start.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
            end: selection.end.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          })}
        </p>
      ) : null}

      {task.id === "extract" || task.id === "add_layer" || task.id === "complete" ? (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>{task.id === "extract" ? tr("studioTabs.aiEdit.instrumentOut") : task.id === "add_layer" ? tr("studioTabs.aiEdit.partToAdd") : tr("studioTabs.aiEdit.clipIs")}</span>
          <select className={fieldClass} value={track} aria-label={tr("studioTabs.aiEdit.instrument")} onChange={(event) => setTrack(event.target.value)}>
            {(trackField?.options ?? []).map((option) => (
              <option key={optionValue(option)} value={optionValue(option)}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {NEEDS_STYLE.has(task.id) || task.id === "extract" ? (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>{task.id === "cover" ? tr("studioTabs.aiEdit.newStyle") : task.id === "extract" ? tr("studioTabs.aiEdit.describeOptional") : tr("studioTabs.aiEdit.style")}</span>
          <textarea
            rows={2}
            value={style}
            maxLength={1500}
            aria-label={tr("studioTabs.aiEdit.styleLabel")}
            placeholder={task.id === "cover" ? tr("studioTabs.aiEdit.coverPlaceholder") : tr("studioTabs.aiEdit.stylePlaceholder")}
            onChange={(event) => setStyle(event.target.value)}
            className={`${fieldClass} h-auto py-1.5 leading-snug`}
          />
        </label>
      ) : null}

      {task.id === "repaint" || task.id === "extend" || task.id === "cover" ? (
        <label className="block space-y-1 text-[11px] text-slate-400">
          <span>{tr("studioTabs.aiEdit.lyrics")}</span>
          <textarea
            rows={2}
            value={lyrics}
            maxLength={6000}
            aria-label={tr("studioTabs.aiEdit.lyricsLabel")}
            placeholder={tr("studioTabs.aiEdit.lyricsPlaceholder")}
            onChange={(event) => setLyrics(event.target.value)}
            className={`${fieldClass} h-auto py-1.5 font-mono leading-snug`}
          />
        </label>
      ) : null}

      {stableEdit && renderSeconds > stableLimit && <p role="alert">{tr("studioTabs.aiEdit.checkpointLimit", { seconds: stableLimit })}</p>}
      {diffEdit && sourceSeconds > 285 && <p role="alert">{tr("studioTabs.aiEdit.diffLimit")}</p>}
      {extraFields.length > 0 && <details className="rounded-lg border border-white/10 p-2">
        <summary className="cursor-pointer text-xs text-slate-300">{tr("studioTabs.aiEdit.modelControls")}</summary>
        <SchemaForm schema={{ ...provider.schema, fields: extraFields }} values={extraValues} disabled={busy}
          onChange={(key, value) => setAdvancedValues(previous => ({ ...previous, [`${provider.id}:${task.id}:${key}`]: value }))} />
      </details>}
      {task.id === "extend" || task.id === "continue" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-slate-400">
            <span>{tr("studioTabs.aiEdit.add")}</span>
            <select className={fieldClass} value={extendSeconds} onChange={(event) => setExtendSeconds(Number(event.target.value))}>
              {EXTEND_CHOICES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} s
                </option>
              ))}
            </select>
          </label>
          {task.id === "extend" && <label className="space-y-1 text-[11px] text-slate-400">
            <span>{tr("studioTabs.aiEdit.where")}</span>
            <select
              className={fieldClass}
              value={extendAt}
              onChange={(event) => setExtendAt(event.target.value === "start" ? "start" : "end")}
            >
              <option value="end">{tr("studioTabs.aiEdit.afterEnd")}</option>
              <option value="start">{tr("studioTabs.aiEdit.beforeStart")}</option>
            </select>
          </label>}
        </div>
      ) : null}

      {task.id === "cover" && !yueCover ? (
        <>
          <Slider
            label={tr("studioTabs.aiEdit.keep")}
            value={strength}
            min={0.05}
            max={1}
            step={0.05}
            defaultValue={0.5}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={setStrength}
          />
          <label className="flex min-h-6 cursor-pointer items-start gap-2 text-[11px] text-slate-200">
            <input
              type="checkbox"
              checked={faithful}
              onChange={(event) => setFaithful(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cyan-400"
            />
            <span>{tr("studioTabs.aiEdit.faithful")}</span>
          </label>
        </>
      ) : null}

      {online && task.id === "repaint" ? (
        <label className="flex min-h-6 cursor-pointer items-start gap-2 text-[11px] text-slate-200">
          <input type="checkbox" checked={faithful} onChange={(event) => setFaithful(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
          <span>{tr("studioTabs.aiEdit.faithfulSection")}</span>
        </label>
      ) : null}
      {online ? (
        <>
          <label className="flex min-h-6 cursor-pointer items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-100">
            <input
              type="checkbox"
              checked={allowUpload}
              onChange={(event) => setAllowUpload(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-amber-300"
            />
            <span>{tr("studioTabs.aiEdit.allowUpload", { service: provider.name.replace(/ \(.*\)$/, "") })}</span>
          </label>
          {estimate ? (
            <p className="text-[11px] text-amber-200">
              {estimate.summary}{" "}
              <a href={estimate.url} target="_blank" rel="noreferrer noopener" className="underline">
                {tr("studioTabs.aiEdit.prices", { date: estimate.as_of })}
              </a>
            </p>
          ) : null}
        </>
      ) : null}

      {has("variations") ? (
      <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>{tr("studioTabs.aiEdit.versions")}</span>
        <select className={`${fieldClass} w-20`} value={versions} onChange={(event) => setVersions(Number(event.target.value))}>
          {[1, 2, 3, 4].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </label>
      ) : null}
      <ActionButton variant="primary" className="w-full" disabled={!ready} onClick={run}>
        {task.label}
      </ActionButton>
      {versions > 1 ? (
        <p className="text-[11px] text-slate-400">{tr("studioTabs.aiEdit.versionsHelp")}</p>
      ) : null}
    </PanelSection>
  );
}
