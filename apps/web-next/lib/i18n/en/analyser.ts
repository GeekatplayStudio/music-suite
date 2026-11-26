/** The analyser (app/page.tsx). */
export const analyser = {
  na: "N/A",
  yes: "yes",
  no: "no",
  idle: "Idle",
  status: {
    idle: "idle",
    uploaded: "uploaded",
    queued: "queued",
    running: "running",
    completed: "completed",
    failed: "failed",
    cancelled: "cancelled"
  },
  severity: {
    critical: "critical",
    high: "high",
    medium: "medium",
    low: "low",
    info: "info",
    warning: "warning",
    error: "error"
  },
  chartTitles: {
    waveform: "Waveform + Envelope",
    loudness: "Loudness Timeline",
    spectrum: "Average Spectrum",
    stereo: "Stereo Correlation + M/S",
    correlation_meter: "Correlation Meter",
    ms_view: "Mid/Side View",
    vectorscope: "Vectorscope / Goniometer",
    spectrogram_stft_linear: "STFT Spectrogram (Linear)",
    spectrogram_stft_log: "STFT Spectrogram (Log)",
    spectrogram_mel: "Mel Spectrogram",
    spectrogram_cqt: "CQT Spectrogram"
  },
  chartHelp: {
    waveform:
      "Shows amplitude over time plus peak/RMS envelopes. Use it to spot transients, dense limiting, and envelope shape.",
    loudness:
      "Momentary and short-term LUFS over time. Look for consistency and dips/spikes against your target delivery level.",
    spectrum:
      "Average frequency balance. Useful for tonal tilt checks and identifying too much sub, harshness, or missing air.",
    stereo: "Correlation and Mid/Side ratio together. Negative correlation warns of mono compatibility issues.",
    correlation_meter:
      "Correlation from -1 to +1. Values near +1 are mono-compatible; values below 0 can collapse in mono.",
    ms_view: "Mid/Side ratio and L-R balance trends. Helps detect width imbalance or side-heavy passages.",
    vectorscope:
      "Stereo image scatter of Left vs Right. Vertical tendency is mono-ish; wide cloud indicates broader stereo spread.",
    spectrogram_stft_linear:
      "Time-frequency energy with linear frequency axis. Good for detailed technical inspection of full spectrum content.",
    spectrogram_stft_log: "STFT on logarithmic frequency scale. Easier to read musically, especially low-frequency structure.",
    spectrogram_mel: "Perceptually-weighted spectrogram aligned to how hearing groups frequency bands.",
    spectrogram_cqt: "Constant-Q spectrogram with musical spacing across octaves, useful for pitch/harmonic structure."
  },
  chartHelpMissing: "Graph interpretation description unavailable.",
  groups: {
    all: { label: "All Views", description: "Complete analysis surface for technical review." },
    mix: { label: "Mix Review", description: "Waveform, loudness, tonal balance, and issue markers." },
    stereo: { label: "Stereo Focus", description: "Width, mono compatibility, and spatial balance." },
    spectral: { label: "Spectral", description: "Detailed time-frequency inspection across STFT, mel, and CQT views." }
  },
  guide: {
    title: "Guide: What Everything Means",
    intro: "This glossary explains every metric and graph in this view so you can interpret results quickly.",
    element: "Element",
    whatItTells: "What it tells you",
    graph: "Graph",
    howToRead: "How to read it",
    rows: {
      compressionLoss: {
        element: "Compression Loss Estimate",
        meaning:
          "How far below the audible top (20 kHz, or Nyquist for low sample rates) the measured content stops. 0 Hz means nothing audible is missing; a large value on a lossless file suggests it was transcoded from a lossy source."
      },
      peakToNoise: {
        element: "Range Detail | Peak to Noise",
        meaning:
          "Difference between peak level and the measured noise floor. Larger values usually indicate cleaner dynamic span. N/A when the track has no quiet gaps to measure a floor in."
      },
      peakToLufs: {
        element: "Range Detail | Peak to LUFS",
        meaning: "Difference between true peak and integrated loudness. Useful for headroom and transient contrast context."
      },
      compressionAssessment: {
        element: "Compression Assessment",
        meaning:
          "Heuristic summary from codec/container metadata and spectral behavior. Informative, but not a forensic codec detector."
      },
      metadataTags: {
        element: "Metadata Tags",
        meaning:
          "Embedded tags like artist/title/album. 'No embedded tags detected' means tags are absent or unreadable in this file."
      },
      rawMetadata: {
        element: "Show Raw Metadata JSON",
        meaning: "Unfiltered metadata payload from ffprobe and mutagen for technical inspection."
      },
      integratedLufs: {
        element: "Integrated LUFS",
        meaning: "Overall perceived loudness of the full track measured with BS.1770-style loudness modeling."
      },
      truePeak: {
        element: "True Peak dBFS",
        meaning: "Oversampled peak estimate including possible inter-sample peaks that can clip during playback/encoding."
      },
      crestFactor: {
        element: "Crest Factor dB",
        meaning: "Peak-to-RMS contrast. Higher crest factor often means more transient punch and less constant limiting."
      },
      noiseFloor: {
        element: "Noise Floor dBFS",
        meaning:
          "Level of the noise heard where the music drops out (fades, gaps, quiet intros). More negative is cleaner. Dense tracks with no such passages show N/A, because the music masks the floor."
      },
      markersAround: {
        element: "Markers Around Current Timeline Position",
        meaning: "Warnings active near current playback cursor. 'No rows' means no active warnings at that timeline point."
      },
      stageTicker: {
        element: "Session Control | Stage Ticker",
        meaning:
          "Live progress detail for current analysis stage (decode, scan, spectrograms, report generation). Useful when percent appears static."
      },
      hardReset: {
        element: "Session Control | Hard Reset",
        meaning: "Clears run history and resets queued/running worker jobs to recover from stalled analysis loops."
      },
      masteringBackend: {
        element: "AI Mastering | Backend",
        meaning:
          "Execution path for mastering. 'auto' chooses best available backend at runtime; unavailable backends fall back safely."
      },
      masteringReference: {
        element: "AI Mastering | Reference song",
        meaning:
          "Optional analyzed run id used as tonal/loudness reference (primarily for matchering-style reference mastering)."
      },
      refinePasses: {
        element: "AI Mastering | Refine Passes",
        meaning:
          "Maximum marker-aware corrective passes. More passes can improve stubborn issues but are bounded to prevent loops."
      },
      adaptation: {
        element: "AI Mastering | Source-Aware Adaptation",
        meaning:
          "Before rendering outputs, AudioQI can nudge de-ess, low/high balance, compression, limiter drive, and peak headroom from detected source issues. Manual loudness targets stay in place unless extra peak safety is required."
      },
      selfCheckAssessment: {
        element: "Post-Master Self-Check | Assessment",
        meaning:
          "Overall result label: strong improvement, partial improvement, unchanged, or regression (rollback protection is applied)."
      },
      selfCheckScore: {
        element: "Post-Master Self-Check | Issue Score",
        meaning: "Weighted count of active issue classes before vs after mastering. Lower after-score indicates improvement."
      },
      selfCheckLists: {
        element: "Post-Master Self-Check | Remaining/Resolved/Worsened",
        meaning:
          "Issue classes still present, removed, or increased after mastering. Remaining high-severity issues usually need mix/stem fixes."
      },
      selfCheckMatch: {
        element: "Post-Master Self-Check | AI Recommendation Match",
        meaning: "Compares applied mode/preset/targets to analyzer recommendations. Match does not guarantee issue resolution."
      },
      refinementDiagnostics: {
        element: "Refinement Diagnostics",
        meaning: "Shows accepted passes, rollbacks, final issue score, and whether stem fallback was used."
      },
      proModules: {
        element: "Pro Modules",
        meaning: "Runtime availability for optional integrations (ffmpeg, pedalboard, matchering, pyebur128)."
      },
      naValues: {
        element: "N/A values",
        meaning:
          "Shown when signal/metadata is insufficient for a metric (e.g., no stable noise floor or missing codec metadata)."
      }
    }
  },
  norm: {
    off: { label: "Off (Preset/Manual)", help: "Use preset defaults or manual LUFS/TP values." },
    youtube: { label: "YouTube", help: "Common YouTube normalization target." },
    spotify: { label: "Spotify", help: "Typical Spotify normalization alignment." },
    apple_music: { label: "Apple Music", help: "Conservative Apple Music-style loudness." },
    instagram: { label: "Instagram", help: "Social/mobile balanced target." },
    tiktok: { label: "TikTok", help: "Short-form platform target." },
    broadcast_ebu: { label: "Broadcast EBU", help: "EBU R128 broadcast delivery." },
    podcast_voice: { label: "Podcast Voice", help: "Speech-forward podcast normalization." }
  },
  bassMono: {
    presetDefault: "Preset default",
    off: "Off"
  },
  readiness: {
    aligned: "Aligned",
    hot: "Hot",
    quiet: "Quiet",
    safe: "Safe",
    tight: "Tight",
    risk: "Risk",
    clean: "Clean",
    review: "Review",
    attention: "Attention",
    open: "Open",
    controlled: "Controlled",
    dense: "Dense"
  },
  header: {
    title: "Music Suite by Geekatplay Studio",
    stack:
      "Backend stack: FFmpeg/ffprobe, SoundFile (libsndfile), Mutagen, NumPy, SciPy, Librosa, pyloudnorm, Plotly, and optional CUDA spectrogram acceleration with torchaudio + nnAudio.",
    configuration: "Configuration",
    refreshRuns: "Refresh Runs",
    mapperTitle: "Open the selected song in Geometry Mapper",
    needSong: "Select or upload a song first",
    songFromThisTitle:
      "Start a new AI song from the selected track: its tempo, key and style fill the form, and you can restyle, extend or add parts to it",
    newSongTitle: "Write and generate a new song with AI on this computer",
    songFromThis: "Make a song from this",
    editorAddTitle: "Add the selected song to a Studio Editor session (new or existing), optionally split into stems",
    editorOpenTitle: "Open the multitrack Studio Editor",
    synthTitle: "Design and play synth sounds, and browse Surge XT's library",
    modelsTitle: "Install optional engines and AI models: more stems, the music engine, the lyrics writer",
    helpTitle: "The user manual: every workspace and setting explained",
    clearHistory: "Clear History",
    hardReset: "Hard Reset",
    hardResetTitle: "Force reset job workers and clear all runs (including active ones)."
  },
  config: {
    title: "Configuration & Updates",
    product: "Product",
    createdBy: "Created by Geekatplay Studio",
    installedVersion: "Installed version",
    revision: "Revision {rev}",
    notAvailable: "not available",
    officialSource: "Official source",
    stableBranch: "Stable branch: main",
    updateAvailable: "Update available",
    upToDate: "Music Suite is up to date",
    readyToCheck: "Ready to check for updates",
    dirty: "Local changes detected. Installation is blocked until they are committed or removed.",
    officialOnly:
      "Checks only the official Geekatplay Studio repository. Updates are fast-forward-only and never overwrite local changes.",
    checking: "Checking...",
    check: "Check for Updates",
    installing: "Installing...",
    install: "Install Update"
  },
  session: {
    title: "Session Control",
    dropHint: "Drag & drop audio here or browse",
    browse: "Browse File",
    upload: "Upload",
    analyze: "Analyze",
    visualTitle: "Open real-time visuals for the uploaded song",
    visual: "Visual AI",
    useGpu: "Use optional GPU spectrogram path",
    staleHeartbeat:
      "Stage heartbeat is unusually old. Long spectrogram work can take time, but the backend loop guard will still abort truly stalled analysis automatically.",
    stage: "Stage: {stage}",
    stageUpdated: "Stage: {stage} | Updated {n}s ago",
    exports: "Exports",
    saveReady: "Save Ready Files ({n})"
  },
  convert: {
    title: "Format Conversion",
    intro: "Convert the selected song into additional delivery formats with async progress.",
    convertSelected: "Convert Selected",
    files: "Converted Files",
    none: "No converted files generated yet."
  },
  mastering: {
    title: "AI Mastering",
    helpLabel: "the mastering settings",
    modesIntro: "V1 = transparent chain, V2 = optimizer variants, V3 = stem-aware corrective workflow.",
    preflightIntro:
      "AudioQI now applies a source-aware preflight adjustment pass before rendering variants or stem rescue. Use Backend, Refine Passes, and Reference song for advanced pro mastering control.",
    suggested: "Suggested From Analysis",
    noAdvice: "No advice",
    mode: "Mode",
    preset: "Preset",
    targetsLine: "Target LUFS {lufs} | True Peak {tp} | Variants {variants} | Backend {backend} | Refine {refine}",
    issueScore: " | Issue score {n}",
    scorePolicy:
      "Score policy: dense, lossy, or peak-sensitive sources stay on V1; cleaner corrective cases move to V2; V3 is reserved for stronger intervention on recoverable material.",
    apply: "Apply Suggested Settings",
    analyzeFirst: "Analyze a track first to get recommended AI mastering mode, preset, and targets.",
    awaiting: "Awaiting analyzer recommendation",
    settings: "Mastering Settings",
    normProfile: "Normalization Profile",
    profileTargets: "Profile Targets",
    profileTargetsValue: "{lufs} LUFS | {tp} dBFS TP",
    presetTargets: "Using preset/manual targets",
    backend: "Backend",
    reference: "Reference song (matchering)",
    referenceAria: "Reference song for matchering",
    none: "None",
    runShort: "Run {id}…",
    targetLufs: "Target LUFS",
    truePeak: "True Peak dBFS",
    inputGain: "Input Gain (dB)",
    gainStaging: "Gain Staging",
    unity: "Unity (source level untouched)",
    gainBefore: "{gain} dB before the chain",
    reset: "Reset",
    bassMono: "Bass Mono",
    stereoWidth: "Stereo Width",
    widthPlaceholder: "preset default (1.0)",
    variants: "V2 Variants",
    refinePasses: "Refine Passes",
    backendNotes:
      "Backend notes: `internal` is the safest default, `auto` is for advanced backend selection, and `matchering` requires a valid Reference song. Input Gain (-12..+12 dB) trims the source before profiling, adaptation, and every backend pass, so it changes how the chain hears the mix. Bass Mono collapses out-of-phase side energy below the cutoff (the mid is untouched) and Stereo Width scales the side channel; leaving both on preset default lets the preflight tighten them when mono-compatibility markers fire. Refine Passes are loop-guarded. Normalization profile sets platform targets; manual LUFS/TP values override profile defaults. Source-aware adaptation can trim harshness, sub energy, density, or true-peak risk before the main master renders.",
    run: "Run Mastering",
    bestOutput: "Best output: {id}",
    backendSelected: "Backend selected: {backend}",
    outputHash: "Output SHA256: {hash}...",
    refinement: "Refinement: {accepted} / {max} accepted",
    finalScore: " | Final issue score {n}",
    rollbacks: " | Rollbacks {n}",
    stemFallback: " | Stem fallback applied",
    nonRegression: " | Non-regression safeguard ({reason})",
    applied: "applied",
    proModules: "Pro modules:",
    adaptationTitle: "Source-Aware Adaptation",
    sourceScore: "Source issue score: {n}",
    adjustments: " | Adjustments {n}",
    noChanges: "No preflight parameter changes were required for this source.",
    selfCheckTitle: "Post-Master Self-Check",
    assessment: "Assessment:",
    issueScoreLabel: "Issue score:",
    appliedSettings: "Applied settings: {name} | Target {target} | TP {tp} | Norm {norm} | Input gain {gain}",
    stereoStage: "Stereo stage: bass mono {bass} | width {width}",
    off: "off",
    aiMatch: "AI recommendation match: mode {mode} | preset {preset} | target {target} | TP {tp}",
    compliance: "Compliance: {result}",
    pass: "pass",
    reviewRequired: "review required",
    lufsDelta: " | LUFS delta {n}",
    tpDelta: " | TP delta {n} dB",
    crestDelta: " | Crest delta {n} dB",
    complianceIssues: "Compliance issues: {list}",
    rescue: "Post-check rescue: {state}",
    rescueAttempted: "attempted only",
    round: " | round {n}",
    resolved: "Resolved: {list}",
    remaining: "Remaining: {list}",
    worsened: "Worsened: {list}",
    outputs: "Mastered Outputs",
    noOutputs: "No mastering outputs generated yet."
  },
  history: {
    title: "Run History"
  },
  columns: {
    file: "File",
    status: "Status",
    stage: "Stage",
    progress: "Progress",
    updated: "Updated",
    type: "Type",
    severity: "Severity",
    window: "Window",
    note: "Note",
    format: "Format",
    details: "Details",
    size: "Size",
    download: "Download",
    output: "Output",
    score: "Score",
    truePeak: "True Peak",
    verify: "Verify"
  },
  playback: {
    title: "Playback + Timeline",
    playhead: "Playhead",
    rate: "Playback {rate}x",
    loopOn: "Selection loop active",
    loopOff: "Selection loop off",
    eqOn: "EQ monitoring enabled",
    eqOff: "EQ bypassed",
    segment: "Selected Segment (Zoom Range)",
    fullTrack: "Full Track",
    segmentLine: "Start {start}s | End {end}s | Length {length}s",
    leftMarker: "Left Marker",
    rightMarker: "Right Marker",
    markers: "Markers (Click To Jump + Zoom)",
    noMarkers: "No markers available yet."
  },
  tiles: {
    activeRun: "Active Run",
    noRun: "No run selected",
    runId: "Run ID {id}",
    copyRunId: "Copy the full run ID",
    uploadToCreate: "Upload a file to create a run.",
    analysisState: "Analysis State",
    complete: "{pct}% complete",
    reviewAssets: "Review Assets",
    chartsLoaded: "{loaded}/{total} charts loaded",
    markersLine: "{markers} markers detected | {attention} attention items",
    selectionWindow: "Selection window {length}s",
    strategy: "Mastering Strategy",
    backendProfile: "Backend {backend} | Profile {profile}",
    masteredReady: { one: "{n} mastered output ready", other: "{n} mastered outputs ready" },
    noMastered: "No mastered outputs yet"
  },
  overview: {
    title: "Overview Deck",
    pause: "Pause",
    play: "Play",
    selectionStart: "Selection Start",
    loopSelection: "Loop Selection",
    speed: "Speed",
    setStart: "Set Start @ {time}s",
    setEnd: "Set End @ {time}s",
    resetRange: "Reset Range",
    readiness: "Delivery Readiness",
    loudness: "Loudness",
    loudnessLine: "{lufs} LUFS vs {target} target",
    truePeak: "True Peak",
    peakLine: "{tp} dBFS current ceiling",
    markerLoad: "Marker Load",
    markerLine: { one: "{n} high-attention marker", other: "{n} high-attention markers" },
    dynamics: "Dynamics",
    dynamicsLine: "Crest {crest} dB | LRA {lra} LU",
    flatSections: " (flat sections)",
    manualEq: "Manual EQ",
    live: "Live",
    bypass: "Bypass",
    eqExportNote: "EQ export renders a full-track WAV in the browser so your backend pipeline remains unchanged.",
    guidanceTitle: "Review Guidance",
    guidance1: "Use the review strip to jump quickly through the file before opening the full analysis plots.",
    guidance2:
      "Keep the chart group on Mix Review for first-pass diagnostics, then switch to Spectral for root-cause inspection.",
    guidance3:
      "If delivery readiness is not aligned, apply the suggested mastering profile before running a new mastering pass.",
    guidance4:
      "Use the optional EQ for manual auditioning and export the processed full track as WAV when you want to keep that curve."
  },
  file: {
    title: "File Intelligence",
    titleHelp:
      "Top-level recording/encoding details, estimated frequency content, compression implications, and dynamic range context.",
    formatHelp: "Container format and codec tell you how audio was stored and encoded.",
    formatCodec: "Format / Codec",
    compression: "Compression:",
    freqHelp: "Sample rate defines Nyquist limit; practical hearing reference is about 20 Hz to 20 kHz.",
    freqRange: "Frequency Range",
    estimatedContent: "Estimated content:",
    dynHelp: "Dynamic range combines crest factor, loudness range, and peak-to-noise span.",
    dynSnapshot: "Dynamic Range Snapshot",
    crest: "Crest {n} dB",
    lra: "LRA {n} LU (gated approx.)",
    signalHelp: "Bitrate and bit depth influence potential quality and headroom.",
    signal: "Signal Properties",
    channels: "{rate} Hz, {ch} ch",
    kbps: "{n} kbps",
    bitrateNa: "Bitrate N/A",
    bitDepth: "{n}-bit",
    bitDepthFloat: "{n}-bit float",
    bitDepthNa: "Bit depth N/A",
    lossHelp: "Estimated high-frequency loss is inferred from measured top-band content vs Nyquist limit.",
    lossEstimate: "Compression Loss Estimate",
    lossOfBand: "{pct}% of the {band} band",
    audible: "audible",
    rangeHelp: "Peak-to-loudness ratio and peak-to-noise span help evaluate punch and usable dynamic headroom.",
    rangeDetail: "Range Detail",
    peakToNoise: "Peak to Noise: {value}",
    peakToLufs: "Peak to LUFS: {value}",
    compressionAssessment: "Compression Assessment",
    noAssessment: "No assessment available.",
    whyNa: "Why Some Values Are N/A",
    metadataTags: "Metadata Tags",
    hiddenTags: { one: "Hidden {n} bulky or system tag", other: "Hidden {n} bulky or system tags" },
    noTags: "No embedded tags detected.",
    rawJson: "Show Raw Metadata JSON"
  },
  hints: {
    lossUnavailable:
      "Compression-loss estimate unavailable because codec metadata or spectral estimate is missing, or this run predates the current analyzer (re-analyze to refresh).",
    noiseStale:
      "Peak-to-noise and noise floor are hidden because this run predates the current noise-floor estimator; re-analyze to measure them.",
    noiseDigital:
      "Peak-to-noise is unavailable because the gaps are digital silence, so there is no noise floor to measure.",
    noiseMasked:
      "Peak-to-noise is unavailable because the track has no quiet gaps (fades, intros, pauses) to read a noise floor from; the music masks it.",
    peakLufs: "Peak-to-LUFS is unavailable when integrated loudness is undefined (very short/silent material).",
    noTags: "No embedded metadata tags detected in this file.",
    hiddenOnly: {
      one: "No descriptive embedded tags were found. Hidden {n} bulky or system tag; open raw metadata JSON to inspect it.",
      other: "No descriptive embedded tags were found. Hidden {n} bulky or system tags; open raw metadata JSON to inspect them."
    }
  },
  kpi: {
    integratedHelp: "Integrated LUFS: overall perceived loudness across the full track.",
    integrated: "Integrated LUFS",
    truePeakHelp: "True Peak dBFS: oversampled peak estimate including inter-sample peaks.",
    truePeak: "True Peak dBFS",
    crestHelp: "Crest Factor: transient punch/peak contrast relative to RMS level.",
    crest: "Crest Factor dB",
    noiseHelp:
      "Noise floor read from fades, gaps, and quiet intros. Dense tracks with no such passages have no measurable floor.",
    noise: "Noise Floor dBFS",
    reanalyze: "Re-analyze to measure",
    digitalSilence: "Gaps are digital silence",
    masked: "No quiet gaps; the music masks it"
  },
  recs: {
    title: "Remastering Recommendations",
    none: "No remastering recommendations available yet."
  },
  markers: {
    title: "Markers Near Playhead / Selection",
    hint: "Click a marker row to jump and set timeline selection. Table is de-duplicated and prioritized by playhead proximity."
  },
  chartStudio: {
    title: "Chart Studio",
    viewFocus: "View Focus",
    showing: { one: "Showing {n} panel.", other: "Showing {n} panels." },
    loadedOf: "Loaded {loaded} of {total} expected charts.",
    quickJump: "Quick Jump",
    timelineTip: "Timeline tip: right-click and drag on the chart area to pan the selected time window."
  },
  saveDialog: {
    title: "Outputs Ready To Save",
    intro: "Choose where to save each converted/mastered file.",
    later: "Later",
    conversion: "Conversion",
    mastering: "Mastering",
    saving: "Saving...",
    saveAs: "Save As...",
    quickDownload: "Quick Download",
    dismiss: "Dismiss"
  },
  footer: {
    rights: "© {year} Geekatplay Studio. All rights reserved.",
    version: "Music Suite • Created by Geekatplay Studio • Version 1.0.0"
  },
  msg: {
    pickFile: "Pick an audio file to begin.",
    saved: "Saved {name}.",
    saveFailed: "Failed to save {name}: {reason}",
    saveTimedOut: "Save dialog timed out. Started browser download for {name}.",
    fetchRunsFailed: "Failed to fetch runs.",
    chartsPartial: "Loaded {loaded}/{total} charts. Retrying missing: {missing}",
    noStageUpdate: " (no stage update for {n}s)",
    chartsLoading: "Analysis complete. Loading charts ({loaded}/{total})... Missing: {missing}",
    masteringProgress: "Mastering {status}... {pct}%",
    conversionProgress: "Conversion {status}... {pct}%",
    masteringFailed: "Mastering failed.",
    conversionFailed: "Conversion failed.",
    analysisComplete: "Analysis complete.",
    analysisFailed: "Analysis failed.",
    runProgress: "{status}... {pct}% | {ticker}",
    fetchRunFailed: "Failed to fetch run details.",
    outputsReady: {
      one: "New output file ready. Choose where to save it.",
      other: "New output files ready. Choose where to save {n} files."
    },
    uploading: "Uploading...",
    uploaded: "Uploaded {name}. Ready to analyze.",
    uploadFailed: "Upload failed.",
    analysisQueued: "Analysis queued.",
    analysisStartFailed: "Failed to start analysis.",
    pickFormat: "Select at least one target format for conversion.",
    queueingConversion: "Queueing conversion...",
    conversionQueued: "Conversion queued: {formats}",
    conversionStartFailed: "Failed to start conversion.",
    queueingMastering: "Queueing mastering...",
    masteringQueued: "Mastering queued ({mode}, {preset}, {backend}, norm: {norm}, input gain: {gain} dB).",
    masteringStartFailed: "Failed to start mastering.",
    confirmHardReset:
      "Hard reset services and clear all runs (including active/queued jobs)? This will cancel queued workers.",
    confirmClear: "Clear run history for all non-active runs?",
    hardResetting: "Hard resetting services and clearing history...",
    clearing: "Clearing run history...",
    cleared: { one: "Cleared {n} run.", other: "Cleared {n} runs." },
    keptActive: { one: " ({n} active run kept)", other: " ({n} active runs kept)" },
    jobsReset: " Jobs reset: cancelled {cancelled}, running {running}.",
    hardResetFailed: "Failed to hard reset services.",
    clearFailed: "Failed to clear run history.",
    appliedAdvice: "Applied suggested mastering settings ({mode} / {preset} / {backend}).",
    playbackFailed: "Playback failed to start.",
    selectRunForEq: "Select a run before exporting EQ audio.",
    sourceFetchFailed: "Failed to fetch source audio: {status}",
    noOfflineRendering: "Web Audio offline rendering is not available in this browser.",
    eqExported: "EQ export complete. Saved processed WAV.",
    eqExportFailed: "EQ export failed.",
    updateAvailable: "A Music Suite update is available.",
    updateCheckFailed: "Update check failed.",
    updateInstallFailed: "Update installation failed.",
    audioLoadFailed: "Audio playback failed to load for this run."
  },
  popout: {
    visual: "Visual AI",
    visualTitle: "Visual AI",
    charts: "the charts",
    chartsTitle: "Charts"
  },
};
