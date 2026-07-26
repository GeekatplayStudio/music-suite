import { createRuntime } from "./app/runtime.js";
import { createAnalysisModule } from "./app/analysis-module.js";
import { createRenderModule } from "./app/render-module.js";
import { createWorkflowModule } from "./app/workflow-module.js";
import { decorateControls, initTooltips } from "./app/tooltips.js";

const runtime = createRuntime();
Object.assign(runtime, createAnalysisModule(runtime));
Object.assign(runtime, createRenderModule(runtime));
Object.assign(runtime, createWorkflowModule(runtime));

const {
  canvas,
  fileInput,
  fileLabel,
  player,
  playToggle,
  pauseAudioBtn,
  resetViewBtn,
  playbackSpeed,
  playbackSpeedValue,
  preservePitch,
  speedChips,
  drawerToggle,
  tabButtons,
  mappingMode,
  autoFreqSpread,
  cameraPreset,
  dragMode,
  knnNeighbors,
  freqSpread,
  freqSpreadValue,
  visualPreset,
  customPresetSelect,
  customPresetName,
  saveCustomPresetBtn,
  deleteCustomPresetBtn,
  colorMetric,
  paletteSaturation,
  paletteSaturationValue,
  paletteFile,
  clearPaletteBtn,
  captureStillBtn,
  exportAnalysisJsonBtn,
  export3dObjBtn,
  startRecordingBtn,
  stopRecordingBtn,
  copyMp4CommandBtn,
  helpBtn,
  supportVladBtn,
  focusToggleBtn,
  helpModal,
  closeHelpBtn,
  voiceAnalysisCacheClearBtn,
  voiceCacheStatus,
  offsetX,
  offsetY,
  offsetZ,
  valOffsetX,
  valOffsetY,
  valOffsetZ,
  metricRms,
  metricCentroid,
  metricSpread,
  VOICE_API_BASE,
  state,
  clamp,
  setSessionLabel,
  resizeCanvas,
  createStars,
  refreshCustomPresetOptions,
  recolorFrames,
  readCurrentControlSettings,
  applyControlSettings,
  loadCustomPaletteFromFile,
  clearCustomPalette,
  applyCustomPresetByName,
  saveCurrentSettingsAsCustomPreset,
  deleteCustomPresetByName,
  rebuildKnnEdges,
  remapFrames,
  applySongAwareFreqSpread,
  loadAnalysisJson,
  loadAndAnalyzeFile,
  handlePlaybackToggle,
  pausePlayback,
  setActiveTab,
  exportAnalysisJson,
  exportVisible3dObj,
  captureStill,
  startRecording,
  stopRecording,
  copyMp4ConversionCommand,
  toggleDrawer,
  resetCamera,
  updateCameraMotion,
  drawBackground,
  updateTrail,
  drawTrail,
  drawMap,
  updateLegend,
  getFrameIndexAtTime,
  FFT_SIZE,
  HOP_SIZE,
} = runtime;

const BUILTIN_VISUAL_PROFILES = {
  observatory: {
    "observatory-overlay": true,
    "cathedral-overlay": false,
    "camera-preset": "drift",
    "edge-style": "line",
    "edge-opacity": "0.39",
    "edge-brightness": "1.2",
    "edge-width-boost": "0.94",
    "edge-solidness": "0.58",
    "trail-persistence": "0.9",
    "trail-flare": "0.42",
    "flow-density": "0.22",
    "show-flow-arrows": false,
    "motion-strength": "0.8",
    "motion-blur": "0.14",
    "rotation-speed": "0.045",
    "pulse-strength": "0.9",
    "node-hit-pulse": "1.0",
    "point-scale": "1.82",
    "point-opacity": "0.66",
    "point-solidness": "0.56",
    "point-depth": "1.05",
    "bloom-strength": "0.42",
    "glow-intensity": "0.48",
    "glow-threshold": "0.22",
    "glow-shift": "0.28",
    "glow-decay": "1.02",
    "fog-strength": "0.28",
    "lens-flare-strength": "0.16",
    "lens-streak-strength": "0.12",
    "color-metric": "centroid",
    "palette-saturation": "0.94",
    "show-connections": true,
    "show-labels": true,
    "cinema-mode": true,
  },
  cathedral: {
    "observatory-overlay": false,
    "cathedral-overlay": true,
    "camera-preset": "orbit",
    "edge-style": "ribbon",
    "edge-opacity": "0.44",
    "edge-brightness": "1.16",
    "edge-width-boost": "1.12",
    "edge-ribbon-softness": "0.74",
    "edge-ribbon-wave-speed": "0.76",
    "edge-ribbon-flexibility": "0.86",
    "edge-solidness": "0.68",
    "trail-persistence": "0.94",
    "trail-flare": "0.96",
    "flow-density": "0.34",
    "show-flow-arrows": false,
    "motion-strength": "0.92",
    "motion-blur": "0.18",
    "rotation-speed": "0.13",
    "pulse-strength": "1.08",
    "node-hit-pulse": "1.22",
    "point-scale": "1.96",
    "point-opacity": "0.69",
    "point-solidness": "0.62",
    "point-depth": "1.09",
    "bloom-strength": "0.6",
    "glow-intensity": "0.66",
    "glow-threshold": "0.18",
    "glow-shift": "0.36",
    "glow-decay": "1.16",
    "fog-strength": "0.48",
    "lens-flare-strength": "0.26",
    "lens-streak-strength": "0.2",
    "color-metric": "tonality",
    "palette-saturation": "1.02",
    "show-connections": true,
    "show-labels": false,
    "cinema-mode": true,
  },
};

