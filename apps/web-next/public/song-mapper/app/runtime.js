export function createRuntime() {
  const canvas = document.getElementById("preview-canvas");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  const stage = document.querySelector(".stage");
  
  const fileInput = document.getElementById("audio-file");
  const fileLabel = document.getElementById("file-label");
  const player = document.getElementById("player");
  const playToggle = document.getElementById("play-toggle");
  const pauseAudioBtn = document.getElementById("pause-audio");
  const resetViewBtn = document.getElementById("reset-view");
  const playbackSpeed = document.getElementById("playback-speed");
  const playbackSpeedValue = document.getElementById("playback-speed-value");
  const preservePitch = document.getElementById("preserve-pitch");
  const speedChips = Array.from(document.querySelectorAll(".speed-chip[data-speed]"));
  const sessionState = document.getElementById("session-state");
  const trackCaption = document.getElementById("track-caption");
  
  const drawerToggle = document.getElementById("drawer-toggle");
  const controlDrawer = document.getElementById("control-drawer");
  const tabButtons = Array.from(document.querySelectorAll(".tab-btn[data-tab-target]"));
  
  const mappingMode = document.getElementById("mapping-mode");
  const cameraPreset = document.getElementById("camera-preset");
  const dragMode = document.getElementById("drag-mode");
  const edgeMode = document.getElementById("edge-mode");
  const edgeStyle = document.getElementById("edge-style");
  const displayDecimation = document.getElementById("display-decimation");
  const knnNeighbors = document.getElementById("knn-neighbors");
  const knnBoost = document.getElementById("knn-boost");
  const freqSpread = document.getElementById("freq-spread");
  const freqSpreadValue = document.getElementById("freq-spread-value");
  const autoFreqSpread = document.getElementById("auto-freq-spread");
  
  const pointScale = document.getElementById("point-scale");
  const pointOpacity = document.getElementById("point-opacity");
  const pointSolidness = document.getElementById("point-solidness");
  const pointDepth = document.getElementById("point-depth");
  const edgeOpacity = document.getElementById("edge-opacity");
  const edgeBrightness = document.getElementById("edge-brightness");
  const edgeWidthBoost = document.getElementById("edge-width-boost");
  const edgeRibbonSoftness = document.getElementById("edge-ribbon-softness");
  const edgeRibbonWaveSpeed = document.getElementById("edge-ribbon-wave-speed");
  const edgeRibbonFlexibility = document.getElementById("edge-ribbon-flexibility");
  const edgeWaveHarmonics = document.getElementById("edge-wave-harmonics");
  const edgeSolidness = document.getElementById("edge-solidness");
  const edgeTrailLength = document.getElementById("edge-trail-length");
  const edgeTailFade = document.getElementById("edge-tail-fade");
  const waveAmplification = document.getElementById("wave-amplification");
  const trailPersistence = document.getElementById("trail-persistence");
  const trailFlare = document.getElementById("trail-flare");
  const flowDensity = document.getElementById("flow-density");
  const showFlowArrows = document.getElementById("show-flow-arrows");
  const pulseStrength = document.getElementById("pulse-strength");
  const nodeHitPulse = document.getElementById("node-hit-pulse");
  const motionStrength = document.getElementById("motion-strength");
  const motionBlur = document.getElementById("motion-blur");
  const rotationSpeed = document.getElementById("rotation-speed");
  
  const visualPreset = document.getElementById("visual-preset");
  const observatoryOverlay = document.getElementById("observatory-overlay");
  const cathedralOverlay = document.getElementById("cathedral-overlay");
  const customPresetSelect = document.getElementById("custom-preset-select");
  const customPresetName = document.getElementById("custom-preset-name");
  const saveCustomPresetBtn = document.getElementById("save-custom-preset");
  const deleteCustomPresetBtn = document.getElementById("delete-custom-preset");
  const bloomStrength = document.getElementById("bloom-strength");
  const glowIntensity = document.getElementById("glow-intensity");
  const glowThreshold = document.getElementById("glow-threshold");
  const glowShift = document.getElementById("glow-shift");
  const glowDecay = document.getElementById("glow-decay");
  const fogStrength = document.getElementById("fog-strength");
  const lensFlareStrength = document.getElementById("lens-flare-strength");
  const lensStreakStrength = document.getElementById("lens-streak-strength");
  const colorMetric = document.getElementById("color-metric");
  const paletteSaturation = document.getElementById("palette-saturation");
  const paletteSaturationValue = document.getElementById("palette-saturation-value");
  const paletteFile = document.getElementById("palette-file");
  const clearPaletteBtn = document.getElementById("clear-palette");
  const exportMode = document.getElementById("export-mode");
  
  const showConnections = document.getElementById("show-connections");
  const showLabels = document.getElementById("show-labels");
  const cinemaMode = document.getElementById("cinema-mode");
  
  const captureStillBtn = document.getElementById("capture-still");
  const exportAnalysisJsonBtn = document.getElementById("export-analysis-json");
  const export3dObjBtn = document.getElementById("export-3d-obj");
  const startRecordingBtn = document.getElementById("start-recording");
  const stopRecordingBtn = document.getElementById("stop-recording");
  const copyMp4CommandBtn = document.getElementById("copy-mp4-command");
  
  const legendTitle = document.querySelector(".legend-title");
  const legendBar = document.getElementById("legend-bar");
  const legendScale = document.getElementById("legend-scale");
  
  const helpBtn = document.getElementById("help-btn");
  const supportVladBtn = document.getElementById("support-vlad-btn");
  const focusToggleBtn = document.getElementById("focus-toggle");
  const helpModal = document.getElementById("help-modal");
  const closeHelpBtn = document.getElementById("close-help");
  
  const nodesOnly = document.getElementById("nodes-only");
  const voiceStem = document.getElementById("voice-stem");
  const voiceCacheDir = document.getElementById("voice-cache-dir");
  const voiceCacheClearBtn = document.getElementById("voice-cache-clear");
  const voiceAnalysisCacheClearBtn = document.getElementById("voice-analysis-cache-clear");
  const voiceCacheStatus = document.getElementById("voice-cache-status");
  const offsetX = document.getElementById("offset-x");
  const offsetY = document.getElementById("offset-y");
  const offsetZ = document.getElementById("offset-z");
  const valOffsetX = document.getElementById("val-offset-x");
  const valOffsetY = document.getElementById("val-offset-y");
  const valOffsetZ = document.getElementById("val-offset-z");
  
  const metricRms = document.getElementById("metric-rms");
  const metricCentroid = document.getElementById("metric-centroid");
  const metricSpread = document.getElementById("metric-spread");
  
  const VOICE_API_BASE = (window.localStorage.getItem("sgm.voice-api-base") || "/suite-api/song-mapper").replace(/\/+$/, "");
  const VOICE_API_ANALYZE_URL = `${VOICE_API_BASE}/api/voice/analyze`;
  
  const FFT_SIZE = 1024;
  const HOP_SIZE = 512;
  const MAX_POINTS = 2600;
  const MAX_KNN_EDGES = 9500;
  const EPSILON = 1e-12;
  const CUSTOM_PRESETS_KEY = "sgm.custom-presets.v1";

  // Camera limits. The old clamp bottomed out at 0.55, which was not far enough
  // back to frame a whole cloud, so "zoom out" appeared not to work at all.
  const ZOOM_MIN = 0.12;
  const ZOOM_MAX = 4;

  // Perspective is focal/depth, so a node that drifts close to the camera used
  // to explode in size and blow out the fill rate. Clamping the divisor bounds
  // the on-screen radius instead of letting one node cost a whole frame.
  const NEAR_CLAMP_DEPTH = 2.2;
  // Nodes fade out over this depth band instead of being rejected outright.
  // The old hard `depth < 0.9` cut made points pop in and out when flying in.
  const NEAR_FADE_START = 6;
  const NEAR_FADE_END = 1.2;

  // Adaptive quality tiers.
  //
  // Every adaptive knob used to threshold directly on an EMA of frame cost:
  // decimation stride, kNN stride, the edge visibility cutoff, and whether
  // usage-heat colouring ran at all. The EMA jitters by a few milliseconds
  // every frame, so it crossed those thresholds several times a second and a
  // third of the cloud - plus thousands of edges - appeared and vanished with
  // it. That is the close-up flicker. Tiers are now latched: a change requires
  // the smoothed cost to stay past a margin for QUALITY_DWELL_MS, and the
  // upgrade and downgrade thresholds do not touch, so a tier cannot oscillate.
  const QUALITY_TIERS = [
    { decimation: 1, edgeBudget: 5200, waveDetail: 1, quality: 1, upgradeBelowMs: 0, downgradeAboveMs: 20 },
    { decimation: 1, edgeBudget: 3000, waveDetail: 0.8, quality: 0.82, upgradeBelowMs: 13, downgradeAboveMs: 27 },
    { decimation: 2, edgeBudget: 1700, waveDetail: 0.6, quality: 0.64, upgradeBelowMs: 19, downgradeAboveMs: 38 },
    { decimation: 3, edgeBudget: 900, waveDetail: 0.42, quality: 0.45, upgradeBelowMs: 27, downgradeAboveMs: Infinity },
  ];
  const QUALITY_DWELL_MS = 900;
  
  const PRESET_PALETTES = {
    cinematic: [
      [0.0, [80, 98, 255]],
      [0.18, [182, 82, 232]],
      [0.39, [237, 72, 81]],
      [0.57, [255, 142, 68]],
      [0.77, [82, 229, 107]],
      [1.0, [255, 241, 100]],
    ],
    scientific: [
      [0.0, [77, 120, 208]],
      [0.2, [116, 105, 215]],
      [0.4, [238, 95, 92]],
      [0.58, [248, 154, 80]],
      [0.8, [113, 211, 106]],
      [1.0, [232, 235, 126]],
    ],
    neon: [
      [0.0, [62, 75, 255]],
      [0.18, [210, 58, 255]],
      [0.38, [255, 72, 108]],
      [0.58, [255, 163, 45]],
      [0.78, [76, 244, 114]],
      [1.0, [255, 255, 120]],
    ],
    "cinematic-plus": [
      [0.0, [68, 112, 255]],
      [0.18, [212, 78, 255]],
      [0.36, [255, 86, 128]],
      [0.55, [255, 168, 72]],
      [0.76, [98, 236, 124]],
      [1.0, [255, 252, 134]],
    ],
    observatory: [
      [0.0, [42, 78, 112]],
      [0.18, [74, 126, 162]],
      [0.38, [112, 172, 182]],
      [0.6, [192, 182, 126]],
      [0.82, [233, 161, 96]],
      [1.0, [247, 236, 204]],
    ],
    cathedral: [
      [0.0, [32, 44, 88]],
      [0.18, [66, 96, 164]],
      [0.38, [122, 154, 214]],
      [0.58, [196, 184, 198]],
      [0.8, [240, 194, 142]],
      [1.0, [255, 244, 220]],
    ],
    aurora: [
      [0.0, [66, 232, 214]],
      [0.2, [104, 186, 255]],
      [0.4, [153, 116, 255]],
      [0.62, [255, 104, 202]],
      [0.82, [255, 176, 112]],
      [1.0, [242, 255, 170]],
    ],
    sunset: [
      [0.0, [64, 88, 214]],
      [0.18, [112, 104, 232]],
      [0.38, [232, 96, 148]],
      [0.58, [255, 118, 86]],
      [0.8, [255, 182, 82]],
      [1.0, [255, 240, 160]],
    ],
    arctic: [
      [0.0, [56, 118, 188]],
      [0.22, [84, 160, 214]],
      [0.42, [112, 208, 226]],
      [0.62, [158, 232, 214]],
      [0.82, [206, 244, 224]],
      [1.0, [248, 255, 245]],
    ],
    infrared: [
      [0.0, [34, 24, 84]],
      [0.2, [86, 34, 126]],
      [0.38, [154, 42, 132]],
      [0.58, [224, 64, 104]],
      [0.8, [255, 118, 66]],
      [1.0, [255, 206, 112]],
    ],
  };
  
  const PRESET_BACKGROUND = {
    cinematic: { core: [9, 16, 26], aura: [28, 44, 72], vignette: [2, 4, 8] },
    scientific: { core: [9, 13, 20], aura: [22, 38, 60], vignette: [2, 3, 6] },
    neon: { core: [11, 12, 26], aura: [44, 25, 73], vignette: [3, 3, 9] },
    "cinematic-plus": { core: [8, 12, 24], aura: [36, 52, 86], vignette: [2, 3, 7] },
    observatory: { core: [7, 13, 18], aura: [24, 70, 86], vignette: [2, 5, 7] },
    cathedral: { core: [8, 10, 18], aura: [66, 54, 96], vignette: [3, 2, 7] },
    aurora: { core: [6, 14, 22], aura: [18, 64, 86], vignette: [2, 5, 9] },
    sunset: { core: [14, 10, 24], aura: [66, 30, 44], vignette: [4, 2, 8] },
    arctic: { core: [8, 16, 22], aura: [20, 54, 66], vignette: [2, 6, 8] },
    infrared: { core: [16, 7, 20], aura: [64, 18, 36], vignette: [5, 2, 7] },
  };
  
  const PRESET_CONTROL_EXCLUSIONS = new Set([
    "audio-file",
    "palette-file",
    "custom-preset-select",
    "custom-preset-name",
  ]);
  
  const windowHann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    windowHann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  
  const state = {
    width: canvas.width,
    height: canvas.height,
    dpr: Math.min(1.5, Math.max(1, window.devicePixelRatio || 1)),
    decodeContext: null,
    currentAudioUrl: null,
    sourceFileInfo: null,
    map: null,
    trail: [],
    // Interpolated position of the playhead between two analysis frames.
    trailHead: null,
    lastTrailIndex: -1,
    lastPlaybackTime: 0,
    // Playback rate is mirrored here so time-based decay can advance on the
    // audio clock rather than the wall clock. Without this, slowing playback
    // would shorten every trail instead of slowing it down.
    playbackRate: 1,
    lastFrameAt: performance.now(),
    frameDtMs: 16.7,
    renderEmaMs: 16.7,
    renderQuality: 1,
    // Latched quality tier (index into QUALITY_TIERS) plus the timestamp at
    // which the current tier first became a candidate for change.
    qualityTier: 0,
    qualityTierPendingSince: 0,
    lastRenderedAt: 0,
    userYaw: 0,
    userPitch: 0.2,
    userZoom: 1,
    // Zoom is eased toward its target so a wheel flick glides instead of
    // snapping, which also stops the near-plane fade from strobing.
    userZoomTarget: 1,
    userPanX: 0,
    userPanY: 0,
    // Radius of the mapped cloud in world units; drives fit-to-cloud framing.
    cloudRadius: 18,
    autoYaw: 0,
    autoPitch: 0,
    autoZoom: 1,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    // Pointer position in canvas pixel space, and the node it is resting on.
    // Null pointer means the cursor is not over the stage at all.
    pointerX: null,
    pointerY: null,
    hoverNode: null,
    drawerOpen: true,
    activeTab: "session",
    stars: [],
    trailVelocity: 0,
    activationPulse: new Map(),
    connectionPulse: new Map(),
    connectionUsage: new Map(),
    connectionUsageMax: 0,
    customPaletteStops: null,
    recording: null,
    lastRecordedWebmFilename: "",
    recordingAudioGraph: null,
  };
  
  function clamp(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(maxValue, value));
  }
  
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  
  function mixColor(a, b, t) {
    return {
      r: Math.round(lerp(a.r, b.r, t)),
      g: Math.round(lerp(a.g, b.g, t)),
      b: Math.round(lerp(a.b, b.b, t)),
    };
  }
  
  function rgba(color, alpha) {
    return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
  }
  
  function shiftToInfra(color, amount) {
    const t = clamp(amount, 0, 1);
    return mixColor(color, { r: 255, g: 84, b: 32 }, t);
  }
  
  function setSessionLabel(text, live = false) {
    sessionState.textContent = text;
    sessionState.classList.toggle("chip-live", live);
  }
  
  function formatTrackCaption(filename) {
    const base = filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
    const maxLen = 56;
    const shortName = base.length > maxLen ? `${base.slice(0, maxLen - 1)}...` : base;
    return `Geometry of ${shortName || "your song"}`;
  }
  
  function safeFilenameBase(input) {
    const base = (input || "song-geometry")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_\s]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();
  
    return base || "song-geometry";
  }
  
  function normalizeValue(range, value) {
    const span = Math.max(EPSILON, range.max - range.min);
    return clamp((value - range.min) / span, 0, 1);
  }
  
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(1.5, Math.max(window.devicePixelRatio || 1, 1));
    state.width = Math.max(640, Math.floor(rect.width * state.dpr));
    state.height = Math.max(360, Math.floor(rect.height * state.dpr));
    canvas.width = state.width;
    canvas.height = state.height;
  }
  
  function createStars() {
    const count = 220;
    const stars = [];
  
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        depth: Math.random() * 0.85 + 0.15,
        radius: Math.random() * 1.8 + 0.3,
        alpha: Math.random() * 0.45 + 0.18,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  
    state.stars = stars;
  }

  function qualityTier() {
    return QUALITY_TIERS[clamp(state.qualityTier, 0, QUALITY_TIERS.length - 1)];
  }

  /**
   * Latches the adaptive quality tier. A candidate tier has to hold for
   * QUALITY_DWELL_MS before it is adopted, so a noisy frame-cost EMA can no
   * longer make the node count and edge budget strobe.
   */
  function updateQualityTier(nowMs) {
    const ema = Number(state.renderEmaMs) || 16.7;
    const tier = qualityTier();

    let desired = state.qualityTier;
    if (ema > tier.downgradeAboveMs) {
      desired = Math.min(QUALITY_TIERS.length - 1, state.qualityTier + 1);
    } else if (ema < tier.upgradeBelowMs) {
      desired = Math.max(0, state.qualityTier - 1);
    }

    if (desired === state.qualityTier) {
      state.qualityTierPendingSince = 0;
    } else if (!state.qualityTierPendingSince) {
      state.qualityTierPendingSince = nowMs;
    } else if (nowMs - state.qualityTierPendingSince >= QUALITY_DWELL_MS) {
      state.qualityTier = desired;
      state.qualityTierPendingSince = 0;
    }

    // Keep the legacy 0..1 scalar in step, but ease it so anything still
    // reading it (step counts, star stride) changes gradually.
    state.renderQuality = lerp(state.renderQuality, qualityTier().quality, 0.06);
  }

  /**
   * Zoom that frames the whole mapped cloud. Perspective depth is
   * `24 / zoom - z`, so the cloud spans roughly `cloudRadius` world units
   * either side of the origin and needs the camera pulled back past it.
   */
  function fitZoomForCloud() {
    // X and Z are multiplied by the frequency-spread control at projection
    // time, so the on-screen extent is larger than the raw frame coordinates.
    const spread = Math.max(0.6, Number(freqSpread?.value) || 1);
    const radius = Math.max(4, (Number(state.cloudRadius) || 18) * spread);
    return clamp(24 / (radius * 1.28), ZOOM_MIN, ZOOM_MAX);
  }

  /**
   * Radius that contains the bulk of the mapped frames.
   *
   * Deliberately a high percentile rather than the true maximum: PCA and helix
   * maps both throw a handful of outliers well past the body of the cloud, and
   * framing to those left the song a speck in the middle of an empty stage.
   * The tail is allowed to sit near or slightly past the edge.
   */
  function measureCloudRadius(map = state.map) {
    const frames = map && Array.isArray(map.frames) ? map.frames : null;
    if (!frames || frames.length === 0) {
      return 18;
    }

    const radii = new Float64Array(frames.length);
    for (let i = 0; i < frames.length; i += 1) {
      const frame = frames[i];
      radii[i] = Math.sqrt(frame.x * frame.x + frame.y * frame.y + frame.z * frame.z);
    }
    radii.sort();
    const idx = Math.min(radii.length - 1, Math.floor(radii.length * 0.92));
    return Math.max(4, radii[idx]);
  }

  return {
    canvas,
    ctx,
    stage,
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
    sessionState,
    trackCaption,
    drawerToggle,
    controlDrawer,
    tabButtons,
    mappingMode,
    cameraPreset,
    dragMode,
    edgeMode,
    edgeStyle,
    displayDecimation,
    knnNeighbors,
    knnBoost,
    freqSpread,
    freqSpreadValue,
    autoFreqSpread,
    pointScale,
    pointOpacity,
    pointSolidness,
    pointDepth,
    edgeOpacity,
    edgeBrightness,
    edgeWidthBoost,
    edgeRibbonSoftness,
    edgeRibbonWaveSpeed,
    edgeRibbonFlexibility,
    edgeWaveHarmonics,
    edgeSolidness,
    edgeTrailLength,
    edgeTailFade,
    waveAmplification,
    trailPersistence,
    trailFlare,
    flowDensity,
    showFlowArrows,
    pulseStrength,
    nodeHitPulse,
    motionStrength,
    motionBlur,
    rotationSpeed,
    visualPreset,
    observatoryOverlay,
    cathedralOverlay,
    customPresetSelect,
    customPresetName,
    saveCustomPresetBtn,
    deleteCustomPresetBtn,
    bloomStrength,
    glowIntensity,
    glowThreshold,
    glowShift,
    glowDecay,
    fogStrength,
    lensFlareStrength,
    lensStreakStrength,
    colorMetric,
    paletteSaturation,
    paletteSaturationValue,
    paletteFile,
    clearPaletteBtn,
    exportMode,
    showConnections,
    showLabels,
    cinemaMode,
    captureStillBtn,
    exportAnalysisJsonBtn,
    export3dObjBtn,
    startRecordingBtn,
    stopRecordingBtn,
    copyMp4CommandBtn,
    legendTitle,
    legendBar,
    legendScale,
    helpBtn,
    supportVladBtn,
    focusToggleBtn,
    helpModal,
    closeHelpBtn,
    nodesOnly,
    voiceStem,
    voiceCacheDir,
    voiceCacheClearBtn,
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
    VOICE_API_ANALYZE_URL,
    FFT_SIZE,
    HOP_SIZE,
    MAX_POINTS,
    MAX_KNN_EDGES,
    EPSILON,
    CUSTOM_PRESETS_KEY,
    ZOOM_MIN,
    ZOOM_MAX,
    NEAR_CLAMP_DEPTH,
    NEAR_FADE_START,
    NEAR_FADE_END,
    QUALITY_TIERS,
    PRESET_PALETTES,
    PRESET_BACKGROUND,
    PRESET_CONTROL_EXCLUSIONS,
    windowHann,
    state,
    clamp,
    lerp,
    mixColor,
    rgba,
    shiftToInfra,
    setSessionLabel,
    formatTrackCaption,
    safeFilenameBase,
    normalizeValue,
    resizeCanvas,
    createStars,
    qualityTier,
    updateQualityTier,
    fitZoomForCloud,
    measureCloudRadius,
  };
}
