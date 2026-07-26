# Geekatplay Studio Music Suite Help Guide

**Created by Vladimir Chopine · Geekatplay Studio**

## 1) Session Control

- `Upload`: stores source audio and metadata.
- `Analyze`: runs offline DSP analysis asynchronously.
- `Use optional GPU spectrogram path`: enables optional CUDA spectrogram route if available.
- `Clear History`: removes completed runs.
- `Hard Reset`: cancels queued/running jobs and clears all runs.
- `Hard Reset` also resets in-process worker state so stalled jobs do not remain pinned at high progress values.

## 2) Analysis Stages (Ticker)

Typical stage flow:

- `uploaded`
- `queued`
- `initialize`
- `metadata`
- `decode`
- `scan`
- `dynamics`
- `markers`
- `spectrograms`
- `charts`
- `report_*`
- `finalize`
- `completed`

If stage heartbeat stalls for too long, loop guard marks the run as failed to prevent silent hangs.

Stage detail text is expected to change during long phases (`spectrograms`, `charts`, `report_*`).
For long spectrogram work, the frontend warning is intentionally less aggressive than the backend loop guard.
If percentage remains fixed and stage detail does not update for an extended period, use `Hard Reset`.

## 3) AI Mastering Controls

- `Mode`
  - `v1`: safest transparent path for dense, lossy, clipped, or peak-sensitive sources
  - `v2`: optimizer variants + best candidate selection for cleaner corrective cases
  - `v3`: stem-aware spectral workflow for difficult but still recoverable material
- `Preset`
  - `streaming`, `club`, `film`, `voice`
- `Backend`
  - `internal`: deterministic built-in DSP chain and current default
  - `auto`: advanced runtime selection path
  - `ffmpeg`: ffmpeg filter-chain pass
  - `pedalboard`: optional pedalboard plugin path
  - `matchering`: optional reference-based path (requires `Reference Run ID`)
- `Target LUFS`: mastering loudness target
- `True Peak dBFS`: output ceiling target
- `V2 Variants`: candidate count for mode `v2`
- `Refine Passes`: bounded marker-aware correction passes (`1..5`)
- `Reference Run ID`: optional analyzed run id to use as mastering reference
- `Source-Aware Adaptation`: before rendering outputs, the engine can nudge de-essing, low/high spectral targets, compression, limiter drive, and peak headroom from detected source issues
- `Iterative Normalization`: output loudness is measured after limiting and searched toward the requested LUFS target while staying under the configured true-peak ceiling
- `Suggested Settings`: analyzer advice now includes safer mode, preset, backend, and refine-pass recommendations

Important behavior:

- Manual `Target LUFS` and `True Peak dBFS` remain the primary user controls.
- Adaptation is conservative and is designed to reduce obvious source problems before the main mastering pass.
- Extra true-peak headroom may be introduced automatically when clipping or high true-peak risk is detected.
- Normalization is no longer a single gain pass; the engine now measures post-limiter loudness and chooses the closest valid result.
- Suggested settings now default to `internal` and lower refine counts unless the source looks clean enough to justify stronger correction.

## 4) Post-Master Self-Check

- `Assessment`
  - `strong_improvement`: major reduction in issue score
  - `partial_improvement`: smaller but measurable improvement
  - `unchanged`: no measurable gain
  - `regression`: quality score worsened; rollback logic should prevent this in final output
- `Issue score X -> Y`: weighted issue classes before/after mastering
- `Resolved`: issue classes removed after mastering
- `Remaining`: issue classes still present
- `Worsened`: issue classes that increased
- `Recommended fixes`: follow-up actions when mastering alone cannot fully resolve issues
- `Compliance`: verifies LUFS target distance, true-peak ceiling distance, and crest-density risk after mastering
- `Post-check rescue`: if the first pass still fails compliance badly, AudioQI can rerender from source with a stricter rescue configuration and keep it only if the result improves

## 5) Refinement Diagnostics

- `accepted / max`: successful correction passes vs configured pass limit
- `rollbacks`: non-improving pass attempts discarded
- `stem fallback applied`: whether stem rescue pass improved result and was kept
- `backend selected`: actual backend used after runtime availability checks
- `source-aware adaptation`: preflight parameter changes applied before the main mastering render
- `recommended backend/refine passes`: analyzer-provided safer starting point for the current source

## 6) Marker Categories

- `clipping`: hard clip segments
- `true_peak_risk`: true peak exceeds target safety margin
- `loudness_dip`: short-term loudness falls below target window
- `harshness_band`: persistent 3k-9k energy spikes
- `sub_bass_heavy`: excessive 20-80 energy share
- `mono_incompatibility`: negative stereo correlation regions

## 7) Timeline Selection and Marker Review

- The playhead timeline supports a segment selection (`start`, `end`).
- Marker table near playhead is de-duplicated and prioritized by proximity to current cursor/selection.
- Clicking a marker row jumps playback and updates the active timeline selection.
- Selection-aware charts (waveform, loudness, stereo, spectrogram views) highlight or zoom around the selected window.

## 8) Export, Conversion, and Save Behavior

- Conversion and mastering outputs are generated under run artifacts first.
- Save/download prompts should appear only after processing reaches `completed`.
- A single explicit output selection should trigger a single file save action.
- If multiple save prompts appear unexpectedly, refresh run detail and verify only one output id is selected.

## 9) Troubleshooting

- `Failed to fetch`:
  - confirm the API is running; startup prefers port `8008` but auto-selects the next free loopback port
  - the browser always calls the same-origin `/suite-api` proxy, so no public API URL needs to be configured
  - check the selected API port in `.music-suite-processes.json` and the launcher output
- `<service> did not open port <n> within <n> seconds`:
  - a cold first start imports the full audio stack and can take minutes on a slow disk or while antivirus scans `.venv`
  - read `logs/api.log`, `logs/api.error.log`, or `logs/web.log` for the real failure
  - raise the limit: `.\start.ps1 -StartupTimeoutSeconds 600`, or `MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS=600 ./start.command`
- `npm error enoent ... package.json` when running `npm run start`:
  - run it from the project root, which now provides `npm start` and `npm stop` wrappers around the unified launchers
- `Stage heartbeat is stale`:
  - long mel spectrogram work can legitimately take time
  - the frontend warning is advisory; the backend loop guard is the actual stall detector
  - if a fresh run still stays pinned on `Computing mel spectrogram.` for several minutes, capture the new run id before using `Hard Reset`
- `Mastering unchanged`:
  - inspect `Source-Aware Adaptation` and `Post-Master Self-Check` together
  - increase `Refine Passes`
  - move from `v1` to `v2` or `v3`
  - review remaining markers and apply mix-level fixes
- `matchering not used`:
  - install optional `pro` extras
  - provide valid `Reference Run ID`
- `backend fallback`:
  - check `Pro modules` availability in mastering panel
- Audio sounds distorted only in app player:
  - verify source endpoint is streaming full file and browser is not pinned to a stale partial cache entry
  - check run metadata duration against source duration from media player/ffprobe
- Frequent `206 Partial Content` in API logs:
  - expected for browser media scrubbing/range requests; this does not mean the source file is truncated
