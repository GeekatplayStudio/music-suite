# Geekatplay Studio Music Suite — Technical Requirements Document

**Created by Vladimir Chopine · Geekatplay Studio**

## 1. Architecture

### Components

- `apps/api` FastAPI service:
- upload ingestion,
- async job dispatch,
- run status + result APIs,
- export serving.

- `apps/web-next` Next.js frontend (primary):
- upload and analyze actions,
- polling and chart rendering,
- playback + marker panel,
- AI mastering controls and self-check visualization.

- `apps/web` Dash frontend (legacy compatibility UI):
- basic upload/analyze/report flow.

- `audioqi/core` DSP:
- decode orchestration,
- metrics and marker extraction,
- spectrogram computation,
- chart composition.

- `audioqi/io` adapters:
- ffprobe/mutagen metadata extraction,
- canonical decode pipeline.

- `audioqi/report`:
- HTML template rendering,
- static chart assets,
- optional PDF generation.

- SQLite (`audioqi.db`) stores run lifecycle state and artifact paths.

### Library Choices and Rationale

- `ffmpeg/ffprobe`: broad codec coverage (`mp3/aac/ogg`) and reliable technical metadata extraction.
- `soundfile`: robust native PCM I/O for WAV/FLAC and fallback decode path.
- `mutagen`: lightweight cross-format tag parsing.
- `numpy/scipy`: deterministic, high-performance DSP primitives.
- `librosa`: mature feature extraction and spectrogram/CQT tooling.
- `pyloudnorm`: ITU-R BS.1770 loudness implementation for LUFS.
- `FastAPI`: typed API layer with simple async/background integration.
- `Next.js + Tailwind + Plotly.js`: responsive operator UI with rich interactive diagnostics.
- `Dash + Plotly` (legacy path): compatibility UI retained for fallback workflows.
- `SQLAlchemy + SQLite`: simple local persistence for run history and artifact pointers.
- `weasyprint`: offline HTML->PDF export path.
- `torch/torchaudio/nnAudio` (optional): CUDA acceleration path for spectrogram-heavy workflows.

## 2. Data Flow

1. Upload file to `data/uploads/<run_id>/`.
2. Create `analysis_runs` row with status `uploaded`.
3. Start async job -> status `queued/running`.
4. Decode to `canonical.wav` (`float32`, 48kHz target).
5. Chunk-scan into on-disk memmap.
6. Compute metrics/timelines/markers/spectrograms.
7. Build Plotly chart payloads.
8. Persist `metadata.json`, `metrics.json`, `charts.json`.
9. Generate report artifacts (`report.html`, `report.pdf`, chart PNG/SVG).
10. Mark run `completed` and expose via API/UI.

## 3. Storage Layout

- `data/audioqi.db`
- `data/uploads/<run_id>/<original-file>`
- `data/runs/<run_id>/canonical.wav`
- `data/runs/<run_id>/audio.f32`
- `data/runs/<run_id>/metadata.json`
- `data/runs/<run_id>/metrics.json`
- `data/runs/<run_id>/charts.json`
- `data/runs/<run_id>/report.html`
- `data/runs/<run_id>/report.pdf`
- `data/runs/<run_id>/charts/*.png|*.svg`

## 4. Metric Definitions (MVP)

- LUFS: `pyloudnorm` integrated + timeline windows.
- True peak estimate: 4x oversampled peak with `resample_poly`.
- Dynamics: sample peak, RMS, crest factor.
- Stereo/phase: per-window correlation, M/S ratio dB, L/R balance dB.
- Clipping: run-length segments where `abs(x) >= 0.999`.
- DC offset: mean waveform offset.
- Noise floor: 10th percentile short-window RMS in dBFS.
- Spectral balance: fixed band energy ratios from STFT.
- Distortion proxies: high-frequency and harsh-band energy ratios.
- Sibilance marker: 6k-10k energy ratio threshold.

## 5. Visualization Requirements

- Plotly interactive figures for all dashboards.
- Chart types:
- waveform + peak/RMS envelope,
- loudness timeline,
- average spectrum,
- stereo/correlation/MS views,
- vectorscope,
- STFT linear/log spectrograms,
- mel spectrogram,
- CQT spectrogram.

## 6. Job System

