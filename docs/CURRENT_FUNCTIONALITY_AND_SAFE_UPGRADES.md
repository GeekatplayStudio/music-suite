# Geekatplay Studio Music Suite — Current Functionality and Safe Upgrades

**Created by Vladimir Chopine · Geekatplay Studio**

## Objective

This document records what the application already does well, which upgrades are most valuable next, and which guardrails must stay in place so new work does not break existing behavior.

## Current Functional Surface

### Core workflow

- Upload audio runs from the web UI.
- Queue analysis jobs through the FastAPI backend.
- Track analysis state with stage, stage detail, progress, and heartbeat timestamps.
- Review completed runs from persistent history.
- Export results as JSON, HTML, and PDF.

### Analysis and diagnostics

- Metadata extraction via ffprobe and mutagen.
- Loudness, true peak, crest factor, noise floor, and dynamic range metrics.
- Technical file insights such as format, codec, bitrate, sample rate, channels, and estimated frequency range.
- Marker generation for issues such as clipping, harshness, stereo concerns, and other detected problem regions.
- Plotly chart suite covering waveform, loudness, spectrum, stereo analysis, vectorscope, and multiple spectrogram modes.
- Timeline playback with marker-aware zoom and focused segment review.

### Conversion and mastering

- Async multi-format conversion workflow with progress tracking.
- AI mastering modes with iterative LUFS/true-peak normalization, source-aware adaptive preflight tuning, backend selection, bounded refinement passes, optional reference-run input, and post-master self-check.
- Analyzer-suggested mastering settings that now include safer mode, preset, backend, and refine-pass guidance.
- Optional pro-module detection with graceful fallback when extra libraries are unavailable.

### Stability work already in place

- Production-safe Next.js not-found route.
- Spectrogram sub-stage progress reporting and persisted analysis heartbeats for long-running files.
- Reduced spectrogram visualization workload for longer or higher-sample-rate files before STFT, mel, and CQT generation.
- Worker reset and run-history cleanup controls.
- Chart retry logic when analysis completes before all chart payloads are immediately readable.

## Non-Breaking Guardrails

These rules should stay in force for every upgrade phase.

1. Preserve current API response shapes for run detail, charts, conversions, and mastering manifests unless a versioned contract change is introduced deliberately.
2. Keep optional dependencies optional. New DSP, mastering, or visualization libraries must fail closed and fall back to the current implementation.
3. Do not remove current Plotly payload compatibility until the frontend has an adapter layer and regression coverage.
4. Keep export routes, report generation, and run-history behaviors stable during UI changes.
5. Treat long-file progress visibility as a product requirement, not a cosmetic feature.
6. Ship upgrades in narrow phases with focused validation instead of bundling UI, backend, and DSP refactors together.

## Best Upgrade Priorities

### Phase 1: Dashboard clarity and navigation

Value: High
Risk: Low

- Improve information hierarchy on the main dashboard.
- Add faster chart navigation and view grouping so the interface stays detailed without feeling overloaded.
- Surface operational context such as loaded charts, active markers, selected run, and mastering recommendation status.

Status: Implemented and extended.

Delivered in UI:

- Operational snapshot cards for selected-run state.
- Chart grouping and quick-jump navigation.
- Interactive waveform review strip for faster scrubbing and segment selection.
- Delivery-readiness summary cards for loudness, peak headroom, marker load, and dynamics.

### Phase 2: Better waveform and review ergonomics

Value: High
Risk: Medium

- Evaluate Wavesurfer.js for a more interactive waveform layer while keeping the existing playback flow as fallback.
- Keep current timeline selection logic and marker jump behavior intact.
- Only introduce a new waveform library behind a contained component boundary.

Suggested rule: Do not replace the existing Plotly waveform until parity is reached for zoom, selection, and marker navigation.

### Phase 3: Enhanced visualization stack

Value: Medium to High
Risk: Medium

- Evaluate Apache ECharts for denser diagnostic widgets and summary panels.
- Keep Plotly as the canonical engine for high-detail analytical plots unless an adapter proves equivalent output quality.
- Prefer hybrid usage over a full charting rewrite.

### Phase 4: Expanded analysis intelligence

Value: High
Risk: Medium to High

- Evaluate Essentia for stronger music-information-retrieval features.
- Consider noisereduce for cleanup-oriented diagnostics and optional restoration previews.
- Consider Open-Unmix or torchaudio separation workflows for advanced mastering assistance.

Suggested rule: New analysis engines should be additive and feature-flagged first, not replacements for the current analyzer path.

### Phase 5: Pro mastering and compliance depth

Value: Medium
Risk: Medium

- Keep `internal` mastering as the deterministic baseline.
- Continue treating `pedalboard`, `matchering`, and other extras as optional integrations with fallback.
- Extend EBU and delivery compliance reporting only when it does not slow down the default path materially.

## Online-Informed Library Notes

The recent research pass identified these notable candidates.

- Essentia: strong analysis candidate, but heavier integration cost.
- Wavesurfer.js: good fit for interactive waveform review.
- Apache ECharts: promising for polished overview panels and dense dashboards.
- Open-Unmix and torchaudio separation options: useful for advanced rescue workflows, but should remain optional.
- pyebur128: useful compliance add-on where available.

Licensing and maintenance caution:

- `pedalboard` is GPLv3.
- `matchering` is GPLv3.
- `audiowaveform` is GPLv3.
- `Peaks.js` is LGPL-3.0.
- Some separation projects require extra diligence around maintenance status and model distribution.

