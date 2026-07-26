function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

export function computeAtmosphereMix(fogFactor, depth) {
  const depthNorm = clamp((depth - 6) / 28, 0, 1);
  return clamp(fogFactor * 0.45 + depthNorm * 0.35, 0, 0.86);
}

export function computeMicroDolly(frame, nowSec) {
  if (!frame) {
    return { zoom: 0, pitch: 0, yaw: 0 };
  }

  const lowBand = Math.pow(clamp(1 - (frame.centroidN ?? 0), 0, 1), 1.2);
  const drive = clamp((frame.rmsN ?? 0) * 0.62 + (frame.fluxN ?? 0) * 0.38, 0, 1);
  const beat = lowBand * drive;

  return {
    zoom: Math.sin(nowSec * 8.5) * beat,
    pitch: Math.cos(nowSec * 6.2) * beat,
    yaw: Math.sin(nowSec * 4.8 + (frame.id ?? 0) * 0.01) * beat,
  };
}

export function computeAberrationStrength({ activity, flux, motion, cinemaEnabled }) {
  if (!cinemaEnabled) {
    return 0;
  }

  const level = clamp(activity * 0.65 + flux * 0.55 + motion * 0.08, 0, 1.8);
  if (level < 0.18) {
    return 0;
  }

  return clamp((level - 0.18) * 0.34, 0, 0.5);
}

export function buildLocalDensityMap(points, cellSize) {
  const size = Math.max(8, cellSize || 48);
  const cells = new Map();

  for (const point of points) {
    const cx = Math.floor(point.x / size);
    const cy = Math.floor(point.y / size);
    const key = `${cx}:${cy}`;
    cells.set(key, (cells.get(key) || 0) + 1);
  }

  const byIndex = new Map();
  for (const point of points) {
    const cx = Math.floor(point.x / size);
    const cy = Math.floor(point.y / size);
    let local = 0;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        local += cells.get(`${cx + dx}:${cy + dy}`) || 0;
      }
    }

    byIndex.set(point.index, local);
  }

  return byIndex;
}

export function computeLabelDensityScale(localDensity) {
  const t = clamp((localDensity - 1) / 20, 0, 1);
  return 1 - t * 0.7;
}

export const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Chroma is only collected between these bounds. Below CHROMA_LOW_HZ the energy
// is mostly kick and rumble with no stable pitch; above CHROMA_HIGH_HZ it is
// cymbals and air, which are noise rather than notes.
export const CHROMA_LOW_HZ = 90;
export const CHROMA_HIGH_HZ = 3200;

/**
 * Folds a magnitude spectrum onto twelve pitch classes, in place.
 *
 * Only local spectral peaks contribute, and each peak's true frequency is
 * recovered by parabolic interpolation across its two neighbours. That matters
 * more than it sounds: a 1024-point FFT at 44.1 kHz has 43 Hz bins, so around a
 * 220 Hz fundamental consecutive bin centres are three to six semitones apart.
 * Binning raw bin centres therefore makes some pitch classes unreachable and
 * double-counts others, so the chroma ends up describing the FFT grid instead
 * of the music and names the same wrong key whatever is playing. Interpolating
 * the peak position recovers sub-bin accuracy, and splitting each peak's energy
 * between the two nearest pitch classes removes the residual bias.
 *
 * Peak magnitudes are square-rooted before accumulation so one loud fundamental
 * cannot outvote every other note in the chord.
 */
export function accumulateChroma(mag, half, binHz, chromaAccum) {
  const minBin = Math.max(2, Math.floor(CHROMA_LOW_HZ / binHz));
  const maxBin = Math.min(half - 2, Math.ceil(CHROMA_HIGH_HZ / binHz));

  for (let k = minBin; k <= maxBin; k += 1) {
    const centre = mag[k];
    const left = mag[k - 1];
    const right = mag[k + 1];
    if (!(centre > left) || !(centre > right) || centre <= 0) {
      continue;
    }

    // Parabolic peak interpolation. Work in log magnitude: the main lobe of a
    // windowed sinusoid is far closer to a parabola on a dB scale than on a
    // linear one, and on the linear scale the fit is biased toward the bin
    // centre - which is exactly the quantisation error being removed.
    const logLeft = Math.log(left + 1e-12);
    const logCentre = Math.log(centre + 1e-12);
    const logRight = Math.log(right + 1e-12);
    const denominator = logLeft - 2 * logCentre + logRight;
    const shift = denominator !== 0 ? (0.5 * (logLeft - logRight)) / denominator : 0;
    const hz = (k + clamp(shift, -0.5, 0.5)) * binHz;
    if (hz < CHROMA_LOW_HZ || hz > CHROMA_HIGH_HZ) {
      continue;
    }

    const midi = 69 + 12 * Math.log2(hz / 440);
    const lower = Math.floor(midi);
    const frac = midi - lower;
    const lowerClass = ((lower % 12) + 12) % 12;
    const upperClass = (lowerClass + 1) % 12;
    const weight = Math.sqrt(centre);

    chromaAccum[lowerClass] += weight * (1 - frac);
    chromaAccum[upperClass] += weight * frac;
  }
}

