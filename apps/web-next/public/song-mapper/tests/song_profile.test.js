import assert from "node:assert/strict";
import test from "node:test";

import { PITCH_CLASSES, accumulateChroma, estimateMusicalKey, estimateTempoBpm } from "../visual_utils.js";

// Must match CHROMA_FFT_SIZE in analysis-module.js. Chroma runs on a long
// window precisely so that a minor third in the bass resolves into two peaks
// rather than one phantom peak between them.
const CHROMA_FFT_SIZE = 8192;
const SAMPLE_RATE = 44100;
const BIN_HZ = SAMPLE_RATE / CHROMA_FFT_SIZE;
const HALF = CHROMA_FFT_SIZE >> 1;

/**
 * Magnitude spectrum of a set of sinusoids as a Hann-windowed FFT would
 * actually see them: each partial spread over a four-bin main lobe centred on
 * a non-integer bin. This is the input the real analyser produces.
 */
function spectrumFor(frequencies, partials = 3) {
  const mag = new Float64Array(HALF);
  for (const f0 of frequencies) {
    for (let p = 1; p <= partials; p += 1) {
      const hz = f0 * p;
      if (hz >= SAMPLE_RATE / 2) continue;
      const centre = hz / BIN_HZ;
      const amplitude = 1 / p;
      for (let k = Math.floor(centre) - 3; k <= Math.ceil(centre) + 3; k += 1) {
        if (k < 1 || k >= HALF) continue;
        const d = Math.abs(k - centre);
        // Hann main lobe: zero at +/-2 bins, smooth in between.
        const lobe = d >= 2 ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / 2));
        mag[k] += amplitude * lobe;
      }
    }
  }
  return mag;
}

