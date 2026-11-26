"use client";

import { Download, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import {
  FACTORY_PRESETS,
  MAX_MOD_SLOTS,
  MOD_DESTS,
  MOD_SOURCES,
  OSC_WAVES,
  deleteUserPreset,
  loadUserPresets,
  normalizePatch,
  saveUserPreset,
  type Envelope,
  type Lfo,
  type LfoSync,
  type LfoWave,
  type ModDest,
  type ModSource,
  type Oscillator,
  type Patch,
} from "@/lib/editor/synth";
import { SOUND_FILE_EXTENSION, exportSound, readSoundFile } from "@/lib/editor/sound-file";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "Patch change" with a coalescing key, so dragging a slider is one undo step. */
export type PatchChange = (patch: Patch, key: string) => void;

interface RowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  /** Map the slider position logarithmically (frequencies and times). */
  log?: boolean;
}

/** A labelled slider. Logarithmic rows keep low values easy to set. */
function Row({ label, value, min, max, step, format, onChange, log }: RowProps) {
  const toPosition = (v: number) => (log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromPosition = (p: number) => (log ? min * Math.pow(max / min, p) : min + p * (max - min));
  const position = Math.min(1, Math.max(0, toPosition(value)));
  return (
    <label className="flex h-7 items-center gap-2 text-[11px] text-slate-300">
      <span className="w-24 shrink-0 text-slate-400">{label}</span>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(position * 1000)}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={(event) => {
          const raw = fromPosition(Number(event.target.value) / 1000);
          const snapped = log ? raw : Math.round(raw / step) * step;
          onChange(Number(Math.min(max, Math.max(min, snapped)).toFixed(6)));
        }}
        className="h-6 min-w-0 flex-1 cursor-pointer accent-cyan-400"
      />
      <span className="w-16 shrink-0 text-right font-mono tabular-nums text-slate-200">{format(value)}</span>
    </label>
  );
}

