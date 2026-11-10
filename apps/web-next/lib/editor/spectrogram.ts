export const SPEC_MIN_HZ = 40;
export const SPEC_MAX_HZ = 20_000;
const FFT_SIZE = 2048;
const ROWS = 256;
const FLOOR_DB = -96;

export interface Spectrogram {
  canvas: HTMLCanvasElement;
  columns: number;
  rows: number;
}

/** Row 0 is the top of the picture (highest frequency); the scale is logarithmic. */
export function rowToHz(row: number, rows = ROWS): number {
  const f = 1 - row / (rows - 1);
  return SPEC_MIN_HZ * Math.pow(SPEC_MAX_HZ / SPEC_MIN_HZ, f);
}

export function hzToFraction(hz: number): number {
  const clamped = Math.min(SPEC_MAX_HZ, Math.max(SPEC_MIN_HZ, hz));
  return 1 - Math.log(clamped / SPEC_MIN_HZ) / Math.log(SPEC_MAX_HZ / SPEC_MIN_HZ);
}

export function fractionToHz(fraction: number): number {
  return SPEC_MIN_HZ * Math.pow(SPEC_MAX_HZ / SPEC_MIN_HZ, 1 - Math.min(1, Math.max(0, fraction)));
}

function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = Math.cos(step * k);
        const wi = Math.sin(step * k);
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** Dark blue through magenta to pale yellow: brightness rises with level throughout. */
function colour(level: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [4, 6, 20],
    [38, 18, 96],
    [140, 30, 120],
    [232, 84, 70],
    [252, 190, 70],
    [255, 250, 200]
  ];
  const scaled = Math.min(0.9999, Math.max(0, level)) * (stops.length - 1);
  const index = Math.floor(scaled);
  const f = scaled - index;
  const a = stops[index];
  const b = stops[index + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Spectrogram of buffer seconds [t0, t1] (channels averaged), `columns` wide. */
export function computeSpectrogram(buffer: AudioBuffer, t0: number, t1: number, columns: number): Spectrogram {
  const sr = buffer.sampleRate;
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  // Which FFT bins each picture row averages over.
  const binHz = sr / FFT_SIZE;
  const rowBins: [number, number][] = [];
  for (let row = 0; row < ROWS; row++) {
    const high = rowToHz(row - 0.5);
    const low = rowToHz(row + 0.5);
    const from = Math.max(1, Math.floor(low / binHz));
    rowBins.push([from, Math.min(FFT_SIZE / 2, Math.max(from + 1, Math.ceil(high / binHz)))]);
  }

  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = ROWS;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(columns, ROWS);
  const scale = 2 / (FFT_SIZE * 0.5 * channels.length);
  for (let col = 0; col < columns; col++) {
    const centre = Math.round((t0 + ((col + 0.5) / columns) * (t1 - t0)) * sr);
    const start = centre - FFT_SIZE / 2;
    for (let i = 0; i < FFT_SIZE; i++) {
      const index = start + i;
      let sample = 0;
      if (index >= 0 && index < buffer.length) for (const data of channels) sample += data[index];
      re[i] = sample * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let row = 0; row < ROWS; row++) {
      const [from, to] = rowBins[row];
      let peak = 0;
      for (let bin = from; bin < to; bin++) {
        const power = re[bin] * re[bin] + im[bin] * im[bin];
        if (power > peak) peak = power;
      }
      const db = 10 * Math.log10(peak * scale * scale + 1e-12);
      const [r, g, b] = colour((db - FLOOR_DB) / -FLOOR_DB);
      const offset = (row * columns + col) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, columns, rows: ROWS };
}
