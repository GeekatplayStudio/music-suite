/**
 * The built-in synthesizer: three oscillators with unison, noise, FM, a 12 or 24 dB filter
 * with drive, two envelopes, two LFOs and an eight-slot modulation matrix.
 *
 * Every voice is a graph of native Web Audio nodes, so the same code plays live, previews
 * notes and renders exports in an OfflineAudioContext. Modulation is wired by connecting a
 * source signal through a depth gain into the destination AudioParam, which Web Audio sums
 * with the parameter's own value at audio rate.
 */

export type OscWave =
  | "sine"
  | "triangle"
  | "sawtooth"
  | "square"
  | "pulse25"
  | "pulse12"
  | "organ"
  | "hollow"
  | "bright";

export interface Oscillator {
  on: boolean;
  wave: OscWave;
  /** Octaves, -3..3. */
  octave: number;
  /** Semitones, -12..12. */
  semi: number;
  /** Cents, -100..100. */
  fine: number;
  /** 0..1. */
  level: number;
  /** Stacked copies, 1..7. */
  unison: number;
  /** Spread of the stack in cents, 0..100. */
  detune: number;
  /** Stereo width of the stack, 0..1. */
  spread: number;
}

export interface Envelope {
  attack: number;
  decay: number;
  /** 0..1. */
  sustain: number;
  release: number;
}

export type LfoWave = "sine" | "triangle" | "sawtooth" | "square" | "random";
export type LfoSync = "off" | "1/1" | "1/2" | "1/4" | "1/8" | "1/16" | "1/4t" | "1/8t";

export interface Lfo {
  wave: LfoWave;
  /** Hz when not synced, 0.05..20. */
  rate: number;
  sync: LfoSync;
}

export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";

export interface Filter {
  type: FilterType;
  /** 12 or 24 dB per octave (one or two filter stages). */
  slope: 12 | 24;
  /** Hz. */
  cutoff: number;
  /** 0..1. */
  resonance: number;
  /** Saturation before the filter, 0..1. */
  drive: number;
  /** How far the cutoff follows the note, 0..1 (1 = one octave per octave). */
  keytrack: number;
  /** Envelope 2 sweep of the cutoff in octaves, -6..6. */
  envAmount: number;
}

export type ModSource = "lfo1" | "lfo2" | "env2" | "velocity" | "keytrack";
export type ModDest =
  | "pitch"
  | "osc1.pitch"
  | "osc2.pitch"
  | "osc3.pitch"
  | "osc1.level"
  | "osc2.level"
  | "osc3.level"
  | "noise"
  | "fm"
  | "cutoff"
  | "resonance"
  | "amp"
  | "pan";

export interface ModSlot {
  source: ModSource;
  dest: ModDest;
  /** -1..1. */
  amount: number;
}

export interface Patch {
  version: 2;
  name: string;
  osc: [Oscillator, Oscillator, Oscillator];
  noise: number;
  /** Oscillator 2 modulates oscillator 1's frequency, 0..1. */
  fm: number;
  filter: Filter;
  ampEnv: Envelope;
  modEnv: Envelope;
  lfo: [Lfo, Lfo];
  matrix: ModSlot[];
  /** "mono" plays one note at a time and glides between overlapping notes. */
  mode: "poly" | "mono";
  /** Seconds, 0..1. */
  glide: number;
  /** How much velocity sets loudness, 0..1. */
  velocity: number;
  /** Output level in dB, -24..12. */
  gainDb: number;
}

export const MOD_SOURCES: { value: ModSource; label: string }[] = [
  { value: "lfo1", label: "LFO 1" },
  { value: "lfo2", label: "LFO 2" },
  { value: "env2", label: "Envelope 2" },
  { value: "velocity", label: "Velocity" },
  { value: "keytrack", label: "Note (key)" },
];

export const MOD_DESTS: { value: ModDest; label: string }[] = [
  { value: "pitch", label: "Pitch (all)" },
  { value: "osc1.pitch", label: "Osc 1 pitch" },
  { value: "osc2.pitch", label: "Osc 2 pitch" },
  { value: "osc3.pitch", label: "Osc 3 pitch" },
  { value: "osc1.level", label: "Osc 1 level" },
  { value: "osc2.level", label: "Osc 2 level" },
  { value: "osc3.level", label: "Osc 3 level" },
  { value: "noise", label: "Noise level" },
  { value: "fm", label: "FM amount" },
  { value: "cutoff", label: "Filter cutoff" },
  { value: "resonance", label: "Resonance" },
  { value: "amp", label: "Volume" },
  { value: "pan", label: "Pan" },
];

