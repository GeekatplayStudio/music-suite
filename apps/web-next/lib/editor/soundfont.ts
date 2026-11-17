/**
 * SoundFont 2 instruments: the recorded sound of a real instrument for every General MIDI
 * program, so a MIDI track can be a piano, a cello or a drum kit rather than a synth patch.
 *
 * A `.sf2` file the user chooses is parsed here into zones — a sample per range of notes and
 * velocities, with its tuning, loop points, volume envelope and pan — and played with plain
 * Web Audio nodes. The same code therefore plays live, previews notes and renders exports in
 * an OfflineAudioContext, exactly as the built-in synthesizer does.
 *
 * Only the generators that matter for playing a General MIDI bank are read: ranges, tuning,
 * loop, attenuation, pan, the volume envelope and the initial filter. Modulators, the
 * modulation envelope and the LFOs are ignored, so a font's expressive extras are not heard.
 */

import { clampProgram } from "@/lib/editor/gm";

/** SoundFont generator operators, by the names the specification gives them. */
const GEN = {
  startAddrsOffset: 0,
  endAddrsOffset: 1,
  startloopAddrsOffset: 2,
  endloopAddrsOffset: 3,
  startAddrsCoarseOffset: 4,
  initialFilterFc: 8,
  initialFilterQ: 9,
  pan: 17,
  delayVolEnv: 33,
  attackVolEnv: 34,
  holdVolEnv: 35,
  decayVolEnv: 36,
  sustainVolEnv: 37,
  releaseVolEnv: 38,
  instrument: 41,
  keyRange: 43,
  velRange: 44,
  startloopAddrsCoarseOffset: 45,
  initialAttenuation: 48,
  endAddrsCoarseOffset: 12,
  endloopAddrsCoarseOffset: 50,
  coarseTune: 51,
  fineTune: 52,
  sampleID: 53,
  sampleModes: 54,
  scaleTuning: 56,
  overridingRootKey: 58
} as const;

/** The bank General MIDI puts percussion kits in. */
const DRUM_BANK = 128;
const MAX_ZONES = 40_000;

interface Sample {
  name: string;
  /** 16-bit PCM, the sample's own frames only. */
  data: Int16Array;
  sampleRate: number;
  /** Loop points as frame offsets into `data`. */
  loopStart: number;
  loopEnd: number;
  rootKey: number;
  /** The sample's own tuning error in cents. */
  correction: number;
}

interface Zone {
  keyLo: number;
  keyHi: number;
  velLo: number;
  velHi: number;
  sample: Sample;
  rootKey: number;
  /** Semitones, including the sample's own correction. */
  tune: number;
  /** How far the played note moves the pitch, 1 for normal. */
  scale: number;
  loop: boolean;
  /** Output gain, 0..1, from the zone's attenuation. */
  gain: number;
  /** -1 left to 1 right. */
  pan: number;
  attack: number;
  hold: number;
  decay: number;
  /** Level held while the note is down, 0..1. */
  sustain: number;
  release: number;
  /** Lowpass cutoff in Hz, or null when the font leaves the filter open. */
  cutoff: number | null;
  resonance: number;
}

export interface SoundFont {
  name: string;
  /** Zones by melodic program 0-127. */
  programs: Map<number, Zone[]>;
  /** Zones of the percussion kit, keyed by nothing: the note number picks the drum. */
  drums: Zone[];
  /** How many programs the file actually fills. */
  programCount: number;
}

/* ---------- Reading the file ---------- */

interface Chunks {
  [id: string]: { start: number; length: number } | undefined;
}

function readChunks(view: DataView, start: number, end: number): { chunks: Chunks; lists: Record<string, Chunks> } {
  const chunks: Chunks = {};
  const lists: Record<string, Chunks> = {};
  let pos = start;
  const id = (at: number) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  while (pos + 8 <= end) {
    const tag = id(pos);
    const length = view.getUint32(pos + 4, true);
    const body = pos + 8;
    const stop = Math.min(end, body + length);
    if (tag === "LIST") {
      const type = id(body);
      const inner = readChunks(view, body + 4, stop);
      lists[type] = inner.chunks;
    } else {
      chunks[tag] = { start: body, length: Math.max(0, stop - body) };
    }
    // RIFF chunks are padded to an even length.
    pos = body + length + (length % 2);
  }
  return { chunks, lists };
}

function readName(view: DataView, at: number, size = 20): string {
  let text = "";
  for (let i = 0; i < size; i++) {
    const byte = view.getUint8(at + i);
    if (!byte) break;
    text += String.fromCharCode(byte);
  }
  return text.trim();
}

