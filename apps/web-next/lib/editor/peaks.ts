export interface PeakLevel {
  samplesPerBucket: number;
  min: Float32Array;
  max: Float32Array;
}

export interface Peaks {
  sampleRate: number;
  length: number;
  levels: PeakLevel[];
}

const BASE_BUCKET = 128;
const LEVEL_FACTOR = 4;
const LEVEL_COUNT = 5;

export function computePeaks(buffer: AudioBuffer): Peaks {
  const length = buffer.length;
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));

  const baseCount = Math.ceil(length / BASE_BUCKET);
  const min = new Float32Array(baseCount);
  const max = new Float32Array(baseCount);
  for (let b = 0; b < baseCount; b++) {
    const from = b * BASE_BUCKET;
    const to = Math.min(length, from + BASE_BUCKET);
    let lo = 1;
    let hi = -1;
    for (const data of channels) {
      for (let i = from; i < to; i++) {
        const v = data[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
  }

  return buildPeaks(min, max, buffer.sampleRate, length);
}

/** Build the zoom pyramid from one min/max pair per 128 frames. */
export function buildPeaks(min: Float32Array, max: Float32Array, sampleRate: number, length: number): Peaks {
  const levels: PeakLevel[] = [{ samplesPerBucket: BASE_BUCKET, min, max }];
  for (let l = 1; l < LEVEL_COUNT; l++) {
    const prev = levels[l - 1];
    const count = Math.ceil(prev.min.length / LEVEL_FACTOR);
    const lmin = new Float32Array(count);
    const lmax = new Float32Array(count);
    for (let b = 0; b < count; b++) {
      const from = b * LEVEL_FACTOR;
      const to = Math.min(prev.min.length, from + LEVEL_FACTOR);
      let lo = 1;
      let hi = -1;
      for (let i = from; i < to; i++) {
        if (prev.min[i] < lo) lo = prev.min[i];
        if (prev.max[i] > hi) hi = prev.max[i];
      }
      lmin[b] = lo;
      lmax[b] = hi;
    }
    levels.push({ samplesPerBucket: prev.samplesPerBucket * LEVEL_FACTOR, min: lmin, max: lmax });
  }
  return { sampleRate, length, levels };
}

/**
 * Fill a waveform path for asset time [t0, t1] across pixel columns [x0, x1).
 * `reversed` mirrors the asset window so the drawing matches reversed playback.
 */
export function traceWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: Peaks,
  buffer: AudioBuffer | undefined,
  x0: number,
  x1: number,
  t0: number,
  t1: number,
  yMid: number,
  halfHeight: number,
  gain: number,
  reversed: boolean
): void {
  const width = x1 - x0;
  if (width <= 0 || t1 <= t0) return;
  const sr = peaks.sampleRate;
  const samplesPerPixel = ((t1 - t0) * sr) / width;
  const tops = new Float32Array(width);
  const bottoms = new Float32Array(width);

  const raw = samplesPerPixel < BASE_BUCKET && buffer ? buffer.getChannelData(0) : null;
  const raw2 = raw && buffer && buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  let level = peaks.levels[0];
  for (const candidate of peaks.levels) {
    if (candidate.samplesPerBucket <= samplesPerPixel) level = candidate;
  }

  for (let px = 0; px < width; px++) {
    const col = reversed ? width - 1 - px : px;
    const s0 = (t0 + (col / width) * (t1 - t0)) * sr;
    const s1 = (t0 + ((col + 1) / width) * (t1 - t0)) * sr;
    let lo = 0;
    let hi = 0;
    if (raw) {
      const from = Math.max(0, Math.floor(s0));
      const to = Math.min(raw.length, Math.max(from + 1, Math.ceil(s1)));
      lo = 1;
      hi = -1;
      for (let i = from; i < to; i++) {
        const a = raw[i];
        if (a < lo) lo = a;
        if (a > hi) hi = a;
        if (raw2) {
          const b = raw2[i];
          if (b < lo) lo = b;
          if (b > hi) hi = b;
        }
      }
      if (lo > hi) lo = hi = 0;
    } else {
      const from = Math.max(0, Math.floor(s0 / level.samplesPerBucket));
      const to = Math.min(level.min.length, Math.max(from + 1, Math.ceil(s1 / level.samplesPerBucket)));
      lo = 1;
      hi = -1;
      for (let i = from; i < to; i++) {
        if (level.min[i] < lo) lo = level.min[i];
        if (level.max[i] > hi) hi = level.max[i];
      }
      if (lo > hi) lo = hi = 0;
    }
    tops[px] = Math.max(-1, Math.min(1, hi * gain));
    bottoms[px] = Math.max(-1, Math.min(1, lo * gain));
  }

  ctx.beginPath();
  ctx.moveTo(x0, yMid - tops[0] * halfHeight);
  for (let px = 1; px < width; px++) ctx.lineTo(x0 + px, yMid - tops[px] * halfHeight);
  for (let px = width - 1; px >= 0; px--) {
    // Keep at least a hairline so silence still reads as a signal line.
    ctx.lineTo(x0 + px, yMid - bottoms[px] * halfHeight + 0.75);
  }
  ctx.closePath();
  ctx.fill();
}

/** Decode the server's waveform overview (see `peaks_file` in the backend). */
export function parsePeaks(data: ArrayBuffer): Peaks | null {
  if (data.byteLength < 16) return null;
  const header = new Uint32Array(data.slice(0, 16));
  const [magic, sampleRate, frames, buckets] = header;
  if (magic !== 0x4b50534d || data.byteLength < 16 + buckets * 2) return null;
  const raw = new Int8Array(data, 16, buckets * 2);
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    min[i] = raw[i] / 127;
    max[i] = raw[buckets + i] / 127;
  }
  return buildPeaks(min, max, sampleRate, frames);
}
