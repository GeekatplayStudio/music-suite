/* Music Suite Studio Editor: audio processors that the Web Audio API has no built-in node for.
 * Runs in the AudioWorklet scope for both live playback and offline export. */

const OVERSAMPLE = 4;
const TAPS = 16;
const HALF = TAPS / 2;

function besselI0(x) {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 24; k++) {
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
  }
  return sum;
}

const KAISER_BETA = 6.5;

/** Polyphase Kaiser-windowed sinc interpolators for the three positions between two samples. */
const PHASES = [];
for (let phase = 1; phase < OVERSAMPLE; phase++) {
  const fraction = phase / OVERSAMPLE;
  const taps = new Float64Array(TAPS);
  let sum = 0;
  for (let k = 0; k < TAPS; k++) {
    const x = k - (HALF - 1) - fraction;
    const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const ratio = Math.min(1, Math.abs(x) / HALF);
    taps[k] = (sinc * besselI0(KAISER_BETA * Math.sqrt(1 - ratio * ratio))) / besselI0(KAISER_BETA);
    sum += taps[k];
  }
  for (let k = 0; k < TAPS; k++) taps[k] /= sum;
  PHASES.push(taps);
}

/**
 * Largest magnitude at or just after ring[centre], including the three
 * interpolated points before the next sample: an estimate of the true peak.
 */
function truePeakAt(ring, mask, centre) {
  let peak = Math.abs(ring[centre & mask]);
  for (let p = 0; p < PHASES.length; p++) {
    const taps = PHASES[p];
    let value = 0;
    for (let k = 0; k < TAPS; k++) value += taps[k] * ring[(centre - (HALF - 1) + k) & mask];
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
  }
  return peak;
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

/* ---------- Noise gate ---------- */

class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: -45, minValue: -90, maxValue: 0, automationRate: "k-rate" },
      { name: "attack", defaultValue: 0.002, minValue: 0.0005, maxValue: 0.5, automationRate: "k-rate" },
      { name: "hold", defaultValue: 0.06, minValue: 0, maxValue: 2, automationRate: "k-rate" },
      { name: "release", defaultValue: 0.15, minValue: 0.005, maxValue: 3, automationRate: "k-rate" }
    ];
  }

  constructor() {
    super();
    this.gain = 0;
    this.holdLeft = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;
    const threshold = dbToGain(parameters.threshold[0]);
    const attack = 1 - Math.exp(-1 / (sampleRate * parameters.attack[0]));
    const release = 1 - Math.exp(-1 / (sampleRate * parameters.release[0]));
    const holdSamples = Math.round(sampleRate * parameters.hold[0]);
    const frames = output[0].length;
    for (let i = 0; i < frames; i++) {
      let level = 0;
      for (let c = 0; c < input.length; c++) {
        const magnitude = Math.abs(input[c][i]);
        if (magnitude > level) level = magnitude;
      }
      if (level >= threshold) this.holdLeft = holdSamples;
      else if (this.holdLeft > 0) this.holdLeft -= 1;
      const open = level >= threshold || this.holdLeft > 0;
      this.gain += ((open ? 1 : 0) - this.gain) * (open ? attack : release);
      for (let c = 0; c < output.length; c++) {
        output[c][i] = (input[c] || input[0])[i] * this.gain;
      }
    }
    return true;
  }
}

/* ---------- True-peak look-ahead limiter ---------- */

const RING = 1024;
const RING_MASK = RING - 1;