function topPitchClasses(chroma, count) {
  return Array.from(chroma)
    .map((value, index) => ({ value, name: PITCH_CLASSES[index] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((entry) => entry.name);
}

/** Chroma with the triad tones of `root` major weighted heavily. */
function majorTriadChroma(rootIndex) {
  const chroma = new Array(12).fill(0.06);
  for (const interval of [0, 4, 7]) {
    chroma[(rootIndex + interval) % 12] += 1;
  }
  // Scale degrees present but weaker, as in real music.
  for (const interval of [2, 5, 9, 11]) {
    chroma[(rootIndex + interval) % 12] += 0.3;
  }
  return chroma;
}

function minorTriadChroma(rootIndex) {
  const chroma = new Array(12).fill(0.06);
  for (const interval of [0, 3, 7]) {
    chroma[(rootIndex + interval) % 12] += 1;
  }
  for (const interval of [2, 5, 8, 10]) {
    chroma[(rootIndex + interval) % 12] += 0.3;
  }
  return chroma;
}

test("chroma lands on the played pitch classes, not on the FFT grid", () => {
  // D3 F3 A3 - a D minor triad low enough that 43 Hz bins span several
  // semitones, which is precisely where bin-centre binning fails.
  const chroma = new Float64Array(12);
  accumulateChroma(spectrumFor([146.83, 174.61, 220.0]), HALF, BIN_HZ, chroma);

  const top = topPitchClasses(chroma, 3).sort();
  assert.deepEqual(top, ["A", "D", "F"], `expected D/F/A, got ${top.join("/")}`);
});

test("a triad's own key is recovered end to end through the chroma", () => {
  const chroma = new Float64Array(12);
  accumulateChroma(spectrumFor([146.83, 174.61, 220.0]), HALF, BIN_HZ, chroma);
  const { key } = estimateMusicalKey(chroma);
  assert.equal(key, "D Minor");
});

test("chroma tracks the input rather than returning a fixed answer", () => {
  // The symptom of FFT-grid bias is naming the same pitch classes, and so the
  // same key, whatever is played. These two triads share no notes at all.
  const dMinor = new Float64Array(12);
  accumulateChroma(spectrumFor([146.83, 174.61, 220.0]), HALF, BIN_HZ, dMinor);

  const eMajor = new Float64Array(12);
  accumulateChroma(spectrumFor([164.81, 207.65, 246.94]), HALF, BIN_HZ, eMajor);

  assert.deepEqual(topPitchClasses(dMinor, 3).sort(), ["A", "D", "F"]);
  assert.deepEqual(topPitchClasses(eMajor, 3).sort(), ["B", "E", "G#"]);
  assert.notEqual(estimateMusicalKey(dMinor).key, estimateMusicalKey(eMajor).key);
});

test("an isolated triad is reported as low confidence, not as a confident key", () => {
  // A bare major triad with no scale context is genuinely ambiguous between
  // its major key and its relative minor. The estimator is allowed to pick
  // one, but it must not claim to be sure, or the HUD would print a coin-flip
  // as a fact.
  const chroma = new Float64Array(12);
  accumulateChroma(spectrumFor([164.81, 207.65, 246.94]), HALF, BIN_HZ, chroma);
  assert.ok(
    estimateMusicalKey(chroma).confidence < 0.12,
    "an ambiguous triad must fall below the display threshold",
  );
});

test("major keys are recovered from their own chroma", () => {
  for (let root = 0; root < 12; root += 1) {
    const { key, confidence } = estimateMusicalKey(majorTriadChroma(root));
    assert.equal(key, `${PITCH_CLASSES[root]} Major`, `root ${PITCH_CLASSES[root]}`);
    assert.ok(confidence > 0, "a clear tonal centre should carry non-zero confidence");
  }
});

test("minor keys are recovered and not confused with their relative major", () => {
  for (let root = 0; root < 12; root += 1) {
    const { key } = estimateMusicalKey(minorTriadChroma(root));
    assert.equal(key, `${PITCH_CLASSES[root]} Minor`, `root ${PITCH_CLASSES[root]}`);
  }
});

test("a flat chroma yields no key rather than an arbitrary one", () => {
  const { key, confidence } = estimateMusicalKey(new Array(12).fill(1));
  assert.equal(confidence, 0);
  assert.equal(key, null);
});

test("silence and malformed input are refused, not guessed", () => {
  assert.equal(estimateMusicalKey(new Array(12).fill(0)).key, null);
  assert.equal(estimateMusicalKey([1, 2, 3]).key, null);
  assert.equal(estimateMusicalKey(null).key, null);
});

/** Onset envelope with a pulse every `periodFrames` frames. */
function pulseTrain(length, periodFrames, jitter = 0) {
  const series = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const phase = i % periodFrames;
    series[i] = phase === 0 ? 1 : Math.max(0, 0.35 - phase * 0.1);
    if (jitter) {
      series[i] += Math.sin(i * 12.9898) * jitter;
    }
  }
  return series;
}

test("tempo is recovered from a periodic onset envelope", () => {
  // 120 BPM at 20 analysis frames per second is one beat every 10 frames.
  const frameRate = 20;
  const { bpm, confidence } = estimateTempoBpm(pulseTrain(1200, 10), frameRate);
  assert.ok(bpm !== null, "a clean pulse train should produce a tempo");
  assert.ok(Math.abs(bpm - 120) < 3, `expected ~120 BPM, got ${bpm}`);
  assert.ok(confidence > 0.1, `expected usable confidence, got ${confidence}`);
});

test("tempo estimates are folded into the range tempos are named in", () => {
  // One beat every 19 frames at 20 fps is 63 BPM. That is inside the searched
  // band but below how anyone would name it, so it should fold to ~126.
  const { bpm } = estimateTempoBpm(pulseTrain(2000, 19), 20);
  assert.ok(bpm >= 70 && bpm <= 180, `expected a folded tempo, got ${bpm}`);
});

test("periodicity outside the searched band is refused, not folded from noise", () => {
  // 30 BPM at 20 fps is a 40-frame period, well outside the 60-190 BPM search.
  // Reporting a confident tempo here would be inventing one.
  const { confidence } = estimateTempoBpm(pulseTrain(2000, 40), 20);
  assert.ok(confidence < 0.18, `expected no confident tempo, got ${confidence}`);
});

test("aperiodic material does not produce a confident tempo", () => {
  const random = new Float64Array(600);
  let seed = 7;
  for (let i = 0; i < random.length; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    random[i] = seed / 2147483648;
  }
  const { confidence } = estimateTempoBpm(random, 20);
  assert.ok(confidence < 0.18, `noise should stay under the display threshold, got ${confidence}`);
});

test("too little data is refused rather than extrapolated", () => {
  assert.equal(estimateTempoBpm(new Float64Array(8), 20).bpm, null);
  assert.equal(estimateTempoBpm(pulseTrain(400, 10), 0).bpm, null);
});