/** The generators of one bag entry, as a map from operator to its raw amount. */
interface GenSet {
  values: Map<number, number>;
  ranges: Map<number, [number, number]>;
}

function readGenerators(view: DataView, start: number, from: number, to: number): GenSet {
  const values = new Map<number, number>();
  const ranges = new Map<number, [number, number]>();
  for (let i = from; i < to; i++) {
    const at = start + i * 4;
    const operator = view.getUint16(at, true);
    if (operator === GEN.keyRange || operator === GEN.velRange) {
      ranges.set(operator, [view.getUint8(at + 2), view.getUint8(at + 3)]);
    } else {
      values.set(operator, view.getInt16(at + 2, true));
    }
  }
  return { values, ranges };
}

const timecentsToSeconds = (timecents: number): number => Math.pow(2, timecents / 1200);
const centibelsToGain = (centibels: number): number => Math.pow(10, -centibels / 200);
const centsToHz = (cents: number): number => 8.176 * Math.pow(2, cents / 1200);

/** Read a `.sf2` file. Throws an `Error` with a message fit to show when it cannot be used. */
export function parseSoundFont(data: ArrayBuffer): SoundFont {
  const view = new DataView(data);
  if (data.byteLength < 12) throw new Error("This file is too small to be a SoundFont.");
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const form = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
  if (riff !== "RIFF" || form !== "sfbk") throw new Error("This is not a SoundFont (.sf2) file.");

  const { lists } = readChunks(view, 12, data.byteLength);
  const info = lists.INFO ?? {};
  const sdta = lists.sdta ?? {};
  const pdta = lists.pdta ?? {};
  const smpl = sdta.smpl;
  const required = ["phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr"] as const;
  for (const tag of required) {
    if (!pdta[tag]) throw new Error("This SoundFont is missing the data it needs to be played.");
  }
  if (!smpl || smpl.length < 2) throw new Error("This SoundFont holds no sound samples.");

  const name = info.INAM ? readName(view, info.INAM.start, Math.min(64, info.INAM.length)) : "SoundFont";
  // A typed array needs an even byte offset; RIFF padding normally gives one, but copy if not.
  const frames = Math.floor(smpl.length / 2);
  const pcm =
    smpl.start % 2 === 0
      ? new Int16Array(data, smpl.start, frames)
      : new Int16Array(data.slice(smpl.start, smpl.start + frames * 2));

  // Sample headers. The last record is the terminal "EOS" entry.
  const shdr = pdta.shdr!;
  const sampleCount = Math.max(0, Math.floor(shdr.length / 46) - 1);
  const samples: Sample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const at = shdr.start + i * 46;
    const begin = view.getUint32(at + 20, true);
    const finish = view.getUint32(at + 24, true);
    const loopStart = view.getUint32(at + 28, true);
    const loopEnd = view.getUint32(at + 32, true);
    const sampleRate = view.getUint32(at + 36, true);
    const type = view.getUint16(at + 44, true);
    // Bit 15 marks a ROM sample, whose data is not in the file.
    const usable = finish > begin && finish <= pcm.length && sampleRate > 0 && !(type & 0x8000);
    samples.push({
      name: readName(view, at),
      data: usable ? pcm.subarray(begin, finish) : new Int16Array(0),
      sampleRate: sampleRate || 44_100,
      loopStart: Math.max(0, Math.min(finish - begin, loopStart - begin)),
      loopEnd: Math.max(0, Math.min(finish - begin, loopEnd - begin)),
      rootKey: view.getUint8(at + 40),
      correction: view.getInt8(at + 41)
    });
  }

  const bagCount = (tag: "pbag" | "ibag") => Math.floor(pdta[tag]!.length / 4);
  const genIndex = (tag: "pbag" | "ibag", index: number) => view.getUint16(pdta[tag]!.start + index * 4, true);

  /** Build the zones of one instrument, applying its global zone as the defaults. */
  const instrumentZones = (instrument: number): { zone: Zone; keyRange?: [number, number]; velRange?: [number, number] }[] => {
    const inst = pdta.inst!;
    const count = Math.max(0, Math.floor(inst.length / 22) - 1);
    if (instrument < 0 || instrument >= count) return [];
    const bagFrom = view.getUint16(inst.start + instrument * 22 + 20, true);
    const bagTo = view.getUint16(inst.start + (instrument + 1) * 22 + 20, true);
    const bags = bagCount("ibag");
    const out: { zone: Zone; keyRange?: [number, number]; velRange?: [number, number] }[] = [];
    let global: GenSet | null = null;
    for (let bag = bagFrom; bag < Math.min(bagTo, bags); bag++) {
      const from = genIndex("ibag", bag);
      const to = bag + 1 < bags ? genIndex("ibag", bag + 1) : Math.floor(pdta.igen!.length / 4);
      const gens = readGenerators(view, pdta.igen!.start, from, to);
      if (!gens.values.has(GEN.sampleID)) {
        // A zone without a sample, before any that has one, sets this instrument's defaults.
        if (!out.length && !global) global = gens;
        continue;
      }
      const pick = (operator: number, fallback: number): number =>
        gens.values.get(operator) ?? global?.values.get(operator) ?? fallback;
      const sample = samples[gens.values.get(GEN.sampleID)!];
      if (!sample || !sample.data.length) continue;

      const coarse = pick(GEN.startAddrsCoarseOffset, 0) * 32_768 + pick(GEN.startAddrsOffset, 0);
      const loopStartShift = pick(GEN.startloopAddrsCoarseOffset, 0) * 32_768 + pick(GEN.startloopAddrsOffset, 0);
      const loopEndShift = pick(GEN.endloopAddrsCoarseOffset, 0) * 32_768 + pick(GEN.endloopAddrsOffset, 0);
      const endShift = pick(GEN.endAddrsCoarseOffset, 0) * 32_768 + pick(GEN.endAddrsOffset, 0);
      const begin = Math.max(0, Math.min(sample.data.length - 1, coarse));
      const finish = Math.max(begin + 1, Math.min(sample.data.length, sample.data.length + endShift));
      const shifted: Sample = {
        ...sample,
        data: coarse || endShift ? sample.data.subarray(begin, finish) : sample.data,
        loopStart: Math.max(0, sample.loopStart + loopStartShift - begin),
        loopEnd: Math.max(0, sample.loopEnd + loopEndShift - begin)
      };

      const rootKey = pick(GEN.overridingRootKey, -1);
      const cutoffCents = pick(GEN.initialFilterFc, 13_500);
      const mode = pick(GEN.sampleModes, 0);
      const sustainCb = pick(GEN.sustainVolEnv, 0);
      const zone: Zone = {
        keyLo: 0,
        keyHi: 127,
        velLo: 0,
        velHi: 127,
        sample: shifted,
        rootKey: rootKey >= 0 && rootKey <= 127 ? rootKey : shifted.rootKey,
        tune: pick(GEN.coarseTune, 0) + (pick(GEN.fineTune, 0) + shifted.correction) / 100,
        scale: pick(GEN.scaleTuning, 100) / 100,
        // Mode 1 loops while the note is held; mode 3 loops and then plays the tail.
        loop: (mode === 1 || mode === 3) && shifted.loopEnd > shifted.loopStart + 8,
        gain: centibelsToGain(Math.max(0, pick(GEN.initialAttenuation, 0))),
        pan: Math.max(-1, Math.min(1, pick(GEN.pan, 0) / 500)),
        attack: timecentsToSeconds(pick(GEN.attackVolEnv, -12_000)),
        hold: timecentsToSeconds(pick(GEN.holdVolEnv, -12_000)),
        decay: timecentsToSeconds(pick(GEN.decayVolEnv, -12_000)),
        sustain: sustainCb >= 1000 ? 0 : centibelsToGain(Math.max(0, sustainCb)),
        release: Math.max(0.01, timecentsToSeconds(pick(GEN.releaseVolEnv, -12_000))),
        cutoff: cutoffCents >= 13_500 ? null : Math.max(100, Math.min(20_000, centsToHz(cutoffCents))),
        resonance: Math.max(0, Math.min(24, pick(GEN.initialFilterQ, 0) / 10))
      };
      const keyRange = gens.ranges.get(GEN.keyRange) ?? global?.ranges.get(GEN.keyRange);
      const velRange = gens.ranges.get(GEN.velRange) ?? global?.ranges.get(GEN.velRange);
      if (keyRange) {
        zone.keyLo = keyRange[0];
        zone.keyHi = keyRange[1];
      }
      if (velRange) {
        zone.velLo = velRange[0];
        zone.velHi = velRange[1];
      }
      out.push({ zone, keyRange, velRange });
    }
    return out;
  };

  const programs = new Map<number, Zone[]>();
  const drums: Zone[] = [];
  let zoneTotal = 0;

  const phdr = pdta.phdr!;
  const presetCount = Math.max(0, Math.floor(phdr.length / 38) - 1);
  for (let i = 0; i < presetCount && zoneTotal < MAX_ZONES; i++) {
    const at = phdr.start + i * 38;
    const program = view.getUint16(at + 20, true);
    const bank = view.getUint16(at + 22, true);
    if (bank !== 0 && bank !== DRUM_BANK) continue;
    const bagFrom = view.getUint16(at + 24, true);
    const bagTo = view.getUint16(phdr.start + (i + 1) * 38 + 24, true);
    const bags = bagCount("pbag");
    const collected: Zone[] = [];
    let global: GenSet | null = null;
    for (let bag = bagFrom; bag < Math.min(bagTo, bags) && zoneTotal < MAX_ZONES; bag++) {
      const from = genIndex("pbag", bag);
      const to = bag + 1 < bags ? genIndex("pbag", bag + 1) : Math.floor(pdta.pgen!.length / 4);
      const gens = readGenerators(view, pdta.pgen!.start, from, to);
      if (!gens.values.has(GEN.instrument)) {
        if (!collected.length && !global) global = gens;
        continue;
      }
      const keyRange = gens.ranges.get(GEN.keyRange) ?? global?.ranges.get(GEN.keyRange);
      const velRange = gens.ranges.get(GEN.velRange) ?? global?.ranges.get(GEN.velRange);
      // A preset zone's generators shift the instrument's own values rather than replacing them.
      const shiftCb = (gens.values.get(GEN.initialAttenuation) ?? 0) + (global?.values.get(GEN.initialAttenuation) ?? 0);
      const shiftTune =
        (gens.values.get(GEN.coarseTune) ?? 0) +
        (global?.values.get(GEN.coarseTune) ?? 0) +
        ((gens.values.get(GEN.fineTune) ?? 0) + (global?.values.get(GEN.fineTune) ?? 0)) / 100;
      const shiftPan = ((gens.values.get(GEN.pan) ?? 0) + (global?.values.get(GEN.pan) ?? 0)) / 500;
      for (const { zone } of instrumentZones(gens.values.get(GEN.instrument)!)) {
        const keyLo = Math.max(zone.keyLo, keyRange?.[0] ?? 0);
        const keyHi = Math.min(zone.keyHi, keyRange?.[1] ?? 127);
        const velLo = Math.max(zone.velLo, velRange?.[0] ?? 0);
        const velHi = Math.min(zone.velHi, velRange?.[1] ?? 127);
        if (keyLo > keyHi || velLo > velHi) continue;
        collected.push({
          ...zone,
          keyLo,
          keyHi,
          velLo,
          velHi,
          tune: zone.tune + shiftTune,
          gain: zone.gain * centibelsToGain(Math.max(0, shiftCb)),
          pan: Math.max(-1, Math.min(1, zone.pan + shiftPan))
        });
        zoneTotal++;
      }
    }
    if (!collected.length) continue;
    if (bank === DRUM_BANK) drums.push(...collected);
    else if (!programs.has(program)) programs.set(program, collected);
  }

  if (!programs.size && !drums.length) throw new Error("This SoundFont has no General MIDI instruments in it.");
  return { name: name || "SoundFont", programs, drums, programCount: programs.size };
}