export const OSC_WAVES: { value: OscWave; label: string }[] = [
  { value: "sawtooth", label: "Saw" },
  { value: "square", label: "Square" },
  { value: "pulse25", label: "Pulse 25%" },
  { value: "pulse12", label: "Pulse 12%" },
  { value: "triangle", label: "Triangle" },
  { value: "sine", label: "Sine" },
  { value: "organ", label: "Organ" },
  { value: "hollow", label: "Hollow" },
  { value: "bright", label: "Bright" },
];

export const MAX_MOD_SLOTS = 8;
const SYNC_BEATS: Record<Exclude<LfoSync, "off">, number> = {
  "1/1": 4,
  "1/2": 2,
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/4t": 2 / 3,
  "1/8t": 1 / 3,
};

/* ---------- Patches ---------- */

function osc(wave: OscWave, extra: Partial<Oscillator> = {}): Oscillator {
  return { on: true, wave, octave: 0, semi: 0, fine: 0, level: 0.8, unison: 1, detune: 0, spread: 0, ...extra };
}

const OFF = (wave: OscWave = "sawtooth"): Oscillator => osc(wave, { on: false, level: 0.6 });

export function initPatch(): Patch {
  return {
    version: 2,
    name: "Init",
    osc: [osc("sawtooth"), OFF("square"), OFF("sine")],
    noise: 0,
    fm: 0,
    filter: { type: "lowpass", slope: 12, cutoff: 3200, resonance: 0.1, drive: 0, keytrack: 0.3, envAmount: 0 },
    ampEnv: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.2 },
    modEnv: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.3 },
    lfo: [
      { wave: "sine", rate: 5, sync: "off" },
      { wave: "triangle", rate: 0.3, sync: "off" },
    ],
    matrix: [],
    mode: "poly",
    glide: 0,
    velocity: 0.6,
    gainDb: 0,
  };
}

function preset(name: string, change: (p: Patch) => void): Patch {
  const p = initPatch();
  p.name = name;
  change(p);
  return p;
}

