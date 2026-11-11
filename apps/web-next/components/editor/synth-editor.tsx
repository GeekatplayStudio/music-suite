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
  return (
    <>
      <Row label="Attack" value={env.attack} min={0.001} max={10} step={0.001} log format={ms} onChange={(attack) => onChange({ ...env, attack }, `${prefix}.a`)} />
      <Row label="Decay" value={env.decay} min={0.001} max={10} step={0.001} log format={ms} onChange={(decay) => onChange({ ...env, decay }, `${prefix}.d`)} />
      <Row label="Sustain" value={env.sustain} min={0} max={1} step={0.01} format={pct} onChange={(sustain) => onChange({ ...env, sustain }, `${prefix}.s`)} />
      <Row label="Release" value={env.release} min={0.005} max={10} step={0.001} log format={ms} onChange={(release) => onChange({ ...env, release }, `${prefix}.r`)} />
    </>
  );
}

/** Sound name, presets and "my sounds": shared by the editor's dialog and Synth Studio. */
export function PresetBar({ patch, onChange }: { patch: Patch; onChange: PatchChange }) {
  const [userPresets, setUserPresets] = useState<Patch[]>(() => loadUserPresets());
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (change: Partial<Patch>, key: string) => onChange({ ...patch, ...change }, key);
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const sound = await readSoundFile(file);
      if (sound.kind !== "synth") throw new Error(`That is a ${sound.plugin} sound. Open it from the plugin instrument's sound list instead.`);
      onChange(sound.patch, "");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "That file could not be opened.");
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
      aria-label="Sound name"
      onChange={(event) => set({ name: event.target.value }, "name")}
    />
    <select className={cn(fieldClass, "w-52")} value="" aria-label="Load a preset" onChange={(event) => event.target.value && loadPreset(event.target.value)}>
      <option value="">Load a preset…</option>
      <optgroup label="Factory">
        {FACTORY_PRESETS.map((p) => (
          <option key={`f-${p.name}`} value={p.name}>
            {p.name}
          </option>
        ))}
      </optgroup>
      {userPresets.length ? (
        <optgroup label="My sounds">
          {userPresets.map((p) => (
            <option key={`u-${p.name}`} value={p.name}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
    <ActionButton onClick={() => setUserPresets(saveUserPreset(patch))} title="Keep this sound in this browser under its name">
      <Save className="h-3.5 w-3.5" aria-hidden /> Save as my sound
    </ActionButton>
    {userPresets.some((p) => p.name === patch.name) ? (
      <ActionButton onClick={() => setUserPresets(deleteUserPreset(patch.name))} title="Remove this name from My sounds">
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Forget
      </ActionButton>
    ) : null}
    <ActionButton onClick={() => exportSound({ kind: "synth", patch })} title="Save this sound as a file, to back it up or share it">
      <Download className="h-3.5 w-3.5" aria-hidden /> Export
    </ActionButton>
    <ActionButton onClick={() => fileRef.current?.click()} title="Open a sound file saved with Export">
      <Upload className="h-3.5 w-3.5" aria-hidden /> Import
    </ActionButton>
    <input
      ref={fileRef}
      type="file"
      accept={`${SOUND_FILE_EXTENSION},application/json`}
      className="hidden"
      aria-label="Sound file to import"
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
        <Section key={index} title={`Oscillator ${index + 1}`}>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
              <input type="checkbox" checked={o.on} onChange={(event) => setOsc(index, { on: event.target.checked }, "on")} className="h-4 w-4 accent-cyan-400" />
              On
            </label>
            <select className={fieldClass} value={o.wave} aria-label={`Oscillator ${index + 1} wave`} onChange={(event) => setOsc(index, { wave: event.target.value as Oscillator["wave"] }, "wave")}>
              {OSC_WAVES.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <Row label="Octave" value={o.octave} min={-3} max={3} step={1} format={(v) => `${v > 0 ? "+" : ""}${v}`} onChange={(octave) => setOsc(index, { octave }, "oct")} />
          <Row label="Semitones" value={o.semi} min={-12} max={12} step={1} format={(v) => `${v > 0 ? "+" : ""}${v}`} onChange={(semi) => setOsc(index, { semi }, "semi")} />
          <Row label="Fine" value={o.fine} min={-100} max={100} step={1} format={(v) => `${v > 0 ? "+" : ""}${Math.round(v)} ct`} onChange={(fine) => setOsc(index, { fine }, "fine")} />
          <Row label="Level" value={o.level} min={0} max={1} step={0.01} format={pct} onChange={(level) => setOsc(index, { level }, "level")} />
          <Row label="Unison" value={o.unison} min={1} max={7} step={1} format={(v) => `${v} voice${v === 1 ? "" : "s"}`} onChange={(unison) => setOsc(index, { unison }, "uni")} />
          <Row label="Detune" value={o.detune} min={0} max={100} step={1} format={(v) => `${Math.round(v)} ct`} onChange={(detune) => setOsc(index, { detune }, "det")} />
          <Row label="Stereo spread" value={o.spread} min={0} max={1} step={0.01} format={pct} onChange={(spread) => setOsc(index, { spread }, "spr")} />
        </Section>
      ))}

      <Section title="Filter">
        <div className="flex gap-2">
          <select className={fieldClass} value={patch.filter.type} aria-label="Filter type" onChange={(event) => set({ filter: { ...patch.filter, type: event.target.value as Patch["filter"]["type"] } }, "flt.type")}>
            <option value="lowpass">Low-pass</option>
            <option value="highpass">High-pass</option>
            <option value="bandpass">Band-pass</option>
            <option value="notch">Notch</option>
          </select>
          <select className={fieldClass} value={patch.filter.slope} aria-label="Filter slope" onChange={(event) => set({ filter: { ...patch.filter, slope: event.target.value === "24" ? 24 : 12 } }, "flt.slope")}>
            <option value={12}>12 dB/oct</option>
            <option value={24}>24 dB/oct</option>
          </select>
        </div>
        <Row label="Cutoff" value={patch.filter.cutoff} min={30} max={20000} step={1} log format={hz} onChange={(cutoff) => set({ filter: { ...patch.filter, cutoff } }, "flt.cut")} />
        <Row label="Resonance" value={patch.filter.resonance} min={0} max={1} step={0.01} format={pct} onChange={(resonance) => set({ filter: { ...patch.filter, resonance } }, "flt.res")} />
        <Row label="Drive" value={patch.filter.drive} min={0} max={1} step={0.01} format={pct} onChange={(drive) => set({ filter: { ...patch.filter, drive } }, "flt.drv")} />
        <Row label="Key follow" value={patch.filter.keytrack} min={0} max={1} step={0.01} format={pct} onChange={(keytrack) => set({ filter: { ...patch.filter, keytrack } }, "flt.key")} />
        <Row label="Env 2 amount" value={patch.filter.envAmount} min={-6} max={6} step={0.1} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} oct`} onChange={(envAmount) => set({ filter: { ...patch.filter, envAmount } }, "flt.env")} />
      </Section>

      <Section title="Noise, FM and voice">
        <Row label="Noise" value={patch.noise} min={0} max={1} step={0.01} format={pct} onChange={(noise) => set({ noise }, "noise")} />
        <Row label="FM (osc 2 → 1)" value={patch.fm} min={0} max={1} step={0.01} format={pct} onChange={(fm) => set({ fm }, "fm")} />
        <label className="flex h-7 items-center gap-2 text-[11px] text-slate-400">
          <span className="w-24 shrink-0">Voices</span>
          <select className={fieldClass} value={patch.mode} aria-label="Voice mode" onChange={(event) => set({ mode: event.target.value === "mono" ? "mono" : "poly" }, "mode")}>
            <option value="poly">Poly (chords)</option>
            <option value="mono">Mono (one note, glides)</option>
          </select>
        </label>
        <Row label="Glide" value={patch.glide} min={0} max={1} step={0.005} format={ms} onChange={(glide) => set({ glide }, "glide")} />
        <Row label="Velocity" value={patch.velocity} min={0} max={1} step={0.01} format={pct} onChange={(velocity) => set({ velocity }, "vel")} />
        <Row label="Volume" value={patch.gainDb} min={-24} max={12} step={0.5} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`} onChange={(gainDb) => set({ gainDb }, "gain")} />
      </Section>

      <Section title="Envelopes">
        <p className="text-[11px] font-semibold text-slate-300">1 — Volume</p>
        <EnvelopeRows env={patch.ampEnv} prefix="amp" onChange={(ampEnv, key) => set({ ampEnv }, key)} />
        <p className="pt-1 text-[11px] font-semibold text-slate-300">2 — Modulation (filter sweep and matrix)</p>
        <EnvelopeRows env={patch.modEnv} prefix="mod" onChange={(modEnv, key) => set({ modEnv }, key)} />
      </Section>

      <Section title="LFOs">
        {patch.lfo.map((l, index) => (
          <div key={index} className="space-y-1 pb-1">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-slate-300">LFO {index + 1}</span>
              <select className={fieldClass} value={l.wave} aria-label={`LFO ${index + 1} shape`} onChange={(event) => setLfo(index, { wave: event.target.value as LfoWave }, "wave")}>
                <option value="sine">Sine</option>
                <option value="triangle">Triangle</option>
                <option value="sawtooth">Saw</option>
                <option value="square">Square</option>
                <option value="random">Random steps</option>
              </select>
              <select className={fieldClass} value={l.sync} aria-label={`LFO ${index + 1} tempo sync`} onChange={(event) => setLfo(index, { sync: event.target.value as LfoSync }, "sync")}>
                <option value="off">Free (Hz)</option>
                <option value="1/1">1 bar</option>
                <option value="1/2">1/2</option>
                <option value="1/4">1/4</option>
                <option value="1/8">1/8</option>
                <option value="1/16">1/16</option>
                <option value="1/4t">1/4 triplet</option>
                <option value="1/8t">1/8 triplet</option>
              </select>
            </div>
            {l.sync === "off" ? (
              <Row label="Rate" value={l.rate} min={0.05} max={20} step={0.01} log format={(v) => `${v.toFixed(2)} Hz`} onChange={(rate) => setLfo(index, { rate }, "rate")} />
            ) : (
              <p className="pl-14 text-[11px] text-slate-400">Follows the project tempo.</p>
            )}
          </div>
        ))}
      </Section>

      <Section title="Modulation" className={wide ? "md:col-span-2 xl:col-span-3" : "lg:col-span-3"}>
        <p className="text-[11px] text-slate-400">
          Route any source to any destination. Amount sets direction and depth: pitch uses up to an octave, cutoff up to four
          octaves.
        </p>
        {patch.matrix.length === 0 ? <p className="text-[11px] text-slate-500">No routes yet.</p> : null}
        <ul className="grid gap-2 md:grid-cols-2">
          {patch.matrix.map((slot, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/60 p-2">
              <select className={cn(fieldClass, "w-32")} value={slot.source} aria-label={`Route ${index + 1} source`} onChange={(event) => setSlot(index, { source: event.target.value as ModSource }, "src")}>
                {MOD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="text-slate-500" aria-hidden>
                →
              </span>
              <select className={cn(fieldClass, "w-36")} value={slot.dest} aria-label={`Route ${index + 1} destination`} onChange={(event) => setSlot(index, { dest: event.target.value as ModDest }, "dst")}>
                {MOD_DESTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <div className="min-w-48 flex-1">
                <Row label="Amount" value={slot.amount} min={-1} max={1} step={0.005} format={signedPct} onChange={(amount) => setSlot(index, { amount }, "amt")} />
              </div>
              <button
                type="button"
                aria-label={`Remove route ${index + 1}`}
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
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add a route ({patch.matrix.length} of {MAX_MOD_SLOTS})
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
        aria-label={`Sound editor for ${trackName}`}
        tabIndex={-1}
        className="w-full max-w-6xl rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl outline-hidden"
      >
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="display-font mr-2 text-base font-semibold text-slate-100">Sound — {trackName}</h2>
          <PresetBar patch={patch} onChange={onChange} />
          <button
            type="button"
            aria-label="Close the sound editor"
            onClick={onClose}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="mb-3 flex h-16 select-none gap-px overflow-x-auto rounded-lg bg-slate-800 p-1" role="group" aria-label="Try the sound">
          {KEYS.map((pitch) => {
            const black = BLACK.has(pitch % 12);
            return (
              <button
                key={pitch}
                type="button"
                aria-label={`Play ${NOTE_NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`}
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