## April 2026 Dependency Audit

The current dependency pass checked the project manifests, the active frontend lockfile, the local Python virtual environment, and current upstream release pages.

### Applied now

Value: High
Risk: Low to Medium

- Upgraded the Next.js app to the current 16.x line.
- Updated React and React DOM to the current 19.2 line.
- Updated Plotly.js browser bundle, PostCSS, Autoprefixer, TypeScript, and Tailwind Merge.
- Replaced the removed `next lint` command with direct ESLint CLI usage so the frontend stays compatible with Next 16.

### Deferred on purpose

Value: Medium to High
Risk: Medium to High

- Tailwind CSS 4.x is available, but it is a full migration with PostCSS plugin changes, utility renames, and CSS-level breaking changes. Stay on Tailwind 3.4.x until there is time for a dedicated UI migration pass.
- Kaleido 1.x is available, but it now requires Chrome to be installed and introduces a v1 API migration path. Keep the current 0.2.x baseline until static export runtime assumptions are validated across developer and deployment environments.
- Dash 4.x is available, but it is a major-version move outside the core FastAPI plus Next.js path. Upgrade the Dash app separately, with targeted validation around `apps/web/app.py`.
- Torch and torchaudio 2.11.x are available, but the GPU path is optional and heavier to refresh. Upgrade them only when the CUDA/runtime matrix is being revisited deliberately.

### Python dependency note

- The backend `pyproject.toml` already uses open lower-bound constraints for most Python packages.
- Because of that, the backend can already resolve to newer compatible releases without changing the manifest.
- For this pass, the safer move is to validate newer packages in the environment and document the result rather than artificially raising all minimum supported versions in source control.
- After validating the active `.venv`, the minimums were raised for the core backend and dev packages that were exercised by the build and test pass.
- The Dash and Kaleido floors were intentionally left alone here because Dash 4.x remains a separate major-upgrade track and Kaleido 1.x still carries external Chrome/runtime assumptions that should not be forced onto every install path yet.

### New library recommendations from current web review

Value: Medium to High
Risk: Varies

- Essentia: still the strongest additive analysis candidate for MIR-heavy work such as key, BPM, segmentation, similarity, mood, and richer audio-problem descriptors. Best choice if AudioQI expands beyond core QC metrics.
- pyebur128: good optional compliance upgrade. It wraps `libebur128`, is lightweight, and fits well if stricter EBU R128 parity becomes more important than the current pure-Python path.
- Basic Pitch: useful optional add-on for melody, note, and pitch-event extraction. Good fit for transcription-aware diagnostics and musical-content overlays, not for core mastering decisions.
- torchaudio-based stem separation: preferable to adopting archived Demucs directly. If stem-aware diagnostics are added, prefer an implementation path that stays aligned with torchaudio or a maintained fork rather than the archived upstream Demucs repo.

### New library cautions from current web review

- Demucs remains technically strong, but the original `facebookresearch/demucs` repository is archived and read-only as of January 2025. Treat it as a research reference, not a default new dependency.
- aubio is still useful for onset, beat, and pitch primitives, but the PyPI release remains old. It is better treated as a targeted utility than as the main next-generation analysis layer.
- `pedalboard` remains active and capable, but GPLv3 licensing still makes it an optional integration rather than a safe default dependency.
- `matchering` remains useful for reference-based workflows, but it should continue to stay optional and isolated behind the current backend selection model.

## Recommended Delivery Strategy

1. Keep the current backend contracts and analysis pipeline stable.
2. Improve dashboard usability first.
3. Introduce any new visualization or DSP library behind a narrow boundary and fallback path.
4. Validate each phase with targeted tests plus one end-to-end upload, analyze, review, export pass.

## Validation Checklist For Every Upgrade

- Upload a track and confirm run creation still works.
- Start analysis and verify stage detail continues updating during long spectrogram work.
- For longer files, verify visualization still completes after spectrogram input downsampling rather than trying to process the full-rate source.
- Confirm charts load and remain selectable by time range.
- Confirm marker jump, playback scrub, conversion, and mastering flows still work.
- Confirm export links still produce JSON, HTML, and PDF.
- Confirm optional integrations degrade gracefully when unavailable.

## Current Pass Summary

This pass keeps all backend behavior intact and improves the frontend in a low-risk way:

- Added an operational snapshot area for the selected run.
- Added grouped chart navigation so the chart surface is easier to scan.
- Added an interactive waveform review strip that reuses existing waveform data.
- Added transport controls under the waveform review strip for practical playback review.
- Added optional browser-side EQ monitoring with full-track WAV export of the processed result.
- Added delivery-readiness summary cards for faster first-pass review.
- Added source-aware mastering adaptation so preset parameters can be nudged safely from detected issue classes before the main render/refinement stages.
- Upgraded normalization from a one-pass gain trim to iterative LUFS/true-peak target search.
- Added compliance-aware post-check rescue so a failing first pass can trigger a stricter second render from source before the final master is accepted.
- Switched API/frontend/UI mastering defaults to `internal` so normal workflows do not accidentally fall into stale `auto` backend behavior.
- Tightened analyzer recommendations so `v1`, `v2`, and `v3` are suggested more conservatively, and backend/refine-pass suggestions are now included.
- Relaxed the frontend stale-stage warning for long spectrogram work so valid long-running analysis is less likely to be flagged prematurely.
- Kept existing analysis, conversion, mastering, marker, and export flows unchanged.