// Krumhansl-Schmuckler key profiles: the average perceived stability of each
// scale degree, measured experimentally. Correlating a song's chroma against
// all 24 rotations of these is the standard way to guess a key.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function standardise(values) {
  const n = values.length;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;

  let variance = 0;
  for (const v of values) variance += (v - mean) * (v - mean);
  const sd = Math.sqrt(variance / n);

  const out = new Array(n);
  for (let i = 0; i < n; i += 1) out[i] = sd > 1e-12 ? (values[i] - mean) / sd : 0;
  return out;
}

/**
 * Estimates musical key from a 12-bin chroma vector by correlating it against
 * every rotation of the major and minor Krumhansl-Schmuckler profiles.
 *
 * Confidence is the margin between the best and second-best *distinct* key,
 * scaled by the best score. A song with a genuine tonal centre separates
 * clearly; atonal or percussion-only material does not, and the caller is
 * expected to hide the readout rather than print a coin-flip as fact.
 */
export function estimateMusicalKey(chroma) {
  if (!chroma || chroma.length !== 12) {
    return { key: null, confidence: 0 };
  }

  let total = 0;
  for (const v of chroma) total += v;
  if (!(total > 0)) {
    return { key: null, confidence: 0 };
  }

  const norm = standardise(Array.from(chroma));
  const major = standardise(MAJOR_PROFILE);
  const minor = standardise(MINOR_PROFILE);

  const scored = [];
  for (let shift = 0; shift < 12; shift += 1) {
    let corrMajor = 0;
    let corrMinor = 0;
    for (let i = 0; i < 12; i += 1) {
      const value = norm[(i + shift) % 12];
      corrMajor += value * major[i];
      corrMinor += value * minor[i];
    }
    scored.push({ key: `${PITCH_CLASSES[shift]} Major`, score: corrMajor });
    scored.push({ key: `${PITCH_CLASSES[shift]} Minor`, score: corrMinor });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];
  if (!(best.score > 0)) {
    return { key: null, confidence: 0 };
  }

  const margin = (best.score - runnerUp.score) / best.score;
  return { key: best.key, confidence: clamp(margin * 3.2, 0, 1) };
}

/**
 * Estimates tempo by autocorrelating the spectral-flux onset envelope.
 *
 * Flux already measures how much energy appeared since the previous frame, so
 * it peaks on note and drum onsets: autocorrelating it finds the lag at which
 * the song repeats itself rhythmically. `frameRate` is analysis frames per
 * second, not audio sample rate.
 *
 * Confidence is how far the winning lag stands above the mean of the
 * autocorrelation. A steady beat gives a sharp isolated peak; rubato, ambient
 * or speech material gives a flat curve, and the caller should not print a
 * number derived from one.
 */
export function estimateTempoBpm(fluxSeries, frameRate, { minBpm = 60, maxBpm = 190 } = {}) {
  const n = fluxSeries ? fluxSeries.length : 0;
  if (!(frameRate > 0) || n < 32) {
    return { bpm: null, confidence: 0 };
  }

  // Work on the positive first difference of flux: this sharpens onsets and
  // removes the slow loudness drift that would otherwise dominate the
  // autocorrelation at long lags.
  const onset = new Float64Array(n);
  let mean = 0;
  for (let i = 1; i < n; i += 1) {
    const rise = fluxSeries[i] - fluxSeries[i - 1];
    onset[i] = rise > 0 ? rise : 0;
    mean += onset[i];
  }
  mean /= n;
  for (let i = 0; i < n; i += 1) onset[i] -= mean;

  const minLag = Math.max(2, Math.floor((frameRate * 60) / maxBpm));
  const maxLag = Math.min(n - 2, Math.ceil((frameRate * 60) / minBpm));
  if (maxLag <= minLag) {
    return { bpm: null, confidence: 0 };
  }

  const scores = new Float64Array(maxLag - minLag + 1);
  let bestLag = -1;
  let bestScore = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = lag; i < n; i += 1) sum += onset[i] * onset[i - lag];
    const score = sum / (n - lag);
    scores[lag - minLag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || !(bestScore > 0)) {
    return { bpm: null, confidence: 0 };
  }

  // Confidence is how far the winning lag stands above the *typical* lag,
  // measured in robust units.
  //
  // Mean and standard deviation are both wrong here. Comparing to the mean
  // alone overstates noise, because the largest of a few hundred noisy values
  // sits well above the mean by chance. Standard deviation understates a real
  // beat, because a periodic signal also peaks at every multiple of its period,
  // and those extra peaks inflate the very spread they are being judged
  // against. Median and median absolute deviation ignore the sparse peaks and
  // describe the floor the winner has to clear.
  const sorted = Array.from(scores).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const deviations = sorted.map((score) => Math.abs(score - median)).sort((a, b) => a - b);
  const mad = deviations[deviations.length >> 1];
  const ratio = mad > 1e-18 ? (bestScore - median) / mad : 0;
  const prominence = clamp((ratio - 6) / 20, 0, 1);

  let bpm = (frameRate * 60) / bestLag;

  // Autocorrelation is happy to lock onto a half- or double-time multiple.
  // Fold the answer into the range people actually name tempos in.
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  return { bpm, confidence: prominence };
}