/** Ready-made sounds. Each is a starting point, not a finished mix. */
const RAW_PRESETS: Patch[] = [
  initPatch(),
  preset("Analog bass", (p) => {
    p.osc = [osc("sawtooth"), osc("square", { octave: -1, level: 0.6 }), OFF()];
    p.filter = { ...p.filter, slope: 24, cutoff: 420, resonance: 0.25, envAmount: 3, drive: 0.3 };
    p.modEnv = { attack: 0.003, decay: 0.25, sustain: 0.1, release: 0.15 };
    p.ampEnv = { attack: 0.003, decay: 0.3, sustain: 0.85, release: 0.08 };
    p.mode = "mono";
    p.glide = 0.04;
  }),
  preset("Acid bass", (p) => {
    p.osc = [osc("sawtooth"), OFF(), OFF()];
    p.filter = { ...p.filter, slope: 24, cutoff: 300, resonance: 0.82, envAmount: 4.5, drive: 0.55, keytrack: 0.5 };
    p.modEnv = { attack: 0.002, decay: 0.18, sustain: 0, release: 0.1 };
    p.ampEnv = { attack: 0.002, decay: 0.2, sustain: 0.9, release: 0.06 };
    p.matrix = [{ source: "velocity", dest: "cutoff", amount: 0.35 }];
    p.mode = "mono";
    p.glide = 0.07;
  }),
  preset("Sub bass", (p) => {
    p.osc = [osc("sine", { octave: -1, level: 1 }), osc("triangle", { level: 0.25 }), OFF()];
    p.filter = { ...p.filter, cutoff: 900, resonance: 0 };
    p.ampEnv = { attack: 0.005, decay: 0.2, sustain: 1, release: 0.12 };
    p.mode = "mono";
  }),
  preset("Wobble bass", (p) => {
    p.osc = [osc("sawtooth", { unison: 3, detune: 14 }), osc("square", { octave: -1, level: 0.7 }), OFF()];
    p.filter = { ...p.filter, slope: 24, cutoff: 500, resonance: 0.55, drive: 0.5 };
    p.lfo[0] = { wave: "sine", rate: 2, sync: "1/8" };
    p.matrix = [{ source: "lfo1", dest: "cutoff", amount: 0.7 }];
    p.mode = "mono";
  }),
  preset("Supersaw lead", (p) => {
    p.osc = [osc("sawtooth", { unison: 7, detune: 32, spread: 0.9 }), osc("sawtooth", { octave: 1, level: 0.35, unison: 3, detune: 18, spread: 0.6 }), OFF()];
    p.filter = { ...p.filter, cutoff: 6500, resonance: 0.15 };
    p.ampEnv = { attack: 0.01, decay: 0.4, sustain: 0.8, release: 0.35 };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.008 }];
    p.gainDb = -4;
  }),
  preset("Mono lead", (p) => {
    p.osc = [osc("square"), osc("sawtooth", { fine: 8, level: 0.6 }), OFF()];
    p.filter = { ...p.filter, cutoff: 2800, resonance: 0.3, envAmount: 1.5 };
    p.modEnv = { attack: 0.005, decay: 0.3, sustain: 0.3, release: 0.2 };
    p.lfo[0] = { wave: "sine", rate: 5.5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.012 }];
    p.mode = "mono";
    p.glide = 0.09;
  }),
  preset("Pluck", (p) => {
    p.osc = [osc("sawtooth", { unison: 2, detune: 9, spread: 0.5 }), osc("square", { octave: 1, level: 0.3 }), OFF()];
    p.filter = { ...p.filter, cutoff: 600, resonance: 0.3, envAmount: 4, keytrack: 0.6 };
    p.modEnv = { attack: 0.001, decay: 0.22, sustain: 0, release: 0.2 };
    p.ampEnv = { attack: 0.001, decay: 0.45, sustain: 0, release: 0.3 };
  }),
  preset("Warm pad", (p) => {
    p.osc = [osc("sawtooth", { unison: 5, detune: 22, spread: 1, level: 0.6 }), osc("triangle", { octave: -1, level: 0.5 }), OFF()];
    p.filter = { ...p.filter, slope: 24, cutoff: 1400, resonance: 0.1 };
    p.ampEnv = { attack: 0.9, decay: 1, sustain: 0.85, release: 1.6 };
    p.lfo[1] = { wave: "triangle", rate: 0.15, sync: "off" };
    p.matrix = [{ source: "lfo2", dest: "cutoff", amount: 0.25 }];
    p.gainDb = -3;
  }),
  preset("Sweep pad", (p) => {
    p.osc = [osc("sawtooth", { unison: 4, detune: 18, spread: 0.8 }), osc("pulse25", { semi: 7, level: 0.4, unison: 2, detune: 10 }), OFF()];
    p.filter = { ...p.filter, slope: 24, cutoff: 700, resonance: 0.45 };
    p.ampEnv = { attack: 1.4, decay: 1, sustain: 0.9, release: 2 };
    p.lfo[1] = { wave: "sine", rate: 0.08, sync: "off" };
    p.matrix = [
      { source: "lfo2", dest: "cutoff", amount: 0.55 },
      { source: "lfo1", dest: "pan", amount: 0.3 },
    ];
    p.lfo[0] = { wave: "sine", rate: 0.4, sync: "off" };
    p.gainDb = -4;
  }),
  preset("Strings", (p) => {
    p.osc = [osc("sawtooth", { unison: 4, detune: 12, spread: 0.7 }), osc("sawtooth", { octave: 1, level: 0.3, unison: 2, detune: 8 }), OFF()];
    p.filter = { ...p.filter, cutoff: 3200, resonance: 0.05 };
    p.ampEnv = { attack: 0.35, decay: 0.5, sustain: 0.9, release: 0.8 };
    p.lfo[0] = { wave: "sine", rate: 5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.006 }];
    p.gainDb = -3;
  }),
  preset("Brass", (p) => {
    p.osc = [osc("sawtooth", { unison: 2, detune: 6 }), osc("sawtooth", { fine: -7, level: 0.7 }), OFF()];
    p.filter = { ...p.filter, cutoff: 900, resonance: 0.12, envAmount: 2.5 };
    p.modEnv = { attack: 0.07, decay: 0.4, sustain: 0.55, release: 0.2 };
    p.ampEnv = { attack: 0.04, decay: 0.3, sustain: 0.85, release: 0.25 };
  }),
  preset("Organ", (p) => {
    p.osc = [osc("organ"), osc("sine", { octave: -1, level: 0.5 }), OFF()];
    p.filter = { ...p.filter, cutoff: 9000, resonance: 0 };
    p.ampEnv = { attack: 0.005, decay: 0.1, sustain: 1, release: 0.08 };
    p.lfo[0] = { wave: "sine", rate: 6.5, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "amp", amount: 0.12 }];
  }),
  preset("FM bell", (p) => {
    p.osc = [osc("sine"), osc("sine", { octave: 1, semi: 7, level: 0 }), OFF()];
    p.fm = 0.45;
    p.filter = { ...p.filter, cutoff: 12000, resonance: 0 };
    p.ampEnv = { attack: 0.002, decay: 1.6, sustain: 0, release: 1.2 };
    p.modEnv = { attack: 0.002, decay: 0.8, sustain: 0, release: 0.5 };
    p.matrix = [{ source: "env2", dest: "fm", amount: 0.5 }];
  }),
  preset("FM electric piano", (p) => {
    p.osc = [osc("sine"), osc("sine", { level: 0 }), osc("triangle", { octave: 1, level: 0.15 })];
    p.fm = 0.15;
    p.filter = { ...p.filter, cutoff: 7000, resonance: 0 };
    p.ampEnv = { attack: 0.003, decay: 1.2, sustain: 0.25, release: 0.4 };
    p.modEnv = { attack: 0.001, decay: 0.35, sustain: 0, release: 0.3 };
    p.matrix = [
      { source: "env2", dest: "fm", amount: 0.35 },
      { source: "velocity", dest: "fm", amount: 0.2 },
    ];
  }),
  preset("Noise riser", (p) => {
    p.osc = [OFF(), OFF(), OFF()];
    p.noise = 0.9;
    p.filter = { ...p.filter, type: "bandpass", cutoff: 400, resonance: 0.5, envAmount: 5 };
    p.modEnv = { attack: 4, decay: 0.1, sustain: 1, release: 0.5 };
    p.ampEnv = { attack: 3, decay: 0.1, sustain: 1, release: 0.6 };
    p.gainDb = -6;
  }),
  preset("Chip square", (p) => {
    p.osc = [osc("pulse25"), OFF(), OFF()];
    p.filter = { ...p.filter, cutoff: 14000, resonance: 0, keytrack: 0 };
    p.ampEnv = { attack: 0.001, decay: 0.1, sustain: 0.7, release: 0.05 };
    p.lfo[0] = { wave: "square", rate: 12, sync: "off" };
    p.matrix = [{ source: "lfo1", dest: "pitch", amount: 0.004 }];
  }),
];

