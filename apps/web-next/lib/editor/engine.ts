import {
  type AutoPoint,
  type Bus,
  type Clip,
  type FadeCurve,
  type FxLaneId,
  type ProjectState,
  type Synth,
  type TimeRange,
  type Track,
  type TrackFx,
  type VoiceFx,
  clamp,
  dbToGain,
  effectiveClips,
  evalAuto,
  fadeShape,
  projectDuration
} from "@/lib/editor/types";

import { type WamInstance, createWam } from "@/lib/editor/wam";

export const ENGINE_SAMPLE_RATE = 48_000;
const SMOOTHING = 0.015;
const CURVE_POINTS = 33;
const AUTOMATION_STEP = 0.05;

// Bump the version when the processors change so browsers do not reuse a cached copy.
const WORKLET_URL = "/editor-worklets.js?v=6";

interface FxNodes {
  gate: AudioWorkletNode | null;
  voice: AudioWorkletNode | null;
  shaper: WaveShaperNode | null;
  shaperDrive: number;
  distWet: GainNode | null;
  distDry: GainNode | null;
  comp: DynamicsCompressorNode | null;
  makeup: GainNode | null;
  delay: DelayNode | null;
  delayFeedback: GainNode | null;
  delayWet: GainNode | null;
  reverbWet: GainNode | null;
}

interface TrackNodes extends FxNodes {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  direct: [GainNode, GainNode];
  cross: [GainNode, GainNode];
  panner: StereoPannerNode;
  fader: GainNode;
  mute: GainNode;
  sends: Map<string, GainNode>;
  /** Where an in-browser plugin is patched in; joined directly when there is none. */
  insertIn: GainNode;
  insertOut: GainNode;
  analyser: AnalyserNode | null;
}

interface BusNodes extends FxNodes {
  input: GainNode;
  fader: GainNode;
  analyser: AnalyserNode | null;
}

interface MasterMeters {
  left: AnalyserNode;
  right: AnalyserNode;
  loudness: AudioWorkletNode | null;
}

interface Mixer {
  signature: string;
  tracks: Map<string, TrackNodes>;
  buses: Map<string, BusNodes>;
  master: GainNode;
  limiter: [AudioWorkletNode, AudioWorkletNode] | null;
  meters: MasterMeters | null;
}

export interface Loudness {
  momentary: number | null;
  shortTerm: number | null;
  integrated: number | null;
  truePeakDb: number | null;
}

export interface MasterStats extends Loudness {
  /** Stereo correlation, -1 (out of phase) to +1 (mono). Null when silent. */
  correlation: number | null;
}

const NO_LOUDNESS: Loudness = { momentary: null, shortTerm: null, integrated: null, truePeakDb: null };

type BufferLookup = (assetId: string, reversed: boolean) => AudioBuffer | undefined;

function fxSignature(fx: TrackFx): string {
  const wetOnly = (!fx.delay.on || fx.delay.mix >= 1) && (!fx.reverb.on || fx.reverb.mix >= 1);
  return `${+fx.gate.on}${+fx.voice.on}${+fx.dist.on}${+fx.comp.on}${+fx.delay.on}${+fx.reverb.on}${+wetOnly}${fx.reverb.on ? fx.reverb.size : ""}`;
}

/** Anything that changes which nodes exist or how they are wired, as opposed to their settings. */
function mixerSignature(state: ProjectState, worklets: boolean, onlyTrackId?: string): string {
  const busIds = new Set(state.buses.map((b) => b.id));
  const tracks = state.tracks
    .filter((t) => !onlyTrackId || t.id === onlyTrackId)
    .map((t) => {
      const sends = Object.keys(t.sends).filter((id) => busIds.has(id)).sort().join(",");
      return `${t.id}:${fxSignature(t.fx)}>${busIds.has(t.output) ? t.output : "m"}[${sends}]`;
    });
  const buses = onlyTrackId ? [] : state.buses.map((b) => `${b.id}:${fxSignature(b.fx)}`);
  return `${state.limiter ? "L" : "-"}${worklets ? "w" : "-"}|${buses.join("|")}|${tracks.join("|")}`;
}

function fxTail(fx: TrackFx): number {
  let tail = 0;
  if (fx.reverb.on) tail = Math.max(tail, fx.reverb.size);
  if (fx.delay.on) tail = Math.max(tail, Math.min(6, fx.delay.time * 8));
  return tail;
}

function tailSeconds(state: ProjectState): number {
  let tail = 0;
  for (const track of state.tracks) tail = Math.max(tail, fxTail(track.fx));
  for (const bus of state.buses) tail = Math.max(tail, fxTail(bus.fx));
  return tail;
}

function setParam(param: AudioParam | undefined, value: number, time: number, immediate: boolean): void {
  if (!param) return;
  if (immediate) param.setValueAtTime(value, time);
  else param.setTargetAtTime(value, time, SMOOTHING);
}

const impulseCache = new Map<string, AudioBuffer>();