/* ---------- Playing ---------- */

/** AudioBuffers are built per context and per sample, the first time that sample sounds. */
const buffers = new WeakMap<BaseAudioContext, Map<Sample, AudioBuffer>>();

function bufferFor(ctx: BaseAudioContext, sample: Sample): AudioBuffer {
  let perContext = buffers.get(ctx);
  if (!perContext) {
    perContext = new Map();
    buffers.set(ctx, perContext);
  }
  const found = perContext.get(sample);
  if (found) return found;
  // The buffer keeps the sample's own rate; Web Audio resamples it to the context's.
  const buffer = ctx.createBuffer(1, sample.data.length, sample.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < sample.data.length; i++) channel[i] = sample.data[i] / 32_768;
  perContext.set(sample, buffer);
  return buffer;
}

function pickZone(zones: Zone[], pitch: number, velocity: number): Zone | null {
  let fallback: Zone | null = null;
  for (const zone of zones) {
    if (pitch < zone.keyLo || pitch > zone.keyHi) continue;
    if (velocity >= zone.velLo && velocity <= zone.velHi) return zone;
    // The right note but the wrong layer still beats silence.
    if (!fallback) fallback = zone;
  }
  return fallback;
}

/** A sounding sampled note, released the same way a synth voice is. */
export interface SampledVoice {
  /** Start the release at a time; returns when the note is silent. */
  release: (at: number) => number;
  /** Retune the note (pitch-bend) in cents, from a time. */
  bend: (cents: number, at: number) => void;
  sources: AudioScheduledSourceNode[];
}