/**
 * Output levels measured on one held note against Init (basses +2 dB, leads +1 dB,
 * everything else level with Init), so switching presets does not jump in volume.
 */
const PRESET_LEVELS: Record<string, number> = {
  "Analog bass": -12,
  "Acid bass": -13.7,
  "Sub bass": -5.2,
  "Wobble bass": -13.4,
  "Supersaw lead": 3,
  "Mono lead": -5,
  Pluck: 9.6,
  "Warm pad": -2.4,
  "Sweep pad": -5.5,
  Strings: -1.5,
  Brass: -1.1,
  Organ: -5,
  "FM bell": 1,
  "FM electric piano": 4.5,
  "Noise riser": 7.5,
  "Chip square": 6.5,
};

export const FACTORY_PRESETS: Patch[] = RAW_PRESETS.map((p) =>
  p.name in PRESET_LEVELS ? { ...p, gainDb: PRESET_LEVELS[p.name] } : p
);

const clampNumber = (value: unknown, low: number, high: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

const WAVES = OSC_WAVES.map((w) => w.value);
const SOURCES = MOD_SOURCES.map((s) => s.value);
const DESTS = MOD_DESTS.map((d) => d.value);
const LFO_WAVES: LfoWave[] = ["sine", "triangle", "sawtooth", "square", "random"];
const SYNCS: LfoSync[] = ["off", "1/1", "1/2", "1/4", "1/8", "1/16", "1/4t", "1/8t"];
const FILTER_TYPES: FilterType[] = ["lowpass", "highpass", "bandpass", "notch"];

function normalizeOsc(raw: unknown, fallback: Oscillator): Oscillator {
  const o = (raw ?? {}) as Partial<Oscillator>;
  return {
    on: typeof o.on === "boolean" ? o.on : fallback.on,
    wave: oneOf(o.wave, WAVES, fallback.wave),
    octave: Math.round(clampNumber(o.octave, -3, 3, fallback.octave)),
    semi: Math.round(clampNumber(o.semi, -12, 12, fallback.semi)),
    fine: clampNumber(o.fine, -100, 100, fallback.fine),
    level: clampNumber(o.level, 0, 1, fallback.level),
    unison: Math.round(clampNumber(o.unison, 1, 7, fallback.unison)),
    detune: clampNumber(o.detune, 0, 100, fallback.detune),
    spread: clampNumber(o.spread, 0, 1, fallback.spread),
  };
}

function normalizeEnv(raw: unknown, fallback: Envelope): Envelope {
  const e = (raw ?? {}) as Partial<Envelope>;
  return {
    attack: clampNumber(e.attack, 0.001, 10, fallback.attack),
    decay: clampNumber(e.decay, 0.001, 10, fallback.decay),
    sustain: clampNumber(e.sustain, 0, 1, fallback.sustain),
    release: clampNumber(e.release, 0.005, 10, fallback.release),
  };
}

/** A safe patch from anything saved, including the first editor's four-setting synth. */
export function normalizePatch(raw: unknown, legacy?: { wave?: unknown; attack?: unknown; release?: unknown; cutoff?: unknown }): Patch {
  const base = initPatch();
  if (!raw || typeof raw !== "object") {
    if (legacy) {
      base.name = "Classic";
      base.osc[0] = { ...base.osc[0], wave: oneOf(legacy.wave, WAVES, "sawtooth") };
      const rich = base.osc[0].wave === "sawtooth" || base.osc[0].wave === "square";
      if (rich) base.osc[0] = { ...base.osc[0], unison: 2, detune: 12 };
      base.ampEnv = { attack: clampNumber(legacy.attack, 0.001, 10, 0.01), decay: 0.1, sustain: 1, release: clampNumber(legacy.release, 0.005, 10, 0.2) };
      base.filter = { ...base.filter, cutoff: clampNumber(legacy.cutoff, 60, 20000, 3200), resonance: 0, keytrack: 0 };
    }
    return base;
  }
  const p = raw as Partial<Patch>;
  const oscs = Array.isArray(p.osc) ? p.osc : [];
  const lfos = Array.isArray(p.lfo) ? p.lfo : [];
  const filter = (p.filter ?? {}) as Partial<Filter>;
  return {
    version: 2,
    name: typeof p.name === "string" && p.name.trim() ? p.name.slice(0, 60) : base.name,
    osc: [normalizeOsc(oscs[0], base.osc[0]), normalizeOsc(oscs[1], base.osc[1]), normalizeOsc(oscs[2], base.osc[2])],
    noise: clampNumber(p.noise, 0, 1, 0),
    fm: clampNumber(p.fm, 0, 1, 0),
    filter: {
      type: oneOf(filter.type, FILTER_TYPES, "lowpass"),
      slope: filter.slope === 24 ? 24 : 12,
      cutoff: clampNumber(filter.cutoff, 30, 20000, base.filter.cutoff),
      resonance: clampNumber(filter.resonance, 0, 1, base.filter.resonance),
      drive: clampNumber(filter.drive, 0, 1, 0),
      keytrack: clampNumber(filter.keytrack, 0, 1, base.filter.keytrack),
      envAmount: clampNumber(filter.envAmount, -6, 6, 0),
    },
    ampEnv: normalizeEnv(p.ampEnv, base.ampEnv),
    modEnv: normalizeEnv(p.modEnv, base.modEnv),
    lfo: [0, 1].map((i) => {
      const l = (lfos[i] ?? {}) as Partial<Lfo>;
      return {
        wave: oneOf(l.wave, LFO_WAVES, base.lfo[i].wave),
        rate: clampNumber(l.rate, 0.05, 20, base.lfo[i].rate),
        sync: oneOf(l.sync, SYNCS, "off"),
      };
    }) as [Lfo, Lfo],
    matrix: (Array.isArray(p.matrix) ? p.matrix : [])
      .slice(0, MAX_MOD_SLOTS)
      .map((slot) => ({
        source: oneOf((slot as ModSlot)?.source, SOURCES, "lfo1"),
        dest: oneOf((slot as ModSlot)?.dest, DESTS, "cutoff"),
        amount: clampNumber((slot as ModSlot)?.amount, -1, 1, 0),
      })),
    mode: p.mode === "mono" ? "mono" : "poly",
    glide: clampNumber(p.glide, 0, 1, 0),
    velocity: clampNumber(p.velocity, 0, 1, 0.6),
    gainDb: clampNumber(p.gainDb, -24, 12, 0),
  };
}

/* ---------- Waveforms ---------- */

const periodicCache = new WeakMap<BaseAudioContext, Map<OscWave, PeriodicWave>>();

/** Fourier series for the shapes the native oscillator does not have. */
function harmonics(wave: OscWave): Float32Array {
  const n = 64;
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    if (wave === "pulse25" || wave === "pulse12") {
      const duty = wave === "pulse25" ? 0.25 : 0.125;
      imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    } else if (wave === "organ") {
      // Drawbars 16', 8', 5 1/3', 4' and 2'.
      const bars: Record<number, number> = { 1: 1, 2: 0.8, 3: 0.6, 4: 0.5, 8: 0.35 };
      imag[k] = bars[k] ?? 0;
    } else if (wave === "hollow") {
      imag[k] = k % 2 === 1 ? 1 / k : 0.15 / k;
    } else if (wave === "bright") {
      imag[k] = 1 / Math.sqrt(k);
    }
  }
  return imag;
}