/** Decaying stereo noise: a neutral algorithmic room without shipping impulse files. */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds.toFixed(2)}`;
  const cached = impulseCache.get(key);
  if (cached) return cached;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, frames, ctx.sampleRate);
  // A fixed seed keeps the room identical between playback and export.
  let seed = 0x2f6e2b1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x80000000 - 1;
  };
  let energy = 0;
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      const t = i / frames;
      data[i] = random() * Math.pow(1 - t, 2.6) * (i < 64 ? i / 64 : 1);
      energy += data[i] * data[i];
    }
  }
  // Normalise energy so longer rooms are not simply louder.
  const scale = 1 / Math.sqrt(Math.max(1e-9, energy / 2));
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < frames; i++) data[i] *= scale;
  }
  impulseCache.set(key, buffer);
  return buffer;
}

function workletNode(ctx: BaseAudioContext, name: string): AudioWorkletNode {
  return new AudioWorkletNode(ctx, name, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers"
  });
}

/** Soft-clip transfer curve, level-compensated so more drive is not simply louder. */
function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const points = 2049;
  const amount = 1 + drive * 39;
  const curve = new Float32Array(points);
  const norm = Math.tanh(amount);
  const trim = 1 / Math.pow(amount, 0.6);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = (Math.tanh(amount * x) / norm) * trim;
  }
  return curve;
}

const VOICE_MODE_INDEX: Record<VoiceFx["mode"], number> = { vocoder: 0, pitch: 1, robot: 2, synth: 3, distort: 4 };

/** Gate, voice, distortion, compressor, then delay and reverb in parallel with the dry signal. */
function buildFx(ctx: BaseAudioContext, fx: TrackFx, source: AudioNode, worklets: boolean): { tail: AudioNode; nodes: FxNodes } {
  const nodes: FxNodes = {
    gate: null,
    voice: null,
    shaper: null,
    shaperDrive: -1,
    distWet: null,
    distDry: null,
    comp: null,
    makeup: null,
    delay: null,
    delayFeedback: null,
    delayWet: null,
    reverbWet: null
  };
  let tail = source;
  if (fx.gate.on && worklets) {
    nodes.gate = workletNode(ctx, "ms-gate");
    tail.connect(nodes.gate);
    tail = nodes.gate;
  }
  if (fx.voice.on && worklets) {
    nodes.voice = workletNode(ctx, "ms-voice");
    tail.connect(nodes.voice);
    tail = nodes.voice;
  }
  if (fx.dist.on) {
    nodes.shaper = ctx.createWaveShaper();
    // Oversampling keeps the new harmonics from folding back as aliasing.
    nodes.shaper.oversample = "4x";
    nodes.distWet = ctx.createGain();
    nodes.distDry = ctx.createGain();
    const sum = ctx.createGain();
    tail.connect(nodes.shaper).connect(nodes.distWet).connect(sum);
    tail.connect(nodes.distDry).connect(sum);
    tail = sum;
  }
  if (fx.comp.on) {
    nodes.comp = ctx.createDynamicsCompressor();
    nodes.comp.knee.value = 6;
    nodes.makeup = ctx.createGain();
    tail.connect(nodes.comp).connect(nodes.makeup);
    tail = nodes.makeup;
  }
  if (fx.delay.on || fx.reverb.on) {
    const sum = ctx.createGain();
    const dry = ctx.createGain();
    // A fully wet effect (a return bus) passes no dry signal.
    const wetOnly = (!fx.delay.on || fx.delay.mix >= 1) && (!fx.reverb.on || fx.reverb.mix >= 1);
    dry.gain.value = wetOnly ? 0 : 1;
    tail.connect(dry).connect(sum);
    if (fx.delay.on) {
      nodes.delay = ctx.createDelay(2);
      nodes.delayFeedback = ctx.createGain();
      nodes.delayWet = ctx.createGain();
      tail.connect(nodes.delay);
      nodes.delay.connect(nodes.delayFeedback).connect(nodes.delay);
      nodes.delay.connect(nodes.delayWet).connect(sum);
    }
    if (fx.reverb.on) {
      const convolver = ctx.createConvolver();
      convolver.normalize = false;
      convolver.buffer = impulse(ctx, fx.reverb.size);
      nodes.reverbWet = ctx.createGain();
      tail.connect(convolver).connect(nodes.reverbWet).connect(sum);
    }
    tail = sum;
  }
  return { tail, nodes };
}

/** `automated` lists parameters a lane is driving, which must not be overwritten here. */
function applyFx(nodes: FxNodes, fx: TrackFx, automated: Set<FxLaneId>, time: number, immediate: boolean): void {
  if (nodes.gate) {
    const params = nodes.gate.parameters;
    setParam(params.get("threshold"), fx.gate.threshold, time, true);
    setParam(params.get("attack"), fx.gate.attack, time, true);
    setParam(params.get("hold"), fx.gate.hold, time, true);
    setParam(params.get("release"), fx.gate.release, time, true);
  }
  if (nodes.voice) {
    const params = nodes.voice.parameters;
    const voice = fx.voice;
    setParam(params.get("mode"), VOICE_MODE_INDEX[voice.mode] ?? 0, time, true);
    setParam(params.get("semitones"), voice.semitones, time, true);
    setParam(params.get("mix"), voice.mix, time, true);
    setParam(params.get("carrier"), voice.carrier === "note" ? 1 : 0, time, true);
    setParam(params.get("note"), voice.note, time, true);
    setParam(params.get("wave"), voice.wave === "square" ? 1 : 0, time, true);
    setParam(params.get("rate"), voice.rate, time, true);
    setParam(params.get("drive"), voice.drive, time, true);
  }
  if (nodes.shaper && nodes.distWet && nodes.distDry) {
    if (nodes.shaperDrive !== fx.dist.drive) {
      nodes.shaper.curve = saturationCurve(fx.dist.drive);
      nodes.shaperDrive = fx.dist.drive;
    }
    setParam(nodes.distWet.gain, fx.dist.mix, time, immediate);
    setParam(nodes.distDry.gain, 1 - fx.dist.mix, time, immediate);
  }
  if (nodes.comp && nodes.makeup) {
    if (!automated.has("compThreshold")) setParam(nodes.comp.threshold, fx.comp.threshold, time, immediate);
    setParam(nodes.comp.ratio, fx.comp.ratio, time, immediate);
    setParam(nodes.comp.attack, fx.comp.attack, time, immediate);
    setParam(nodes.comp.release, fx.comp.release, time, immediate);
    setParam(nodes.makeup.gain, dbToGain(fx.comp.makeup), time, immediate);
  }
  if (nodes.delay && nodes.delayFeedback && nodes.delayWet) {
    setParam(nodes.delay.delayTime, fx.delay.time, time, immediate);
    if (!automated.has("delayFeedback")) setParam(nodes.delayFeedback.gain, Math.min(0.92, fx.delay.feedback), time, immediate);
    if (!automated.has("delayMix")) setParam(nodes.delayWet.gain, fx.delay.mix, time, immediate);
  }
  if (nodes.reverbWet && !automated.has("reverbMix")) setParam(nodes.reverbWet.gain, fx.reverb.mix, time, immediate);
}

const NO_LANES = new Set<FxLaneId>();
const FX_LANES: FxLaneId[] = ["reverbMix", "delayMix", "delayFeedback", "compThreshold", "eqLow", "eqMid", "eqHigh"];

function automatedLanes(track: Track): Set<FxLaneId> {
  const lanes = new Set<FxLaneId>();
  for (const lane of FX_LANES) {
    if (track.auto[lane]?.length) lanes.add(lane);
  }
  return lanes;
}

function applyTrackSettings(nodes: TrackNodes, track: Track, busIds: Set<string>, time: number, immediate: boolean): void {
  const automated = automatedLanes(track);
  if (!automated.has("eqLow")) setParam(nodes.low.gain, track.eqLow, time, immediate);
  setParam(nodes.low.frequency, track.eqLowFreq, time, immediate);
  if (!automated.has("eqMid")) setParam(nodes.mid.gain, track.eqMid, time, immediate);
  setParam(nodes.mid.frequency, track.eqMidFreq, time, immediate);
  setParam(nodes.mid.Q, track.eqMidQ, time, immediate);
  if (!automated.has("eqHigh")) setParam(nodes.high.gain, track.eqHigh, time, immediate);
  setParam(nodes.high.frequency, track.eqHighFreq, time, immediate);
  applyFx(nodes, track.fx, automated, time, immediate);
  // Mid/side width: 0 = mono, 1 = unchanged, 2 = side doubled.
  const direct = (1 + track.width) / 2;
  const cross = (1 - track.width) / 2;
  for (const node of nodes.direct) setParam(node.gain, direct, time, immediate);
  for (const node of nodes.cross) setParam(node.gain, cross, time, immediate);
  for (const [busId, node] of nodes.sends) {
    const level = busIds.has(busId) ? track.sends[busId] : undefined;
    setParam(node.gain, level === undefined ? 0 : dbToGain(level), time, immediate);
  }
}

function applyBusSettings(nodes: BusNodes, bus: Bus, time: number, immediate: boolean): void {
  applyFx(nodes, bus.fx, NO_LANES, time, immediate);
  setParam(nodes.fader.gain, bus.mute ? 0 : dbToGain(bus.volumeDb), time, immediate);
}

function applyMute(nodes: TrackNodes, track: Track, anySolo: boolean, time: number, immediate: boolean): void {
  const audible = !track.mute && (!anySolo || track.solo);
  setParam(nodes.mute.gain, audible ? 1 : 0, time, immediate);
}

/** Write a lane onto a param from `position`, or hold `fallback` when it has no points. */
function scheduleLane(
  param: AudioParam | undefined,
  points: AutoPoint[] | undefined,
  transform: (value: number) => number,
  fallback: number,
  position: number,
  contextStart: number,
  immediate: boolean,
  hold: boolean
): void {
  if (!param) return;
  param.cancelScheduledValues(0);
  const startValue = points ? evalAuto(points, position) : null;
  if (startValue === null || !points) {
    setParam(param, fallback, contextStart, immediate);
    return;
  }
  if (hold) {
    // Parked: show the value under the playhead without letting ramps run.
    setParam(param, transform(startValue), contextStart, immediate);
    return;
  }
  param.setValueAtTime(transform(startValue), contextStart);
  let previous = { t: position, v: startValue };
  for (const point of points) {
    if (point.t <= position) continue;
    // dB is not linear in gain, so long ramps are split into short straight pieces.
    const steps = clamp(Math.ceil((point.t - previous.t) / AUTOMATION_STEP), 1, 64);
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const t = previous.t + (point.t - previous.t) * f;
      const v = previous.v + (point.v - previous.v) * f;
      param.linearRampToValueAtTime(transform(v), contextStart + (t - position));
    }
    previous = point;
  }
}

function scheduleTrackAutomation(
  nodes: TrackNodes,
  track: Track,
  position: number,
  contextStart: number,
  immediate: boolean,
  hold = false
): void {
  const run = (
    param: AudioParam | undefined,
    points: AutoPoint[] | undefined,
    transform: (value: number) => number,
    fallback: number
  ) => scheduleLane(param, points, transform, fallback, position, contextStart, immediate, hold);
  const same = (value: number) => value;
  run(nodes.fader.gain, track.volumeAuto, (db) => dbToGain(db + track.volumeDb), dbToGain(track.volumeDb));
  run(nodes.panner.pan, track.panAuto, (pan) => clamp(pan + track.pan, -1, 1), track.pan);
  run(nodes.reverbWet?.gain, track.auto.reverbMix, same, track.fx.reverb.mix);
  run(nodes.delayWet?.gain, track.auto.delayMix, same, track.fx.delay.mix);
  run(nodes.comp?.threshold, track.auto.compThreshold, same, track.fx.comp.threshold);
  run(nodes.delayFeedback?.gain, track.auto.delayFeedback, (v) => Math.min(0.92, v), Math.min(0.92, track.fx.delay.feedback));
  run(nodes.low.gain, track.auto.eqLow, same, track.eqLow);
  run(nodes.mid.gain, track.auto.eqMid, same, track.eqMid);
  run(nodes.high.gain, track.auto.eqHigh, same, track.eqHigh);
}

/** True when anything a lane is written from differs between two versions of a track. */
function lanesChanged(before: Track | undefined, track: Track): boolean {
  return (
    !before ||
    before.volumeAuto !== track.volumeAuto ||
    before.panAuto !== track.panAuto ||
    before.auto !== track.auto ||
    before.volumeDb !== track.volumeDb ||
    before.pan !== track.pan ||
    before.eqLow !== track.eqLow ||
    before.eqMid !== track.eqMid ||
    before.eqHigh !== track.eqHigh ||
    before.fx !== track.fx
  );
}

function buildMixer(
  ctx: BaseAudioContext,
  state: ProjectState,
  live: boolean,
  worklets: boolean,
  onlyTrackId?: string
): Mixer {
  const master = ctx.createGain();
  master.gain.value = dbToGain(state.masterDb);
  let output: AudioNode = master;
  let limiter: [AudioWorkletNode, AudioWorkletNode] | null = null;
  if (state.limiter && worklets) {
    // Two passes: heavy gain reduction reshapes the waveform enough to create small new
    // inter-sample peaks, which the second pass then only has to trim.
    limiter = [workletNode(ctx, "ms-true-peak-limiter"), workletNode(ctx, "ms-true-peak-limiter")];
    for (const stage of limiter) stage.parameters.get("ceiling")?.setValueAtTime(state.limiterCeiling, 0);
    master.connect(limiter[0]).connect(limiter[1]);
    output = limiter[1];
  } else if (state.limiter) {
    // Without the worklet, fall back to a fast compressor so loud mixes are still caught.
    const fallback = ctx.createDynamicsCompressor();
    fallback.threshold.value = state.limiterCeiling - 0.5;
    fallback.knee.value = 0;
    fallback.ratio.value = 20;
    fallback.attack.value = 0.002;
    fallback.release.value = 0.12;
    master.connect(fallback);
    output = fallback;
  }
  output.connect(ctx.destination);

  let meters: MasterMeters | null = null;
  if (live) {
    const split = ctx.createChannelSplitter(2);
    const left = ctx.createAnalyser();
    const right = ctx.createAnalyser();
    left.fftSize = right.fftSize = 2048;
    output.connect(split);
    split.connect(left, 0);
    split.connect(right, 1);
    let loudness: AudioWorkletNode | null = null;
    if (worklets) {
      loudness = workletNode(ctx, "ms-loudness-meter");
      // The meter emits silence; routing it onwards keeps the browser processing it.
      output.connect(loudness).connect(ctx.destination);
    }
    meters = { left, right, loudness };
  }

  const buses = new Map<string, BusNodes>();
  if (!onlyTrackId) {
    for (const bus of state.buses) {
      const input = ctx.createGain();
      input.channelCount = 2;
      input.channelCountMode = "explicit";
      const { tail, nodes: fx } = buildFx(ctx, bus.fx, input, worklets);
      const fader = ctx.createGain();
      tail.connect(fader).connect(master);
      let analyser: AnalyserNode | null = null;
      if (live) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        fader.connect(analyser);
      }
      const nodes: BusNodes = { ...fx, input, fader, analyser };
      applyBusSettings(nodes, bus, 0, true);
      buses.set(bus.id, nodes);
    }
  }
  const busIds = new Set(buses.keys());

  const anySolo = onlyTrackId ? false : state.tracks.some((t) => t.solo);
  const tracks = new Map<string, TrackNodes>();
  for (const track of state.tracks) {
    if (onlyTrackId && track.id !== onlyTrackId) continue;
    const input = ctx.createGain();
    input.channelCount = 2;
    input.channelCountMode = "explicit";
    input.channelInterpretation = "speakers";

    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    input.connect(low).connect(mid).connect(high);
    const { tail, nodes: fx } = buildFx(ctx, track.fx, high, worklets);

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const direct: [GainNode, GainNode] = [ctx.createGain(), ctx.createGain()];
    const cross: [GainNode, GainNode] = [ctx.createGain(), ctx.createGain()];
    const panner = ctx.createStereoPanner();
    const fader = ctx.createGain();
    const mute = ctx.createGain();

    const insertIn = ctx.createGain();
    const insertOut = ctx.createGain();
    tail.connect(insertIn).connect(insertOut).connect(splitter);
    splitter.connect(direct[0], 0).connect(merger, 0, 0);
    splitter.connect(direct[1], 1).connect(merger, 0, 1);
    splitter.connect(cross[0], 1).connect(merger, 0, 0);
    splitter.connect(cross[1], 0).connect(merger, 0, 1);
    merger.connect(panner).connect(fader).connect(mute);
    mute.connect(buses.get(track.output)?.input ?? master);

    const sends = new Map<string, GainNode>();
    for (const busId of Object.keys(track.sends)) {
      const bus = buses.get(busId);
      // A track cannot also send to the bus it already feeds.
      if (!bus || busId === track.output) continue;
      const send = ctx.createGain();
      mute.connect(send).connect(bus.input);
      sends.set(busId, send);
    }

    let analyser: AnalyserNode | null = null;
    if (live) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      mute.connect(analyser);
    }
    const nodes: TrackNodes = { ...fx, input, low, mid, high, direct, cross, panner, fader, mute, sends, insertIn, insertOut, analyser };
    applyTrackSettings(nodes, track, busIds, 0, true);
    applyMute(nodes, onlyTrackId ? { ...track, mute: false, solo: false } : track, anySolo, 0, true);
    tracks.set(track.id, nodes);
  }
  return { signature: mixerSignature(state, worklets, onlyTrackId), tracks, buses, master, limiter, meters };
}

function envelopeAt(clip: Clip, local: number): number {
  let shape = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) shape = fadeShape(clip.fadeInCurve, local / clip.fadeIn);
  const untilEnd = clip.duration - local;
  if (clip.fadeOut > 0 && untilEnd < clip.fadeOut) {
    shape = Math.min(shape, fadeShape(clip.fadeOutCurve, untilEnd / clip.fadeOut));
  }
  return dbToGain(clip.gainDb) * shape;
}

function fadeCurve(curve: FadeCurve, from: number, to: number, level: number): Float32Array {
  const values = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    values[i] = level * fadeShape(curve, from + ((to - from) * i) / (CURVE_POINTS - 1));
  }
  return values;
}

function scheduleClips(
  ctx: BaseAudioContext,
  state: ProjectState,
  mixer: Mixer,
  lookup: BufferLookup,
  fromPosition: number,
  contextStart: number
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const synths = new Map(state.tracks.map((track) => [track.id, track.synth]));
  for (const clip of effectiveClips(state)) {
    if (clip.muted) continue;
    if (clip.notes) {
      const input = mixer.tracks.get(clip.trackId)?.input;
      const synth = synths.get(clip.trackId);
      if (input && synth) scheduleNotes(ctx, clip, synth, input, fromPosition, contextStart, sources);
      continue;
    }
    const nodes = mixer.tracks.get(clip.trackId);
    const buffer = lookup(clip.assetId, clip.reversed);
    if (!nodes || !buffer) continue;
    if (clip.start + clip.duration <= fromPosition) continue;

    const local = Math.max(0, fromPosition - clip.start);
    const when = contextStart + Math.max(0, clip.start - fromPosition);
    const remaining = clip.duration - local;
    const regionStart = clip.reversed ? buffer.duration - (clip.offset + clip.duration) : clip.offset;
    const bufferOffset = Math.max(0, regionStart + local);
    if (bufferOffset >= buffer.duration || remaining <= 0) continue;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const level = dbToGain(clip.gainDb);
    const param = gain.gain;
    param.setValueAtTime(envelopeAt(clip, local), when);

    // Curves may not overlap, so the fade-in is kept clear of the fade-out.
    const fadeStart = clip.duration - clip.fadeOut;
    try {
      if (clip.fadeIn > 0 && local < clip.fadeIn) {
        // Stop a hair early so rounding can never make it touch the fade-out curve.
        const length = Math.min(clip.fadeIn, fadeStart) - local - 0.0005;
        if (length > 0.002) {
          const to = (local + length) / clip.fadeIn;
          param.setValueCurveAtTime(fadeCurve(clip.fadeInCurve, local / clip.fadeIn, to, level), when, length);
          param.setValueAtTime(envelopeAt(clip, local + length + 0.0005), when + length + 0.0005);
        }
      }
      if (clip.fadeOut > 0) {
        const begin = Math.max(local, fadeStart) + 0.001;
        const length = clip.duration - begin;
        if (length > 0.002) {
          const from = 1 - (begin - fadeStart) / clip.fadeOut;
          param.setValueCurveAtTime(fadeCurve(clip.fadeOutCurve, from, 0, level), when + begin - local, length);
        }
      }
    } catch {
      // A browser that rejects the curves still plays the clip at its set level.
    }
    source.connect(gain).connect(nodes.input);
    source.start(when, bufferOffset, remaining);
    sources.push(source);
  }
  return sources;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Seeded so a drum pattern exports the same every time.
    let seed = 0x9e3779b1;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = seed / 0x80000000 - 1;
    }
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** One hit of the built-in drum kit, synthesised from tones and filtered noise (General MIDI pitches). */
function playDrum(
  ctx: BaseAudioContext,
  output: AudioNode,
  pitch: number,
  level: number,
  when: number,
  sources: AudioScheduledSourceNode[]
): void {
  const tone = (from: number, to: number, sweep: number, decay: number, gain: number, type: OscillatorType = "sine") => {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, when);
    oscillator.frequency.exponentialRampToValueAtTime(to, when + sweep);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(level * gain, when);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    oscillator.connect(envelope).connect(output);
    oscillator.start(when);
    oscillator.stop(when + decay + 0.02);
    sources.push(oscillator);
  };
  const noise = (type: BiquadFilterType, frequency: number, decay: number, gain: number) => {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(level * gain, when);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    source.connect(filter).connect(envelope).connect(output);
    source.start(when, (pitch * 0.137) % 0.9);
    source.stop(when + decay + 0.02);
    sources.push(source);
  };
  if (pitch <= 36) tone(150, 45, 0.12, 0.4, 3.2);
  else if (pitch === 38 || pitch === 40 || pitch === 37) {
    tone(220, 170, 0.05, 0.12, 1.4, "triangle");
    noise("bandpass", 1900, 0.2, 2.2);
  } else if (pitch === 39) noise("bandpass", 1200, 0.14, 2.6);
  else if (pitch === 42 || pitch === 44) noise("highpass", 7500, 0.05, 1.3);
  else if (pitch === 46) noise("highpass", 7000, 0.32, 1.2);
  else if (pitch === 49 || pitch >= 51) noise("highpass", 5200, 0.9, 1.1);
  else {
    // Toms: higher notes are higher drums.
    const frequency = 90 + (pitch - 41) * 14;
    tone(frequency * 1.5, frequency, 0.08, 0.3, 2.4);
  }
}

interface VoiceGraph {
  envelope: GainNode;
  oscillators: OscillatorNode[];
  /** Each oscillator's own detune in cents, before any pitch bend. */
  detunes: number[];
}

/** Detuned oscillators through a low-pass filter into an envelope gain that starts silent. */
function voiceGraph(ctx: BaseAudioContext, synth: Synth, output: AudioNode, pitch: number, when: number, bendCents = 0): VoiceGraph {
  const frequency = 440 * Math.pow(2, (pitch - 69) / 12);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(ctx.sampleRate * 0.45, Math.max(60, synth.cutoff));
  filter.Q.value = 0.7;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, when);
  filter.connect(envelope).connect(output);
  const rich = synth.wave === "sawtooth" || synth.wave === "square";
  const detunes = rich ? [-6, 6] : [0];
  const oscillators = detunes.map((cents) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = synth.wave;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = cents + bendCents;
    oscillator.connect(filter);
    oscillator.start(when);
    return oscillator;
  });
  return { envelope, oscillators, detunes };
}

/** One synth voice: detuned oscillators through a low-pass filter and an attack/release envelope. */
function playVoice(
  ctx: BaseAudioContext,
  synth: Synth,
  output: AudioNode,
  pitch: number,
  level: number,
  when: number,
  until: number,
  sources: AudioScheduledSourceNode[]
): void {
  const { envelope, oscillators } = voiceGraph(ctx, synth, output, pitch, when);
  const attack = Math.max(0.002, Math.min(synth.attack, (until - when) * 0.9));
  envelope.gain.linearRampToValueAtTime(level, when + attack);
  envelope.gain.setValueAtTime(level, until);
  envelope.gain.setTargetAtTime(0, until, Math.max(0.005, synth.release / 4));
  for (const oscillator of oscillators) {
    oscillator.stop(until + synth.release * 1.5 + 0.05);
    sources.push(oscillator);
  }
}

/** A key held on a MIDI keyboard: a synth voice, or one note of a vocoder's carrier. */
interface LiveNote {
  trackId: string;
  graph: VoiceGraph | null;
  release: number;
  /** Released while the sustain pedal was down; ends when the pedal comes up. */
  sustained: boolean;
}

/** Voice modes whose carrier a MIDI keyboard plays instead of the track's synth. */
export function playsCarrier(track: Track): boolean {
  return track.fx.voice.on && (track.fx.voice.mode === "vocoder" || track.fx.voice.mode === "synth");
}

function scheduleNotes(
  ctx: BaseAudioContext,
  clip: Clip,
  synth: Synth,
  output: AudioNode,
  fromPosition: number,
  contextStart: number,
  sources: AudioScheduledSourceNode[]
): void {
  const gain = dbToGain(clip.gainDb);
  const clipEnd = clip.start + clip.duration;
  for (const note of clip.notes ?? []) {
    // Only notes that begin inside the clip's window sound; they are cut at its end.
    if (note.t < clip.offset - 1e-6 || note.t >= clip.offset + clip.duration) continue;
    const start = clip.start + note.t - clip.offset;
    const end = Math.min(clipEnd, start + note.d);
    if (end <= fromPosition + 0.005) continue;
    const when = contextStart + Math.max(0, start - fromPosition);
    const until = contextStart + (end - fromPosition);
    if (synth.kind === "drums") {
      // A drum hit is not resumed part-way through.
      if (start >= fromPosition - 0.005) playDrum(ctx, output, note.p, note.v * 0.22 * gain, when, sources);
      continue;
    }
    playVoice(ctx, synth, output, note.p, note.v * 0.22 * gain, when, until, sources);
  }
}

function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = Float32Array.from(buffer.getChannelData(c));
    data.reverse();
    out.copyToChannel(data, c);
  }
  return out;
}

export class EditorEngine {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private state: ProjectState;
  private buffers = new Map<string, AudioBuffer>();
  private reversed = new Map<string, AudioBuffer>();
  private startedAt = 0;
  private startPosition = 0;
  private parked = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scratch = new Float32Array(1024);
  private scratchLeft = new Float32Array(2048);
  private scratchRight = new Float32Array(2048);
  private spectrum: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private worklets = new WeakMap<BaseAudioContext, Promise<boolean>>();
  private workletsReady = false;
  private loudness: Loudness = NO_LOUDNESS;
  playing = false;
  private listeners = new Set<() => void>();

  constructor(state: ProjectState) {
    this.state = state;
  }

  /** Notifies on play, pause and seek. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: ENGINE_SAMPLE_RATE, latencyHint: "interactive" });
    }
    return this.ctx;
  }

  /** Load the custom processors once per context; resolves false if the browser cannot. */
  private loadWorklets(ctx: BaseAudioContext): Promise<boolean> {
    let pending = this.worklets.get(ctx);
    if (!pending) {
      pending = ctx.audioWorklet
        .addModule(WORKLET_URL)
        .then(() => true)
        .catch(() => false);
      this.worklets.set(ctx, pending);
    }
    return pending;
  }

  private build(ctx: AudioContext): Mixer {
    const mixer = buildMixer(ctx, this.state, true, this.workletsReady);
    const meter = mixer.meters?.loudness;
    if (meter) {
      meter.port.onmessage = (event: MessageEvent<Loudness>) => {
        this.loudness = event.data;
      };
    }
    this.attachInserts(mixer, this.wams);
    // Fresh voice processors know nothing of keys still held on the keyboard.
    for (const trackId of this.carrierKeys.keys()) this.postCarrier(trackId, mixer);
    return mixer;
  }

  /* ---------- In-browser plugins ---------- */

  private wams = new Map<string, { url: string; instance: WamInstance }>();
  private wamRequests = new Map<string, number>();
  /** Names of plugins the last export could not include. */
  renderWarnings: string[] = [];

  private attachInserts(mixer: Mixer, plugins: Map<string, { instance: WamInstance }>): void {
    for (const [trackId, nodes] of mixer.tracks) {
      const node = plugins.get(trackId)?.instance.audioNode;
      nodes.insertIn.disconnect();
      if (node) {
        node.disconnect();
        nodes.insertIn.connect(node);
        node.connect(nodes.insertOut);
      } else {
        nodes.insertIn.connect(nodes.insertOut);
      }
    }
  }

  /** Make a track's loaded plugin match the session. Rejects if the plugin cannot be loaded. */
  async syncWam(trackId: string, url: string | null, state?: unknown): Promise<void> {
    const current = this.wams.get(trackId);
    if ((current?.url ?? null) === url) return;
    const request = (this.wamRequests.get(trackId) ?? 0) + 1;
    this.wamRequests.set(trackId, request);
    if (current) {
      this.wams.delete(trackId);
      current.instance.audioNode.disconnect();
      current.instance.audioNode.destroy?.();
    }
    try {
      if (url) {
        const instance = await createWam(this.context(), url, state);
        // A newer change for this track may have arrived while the plugin was loading.
        if (this.wamRequests.get(trackId) !== request) {
          instance.audioNode.destroy?.();
          return;
        }
        this.wams.set(trackId, { url, instance });
      }
    } finally {
      if (this.mixer) this.attachInserts(this.mixer, this.wams);
    }
  }

  hasWam(trackId: string): boolean {
    return this.wams.has(trackId);
  }

  async wamGui(trackId: string): Promise<HTMLElement | null> {
    return (await this.wams.get(trackId)?.instance.createGui()) ?? null;
  }

  /** The plugin's current settings, so they can be saved with the session. */
  async wamState(trackId: string): Promise<unknown> {
    return (await this.wams.get(trackId)?.instance.audioNode.getState?.()) ?? null;
  }

  async decode(assetId: string, data: ArrayBuffer): Promise<AudioBuffer> {
    const buffer = await this.context().decodeAudioData(data);
    this.buffers.set(assetId, buffer);
    this.reversed.delete(assetId);
    if (this.playing) this.reschedule();
    return buffer;
  }

  buffer(assetId: string): AudioBuffer | undefined {
    return this.buffers.get(assetId);
  }

  private lookup: BufferLookup = (assetId, reversed) => {
    const buffer = this.buffers.get(assetId);
    if (!buffer || !reversed) return buffer;
    let flipped = this.reversed.get(assetId);
    if (!flipped) {
      flipped = reverseBuffer(this.context(), buffer);
      this.reversed.set(assetId, flipped);
    }
    return flipped;
  };

  position(): number {
    if (!this.playing || !this.ctx) return this.parked;
    return Math.max(0, this.startPosition + (this.ctx.currentTime - this.startedAt));
  }

  setState(next: ProjectState): void {
    const prev = this.state;
    this.state = next;
    if (!this.ctx || !this.mixer) return;
    if (this.mixer.signature !== mixerSignature(next, this.workletsReady)) {
      this.rebuild();
      return;
    }
    const mixer = this.mixer;
    const now = this.ctx.currentTime;
    const anySolo = next.tracks.some((t) => t.solo);
    const busIds = new Set(mixer.buses.keys());
    const position = this.position();
    next.tracks.forEach((track, index) => {
      const nodes = mixer.tracks.get(track.id);
      if (!nodes) return;
      applyTrackSettings(nodes, track, busIds, now, false);
      applyMute(nodes, track, anySolo, now, false);
      // Rewriting a lane cancels its ramps, so only do it when something feeding it changed.
      if (lanesChanged(prev.tracks[index], track)) {
        scheduleTrackAutomation(nodes, track, position, now, false, !this.playing);
      }
    });
    for (const bus of next.buses) {
      const nodes = mixer.buses.get(bus.id);
      if (nodes) applyBusSettings(nodes, bus, now, false);
    }
    setParam(mixer.master.gain, dbToGain(next.masterDb), now, false);
    for (const stage of mixer.limiter ?? []) setParam(stage.parameters.get("ceiling"), next.limiterCeiling, now, true);
    const clipsChanged = prev.clips !== next.clips || prev.autoCrossfade !== next.autoCrossfade;
    if (this.playing && clipsChanged) this.reschedule();
  }

  private rebuild(): void {
    const ctx = this.context();
    this.stopSources();
    this.mixer?.master.disconnect();
    this.mixer = this.build(ctx);
    if (this.playing) this.reschedule();
    else this.writeAutomation(this.parked, ctx.currentTime, true);
  }

  private writeAutomation(position: number, contextStart: number, hold = false): void {
    if (!this.mixer) return;
    for (const track of this.state.tracks) {
      const nodes = this.mixer.tracks.get(track.id);
      if (nodes) scheduleTrackAutomation(nodes, track, position, contextStart, true, hold);
    }
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    this.sources = [];
  }

  private reschedule(): void {
    if (!this.ctx || !this.mixer) return;
    const position = this.position();
    this.stopSources();
    // A short lead keeps every source start in the future so none are clipped.
    const lead = 0.03;
    this.startedAt = this.ctx.currentTime + lead;
    this.startPosition = position;
    this.recording?.anchors.push({ ctxTime: this.startedAt, position });
    this.writeAutomation(position, this.startedAt);
    this.sources = scheduleClips(this.ctx, this.state, this.mixer, this.lookup, position, this.startedAt);
  }

  async play(from?: number): Promise<void> {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume();
    this.workletsReady = await this.loadWorklets(ctx);
    if (!this.mixer || this.mixer.signature !== mixerSignature(this.state, this.workletsReady)) {
      this.mixer?.master.disconnect();
      this.mixer = this.build(ctx);
    }
    // Integrated loudness and the true-peak hold describe one playback pass.
    this.loudness = NO_LOUDNESS;
    this.mixer.meters?.loudness?.port.postMessage("reset");
    if (from !== undefined) this.parked = Math.max(0, from);
    const loop = this.state.loop;
    if (loop.enabled && loop.end > loop.start && this.parked >= loop.end) this.parked = loop.start;
    this.playing = true;
    this.startPosition = this.parked;
    this.startedAt = ctx.currentTime;
    this.reschedule();
    if (!this.timer) this.timer = setInterval(() => this.tick(), 20);
    this.notify();
  }

  pause(): void {
    if (!this.playing) return;
    this.parked = this.position();
    this.playing = false;
    this.stopSources();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.notify();
  }

  seek(position: number): void {
    const target = Math.max(0, position);
    if (this.playing && this.ctx) {
      this.startPosition = target;
      this.startedAt = this.ctx.currentTime;
      this.reschedule();
    } else {
      this.parked = target;
    }
    this.notify();
  }

  private tick(): void {
    if (!this.playing) return;
    const position = this.position();
    const loop = this.state.loop;
    if (loop.enabled && loop.end > loop.start && position >= loop.end) {
      this.seek(loop.start);
      return;
    }
    if (position > projectDuration(this.state) + tailSeconds(this.state) + 0.25) this.pause();
  }

  private peakOf(analyser: AnalyserNode | null | undefined): number {
    if (!analyser || !this.playing) return 0;
    analyser.getFloatTimeDomainData(this.scratch);
    let peak = 0;
    for (let i = 0; i < this.scratch.length; i++) {
      const v = Math.abs(this.scratch[i]);
      if (v > peak) peak = v;
    }
    return peak;
  }

  trackLevel(trackId: string): number {
    return this.peakOf(this.mixer?.tracks.get(trackId)?.analyser);
  }

  busLevel(busId: string): number {
    return this.peakOf(this.mixer?.buses.get(busId)?.analyser);
  }

  /** Post-fader spectrum of a track in dB per FFT bin (bin width = 48000 / 2048 Hz). Null when stopped. */
  trackSpectrum(trackId: string): Float32Array | null {
    const analyser = this.mixer?.tracks.get(trackId)?.analyser;
    if (!analyser || !this.playing) return null;
    if (this.spectrum.length !== analyser.frequencyBinCount) this.spectrum = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(this.spectrum);
    return this.spectrum;
  }

  /** Combined gain of a track's three EQ bands at the given frequencies, in dB. */
  eqResponse(trackId: string, freqs: Float32Array<ArrayBuffer>): Float32Array | null {
    const nodes = this.mixer?.tracks.get(trackId);
    if (!nodes) return null;
    const total = new Float32Array(freqs.length);
    const magnitude = new Float32Array(freqs.length);
    const phase = new Float32Array(freqs.length);
    for (const filter of [nodes.low, nodes.mid, nodes.high]) {
      filter.getFrequencyResponse(freqs, magnitude, phase);
      for (let i = 0; i < total.length; i++) total[i] += 20 * Math.log10(Math.max(1e-6, magnitude[i]));
    }
    return total;
  }

  masterLevel(): number {
    const meters = this.mixer?.meters;
    return Math.max(this.peakOf(meters?.left), this.peakOf(meters?.right));
  }

  /** Stereo correlation now, plus the loudness figures for this playback pass. */
  masterStats(): MasterStats {
    const scope = this.scope();
    if (!scope) return { correlation: null, ...this.loudness };
    let cross = 0;
    let powerLeft = 0;
    let powerRight = 0;
    for (let i = 0; i < scope.left.length; i++) {
      cross += scope.left[i] * scope.right[i];
      powerLeft += scope.left[i] * scope.left[i];
      powerRight += scope.right[i] * scope.right[i];
    }
    const denominator = Math.sqrt(powerLeft * powerRight);
    return { correlation: denominator > 1e-9 ? clamp(cross / denominator, -1, 1) : null, ...this.loudness };
  }

  /** The latest left and right master samples, for the phase scope. Null when stopped. */
  scope(): { left: Float32Array; right: Float32Array } | null {
    const meters = this.mixer?.meters;
    if (!meters || !this.playing) return null;
    meters.left.getFloatTimeDomainData(this.scratchLeft);
    meters.right.getFloatTimeDomainData(this.scratchRight);
    return { left: this.scratchLeft, right: this.scratchRight };
  }

  /** Sound one note now on a track's instrument, for feedback while editing notes. */
  previewNote(trackId: string, pitch: number): void {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume();
    if (!this.mixer) this.mixer = this.build(ctx);
    const input = this.mixer.tracks.get(trackId)?.input;
    const synth = this.state.tracks.find((track) => track.id === trackId)?.synth;
    if (!input || !synth) return;
    const voices: AudioScheduledSourceNode[] = [];
    if (synth.kind === "drums") playDrum(ctx, input, pitch, 0.18, ctx.currentTime + 0.005, voices);
    else playVoice(ctx, synth, input, pitch, 0.18, ctx.currentTime + 0.005, ctx.currentTime + 0.22, voices);
  }

  /* ---------- Live playing from a MIDI keyboard ---------- */

  private live = new Map<number, LiveNote>();
  private sustain = false;
  private bendCents = 0;
  /** Keys held per track whose vocoder or synth voice the keyboard is playing. */
  private carrierKeys = new Map<string, Set<number>>();

  /** Timeline position the listener is hearing now: what is scheduled, less the output latency. */
  heardPosition(): number {
    const ctx = this.ctx;
    if (!this.playing || !ctx) return this.parked;
    return Math.max(0, this.position() - (ctx.baseLatency || 0) - (ctx.outputLatency || 0));
  }

  private liveMixer(): { ctx: AudioContext; mixer: Mixer } {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume();
    if (!this.mixer) this.mixer = this.build(ctx);
    if (!this.workletsReady) {
      // Playing before the first Play press: load the processors so voice effects can join in.
      void this.loadWorklets(ctx).then((ok) => {
        if (!ok || this.workletsReady) return;
        this.workletsReady = true;
        this.rebuild();
      });
    }
    return { ctx, mixer: this.mixer };
  }

  private postCarrier(trackId: string, mixer = this.mixer): void {
    const node = mixer?.tracks.get(trackId)?.voice;
    const keys = this.carrierKeys.get(trackId);
    if (!node) return;
    const bend = this.bendCents / 100;
    node.port.postMessage({ keys: [...(keys ?? [])].map((pitch) => 440 * Math.pow(2, (pitch - 69 + bend) / 12)) });
  }

  /**
   * Start a held note on a track. When the track's voice effect is a vocoder or synth voice,
   * the key sets that effect's pitch instead. Returns false if the track cannot play it.
   */
  liveNoteOn(trackId: string, pitch: number, velocity: number): boolean {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) return false;
    const { ctx, mixer } = this.liveMixer();
    const nodes = mixer.tracks.get(trackId);
    if (!nodes) return false;
    this.endLive(pitch, ctx.currentTime);
    if (playsCarrier(track) && nodes.voice) {
      const keys = this.carrierKeys.get(trackId) ?? new Set<number>();
      keys.add(pitch);
      this.carrierKeys.set(trackId, keys);
      this.postCarrier(trackId);
      this.live.set(pitch, { trackId, graph: null, release: 0, sustained: false });
      return true;
    }
    const level = clamp(velocity, 0.05, 1) * 0.22;
    const when = ctx.currentTime + 0.003;
    if (track.synth.kind === "drums") {
      playDrum(ctx, nodes.input, pitch, level, when, []);
      return true;
    }
    const graph = voiceGraph(ctx, track.synth, nodes.input, pitch, when, this.bendCents);
    graph.envelope.gain.linearRampToValueAtTime(level, when + Math.max(0.002, track.synth.attack));
    this.live.set(pitch, { trackId, graph, release: track.synth.release, sustained: false });
    return true;
  }

  liveNoteOff(pitch: number): void {
    const note = this.live.get(pitch);
    if (!note) return;
    if (this.sustain) note.sustained = true;
    else this.endLive(pitch, this.ctx?.currentTime ?? 0);
  }

  /** Sustain pedal: while down, released keys keep sounding. */
  setSustain(down: boolean): void {
    this.sustain = down;
    if (down) return;
    const now = this.ctx?.currentTime ?? 0;
    for (const [pitch, note] of [...this.live]) if (note.sustained) this.endLive(pitch, now);
  }

  /** Pitch-bend every held note, in semitones. */
  pitchBend(semitones: number): void {
    this.bendCents = semitones * 100;
    const now = this.ctx?.currentTime ?? 0;
    for (const note of this.live.values()) {
      note.graph?.oscillators.forEach((oscillator, i) => {
        oscillator.detune.setTargetAtTime(note.graph!.detunes[i] + this.bendCents, now, 0.005);
      });
    }
    for (const trackId of this.carrierKeys.keys()) this.postCarrier(trackId);
  }

  /** Silence every held key, for example when the keyboard is unplugged. */
  allNotesOff(): void {
    this.sustain = false;
    const now = this.ctx?.currentTime ?? 0;
    for (const pitch of [...this.live.keys()]) this.endLive(pitch, now);
  }

  private endLive(pitch: number, now: number): void {
    const note = this.live.get(pitch);
    if (!note) return;
    this.live.delete(pitch);
    if (note.graph) {
      const gain = note.graph.envelope.gain;
      // Release from wherever the envelope is, even part-way through its attack.
      if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
      else {
        const value = gain.value;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(value, now);
      }
      gain.setTargetAtTime(0, now, Math.max(0.005, note.release / 4));
      for (const oscillator of note.graph.oscillators) oscillator.stop(now + note.release * 1.5 + 0.05);
      return;
    }
    const keys = this.carrierKeys.get(note.trackId);
    keys?.delete(pitch);
    if (keys && !keys.size) this.carrierKeys.delete(note.trackId);
    this.postCarrier(note.trackId);
  }

  /* ---------- Recording ---------- */

  private recording: {
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    node: AudioWorkletNode;
    chunks: Float32Array[][];
    firstFrame: number | null;
    /** Every (re)start of playback while recording: audio-clock time and timeline position. */
    anchors: { ctxTime: number; position: number }[];
    finished: (() => void) | null;
  } | null = null;

  isRecording(): boolean {
    return this.recording !== null;
  }

  /**
   * Record the default input, uncompressed, while the session plays from `from`.
   * Rejects if the browser refuses the microphone or lacks AudioWorklet.
   */
  async startRecording(from: number): Promise<void> {
    if (this.recording) return;
    const ctx = this.context();
    if (!(await this.loadWorklets(ctx))) throw new Error("This browser cannot record here (AudioWorklet is unavailable).");
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not allow audio input.");
    let stream: MediaStream;
    try {
      // Processing meant for calls damages music, so it is all switched off.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch {
      throw new Error("Microphone access was refused. Allow it for this page and try again.");
    }
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "ms-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const session: NonNullable<EditorEngine["recording"]> = {
      stream,
      source,
      node,
      chunks: [],
      firstFrame: null,
      anchors: [],
      finished: null
    };
    node.port.onmessage = (event: MessageEvent<{ done?: boolean; frame?: number; channels?: Float32Array[] }>) => {
      if (event.data.done) {
        session.finished?.();
        return;
      }
      if (!event.data.channels) return;
      if (session.firstFrame === null) session.firstFrame = event.data.frame ?? 0;
      session.chunks.push(event.data.channels);
    };
    this.recording = session;
    await this.play(from);
    // The recorder's silent output must reach the destination or it is never processed.
    source.connect(node).connect(ctx.destination);
  }

  /**
   * Stop recording. Returns the audio and where each stretch of it belongs on the
   * timeline: one segment normally, one per pass when the loop was running.
   */
  async stopRecording(): Promise<{
    buffer: AudioBuffer;
    segments: { offset: number; duration: number; position: number }[];
  } | null> {
    const session = this.recording;
    const ctx = this.ctx;
    if (!session || !ctx) return null;
    await new Promise<void>((resolve) => {
      session.finished = resolve;
      session.node.port.postMessage("flush");
      setTimeout(resolve, 400);
    });
    this.recording = null;
    session.source.disconnect();
    session.node.disconnect();
    session.node.port.onmessage = null;
    for (const track of session.stream.getTracks()) track.stop();
    this.pause();

    const sr = ctx.sampleRate;
    const channels = session.chunks[0]?.length ?? 0;
    const frames = session.chunks.reduce((total, chunk) => total + chunk[0].length, 0);
    if (!channels || frames < sr * 0.05 || session.firstFrame === null) return null;
    const buffer = ctx.createBuffer(channels, frames, sr);
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      let offset = 0;
      for (const chunk of session.chunks) {
        data.set(chunk[c] ?? chunk[0], offset);
        offset += chunk[0].length;
      }
    }

    // What the performer hears left the engine one output latency earlier.
    const latency = (ctx.baseLatency || 0) + (ctx.outputLatency || 0);
    const began = session.firstFrame / sr;
    const total = frames / sr;
    // An edit during recording restarts playback where it already was; only a jump is a new pass.
    const anchors = session.anchors.filter((anchor, index, all) => {
      if (index === 0) return true;
      const previous = all[index - 1];
      return Math.abs(anchor.position - (previous.position + anchor.ctxTime - previous.ctxTime)) > 0.06;
    });
    const segments: { offset: number; duration: number; position: number }[] = [];
    anchors.forEach((anchor, index) => {
      const from = Math.max(0, anchor.ctxTime + latency - began);
      const next = anchors[index + 1];
      const to = Math.min(total, next ? next.ctxTime + latency - began : total);
      if (to - from < 0.02) return;
      let position = anchor.position + (began + from - anchor.ctxTime) - latency;
      let offset = from;
      if (position < 0) {
        offset -= position;
        position = 0;
      }
      if (to - offset >= 0.02) segments.push({ offset, duration: to - offset, position });
    });
    return segments.length ? { buffer, segments } : null;
  }

  /** False when the browser could not load the gate, true-peak limiter and loudness meter. */
  hasProcessors(): boolean {
    return this.workletsReady;
  }

  /**
   * Render the mix with the same graph used for playback. Optionally one track on
   * its own, and optionally only a time range.
   */
  async render(options: { trackId?: string; range?: TimeRange | null } = {}): Promise<AudioBuffer> {
    const total = projectDuration(this.state);
    if (total <= 0) throw new Error("There is nothing on the timeline to export.");
    const range = options.range && options.range.end > options.range.start ? options.range : null;
    const start = range ? range.start : 0;
    const length = range ? range.end - range.start : total + tailSeconds(this.state);
    const frames = Math.max(1, Math.ceil(length * ENGINE_SAMPLE_RATE));
    const offline = new OfflineAudioContext(2, frames, ENGINE_SAMPLE_RATE);
    const mixer = buildMixer(offline, this.state, false, await this.loadWorklets(offline), options.trackId);
    // In-browser plugins are re-created on the export context with their current settings.
    this.renderWarnings = [];
    const offlinePlugins = new Map<string, { instance: WamInstance }>();
    for (const track of this.state.tracks) {
      if (!track.wam || !mixer.tracks.has(track.id)) continue;
      try {
        const settings = (await this.wamState(track.id)) ?? track.wam.state;
        offlinePlugins.set(track.id, { instance: await createWam(offline, track.wam.url, settings) });
      } catch {
        this.renderWarnings.push(track.wam.name);
      }
    }
    this.attachInserts(mixer, offlinePlugins);
    for (const track of this.state.tracks) {
      const nodes = mixer.tracks.get(track.id);
      if (nodes) scheduleTrackAutomation(nodes, track, start, 0, true);
    }
    scheduleClips(offline, this.state, mixer, this.lookup, start, 0);
    return offline.startRendering();
  }

  dispose(): void {
    this.pause();
    void this.ctx?.close();
    this.ctx = null;
    this.mixer = null;
  }
}