class TruePeakLimiter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "ceiling", defaultValue: -1, minValue: -12, maxValue: 0, automationRate: "k-rate" },
      { name: "release", defaultValue: 0.12, minValue: 0.01, maxValue: 2, automationRate: "k-rate" }
    ];
  }

  constructor() {
    super();
    this.lookahead = Math.min(400, Math.max(32, Math.round(sampleRate * 0.005)));
    this.audio = [new Float32Array(RING), new Float32Array(RING)];
    this.index = 0;
    // Sliding minimum of the required gain over the look-ahead window (monotonic queue).
    this.queueValue = new Float64Array(RING);
    this.queueIndex = new Float64Array(RING);
    this.queueHead = 0;
    this.queueTail = 0;
    // Moving average of that minimum, which turns each step into a ramp that lands before the peak.
    this.minimums = new Float64Array(RING).fill(1);
    this.sum = this.lookahead;
    this.gain = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const frames = output[0].length;
    // Aim a tenth of a dB under the ceiling to absorb what a short interpolator cannot see.
    const ceiling = dbToGain(parameters.ceiling[0] - 0.1);
    const release = 1 - Math.exp(-1 / (sampleRate * parameters.release[0]));
    const span = this.lookahead;
    const left = input && input[0];
    const right = input && (input[1] || input[0]);

    for (let i = 0; i < frames; i++) {
      const n = this.index;
      this.audio[0][n & RING_MASK] = left ? left[i] : 0;
      this.audio[1][n & RING_MASK] = right ? right[i] : 0;

      // The interpolator needs HALF samples of future, so the peak is measured that far back.
      const centre = n - HALF;
      const peak = Math.max(
        truePeakAt(this.audio[0], RING_MASK, centre),
        truePeakAt(this.audio[1], RING_MASK, centre)
      );
      const required = peak > ceiling ? ceiling / peak : 1;

      while (this.queueTail > this.queueHead && this.queueValue[(this.queueTail - 1) & RING_MASK] >= required) {
        this.queueTail -= 1;
      }
      this.queueValue[this.queueTail & RING_MASK] = required;
      this.queueIndex[this.queueTail & RING_MASK] = n;
      this.queueTail += 1;
      while (this.queueIndex[this.queueHead & RING_MASK] <= n - span) this.queueHead += 1;
      const minimum = this.queueValue[this.queueHead & RING_MASK];

      this.sum += minimum - this.minimums[(n - span) & RING_MASK];
      this.minimums[n & RING_MASK] = minimum;
      // Re-total now and then so rounding cannot accumulate.
      if ((n & 0xffff) === 0) {
        let total = 0;
        for (let k = 0; k < span; k++) total += this.minimums[(n - k) & RING_MASK];
        this.sum = total;
      }
      const target = Math.min(1, this.sum / span);
      this.gain = target < this.gain ? target : Math.min(target, this.gain + (1 - this.gain) * release);

      const read = centre - (span - 1);
      for (let c = 0; c < output.length; c++) {
        output[c][i] = this.audio[c < 2 ? c : 1][read & RING_MASK] * this.gain;
      }
      this.index = n + 1;
    }
    return true;
  }
}

/* ---------- EBU R 128 loudness and true-peak meter ---------- */

// ITU-R BS.1770-4 K-weighting coefficients for 48 kHz.
const SHELF_B = [1.53512485958697, -2.69169618940638, 1.19839281085285];
const SHELF_A = [-1.69065929318241, 0.73248077421585];
const HIGHPASS_B = [1, -2, 1];
const HIGHPASS_A = [-1.99004745483398, 0.99007225036621];

function lufs(meanSquare) {
  return meanSquare > 1e-12 ? -0.691 + 10 * Math.log10(meanSquare) : null;
}

class LoudnessMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blockSize = Math.round(sampleRate * 0.1);
    this.state = [new Float64Array(4), new Float64Array(4)];
    this.rings = [new Float32Array(RING), new Float32Array(RING)];
    this.reset();
    this.port.onmessage = (event) => {
      if (event.data === "reset") this.reset();
    };
  }

  reset() {
    this.blockEnergy = 0;
    this.blockFill = 0;
    this.recent = [];
    this.gated = [];
    this.truePeak = 0;
    this.index = 0;
  }

  weighted(channel, x) {
    const z = this.state[channel];
    const a = SHELF_B[0] * x + z[0];
    z[0] = SHELF_B[1] * x - SHELF_A[0] * a + z[1];
    z[1] = SHELF_B[2] * x - SHELF_A[1] * a;
    const b = HIGHPASS_B[0] * a + z[2];
    z[2] = HIGHPASS_B[1] * a - HIGHPASS_A[0] * b + z[3];
    z[3] = HIGHPASS_B[2] * a - HIGHPASS_A[1] * b;
    return b;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const frames = output && output[0] ? output[0].length : 128;
    const left = input && input[0];
    const right = input && (input[1] || input[0]);
    for (let i = 0; i < frames; i++) {
      const l = left ? left[i] : 0;
      const r = right ? right[i] : 0;
      const wl = this.weighted(0, l);
      const wr = this.weighted(1, r);
      this.blockEnergy += wl * wl + wr * wr;

      const n = this.index;
      this.rings[0][n & RING_MASK] = l;
      this.rings[1][n & RING_MASK] = r;
      const peak = Math.max(
        truePeakAt(this.rings[0], RING_MASK, n - HALF),
        truePeakAt(this.rings[1], RING_MASK, n - HALF)
      );
      if (peak > this.truePeak) this.truePeak = peak;
      this.index = n + 1;

      this.blockFill += 1;
      if (this.blockFill >= this.blockSize) this.finishBlock();
    }
    return true;
  }

  finishBlock() {
    this.recent.push(this.blockEnergy / this.blockFill);
    if (this.recent.length > 30) this.recent.shift();
    this.blockEnergy = 0;
    this.blockFill = 0;

    const mean = (count) => {
      const from = Math.max(0, this.recent.length - count);
      let total = 0;
      for (let k = from; k < this.recent.length; k++) total += this.recent[k];
      return total / (this.recent.length - from);
    };
    const momentary = mean(4);
    // Integrated loudness gates on overlapping 400 ms blocks, one every 100 ms.
    if (this.recent.length >= 4) {
      const loudness = lufs(momentary);
      if (loudness !== null && loudness > -70) this.gated.push(momentary);
    }
    let integrated = null;
    if (this.gated.length) {
      let total = 0;
      for (const energy of this.gated) total += energy;
      const relative = (total / this.gated.length) * Math.pow(10, -1);
      let kept = 0;
      let count = 0;
      for (const energy of this.gated) {
        if (energy >= relative) {
          kept += energy;
          count += 1;
        }
      }
      integrated = count ? lufs(kept / count) : null;
    }
    this.port.postMessage({
      momentary: lufs(momentary),
      shortTerm: this.recent.length >= 30 ? lufs(mean(30)) : null,
      integrated,
      truePeakDb: this.truePeak > 1e-9 ? 20 * Math.log10(this.truePeak) : null
    });
  }
}

/* ---------- Recorder: passes uncompressed input blocks to the page ---------- */

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blocks = [];
    this.filled = 0;
    this.firstFrame = 0;
    this.port.onmessage = (event) => {
      if (event.data !== "flush") return;
      // Hand over whatever is still buffered so the end of a take is never lost.
      this.send();
      this.port.postMessage({ done: true });
    };
  }

  send() {
    if (!this.filled) return;
    const channels = this.blocks[0].length;
    const joined = [];
    for (let c = 0; c < channels; c++) {
      const data = new Float32Array(this.filled);
      let offset = 0;
      for (const block of this.blocks) {
        data.set(block[c] || block[0], offset);
        offset += block[0].length;
      }
      joined.push(data);
    }
    // The frame number ties every sample to the audio clock exactly.
    this.port.postMessage({ frame: this.firstFrame, channels: joined }, joined.map((data) => data.buffer));
    this.blocks = [];
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    if (!this.filled) this.firstFrame = currentFrame;
    this.blocks.push(input.slice(0, 2).map((channel) => channel.slice()));
    this.filled += input[0].length;
    // About 85 ms per message keeps the message rate low.
    if (this.filled >= 4096) this.send();
    return true;
  }
}

/* ---------- Voice effects: vocoder, pitch shift, robot, synth voice, vox distortion ---------- */

const VOICE_MODE_VOCODER = 0;
const VOICE_MODE_PITCH = 1;
const VOICE_MODE_ROBOT = 2;
const VOICE_MODE_SYNTH = 3;
const VOICE_MODE_DISTORT = 4;

