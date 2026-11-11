import { initPatch, normalizePatch, type Patch } from "@/lib/editor/synth";

export interface Asset {
  id: string;
  name: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  source: "upload" | "run" | "stem" | "process";
  parent_id: string | null;
  label: string | null;
  created_at: string;
}

export interface Analysis {
  bpm: number | null;
  bpm_confidence: number;
  beats: number[];
  downbeats: number[];
  first_downbeat: number | null;
  key: string | null;
  scale: "major" | "minor" | null;
  key_label: string | null;
  key_confidence: number;
  lufs: number | null;
  duration_seconds: number;
  engine: { beats: string; key: string };
}

export type JobOp =
  | "separate"
  | "stretch"
  | "pitch"
  | "denoise"
  | "normalize"
  | "analyze"
  | "match"
  | "plugin"
  | "declick"
  | "dehum"
  | "declip"
  | "dereverb"
  | "spectral_repair"
  | "warp"
  | "quantize"
  | "to_midi"
  | "structure"
  | "generate"
  | "generate_song"
  | "render_instrument"
  | "plugin_window";

export interface GenerationStatus {
  available: boolean;
  node_installed: boolean;
  models: string[];
}

export interface Job {
  id: string;
  op: JobOp;
  asset_id: string | null;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  stage: string;
  detail: string;
  error: string | null;
  result_assets: Asset[];
  result: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Capabilities {
  separation: {
    available: boolean;
    engine: string;
    engines: string[];
    stem_options: number[];
    /** Drum kit pieces and lead/backing vocals are available (AI stem separation installed). */
    detail?: boolean;
    /** What the AI separators run on: "cuda", "mps", "cpu" or "none". */
    accelerator?: string;
  };
  stretch: { engine: string };
  pitch: { engine: string };
  denoise: { engines: string[] };
  beats: { engine: string };
  plugins: { available: boolean; formats: string[] };
  transcription?: { engine: string };
}

export interface PluginInfo {
  id: string;
  name: string;
  format: "vst3" | "au";
  parameters: { name: string; min: number; max: number; default: number }[];
  /** Known once the plugin has been loaded; null before that. */
  is_instrument?: boolean | null;
}

/** One sound from a plugin instrument's own library (Surge XT's patches). */
export interface PluginSound {
  id: string;
  name: string;
  category: string;
  library: string;
}

/** A free instrument plugin the editor can download and install in one click. */
export interface InstrumentOffer {
  id: string;
  name: string;
  version: string;
  license: string;
  homepage: string;
  summary: string;
  supported: boolean;
  installed: boolean;
  download_bytes: number;
  running: boolean;
  percent: number;
  detail: string;
  error: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  state: ProjectState | null;
  assets: Asset[];
}

export type FadeCurve = "linear" | "equal" | "scurve";

/** Automation breakpoint: timeline seconds and a value (dB for volume, -1..1 for pan). */
export interface AutoPoint {
  t: number;
  v: number;
}

/**
 * Voice effects. "vocoder" imposes the voice on a synth carrier (the classic robot-singer
 * sound), "pitch" shifts it (chipmunk up, monster down), "robot" ring-modulates it, "synth"
 * replaces it with an oscillator that follows its pitch, and "distort" is a megaphone fuzz.
 */
export type VoiceMode = "vocoder" | "pitch" | "robot" | "synth" | "distort";

export interface VoiceFx {
  on: boolean;
  mode: VoiceMode;
  /** Pitch shift, or the carrier's transposition when it follows the voice. */
  semitones: number;
  mix: number;
  /** Vocoder and synth voice: follow the sung pitch, or hold one note. A held key on a MIDI keyboard overrides both. */
  carrier: "follow" | "note";
  /** MIDI note the carrier holds when `carrier` is "note". */
  note: number;
  wave: "saw" | "square";
  /** Robot ring-modulator frequency in Hz. */
  rate: number;
  drive: number;
}

export const VOICE_MODES: VoiceMode[] = ["vocoder", "pitch", "robot", "synth", "distort"];

export function defaultVoice(): VoiceFx {
  return { on: false, mode: "vocoder", semitones: 0, mix: 1, carrier: "follow", note: 48, wave: "saw", rate: 50, drive: 0.6 };
}

/** Starting points for the voice unit; each replaces every voice setting except on/off. */
export const VOICE_PRESETS: { id: string; label: string; voice: Omit<VoiceFx, "on"> }[] = [
  { id: "robot-singer", label: "Robot singer (vocoder)", voice: { ...defaultVoice(), mode: "vocoder", carrier: "follow", semitones: 0 } },
  { id: "deep-vocoder", label: "Deep vocoder, an octave down", voice: { ...defaultVoice(), mode: "vocoder", carrier: "follow", semitones: -12 } },
  { id: "monotone", label: "Monotone robot (one note)", voice: { ...defaultVoice(), mode: "vocoder", carrier: "note", note: 45 } },
  { id: "chipmunk", label: "Chipmunk (+12)", voice: { ...defaultVoice(), mode: "pitch", semitones: 12 } },
  { id: "helium", label: "Helium (+5)", voice: { ...defaultVoice(), mode: "pitch", semitones: 5 } },
  { id: "monster", label: "Monster (−7)", voice: { ...defaultVoice(), mode: "pitch", semitones: -7 } },
  { id: "harmony", label: "Octave harmony (50% mix)", voice: { ...defaultVoice(), mode: "pitch", semitones: 12, mix: 0.5 } },
  { id: "dalek", label: "Ring-mod robot", voice: { ...defaultVoice(), mode: "robot", rate: 40 } },
  { id: "metal", label: "Metallic robot", voice: { ...defaultVoice(), mode: "robot", rate: 160 } },
  { id: "synth-saw", label: "Synth voice (saw)", voice: { ...defaultVoice(), mode: "synth", wave: "saw" } },
  { id: "synth-square", label: "8-bit voice (square)", voice: { ...defaultVoice(), mode: "synth", wave: "square", mix: 0.85 } },
  { id: "megaphone", label: "Vox distortion (megaphone)", voice: { ...defaultVoice(), mode: "distort", drive: 0.6 } },
  { id: "radio", label: "Old radio (light)", voice: { ...defaultVoice(), mode: "distort", drive: 0.2 } }
];

export interface TrackFx {
  gate: { on: boolean; threshold: number; attack: number; hold: number; release: number };
  voice: VoiceFx;
  dist: { on: boolean; drive: number; mix: number };
  comp: { on: boolean; threshold: number; ratio: number; attack: number; release: number; makeup: number };
  delay: { on: boolean; time: number; feedback: number; mix: number };
  reverb: { on: boolean; size: number; mix: number };
}

export interface Track {
  id: string;
  name: string;
  color: string;
  /** Fader level; added to the volume automation when that has points. */
  volumeDb: number;
  pan: number;
  width: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  mute: boolean;
  solo: boolean;
  volumeAuto: AutoPoint[];
  panAuto: AutoPoint[];
  /** Effect-parameter lanes; values are absolute and replace the control while present. */
  auto: Partial<Record<FxLaneId, AutoPoint[]>>;
  eqLowFreq: number;
  eqMidFreq: number;
  eqMidQ: number;
  eqHighFreq: number;
  /** "master" or the id of a bus this track feeds instead of the master. */
  output: string;
  /** Post-fader send level in dB per bus id; a bus not listed receives nothing. */
  sends: Record<string, number>;
  /** Instrument that plays this track's MIDI clips. */
  synth: Synth;
  /** An in-browser plugin (Web Audio Module) inserted after the track's own effects. */
  wam?: { url: string; name: string; state?: unknown };
  /** An installed VST3 / AU instrument that renders this track's MIDI clips to audio. */
  pluginInstrument?: { id: string; name: string; state?: string; soundName?: string };
  fx: TrackFx;
}

export interface Bus {
  id: string;
  name: string;
  volumeDb: number;
  mute: boolean;
  fx: TrackFx;
}

/** A named stretch of the arrangement, such as a verse or chorus. */
export interface Region {
  id: string;
  start: number;
  end: number;
  name: string;
  color: string;
}

export interface Marker {
  id: string;
  time: number;
  name: string;
}

export type FxLaneId = "reverbMix" | "delayMix" | "delayFeedback" | "compThreshold" | "eqLow" | "eqMid" | "eqHigh";
export type LaneId = "volume" | "pan" | FxLaneId;
export type AutomationView = "off" | LaneId;

export const LANES: { id: LaneId; label: string }[] = [
  { id: "volume", label: "Volume" },
  { id: "pan", label: "Pan" },
  { id: "reverbMix", label: "Reverb mix" },
  { id: "delayMix", label: "Delay mix" },
  { id: "delayFeedback", label: "Delay feedback" },
  { id: "compThreshold", label: "Compressor threshold" },
  { id: "eqLow", label: "EQ low gain" },
  { id: "eqMid", label: "EQ mid gain" },
  { id: "eqHigh", label: "EQ high gain" }
];

export const AUTO_RANGE: Record<LaneId, { min: number; max: number }> = {
  volume: { min: -60, max: 6 },
  pan: { min: -1, max: 1 },
  reverbMix: { min: 0, max: 1 },
  delayMix: { min: 0, max: 1 },
  delayFeedback: { min: 0, max: 0.9 },
  compThreshold: { min: -60, max: 0 },
  eqLow: { min: -12, max: 12 },
  eqMid: { min: -12, max: 12 },
  eqHigh: { min: -12, max: 12 }
};

export function lanePoints(track: Track, lane: LaneId): AutoPoint[] {
  if (lane === "volume") return track.volumeAuto;
  if (lane === "pan") return track.panAuto;
  return track.auto[lane] ?? [];
}

export function withLane(track: Track, lane: LaneId, points: AutoPoint[]): Track {
  if (lane === "volume") return { ...track, volumeAuto: points };
  if (lane === "pan") return { ...track, panAuto: points };
  return { ...track, auto: { ...track.auto, [lane]: points } };
}

/** Where a lane rests when it has no points: the control's own setting. */
export function laneDefault(track: Track, lane: LaneId): number {
  if (lane === "reverbMix") return track.fx.reverb.mix;
  if (lane === "delayMix") return track.fx.delay.mix;
  if (lane === "compThreshold") return track.fx.comp.threshold;
  if (lane === "delayFeedback") return track.fx.delay.feedback;
  if (lane === "eqLow") return track.eqLow;
  if (lane === "eqMid") return track.eqMid;
  if (lane === "eqHigh") return track.eqHigh;
  return 0;
}

export function formatLaneValue(lane: LaneId, value: number): string {
  if (lane === "volume") return value <= -59.5 ? "-∞ dB" : `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
  if (lane === "compThreshold") return `${value.toFixed(1)} dB`;
  if (lane === "eqLow" || lane === "eqMid" || lane === "eqHigh") return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
  if (lane === "pan") {
    if (Math.abs(value) < 0.005) return "C";
    return `${Math.round(Math.abs(value) * 100)}${value < 0 ? "L" : "R"}`;
  }
  return `${Math.round(value * 100)}%`;
}

export function defaultFx(): TrackFx {
  return {
    gate: { on: false, threshold: -45, attack: 0.002, hold: 0.06, release: 0.15 },
    voice: defaultVoice(),
    dist: { on: false, drive: 0.4, mix: 1 },
    comp: { on: false, threshold: -18, ratio: 3, attack: 0.01, release: 0.2, makeup: 0 },
    delay: { on: false, time: 0.375, feedback: 0.35, mix: 0.25 },
    reverb: { on: false, size: 1.8, mix: 0.2 }
  };
}

/** A MIDI note: start and length in seconds on the clip's own timeline, pitch 0-127, velocity 0-1. */
export interface Note {
  t: number;
  d: number;
  p: number;
  v: number;
}

export interface Synth {
  /** "drums" plays the built-in drum kit instead of the pitched synth. */
  kind: "synth" | "drums";
  /** The sound: oscillators, filter, envelopes, LFOs and modulation (see lib/editor/synth). */
  patch: Patch;
}

export function defaultSynth(): Synth {
  return { kind: "synth", patch: initPatch() };
}

/** Accepts saved synths of either format; the first editor saved wave/attack/release/cutoff. */
export function normalizeSynth(raw: unknown): Synth {
  const saved = (raw ?? {}) as Record<string, unknown>;
  const kind = saved.kind === "drums" ? "drums" : "synth";
  return { kind, patch: normalizePatch(saved.patch, saved.patch ? undefined : saved) };
}

export interface Clip {
  id: string;
  trackId: string;
  assetId: string;
  name: string;
  /** Timeline position in seconds. */
  start: number;
  /** Offset into the asset in seconds. */
  offset: number;
  duration: number;
  gainDb: number;
  fadeIn: number;
  fadeOut: number;
  fadeInCurve: FadeCurve;
  fadeOutCurve: FadeCurve;
  reversed: boolean;
  muted: boolean;
  /** Present on MIDI clips, which play the track's instrument instead of audio. */
  notes?: Note[];
  /** Clips recorded as alternative takes of the same passage share a group id. */
  takeGroup?: string;
  /** Pending warp markers in seconds from the clip start: the moment at `s` should land at `t`. */
  warp?: { s: number; t: number }[];
}

export interface AssetMeta {
  bpm: number | null;
  keyLabel: string | null;
  firstDownbeat: number | null;
  lufs: number | null;
}

export interface ProjectState {
  version: 1;
  bpm: number;
  beatsPerBar: number;
  /**
   * What one beat of the time signature is: 4 for a quarter note (4/4, 3/4), 8 for an
   * eighth (6/8, 12/8). Absent in older projects, which count quarters. The tempo is
   * always in quarter notes per minute.
   */
  beatUnit?: 4 | 8;
  keyLabel: string | null;
  masterDb: number;
  limiter: boolean;
  /** True-peak ceiling of the master limiter in dBTP. */
  limiterCeiling: number;
  autoCrossfade: boolean;
  automationView: AutomationView;
  snap: boolean;
  rulerMode: "time" | "bars";
  loop: { enabled: boolean; start: number; end: number };
  tracks: Track[];
  clips: Clip[];
  buses: Bus[];
  markers: Marker[];
  regions: Region[];
  assetMeta: Record<string, AssetMeta>;
}

export type Tool = "select" | "razor" | "range";

export interface TimeRange {
  start: number;
  end: number;
}

export const TRACK_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#fb923c",
  "#60a5fa",
  "#f87171"
] as const;

export const MIN_CLIP_SECONDS = 0.02;

export function emptyProjectState(): ProjectState {
  return {
    version: 1,
    bpm: 120,
    beatsPerBar: 4,
    keyLabel: null,
    masterDb: 0,
    limiter: true,
    limiterCeiling: -1,
    autoCrossfade: true,
    automationView: "off",
    snap: true,
    rulerMode: "time",
    loop: { enabled: false, start: 0, end: 0 },
    tracks: [],
    clips: [],
    buses: [],
    markers: [],
    regions: [],
    assetMeta: {}
  };
}

/** Fill in fields added after a session was saved, so older sessions keep loading. */
export function normalizeFx(saved: Partial<TrackFx> | undefined): TrackFx {
  const fx = defaultFx();
  return {
    gate: { ...fx.gate, ...saved?.gate },
    voice: { ...fx.voice, ...saved?.voice },
    dist: { ...fx.dist, ...saved?.dist },
    comp: { ...fx.comp, ...saved?.comp },
    delay: { ...fx.delay, ...saved?.delay },
    reverb: { ...fx.reverb, ...saved?.reverb }
  };
}

export const EQ_DEFAULTS = { eqLowFreq: 160, eqMidFreq: 1200, eqMidQ: 0.8, eqHighFreq: 6000 };

export function normalizeTrack(track: Track): Track {
  return {
    ...EQ_DEFAULTS,
    ...track,
    volumeAuto: Array.isArray(track.volumeAuto) ? track.volumeAuto : [],
    panAuto: Array.isArray(track.panAuto) ? track.panAuto : [],
    auto: track.auto ?? {},
    output: track.output ?? "master",
    sends: track.sends ?? {},
    synth: normalizeSynth(track.synth),
    fx: normalizeFx(track.fx)
  };
}

export function normalizeBus(bus: Bus): Bus {
  return { ...bus, fx: normalizeFx(bus.fx) };
}

export function normalizeClip(clip: Clip): Clip {
  return { ...clip, fadeInCurve: clip.fadeInCurve ?? "linear", fadeOutCurve: clip.fadeOutCurve ?? "linear" };
}

/** Fade gain (0..1) at progress x (0..1) through a fade-in; mirror x for a fade-out. */
export function fadeShape(curve: FadeCurve, x: number): number {
  const p = clamp(x, 0, 1);
  if (curve === "equal") return Math.sin((p * Math.PI) / 2);
  if (curve === "scurve") return (1 - Math.cos(p * Math.PI)) / 2;
  return p;
}

/** Value of an automation lane at a time; null when the lane has no points. */
export function evalAuto(points: AutoPoint[], time: number): number | null {
  if (!points.length) return null;
  if (time <= points[0].t) return points[0].v;
  const last = points[points.length - 1];
  if (time >= last.t) return last.v;
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (time <= b.t) {
      const a = points[i - 1];
      const span = b.t - a.t;
      return span <= 0 ? b.v : a.v + ((b.v - a.v) * (time - a.t)) / span;
    }
  }
  return last.v;
}

/**
 * Clips as they will sound: where two clips overlap on a track, the earlier one
 * fades out and the later one fades in across the overlap with equal-power curves.
 */
export function effectiveClips(state: ProjectState): Clip[] {
  if (!state.autoCrossfade) return state.clips;
  const byTrack = new Map<string, Clip[]>();
  for (const clip of state.clips) {
    if (clip.muted) continue;
    const list = byTrack.get(clip.trackId);
    if (list) list.push(clip);
    else byTrack.set(clip.trackId, [clip]);
  }
  const patched = new Map<string, Clip>();
  for (const list of byTrack.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      const a = patched.get(list[i - 1].id) ?? list[i - 1];
      const b = list[i];
      const aEnd = a.start + a.duration;
      const overlap = aEnd - b.start;
      // A clip sitting wholly inside another is a layer, not a transition.
      if (overlap <= 0.001 || aEnd >= b.start + b.duration) continue;
      const fade = Math.min(overlap, a.duration - a.fadeIn, b.duration - b.fadeOut);
      if (fade <= 0.001) continue;
      if (fade > a.fadeOut) patched.set(a.id, { ...a, fadeOut: fade, fadeOutCurve: "equal" });
      if (fade > b.fadeIn) patched.set(b.id, { ...b, fadeIn: fade, fadeInCurve: "equal" });
    }
  }
  if (!patched.size) return state.clips;
  return state.clips.map((clip) => patched.get(clip.id) ?? clip);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function dbToGain(db: number): number {
  return db <= -60 ? 0 : Math.pow(10, db / 20);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function projectDuration(state: ProjectState): number {
  let end = 0;
  for (const clip of state.clips) end = Math.max(end, clip.start + clip.duration);
  return end;
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}

/** Seconds one beat of the time signature lasts: a quarter note, or an eighth in x/8. */
export function beatSeconds(state: { bpm: number; beatUnit?: 4 | 8 }): number {
  return (60 / state.bpm) * (4 / (state.beatUnit ?? 4));
}

/** Seconds one bar lasts. */
export function barSeconds(state: { bpm: number; beatsPerBar: number; beatUnit?: 4 | 8 }): number {
  return beatSeconds(state) * state.beatsPerBar;
}

/** "6/8", "4/4"... */
export function timeSignature(state: { beatsPerBar: number; beatUnit?: 4 | 8 }): string {
  return `${state.beatsPerBar}/${state.beatUnit ?? 4}`;
}

export function formatBars(seconds: number, bpm: number, beatsPerBar: number, beatUnit: 4 | 8 = 4): string {
  const beats = ((Math.max(0, seconds) * bpm) / 60) * (beatUnit / 4);
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = Math.floor(beats % beatsPerBar) + 1;
  const tick = Math.floor((beats % 1) * 100);
  return `${bar}.${beat}.${tick.toString().padStart(2, "0")}`;
}