function setWave(ctx: BaseAudioContext, node: OscillatorNode, wave: OscWave): void {
  if (wave === "sine" || wave === "triangle" || wave === "sawtooth" || wave === "square") {
    node.type = wave;
    return;
  }
  let cache = periodicCache.get(ctx);
  if (!cache) {
    cache = new Map();
    periodicCache.set(ctx, cache);
  }
  let periodic = cache.get(wave);
  if (!periodic) {
    const imag = harmonics(wave);
    periodic = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    cache.set(wave, periodic);
  }
  node.setPeriodicWave(periodic);
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const randomCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x2545f491;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = seed / 0x80000000 - 1;
    }
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** 64 random steps, one per "cycle" when played at the LFO rate: sample and hold. */
const RANDOM_STEPS = 64;
function randomBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = randomCache.get(ctx);
  if (!buffer) {
    const stepLength = 256;
    buffer = ctx.createBuffer(1, RANDOM_STEPS * stepLength, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x9e3779b1;
    for (let s = 0; s < RANDOM_STEPS; s++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data.fill(seed / 0x80000000 - 1, s * stepLength, (s + 1) * stepLength);
    }
    randomCache.set(ctx, buffer);
  }
  return buffer;
}

const driveCurves = new Map<number, Float32Array<ArrayBuffer>>();
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = Math.round(amount * 20);
  let curve = driveCurves.get(key);
  if (!curve) {
    const k = 1 + key * 0.6;
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    driveCurves.set(key, curve);
  }
  return curve;
}

