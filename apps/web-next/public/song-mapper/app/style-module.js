// AI music style analysis.
//
// Sends the descriptors the mapper already measured to the Music Suite backend,
// which asks a local Ollama model to describe the style and always returns a
// rule-based description derived from the same numbers.
//
// The local model is probed on load rather than on demand, so the panel can say
// up front whether one is available instead of failing at the moment the user
// presses the button. Ollama being absent is a normal state, not an error: the
// measured description still appears.

const AUTO_KEY = "sgm.style-auto";
const MODEL_KEY = "sgm.style-model";
const FORMAT_KEY = "sgm.style-format";

export function createStyleModule(runtime) {
  const { state, player, VOICE_API_BASE, setSessionLabel } = runtime;

  const statusEl = document.getElementById("style-engine-status");
  const modelSelect = document.getElementById("style-model");
  const formatSelect = document.getElementById("style-format");
  const autoToggle = document.getElementById("style-auto");
  const analyzeBtn = document.getElementById("style-analyze");
  const copyBtn = document.getElementById("style-copy");
  const outputEl = document.getElementById("style-output");
  const noteEl = document.getElementById("style-note");

  const STATUS_URL = `${VOICE_API_BASE}/api/style/status`;
  const ANALYZE_URL = `${VOICE_API_BASE}/api/style/analyze`;

  let analyzing = false;
  let lastAnalyzedMap = null;

  function readStored(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // Private-mode storage failures must not break the panel.
    }
  }

  function setStatus(text, kind) {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = text;
    statusEl.classList.toggle("is-online", kind === "online");
    statusEl.classList.toggle("is-offline", kind === "offline");
  }

  function setNote(text) {
    if (noteEl) {
      noteEl.textContent = text || "";
    }
  }

  /** Probes the local model on load so the panel can state what is available. */
  async function refreshStatus() {
    setStatus("Checking local model...", "");
    try {
      const response = await fetch(STATUS_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();

      if (modelSelect) {
        const previous = modelSelect.value || readStored(MODEL_KEY, "");
        modelSelect.innerHTML = '<option value="">Auto-select</option>';
        for (const name of payload.models || []) {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          modelSelect.appendChild(option);
        }
        modelSelect.value = (payload.models || []).includes(previous) ? previous : "";
      }

      if (payload.running && payload.model) {
        setStatus(`Ollama ready - ${payload.model}`, "online");
      } else if (payload.running) {
        setStatus("Ollama running, no suitable model installed", "offline");
      } else {
        setStatus("Ollama not detected - measured description only", "offline");
      }
      return Boolean(payload.running);
    } catch {
      setStatus("Style service unavailable - measured description only", "offline");
      return false;
    }
  }

  /** The measured features the backend describes. */
  function collectFeatures() {
    const map = state.map;
    const profile = map?.songProfile;
    if (!map || !profile) {
      return null;
    }

    return {
      tempo_bpm: profile.tempoConfidence >= 0.18 ? profile.tempoBpm : null,
      tempo_confidence: profile.tempoConfidence,
      key: profile.keyConfidence >= 0.12 ? profile.key : null,
      key_confidence: profile.keyConfidence,
      centroid_hz: profile.meanCentroidHz,
      flatness: profile.meanFlatness,
      rms: profile.meanRms,
      // Rolloff and ZCR are per frame, so average them here rather than
      // storing yet another song-level field on every map.
      rolloff_hz: averageOf(map.frames, "rolloffHz"),
      zcr: averageOf(map.frames, "zcr"),
      bands: { low: profile.bandLow, mid: profile.bandMid, high: profile.bandHigh },
      duration_seconds: map.duration || player.duration || 0,
      frame_count: map.frames.length,
      repeated_sections: Array.isArray(map.sectionLinks) ? map.sectionLinks.length : 0,
    };
  }

  function averageOf(frames, key) {
    if (!Array.isArray(frames) || frames.length === 0) {
      return 0;
    }
    let sum = 0;
    for (const frame of frames) {
      sum += Number(frame[key]) || 0;
    }
    return sum / frames.length;
  }

  async function analyzeStyle() {
    if (analyzing) {
      return;
    }

    const features = collectFeatures();
    if (!features) {
      setNote("Load and analyze a song first.");
      return;
    }

    analyzing = true;
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = "Analyzing...";
    }
    setNote("");
    setSessionLabel("Style Analysis", true);

    try {
      const response = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features,
          model: modelSelect?.value || "",
          style: formatSelect?.value || "prose",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();

      if (outputEl) {
        outputEl.value = payload.text || "";
      }

      if (payload.engine === "ollama") {
        setStatus(`Ollama ready - ${payload.model}`, "online");
        // The measured description is kept visible alongside the model's, so
        // it stays obvious which sentences are derived and which are written.
        setNote(`Written by ${payload.model}. Measured reading: ${payload.rule_based}`);
      } else {
        setStatus("Ollama not detected - measured description only", "offline");
        setNote(payload.note || "Description derived directly from the measured features.");
      }
      lastAnalyzedMap = state.map;
    } catch (error) {
      setNote(`Style analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      analyzing = false;
      if (analyzeBtn) {
        analyzeBtn.disabled = !state.map;
        analyzeBtn.textContent = "Analyze Style";
      }
      setSessionLabel(player.paused ? "Ready" : "Live", !player.paused);
    }
  }

  /**
   * Runs after a fresh analysis when auto mode is on. Guards against
   * re-running for a map that has already been described, which would
   * otherwise fire again on every remap or recolour.
   */
  function onSongAnalyzed() {
    if (analyzeBtn) {
      analyzeBtn.disabled = !state.map;
    }
    if (!autoToggle?.checked || !state.map || state.map === lastAnalyzedMap) {
      return;
    }
    void analyzeStyle();
  }

  function initStyleModule() {
    if (autoToggle) {
      autoToggle.checked = readStored(AUTO_KEY, "1") === "1";
      autoToggle.addEventListener("change", () => writeStored(AUTO_KEY, autoToggle.checked ? "1" : "0"));
    }
    if (formatSelect) {
      formatSelect.value = readStored(FORMAT_KEY, "prose");
      formatSelect.addEventListener("change", () => writeStored(FORMAT_KEY, formatSelect.value));
    }
    if (modelSelect) {
      modelSelect.addEventListener("change", () => writeStored(MODEL_KEY, modelSelect.value));
    }
    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", () => void analyzeStyle());
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        if (!outputEl?.value) {
          return;
        }
        try {
          await navigator.clipboard.writeText(outputEl.value);
          setNote("Copied to clipboard.");
        } catch {
          outputEl.select();
          setNote("Select-all applied; press Ctrl+C to copy.");
        }
      });
    }

    void refreshStatus();
  }

  return { initStyleModule, analyzeStyle, onSongAnalyzed, refreshStatus, collectFeatures };
}