const ms = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`);
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-white/10 bg-slate-900/60 p-3", className)}>
      <h3 className="display-font mb-2 text-xs font-semibold uppercase tracking-wider text-slate-300">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function EnvelopeRows({ env, prefix, onChange }: { env: Envelope; prefix: string; onChange: (env: Envelope, key: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <Row label={t("synth.editor.attack")} value={env.attack} min={0.001} max={10} step={0.001} log format={ms} onChange={(attack) => onChange({ ...env, attack }, `${prefix}.a`)} />
      <Row label={t("synth.editor.decay")} value={env.decay} min={0.001} max={10} step={0.001} log format={ms} onChange={(decay) => onChange({ ...env, decay }, `${prefix}.d`)} />
      <Row label={t("synth.editor.sustain")} value={env.sustain} min={0} max={1} step={0.01} format={pct} onChange={(sustain) => onChange({ ...env, sustain }, `${prefix}.s`)} />
      <Row label={t("synth.editor.release")} value={env.release} min={0.005} max={10} step={0.001} log format={ms} onChange={(release) => onChange({ ...env, release }, `${prefix}.r`)} />
    </>
  );
}

/** Sound name, presets and "my sounds": shared by the editor's dialog and Synth Studio. */
export function PresetBar({ patch, onChange }: { patch: Patch; onChange: PatchChange }) {
  const { t } = useI18n();
  const [userPresets, setUserPresets] = useState<Patch[]>(() => loadUserPresets());
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (change: Partial<Patch>, key: string) => onChange({ ...patch, ...change }, key);
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const sound = await readSoundFile(file);
      if (sound.kind !== "synth") throw new Error(t("synth.editor.isPlugin", { plugin: sound.plugin }));
      onChange(sound.patch, "");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : t("synth.editor.openFailed"));
    }
  };
  const loadPreset = (name: string) => {
    const found = [...FACTORY_PRESETS, ...userPresets].find((p) => p.name === name);
    if (found) onChange(normalizePatch(found), "");
  };

  return (
    <>
    <input
      className={cn(fieldClass, "w-44")}
      value={patch.name}
      maxLength={60}
      aria-label={t("synth.editor.soundName")}
      onChange={(event) => set({ name: event.target.value }, "name")}
    />
    <select className={cn(fieldClass, "w-52")} value="" aria-label={t("synth.editor.loadPreset")} onChange={(event) => event.target.value && loadPreset(event.target.value)}>
      <option value="">{t("synth.editor.loadPresetOption")}</option>
      <optgroup label={t("synth.editor.factory")}>
        {FACTORY_PRESETS.map((p) => (
          <option key={`f-${p.name}`} value={p.name}>
            {p.name}
          </option>
        ))}
      </optgroup>
      {userPresets.length ? (
        <optgroup label={t("synth.editor.mySounds")}>
          {userPresets.map((p) => (
            <option key={`u-${p.name}`} value={p.name}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
    <ActionButton onClick={() => setUserPresets(saveUserPreset(patch))} title={t("synth.editor.saveTitle")}>
      <Save className="h-3.5 w-3.5" aria-hidden /> {t("synth.editor.save")}
    </ActionButton>
    {userPresets.some((p) => p.name === patch.name) ? (
      <ActionButton onClick={() => setUserPresets(deleteUserPreset(patch.name))} title={t("synth.editor.forgetTitle")}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("synth.editor.forget")}
      </ActionButton>
    ) : null}
    <ActionButton onClick={() => exportSound({ kind: "synth", patch })} title={t("synth.editor.exportTitle")}>
      <Download className="h-3.5 w-3.5" aria-hidden /> {t("synth.editor.export")}
    </ActionButton>
    <ActionButton onClick={() => fileRef.current?.click()} title={t("synth.editor.importTitle")}>
      <Upload className="h-3.5 w-3.5" aria-hidden /> {t("synth.editor.import")}
    </ActionButton>
    <input
      ref={fileRef}
      type="file"
      accept={`${SOUND_FILE_EXTENSION},application/json`}
      className="hidden"
      aria-label={t("synth.editor.fileLabel")}
      onChange={(event) => {
        void importFile(event.target.files?.[0]);
        event.target.value = "";
      }}
    />
    {fileError ? (
      <p role="alert" className="w-full text-[11px] text-rose-300">
        {fileError}
      </p>
    ) : null}
    </>
  );
}

/**
 * Every control of a sound: oscillators, filter, envelopes, LFOs and modulation.
 * `wide` lets the sections spread over more columns on large screens.
 */
export function SynthControls({ patch, onChange, wide }: { patch: Patch; onChange: PatchChange; wide?: boolean }) {
  const { t, tp } = useI18n();
  const set = (change: Partial<Patch>, key: string) => onChange({ ...patch, ...change }, key);
  const setOsc = (index: number, change: Partial<Oscillator>, key: string) => {
    const osc = patch.osc.map((o, i) => (i === index ? { ...o, ...change } : o)) as Patch["osc"];
    set({ osc }, `osc${index + 1}.${key}`);
  };
  const setLfo = (index: number, change: Partial<Lfo>, key: string) => {
    const lfo = patch.lfo.map((l, i) => (i === index ? { ...l, ...change } : l)) as Patch["lfo"];
    set({ lfo }, `lfo${index + 1}.${key}`);
  };
  const setSlot = (index: number, change: Partial<Patch["matrix"][number]>, key: string) =>
    set({ matrix: patch.matrix.map((m, i) => (i === index ? { ...m, ...change } : m)) }, `mod${index}.${key}`);

  return (
    <div className={cn("grid gap-3", wide ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-3")}>
      {patch.osc.map((o, index) => (
        <Section key={index} title={t("synth.editor.oscillator", { n: index + 1 })}>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
              <input type="checkbox" checked={o.on} onChange={(event) => setOsc(index, { on: event.target.checked }, "on")} className="h-4 w-4 accent-cyan-400" />
              {t("synth.editor.on")}
            </label>
            <select className={fieldClass} value={o.wave} aria-label={t("synth.editor.oscWave", { n: index + 1 })} onChange={(event) => setOsc(index, { wave: event.target.value as Oscillator["wave"] }, "wave")}>
              {OSC_WAVES.map((w) => (
                <option key={w.value} value={w.value}>
                  {t(`synth.editor.waves.${w.value}`)}
                </option>
              ))}
            </select>
          </div>
          <Row label={t("synth.editor.octave")} value={o.octave} min={-3} max={3} step={1} format={(v) => `${v > 0 ? "+" : ""}${v}`} onChange={(octave) => setOsc(index, { octave }, "oct")} />
          <Row label={t("synth.editor.semitones")} value={o.semi} min={-12} max={12} step={1} format={(v) => `${v > 0 ? "+" : ""}${v}`} onChange={(semi) => setOsc(index, { semi }, "semi")} />
          <Row label={t("synth.editor.fine")} value={o.fine} min={-100} max={100} step={1} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} ct`} onChange={(fine) => setOsc(index, { fine }, "fine")} />
          <Row label={t("synth.editor.level")} value={o.level} min={0} max={1} step={0.01} format={pct} onChange={(level) => setOsc(index, { level }, "level")} />
          <Row label={t("synth.editor.unison")} value={o.unison} min={1} max={7} step={1} format={(v) => tp("synth.editor.voices", v)} onChange={(unison) => setOsc(index, { unison }, "uni")} />
          <Row label={t("synth.editor.detune")} value={o.detune} min={0} max={100} step={1} format={(v) => `${Math.round(v)} ct`} onChange={(detune) => setOsc(index, { detune }, "det")} />
          <Row label={t("synth.editor.spread")} value={o.spread} min={0} max={1} step={0.01} format={pct} onChange={(spread) => setOsc(index, { spread }, "spr")} />
        </Section>
      ))}

      <Section title={t("synth.editor.filter")}>
        <div className="flex gap-2">
          <select className={fieldClass} value={patch.filter.type} aria-label={t("synth.editor.filterType")} onChange={(event) => set({ filter: { ...patch.filter, type: event.target.value as Patch["filter"]["type"] } }, "flt.type")}>
            <option value="lowpass">{t("synth.editor.lowpass")}</option>
            <option value="highpass">{t("synth.editor.highpass")}</option>
            <option value="bandpass">{t("synth.editor.bandpass")}</option>
            <option value="notch">{t("synth.editor.notch")}</option>
          </select>
          <select className={fieldClass} value={patch.filter.slope} aria-label={t("synth.editor.filterSlope")} onChange={(event) => set({ filter: { ...patch.filter, slope: event.target.value === "24" ? 24 : 12 } }, "flt.slope")}>
            <option value={12}>12 dB/oct</option>
            <option value={24}>24 dB/oct</option>
          </select>
        </div>
        <Row label={t("synth.editor.cutoff")} value={patch.filter.cutoff} min={30} max={20000} step={1} log format={hz} onChange={(cutoff) => set({ filter: { ...patch.filter, cutoff } }, "flt.cut")} />
        <Row label={t("synth.editor.resonance")} value={patch.filter.resonance} min={0} max={1} step={0.01} format={pct} onChange={(resonance) => set({ filter: { ...patch.filter, resonance } }, "flt.res")} />
        <Row label={t("synth.editor.drive")} value={patch.filter.drive} min={0} max={1} step={0.01} format={pct} onChange={(drive) => set({ filter: { ...patch.filter, drive } }, "flt.drv")} />
        <Row label={t("synth.editor.keyFollow")} value={patch.filter.keytrack} min={0} max={1} step={0.01} format={pct} onChange={(keytrack) => set({ filter: { ...patch.filter, keytrack } }, "flt.key")} />
        <Row label={t("synth.editor.env2Amount")} value={patch.filter.envAmount} min={-6} max={6} step={0.1} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} oct`} onChange={(envAmount) => set({ filter: { ...patch.filter, envAmount } }, "flt.env")} />
      </Section>

      <Section title={t("synth.editor.noiseFm")}>
        <Row label={t("synth.editor.noise")} value={patch.noise} min={0} max={1} step={0.01} format={pct} onChange={(noise) => set({ noise }, "noise")} />
        <Row label={t("synth.editor.fm")} value={patch.fm} min={0} max={1} step={0.01} format={pct} onChange={(fm) => set({ fm }, "fm")} />
        <label className="flex h-7 items-center gap-2 text-[11px] text-slate-400">
          <span className="w-24 shrink-0">{t("synth.editor.voiceRow")}</span>
          <select className={fieldClass} value={patch.mode} aria-label={t("synth.editor.voiceMode")} onChange={(event) => set({ mode: event.target.value === "mono" ? "mono" : "poly" }, "mode")}>
            <option value="poly">{t("synth.editor.poly")}</option>
            <option value="mono">{t("synth.editor.mono")}</option>
          </select>
        </label>
        <Row label={t("synth.editor.glide")} value={patch.glide} min={0} max={1} step={0.005} format={ms} onChange={(glide) => set({ glide }, "glide")} />
        <Row label={t("synth.editor.velocity")} value={patch.velocity} min={0} max={1} step={0.01} format={pct} onChange={(velocity) => set({ velocity }, "vel")} />
        <Row label={t("synth.editor.volume")} value={patch.gainDb} min={-24} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`} onChange={(gainDb) => set({ gainDb }, "gain")} />
      </Section>

      <Section title={t("synth.editor.envelopes")}>
        <p className="text-[11px] font-semibold text-slate-300">{t("synth.editor.env1")}</p>
        <EnvelopeRows env={patch.ampEnv} prefix="amp" onChange={(ampEnv, key) => set({ ampEnv }, key)} />
        <p className="pt-1 text-[11px] font-semibold text-slate-300">{t("synth.editor.env2")}</p>
        <EnvelopeRows env={patch.modEnv} prefix="mod" onChange={(modEnv, key) => set({ modEnv }, key)} />
      </Section>

      <Section title={t("synth.editor.lfos")}>
        {patch.lfo.map((l, index) => (
          <div key={index} className="space-y-1 pb-1">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-slate-300">LFO {index + 1}</span>
              <select className={fieldClass} value={l.wave} aria-label={t("synth.editor.lfoShape", { n: index + 1 })} onChange={(event) => setLfo(index, { wave: event.target.value as LfoWave }, "wave")}>
                <option value="sine">{t("synth.editor.sine")}</option>
                <option value="triangle">{t("synth.editor.triangle")}</option>
                <option value="sawtooth">{t("synth.editor.saw")}</option>
                <option value="square">{t("synth.editor.square")}</option>
                <option value="random">{t("synth.editor.random")}</option>
              </select>
              <select className={fieldClass} value={l.sync} aria-label={t("synth.editor.lfoSync", { n: index + 1 })} onChange={(event) => setLfo(index, { sync: event.target.value as LfoSync }, "sync")}>
                <option value="off">{t("synth.editor.free")}</option>
                <option value="1/1">{t("synth.editor.bar")}</option>
                <option value="1/2">1/2</option>
                <option value="1/4">1/4</option>
                <option value="1/8">1/8</option>
                <option value="1/16">1/16</option>
                <option value="1/4t">{t("synth.editor.triplet4")}</option>
                <option value="1/8t">{t("synth.editor.triplet8")}</option>
              </select>
            </div>
            {l.sync === "off" ? (
              <Row label={t("synth.editor.rate")} value={l.rate} min={0.05} max={20} step={0.01} log format={(v) => `${v.toFixed(2)} Hz`} onChange={(rate) => setLfo(index, { rate }, "rate")} />
            ) : (
              <p className="pl-14 text-[11px] text-slate-400">{t("synth.editor.followsTempo")}</p>
            )}
          </div>
        ))}
      </Section>

      <Section title={t("synth.editor.modulation")} className={wide ? "md:col-span-2 xl:col-span-3" : "lg:col-span-3"}>
        <p className="text-[11px] text-slate-400">
          {t("synth.editor.modHelp")}
        </p>
        {patch.matrix.length === 0 ? <p className="text-[11px] text-slate-500">{t("synth.editor.noRoutes")}</p> : null}
        <ul className="grid gap-2 md:grid-cols-2">
          {patch.matrix.map((slot, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/60 p-2">
              <select className={cn(fieldClass, "w-32")} value={slot.source} aria-label={t("synth.editor.routeSource", { n: index + 1 })} onChange={(event) => setSlot(index, { source: event.target.value as ModSource }, "src")}>
                {MOD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(`synth.editor.sources.${s.value}`)}
                  </option>
                ))}
              </select>
              <span className="text-slate-500" aria-hidden>
                →
              </span>
              <select className={cn(fieldClass, "w-36")} value={slot.dest} aria-label={t("synth.editor.routeDest", { n: index + 1 })} onChange={(event) => setSlot(index, { dest: event.target.value as ModDest }, "dst")}>
                {MOD_DESTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {t(`synth.editor.dests.${d.value.replace(".", "_")}` as MessageKey)}
                  </option>
                ))}
              </select>
              <div className="min-w-48 flex-1">
                <Row label={t("synth.editor.amount")} value={slot.amount} min={-1} max={1} step={0.005} format={signedPct} onChange={(amount) => setSlot(index, { amount }, "amt")} />
              </div>
              <button
                type="button"
                aria-label={t("synth.editor.removeRoute", { n: index + 1 })}
                onClick={() => set({ matrix: patch.matrix.filter((_, i) => i !== index) }, "")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <ActionButton
          disabled={patch.matrix.length >= MAX_MOD_SLOTS}
          onClick={() => set({ matrix: [...patch.matrix, { source: "lfo1", dest: "cutoff", amount: 0.25 }] }, "")}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> {t("synth.editor.addRoute", { n: patch.matrix.length, max: MAX_MOD_SLOTS })}
        </ActionButton>
      </Section>
    </div>
  );
}