/* ---------- Voices ---------- */

export interface VoiceOptions {
  /** Velocity 0..1. */
  velocity: number;
  /** Tempo, for LFOs synced to note lengths. */
  bpm: number;
  /** Pitch-bend in cents applied to every oscillator. */
  bendCents?: number;
  /** Mono glide: start from this note and slide to the played one. */
  glideFrom?: number | null;
}

export interface Voice {
  /** Start the release at a time; returns when the voice is silent. */
  release: (at: number) => number;
  /** Retune every oscillator (pitch-bend) from a time. */
  bend: (cents: number, at: number) => void;
  sources: AudioScheduledSourceNode[];
}

/** Value of an ADSR started at 0 at `start`, at time `t`, before release. */
export function envelopeValue(env: Envelope, start: number, t: number): number {
  const elapsed = t - start;
  if (elapsed <= 0) return 0;
  if (elapsed < env.attack) return elapsed / env.attack;
  const tau = Math.max(0.001, env.decay / 4);
  return env.sustain + (1 - env.sustain) * Math.exp(-(elapsed - env.attack) / tau);
}

function scheduleAttack(param: AudioParam, env: Envelope, start: number, peak: number): void {
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(peak, start + env.attack);
  param.setTargetAtTime(env.sustain * peak, start + env.attack, Math.max(0.001, env.decay / 4));
}

function scheduleRelease(param: AudioParam, env: Envelope, start: number, at: number, peak: number): void {
  const value = envelopeValue(env, start, at) * peak;
  param.cancelScheduledValues(at);
  param.setValueAtTime(value, at);
  param.setTargetAtTime(0, at, Math.max(0.002, env.release / 4));
}

function lfoRate(lfo: Lfo, bpm: number): number {
  if (lfo.sync === "off") return lfo.rate;
  return bpm / 60 / SYNC_BEATS[lfo.sync];
}

/** Units each destination's -1..1 amount maps to. */
const DEST_SCALE: Record<ModDest, number> = {
  pitch: 1200,
  "osc1.pitch": 1200,
  "osc2.pitch": 1200,
  "osc3.pitch": 1200,
  "osc1.level": 1,
  "osc2.level": 1,
  "osc3.level": 1,
  noise: 1,
  fm: 1,
  cutoff: 4800,
  resonance: 15,
  amp: 1,
  pan: 1,
};

