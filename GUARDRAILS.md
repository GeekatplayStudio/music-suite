# Geekatplay Studio Music Suite Guardrails

**Created by Vladimir Chopine · Geekatplay Studio · Official repository: `GeekatplayStudio/music-suite`**

These boundaries are enforced in code and covered by automated tests. Defaults are intentionally local-first and conservative.

## API and network boundary

- The API defaults to `127.0.0.1`; the unified startup script also binds it to loopback.
- Trusted hosts are limited to `127.0.0.1`, `localhost`, and the test host.
- CORS defaults to `http://127.0.0.1:3000` and `http://localhost:3000`—never `*`.
- Allowed methods and headers are explicitly enumerated.
- Additional origins require the explicit `MUSIC_SUITE_CORS_ORIGINS` environment variable.
- Ollama and MCP integrations accept loopback destinations only.

## Upload boundary

- Allowed extensions: WAV, FLAC, MP3, AAC, OGG, M4A, AIFF, and AIF.
- Filenames are flattened and sanitized; path traversal characters cannot select a destination.
- Uploads stream in 1 MiB chunks instead of buffering the complete file in memory.
- Maximum upload size defaults to 500 MiB and is enforced while streaming.
- Empty files and files without a detectable audio stream are rejected.
- Maximum duration defaults to 900 seconds and is checked from extracted metadata before a run is created.
- Partial uploads and rejected run directories are deleted inside the configured data root.
- Limits can be lowered with `MUSIC_SUITE_MAX_UPLOAD_BYTES` and `MUSIC_SUITE_MAX_AUDIO_DURATION_SECONDS`.

## Analysis and job safety

- Worker concurrency is bounded by `AUDIOQI_JOB_WORKERS` (default 2).
- FFmpeg, reporting, and analysis stages have time limits and stall detection.
- Progress is clamped to 0–100 and every long-running job records stage heartbeats.
- Runtime deletion resolves every target beneath the configured data root before removal.
- Active jobs are preserved unless the operator explicitly requests a hard reset.
- Shutdown reads recorded launcher IDs and current port owners, verifies Music Suite command signatures, and terminates verified descendant trees only.
- Processes holding suite ports with an unrecognized command signature are reported but never terminated automatically.

## DSP and mastering safety

- Mastering true-peak targets cannot exceed `-0.5 dBFS`; the normal default is `-1.0 dBFS`.
- Manual loudness targets remain authoritative while peak-risk sources receive additional safety headroom.
- Marker-aware refinement is bounded and rolls back regressions.
- Post-master self-checks compare issue scores, compliance, and marker changes before accepting results.
- Dense, clipped, phase-risk, or lossy sources receive conservative source-aware adaptation.

## AI and local model safety

- Ollama requests remain on loopback and have explicit time and output-token budgets.
- Model output must match the expected structured fields.
- Invalid, unavailable, or malformed model output falls back to deterministic mastering rules.
- Raw audio is not sent to a cloud model by the application.

## MCP boundary

- The supported MCP transport is stdio, so it opens no additional listening socket.
- MCP may communicate only with a loopback Music Suite API.
- Read operations are enabled by default; `queue_analysis` requires the explicit `MUSIC_SUITE_MCP_ALLOW_MUTATIONS=1` opt-in.
- No delete, upload, shell, arbitrary filesystem, mastering execution, or arbitrary network tools are exposed.
- Run identifiers must be canonical UUIDs.
- Filesystem paths, raw ffprobe data, and path-like fields are removed from model-visible results.
- Collections, nesting, strings, HTTP responses, request timeouts, and final context payloads are bounded.

## Self-update boundary

- Update checks are pinned to `https://github.com/GeekatplayStudio/music-suite` and the `main` branch.
- The application never accepts a repository URL, branch, command, or filesystem path from the browser.
- Update installation requires the official repository as `origin`, a clean working tree, and fast-forward-only history.
- Dirty, detached, unavailable, or diverged installations fail closed without modifying source files.
- The update POST requires a custom confirmation header; the restricted CORS policy prevents cross-origin submission.
- Dependency manifests are fingerprinted, and launchers synchronize dependencies after an update only when those manifests changed.

## Visualization performance boundary

- Rendering uses one `requestAnimationFrame` loop and no timer-driven animation.
- Canvas pixel density is capped at 2× to retain high-DPI quality without runaway fill cost.
- Typed audio buffers are allocated once and reused.
- React metric state is throttled; waveform drawing is downsampled to visible pixels.
- Rendering stops while off-screen, paused, or in a hidden browser tab.
- Expensive geometry and color resources are cached or shared rather than allocated per bar per frame.

## Verification

`verify_pipeline.ps1` stops on the first failure and checks dependency consistency, Python lint, ComfyUI syntax, backend tests, TypeScript, ESLint, the production frontend build, and the production npm dependency audit.
