// Always-on song readout and the waveform scrubber strip.
//
// The Math HUD is a hidden table for when you want every number to four
// decimal places. This is the opposite: a permanently visible, deliberately
// quiet summary that answers "where am I in this song, and what is it doing
// right now" without opening anything.
//
// Estimates that could be wrong are labelled as such. Tempo and key both carry
// a confidence from the analyser, and below the threshold the readout says so
// rather than printing a plausible-looking number the user would trust.

const HUD_VISIBLE_KEY = "sgm.song-hud-visible";
const WAVEFORM_VISIBLE_KEY = "sgm.waveform-strip-visible";

// Below these, an estimate is not worth showing as fact.
const TEMPO_CONFIDENCE_MIN = 0.18;
const KEY_CONFIDENCE_MIN = 0.12;

/**
 * What each spatial axis means, per mapping mode. This is the answer to "why
 * is this node here" at the whole-cloud level; the node inspector answers it
 * for one frame. Kept in step with applyMapping() in analysis-module.js.
 */
export const AXIS_SEMANTICS = {
  manifold: {
    x: "PCA 1 - the strongest axis of variation across all eight descriptors",
    y: "PCA 2, nudged by loudness",
    z: "PCA 3, nudged by spectral flux",
    summary: "Similar-sounding frames sit near each other; distance means timbral difference, not time.",
  },
  time: {
    x: "Elapsed time, start to finish",
    y: "Peak frequency, lifted by spectral centroid",
    z: "Spectral spread, tonality, loudness and flux combined",
    summary: "A chronological spine: left to right is the song in order, height is pitch, depth is texture.",
  },
  hybrid: {
    x: "Time bent into an arc, blended 62% toward PCA 1",
    y: "Time blended 46% toward PCA 2, lifted by tonality",
    z: "Arc depth blended toward PCA 3, offset by peak frequency",
    summary: "Chronology you can still follow, pulled toward structural clusters so repeats bend back together.",
  },
  helix: {
    x: "Cosine of the timeline angle, radius set by spread and loudness",
    y: "Elapsed time along the spiral axis",
    z: "Sine of the timeline angle",
    summary: "The timeline wound into a spiral, so one turn is a fixed span and loud wide passages bulge outward.",
  },
};