export function midiToHz(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/**
 * Build and start one voice. It sounds until `release()` is called (or `until`, for notes
 * whose end is already known), then dies away over the release time.
 */
export function startVoice(
  ctx: BaseAudioContext,
  patch: Patch,
  output: AudioNode,
  pitch: number,
  level: number,
  when: number,
  options: VoiceOptions
): Voice {
  const sources: AudioScheduledSourceNode[] = [];
  const velocity = Math.min(1, Math.max(0, options.velocity));
  const keyPosition = (pitch - 60) / 24; // About -1..1 over the keyboard's middle.
  const peak = level * (1 - patch.velocity + patch.velocity * velocity) * Math.pow(10, patch.gainDb / 20);
  const nyquist = ctx.sampleRate * 0.45;

  // Output chain: drive -> filter(s) -> amp envelope -> amp modulation -> pan -> out.
  const panner = ctx.createStereoPanner();
  panner.connect(output);
  const ampMod = ctx.createGain();
  ampMod.gain.value = 1;
  ampMod.connect(panner);
  const amp = ctx.createGain();
  amp.connect(ampMod);
  scheduleAttack(amp.gain, patch.ampEnv, when, peak);

  const filters: BiquadFilterNode[] = [];
  const stages = patch.filter.slope === 24 ? 2 : 1;
  const baseCutoff = patch.filter.cutoff * Math.pow(2, (patch.filter.keytrack * (pitch - 60)) / 12);
  const q = 0.5 + Math.pow(patch.filter.resonance, 1.5) * (stages === 2 ? 9 : 18);
  for (let i = 0; i < stages; i++) {
    const filter = ctx.createBiquadFilter();
    filter.type = patch.filter.type;
    filter.frequency.value = Math.min(nyquist, Math.max(20, baseCutoff));
    filter.Q.value = i === 0 ? q : Math.min(q, 0.9);
    filters.push(filter);
  }
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(amp);

  const mix = ctx.createGain();
  if (patch.filter.drive > 0.001) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(patch.filter.drive);
    shaper.oversample = "2x";
    const pre = ctx.createGain();
    pre.gain.value = 1 + patch.filter.drive * 3;
    mix.connect(pre).connect(shaper).connect(filters[0]);
  } else {
    mix.connect(filters[0]);
  }
  mix.gain.value = 0.5;

  // Oscillators, each a unison stack with its own level and stereo spread.
  const target = midiToHz(pitch);
  const from = options.glideFrom != null && patch.glide > 0 ? midiToHz(options.glideFrom) : null;
  const bend = options.bendCents ?? 0;
  const fmUsed = patch.fm > 0 || patch.matrix.some((m) => m.dest === "fm" && m.amount !== 0);
  const stacks: { nodes: OscillatorNode[]; detunes: number[]; level: GainNode }[] = [];
  patch.osc.forEach((spec, index) => {
    const levelGain = ctx.createGain();
    levelGain.gain.value = spec.on ? spec.level : 0;
    levelGain.connect(mix);
    const nodes: OscillatorNode[] = [];
    const detunes: number[] = [];
    // Oscillator 2 also runs when it is only the FM modulator.
    if (spec.on || (index === 1 && fmUsed)) {
      const count = spec.unison;
      const ratio = Math.pow(2, spec.octave + spec.semi / 12);
      for (let u = 0; u < count; u++) {
        const offset = count === 1 ? 0 : (u / (count - 1) - 0.5) * 2; // -1..1 across the stack.
        const node = ctx.createOscillator();
        setWave(ctx, node, spec.wave);
        const frequency = target * ratio;
        if (from !== null) {
          node.frequency.setValueAtTime(from * ratio, when);
          node.frequency.exponentialRampToValueAtTime(frequency, when + patch.glide);
        } else {
          node.frequency.value = frequency;
        }
        const cents = spec.fine + offset * spec.detune * 0.5;
        node.detune.value = cents + bend;
        const gain = ctx.createGain();
        gain.gain.value = 1 / Math.sqrt(count);
        if (spec.spread > 0 && count > 1) {
          const pan = ctx.createStereoPanner();
          pan.pan.value = offset * spec.spread;
          node.connect(gain).connect(pan).connect(levelGain);
        } else {
          node.connect(gain).connect(levelGain);
        }
        node.start(when);
        nodes.push(node);
        detunes.push(cents);
        sources.push(node);
      }
    }
    stacks.push({ nodes, detunes, level: levelGain });
  });

  // FM: oscillator 2 drives oscillator 1's frequency. Its own level still decides whether it is heard.
  const fmGain = ctx.createGain();
  fmGain.gain.value = patch.fm * target * 4;
  if (fmUsed && stacks[1].nodes.length) {
    stacks[1].nodes[0].connect(fmGain);
    for (const node of stacks[0].nodes) fmGain.connect(node.frequency);
  }

  // Noise.
  const noiseLevel = ctx.createGain();
  noiseLevel.gain.value = patch.noise;
  const noiseUsed = patch.noise > 0 || patch.matrix.some((m) => m.dest === "noise" && m.amount !== 0);
  if (noiseUsed) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    noise.connect(noiseLevel).connect(mix);
    noise.start(when, (pitch * 0.173) % 1.9);
    sources.push(noise);
  }

  // Modulation sources.
  const lfoNodes: (AudioNode | null)[] = [null, null];
  const lfoNode = (index: 0 | 1): AudioNode => {
    const existing = lfoNodes[index];
    if (existing) return existing;
    const spec = patch.lfo[index];
    const rate = lfoRate(spec, options.bpm);
    let node: AudioScheduledSourceNode;
    if (spec.wave === "random") {
      const source = ctx.createBufferSource();
      source.buffer = randomBuffer(ctx);
      source.loop = true;
      // Each step is 256 samples long: one new random value per LFO cycle.
      source.playbackRate.value = (rate * 256) / ctx.sampleRate;
      node = source;
    } else {
      const oscillator = ctx.createOscillator();
      oscillator.type = spec.wave;
      oscillator.frequency.value = rate;
      node = oscillator;
    }
    node.start(when);
    sources.push(node);
    lfoNodes[index] = node;
    return node;
  };
  let modEnvSource: ConstantSourceNode | null = null;
  const modEnv = (): ConstantSourceNode => {
    if (modEnvSource) return modEnvSource;
    const source = ctx.createConstantSource();
    scheduleAttack(source.offset, patch.modEnv, when, 1);
    source.start(when);
    sources.push(source);
    modEnvSource = source;
    return source;
  };

  // The filter envelope is a fixed route from envelope 2.
  if (Math.abs(patch.filter.envAmount) > 0.001) {
    const depth = ctx.createGain();
    depth.gain.value = patch.filter.envAmount * 1200;
    modEnv().connect(depth);
    for (const filter of filters) depth.connect(filter.detune);
  }

  const params = (dest: ModDest): AudioParam[] => {
    const allDetunes = () => stacks.flatMap((s) => s.nodes.map((n) => n.detune));
    switch (dest) {
      case "pitch":
        return allDetunes();
      case "osc1.pitch":
        return stacks[0].nodes.map((n) => n.detune);
      case "osc2.pitch":
        return stacks[1].nodes.map((n) => n.detune);
      case "osc3.pitch":
        return stacks[2].nodes.map((n) => n.detune);
      case "osc1.level":
        return [stacks[0].level.gain];
      case "osc2.level":
        return [stacks[1].level.gain];
      case "osc3.level":
        return [stacks[2].level.gain];
      case "noise":
        return [noiseLevel.gain];
      case "fm":
        return [fmGain.gain];
      case "cutoff":
        return filters.map((f) => f.detune);
      case "resonance":
        return [filters[0].Q];
      case "amp":
        return [ampMod.gain];
      case "pan":
        return [panner.pan];
    }
  };

  for (const slot of patch.matrix) {
    if (!slot.amount) continue;
    const scale = DEST_SCALE[slot.dest] * (slot.dest === "fm" ? target * 4 : 1);
    const amount = slot.amount * scale;
    if (slot.source === "velocity" || slot.source === "keytrack") {
      // Fixed for the whole note: add straight onto the parameter's value.
      const value = slot.source === "velocity" ? velocity : keyPosition;
      for (const param of params(slot.dest)) param.value += amount * value;
      continue;
    }
    const source = slot.source === "env2" ? modEnv() : lfoNode(slot.source === "lfo1" ? 0 : 1);
    const depth = ctx.createGain();
    depth.gain.value = amount;
    source.connect(depth);
    for (const param of params(slot.dest)) depth.connect(param);
  }

  let stopped = false;
  return {
    sources,
    release: (at: number) => {
      const end = at + patch.ampEnv.release * 1.5 + 0.05;
      if (stopped) return end;
      stopped = true;
      scheduleRelease(amp.gain, patch.ampEnv, when, at, peak);
      if (modEnvSource) scheduleRelease(modEnvSource.offset, patch.modEnv, when, at, 1);
      for (const node of sources) {
        try {
          node.stop(end);
        } catch {
          /* already stopped */
        }
      }
      return end;
    },
    bend: (cents: number, at: number) => {
      stacks.forEach((stack) =>
        stack.nodes.forEach((node, i) => node.detune.setTargetAtTime(stack.detunes[i] + cents, at, 0.005))
      );
    },
  };
}

/** A note with a known end: start it and schedule its release. */
export function playNote(
  ctx: BaseAudioContext,
  patch: Patch,
  output: AudioNode,
  pitch: number,
  level: number,
  when: number,
  until: number,
  options: VoiceOptions,
  sources: AudioScheduledSourceNode[]
): void {
  const voice = startVoice(ctx, patch, output, pitch, level, when, options);
  voice.release(Math.max(when + 0.005, until));
  sources.push(...voice.sources);
}

/* ---------- Saved sounds (this browser) ---------- */

const USER_KEY = "music-suite-synth-presets";

export function loadUserPresets(): Patch[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(USER_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 200).map((p) => normalizePatch(p)) : [];
  } catch {
    return [];
  }
}

export function saveUserPreset(patch: Patch): Patch[] {
  const list = loadUserPresets().filter((p) => p.name !== patch.name);
  const next = [...list, normalizePatch(patch)].sort((a, b) => a.name.localeCompare(b.name));
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: kept for this visit only */
  }
  return next;
}

export function deleteUserPreset(name: string): Patch[] {
  const next = loadUserPresets().filter((p) => p.name !== name);
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
