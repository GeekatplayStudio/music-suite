# Geekatplay Studio Music Suite — Product Requirements Document

**Created by Vladimir Chopine · Geekatplay Studio**

## 1. Executive Summary
Geekatplay Studio Music Suite combines AudioQI analysis and mastering with Sonic Visual AI in one local-first, loopback-accessed application. It targets audio engineers, mixing/mastering specialists, and content creators who require deterministic measurements and offline AI-assisted mastering advice without sending raw audio or metadata to external services.

## 2. Core Functional Requirements
* **Audio Import & Parsing:** Support standard formats (`wav`, `flac`, `mp3`, `aac`, `ogg`, `m4a`, `aiff`) and extract tags and audio metrics securely.
* **Deterministic Diagnostics:** Compute loudness timeline (LUFS), crest factor, True Peak levels, noise floor, stereo correlation, Mid/Side balance, and spectral energy distribution.
* **Mastering Optimization Engine:** Provide presets (`streaming`, `club`, `film`, `voice`) and multi-pass optimization chains with adaptive compression, limiting, and corrective target matching.
* **Format Transcoding:** Support asynchronous format conversion on the backend using local FFmpeg instances.
* **Report Generation:** Export PDF and HTML summaries of mixes containing detailed technical metadata and Plotly graphs.

## 3. AI Super Agents & Ollama Integration (Roadmap)
To transition from a static diagnostic application to an active digital assistant, the project integrates local-first LLM orchestration.

### A. Local Ollama Integration
* Connect to a local Ollama service running on loopback (`http://127.0.0.1:11434`).
* Provide zero-data-leakage advice based on technical measurements (LUFS, True Peak, LRA, spectral ratios) passed into optimized prompt templates.
* Gracefully fallback to deterministic rule-based advice if Ollama is unreachable.

### B. LangGraph Orchestration ("linggraph")
* Implement a state-based multi-agent system utilizing LangGraph.
* **Workflow Nodes:**
  1. `IntakeAgent`: Parses the metrics JSON from the analyzer run.
  2. `TonalAgent`: Evaluates spectral balance and suggests parametric EQ adjustments.
  3. `DynamicsAgent`: Evaluates Crest Factor/LRA and suggests compressor ratios and thresholds.
  4. `MasteringOrchestrator`: Assembles final mastering targets and coordinates backend execution.
  5. `SafetyEvaluator`: Evaluates true peak safety, DC offset, and mono-compatibility warning markers to confirm compliance.

## 4. Quality Gatekeeper Flow
All modifications to the codebase must pass a mandatory multi-phase gatekeeper validation:
1. **Linting Check:** Code style enforcement via `ruff`.
2. **Backend Verification:** Execute unit and integration tests via `pytest`.
3. **Frontend Compilation:** Verify type checks and production bundle builds via `pnpm build`.

---
*Copyright &copy; 2026 Geekatplay Studio and Vladimir Chopine. All rights reserved.*