export interface Instrument {
  /** General MIDI program 0-127; ignored when `drums` is set. */
  program: number;
  /** Play the percussion kit, where the note number picks the drum. */
  drums: boolean;
}

/** True when the font can play this instrument at all. */
export function soundFontHas(font: SoundFont, instrument: Instrument): boolean {
  const zones = instrument.drums ? font.drums : font.programs.get(clampProgram(instrument.program));
  return !!zones?.length;
}

/**
 * Start one note from a SoundFont. Returns null when the font has nothing for this
 * instrument and note, so the caller can fall back to the built-in synthesizer.
 */
export function startSampled(
  ctx: BaseAudioContext,
  font: SoundFont,
  output: AudioNode,
  instrument: Instrument,
  pitch: number,
  level: number,
  when: number,
  velocity: number,
  bendCents = 0
): SampledVoice | null {
  const zones = instrument.drums ? font.drums : font.programs.get(clampProgram(instrument.program));
  if (!zones?.length) return null;
  const note = Math.min(127, Math.max(0, Math.round(pitch)));
  const velocityByte = Math.min(127, Math.max(1, Math.round(velocity * 127)));
  const zone = pickZone(zones, note, velocityByte);
  if (!zone) return null;

  const source = ctx.createBufferSource();
  const buffer = bufferFor(ctx, zone.sample);
  source.buffer = buffer;
  const semitones = (note - zone.rootKey) * zone.scale + zone.tune;
  source.playbackRate.value = Math.pow(2, semitones / 12);
  if (bendCents) source.detune.value = bendCents;
  if (zone.loop) {
    source.loop = true;
    source.loopStart = zone.sample.loopStart / zone.sample.sampleRate;
    source.loopEnd = zone.sample.loopEnd / zone.sample.sampleRate;
  }

  const envelope = ctx.createGain();
  // Velocity acts on loudness as it does in the built-in synth, as a square-law curve.
  const peak = level * zone.gain * (0.3 + 0.7 * (velocityByte / 127) ** 2);
  const start = Math.max(when, 0);
  const attack = Math.max(0.001, zone.attack);
  const holdUntil = start + attack + zone.hold;
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(peak, start + attack);
  if (zone.hold > 0.001) envelope.gain.setValueAtTime(peak, holdUntil);
  if (zone.sustain < 0.999) {
    envelope.gain.setTargetAtTime(peak * zone.sustain, holdUntil, Math.max(0.005, zone.decay / 4));
  }

  let tail: AudioNode = source;
  if (zone.cutoff !== null) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = zone.cutoff;
    filter.Q.value = zone.resonance;
    tail = tail.connect(filter);
  }
  tail = tail.connect(envelope);
  if (Math.abs(zone.pan) > 0.01) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = zone.pan;
    tail = tail.connect(panner);
  }
  tail.connect(output);

  // A sample that does not loop runs out on its own; one that loops plays until released.
  const natural = start + buffer.duration / source.playbackRate.value;
  source.start(start);
  if (!zone.loop) source.stop(natural + 0.05);

  return {
    sources: [source],
    bend: (cents: number, at: number) => source.detune.setTargetAtTime(cents, at, 0.005),
    release: (at: number) => {
      const off = Math.max(start + 0.005, at);
      const silent = off + zone.release * 3 + 0.05;
      envelope.gain.cancelScheduledValues(off);
      envelope.gain.setTargetAtTime(0, off, Math.max(0.005, zone.release / 4));
      source.stop(zone.loop ? silent : Math.min(silent, natural + 0.05));
      return silent;
    }
  };
}

/**
 * Play one note from a SoundFont with a known end. Returns false when the font has nothing
 * for this instrument and note, so the caller can fall back to the built-in synthesizer.
 */
export function playSampled(
  ctx: BaseAudioContext,
  font: SoundFont,
  output: AudioNode,
  instrument: Instrument,
  pitch: number,
  level: number,
  when: number,
  until: number,
  velocity: number,
  sources: AudioScheduledSourceNode[]
): boolean {
  const voice = startSampled(ctx, font, output, instrument, pitch, level, when, velocity);
  if (!voice) return false;
  voice.release(Math.max(when + 0.005, until));
  sources.push(...voice.sources);
  return true;
}

/* ---------- The font this editor is using ---------- */

let loaded: SoundFont | null = null;
const watchers = new Set<() => void>();

export function currentSoundFont(): SoundFont | null {
  return loaded;
}

export function setSoundFont(font: SoundFont | null): void {
  loaded = font;
  watchers.forEach((watcher) => watcher());
}

/** Subscribe to the font being loaded or cleared; returns an unsubscribe function. */
export function watchSoundFont(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}