export function createHudModule(runtime) {
  const {
    state,
    player,
    mappingMode,
    clamp,
    lerp,
    rgba,
    getFrameIndexAtTime,
    activeMetricInfo,
    colorFromMetric,
  } = runtime;

  const songHud = document.getElementById("song-hud");
  const hudElapsed = document.getElementById("hud-elapsed");
  const hudTotal = document.getElementById("hud-total");
  const hudRate = document.getElementById("hud-rate");
  const hudPercent = document.getElementById("hud-percent");
  const hudFrame = document.getElementById("hud-frame");
  const hudTempo = document.getElementById("hud-tempo");
  const hudKey = document.getElementById("hud-key");
  const hudAxes = document.getElementById("hud-axes");
  const hudMeter = document.getElementById("hud-meter");
  const hudMeterCtx = hudMeter ? hudMeter.getContext("2d") : null;

  const waveformStrip = document.getElementById("waveform-strip");
  const waveformCanvas = document.getElementById("waveform-canvas");
  const waveformCtx = waveformCanvas ? waveformCanvas.getContext("2d") : null;
  const waveformReadout = document.getElementById("waveform-readout");

  const toggleSongHudBtn = document.getElementById("toggle-song-hud");
  const toggleWaveformBtn = document.getElementById("toggle-waveform-strip");

  // Smoothed band levels. The raw per-frame ratios are jumpy enough to be
  // unreadable as bars, and they advance on the audio clock so the meter
  // freezes when you pause to inspect a moment.
  const bandLevels = [0, 0, 0];
  const bandPeaks = [0, 0, 0];

  // The strip's colour ramp only changes when the metric, palette or map
  // changes, so it is rendered once into an offscreen canvas rather than
  // 1600 gradient stops per frame.
  let waveformCache = null;
  let waveformCacheKey = "";

  let lastHudUpdateMs = 0;

  function readStored(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : raw === "1";
    } catch {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, value ? "1" : "0");
    } catch {
      // Private-mode storage failures must not break the overlay.
    }
  }

  function formatClock(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total < 0) {
      return "0:00";
    }
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function setSongHudVisible(visible) {
    if (!songHud) {
      return;
    }
    songHud.classList.toggle("is-hidden", !visible);
    if (toggleSongHudBtn) {
      toggleSongHudBtn.setAttribute("aria-pressed", String(visible));
    }
    writeStored(HUD_VISIBLE_KEY, visible);
  }

  function setWaveformVisible(visible) {
    if (!waveformStrip) {
      return;
    }
    waveformStrip.classList.toggle("is-hidden", !visible);
    if (toggleWaveformBtn) {
      toggleWaveformBtn.setAttribute("aria-pressed", String(visible));
    }
    writeStored(WAVEFORM_VISIBLE_KEY, visible);
  }

  function songHudVisible() {
    return Boolean(songHud) && !songHud.classList.contains("is-hidden") && !document.body.classList.contains("focus-mode");
  }

  function waveformVisible() {
    return (
      Boolean(waveformStrip) &&
      !waveformStrip.classList.contains("is-hidden") &&
      !document.body.classList.contains("focus-mode")
    );
  }

  /** Describes the axis meaning of the active mapping mode. */
  function axisSemantics() {
    return AXIS_SEMANTICS[mappingMode?.value] || AXIS_SEMANTICS.time;
  }

  function drawBandMeter(frame, profile) {
    if (!hudMeterCtx || !hudMeter) {
      return;
    }

    const width = hudMeter.width;
    const height = hudMeter.height;
    hudMeterCtx.clearRect(0, 0, width, height);

    const labels = ["LOW", "MID", "HIGH"];
    const tints = [
      { r: 92, g: 140, b: 255 },
      { r: 120, g: 226, b: 168 },
      { r: 255, g: 196, b: 104 },
    ];

    const gap = 10;
    const barWidth = (width - gap * 2) / 3;
    const top = 14;
    const bottom = height - 16;
    const span = bottom - top;

    for (let i = 0; i < 3; i += 1) {
      const x = i * (barWidth + gap);
      const level = clamp(bandLevels[i], 0, 1);
      const peak = clamp(bandPeaks[i], 0, 1);

      hudMeterCtx.fillStyle = "rgba(255, 255, 255, 0.07)";
      hudMeterCtx.fillRect(x, top, barWidth, span);

      const barHeight = span * level;
      const gradient = hudMeterCtx.createLinearGradient(0, bottom, 0, bottom - barHeight);
      gradient.addColorStop(0, rgba(tints[i], "0.30"));
      gradient.addColorStop(1, rgba(tints[i], "0.92"));
      hudMeterCtx.fillStyle = gradient;
      hudMeterCtx.fillRect(x, bottom - barHeight, barWidth, barHeight);

      // Peak hold, so a transient that is gone before the next repaint still
      // leaves a mark you can read.
      const peakY = bottom - span * peak;
      hudMeterCtx.fillStyle = rgba(tints[i], "0.85");
      hudMeterCtx.fillRect(x, peakY - 1.5, barWidth, 1.5);

      hudMeterCtx.font = "600 15px 'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace";
      hudMeterCtx.textAlign = "center";
      hudMeterCtx.fillStyle = "rgba(160, 182, 206, 0.85)";
      hudMeterCtx.fillText(labels[i], x + barWidth / 2, height - 3);
    }

    // A faint mid-line marks "average for this song", which is what the bars
    // are normalised against, so 50% reads as "typical" rather than "quiet".
    if (profile) {
      hudMeterCtx.strokeStyle = "rgba(255, 255, 255, 0.13)";
      hudMeterCtx.lineWidth = 1;
      hudMeterCtx.beginPath();
      hudMeterCtx.moveTo(0, bottom - span * 0.5);
      hudMeterCtx.lineTo(width, bottom - span * 0.5);
      hudMeterCtx.stroke();
    }

    if (!frame) {
      hudMeterCtx.font = "13px 'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace";
      hudMeterCtx.textAlign = "center";
      hudMeterCtx.fillStyle = "rgba(150, 170, 195, 0.6)";
      hudMeterCtx.fillText("no song loaded", width / 2, top + span * 0.5);
    }
  }

  /**
   * Refreshes the readout. Throttled to ~12 Hz for the DOM text, because
   * rewriting six text nodes every frame is pure layout churn for numbers
   * nobody can read that fast; the canvas meter still updates every frame.
   */
  function updateSongHud(nowMs) {
    if (!songHudVisible()) {
      return;
    }

    const map = state.map;
    const profile = map?.songProfile || null;
    const frames = map?.frames || null;

    // Band levels advance on the audio clock so a paused transport freezes the
    // meter for inspection, matching the trail's behaviour.
    const frameIndex = frames && player.src ? getFrameIndexAtTime(player.currentTime) : -1;
    const frame = frameIndex >= 0 ? frames[frameIndex] : null;

    if (frame && profile) {
      const targets = [
        frame.bandLow / Math.max(1e-6, profile.bandLow * 2),
        frame.bandMid / Math.max(1e-6, profile.bandMid * 2),
        frame.bandHigh / Math.max(1e-6, profile.bandHigh * 2),
      ];
      const ease = player.paused ? 1 : 0.28;
      for (let i = 0; i < 3; i += 1) {
        bandLevels[i] = lerp(bandLevels[i], clamp(targets[i], 0, 1), ease);
        bandPeaks[i] = Math.max(bandPeaks[i] * 0.982, bandLevels[i]);
      }
    }

    drawBandMeter(frame, profile);

    if (nowMs - lastHudUpdateMs < 80) {
      return;
    }
    lastHudUpdateMs = nowMs;

    const duration = Number(map?.duration) || Number(player.duration) || 0;
    const elapsed = Number(player.currentTime) || 0;

    if (hudElapsed) hudElapsed.textContent = formatClock(elapsed);
    if (hudTotal) hudTotal.textContent = `/ ${formatClock(duration)}`;
    if (hudRate) hudRate.textContent = `${(state.playbackRate || 1).toFixed(2)}x`;
    if (hudPercent) {
      hudPercent.textContent = duration > 0 ? `${Math.round((elapsed / duration) * 100)}%` : "0%";
    }
    if (hudFrame) {
      hudFrame.textContent = frames ? `${Math.max(0, frameIndex) + 1} / ${frames.length}` : "-";
    }

    if (hudTempo) {
      const confident = profile && profile.tempoBpm && profile.tempoConfidence >= TEMPO_CONFIDENCE_MIN;
      if (confident) {
        hudTempo.textContent = `${Math.round(profile.tempoBpm)} BPM`;
        hudTempo.classList.remove("is-uncertain");
        hudTempo.title = `Autocorrelation of the spectral-flux onset envelope. Confidence ${(profile.tempoConfidence * 100).toFixed(0)}%.`;
      } else {
        hudTempo.textContent = profile ? "Tempo unclear" : "Tempo -";
        hudTempo.classList.add("is-uncertain");
        hudTempo.title = "The onset envelope has no strong periodicity, so no tempo is claimed.";
      }
    }

    if (hudKey) {
      const confident = profile && profile.key && profile.keyConfidence >= KEY_CONFIDENCE_MIN;
      if (confident) {
        hudKey.textContent = profile.key;
        hudKey.classList.remove("is-uncertain");
        hudKey.title = `Krumhansl-Schmuckler correlation over the song's chroma. Confidence ${(profile.keyConfidence * 100).toFixed(0)}%.`;
      } else {
        hudKey.textContent = profile ? "Key unclear" : "Key -";
        hudKey.classList.add("is-uncertain");
        hudKey.title = "No pitch class stands out enough to name a key.";
      }
    }

    if (hudAxes) {
      const axes = axisSemantics();
      hudAxes.textContent = axes.summary;
      hudAxes.title = `X: ${axes.x}\nY: ${axes.y}\nZ: ${axes.z}`;
    }
  }

  /** Colour ramp cache key: anything that changes the strip's colours. */
  function waveformKey() {
    const metric = activeMetricInfo();
    return [
      state.map?.frames?.length || 0,
      metric.key || "",
      state.customPaletteStops ? "custom" : "builtin",
      waveformCanvas?.width || 0,
      state.map?.waveformPeaks ? "peaks" : "rms",
    ].join("|");
  }

  /**
   * Peak envelope for the strip.
   *
   * Browser analysis keeps a sample-level peak envelope. Backend and imported
   * JSON maps only carry frame descriptors, so fall back to the per-frame RMS
   * envelope - coarser, but it is a real loudness curve rather than a
   * decoration, and it keeps the scrubber working for every load path.
   */
  function waveformSource() {
    const map = state.map;
    if (!map) {
      return null;
    }
    if (map.waveformPeaks && map.waveformPeaks.length > 0) {
      return map.waveformPeaks;
    }
    if (!Array.isArray(map.frames) || map.frames.length === 0) {
      return null;
    }
    if (!map.rmsEnvelope) {
      let peak = 0;
      for (const frame of map.frames) {
        if (frame.rms > peak) {
          peak = frame.rms;
        }
      }
      const inv = peak > 0 ? 1 / peak : 0;
      const envelope = new Float32Array(map.frames.length);
      for (let i = 0; i < map.frames.length; i += 1) {
        envelope[i] = map.frames[i].rms * inv;
      }
      map.rmsEnvelope = envelope;
    }
    return map.rmsEnvelope;
  }

  function rebuildWaveformCache() {
    const peaks = waveformSource();
    if (!waveformCanvas || !peaks) {
      waveformCache = null;
      return;
    }

    const frames = state.map.frames;
    const width = waveformCanvas.width;
    const height = waveformCanvas.height;

    const cache = document.createElement("canvas");
    cache.width = width;
    cache.height = height;
    const cctx = cache.getContext("2d");

    const metric = activeMetricInfo();
    const range = metric.rangeForMap(state.map);
    const mid = height * 0.55;

    for (let x = 0; x < width; x += 1) {
      const t = x / Math.max(1, width - 1);
      const peak = peaks[Math.min(peaks.length - 1, Math.floor(t * peaks.length))] || 0;
      // Colour the strip with the same metric that colours the cloud, so a
      // section that looks orange up here is the orange region down there.
      const frame = frames[Math.min(frames.length - 1, Math.floor(t * frames.length))];
      const color = frame ? colorFromMetric(metric.valueForFrame(frame), range) : { r: 120, g: 150, b: 200 };

      const amplitude = Math.pow(clamp(peak, 0, 1), 0.62) * (height * 0.44);
      cctx.strokeStyle = rgba(color, "0.72");
      cctx.lineWidth = 1;
      cctx.beginPath();
      cctx.moveTo(x + 0.5, mid - amplitude);
      cctx.lineTo(x + 0.5, mid + amplitude);
      cctx.stroke();
    }

    waveformCache = cache;
  }

  function drawWaveformStrip() {
    if (!waveformVisible() || !waveformCtx || !waveformCanvas) {
      return;
    }

    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    waveformCtx.clearRect(0, 0, width, height);

    if (!waveformSource()) {
      return;
    }

    const key = waveformKey();
    if (key !== waveformCacheKey || !waveformCache) {
      rebuildWaveformCache();
      waveformCacheKey = key;
    }
    if (waveformCache) {
      waveformCtx.drawImage(waveformCache, 0, 0);
    }

    const duration = Number(state.map.duration) || Number(player.duration) || 0;
    if (duration <= 0) {
      return;
    }

    const progress = clamp((Number(player.currentTime) || 0) / duration, 0, 1);
    const px = progress * width;

    // Dim what has not played yet, so the strip doubles as a progress bar.
    waveformCtx.fillStyle = "rgba(4, 8, 14, 0.5)";
    waveformCtx.fillRect(px, 0, width - px, height);

    waveformCtx.strokeStyle = "rgba(180, 232, 255, 0.95)";
    waveformCtx.lineWidth = 2;
    waveformCtx.beginPath();
    waveformCtx.moveTo(px, 0);
    waveformCtx.lineTo(px, height);
    waveformCtx.stroke();

    if (waveformReadout) {
      waveformReadout.textContent = `${formatClock(player.currentTime)} / ${formatClock(duration)}`;
    }
  }

  function seekFromPointer(event) {
    if (!waveformStrip || !player.src) {
      return;
    }
    const duration = Number(state.map?.duration) || Number(player.duration) || 0;
    if (duration <= 0) {
      return;
    }
    const rect = waveformStrip.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    player.currentTime = ratio * duration;
  }

  function resizeWaveformCanvas() {
    if (!waveformCanvas || !waveformStrip) {
      return;
    }
    const rect = waveformStrip.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.max(320, Math.floor(rect.width * dpr));
    const height = Math.max(32, Math.floor(rect.height * dpr));
    if (waveformCanvas.width !== width || waveformCanvas.height !== height) {
      waveformCanvas.width = width;
      waveformCanvas.height = height;
      waveformCache = null;
      waveformCacheKey = "";
    }
  }

  function initSongHud() {
    setSongHudVisible(readStored(HUD_VISIBLE_KEY, true));
    setWaveformVisible(readStored(WAVEFORM_VISIBLE_KEY, true));
    resizeWaveformCanvas();

    if (toggleSongHudBtn) {
      toggleSongHudBtn.addEventListener("click", () => {
        setSongHudVisible(songHud.classList.contains("is-hidden"));
      });
    }
    if (toggleWaveformBtn) {
      toggleWaveformBtn.addEventListener("click", () => {
        setWaveformVisible(waveformStrip.classList.contains("is-hidden"));
        resizeWaveformCanvas();
      });
    }

    if (waveformStrip) {
      let scrubbing = false;
      waveformStrip.addEventListener("pointerdown", (event) => {
        scrubbing = true;
        waveformStrip.setPointerCapture(event.pointerId);
        seekFromPointer(event);
      });
      waveformStrip.addEventListener("pointermove", (event) => {
        if (scrubbing) {
          seekFromPointer(event);
        }
      });
      const endScrub = (event) => {
        if (!scrubbing) {
          return;
        }
        scrubbing = false;
        if (waveformStrip.hasPointerCapture(event.pointerId)) {
          waveformStrip.releasePointerCapture(event.pointerId);
        }
      };
      waveformStrip.addEventListener("pointerup", endScrub);
      waveformStrip.addEventListener("pointercancel", endScrub);
    }

    window.addEventListener("resize", resizeWaveformCanvas);
  }

  const nodeInspector = document.getElementById("node-inspector");
  let lastInspectorIndex = -2;

  function formatHz(hz) {
    const value = Number(hz);
    if (!Number.isFinite(value) || value <= 0) {
      return "-";
    }
    return value >= 1000 ? `${(value / 1000).toFixed(2)} kHz` : `${Math.round(value)} Hz`;
  }

  function formatDbfs(rms) {
    const value = Number(rms);
    if (!Number.isFinite(value) || value <= 0) {
      return "-inf dB";
    }
    return `${(20 * Math.log10(value)).toFixed(1)} dB`;
  }

  /**
   * Explains this specific node's placement with its own numbers.
   *
   * The axis summary in the HUD says what each axis means in general; this says
   * what put *this* frame at *this* coordinate, which is the question people
   * actually ask when they see a point sitting out on its own.
   */
  function describeNodePosition(frame) {
    const mode = mappingMode?.value || "time";
    const pct = (value) => `${Math.round(clamp(value, 0, 1) * 100)}%`;

    if ((mode === "manifold" || mode === "hybrid") && Array.isArray(frame.pca)) {
      const [c0, c1, c2] = frame.pca;
      const blend = mode === "hybrid" ? " blended with its position in time" : "";
      return (
        `<b>X</b> ${pct(c0)} along PCA 1, <b>Y</b> ${pct(c1)} along PCA 2, ` +
        `<b>Z</b> ${pct(c2)} along PCA 3${blend}. ` +
        `PCA axes are the directions in which this song's eight descriptors vary most, ` +
        `so neighbours here sound alike.`
      );
    }

    if (mode === "helix") {
      return (
        `<b>Y</b> is elapsed time along the spiral. <b>X</b> and <b>Z</b> are the ` +
        `angle at this moment, at a radius set by spectral spread (${pct(frame.spreadN)}) ` +
        `and loudness (${pct(frame.rmsN)}) - louder, wider passages bulge outward.`
      );
    }

    return (
      `<b>X</b> is elapsed time. <b>Y</b> is peak frequency ${formatHz(frame.peakHz)} ` +
      `(${pct(frame.peakN)} of this song's range) lifted by centroid. <b>Z</b> combines ` +
      `spread ${pct(frame.spreadN)}, tonality ${pct(1 - frame.flatnessN)}, ` +
      `loudness ${pct(frame.rmsN)} and flux ${pct(frame.fluxN)}.`
    );
  }

  function hideNodeInspector() {
    if (nodeInspector && lastInspectorIndex !== -1) {
      nodeInspector.classList.remove("is-visible");
      lastInspectorIndex = -1;
    }
  }

  /** Renders the hovered node's card and keeps it inside the viewport. */
  function updateNodeInspector() {
    if (!nodeInspector) {
      return;
    }

    const hover = state.hoverNode;
    if (!hover || document.body.classList.contains("focus-mode")) {
      hideNodeInspector();
      return;
    }

    const frame = hover.frame;
    if (hover.index !== lastInspectorIndex) {
      lastInspectorIndex = hover.index;
      const color = frame.color;
      nodeInspector.innerHTML = `
        <div class="node-inspector-head">
          <span class="node-inspector-swatch" style="background: rgb(${color.r}, ${color.g}, ${color.b})"></span>
          <span class="node-inspector-time">${formatClock(frame.t)}</span>
          <span class="node-inspector-index">frame ${hover.index + 1}</span>
        </div>
        <div class="node-inspector-grid">
          <div><span>RMS</span><strong>${formatDbfs(frame.rms)}</strong></div>
          <div><span>Peak</span><strong>${formatHz(frame.peakHz)}</strong></div>
          <div><span>Centroid</span><strong>${formatHz(frame.centroidHz)}</strong></div>
          <div><span>Spread</span><strong>${formatHz(frame.spreadHz)}</strong></div>
          <div><span>Rolloff</span><strong>${formatHz(frame.rolloffHz)}</strong></div>
          <div><span>Flux</span><strong>${frame.flux.toFixed(4)}</strong></div>
          <div><span>Flatness</span><strong>${frame.flatness.toFixed(3)}</strong></div>
          <div><span>ZCR</span><strong>${frame.zcr.toFixed(3)}</strong></div>
        </div>
        <div class="node-inspector-why">${describeNodePosition(frame)}</div>
      `;
      nodeInspector.classList.add("is-visible");
    }

    // Position beside the pointer, flipping near an edge so the card is never
    // clipped and never sits under the cursor.
    const dpr = Math.max(1, state.dpr || 1);
    const canvasRect = runtime.canvas.getBoundingClientRect();
    const pointerClientX = canvasRect.left + state.pointerX / dpr;
    const pointerClientY = canvasRect.top + state.pointerY / dpr;
    const rect = nodeInspector.getBoundingClientRect();
    const gap = 16;

    let left = pointerClientX + gap;
    if (left + rect.width > window.innerWidth - gap) {
      left = pointerClientX - rect.width - gap;
    }
    let top = pointerClientY - rect.height / 2;
    top = Math.max(gap, Math.min(top, window.innerHeight - rect.height - gap));

    nodeInspector.style.left = `${Math.round(Math.max(gap, left))}px`;
    nodeInspector.style.top = `${Math.round(top)}px`;
  }

  /** Discards the cached colour ramp; call when the map or palette changes. */
  function invalidateWaveformCache() {
    waveformCache = null;
    waveformCacheKey = "";
  }

  return {
    initSongHud,
    updateSongHud,
    updateNodeInspector,
    drawWaveformStrip,
    invalidateWaveformCache,
    describeNodePosition,
    axisSemantics,
    formatClock,
  };
}
