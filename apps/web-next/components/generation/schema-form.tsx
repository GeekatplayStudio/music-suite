"use client";

import { useId, useRef } from "react";

import {
  optionLabel,
  optionValue,
  type FieldSpec,
  type FieldValue,
  type FieldValues,
  type ProviderSchema
} from "@/lib/generation/api";
import { cn } from "@/lib/utils";

const inputClass =
  "h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50";
const areaClass = cn(inputClass, "h-auto py-2 leading-relaxed");

interface FieldProps {
  field: FieldSpec;
  value: FieldValue;
  disabled: boolean;
  onChange: (value: FieldValue) => void;
}

function NumberField({ field, value, disabled, onChange }: FieldProps) {
  const isAuto = field.auto && (value === null || value === undefined);
  const shown = typeof value === "number" ? value : "";
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode={field.type === "float" ? "decimal" : "numeric"}
        min={field.type === "seed" ? -1 : field.min}
        max={field.type === "seed" ? 4294967295 : field.max}
        step={field.type === "seed" ? 1 : (field.step ?? 1)}
        value={shown}
        disabled={disabled}
        placeholder={field.auto ? "Auto" : undefined}
        aria-label={field.label}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") return onChange(field.auto ? null : (field.default ?? null));
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(field.type === "float" ? parsed : Math.round(parsed));
        }}
        className={cn(inputClass, "tabular-nums")}
      />
      {field.unit ? <span className="w-9 shrink-0 text-xs text-slate-400">{field.unit}</span> : null}
      {field.auto ? (
        <button
          type="button"
          disabled={disabled || isAuto}
          onClick={() => onChange(null)}
          className="h-10 shrink-0 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-40"
        >
          Auto
        </button>
      ) : null}
    </div>
  );
}

function LyricsField({ field, value, disabled, onChange }: FieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = typeof value === "string" ? value : "";
  const insert = (section: string) => {
    const area = ref.current;
    const at = area ? area.selectionStart : text.length;
    const before = text.slice(0, at);
    const lead = before && !before.endsWith("\n") ? "\n\n" : before && !before.endsWith("\n\n") ? "\n" : "";
    const tag = `${lead}[${section}]\n`;
    onChange(before + tag + text.slice(at));
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.selectionStart = area.selectionEnd = at + tag.length;
    });
  };
  return (
    <div className="space-y-2">
      {field.sections?.length ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insert a section tag">
          {field.sections.map((section) => (
            <button
              key={section}
              type="button"
              disabled={disabled}
              onClick={() => insert(section)}
              className="h-8 rounded-md bg-slate-800 px-2.5 text-xs font-medium text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-40"
            >
              + {section}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        ref={ref}
        rows={12}
        value={text}
        disabled={disabled}
        maxLength={field.max}
        aria-label={field.label}
        placeholder={"[Verse]\nYour words here…\n\n[Chorus]\n…"}
        onChange={(event) => onChange(event.target.value)}
        className={cn(areaClass, "font-mono text-[13px]")}
      />
      <p className="text-right text-[11px] tabular-nums text-slate-500">
        {text.length} / {field.max ?? 6000}
      </p>
    </div>
  );
}

function Field(props: FieldProps) {
  const { field, value, disabled, onChange } = props;
  const id = useId();
  if (field.type === "bool") {
    return (
      <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-cyan-400"
        />
        <span>
          {field.label}
          {field.help ? <span className="mt-0.5 block text-xs text-slate-400">{field.help}</span> : null}
        </span>
      </label>
    );
  }
  let control;
  if (field.type === "lyrics") control = <LyricsField {...props} />;
  else if (field.type === "text" && field.multiline)
    control = (
      <textarea
        id={id}
        rows={4}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        maxLength={field.max}
        onChange={(event) => onChange(event.target.value)}
        className={areaClass}
      />
    );
  else if (field.type === "text")
    control = (
      <input
        id={id}
        type="text"
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        maxLength={field.max}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    );
  else if (field.type === "enum" || field.type === "model")
    control = (
      <select
        id={id}
        value={typeof value === "string" ? value : ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        className={inputClass}
      >
        {field.auto ? <option value="">Auto</option> : null}
        {(field.options ?? []).map((option) => (
          <option key={optionValue(option)} value={optionValue(option)}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    );
  else control = <NumberField {...props} />;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-300">
        {field.label}
        {field.required ? <span className="text-cyan-300"> *</span> : null}
      </label>
      {control}
      {field.help ? <p className="text-xs leading-snug text-slate-400">{field.help}</p> : null}
    </div>
  );
}

interface SchemaFormProps {
  schema: ProviderSchema;
  values: FieldValues;
  disabled: boolean;
  onChange: (key: string, value: FieldValue) => void;
  /** Fields whose control is hidden because another choice makes them irrelevant. */
  hidden?: (field: FieldSpec) => boolean;
}

/** Builds a form from a provider's own description of its controls. */
export function SchemaForm({ schema, values, disabled, onChange, hidden }: SchemaFormProps) {
  const visible = schema.fields.filter((field) => !hidden?.(field));
  return (
    <div className="space-y-4">
      {schema.groups.map((group) => {
        const fields = visible.filter((field) => field.group === group);
        if (!fields.length) return null;
        const advanced = fields.every((field) => field.advanced);
        const wide = (field: FieldSpec) => field.type === "lyrics" || field.multiline || field.type === "bool";
        const body = (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className={wide(field) ? "sm:col-span-2" : undefined}>
                <Field
                  field={field}
                  value={values[field.key] ?? null}
                  disabled={disabled}
                  onChange={(value) => onChange(field.key, value)}
                />
              </div>
            ))}
          </div>
        );
        if (advanced) {
          return (
            <details key={group} className="glass rounded-2xl border border-white/10">
              <summary className="display-font cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold text-slate-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300">
                {group} <span className="font-normal text-slate-400">· {fields.length} settings</span>
              </summary>
              <div className="border-t border-white/10 p-4">{body}</div>
            </details>
          );
        }
        return (
          <fieldset key={group} className="glass rounded-2xl border border-white/10 p-4">
            <legend className="display-font px-1 text-sm font-semibold text-slate-200">{group}</legend>
            {body}
          </fieldset>
        );
      })}
    </div>
  );
}
