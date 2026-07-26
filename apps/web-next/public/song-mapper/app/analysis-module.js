import { sanitizePresetName, sortPresetEntries } from "../preset_utils.js";

export function createAnalysisModule(runtime) {
  const {
    controlDrawer,
    mappingMode,
    knnNeighbors,
    freqSpread,
    autoFreqSpread,
    visualPreset,
    customPresetSelect,
    customPresetName,
    legendTitle,
    legendBar,
    legendScale,
    colorMetric,
    paletteSaturation,
    player,
    state,
    FFT_SIZE,
    HOP_SIZE,
    MAX_POINTS,
    MAX_KNN_EDGES,
    EPSILON,
    CUSTOM_PRESETS_KEY,
    PRESET_PALETTES,
    PRESET_CONTROL_EXCLUSIONS,
    windowHann,
    clamp,
    lerp,
    mixColor,
    setSessionLabel,
    normalizeValue,
  } = runtime;

  function getDecodeContext() {
    if (!state.decodeContext) {
      state.decodeContext = new AudioContext();
    }
    return state.decodeContext;
  }
  
  function fftInPlace(re, im) {
    const n = re.length;
    let j = 0;
  
    for (let i = 1; i < n; i += 1) {
      let bit = n >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
      j ^= bit;
  
      if (i < j) {
        const tr = re[i];
        const ti = im[i];
        re[i] = re[j];
        im[i] = im[j];
        re[j] = tr;
        im[j] = ti;
      }
    }
  
    for (let len = 2; len <= n; len <<= 1) {
      const angle = (-2 * Math.PI) / len;
      const wlenCos = Math.cos(angle);
      const wlenSin = Math.sin(angle);
  
      for (let i = 0; i < n; i += len) {
        let wCos = 1;
        let wSin = 0;
  
        for (let k = 0; k < len / 2; k += 1) {
          const uRe = re[i + k];
          const uIm = im[i + k];
          const vRe = re[i + k + len / 2] * wCos - im[i + k + len / 2] * wSin;
          const vIm = re[i + k + len / 2] * wSin + im[i + k + len / 2] * wCos;
  
          re[i + k] = uRe + vRe;
          im[i + k] = uIm + vIm;
          re[i + k + len / 2] = uRe - vRe;
          im[i + k + len / 2] = uIm - vIm;
  
          const nextCos = wCos * wlenCos - wSin * wlenSin;
          const nextSin = wCos * wlenSin + wSin * wlenCos;
          wCos = nextCos;
          wSin = nextSin;
        }
      }
    }
  }
  
  function extractMonoSamples(buffer) {
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const mono = new Float32Array(length);
  
    for (let channel = 0; channel < channels; channel += 1) {
      const src = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        mono[i] += src[i] / channels;
      }
    }
  
    return mono;
  }
  
  function computeFrameDescriptor(mono, start, sampleRate, re, im, mag, prevMag) {
    let rmsSum = 0;
    let zcr = 0;
    let prev = 0;
  
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const sample = mono[start + i] || 0;
      const windowed = sample * windowHann[i];
      re[i] = windowed;
      im[i] = 0;
  
      rmsSum += sample * sample;
      if (i > 0 && (sample >= 0) !== (prev >= 0)) {
        zcr += 1;
      }
      prev = sample;
    }
  
    fftInPlace(re, im);
  
    const half = FFT_SIZE >> 1;
    const binHz = sampleRate / FFT_SIZE;
    let sumMag = 0;
    let weighted = 0;
    let arithmetic = 0;
    let logSum = 0;
    let peakMag = -1;
    let peakHz = 0;
    let flux = 0;
  
    for (let k = 1; k < half; k += 1) {
      const magnitude = Math.hypot(re[k], im[k]);
      const hz = k * binHz;
      const safe = magnitude + EPSILON;
  
      mag[k] = magnitude;
      sumMag += magnitude;
      weighted += magnitude * hz;
      arithmetic += safe;
      logSum += Math.log(safe);
  
      const rising = magnitude - prevMag[k];
      flux += rising > 0 ? rising : 0;
      prevMag[k] = magnitude;
  
      if (magnitude > peakMag) {
        peakMag = magnitude;
        peakHz = hz;
      }
    }
  
    const centroid = sumMag > 0 ? weighted / sumMag : 0;
  
    let spreadNumerator = 0;
    let cumulative = 0;
    let rolloffHz = 0;
    const rolloffTarget = sumMag * 0.85;
  
    for (let k = 1; k < half; k += 1) {
      const hz = k * binHz;
      const magnitude = mag[k];
      const diff = hz - centroid;
      spreadNumerator += magnitude * diff * diff;
  
      cumulative += magnitude;
      if (rolloffHz === 0 && cumulative >= rolloffTarget) {
        rolloffHz = hz;
      }
    }
  
    const spread = sumMag > 0 ? Math.sqrt(spreadNumerator / sumMag) : 0;
    const flatness = Math.exp(logSum / Math.max(1, half - 1)) / (arithmetic / Math.max(1, half - 1));
  
    return {
      t: start / sampleRate,
      rms: Math.sqrt(rmsSum / FFT_SIZE),
      centroidHz: centroid,
      spreadHz: spread,
      spreadKhz: spread / 1000,
      rolloffHz,
      flatness,
      zcr: zcr / FFT_SIZE,
      peakHz,
      flux: flux / Math.max(1, half - 1),
    };
  }
  
  function computeRanges(descriptors) {
    const keys = ["rms", "centroidHz", "spreadHz", "rolloffHz", "flatness", "zcr", "peakHz", "flux"];
    const ranges = {};
  
    for (const key of keys) {
      ranges[key] = { min: Infinity, max: -Infinity };
    }
  
    for (const descriptor of descriptors) {
      for (const key of keys) {
        if (descriptor[key] < ranges[key].min) {
          ranges[key].min = descriptor[key];
        }
        if (descriptor[key] > ranges[key].max) {
          ranges[key].max = descriptor[key];
        }
      }
    }
  
    return ranges;
  }
  
  function buildTemporalEdges(frames) {
    const edges = [];
    for (let i = 1; i < frames.length; i += 1) {
      edges.push({ a: i - 1, b: i, weight: 0.36 });
    }
    return edges;
  }
  
  function descriptorDistance(a, b) {
    const d0 = a.centroidN - b.centroidN;
    const d1 = a.spreadN - b.spreadN;
    const d2 = a.rolloffN - b.rolloffN;
    const d3 = a.flatnessN - b.flatnessN;
    const d4 = a.zcrN - b.zcrN;
    const d5 = a.rmsN - b.rmsN;
    const d6 = a.peakN - b.peakN;
    const d7 = a.fluxN - b.fluxN;
  
    return Math.sqrt(
      d0 * d0 * 1.25 +
        d1 * d1 * 1.05 +
        d2 * d2 * 1.0 +
        d3 * d3 * 0.55 +
        d4 * d4 * 0.55 +
        d5 * d5 * 0.82 +
        d6 * d6 * 0.93 +
        d7 * d7 * 1.1,
    );
  }
  
  function buildKnnEdges(frames, neighbors) {
    const n = frames.length;
    if (n < 3) {
      return [];
    }
  
    const k = Math.max(1, Math.min(10, neighbors));
    const step = n > 1600 ? Math.ceil(n / 1600) : 1;
    const indices = [];
  
    for (let i = 0; i < n; i += step) {
      indices.push(i);
    }
    if (indices[indices.length - 1] !== n - 1) {
      indices.push(n - 1);
    }
  
    const edges = [];
    const unique = new Set();
    const localSpan = Math.max(24, Math.floor(indices.length * 0.22));
  
    for (let idx = 0; idx < indices.length; idx += 1) {
      const i = indices[idx];
      const base = frames[i];
      const nearest = [];
  
      const localStart = Math.max(0, idx - localSpan);
      const localEnd = Math.min(indices.length, idx + localSpan + 1);
  
      for (let cursor = localStart; cursor < localEnd; cursor += 1) {
        if (cursor === idx) {
          continue;
        }
  
        const j = indices[cursor];
        const dist = descriptorDistance(base, frames[j]);
  
        if (nearest.length < k) {
          nearest.push({ j, dist });
          nearest.sort((a, b) => a.dist - b.dist);
        } else if (dist < nearest[nearest.length - 1].dist) {
          nearest[nearest.length - 1] = { j, dist };
          nearest.sort((a, b) => a.dist - b.dist);
        }
      }
  
      for (const entry of nearest) {
        const a = Math.min(i, entry.j);
        const b = Math.max(i, entry.j);
        const key = `${a}-${b}`;
        if (unique.has(key)) {
          continue;
        }
        unique.add(key);
  
        edges.push({
          a,
          b,
          weight: Math.exp(-entry.dist * 3.6),
        });
  
        if (edges.length >= MAX_KNN_EDGES) {
          return edges;
        }
      }
    }
  
    return edges;
  }
  
  function powerIteration(matrix, dimension, prevVectors) {
    const v = new Float64Array(dimension);
    for (let i = 0; i < dimension; i += 1) {
      v[i] = Math.sin((i + 1) * 0.61) + Math.cos((i + 2) * 0.37);
    }
  
    for (let iter = 0; iter < 34; iter += 1) {
      const next = new Float64Array(dimension);
  
      for (let row = 0; row < dimension; row += 1) {
        let sum = 0;
        for (let col = 0; col < dimension; col += 1) {
          sum += matrix[row][col] * v[col];
        }
        next[row] = sum;
      }
  
      for (const prev of prevVectors) {
        let dot = 0;
        for (let i = 0; i < dimension; i += 1) {
          dot += next[i] * prev[i];
        }
        for (let i = 0; i < dimension; i += 1) {
          next[i] -= dot * prev[i];
        }
      }
  
      let length = 0;
      for (let i = 0; i < dimension; i += 1) {
        length += next[i] * next[i];
      }
      length = Math.sqrt(length) || 1;
  
      for (let i = 0; i < dimension; i += 1) {
        v[i] = next[i] / length;
      }
    }
  
    let eigenValue = 0;
    for (let row = 0; row < dimension; row += 1) {
      let mv = 0;
      for (let col = 0; col < dimension; col += 1) {
        mv += matrix[row][col] * v[col];
      }
      eigenValue += v[row] * mv;
    }
  
    return { vector: v, eigenValue };
  }
  
  function pcaProject(vectors, components = 3) {
    const n = vectors.length;
    if (n === 0) {
      return [];
    }
  
    const dimension = vectors[0].length;
    const means = new Float64Array(dimension);
  
    for (const vector of vectors) {
      for (let i = 0; i < dimension; i += 1) {
        means[i] += vector[i];
      }
    }
    for (let i = 0; i < dimension; i += 1) {
      means[i] /= Math.max(1, n);
    }
  
    const centered = vectors.map((vector) => {
      const arr = new Float64Array(dimension);
      for (let i = 0; i < dimension; i += 1) {
        arr[i] = vector[i] - means[i];
      }
      return arr;
    });
  
    const covariance = Array.from({ length: dimension }, () => new Float64Array(dimension));
  
    for (const row of centered) {
      for (let i = 0; i < dimension; i += 1) {
        for (let j = i; j < dimension; j += 1) {
          covariance[i][j] += row[i] * row[j];
        }
      }
    }
  
    const denom = Math.max(1, n - 1);
    for (let i = 0; i < dimension; i += 1) {
      for (let j = i; j < dimension; j += 1) {
        covariance[i][j] /= denom;
        covariance[j][i] = covariance[i][j];
      }
    }
  
    const basis = [];
    const matrix = covariance.map((row) => Float64Array.from(row));
  
    for (let comp = 0; comp < components; comp += 1) {
      const { vector, eigenValue } = powerIteration(matrix, dimension, basis);
      basis.push(vector);
  
      for (let i = 0; i < dimension; i += 1) {
        for (let j = 0; j < dimension; j += 1) {
          matrix[i][j] -= eigenValue * vector[i] * vector[j];
        }
      }
    }
  
    return centered.map((row) =>
      basis.map((vector) => {
        let dot = 0;
        for (let i = 0; i < dimension; i += 1) {
          dot += row[i] * vector[i];
        }
        return dot;
      }),
    );
  }
  
  function computeNormalizedPcaCoords(frames) {
    const vectors = frames.map((frame) => frame.featureVec);
    const coords = pcaProject(vectors, 3);

    const ranges = [
      { min: Infinity, max: -Infinity },
      { min: Infinity, max: -Infinity },
      { min: Infinity, max: -Infinity },
    ];

    for (const c of coords) {
      for (let i = 0; i < 3; i += 1) {
        if (c[i] < ranges[i].min) {
          ranges[i].min = c[i];
        }
        if (c[i] > ranges[i].max) {
          ranges[i].max = c[i];
        }
      }
    }

    return coords.map((c) => [
      normalizeValue(ranges[0], c[0]),
      normalizeValue(ranges[1], c[1]),
      normalizeValue(ranges[2], c[2]),
    ]);
  }

  function applyMapping(frames, mode) {
    if (!frames || frames.length === 0) {
      return;
    }
  
    const modeKey =
      typeof mode === "string" && ["manifold", "time", "hybrid", "helix"].includes(mode)
        ? mode
        : "time";
    const total = Math.max(1, frames.length - 1);
    const usesPca = modeKey === "manifold" || modeKey === "hybrid";
    const pcaCoords = usesPca ? computeNormalizedPcaCoords(frames) : null;
    const turns = clamp(4.8 + frames.length / 720, 4.8, 10.5);

    for (let i = 0; i < frames.length; i += 1) {
      const frame = frames[i];
      const tNorm = i / total;

      if (modeKey === "manifold") {
        const c = pcaCoords[i];
        frame.x = (c[0] - 0.5) * 28 + (tNorm - 0.5) * 1.8;
        frame.y = (c[1] - 0.5) * 20 + (frame.rmsN - 0.5) * 3;
        frame.z = (c[2] - 0.5) * 21 + (frame.fluxN - 0.5) * 4;
        continue;
      }

      if (modeKey === "hybrid") {
        const c = pcaCoords[i];
        const tCentered = tNorm - 0.5;
        const arc = tCentered * Math.PI * 1.55;
        const timeX = Math.sin(arc) * 17;
        const timeY = tCentered * 26 + (frame.rmsN - 0.5) * 7;
        const timeZ = Math.cos(arc) * 10 + (frame.fluxN - 0.5) * 6;

        const manifoldX = (c[0] - 0.5) * 28;
        const manifoldY = (c[1] - 0.5) * 20;
        const manifoldZ = (c[2] - 0.5) * 21;

        frame.x = lerp(timeX, manifoldX, 0.62) + (frame.centroidN - 0.5) * 5;
        frame.y = lerp(timeY, manifoldY, 0.46) + (1 - frame.flatnessN - 0.5) * 4.5;
        frame.z = lerp(timeZ, manifoldZ, 0.62) + (frame.peakN - 0.5) * 4;
        continue;
      }

      if (modeKey === "helix") {
        const angle = tNorm * Math.PI * 2 * turns + (frame.fluxN - 0.5) * 1.5;
        const radius = 13 + frame.spreadN * 12 + frame.rmsN * 6;
        frame.x = Math.cos(angle) * radius + (frame.centroidN - 0.5) * 3;
        frame.y = (tNorm - 0.5) * 46 + Math.sin(angle * 0.5) * 3 + (frame.rmsN - 0.5) * 5;
        frame.z = Math.sin(angle) * radius + (frame.peakN - 0.5) * 3;
        continue;
      }

      frame.x = (tNorm - 0.5) * 36;
      frame.y = (frame.peakN - 0.5) * 20 + (frame.centroidN - 0.5) * 7;
      frame.z =
        (frame.spreadN - 0.5) * 18 +
        (1 - frame.flatnessN - 0.5) * 8 +
        (frame.rmsN - 0.5) * 9 +
        (frame.fluxN - 0.5) * 5;
    }
  }

  function percentileSorted(sortedValues, t) {
    if (!sortedValues.length) {
      return 0;
    }

    const clampedT = clamp(t, 0, 1);
    const pos = (sortedValues.length - 1) * clampedT;
    const lo = Math.floor(pos);
    const hi = Math.min(sortedValues.length - 1, lo + 1);
    const mix = pos - lo;
    return lerp(sortedValues[lo], sortedValues[hi], mix);
  }

  function snapToInputStep(value, input) {
    const step = Number(input?.step);
    if (!Number.isFinite(step) || step <= 0) {
      return value;
    }

    const min = Number(input?.min);
    const origin = Number.isFinite(min) ? min : 0;
    return origin + Math.round((value - origin) / step) * step;
  }

  function estimateSongAwareFreqSpread(map) {
    if (!map || !Array.isArray(map.frames) || map.frames.length === 0 || !freqSpread) {
      return null;
    }

    const radialMagnitudes = [];
    const spreadKhzValues = [];

    for (const frame of map.frames) {
      const x = Number(frame.x);
      const z = Number(frame.z);
      if (Number.isFinite(x) && Number.isFinite(z)) {
        radialMagnitudes.push(Math.hypot(x, z));
      }

      const spreadKhz = Number(frame.spreadKhz);
      if (Number.isFinite(spreadKhz)) {
        spreadKhzValues.push(spreadKhz);
      }
    }

    if (radialMagnitudes.length === 0) {
      return null;
    }

    radialMagnitudes.sort((a, b) => a - b);
    const radiusP85 = percentileSorted(radialMagnitudes, 0.85);
    const targetRadius = 20;
    const geometryScale = targetRadius / Math.max(2.4, radiusP85);

    let musicFactor = 1;
    if (spreadKhzValues.length >= 8) {
      spreadKhzValues.sort((a, b) => a - b);
      const spreadP15 = percentileSorted(spreadKhzValues, 0.15);
      const spreadP85 = percentileSorted(spreadKhzValues, 0.85);
      const spreadMedian = percentileSorted(spreadKhzValues, 0.5);
      const spreadBand = Math.max(0, spreadP85 - spreadP15);
      musicFactor = clamp(0.86 + spreadBand * 0.3 + spreadMedian * 0.05, 0.78, 1.36);
    } else if (
      map.spreadRangeKhz &&
      Number.isFinite(Number(map.spreadRangeKhz.min)) &&
      Number.isFinite(Number(map.spreadRangeKhz.max))
    ) {
      const spreadBand = Math.max(0, Number(map.spreadRangeKhz.max) - Number(map.spreadRangeKhz.min));
      musicFactor = clamp(0.9 + spreadBand * 0.22, 0.8, 1.3);
    }

    const minValue = Number(freqSpread.min);
    const maxValue = Number(freqSpread.max);
    const min = Number.isFinite(minValue) ? minValue : 0.6;
    const max = Number.isFinite(maxValue) ? maxValue : 6;

    const raw = clamp(geometryScale * musicFactor, min, max);
    const snapped = snapToInputStep(raw, freqSpread);
    return clamp(Number(snapped.toFixed(2)), min, max);
  }

  function applySongAwareFreqSpread(map = state.map, options = {}) {
    if (!freqSpread) {
      return null;
    }

    const force = options?.force === true;
    if (!force && autoFreqSpread && !autoFreqSpread.checked) {
      return null;
    }

    const spread = estimateSongAwareFreqSpread(map);
    if (!Number.isFinite(spread)) {
      return null;
    }

    freqSpread.value = String(spread);
    if (map && typeof map === "object") {
      map.recommendedFreqSpread = spread;
    }

    return spread;
  }
  
  function applyPaletteVibranceSaturation(rgb, amount) {
    const r = clamp(Number(rgb?.[0]) || 0, 0, 255);
    const g = clamp(Number(rgb?.[1]) || 0, 0, 255);
    const b = clamp(Number(rgb?.[2]) || 0, 0, 255);
    const saturation = clamp(Number(amount), 0, 2);
    if (Math.abs(saturation - 1) < 1e-4) {
      return [Math.round(r), Math.round(g), Math.round(b)];
    }

    const gray = (r + g + b) / 3;
    const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    let scale = saturation;
    if (saturation > 1) {
      const boost = saturation - 1;
      // Vibrance-like behavior: boost muted colors more aggressively.
      scale = 1 + boost * (0.35 + (1 - chroma) * 0.85);
    }

    return [
      clamp(Math.round(gray + (r - gray) * scale), 0, 255),
      clamp(Math.round(gray + (g - gray) * scale), 0, 255),
      clamp(Math.round(gray + (b - gray) * scale), 0, 255),
    ];
  }

  function activePalette() {

    if (state.customPaletteStops && state.customPaletteStops.length >= 2) {
      const saturation = paletteSaturation ? Number(paletteSaturation.value) : 1;
      if (!Number.isFinite(saturation) || Math.abs(saturation - 1) < 1e-4) {
        return state.customPaletteStops;
      }
      return state.customPaletteStops.map(([position, rgb]) => [position, applyPaletteVibranceSaturation(rgb, saturation)]);
    }
  
    const selected = visualPreset.value;
    const base = PRESET_PALETTES[selected] || PRESET_PALETTES.cinematic;
    const saturation = paletteSaturation ? Number(paletteSaturation.value) : 1;
    if (!Number.isFinite(saturation) || Math.abs(saturation - 1) < 1e-4) {
      return base;
    }
    return base.map(([position, rgb]) => [position, applyPaletteVibranceSaturation(rgb, saturation)]);
  }
  
  function colorFromMetric(valueKhz, range) {
    const stops = activePalette();
    const min = range?.min ?? 0;
    const max = range?.max ?? 2.5;
    const t = clamp((valueKhz - min) / Math.max(EPSILON, max - min), 0, 1);
  
    let left = stops[0];
    let right = stops[stops.length - 1];
  
    for (let i = 0; i < stops.length - 1; i += 1) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        left = stops[i];
        right = stops[i + 1];
        break;
      }
    }
  
    const local = (t - left[0]) / Math.max(EPSILON, right[0] - left[0]);
    return {
      r: Math.round(lerp(left[1][0], right[1][0], local)),
      g: Math.round(lerp(left[1][1], right[1][1], local)),
      b: Math.round(lerp(left[1][2], right[1][2], local)),
    };
  }

  function deriveMetricRange(map, valueForFrame, fallbackRange) {
    if (!map || !Array.isArray(map.frames) || map.frames.length === 0 || typeof valueForFrame !== "function") {
      return fallbackRange;
    }

    let min = Infinity;
    let max = -Infinity;

    for (const frame of map.frames) {
      const value = Number(valueForFrame(frame));
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return fallbackRange;
    }

    if (max - min < EPSILON) {
      const padding = Math.max(0.01, Math.abs(max) * 0.05);
      return {
        min: min - padding,
        max: max + padding,
      };
    }

    return { min, max };
  }
  
  function activeMetricInfo() {
    const metric = colorMetric?.value || "spread";
    if (metric === "peak") {
      return {
        key: "peak",
        legend: "Peak Frequency (kHz)",
        valueForFrame: (frame) => frame.peakHz / 1000,
        rangeForMap: (map) => map?.peakRangeKhz || deriveMetricRange(map, (frame) => frame.peakHz / 1000, { min: 0, max: 8 }),
      };
    }

    if (metric === "centroid") {
      return {
        key: "centroid",
        legend: "Spectral Centroid (kHz)",
        valueForFrame: (frame) => frame.centroidHz / 1000,
        rangeForMap: (map) => deriveMetricRange(map, (frame) => frame.centroidHz / 1000, { min: 0, max: 8 }),
      };
    }

    if (metric === "rolloff") {
      return {
        key: "rolloff",
        legend: "Spectral Rolloff 85% (kHz)",
        valueForFrame: (frame) => frame.rolloffHz / 1000,
        rangeForMap: (map) => deriveMetricRange(map, (frame) => frame.rolloffHz / 1000, { min: 0, max: 12 }),
      };
    }

    if (metric === "flux") {
      return {
        key: "flux",
        legend: "Spectral Flux",
        valueForFrame: (frame) => frame.flux,
        rangeForMap: (map) => deriveMetricRange(map, (frame) => frame.flux, { min: 0, max: 1 }),
      };
    }

    if (metric === "flatness") {
      return {
        key: "flatness",
        legend: "Spectral Flatness",
        valueForFrame: (frame) => frame.flatness,
        rangeForMap: (map) => deriveMetricRange(map, (frame) => frame.flatness, { min: 0, max: 1 }),
      };
    }

    if (metric === "tonality") {
      return {
        key: "tonality",
        legend: "Tonality (1 - Flatness)",
        valueForFrame: (frame) => 1 - frame.flatness,
        rangeForMap: (map) => deriveMetricRange(map, (frame) => 1 - frame.flatness, { min: 0, max: 1 }),
      };
    }

    if (metric === "rms") {
      return {
        key: "rms",
        legend: "RMS Energy",
        valueForFrame: (frame) => frame.rms,
        rangeForMap: (map) => deriveMetricRange(map, (frame) => frame.rms, { min: 0, max: 1 }),
      };
    }

    if (metric === "zcr") {
      return {
        key: "zcr",
        legend: "Zero Crossing Rate",
        valueForFrame: (frame) => frame.zcr,
        rangeForMap: (map) => deriveMetricRange(map, (frame) => frame.zcr, { min: 0, max: 0.35 }),
      };
    }
  
    return {
      key: "spread",
      legend: "Spectral Spread (kHz)",
      valueForFrame: (frame) => frame.spreadKhz,
      rangeForMap: (map) =>
        map?.spreadRangeKhz || deriveMetricRange(map, (frame) => frame.spreadKhz, { min: 0, max: 2.5 }),
    };
  }
  
  function normalizePaletteStops(raw) {
    if (!Array.isArray(raw)) {
      return null;
    }
  
    const parsed = [];
  
    for (const entry of raw) {
      let position;
      let color;
  
      if (Array.isArray(entry) && entry.length >= 2) {
        position = Number(entry[0]);
        color = entry[1];
      } else if (entry && typeof entry === "object") {
        position = Number(entry.position ?? entry.pos ?? entry.stop ?? entry.t);
        color = entry.color ?? entry.rgb;
      } else {
        continue;
      }
  
      if (!Array.isArray(color) || color.length < 3 || Number.isNaN(position)) {
        continue;
      }
  
      const r = Number(color[0]);
      const g = Number(color[1]);
      const b = Number(color[2]);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        continue;
      }
  
      parsed.push([
        clamp(position, 0, 1),
        [
          clamp(Math.round(r), 0, 255),
          clamp(Math.round(g), 0, 255),
          clamp(Math.round(b), 0, 255),
        ],
      ]);
    }
  
    if (parsed.length < 2) {
      return null;
    }
  
    parsed.sort((a, b) => a[0] - b[0]);
  
    if (parsed[0][0] > 0) {
      parsed.unshift([0, [...parsed[0][1]]]);
    }
    if (parsed[parsed.length - 1][0] < 1) {
      parsed.push([1, [...parsed[parsed.length - 1][1]]]);
    }
  
    return parsed;
  }
  
  async function loadCustomPaletteFromFile(file) {
    if (!file) {
      return;
    }
  
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const stops = normalizePaletteStops(parsed?.stops || parsed?.palette || parsed);
  
      if (!stops) {
        setSessionLabel("Palette Error", !player.paused);
        return;
      }
  
      state.customPaletteStops = stops;
      recolorFrames();
      setSessionLabel("Palette Loaded", !player.paused);
    } catch (error) {
      console.error(error);
      setSessionLabel("Palette Error", !player.paused);
    } finally {
      if (paletteFile) {
        paletteFile.value = "";
      }
    }
  }
  
  function clearCustomPalette() {
    state.customPaletteStops = null;
    recolorFrames();
    setSessionLabel("Built-in Palette", !player.paused);
  }
  
  function legendGradientFromStops(stops) {
    const entries = [...stops]
      .sort((a, b) => b[0] - a[0])
      .map(([position, rgb]) => {
        const pct = clamp((1 - position) * 100, 0, 100).toFixed(1);
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) ${pct}%`;
      });
  
    return `linear-gradient(180deg, ${entries.join(", ")})`;
  }
  
  function updateLegend() {
    const metricInfo = activeMetricInfo();
    const stops = activePalette();
    legendBar.style.background = legendGradientFromStops(stops);
    if (legendTitle) {
      legendTitle.textContent = metricInfo.legend;
    }
  
    const labels = Array.from(legendScale.querySelectorAll("span"));
    if (!state.map || labels.length === 0) {
      return;
    }
  
    const range = metricInfo.rangeForMap(state.map);
    const min = range.min;
    const max = range.max;
    const last = Math.max(1, labels.length - 1);
  
    for (let i = 0; i < labels.length; i += 1) {
      const value = lerp(max, min, i / last);
      labels[i].textContent = value.toFixed(2);
    }
  }
  
  function getPresetControlElements() {
    const scope = controlDrawer || document;
    const controls = scope.querySelectorAll("input, select");
    const relevant = [];
  
    for (const control of controls) {
      if (!control.id || PRESET_CONTROL_EXCLUSIONS.has(control.id)) {
        continue;
      }
  
      if (control.tagName === "INPUT") {
        if (!["range", "checkbox"].includes(control.type)) {
          continue;
        }
      }
  
      relevant.push(control);
    }
  
    return relevant;
  }
  
  function readCurrentControlSettings() {
    const settings = {};
  
    for (const control of getPresetControlElements()) {
      if (control.type === "checkbox") {
        settings[control.id] = control.checked;
      } else {
        settings[control.id] = control.value;
      }
    }
  
    if (state.customPaletteStops) {
      settings.__customPaletteStops = state.customPaletteStops;
    }
  
    return settings;
  }
  
  function applyControlSettings(settings) {
    if (!settings || typeof settings !== "object") {
      return;
    }
  
    for (const control of getPresetControlElements()) {
      if (!(control.id in settings)) {
        continue;
      }
  
      const value = settings[control.id];
  
      if (control.type === "checkbox") {
        control.checked = value === true || value === 1 || value === "1" || value === "true";
      } else {
        control.value = String(value);
      }
    }
  
    state.customPaletteStops = normalizePaletteStops(settings.__customPaletteStops) || null;
  
    remapFrames();
    rebuildKnnEdges();
    recolorFrames();
  }
  
  function loadCustomPresetStore() {
    try {
      const raw = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
      if (!raw) {
        return {};
      }
  
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }
  
      return parsed;
    } catch (error) {
      console.warn("Could not read custom presets.", error);
      return {};
    }
  }
  
  function saveCustomPresetStore(store) {
    try {
      window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn("Could not persist custom presets.", error);
      return false;
    }
  }
  
  function refreshCustomPresetOptions(selectedName = "") {
    if (!customPresetSelect) {
      return;
    }
  
    const store = loadCustomPresetStore();
    const entries = sortPresetEntries(store);
  
    customPresetSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select custom preset";
    customPresetSelect.appendChild(placeholder);
  
    for (const [name] of entries) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      customPresetSelect.appendChild(option);
    }
  
    if (selectedName && store[selectedName]) {
      customPresetSelect.value = selectedName;
    } else {
      customPresetSelect.value = "";
    }
  }
  
  function saveCurrentSettingsAsCustomPreset() {
    let name = sanitizePresetName(customPresetName?.value || "");
    if (!name) {
      const fallback = new Date().toISOString().replace("T", " ").slice(0, 19);
      name = `Preset ${fallback}`;
    }
  
    const store = loadCustomPresetStore();
    store[name] = {
      updatedAt: Date.now(),
      settings: readCurrentControlSettings(),
    };
  
    const persisted = saveCustomPresetStore(store);
    if (!persisted) {
      setSessionLabel("Preset Save Error", false);
      return;
    }

    const verifyStore = loadCustomPresetStore();
    if (!verifyStore[name]) {
      setSessionLabel("Preset Save Error", false);
      return;
    }

    refreshCustomPresetOptions(name);
  
    if (customPresetName) {
      customPresetName.value = name;
    }
  
    setSessionLabel("Preset Saved", !player.paused);
  }
  
  function applyCustomPresetByName(name) {
    const presetName = sanitizePresetName(name);
    if (!presetName) {
      return;
    }
  
    const store = loadCustomPresetStore();
    const entry = store[presetName];
    if (!entry?.settings) {
      return;
    }
  
    applyControlSettings(entry.settings);
  
    if (customPresetName) {
      customPresetName.value = presetName;
    }
    if (customPresetSelect) {
      customPresetSelect.value = presetName;
    }
  
    setSessionLabel("Preset Loaded", !player.paused);
  }
  
  function deleteCustomPresetByName(name) {
    const presetName = sanitizePresetName(name);
    if (!presetName) {
      return;
    }
  
    const store = loadCustomPresetStore();
    if (!store[presetName]) {
      return;
    }
  
    delete store[presetName];
    saveCustomPresetStore(store);
    refreshCustomPresetOptions("");
  
    if (customPresetName) {
      customPresetName.value = "";
    }
  
    setSessionLabel("Preset Deleted", !player.paused);
  }
  
  function recolorFrames() {
    const metricInfo = activeMetricInfo();
    if (!state.map) {
      updateLegend();
      return;
    }
  
    const range = metricInfo.rangeForMap(state.map);
  
    for (const frame of state.map.frames) {
      frame.color = colorFromMetric(metricInfo.valueForFrame(frame), range);
    }
  
    updateLegend();
  }
  
  async function nextAnimationFrame() {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  
  async function analyzeSong(audioBuffer, progressCb) {
    const mono = extractMonoSamples(audioBuffer);
    const sampleRate = audioBuffer.sampleRate;
  
    const totalFrames = Math.max(1, Math.floor((mono.length - FFT_SIZE) / HOP_SIZE) + 1);
    const stride = Math.max(1, Math.ceil(totalFrames / MAX_POINTS));
  
    const descriptors = [];
    const re = new Float64Array(FFT_SIZE);
    const im = new Float64Array(FFT_SIZE);
    const mag = new Float64Array(FFT_SIZE >> 1);
    const prevMag = new Float64Array(FFT_SIZE >> 1);
  
    let processed = 0;
    for (let frame = 0; frame < totalFrames; frame += stride) {
      const start = frame * HOP_SIZE;
      descriptors.push(computeFrameDescriptor(mono, start, sampleRate, re, im, mag, prevMag));
      processed += 1;
  
      if (processed % 28 === 0) {
        progressCb(frame / totalFrames);
        await nextAnimationFrame();
      }
    }
    progressCb(1);
  
    const ranges = computeRanges(descriptors);
    const frames = [];
  
    for (let i = 0; i < descriptors.length; i += 1) {
      const d = descriptors[i];
  
      const rmsN = normalizeValue(ranges.rms, d.rms);
      const centroidN = normalizeValue(ranges.centroidHz, d.centroidHz);
      const spreadN = normalizeValue(ranges.spreadHz, d.spreadHz);
      const rolloffN = normalizeValue(ranges.rolloffHz, d.rolloffHz);
      const flatnessN = normalizeValue(ranges.flatness, d.flatness);
      const zcrN = normalizeValue(ranges.zcr, d.zcr);
      const peakN = normalizeValue(ranges.peakHz, d.peakHz);
      const fluxN = normalizeValue(ranges.flux, d.flux);
  
      frames.push({
        id: i,
        t: d.t,
        rms: d.rms,
        rmsN,
        centroidHz: d.centroidHz,
        centroidN,
        spreadHz: d.spreadHz,
        spreadKhz: d.spreadKhz,
        spreadN,
        rolloffHz: d.rolloffHz,
        rolloffN,
        flatness: d.flatness,
        flatnessN,
        zcr: d.zcr,
        zcrN,
        peakHz: d.peakHz,
        peakN,
        flux: d.flux,
        fluxN,
        featureVec: [centroidN, spreadN, rolloffN, flatnessN, zcrN, rmsN, peakN, fluxN],
        x: 0,
        y: 0,
        z: 0,
        size: 0.82 + Math.pow(rmsN, 0.68) * 4.8,
        color: { r: 120, g: 170, b: 255 },
        label: `${(d.peakHz / 1000).toFixed(2)}K`,
      });
    }
  
    applyMapping(frames, mappingMode.value);
  
    const spreadRangeKhz = {
      min: ranges.spreadHz.min / 1000,
      max: ranges.spreadHz.max / 1000,
    };
  
    const peakRangeKhz = {
      min: ranges.peakHz.min / 1000,
      max: ranges.peakHz.max / 1000,
    };
  
    const temporalEdges = buildTemporalEdges(frames);
    const knnEdges = buildKnnEdges(frames, Number(knnNeighbors.value));
  
    const map = {
      frames,
      duration: audioBuffer.duration,
      spreadRangeKhz,
      peakRangeKhz,
      temporalEdges,
      knnEdges,
    };

    applySongAwareFreqSpread(map);
  
    const metricInfo = activeMetricInfo();
    const range = metricInfo.rangeForMap(map);
  
    for (const frame of frames) {
      frame.color = colorFromMetric(metricInfo.valueForFrame(frame), range);
    }
  
    return map;
  }
  
  function getFrameIndexAtTime(currentTime) {
    if (!state.map || state.map.frames.length === 0) {
      return -1;
    }
  
    const frames = state.map.frames;
    const firstT = Number(frames[0]?.t);
    const lastT = Number(frames[frames.length - 1]?.t);
  
    if (Number.isFinite(firstT) && Number.isFinite(lastT) && lastT > firstT) {
      const targetTime = mapPlaybackTimeToAnalysisTime(currentTime, lastT);
      let low = 0;
      let high = frames.length - 1;
  
      while (low < high) {
        const mid = (low + high) >> 1;
        if (Number(frames[mid].t) < targetTime) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
  
      const right = low;
      if (right <= 0) {
        return 0;
      }
      const left = right - 1;
      const leftT = Number(frames[left].t);
      const rightT = Number(frames[right].t);
      return Math.abs(targetTime - leftT) <= Math.abs(rightT - targetTime) ? left : right;
    }
  
    const duration = state.map.duration || player.duration || 1;
    const ratio = clamp(currentTime / Math.max(EPSILON, duration), 0, 1);
    return Math.min(frames.length - 1, Math.floor(ratio * (frames.length - 1)));
  }
  
  function mapPlaybackTimeToAnalysisTime(currentTime, explicitAnalysisDuration = null) {
    const safeTime = Math.max(0, Number(currentTime) || 0);
    const playerDuration = Number(player.duration);
    let analysisDurationRaw = Number(explicitAnalysisDuration);
    if (!Number.isFinite(analysisDurationRaw) || analysisDurationRaw <= EPSILON) {
      const frames = state.map?.frames;
      if (Array.isArray(frames) && frames.length > 0) {
        analysisDurationRaw = Number(frames[frames.length - 1]?.t);
      }
    }
    if (!Number.isFinite(analysisDurationRaw) || analysisDurationRaw <= EPSILON) {
      analysisDurationRaw = Number(state.map?.duration);
    }
  
    if (
      Number.isFinite(playerDuration) &&
      playerDuration > EPSILON &&
      Number.isFinite(analysisDurationRaw) &&
      analysisDurationRaw > EPSILON
    ) {
      return clamp((safeTime / playerDuration) * analysisDurationRaw, 0, analysisDurationRaw);
    }
  
    return safeTime;
  }
  
  function getInterpolatedFrameAtTime(currentTime) {
    if (!state.map || state.map.frames.length === 0) {
      return null;
    }
  
    const frames = state.map.frames;
    if (frames.length === 1) {
      return frames[0];
    }
  
    const firstT = Number(frames[0]?.t);
    const lastT = Number(frames[frames.length - 1]?.t);
    if (!Number.isFinite(firstT) || !Number.isFinite(lastT) || lastT <= firstT) {
      const idx = getFrameIndexAtTime(currentTime);
      return idx >= 0 ? frames[idx] : null;
    }
  
    const targetTime = mapPlaybackTimeToAnalysisTime(currentTime, lastT);
    let low = 0;
    let high = frames.length - 1;
  
    while (low < high) {
      const mid = (low + high) >> 1;
      if (Number(frames[mid].t) < targetTime) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
  
    const right = Math.min(frames.length - 1, low);
    if (right <= 0) {
      return frames[0];
    }
  
    const left = right - 1;
    const leftFrame = frames[left];
    const rightFrame = frames[right];
    const leftT = Number(leftFrame.t);
    const rightT = Number(rightFrame.t);
    const span = Math.max(EPSILON, rightT - leftT);
    const mix = clamp((targetTime - leftT) / span, 0, 1);
  
    return {
      peakN: lerp(leftFrame.peakN, rightFrame.peakN, mix),
      centroidN: lerp(leftFrame.centroidN, rightFrame.centroidN, mix),
    };
  }
  
  function activityForIndex(index, activeIndex, width) {
    if (activeIndex < 0) {
      return 0;
    }
  
    const dist = Math.abs(index - activeIndex);
    if (dist > width * 3.1) {
      return 0;
    }
  
    const x = dist / Math.max(1, width);
    return Math.exp(-(x * x) * 1.48);
  }
  
  function liveFrequencyFactor(frame) {
    if (!frame) {
      return 0;
    }
  
    return clamp(frame.peakN * 0.74 + frame.centroidN * 0.26, 0, 1);
  }
  
  function edgeFrequencyFactor(frameA, frameB, activeFrame, edgeActivity) {
    const base =
      frameA && frameB
        ? clamp((frameA.peakN + frameB.peakN + frameA.centroidN + frameB.centroidN) * 0.25, 0, 1)
        : 0;
  
    if (!activeFrame) {
      return base;
    }
  
    const live = liveFrequencyFactor(activeFrame);
    const syncMix = clamp(edgeActivity * 1.4, 0, 1);
    return lerp(base, live, syncMix);
  }
  
  function sampleFrameAt(indexFloat) {
    if (!state.map || state.map.frames.length === 0) {
      return null;
    }
  
    const maxIndex = state.map.frames.length - 1;
    const clamped = clamp(indexFloat, 0, maxIndex);
    const i0 = Math.floor(clamped);
    const i1 = Math.min(maxIndex, i0 + 1);
    const t = clamped - i0;
  
    const a = state.map.frames[i0];
    const b = state.map.frames[i1];
  
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
      volume: lerp(a.rmsN, b.rmsN, t),
      flux: lerp(a.fluxN, b.fluxN, t),
      color: mixColor(a.color, b.color, t),
    };
  }
  
  function rebuildKnnEdges() {
    if (!state.map) {
      return;
    }
    setSessionLabel("Linking", true);
    state.map.knnEdges = buildKnnEdges(state.map.frames, Number(knnNeighbors.value));
    setSessionLabel(player.paused ? "Ready" : "Live", !player.paused);
  }
  
  function remapFrames() {
    if (!state.map) {
      return;
    }
  
    applyMapping(state.map.frames, mappingMode.value);
    applySongAwareFreqSpread(state.map);
    state.trail = [];
    state.lastTrailIndex = -1;
    state.trailVelocity = 0;
    state.activationPulse.clear();
  }

  return {
    getDecodeContext,
    computeRanges,
    buildTemporalEdges,
    buildKnnEdges,
    applyMapping,
    applySongAwareFreqSpread,
    activePalette,
    colorFromMetric,
    activeMetricInfo,
    clearCustomPalette,
    updateLegend,
    readCurrentControlSettings,
    applyControlSettings,
    refreshCustomPresetOptions,
    saveCurrentSettingsAsCustomPreset,
    applyCustomPresetByName,
    deleteCustomPresetByName,
    recolorFrames,
    loadCustomPaletteFromFile,
    analyzeSong,
    getFrameIndexAtTime,
    mapPlaybackTimeToAnalysisTime,
    getInterpolatedFrameAtTime,
    activityForIndex,
    edgeFrequencyFactor,
    sampleFrameAt,
    rebuildKnnEdges,
    remapFrames,
  };
}