- `ThreadPoolExecutor` in-process dispatcher for MVP.
- Per-job progress persisted in DB for polling.
- Failure handling stores traceback in `error_message`.
- Upgrade path: Celery/RQ with Redis broker.

## 6.1 API Surface (Current)

- Health: `GET /health`
- Runs: `POST /runs/upload`, `POST /runs/{run_id}/analyze`, `GET /runs`, `GET /runs/{run_id}`, `DELETE /runs`
- Charts/audio: `GET /runs/{run_id}/charts`, `GET /runs/{run_id}/audio`
- Export: `GET /runs/{run_id}/export/json|html|pdf`
- Conversion: `POST /runs/{run_id}/convert`, `GET /runs/{run_id}/conversions`, `GET /runs/{run_id}/conversions/{fmt}/download`
- Mastering: `POST /runs/{run_id}/master`, `GET /runs/{run_id}/mastering`, `GET /runs/{run_id}/mastering/{output_id}/download`

## 7. GPU Strategy

- CPU path is canonical deterministic MVP path.
- Optional CUDA spectrogram helper in `audioqi/gpu/spectrogram.py`.
- API exposes `use_gpu` flag; current analyzer records backend mode.
- Future: unified tolerance-tested CPU/GPU parity layer.

## 8. Testing

- Unit tests for:
- loudness and dynamics on synthetic known signals,
- clipping marker behavior,
- stereo metrics on mono/stereo fixtures.

- Integration test:
- upload -> analyze -> export JSON/HTML on synthetic WAV fixture.

## 9. Security and Offline Constraints

- No external API calls required.
- Local filesystem only.
- CORS open for localhost development; harden for packaging/distribution.

## 10. Roadmap Technical Extensions

- libebur128 optional backend for verified true peak + LRA.
- Demucs stem pipeline with artifact caching.
- Batch analysis worker pool and diff views.
- Artifact detection modules for codec defects.

## 11. Pro Mastering Engine (Implemented)

- Source-aware adaptive preflight:
  - adjusts selected preset parameters from measured issue profile before rendering outputs,
  - currently adapts peak headroom, limiter drive, de-ess strength, spectral targets, and some compression settings.
- Iterative normalization:
  - candidate renders are measured after limiting,
  - search selects the closest LUFS match that still respects the configured true-peak ceiling,
  - replaces the earlier one-pass loudness gain plus peak trim approach.
- Marker-aware corrective passes are now part of mastering:
  - harshness (3k-9k), sub-bass (20-120), mono compatibility, loudness dips, clipping, true-peak risk.
- Iterative refinement loop:
  - bounded by `max_refine_passes` (1..5),
  - pass-by-pass self-check,
  - rollback when score/profile does not improve.
- Stem-rescue fallback:
  - spectral stem split with targeted stem corrections,
  - accepted only on measurable improvement.
- Backend abstraction:
  - `internal`, `auto`, `ffmpeg`, `pedalboard`, `matchering`.
  - `internal` is the default deterministic path; `auto` remains available for explicit advanced backend selection.
  - runtime availability detection + graceful fallback.
- API additions:
  - `/runs/{id}/master` supports `backend`, `reference_run_id`, `max_refine_passes`.
- Manifest additions:
  - `adaptation`, `backend`, `refinement`, `pro_features`.

## 11.5 Spectrogram Resilience (Updated)

- Long or high-sample-rate files now use a lighter visualization input path before STFT, mel, and CQT generation.
- This reduces the chance of long mel spectrogram phases appearing falsely stalled in the UI.
- Frontend stale-stage messaging is advisory; the backend watchdog remains the authoritative stall detector.

See `docs/UPGRADES_REFERENCE.md` for operational details.

## 12. Operator Documentation (Implemented)

- `docs/HELP_GUIDE.md`: operator-facing control/metric/diagnostic glossary.
- `docs/UPGRADES_REFERENCE.md`: pro mastering feature map and integration notes.
- `docs/REFERENCES.md`: technical/library references and standards links.
- In-app guide table in `apps/web-next/app/page.tsx` mirrors these definitions for quick operator context.

## 13. Review And Playback Surface (Implemented)

- Waveform review strip for fast scrubbing and explicit start/end range marking.
- Transport controls for play/pause, seek, looped selection review, and speed changes.
- Optional browser-side EQ monitoring path with manual WAV export.
- Chart grouping and quick-jump navigation for large analysis surfaces.