const KEYS = Array.from({ length: 25 }, (_, i) => 48 + i);
const BLACK = new Set([1, 3, 6, 8, 10]);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface SynthEditorProps {
  patch: Patch;
  trackName: string;
  onChange: PatchChange;
  onPreview: (pitch: number) => void;
  onClose: () => void;
}

/** The full sound editor: oscillators, filter, envelopes, LFOs, modulation and presets. */
export function SynthEditor({ patch, trackName, onChange, onPreview, onClose }: SynthEditorProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("synth.editor.dialog", { name: trackName })}
        tabIndex={-1}
        className="w-full max-w-6xl rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl outline-hidden"
      >
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="display-font mr-2 text-base font-semibold text-slate-100">{t("synth.editor.heading", { name: trackName })}</h2>
          <PresetBar patch={patch} onChange={onChange} />
          <button
            type="button"
            aria-label={t("synth.editor.close")}
            onClick={onClose}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="mb-3 flex h-16 select-none gap-px overflow-x-auto rounded-lg bg-slate-800 p-1" role="group" aria-label={t("synth.editor.tryIt")}>
          {KEYS.map((pitch) => {
            const black = BLACK.has(pitch % 12);
            return (
              <button
                key={pitch}
                type="button"
                aria-label={t("synth.editor.playNote", { note: `${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}` })}
                onMouseDown={() => onPreview(pitch)}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), onPreview(pitch))}
                className={cn(
                  "flex min-w-6 flex-1 items-end justify-center rounded-sm pb-1 text-[9px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300",
                  black ? "h-9 bg-slate-950 text-slate-500 hover:bg-slate-700" : "bg-slate-200 text-slate-500 hover:bg-white"
                )}
              >
                {pitch % 12 === 0 ? `C${Math.floor(pitch / 12) - 1}` : ""}
              </button>
            );
          })}
        </div>

        <SynthControls patch={patch} onChange={onChange} />
      </div>
    </div>
  );
}