const BUILTIN_VISUAL_PROFILE_KEYS = [...new Set(
  Object.values(BUILTIN_VISUAL_PROFILES).flatMap((profile) => Object.keys(profile)),
)];

let activeBuiltinVisualProfile = null;
let builtinVisualProfileSnapshot = null;

const mathPanelEls = {
  toggleBtn: document.getElementById("toggle-math-panel"),
  panel: document.getElementById("math-panel"),
  closeBtn: document.getElementById("close-math-panel"),
  fileName: document.getElementById("math-file-name"),
  fileType: document.getElementById("math-file-type"),
  fileSize: document.getElementById("math-file-size"),
  fileDuration: document.getElementById("math-file-duration"),
  fileBitrate: document.getElementById("math-file-bitrate"),
  fileRange: document.getElementById("math-file-range"),
  engine: document.getElementById("math-engine"),
  toolchain: document.getElementById("math-toolchain"),
  aiGenerated: document.getElementById("math-ai-generated"),
  fftHop: document.getElementById("math-fft-hop"),
  window: document.getElementById("math-window"),
  sampleRate: document.getElementById("math-sample-rate"),
  channels: document.getElementById("math-channels"),
  frames: document.getElementById("math-frames"),
  fps: document.getElementById("math-fps"),
  descriptors: document.getElementById("math-descriptors"),
  livePlayback: document.getElementById("math-live-playback"),
  liveIndex: document.getElementById("math-live-index"),
  liveRmsDb: document.getElementById("math-live-rms-db"),
  liveCentroid: document.getElementById("math-live-centroid"),
  liveSpread: document.getElementById("math-live-spread"),
  liveRolloff: document.getElementById("math-live-rolloff"),
  livePeak: document.getElementById("math-live-peak"),
  liveFlux: document.getElementById("math-live-flux"),
  liveFlatness: document.getElementById("math-live-flatness"),
  liveZcr: document.getElementById("math-live-zcr"),
  liveTonality: document.getElementById("math-live-tonality"),
  liveBandwidthRatio: document.getElementById("math-live-bw-ratio"),
};

let lastMathPanelUpdateAtMs = 0;