const VOCODER_BANDS = 20;
const MAX_CARRIERS = 8;
const SHIFT_RING = 16384;
const SHIFT_MASK = SHIFT_RING - 1;
const TRACK_WINDOW = 512;
const TRACK_HOP = 128;

/** RBJ biquad coefficients as [b0, b1, b2, a1, a2], normalised by a0. */
function biquad(type, frequency, q) {
  const w0 = (2 * Math.PI * Math.min(frequency, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  if (type === "bandpass") return [alpha / a0, 0, -alpha / a0, (-2 * cos) / a0, (1 - alpha) / a0];
  if (type === "highpass") return [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
  return [(1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

/** One biquad step in transposed direct form II; `z` holds two state values at `i` and `i + 1`. */
function runBiquad(c, z, i, x) {
  const y = c[0] * x + z[i];
  z[i] = c[1] * x - c[3] * y + z[i + 1];
  z[i + 1] = c[2] * x - c[4] * y;
  return y;
}

/** PolyBLEP correction that removes most of the aliasing from a naive saw or square edge. */
function polyBlep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

class VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "mode", defaultValue: 0, minValue: 0, maxValue: 4, automationRate: "k-rate" },
      { name: "semitones", defaultValue: 0, minValue: -24, maxValue: 24, automationRate: "k-rate" },
      { name: "mix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "carrier", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "note", defaultValue: 48, minValue: 24, maxValue: 96, automationRate: "k-rate" },
      { name: "wave", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "rate", defaultValue: 50, minValue: 5, maxValue: 400, automationRate: "k-rate" },
      { name: "drive", defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: "k-rate" }
    ];
  }

  constructor() {
    super();
    const sr = sampleRate;
    this.mode = -1;
    // Negative until the first block, which then starts at the set mix instead of ramping to it.
    this.mix = -1;
    // Frequencies of keys held on a MIDI keyboard; while any are held they are the carrier.
    this.keys = [];
    this.port.onmessage = (event) => {
      if (event.data && Array.isArray(event.data.keys)) this.keys = event.data.keys.slice(0, MAX_CARRIERS);
    };

    // Pitch shifter: two crossfading read taps sweeping a delay line.
    this.ring = [new Float32Array(SHIFT_RING), new Float32Array(SHIFT_RING)];
    this.write = 0;
    this.phase = 0;
    this.window = Math.round(sr * 0.045);

    // Vocoder: matching band-pass banks for the voice and the carrier, log-spaced 110 Hz to 7.5 kHz.
    this.bands = [];
    for (let b = 0; b < VOCODER_BANDS; b++) {
      const frequency = 110 * Math.pow(7500 / 110, b / (VOCODER_BANDS - 1));
      this.bands.push(biquad("bandpass", frequency, 5));
    }
    this.modZ = new Float64Array(VOCODER_BANDS * 4);
    this.carZ = new Float64Array(VOCODER_BANDS * 4);
    this.modEnv = new Float64Array(VOCODER_BANDS);
    this.carEnv = new Float64Array(VOCODER_BANDS);
    this.envAttack = 1 - Math.exp(-1 / (sr * 0.004));
    this.envRelease = 1 - Math.exp(-1 / (sr * 0.03));
    // Sibilants live above the bank; a little of the voice's own top end keeps words intelligible.
    this.hiss = biquad("highpass", 7000, 0.707);
    this.hissZ = new Float64Array(2);
    this.noise = 0x1234567;
    this.noiseLevel = 0.5;

    // Carrier oscillators.
    this.phases = new Float64Array(MAX_CARRIERS);
    this.freqs = new Float64Array(MAX_CARRIERS).fill(110);
    this.voices = 1;
    this.glide = 1 - Math.exp(-1 / (sr * 0.012));

    // Pitch tracker (YIN) on a decimated copy of the input.
    this.decimate = Math.max(1, Math.round(sr / 12000));
    this.trackRate = sr / this.decimate;
    this.antiAlias = biquad("lowpass", Math.min(3000, this.trackRate * 0.4), 0.707);
    this.antiAliasZ = new Float64Array(4);
    this.decimateCount = 0;
    this.trackRing = new Float32Array(TRACK_WINDOW);
    this.trackFrame = new Float32Array(TRACK_WINDOW);
    this.trackIndex = 0;
    this.trackFill = 0;
    this.sinceHop = 0;
    this.minLag = Math.max(2, Math.floor(this.trackRate / 1000));
    this.maxLag = Math.min(TRACK_WINDOW / 2, Math.ceil(this.trackRate / 70));
    this.diff = new Float32Array(this.maxLag + 2);
    this.pitch = 0;
    this.voiced = false;

    // Synth voice: amplitude follower and a smoothing low-pass.
    this.level = 0;
    this.levelAttack = 1 - Math.exp(-1 / (sr * 0.005));
    this.levelRelease = 1 - Math.exp(-1 / (sr * 0.06));
    this.gate = 0;
    this.synthTone = biquad("lowpass", 3200, 0.9);
    this.synthZ = new Float64Array(2);

    // Robot and distortion.
    this.ringPhase = 0;
    this.fuzzLow = biquad("highpass", 450, 0.707);
    this.fuzzHigh = biquad("lowpass", 3400, 0.9);
    this.fuzzZ = new Float64Array(8);
  }

  reset() {
    for (const ring of this.ring) ring.fill(0);
    this.phase = 0;
    this.modZ.fill(0);
    this.carZ.fill(0);
    this.modEnv.fill(0);
    this.carEnv.fill(0);
    this.hissZ.fill(0);
    this.synthZ.fill(0);
    this.fuzzZ.fill(0);
    this.level = 0;
    this.gate = 0;
  }

  /** Feed the tracker one input sample; re-estimates the pitch once per hop. */
  track(x) {
    const filtered = runBiquad(this.antiAlias, this.antiAliasZ, 0, x);
    const smoothed = runBiquad(this.antiAlias, this.antiAliasZ, 2, filtered);
    if (++this.decimateCount < this.decimate) return;
    this.decimateCount = 0;
    this.trackRing[this.trackIndex] = smoothed;
    this.trackIndex = (this.trackIndex + 1) % TRACK_WINDOW;
    if (this.trackFill < TRACK_WINDOW) this.trackFill += 1;
    if (++this.sinceHop < TRACK_HOP || this.trackFill < TRACK_WINDOW) return;
    this.sinceHop = 0;
    this.estimate();
  }

  estimate() {
    const frame = this.trackFrame;
    let energy = 0;
    for (let i = 0; i < TRACK_WINDOW; i++) {
      const value = this.trackRing[(this.trackIndex + i) % TRACK_WINDOW];
      frame[i] = value;
      energy += value * value;
    }
    if (Math.sqrt(energy / TRACK_WINDOW) < 0.004) {
      this.voiced = false;
      return;
    }
    const span = TRACK_WINDOW - this.maxLag - 1;
    const diff = this.diff;
    // YIN: squared-difference function, then its cumulative-mean normalisation.
    let running = 0;
    diff[0] = 1;
    for (let lag = 1; lag <= this.maxLag + 1; lag++) {
      let total = 0;
      for (let j = 0; j < span; j++) {
        const d = frame[j] - frame[j + lag];
        total += d * d;
      }
      running += total;
      diff[lag] = running > 0 ? (total * lag) / running : 1;
    }
    let lag = -1;
    for (let tau = this.minLag; tau <= this.maxLag; tau++) {
      if (diff[tau] < 0.15) {
        while (tau + 1 <= this.maxLag && diff[tau + 1] < diff[tau]) tau += 1;
        lag = tau;
        break;
      }
    }
    if (lag < 0) {
      this.voiced = false;
      return;
    }
    // Parabolic interpolation between lags for sub-sample accuracy.
    const a = diff[lag - 1];
    const b = diff[lag];
    const c = diff[lag + 1];
    const denominator = a - 2 * b + c;
    const refined = Math.abs(denominator) > 1e-9 ? lag + (0.5 * (a - c)) / denominator : lag;
    this.pitch = this.trackRate / refined;
    this.voiced = true;
  }

  /** Carrier frequencies for this block: held keys, else the snapped sung pitch, else a fixed note. */
  targets(parameters) {
    if (this.keys.length) return this.keys;
    if (parameters.carrier[0] >= 0.5) return [440 * Math.pow(2, (parameters.note[0] - 69) / 12)];
    if (this.pitch <= 0) return [110];
    // Snapping to the nearest semitone is what makes it sound like a machine singing.
    const midi = Math.round(69 + 12 * Math.log2(this.pitch / 440)) + Math.round(parameters.semitones[0]);
    return [440 * Math.pow(2, (Math.min(108, Math.max(12, midi)) - 69) / 12)];
  }

  oscillator(square) {
    let sum = 0;
    for (let v = 0; v < this.voices; v++) {
      const dt = this.freqs[v] / sampleRate;
      let t = this.phases[v] + dt;
      if (t >= 1) t -= 1;
      this.phases[v] = t;
      if (square) {
        let half = t + 0.5;
        if (half >= 1) half -= 1;
        sum += (t < 0.5 ? 1 : -1) + polyBlep(t, dt) - polyBlep(half, dt);
      } else {
        sum += 2 * t - 1 - polyBlep(t, dt);
      }
    }
    return sum / Math.sqrt(this.voices);
  }

  random() {
    this.noise = (this.noise * 1664525 + 1013904223) >>> 0;
    return this.noise / 0x80000000 - 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const frames = output[0].length;
    const left = input && input[0];
    const right = input && (input[1] || input[0]);
    const mode = Math.round(parameters.mode[0]);
    if (mode !== this.mode) {
      this.reset();
      this.mode = mode;
    }
    const targetMix = parameters.mix[0];
    if (this.mix < 0) this.mix = targetMix;
    const mixStep = (targetMix - this.mix) / frames;

    if (mode === VOICE_MODE_VOCODER || mode === VOICE_MODE_SYNTH) {
      const targets = this.targets(parameters);
      const count = Math.max(1, Math.min(MAX_CARRIERS, targets.length));
      // A newly added carrier starts on its note; existing ones glide to theirs.
      for (let v = 0; v < count; v++) {
        if (v >= this.voices) this.freqs[v] = targets[v];
      }
      this.voices = count;
      this.carrierTargets = targets;
    }

    const square = parameters.wave[0] >= 0.5;
    const ratio = Math.pow(2, parameters.semitones[0] / 12);
    const ringStep = parameters.rate[0] / sampleRate;
    const gain = 1 + parameters.drive[0] * 60;
    const trim = 1 / Math.pow(gain, 0.45);

    for (let i = 0; i < frames; i++) {
      const l = left ? left[i] : 0;
      const r = right ? right[i] : 0;
      let wetL = l;
      let wetR = r;

      if (mode === VOICE_MODE_VOCODER || mode === VOICE_MODE_SYNTH) {
        const mono = 0.5 * (l + r);
        this.track(mono);
        const targets = this.carrierTargets;
        for (let v = 0; v < this.voices; v++) this.freqs[v] += (targets[v] - this.freqs[v]) * this.glide;
        const held = this.keys.length > 0;
        if (mode === VOICE_MODE_VOCODER) {
          // Unvoiced sounds (s, t, f) need a noisy carrier or they vanish.
          this.noiseLevel += ((this.voiced || held ? 0.06 : 0.6) - this.noiseLevel) * 0.002;
          const carrier = this.oscillator(square) * 0.5 + this.random() * this.noiseLevel;
          let sum = 0;
          for (let b = 0; b < VOCODER_BANDS; b++) {
            const c = this.bands[b];
            const m = runBiquad(c, this.modZ, b * 4, runBiquad(c, this.modZ, b * 4 + 2, mono));
            const k = runBiquad(c, this.carZ, b * 4, runBiquad(c, this.carZ, b * 4 + 2, carrier));
            const am = Math.abs(m);
            const ak = Math.abs(k);
            this.modEnv[b] += (am - this.modEnv[b]) * (am > this.modEnv[b] ? this.envAttack : this.envRelease);
            this.carEnv[b] += (ak - this.carEnv[b]) * (ak > this.carEnv[b] ? this.envAttack : this.envRelease);
            // The carrier band is flattened, then given the voice's level in that band.
            sum += k * Math.min(40, this.modEnv[b] / (this.carEnv[b] + 1e-4));
          }
          const air = runBiquad(this.hiss, this.hissZ, 0, mono) * 0.35;
          wetL = wetR = sum * 2 + air;
        } else {
          const magnitude = Math.abs(mono);
          this.level += (magnitude - this.level) * (magnitude > this.level ? this.levelAttack : this.levelRelease);
          // Breaths and consonants have no pitch to follow, so the oscillator is gated off for them.
          this.gate += ((this.voiced || held ? 1 : 0) - this.gate) * 0.0015;
          const tone = runBiquad(this.synthTone, this.synthZ, 0, this.oscillator(square));
          wetL = wetR = tone * this.level * this.gate * 1.3;
        }
      } else if (mode === VOICE_MODE_PITCH) {
        const write = this.write;
        this.ring[0][write & SHIFT_MASK] = l;
        this.ring[1][write & SHIFT_MASK] = r;
        this.phase += (1 - ratio) / this.window;
        if (this.phase >= 1) this.phase -= 1;
        else if (this.phase < 0) this.phase += 1;
        let other = this.phase + 0.5;
        if (other >= 1) other -= 1;
        // Each tap fades out as it wraps; the pair always sums to unity gain.
        const fadeA = Math.sin(Math.PI * this.phase) ** 2;
        const fadeB = 1 - fadeA;
        const delayA = this.phase * this.window;
        const delayB = other * this.window;
        wetL = this.tap(0, write, delayA) * fadeA + this.tap(0, write, delayB) * fadeB;
        wetR = this.tap(1, write, delayA) * fadeA + this.tap(1, write, delayB) * fadeB;
        this.write = (write + 1) & SHIFT_MASK;
      } else if (mode === VOICE_MODE_ROBOT) {
        this.ringPhase += ringStep;
        if (this.ringPhase >= 1) this.ringPhase -= 1;
        const carrier = Math.sin(2 * Math.PI * this.ringPhase) * 1.4;
        wetL = l * carrier;
        wetR = r * carrier;
      } else if (mode === VOICE_MODE_DISTORT) {
        wetL = this.fuzz(l, 0, gain) * trim;
        wetR = this.fuzz(r, 4, gain) * trim;
      }

      this.mix += mixStep;
      const dry = 1 - this.mix;
      output[0][i] = l * dry + wetL * this.mix;
      if (output[1]) output[1][i] = r * dry + wetR * this.mix;
    }
    this.mix = targetMix;
    return true;
  }

  /** Linearly interpolated read `delay` samples behind the write head. */
  tap(channel, write, delay) {
    const position = write - delay;
    const base = Math.floor(position);
    const fraction = position - base;
    const ring = this.ring[channel];
    return ring[base & SHIFT_MASK] * (1 - fraction) + ring[(base + 1) & SHIFT_MASK] * fraction;
  }

  /** Megaphone fuzz: thin the voice, clip it hard, then roll off the fizz. */
  fuzz(x, slot, gain) {
    const thin = runBiquad(this.fuzzLow, this.fuzzZ, slot, x);
    const clipped = Math.tanh(gain * thin);
    return runBiquad(this.fuzzHigh, this.fuzzZ, slot + 2, clipped);
  }
}

registerProcessor("ms-voice", VoiceProcessor);
registerProcessor("ms-recorder", RecorderProcessor);
registerProcessor("ms-gate", GateProcessor);
registerProcessor("ms-true-peak-limiter", TruePeakLimiter);
registerProcessor("ms-loudness-meter", LoudnessMeter);
