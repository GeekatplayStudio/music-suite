export function createWorkflowModule(runtime) {
  const {
    canvas,
    state,
    drawerToggle,
    controlDrawer,
    tabButtons,
    fileLabel,
    trackCaption,
    player,
    playToggle,
    pauseAudioBtn,
    mappingMode,
    cameraPreset,
    edgeMode,
    knnNeighbors,
    colorMetric,
    nodesOnly,
    showConnections,
    displayDecimation,
    flowDensity,
    exportMode,
    voiceStem,
    VOICE_API_ANALYZE_URL,
    startRecordingBtn,
    stopRecordingBtn,
    FFT_SIZE,
    HOP_SIZE,
    setSessionLabel,
    formatTrackCaption,
    safeFilenameBase,
    resizeCanvas,
    clamp,
    computeRanges,
    normalizeValue,
    buildTemporalEdges,
    buildKnnEdges,
    applyMapping,
    applySongAwareFreqSpread,
    activeMetricInfo,
    colorFromMetric,
    readCurrentControlSettings,
    analyzeSong,
    recolorFrames,
    getDecodeContext,
    computeViewSpacePoint,
    getFrameIndexAtTime,
    activityForIndex,
    measureCloudRadius,
    fitZoomForCloud,
  } = runtime;

  const DESCRIPTOR_KEYS = ["rms", "centroidHz", "spreadHz", "rolloffHz", "flatness", "zcr", "peakHz", "flux"];

  function fileExtension(name) {
    const text = String(name || "");
    const idx = text.lastIndexOf(".");
    return idx >= 0 ? text.slice(idx + 1).toLowerCase() : "";
  }

  function setSourceFileInfo(file, kind = "audio") {
    if (!file) {
      return;
    }

    const sizeBytes = Number(file.size);
    const lastModifiedMs = Number(file.lastModified);
    state.sourceFileInfo = {
      kind,
      name: String(file.name || ""),
      extension: fileExtension(file.name),
      mimeType: String(file.type || ""),
      sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
      lastModifiedMs: Number.isFinite(lastModifiedMs) && lastModifiedMs > 0 ? lastModifiedMs : null,
    };
  }

  function estimateBitrateBps(sizeBytes, durationSec) {
    const bytes = Number(sizeBytes);
    const duration = Number(durationSec);
    if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }
    return (bytes * 8) / duration;
  }

  function toFiniteOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parseBoolish(value) {
    if (value === true || value === false) {
      return value;
    }
    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (["1", "true", "yes", "y", "on"].includes(text)) {
        return true;
      }
      if (["0", "false", "no", "n", "off"].includes(text)) {
        return false;
      }
    }
    return null;
  }

  function buildAnalysisInfo(map, overrides = {}) {
    const durationSec = Number(map?.duration);
    const frameCount = Array.isArray(map?.frames) ? map.frames.length : 0;
    const frameRate = Number.isFinite(durationSec) && durationSec > 0 ? frameCount / durationSec : null;

    const sampleRateHz = toFiniteOrNull(overrides.sampleRateHz);
    const channelsRaw = toFiniteOrNull(overrides.channels);
    const channels = Number.isFinite(channelsRaw) && channelsRaw > 0 ? Math.round(channelsRaw) : null;
    const nyquistHz = sampleRateHz && sampleRateHz > 0 ? sampleRateHz * 0.5 : null;

    const directBitrate = toFiniteOrNull(overrides.estimatedBitrateBps);
    const fallbackBitrate = estimateBitrateBps(state.sourceFileInfo?.sizeBytes, durationSec);
    const estimatedBitrateBps = directBitrate && directBitrate > 0 ? directBitrate : fallbackBitrate;
    const aiGenerated = parseBoolish(overrides.aiGenerated);
    const aiDetectionSource = overrides.aiDetectionSource ? String(overrides.aiDetectionSource) : "not-provided";

    const fftSizeRaw = toFiniteOrNull(overrides.fftSize);
    const hopSizeRaw = toFiniteOrNull(overrides.hopSize);

    return {
      engine: String(overrides.engine || "Song Geometry Mapper"),
      toolchain: String(overrides.toolchain || "Unknown"),
      fftSize: Number.isFinite(fftSizeRaw) && fftSizeRaw > 0 ? Math.round(fftSizeRaw) : FFT_SIZE,
      hopSize: Number.isFinite(hopSizeRaw) && hopSizeRaw > 0 ? Math.round(hopSizeRaw) : HOP_SIZE,
      window: String(overrides.window || "Hann"),
      sampleRateHz,
      channels,
      nyquistHz,
      analysisFrames: frameCount,
      frameRate,
      descriptors: Array.isArray(overrides.descriptors) && overrides.descriptors.length > 0 ? overrides.descriptors : DESCRIPTOR_KEYS,
      estimatedBitrateBps: estimatedBitrateBps && estimatedBitrateBps > 0 ? estimatedBitrateBps : null,
      sourceLowHz: 20,
      sourceHighHz: nyquistHz || 20000,
      aiGenerated,
      aiDetectionSource,
    };
  }

  function attachAnalysisInfo(map, overrides = {}) {
    if (!map || typeof map !== "object") {
      return;
    }
    map.analysisInfo = buildAnalysisInfo(map, overrides);
  }

  function buildAnalysisExportPayload() {
    if (!state.map) {
      return null;
    }
  
    const controls = readCurrentControlSettings();
    const frames = state.map.frames.map((frame) => ({
      id: frame.id,
      t: frame.t,
      rms: frame.rms,
      rmsN: frame.rmsN,
      centroidHz: frame.centroidHz,
      spreadHz: frame.spreadHz,
      spreadKhz: frame.spreadKhz,
      peakHz: frame.peakHz,
      flux: frame.flux,
      flatness: frame.flatness,
      zcr: frame.zcr,
      x: frame.x,
      y: frame.y,
      z: frame.z,
      size: frame.size,
      color: frame.color,
      label: frame.label,
    }));
  
    return {
      exportedAt: new Date().toISOString(),
      track: {
        name: fileLabel?.textContent || "Unknown",
        durationSec: state.map.duration,
        frameCount: state.map.frames.length,
      },
      mapping: {
        mode: mappingMode.value,
        cameraPreset: cameraPreset.value,
        edgeMode: edgeMode.value,
        colorMetric: colorMetric?.value || "spread",
      },
      ranges: {
        spreadRangeKhz: state.map.spreadRangeKhz,
        peakRangeKhz: state.map.peakRangeKhz,
      },
      controls,
      edges: {
        temporal: state.map.temporalEdges,
        knn: state.map.knnEdges,
      },
      frames,
    };
  }
  
  function exportAnalysisJson() {
    const payload = buildAnalysisExportPayload();
    if (!payload) {
      setSessionLabel("No Analysis", false);
      return;
    }
  
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = safeFilenameBase(fileLabel?.textContent || "song-geometry");
    downloadBlob(blob, `${name}-analysis-${stamp}.json`);
    setSessionLabel("Analysis Exported", !player.paused);
  }
  
  function buildVisibleGraphForObjExport(nowSec) {
    if (!state.map) {
      return null;
    }
  
    const decimate = Math.max(1, Number(displayDecimation.value));
    const activeIndex = !player.paused ? getFrameIndexAtTime(player.currentTime) : -1;
    const activityWindow = 6 + Number(flowDensity.value) * 18;
  
    const vertices = [];
    const vertexByFrameIndex = new Map();
    const visibleFrameIndices = [];
  
    for (let i = 0; i < state.map.frames.length; i += decimate) {
      const frame = state.map.frames[i];
      const pulse = state.activationPulse.get(i) || 0;
      const activity = clamp(activityForIndex(i, activeIndex, activityWindow) + pulse * 1.15, 0, 2.2);
      const view = computeViewSpacePoint(frame.x, frame.y, frame.z, nowSec, activity);
      if (!view || view.depth < 0.9) {
        continue;
      }
  
      const nextVertexIndex = vertices.length + 1;
      vertices.push({
        frameIndex: i,
        x: view.x,
        y: -view.y,
        z: view.z,
      });
      vertexByFrameIndex.set(i, nextVertexIndex);
      visibleFrameIndices.push(i);
    }
  
    const edges = [];
    if (!nodesOnly.checked && showConnections.checked) {
      const mode = edgeMode.value;
      const addEdge = (a, b) => {
        const va = vertexByFrameIndex.get(a);
        const vb = vertexByFrameIndex.get(b);
        if (!va || !vb) {
          return;
        }
        edges.push([va, vb]);
      };
  
      if (mode === "temporal" || mode === "both") {
        for (let i = 1; i < visibleFrameIndices.length; i += 1) {
          addEdge(visibleFrameIndices[i - 1], visibleFrameIndices[i]);
        }
      }
  
      if (mode === "knn" || mode === "both") {
        const stride = state.map.knnEdges.length > 6200 ? 2 : 1;
        for (let i = 0; i < state.map.knnEdges.length; i += stride) {
          const edge = state.map.knnEdges[i];
          addEdge(edge.a, edge.b);
        }
      }
    }
  
    return { vertices, edges };
  }
  
  function exportVisible3dObj() {
    if (!state.map) {
      setSessionLabel("No Analysis", false);
      return;
    }
  
    const graph = buildVisibleGraphForObjExport(performance.now() * 0.001);
    if (!graph || graph.vertices.length === 0) {
      setSessionLabel("Nothing Visible", false);
      return;
    }
  
    const lines = [];
    lines.push("# Song Geometry Mapper - Visible 3D Graph");
    lines.push(`# Exported at ${new Date().toISOString()}`);
    lines.push(`o ${safeFilenameBase(fileLabel?.textContent || "song-geometry")}`);
  
    for (const vertex of graph.vertices) {
      lines.push(`v ${vertex.x.toFixed(6)} ${vertex.y.toFixed(6)} ${vertex.z.toFixed(6)}`);
    }
  
    lines.push("g nodes");
    for (let i = 1; i <= graph.vertices.length; i += 1) {
      lines.push(`p ${i}`);
    }
  
    if (graph.edges.length > 0) {
      lines.push("g connections");
      for (const [a, b] of graph.edges) {
        lines.push(`l ${a} ${b}`);
      }
    }
  
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = safeFilenameBase(fileLabel?.textContent || "song-geometry");
    downloadBlob(blob, `${name}-visible-3d-${stamp}.obj`);
    setSessionLabel(`3D OBJ ${graph.vertices.length}N ${graph.edges.length}E`, !player.paused);
  }
  
  function resetMapRuntimeState() {
    state.trail = [];
    state.trailHead = null;
    state.lastTrailIndex = -1;
    state.lastPlaybackTime = 0;
    state.trailVelocity = 0;
    state.activationPulse.clear();
    state.connectionUsage.clear();
    state.connectionUsageMax = 0;
    // Frame the new cloud. Mapping modes differ in scale by several times over,
    // so a fixed starting zoom either clipped the song or left it a speck.
    state.cloudRadius = measureCloudRadius();
    const fit = fitZoomForCloud();
    state.userZoom = fit;
    state.userZoomTarget = fit;
  }
  
  function setAudioFromFile(file) {
    setSourceFileInfo(file, "audio");
    if (state.currentAudioUrl) {
      URL.revokeObjectURL(state.currentAudioUrl);
      state.currentAudioUrl = null;
    }
    const url = URL.createObjectURL(file);
    state.currentAudioUrl = url;
    player.src = url;
  }
  
  function enablePlaybackUi() {
    playToggle.disabled = false;
    pauseAudioBtn.disabled = false;
    playToggle.textContent = "Play";
  }
  
  function applyAnalysisPayload(rawData, sourceName = "analysis.json") {
    let payload = null;
    let frameRows = null;
  
    if (Array.isArray(rawData)) {
      frameRows = rawData;
    } else if (rawData && typeof rawData === "object" && Array.isArray(rawData.frames)) {
      payload = rawData;
      frameRows = rawData.frames;
    } else {
      throw new Error("JSON must be an array of frames or an exported analysis object");
    }
  
    if (!Array.isArray(frameRows) || frameRows.length === 0) {
      throw new Error("JSON contains no frame data");
    }
  
    // Map Python keys, raw arrays, and exported analysis objects to internal keys.
    const descriptors = frameRows.map((d, index) => {
      const t = d.t !== undefined ? Number(d.t) : Number(d.t_seconds || 0);
      const rms = Number(d.rms || 0);
      const centroidHz = Number(d.spectral_centroid_hz || d.centroidHz || 0);
      const spreadHz = Number(d.spectral_spread_hz || d.spreadHz || 0);
      const rolloffHz = Number(d.spectral_rolloff_hz || d.rolloffHz || 0);
      const flatness = Number(d.spectral_flatness || d.flatness || 0);
      const zcr = Number(d.zcr || 0);
      const peakHz = Number(d.peak_hz || d.peakHz || 0);
      const flux = Number(d.flux || 0);
  
      const x = Number(d.x);
      const y = Number(d.y);
      const z = Number(d.z);
      const hasPosition = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
  
      let color = null;
      if (d.color && typeof d.color === "object") {
        const r = Number(d.color.r);
        const g = Number(d.color.g);
        const b = Number(d.color.b);
        if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
          color = {
            r: clamp(Math.round(r), 0, 255),
            g: clamp(Math.round(g), 0, 255),
            b: clamp(Math.round(b), 0, 255),
          };
        }
      }
  
      return {
        id: Number.isFinite(Number(d.id)) ? Math.trunc(Number(d.id)) : index,
        t,
        rms,
        centroidHz,
        spreadHz,
        rolloffHz,
        flatness,
        zcr,
        peakHz,
        flux,
        x,
        y,
        z,
        hasPosition,
        size: Number(d.size),
        color,
        label: typeof d.label === "string" ? d.label : "",
      };
    });
  
    const ranges = computeRanges(descriptors);
    const frames = [];
    const hasEmbeddedPositions = descriptors.every((d) => d.hasPosition);
  
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
        id: d.id,
        t: d.t,
        rms: d.rms,
        rmsN,
        centroidHz: d.centroidHz,
        centroidN,
        spreadHz: d.spreadHz,
        spreadKhz: d.spreadHz / 1000,
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
        x: hasEmbeddedPositions ? d.x : 0,
        y: hasEmbeddedPositions ? d.y : 0,
        z: hasEmbeddedPositions ? d.z : 0,
        size: Number.isFinite(d.size) && d.size > 0 ? d.size : 0.82 + Math.pow(rmsN, 0.68) * 4.8,
        color: d.color || { r: 120, g: 170, b: 255 },
        label: d.label || `${(d.peakHz / 1000).toFixed(2)}K`,
      });
    }
  
    if (!hasEmbeddedPositions) {
      applyMapping(frames, mappingMode.value);
    }
  
    const payloadSpread = payload?.ranges?.spreadRangeKhz;
    const payloadPeak = payload?.ranges?.peakRangeKhz;
  
    const spreadRangeKhz =
      payloadSpread && Number.isFinite(Number(payloadSpread.min)) && Number.isFinite(Number(payloadSpread.max))
        ? {
            min: Number(payloadSpread.min),
            max: Number(payloadSpread.max),
          }
        : {
            min: ranges.spreadHz.min / 1000,
            max: ranges.spreadHz.max / 1000,
          };
  
    const peakRangeKhz =
      payloadPeak && Number.isFinite(Number(payloadPeak.min)) && Number.isFinite(Number(payloadPeak.max))
        ? {
            min: Number(payloadPeak.min),
            max: Number(payloadPeak.max),
          }
        : {
            min: ranges.peakHz.min / 1000,
            max: ranges.peakHz.max / 1000,
          };
  
    const normalizeEdges = (edges, fallbackWeight = 0.3) => {
      if (!Array.isArray(edges)) {
        return null;
      }
  
      const normalized = [];
      for (const edge of edges) {
        const a = Number(edge?.a);
        const b = Number(edge?.b);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= frames.length || b >= frames.length) {
          continue;
        }
  
        const weight = Number(edge?.weight);
        normalized.push({
          a,
          b,
          weight: Number.isFinite(weight) ? weight : fallbackWeight,
        });
      }
      return normalized;
    };
  
    const temporalEdges = normalizeEdges(payload?.edges?.temporal, 0.36) || buildTemporalEdges(frames);
    const knnEdges = normalizeEdges(payload?.edges?.knn, 0.22) || buildKnnEdges(frames, Number(knnNeighbors.value));
  
    const lastFrame = frames[frames.length - 1];
    const estimatedDuration = lastFrame ? lastFrame.t + (frames.length > 1 ? frames[1].t - frames[0].t : 0.02) : 0;
    const payloadDuration = Number(payload?.track?.durationSec);
    const playerDuration = Number(player.duration);
    const durationFromPlayer = Number.isFinite(playerDuration) && playerDuration > 0 ? playerDuration : null;
    const durationFromPayload = Number.isFinite(payloadDuration) && payloadDuration > 0 ? payloadDuration : null;
  
    const map = {
      frames,
      duration: durationFromPlayer || durationFromPayload || estimatedDuration,
      spreadRangeKhz,
      peakRangeKhz,
      temporalEdges,
      knnEdges,
    };

    const payloadAnalysis = payload?.analysis || payload?.meta?.analysis || {};
    const payloadSampleRate =
      payloadAnalysis.sampleRateHz ??
      payloadAnalysis.sample_rate_hz ??
      payload?.track?.sampleRateHz ??
      payload?.track?.sample_rate_hz;
    const payloadChannels = payloadAnalysis.channels ?? payload?.track?.channels;
    const payloadFftSize = payloadAnalysis.fftSize ?? payloadAnalysis.fft_size;
    const payloadHopSize = payloadAnalysis.hopSize ?? payloadAnalysis.hop_size;
    const payloadWindow = payloadAnalysis.window || "Hann";
    const payloadAiGenerated =
      payloadAnalysis.aiGenerated ??
      payloadAnalysis.ai_generated ??
      payload?.source?.ai_generated ??
      payload?.source?.aiGenerated ??
      null;
    const payloadAiSource =
      payloadAnalysis.aiDetectionSource ??
      payloadAnalysis.ai_detection_source ??
      payload?.source?.ai_detection_source ??
      payload?.source?.aiDetectionSource ??
      "not-provided";

    attachAnalysisInfo(map, {
      engine: payload ? "Imported Analysis Payload" : "Imported Frame JSON",
      toolchain: payload ? "Voice/Python JSON -> Web Runtime" : "JSON Import -> Web Runtime",
      sampleRateHz: payloadSampleRate,
      channels: payloadChannels,
      fftSize: payloadFftSize,
      hopSize: payloadHopSize,
      window: payloadWindow,
      descriptors: DESCRIPTOR_KEYS,
      aiGenerated: payloadAiGenerated,
      aiDetectionSource: payloadAiSource,
    });

    applySongAwareFreqSpread(map);
  
    const metricInfo = activeMetricInfo();
    const range = metricInfo.rangeForMap(map);
  
    for (const frame of frames) {
      frame.color = colorFromMetric(metricInfo.valueForFrame(frame), range);
    }
  
    state.map = map;
    resetMapRuntimeState();
  
    trackCaption.textContent = payload?.track?.name
      ? formatTrackCaption(String(payload.track.name))
      : `Analysis: ${sourceName}`;
    fileLabel.textContent = sourceName;
    setSessionLabel("Ready", false);
  }
  
  async function loadAnalysisJson(file) {
    try {
      setSourceFileInfo(file, "json");
      setSessionLabel("Loading JSON...", true);
      const text = await file.text();
      let rawData;
      try {
        rawData = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON file");
      }
      applyAnalysisPayload(rawData, file.name);
      if (player.src) {
        enablePlaybackUi();
      }
    } catch {
      console.error(error);
      setSessionLabel("JSON Error", false);
      alert("Failed to load analysis JSON: " + error.message);
    }
  }
  
  async function analyzeFileInBrowser(file) {
    setSessionLabel("Analyzing 0%", true);
    fileLabel.textContent = file.name;
    trackCaption.textContent = "Geometry of your song";
    playToggle.disabled = true;
    pauseAudioBtn.disabled = true;
  
    setAudioFromFile(file);
  
    const raw = await file.arrayBuffer();
    const audioContext = getDecodeContext();
    const decoded = await audioContext.decodeAudioData(raw.slice(0));
  
    state.map = await analyzeSong(decoded, (progress) => {
      setSessionLabel(`Analyzing ${Math.round(progress * 100)}%`, true);
    });

    attachAnalysisInfo(state.map, {
      engine: "Classic Browser FFT",
      toolchain: "WebAudio decode -> Hann FFT -> Descriptor Mapping",
      sampleRateHz: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      fftSize: FFT_SIZE,
      hopSize: HOP_SIZE,
      window: "Hann",
      descriptors: DESCRIPTOR_KEYS,
      aiGenerated: null,
      aiDetectionSource: "not-available-in-browser-analysis",
    });
  
    trackCaption.textContent = formatTrackCaption(file.name);
    resetMapRuntimeState();
    recolorFrames();
    enablePlaybackUi();
    setSessionLabel("Ready", false);
  }
  
  async function analyzeFileWithVoiceBackend(file) {
    setSessionLabel("Voice Analyze...", true);
    fileLabel.textContent = file.name;
    trackCaption.textContent = "Voice Analyzer Processing...";
    playToggle.disabled = true;
    pauseAudioBtn.disabled = true;
  
    setAudioFromFile(file);
  
    const formData = new FormData();
    formData.append("audio", file, file.name);
    formData.append("norm", "none");
    formData.append("edge_mode", "none");
    const requestedStem = voiceStem?.value || "vocals";
    formData.append("separate", requestedStem);
    const requestedCacheDir = window.localStorage.getItem("sgm.voice-cache-dir")?.trim();
    if (requestedCacheDir) {
      formData.append("cache_dir", requestedCacheDir);
    }
  
    const response = await fetch(VOICE_API_ANALYZE_URL, {
      method: "POST",
      body: formData,
    });
  
    let result = null;
    try {
      result = await response.json();
    } catch {
      throw new Error("Voice analyzer returned a non-JSON response");
    }
  
    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "Voice analyzer backend failed");
    }
  
    applyAnalysisPayload(result.payload, file.name);
    attachAnalysisInfo(state.map, {
      engine: "Voice / Deep Backend",
      toolchain: "bgm.web_api -> Python analysis payload -> Web Runtime",
      sampleRateHz:
        result?.payload?.analysis?.sampleRateHz ??
        result?.payload?.analysis?.sample_rate_hz ??
        result?.payload?.track?.sampleRateHz ??
        null,
      channels: result?.payload?.analysis?.channels ?? result?.payload?.track?.channels ?? null,
      fftSize: result?.payload?.analysis?.fftSize ?? result?.payload?.analysis?.fft_size ?? FFT_SIZE,
      hopSize: result?.payload?.analysis?.hopSize ?? result?.payload?.analysis?.hop_size ?? HOP_SIZE,
      window: result?.payload?.analysis?.window || "Hann",
      descriptors: DESCRIPTOR_KEYS,
      aiGenerated:
        result?.payload?.analysis?.aiGenerated ??
        result?.payload?.analysis?.ai_generated ??
        result?.payload?.source?.ai_generated ??
        null,
      aiDetectionSource:
        result?.payload?.analysis?.aiDetectionSource ??
        result?.payload?.analysis?.ai_detection_source ??
        result?.payload?.source?.ai_detection_source ??
        "not-provided",
    });
    enablePlaybackUi();
    setSessionLabel("Voice Ready", false);
  }
  
  async function loadAndAnalyzeFile(file) {
    if (!file) {
      return;
    }
  
    const analysisMode = document.querySelector('input[name="analysis-mode"]:checked')?.value || "classic";
  
    try {
      if (analysisMode === "voice") {
        try {
          await analyzeFileWithVoiceBackend(file);
          return;
        } catch (voiceError) {
          console.warn("Voice analyzer backend unavailable, falling back to browser mode.", voiceError);
          setSessionLabel("Voice API Offline, Classic Fallback", true);
        }
      }
  
      await analyzeFileInBrowser(file);
    } catch (error) {
      console.error(error);
      setSessionLabel("Analyze Error", false);
    }
  }
  
  function handlePlaybackToggle() {
    if (!player.src) {
      return;
    }
  
    if (player.paused) {
      player
        .play()
        .then(() => {
          playToggle.textContent = "Pause";
          setSessionLabel("Live", true);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      player.pause();
      playToggle.textContent = "Play";
      setSessionLabel("Ready", false);
    }
  }
  
  function pausePlayback() {
    if (!player.src) {
      return;
    }
  
    player.pause();
    playToggle.textContent = "Play";
    setSessionLabel("Ready", false);
  }
  
  function toggleDrawer(forceOpen) {
    if (typeof forceOpen === "boolean") {
      state.drawerOpen = forceOpen;
    } else {
      state.drawerOpen = !state.drawerOpen;
    }
  
    controlDrawer.classList.toggle("is-collapsed", !state.drawerOpen);
    // The docked column reserves canvas width, so collapsing it gives that
    // width back to the stage and the canvas has to be re-measured.
    document.body.classList.toggle("dock-collapsed", !state.drawerOpen);
    drawerToggle.setAttribute("aria-expanded", String(state.drawerOpen));
    drawerToggle.setAttribute("aria-label", state.drawerOpen ? "Hide controls" : "Show controls");
    drawerToggle.setAttribute("title", state.drawerOpen ? "Hide controls" : "Show controls");
    drawerToggle.textContent = state.drawerOpen ? "Hide" : "Show";
    requestAnimationFrame(resizeCanvas);
  }
  
  function setActiveTab(tabId) {
    const next = tabId || "session";
    state.activeTab = next;
  
    for (const button of tabButtons || []) {
      const active = button.dataset.tabTarget === next;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
  
    const panels = Array.from(controlDrawer.querySelectorAll(".tab-panel[data-tab-panel]"));
    for (const panel of panels) {
      const active = panel.dataset.tabPanel === next;
      panel.classList.toggle("is-active", active);
    }
  
    if (!state.drawerOpen) {
      toggleDrawer(true);
    }
  }
  
  /**
   * Frames the whole cloud rather than returning to a fixed 1x zoom. A helix
   * map is several times larger than a manifold one, so a constant zoom left
   * either half the song off screen or a speck in the middle of it.
   */
  function resetCamera() {
    state.cloudRadius = measureCloudRadius();
    const fit = fitZoomForCloud();
    state.userYaw = 0;
    state.userPitch = 0.2;
    state.userZoom = fit;
    state.userZoomTarget = fit;
    state.userPanX = 0;
    state.userPanY = 0;
    state.autoYaw = 0;
    state.autoPitch = 0;
    state.autoZoom = 1;
  }
  
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  
  function captureStill() {
    const sourceCanvas = canvas;
    const output = document.createElement("canvas");
  
    if (exportMode.value === "4k") {
      output.width = 3840;
      output.height = 2160;
    } else {
      output.width = sourceCanvas.width;
      output.height = sourceCanvas.height;
    }
  
    const outCtx = output.getContext("2d");
    outCtx.drawImage(sourceCanvas, 0, 0, output.width, output.height);
    output.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadBlob(blob, `song-geometry-${stamp}.png`);
    }, "image/png");
  }
  
  async function getPlayerAudioTracksForRecording() {
    // Prefer native media-element capture when available.
    try {
      if (typeof player.captureStream === "function") {
        const stream = player.captureStream();
        const tracks = stream.getAudioTracks();
        if (tracks.length > 0) {
          return tracks.map((track) => track.clone());
        }
      } else if (typeof player.mozCaptureStream === "function") {
        const stream = player.mozCaptureStream();
        const tracks = stream.getAudioTracks();
        if (tracks.length > 0) {
          return tracks.map((track) => track.clone());
        }
      }
    } catch (error) {
      console.warn("Native audio capture failed, using AudioContext fallback.", error);
    }
  
    if (typeof AudioContext === "undefined") {
      return [];
    }
  
    try {
      if (!state.recordingAudioGraph) {
        const context = new AudioContext();
        const source = context.createMediaElementSource(player);
        const destination = context.createMediaStreamDestination();
  
        source.connect(destination);
        source.connect(context.destination);
  
        state.recordingAudioGraph = { context, source, destination };
      }
  
      const { context, destination } = state.recordingAudioGraph;
      if (context.state === "suspended") {
        await context.resume();
      }
  
      return destination.stream.getAudioTracks().map((track) => track.clone());
    } catch (error) {
      console.warn("AudioContext recording graph unavailable.", error);
      return [];
    }
  }
  
  async function startRecording() {
    if (state.recording) {
      return;
    }
  
    if (typeof MediaRecorder === "undefined") {
      console.warn("MediaRecorder not supported in this browser.");
      return;
    }
  
    const videoStream = canvas.captureStream(60);
    const mixedStream = new MediaStream();
    const videoTracks = videoStream.getVideoTracks();
    for (const track of videoTracks) {
      mixedStream.addTrack(track);
    }
  
    const audioTracks = await getPlayerAudioTracksForRecording();
    for (const track of audioTracks) {
      mixedStream.addTrack(track);
    }
    if (audioTracks.length === 0 && player.src) {
      console.warn("Recording started without audio track. Ensure the song is loaded and browser allows capture.");
    }
  
    const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "video/webm";
  
    const chunks = [];
    const recorder = new MediaRecorder(mixedStream, { mimeType });
  
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    });
  
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: mimeType });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `song-geometry-${stamp}.webm`;
      state.lastRecordedWebmFilename = filename;
      downloadBlob(blob, filename);
  
      for (const track of videoTracks) {
        track.stop();
      }
      for (const track of audioTracks) {
        track.stop();
      }
  
      state.recording = null;
      startRecordingBtn.disabled = false;
      stopRecordingBtn.disabled = true;
    });
  
    recorder.start(250);
    state.recording = { recorder, chunks };
    startRecordingBtn.disabled = true;
    stopRecordingBtn.disabled = false;
  }
  
  function stopRecording() {
    if (!state.recording) {
      return;
    }
  
    state.recording.recorder.stop();
  }

  function quoteShellArg(value) {
    return `'${String(value || "").replace(/'/g, `'\\''`)}'`;
  }

  async function copyMp4ConversionCommand() {
    const fallbackName = "song-geometry-latest.webm";
    const suggestedInput = (state.lastRecordedWebmFilename || fallbackName).trim();
    const rawInput = window.prompt("Enter WebM filename or full path for conversion:", suggestedInput);
    if (rawInput == null) {
      return false;
    }

    const inputPath = rawInput.trim();
    if (!inputPath) {
      setSessionLabel("MP4 Command: Missing Input", false);
      return false;
    }

    const outputPath = inputPath.replace(/\.webm$/i, "") + ".mp4";
    const command = `ffmpeg -y -i ${quoteShellArg(inputPath)} -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 320k -movflags +faststart ${quoteShellArg(outputPath)}`;

    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(command);
        copied = true;
      } catch (error) {
        console.warn("Clipboard copy failed; falling back to prompt", error);
      }
    }

    if (!copied) {
      window.prompt("Copy this MP4 conversion command:", command);
    }

    setSessionLabel(copied ? "MP4 Command Copied" : "MP4 Command Ready", false);
    return true;
  }

  return {
    buildAnalysisExportPayload,
    exportAnalysisJson,
    buildVisibleGraphForObjExport,
    exportVisible3dObj,
    resetMapRuntimeState,
    setAudioFromFile,
    enablePlaybackUi,
    applyAnalysisPayload,
    loadAnalysisJson,
    analyzeFileInBrowser,
    analyzeFileWithVoiceBackend,
    loadAndAnalyzeFile,
    handlePlaybackToggle,
    pausePlayback,
    toggleDrawer,
    setActiveTab,
    resetCamera,
    downloadBlob,
    captureStill,
    getPlayerAudioTracksForRecording,
    startRecording,
    stopRecording,
    copyMp4ConversionCommand,
  };
}