function setMathField(el, value) {
  if (!el) {
    return;
  }
  el.textContent = value;
}

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatBytes(bytesValue) {
  const bytes = toFiniteOrNull(bytesValue);
  if (!bytes || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatSeconds(secondsValue) {
  const seconds = toFiniteOrNull(secondsValue);
  if (!seconds || seconds < 0) {
    return "-";
  }
  return `${seconds.toFixed(2)} s`;
}

function formatHz(hzValue) {
  const hz = toFiniteOrNull(hzValue);
  if (!hz || hz <= 0) {
    return "-";
  }
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(2)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

function formatBitrate(bpsValue) {
  const bps = toFiniteOrNull(bpsValue);
  if (!bps || bps <= 0) {
    return "-";
  }
  return `${(bps / 1000).toFixed(1)} kbps (${Math.round(bps)} bps)`;
}

function formatDbfs(rmsValue) {
  const rms = toFiniteOrNull(rmsValue);
  if (!rms || rms <= 0) {
    return "-inf dBFS";
  }
  const db = 20 * Math.log10(Math.max(1e-12, rms));
  return `${db.toFixed(1)} dBFS`;
}

function estimateBitrateBps(sizeBytes, durationSec) {
  const size = toFiniteOrNull(sizeBytes);
  const duration = toFiniteOrNull(durationSec);
  if (!size || !duration || size <= 0 || duration <= 0) {
    return null;
  }
  return (size * 8) / duration;
}

function setMathPanelVisible(show) {
  if (!mathPanelEls.panel) {
    return;
  }

  const visible = Boolean(show);
  mathPanelEls.panel.classList.toggle("is-hidden", !visible);
  mathPanelEls.panel.setAttribute("aria-hidden", String(!visible));

  if (mathPanelEls.toggleBtn) {
    mathPanelEls.toggleBtn.textContent = visible ? "Hide Math" : "Math HUD";
    mathPanelEls.toggleBtn.setAttribute("aria-pressed", String(visible));
  }
}

function getActiveFrameForMath() {
  if (!state.map || !Array.isArray(state.map.frames) || state.map.frames.length === 0) {
    return { frame: null, index: -1 };
  }

  let index = -1;
  if (player && player.src) {
    index = getFrameIndexAtTime(player.currentTime);
  }
  if (!Number.isInteger(index) || index < 0 || index >= state.map.frames.length) {
    index = 0;
  }

  return {
    frame: state.map.frames[index] || null,
    index,
  };
}

function updateMathPanel(nowMs, force = false) {
  if (!mathPanelEls.panel || mathPanelEls.panel.classList.contains("is-hidden")) {
    return;
  }

  if (!force && nowMs - lastMathPanelUpdateAtMs < 120) {
    return;
  }
  lastMathPanelUpdateAtMs = nowMs;

  const map = state.map;
  const analysisInfo = map && map.analysisInfo && typeof map.analysisInfo === "object" ? map.analysisInfo : null;
  const sourceInfo = state.sourceFileInfo && typeof state.sourceFileInfo === "object" ? state.sourceFileInfo : null;

  const durationSecRaw = map ? toFiniteOrNull(map.duration) : null;
  const playerDuration = player ? toFiniteOrNull(player.duration) : null;
  const durationSec = durationSecRaw && durationSecRaw > 0 ? durationSecRaw : playerDuration;

  const bitrateFromAnalysis = analysisInfo ? toFiniteOrNull(analysisInfo.estimatedBitrateBps) : null;
  const bitrateFallback = estimateBitrateBps(sourceInfo ? sourceInfo.sizeBytes : null, durationSec);
  const bitrateBps = bitrateFromAnalysis && bitrateFromAnalysis > 0 ? bitrateFromAnalysis : bitrateFallback;

  const sampleRateHz = analysisInfo ? toFiniteOrNull(analysisInfo.sampleRateHz) : null;
  const nyquistHzFromInfo = analysisInfo ? toFiniteOrNull(analysisInfo.nyquistHz) : null;
  const nyquistHz = nyquistHzFromInfo && nyquistHzFromInfo > 0 ? nyquistHzFromInfo : sampleRateHz ? sampleRateHz * 0.5 : null;

  const sourceLowHz = analysisInfo && toFiniteOrNull(analysisInfo.sourceLowHz) ? Number(analysisInfo.sourceLowHz) : 20;
  const sourceHighHz = analysisInfo && toFiniteOrNull(analysisInfo.sourceHighHz) ? Number(analysisInfo.sourceHighHz) : nyquistHz || 20000;

  const fileName = sourceInfo && sourceInfo.name ? sourceInfo.name : fileLabel ? fileLabel.textContent : "-";
  const fileType = sourceInfo && sourceInfo.mimeType ? sourceInfo.mimeType : sourceInfo && sourceInfo.extension ? `.${sourceInfo.extension}` : "-";

  setMathField(mathPanelEls.fileName, fileName || "-");
  setMathField(mathPanelEls.fileType, fileType || "-");
  setMathField(mathPanelEls.fileSize, formatBytes(sourceInfo ? sourceInfo.sizeBytes : null));
  setMathField(mathPanelEls.fileDuration, formatSeconds(durationSec));
  setMathField(mathPanelEls.fileBitrate, formatBitrate(bitrateBps));
  setMathField(mathPanelEls.fileRange, `${formatHz(sourceLowHz)} - ${formatHz(sourceHighHz)}`);

  const analysisFrames = map && Array.isArray(map.frames) ? map.frames.length : 0;
  const frameRate = analysisInfo ? toFiniteOrNull(analysisInfo.frameRate) : null;
  const channels = analysisInfo ? toFiniteOrNull(analysisInfo.channels) : null;
  const fftSize = analysisInfo && toFiniteOrNull(analysisInfo.fftSize) ? Math.round(Number(analysisInfo.fftSize)) : FFT_SIZE;
  const hopSize = analysisInfo && toFiniteOrNull(analysisInfo.hopSize) ? Math.round(Number(analysisInfo.hopSize)) : HOP_SIZE;
  const windowName = analysisInfo && analysisInfo.window ? String(analysisInfo.window) : "Hann";
  const engine = analysisInfo && analysisInfo.engine ? String(analysisInfo.engine) : "Song Geometry Mapper";
  const toolchain = analysisInfo && analysisInfo.toolchain ? String(analysisInfo.toolchain) : "Web Runtime";
  const descriptorList =
    analysisInfo && Array.isArray(analysisInfo.descriptors) && analysisInfo.descriptors.length > 0
      ? analysisInfo.descriptors.join(", ")
      : "rms, centroidHz, spreadHz, rolloffHz, flatness, zcr, peakHz, flux";

  const aiGeneratedRaw = analysisInfo ? analysisInfo.aiGenerated : null;
  const aiSourceRaw = analysisInfo && analysisInfo.aiDetectionSource ? String(analysisInfo.aiDetectionSource) : "";
  let aiGeneratedText = "Unknown";
  if (aiGeneratedRaw === true) {
    aiGeneratedText = aiSourceRaw ? `Yes (${aiSourceRaw})` : "Yes";
  } else if (aiGeneratedRaw === false) {
    aiGeneratedText = aiSourceRaw ? `No (${aiSourceRaw})` : "No";
  } else if (aiSourceRaw && aiSourceRaw !== "not-provided") {
    aiGeneratedText = `Unknown (${aiSourceRaw})`;
  }

  setMathField(mathPanelEls.engine, engine);
  setMathField(mathPanelEls.toolchain, toolchain);
  setMathField(mathPanelEls.aiGenerated, aiGeneratedText);
  setMathField(mathPanelEls.fftHop, `${fftSize} / ${hopSize}`);
  setMathField(mathPanelEls.window, windowName);
  setMathField(mathPanelEls.sampleRate, sampleRateHz && sampleRateHz > 0 ? `${Math.round(sampleRateHz)} Hz` : "-");
  setMathField(mathPanelEls.channels, channels && channels > 0 ? String(channels) : "-");
  setMathField(mathPanelEls.frames, analysisFrames > 0 ? String(analysisFrames) : "-");
  setMathField(mathPanelEls.fps, frameRate && frameRate > 0 ? frameRate.toFixed(2) : "-");
  setMathField(mathPanelEls.descriptors, `Descriptors: ${descriptorList}`);

  const live = getActiveFrameForMath();
  const currentSec = player ? toFiniteOrNull(player.currentTime) : null;
  const frame = live.frame;
  if (!frame) {
    setMathField(mathPanelEls.livePlayback, "-");
    setMathField(mathPanelEls.liveIndex, "-");
    setMathField(mathPanelEls.liveRmsDb, "-");
    setMathField(mathPanelEls.liveCentroid, "-");
    setMathField(mathPanelEls.liveSpread, "-");
    setMathField(mathPanelEls.liveRolloff, "-");
    setMathField(mathPanelEls.livePeak, "-");
    setMathField(mathPanelEls.liveFlux, "-");
    setMathField(mathPanelEls.liveFlatness, "-");
    setMathField(mathPanelEls.liveZcr, "-");
    setMathField(mathPanelEls.liveTonality, "-");
    setMathField(mathPanelEls.liveBandwidthRatio, "-");
    return;
  }

  const playbackText = `${formatSeconds(currentSec)} / ${formatSeconds(durationSec)}`;
  const indexText = `${live.index + 1} / ${analysisFrames}`;
  const rms = toFiniteOrNull(frame.rms) || 0;
  const centroidHz = toFiniteOrNull(frame.centroidHz) || 0;
  const spreadHz = toFiniteOrNull(frame.spreadHz) || 0;
  const rolloffHz = toFiniteOrNull(frame.rolloffHz) || 0;
  const peakHz = toFiniteOrNull(frame.peakHz) || 0;
  const flux = toFiniteOrNull(frame.flux) || 0;
  const flatness = toFiniteOrNull(frame.flatness) || 0;
  const zcr = toFiniteOrNull(frame.zcr) || 0;
  const tonality = clamp(1 - flatness, 0, 1);
  const bandwidthRatio = spreadHz / Math.max(1, centroidHz);

  setMathField(mathPanelEls.livePlayback, playbackText);
  setMathField(mathPanelEls.liveIndex, indexText);
  setMathField(mathPanelEls.liveRmsDb, `${rms.toFixed(4)} | ${formatDbfs(rms)}`);
  setMathField(mathPanelEls.liveCentroid, formatHz(centroidHz));
  setMathField(mathPanelEls.liveSpread, formatHz(spreadHz));
  setMathField(mathPanelEls.liveRolloff, formatHz(rolloffHz));
  setMathField(mathPanelEls.livePeak, formatHz(peakHz));
  setMathField(mathPanelEls.liveFlux, flux.toFixed(5));
  setMathField(mathPanelEls.liveFlatness, flatness.toFixed(4));
  setMathField(mathPanelEls.liveZcr, zcr.toFixed(4));
  setMathField(mathPanelEls.liveTonality, tonality.toFixed(4));
  setMathField(mathPanelEls.liveBandwidthRatio, bandwidthRatio.toFixed(4));
}

function updateSupportButtonTheme() {
  if (!supportVladBtn) {
    return;
  }

  let r = 96;
  let g = 140;
  let b = 240;
  let glowAlpha = 0.24;

  if (state.map && state.map.frames.length > 0) {
    const activeIndex = player.src ? getFrameIndexAtTime(player.currentTime) : -1;
    const frame = activeIndex >= 0 ? state.map.frames[activeIndex] : state.map.frames[0];

    if (frame && frame.color) {
      r = frame.color.r;
      g = frame.color.g;
      b = frame.color.b;
      glowAlpha = clamp(0.2 + (frame.rmsN || 0) * 0.38, 0.2, 0.56);
    }
  }

  const hiR = Math.round(clamp(r * 0.86 + 48, 0, 255));
  const hiG = Math.round(clamp(g * 0.86 + 48, 0, 255));
  const hiB = Math.round(clamp(b * 0.86 + 48, 0, 255));
  const intensity = 0.86;

  supportVladBtn.style.background = `linear-gradient(115deg, rgba(${hiR}, ${hiG}, ${hiB}, ${(0.24 * intensity).toFixed(3)}), rgba(${r}, ${g}, ${b}, ${(0.2 * intensity).toFixed(3)}))`;
  supportVladBtn.style.borderColor = `rgba(${hiR}, ${hiG}, ${hiB}, ${(0.62 * intensity).toFixed(3)})`;
  supportVladBtn.style.color = "#ecf6ff";
  supportVladBtn.style.boxShadow = `0 0 14px rgba(${r}, ${g}, ${b}, ${(glowAlpha * intensity).toFixed(3)})`;
}

const DOCK_WIDTH_KEY = "sgm.dock-width";
const DOCK_MIN = 280;
const DOCK_MAX = 520;
const DOCK_BREAKPOINT = 900;

function setDockWidth(px, { persist = true } = {}) {
  const width = clamp(Math.round(px), DOCK_MIN, Math.min(DOCK_MAX, window.innerWidth - 360));
  document.documentElement.style.setProperty("--dock-width", `${width}px`);
  if (persist) {
    try {
      window.localStorage.setItem(DOCK_WIDTH_KEY, String(width));
    } catch {
      // Ignore storage failures; the layout still works for this session.
    }
  }
  requestAnimationFrame(resizeCanvas);
}

function initSideDock() {
  // Only dock on viewports wide enough to keep a usable stage; narrower screens
  // keep the original bottom sheet.
  const applyMode = () => {
    document.body.classList.toggle("dock-side", window.innerWidth >= DOCK_BREAKPOINT);
    requestAnimationFrame(resizeCanvas);
  };
  applyMode();
  window.addEventListener("resize", applyMode);

  let stored = null;
  try {
    stored = window.localStorage.getItem(DOCK_WIDTH_KEY);
  } catch {
    stored = null;
  }
  setDockWidth(stored === null ? 340 : Number(stored), { persist: false });

  const resizer = document.createElement("div");
  resizer.className = "dock-resizer";
  resizer.setAttribute("role", "separator");
  resizer.setAttribute("aria-orientation", "vertical");
  resizer.setAttribute("aria-label", "Resize control panel");
  document.body.appendChild(resizer);

  let dragging = false;
  resizer.addEventListener("pointerdown", (event) => {
    dragging = true;
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add("is-dragging");
    event.preventDefault();
  });
  resizer.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    setDockWidth(window.innerWidth - event.clientX, { persist: false });
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("is-dragging");
    if (resizer.hasPointerCapture(event.pointerId)) {
      resizer.releasePointerCapture(event.pointerId);
    }
    const current = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue("--dock-width"),
      10,
    );
    if (Number.isFinite(current)) setDockWidth(current);
  };
  resizer.addEventListener("pointerup", endDrag);
  resizer.addEventListener("pointercancel", endDrag);
}

const SPEED_MIN = 0.05;
const SPEED_MAX = 2;
const SPEED_STORAGE_KEY = "sgm.playback-speed";

function applyPlaybackSpeed(rate, { persist = true } = {}) {
  const next = clamp(Number(rate) || 1, SPEED_MIN, SPEED_MAX);
  state.playbackRate = next;

  if (player) {
    player.playbackRate = next;
    // Chrome/Safari ship `preservesPitch`; older Safari used a webkit prefix.
    const preserve = preservePitch ? preservePitch.checked : true;
    if ("preservesPitch" in player) {
      player.preservesPitch = preserve;
    } else if ("webkitPreservesPitch" in player) {
      player.webkitPreservesPitch = preserve;
    }
  }

  if (playbackSpeed && Number(playbackSpeed.value) !== next) {
    playbackSpeed.value = String(next);
  }
  if (playbackSpeedValue) {
    playbackSpeedValue.textContent = `${next.toFixed(2)}x`;
  }
  for (const chip of speedChips) {
    chip.classList.toggle("is-active", Math.abs(Number(chip.dataset.speed) - next) < 0.001);
  }

  if (persist) {
    try {
      window.localStorage.setItem(SPEED_STORAGE_KEY, String(next));
    } catch {
      // Private-mode storage failures must not break playback.
    }
  }
}

function nudgePlaybackSpeed(direction) {
  const step = state.playbackRate < 0.5 ? 0.05 : 0.1;
  applyPlaybackSpeed(state.playbackRate + step * direction);
}

function bindPlaybackSpeed() {
  if (!playbackSpeed) {
    return;
  }

  let stored = null;
  try {
    stored = window.localStorage.getItem(SPEED_STORAGE_KEY);
  } catch {
    stored = null;
  }
  applyPlaybackSpeed(stored === null ? 1 : Number(stored), { persist: false });

  playbackSpeed.addEventListener("input", () => applyPlaybackSpeed(playbackSpeed.value));
  for (const chip of speedChips) {
    chip.addEventListener("click", () => applyPlaybackSpeed(chip.dataset.speed));
  }
  if (preservePitch) {
    preservePitch.addEventListener("change", () => applyPlaybackSpeed(state.playbackRate));
  }

  // Assigning a new src resets the element's playbackRate to 1, so the chosen
  // rate has to be reasserted on every load. Do not mirror `ratechange` back
  // into the stored value: that reset would be indistinguishable from a user
  // change and would silently overwrite the saved preference with 1x.
  for (const event of ["loadstart", "loadedmetadata", "canplay"]) {
    player.addEventListener(event, () => applyPlaybackSpeed(state.playbackRate, { persist: false }));
  }
}

function bindEvents() {
  const VOICE_CACHE_DIR_KEY = "sgm.voice-cache-dir";

  function refreshVoiceCacheStatus() {
    if (!voiceCacheStatus) {
      return;
    }
    voiceCacheStatus.textContent = "Cache output: Music Suite local data directory";
  }

  async function clearVoiceAnalysisCache() {
    const endpoint = `${VOICE_API_BASE}/api/voice/cache/clear`;

    const confirmed = window.confirm(
      "Clear all Song Geometry Mapper analyses cached by Music Suite?",
    );
    if (!confirmed) {
      return;
    }

    setSessionLabel("Clearing Cache...", true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "all",
        }),
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok || !payload || payload.ok !== true) {
        const message = payload && payload.error ? String(payload.error) : `HTTP ${response.status}`;
        throw new Error(message);
      }

      const removedFiles = Number(payload.removed_files || 0);
      const removedDirs = Number(payload.removed_dirs || 0);
      setSessionLabel(`Cache Cleared (${removedFiles}F/${removedDirs}D)`, false);
      refreshVoiceCacheStatus();
      updateMathPanel(performance.now(), true);
    } catch (error) {
      console.error(error);
      setSessionLabel("Cache Clear Failed", false);
      alert(`Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let focusMode = false;
  const setFocusMode = (enabled) => {
    focusMode = Boolean(enabled);
    document.body.classList.toggle("focus-mode", focusMode);

    if (focusToggleBtn) {
      focusToggleBtn.textContent = focusMode ? "S" : "H";
      focusToggleBtn.setAttribute("aria-label", focusMode ? "Show UI overlays" : "Hide UI overlays");
      focusToggleBtn.setAttribute("title", focusMode ? "Show UI overlays" : "Hide UI overlays");
    }

    if (focusMode && helpModal) {
      helpModal.setAttribute("aria-hidden", "true");
    }
  };

  function updateOffsetLabel(input, label) {
    if (!input || !label) {
      return;
    }
    label.textContent = input.value;
  }

  function updateSpreadLabel() {
    if (!freqSpread || !freqSpreadValue) {
      return;
    }
    const value = Number(freqSpread.value);
    freqSpreadValue.textContent = Number.isFinite(value) ? `${value.toFixed(2)}x` : "--";
  }

  function updatePaletteSaturationLabel() {
    if (!paletteSaturation || !paletteSaturationValue) {
      return;
    }
    const value = Number(paletteSaturation.value);
    paletteSaturationValue.textContent = Number.isFinite(value) ? `${value.toFixed(2)}x` : "--";
  }

  function refreshSpreadUi() {
    updateSpreadLabel();
    if (!freqSpread) {
      return;
    }
    const autoEnabled = Boolean(autoFreqSpread && autoFreqSpread.checked);
    freqSpread.disabled = autoEnabled;
  }

  function remapAndRefreshSpread() {
    remapFrames();
    refreshSpreadUi();
  }

  function clearBuiltinVisualProfileState() {
    activeBuiltinVisualProfile = null;
    builtinVisualProfileSnapshot = null;
  }

  function captureBuiltinVisualProfileSnapshot() {
    if (builtinVisualProfileSnapshot || !readCurrentControlSettings) {
      return;
    }

    const currentSettings = readCurrentControlSettings();
    const snapshot = {};
    for (const key of BUILTIN_VISUAL_PROFILE_KEYS) {
      if (key in currentSettings) {
        snapshot[key] = currentSettings[key];
      }
    }
    builtinVisualProfileSnapshot = snapshot;
  }

  function refreshVisualControlLabels() {
    refreshSpreadUi();
    updatePaletteSaturationLabel();
  }

  function applyBuiltinVisualProfile(presetName) {
    const profile = BUILTIN_VISUAL_PROFILES[presetName];
    if (!profile || !applyControlSettings) {
      return false;
    }

    if (!activeBuiltinVisualProfile) {
      captureBuiltinVisualProfileSnapshot();
    }

    activeBuiltinVisualProfile = presetName;
    applyControlSettings(profile);
    state.autoYaw = 0;
    refreshVisualControlLabels();
    if (customPresetSelect) {
      customPresetSelect.value = "";
    }
    return true;
  }

  function restoreBuiltinVisualProfileBase() {
    if (!activeBuiltinVisualProfile || !builtinVisualProfileSnapshot || !applyControlSettings) {
      clearBuiltinVisualProfileState();
      return false;
    }

    applyControlSettings(builtinVisualProfileSnapshot);
    state.autoYaw = 0;
    refreshVisualControlLabels();
    clearBuiltinVisualProfileState();
    if (customPresetSelect) {
      customPresetSelect.value = "";
    }
    return true;
  }

  function handleVisualPresetChange() {
    const selectedPreset = visualPreset ? visualPreset.value : "";
    if (selectedPreset && applyBuiltinVisualProfile(selectedPreset)) {
      return;
    }

    if (restoreBuiltinVisualProfileBase()) {
      return;
    }

    recolorFrames();
    if (customPresetSelect) {
      customPresetSelect.value = "";
    }
  }

  function loadFileFromInput(file) {
    if (!file) {
      return Promise.resolve();
    }

    if (file.name.toLowerCase().endsWith(".json")) {
      return Promise.resolve(loadAnalysisJson(file)).finally(refreshSpreadUi);
    }
    return Promise.resolve(loadAndAnalyzeFile(file)).finally(refreshSpreadUi);
  }

  window.localStorage.removeItem(VOICE_CACHE_DIR_KEY);

  if (voiceAnalysisCacheClearBtn) {
    voiceAnalysisCacheClearBtn.addEventListener("click", () => {
      clearVoiceAnalysisCache();
    });
  }

  for (const modeRadio of document.querySelectorAll('input[name="analysis-mode"]')) {
    modeRadio.addEventListener("change", refreshVoiceCacheStatus);
  }

  refreshVoiceCacheStatus();

  if (focusToggleBtn) {
    focusToggleBtn.addEventListener("click", () => setFocusMode(!focusMode));
  }

  setFocusMode(false);

  if (offsetX && valOffsetX) {
    updateOffsetLabel(offsetX, valOffsetX);
    offsetX.addEventListener("input", () => updateOffsetLabel(offsetX, valOffsetX));
  }
  if (offsetY && valOffsetY) {
    updateOffsetLabel(offsetY, valOffsetY);
    offsetY.addEventListener("input", () => updateOffsetLabel(offsetY, valOffsetY));
  }
  if (offsetZ && valOffsetZ) {
    updateOffsetLabel(offsetZ, valOffsetZ);
    offsetZ.addEventListener("input", () => updateOffsetLabel(offsetZ, valOffsetZ));
  }

  if (helpBtn && helpModal) {
    helpBtn.addEventListener("click", () => {
      helpModal.setAttribute("aria-hidden", "false");
    });

    if (closeHelpBtn) {
      closeHelpBtn.addEventListener("click", () => {
        helpModal.setAttribute("aria-hidden", "true");
      });
    }

    window.addEventListener("click", (event) => {
      if (event.target === helpModal) {
        helpModal.setAttribute("aria-hidden", "true");
      }
    });
  }

  setMathPanelVisible(false);

  if (mathPanelEls.toggleBtn) {
    mathPanelEls.toggleBtn.addEventListener("click", () => {
      const isHidden = mathPanelEls.panel ? mathPanelEls.panel.classList.contains("is-hidden") : true;
      setMathPanelVisible(isHidden);
      if (isHidden) {
        updateMathPanel(performance.now(), true);
      }
    });
  }

  if (mathPanelEls.closeBtn) {
    mathPanelEls.closeBtn.addEventListener("click", () => {
      setMathPanelVisible(false);
    });
  }

  refreshSpreadUi();
  updatePaletteSaturationLabel();

  if (freqSpread) {
    freqSpread.addEventListener("input", updateSpreadLabel);
  }
  if (paletteSaturation) {
    paletteSaturation.addEventListener("input", () => {
      updatePaletteSaturationLabel();
      recolorFrames();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const target = event.target;
      const files = target && "files" in target ? target.files : null;
      const file = files && files.length > 0 ? files[0] : null;
      loadFileFromInput(file);
    });
  }

  // Enable drag and drop across the window
  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  });

  window.addEventListener("drop", (event) => {
    event.preventDefault();
    const dataTransfer = event.dataTransfer;
    const files = dataTransfer ? dataTransfer.files : null;
    if (!files || files.length === 0) {
      return;
    }
    const file = files.item(0);
    if (!file) {
      return;
    }
    if (file.name.toLowerCase().endsWith(".json") || file.type.startsWith("audio/")) {
      loadFileFromInput(file);
    }
  });

  if (playToggle) {
    playToggle.addEventListener("click", handlePlaybackToggle);
  }
  if (pauseAudioBtn) {
    pauseAudioBtn.addEventListener("click", pausePlayback);
  }
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", resetCamera);
  }

  if (player) {
    player.addEventListener("loadedmetadata", () => {
      if (!state.map) {
        return;
      }
      const duration = Number(player.duration);
      if (Number.isFinite(duration) && duration > 0) {
        state.map.duration = duration;
      }
    });

    player.addEventListener("play", () => {
      if (playToggle) {
        playToggle.textContent = "Pause";
      }
      setSessionLabel("Live", true);
    });

    player.addEventListener("pause", () => {
      if (!player.ended && player.src) {
        if (playToggle) {
          playToggle.textContent = "Play";
        }
        setSessionLabel("Ready", false);
      }
    });

    player.addEventListener("ended", () => {
      if (playToggle) {
        playToggle.textContent = "Play";
      }
      setSessionLabel("Ready", false);
    });

    player.addEventListener("seeking", () => {
      state.trail = [];
      state.lastTrailIndex = -1;
      state.activationPulse.clear();
    });
  }

  if (drawerToggle) {
    drawerToggle.addEventListener("click", () => toggleDrawer());
  }

  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tabTarget || "session");
    });
  }

  if (mappingMode) {
    mappingMode.addEventListener("change", remapAndRefreshSpread);
  }
  if (autoFreqSpread) {
    autoFreqSpread.addEventListener("change", () => {
      if (autoFreqSpread.checked) {
        applySongAwareFreqSpread();
      }
      refreshSpreadUi();
    });
  }
  if (cameraPreset) {
    cameraPreset.addEventListener("change", () => {
      state.autoYaw = 0;
    });
  }
  if (knnNeighbors) {
    knnNeighbors.addEventListener("change", rebuildKnnEdges);
  }

  if (visualPreset) {
    visualPreset.addEventListener("change", handleVisualPresetChange);
  }
  if (colorMetric) {
    colorMetric.addEventListener("change", recolorFrames);
  }

  if (paletteFile) {
    paletteFile.addEventListener("change", (event) => {
      const target = event.target;
      const files = target && "files" in target && target.files ? target.files : [];
      const file = files.length > 0 ? files[0] : null;
      loadCustomPaletteFromFile(file);
    });
  }

  if (clearPaletteBtn) {
    clearPaletteBtn.addEventListener("click", clearCustomPalette);
  }

  if (customPresetSelect) {
    customPresetSelect.addEventListener("change", () => {
      applyCustomPresetByName(customPresetSelect.value);
      clearBuiltinVisualProfileState();
      refreshSpreadUi();
      updatePaletteSaturationLabel();
    });
  }

  if (saveCustomPresetBtn) {
    saveCustomPresetBtn.addEventListener("click", saveCurrentSettingsAsCustomPreset);
  }

  if (deleteCustomPresetBtn) {
    deleteCustomPresetBtn.addEventListener("click", () => {
      const candidate = customPresetSelect
        ? customPresetSelect.value || (customPresetName ? customPresetName.value : "")
        : customPresetName
          ? customPresetName.value
          : "";
      deleteCustomPresetByName(candidate);
    });
  }

  if (captureStillBtn) {
    captureStillBtn.addEventListener("click", captureStill);
  }
  if (exportAnalysisJsonBtn) {
    exportAnalysisJsonBtn.addEventListener("click", exportAnalysisJson);
  }
  if (export3dObjBtn) {
    export3dObjBtn.addEventListener("click", exportVisible3dObj);
  }
  if (startRecordingBtn) {
    startRecordingBtn.addEventListener("click", startRecording);
  }
  if (stopRecordingBtn) {
    stopRecordingBtn.addEventListener("click", stopRecording);
  }
  if (copyMp4CommandBtn) {
    copyMp4CommandBtn.addEventListener("click", () => {
      copyMp4ConversionCommand();
    });
  }

  if (canvas) {
    canvas.addEventListener("pointerdown", (event) => {
      state.dragging = true;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!state.dragging) {
        return;
      }

      const dx = event.clientX - state.dragStartX;
      const dy = event.clientY - state.dragStartY;
      state.dragStartX = event.clientX;
      state.dragStartY = event.clientY;

      if (dragMode && dragMode.value === "pan") {
        state.userPanX = clamp(state.userPanX + dx / Math.max(320, state.width), -0.35, 0.35);
        state.userPanY = clamp(state.userPanY + dy / Math.max(220, state.height), -0.35, 0.35);
        return;
      }

      state.userYaw += dx * 0.0038;
      state.userPitch = clamp(state.userPitch + dy * 0.0024, -1.1, 1.2);
    });

    canvas.addEventListener("pointerup", (event) => {
      state.dragging = false;
      canvas.releasePointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointercancel", () => {
      state.dragging = false;
    });

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      state.userZoom = clamp(state.userZoom + delta, 0.55, 2.4);
    });
  }

  window.addEventListener("resize", resizeCanvas);

  window.addEventListener("keydown", (event) => {
    const activeElement = document.activeElement;
    const tag = activeElement && typeof activeElement.tagName === "string" ? activeElement.tagName : "";
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      handlePlaybackToggle();
      return;
    }

    if (event.key === "[") {
      event.preventDefault();
      nudgePlaybackSpeed(-1);
      return;
    }
    if (event.key === "]") {
      event.preventDefault();
      nudgePlaybackSpeed(1);
      return;
    }
    if (event.key === "\\") {
      event.preventDefault();
      applyPlaybackSpeed(1);
      return;
    }

    const step = event.shiftKey ? 0.04 : 0.02;
    if (event.code === "ArrowLeft") {
      event.preventDefault();
      state.userPanX = clamp(state.userPanX - step, -0.35, 0.35);
      return;
    }
    if (event.code === "ArrowRight") {
      event.preventDefault();
      state.userPanX = clamp(state.userPanX + step, -0.35, 0.35);
      return;
    }
    if (event.code === "ArrowUp") {
      event.preventDefault();
      state.userPanY = clamp(state.userPanY - step, -0.35, 0.35);
      return;
    }
    if (event.code === "ArrowDown") {
      event.preventDefault();
      state.userPanY = clamp(state.userPanY + step, -0.35, 0.35);
    }
  });
}

let animationFrameId = null;

function scheduleTick() {
  if (animationFrameId === null && !document.hidden) {
    animationFrameId = requestAnimationFrame(tick);
  }
}

function tick(nowMs) {
  animationFrameId = null;
  if (document.hidden) {
    return;
  }

  const targetInterval = state.renderQuality < 0.58 ? 1000 / 30 : state.renderQuality < 0.8 ? 1000 / 45 : 0;
  if (targetInterval && nowMs - state.lastRenderedAt < targetInterval) {
    scheduleTick();
    return;
  }

  const dtMs = clamp(nowMs - state.lastFrameAt, 4, 50);
  state.lastFrameAt = nowMs;
  state.lastRenderedAt = nowMs;
  state.frameDtMs = dtMs;
  const renderStartedAt = performance.now();

  const nowSec = nowMs * 0.001;
  updateSupportButtonTheme();
  updateCameraMotion(nowSec, dtMs);

  drawBackground(nowSec);

  if (state.map) {
    updateTrail(dtMs);
    drawTrail(nowSec);
    drawMap(nowSec);
  } else {
    metricRms.textContent = "0.000";
    metricCentroid.textContent = "0 Hz";
    metricSpread.textContent = "0.00 kHz";
  }

  if (player.src) {
    setSessionLabel(player.paused ? "Ready" : "Live", !player.paused);
  } else {
    setSessionLabel("Idle", false);
  }

  updateMathPanel(nowMs);

  const renderCostMs = performance.now() - renderStartedAt;
  state.renderEmaMs = state.renderEmaMs
    ? state.renderEmaMs * 0.88 + renderCostMs * 0.12
    : renderCostMs;
  const desiredQuality = clamp(16.7 / Math.max(16.7, state.renderEmaMs), 0.45, 1);
  state.renderQuality = state.renderQuality * 0.92 + desiredQuality * 0.08;
  scheduleTick();
}

async function loadIntegratedSong() {
  const query = new URLSearchParams(window.location.search);
  const sourceValue = query.get("source");
  if (!sourceValue) return;

  try {
    const source = new URL(sourceValue, window.location.href);
    if (source.origin !== window.location.origin || !/^\/suite-api\/runs\/[0-9a-f-]+\/audio$/i.test(source.pathname)) {
      throw new Error("The linked audio source is not a valid Music Suite run.");
    }

    setSessionLabel("Loading Music Suite Song", true);
    const response = await fetch(source, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Music Suite audio request failed (${response.status}).`);
    const blob = await response.blob();
    const requestedName = (query.get("name") || "music-suite-song").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180);
    const extension = blob.type.includes("mpeg") ? ".mp3" : blob.type.includes("flac") ? ".flac" : blob.type.includes("ogg") ? ".ogg" : ".wav";
    const filename = /\.[a-z0-9]{2,5}$/i.test(requestedName) ? requestedName : `${requestedName}${extension}`;
    await loadAndAnalyzeFile(new File([blob], filename, { type: blob.type || "audio/wav" }));
  } catch (error) {
    console.error(error);
    setSessionLabel("Music Suite Song Load Failed", false);
  }
}

function init() {
  resizeCanvas();
  createStars();
  refreshCustomPresetOptions();
  decorateControls();
  initTooltips();
  initSideDock();
  bindEvents();
  bindPlaybackSpeed();
  setActiveTab(state.activeTab);
  updateLegend();
  toggleDrawer(false);
  drawBackground(0);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    } else if (!document.hidden) {
      state.lastFrameAt = performance.now();
      scheduleTick();
    }
  });
  scheduleTick();
  void loadIntegratedSong();
}

init();
