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

registerProcessor("ms-recorder", RecorderProcessor);
registerProcessor("ms-gate", GateProcessor);
registerProcessor("ms-true-peak-limiter", TruePeakLimiter);
registerProcessor("ms-loudness-meter", LoudnessMeter);
