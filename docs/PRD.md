# Geekatplay Studio Music Suite — Product Requirements Document

**Created by Vladimir Chopine · Geekatplay Studio**

## Product

AudioQI is a local-first offline audio quality inspector for music production workflows.
It analyzes individual songs and outputs mastering-oriented diagnostics, interactive charts, and exportable reports.

## Vision

Provide studio-grade technical and perceptual analysis in a reproducible local tool:

- No cloud dependencies.
- Deterministic outputs.
- Export-ready visuals and machine-readable metrics.

## Target Users

- Producers and mix/mastering engineers.
- Content creators delivering to streaming/video platforms.
- Audio hobbyists comparing rendering chains and codecs.

## MVP Scope

### Input and Project Flow

- Upload/select one audio file (`wav`, `flac`, `mp3`, `aac`, `ogg`, others via ffmpeg).
- Metadata extraction (`ffprobe` + `mutagen`).
- Run asynchronous analysis with progress.
- Persist run history in SQLite.

### Analysis

- Loudness: integrated LUFS, momentary timeline, short-term timeline, LRA approximation.
- Dynamics: peak, RMS, crest factor, true-peak estimate (4x oversampling).
- Stereo/phase: correlation timeline, M/S ratio, L/R balance, vectorscope.
- Technical flags: clipping segments, DC offset, noise floor estimate.
- Tonal/spectral: spectral balance bands, average spectrum, sibilance ratio timeline.
- Spectrograms: STFT linear/log, mel, CQT.

### UX

- Next.js + Tailwind UI with:
- upload + run controls,
- playback via audio element,
- timeline slider for scrub reference,
- dual-marker timeline segment selection for focused review,
- waveform review strip and transport controls,
- optional browser-side EQ monitoring and WAV export,
- marker visibility (clipping/loudness dips/sibilance/mono warnings),
- interactive Plotly charts,
- AI mastering controls (mode/preset/backend/reference/refine passes),
- analyzer-suggested mastering settings including mode, preset, backend, loudness/peak targets, variants, and refine-pass guidance,
- source-aware adaptation visibility and post-master diagnostics,
- post-master self-check interpretation and recommended follow-up fixes,
- stage ticker and stage-detail feedback for long-running analysis steps.

### Exports

- JSON metrics summary.
- HTML report.
- PDF report (if PDF engine available).
- PNG/SVG chart assets for reports.

### Documentation and Operator Help

- Include in-repo operator help and references:
- `docs/HELP_GUIDE.md`
- `docs/REFERENCES.md`
- `docs/UPGRADES_REFERENCE.md`
- Provide in-app glossary/help text for metrics, charts, markers, and mastering controls.

## Non-Functional Requirements

- Fully offline execution.
- Windows 11 first-class runtime.
- Chunk-based scanning and on-disk memmap to handle long files.
- Deterministic analysis given same input + config.
- GPU path optional; CPU path remains default and supported.

## Out of Scope (MVP)

- Stem separation default path.
- Batch folder mode.
- Codec artifact forensic models.
- Preset target policy engine (streaming/broadcast/film).

## Acceptance Criteria

1. User can upload `mp3/wav/flac` and run analysis without blocking the UI.
2. Job status/progress updates are visible in UI.
3. Results include loudness, true peak, dynamics, stereo metrics, markers, and spectrogram suite.
4. UI provides audio playback and marker list tied to time.
5. Export endpoints generate JSON and HTML; PDF is generated when supported.
6. Unit and integration tests pass on synthetic fixtures.

## Roadmap

### Implemented Pro Mastering Upgrades

- Source-aware adaptive preflight tuning from detected issue classes.
- Iterative LUFS/true-peak normalization based on measured post-limiter output.
- Marker-aware corrective mastering in flagged timeline regions.
- Bounded iterative self-check loop with rollback on non-improving passes.
- Stem-rescue fallback pass for stubborn issues.
- Optional mastering backend selector (`internal/auto/ffmpeg/pedalboard/matchering`) with `internal` as the safe default.
- Optional reference-driven mastering path via `reference_run_id`.
- Extended manifest diagnostics (`adaptation`, `backend`, `refinement`, `pro_features`).
- In-app operator guidance + expanded docs (`HELP_GUIDE`, `UPGRADES_REFERENCE`, `REFERENCES`).

### Phase 2 (Pro)

- Optional Demucs stem analysis (vocals/bass/drums/other).
- Oversampled true peak beyond 4x and optional libebur128 backend.
- Codec artifact heuristics (birdies/pre-echo).
- Reference target packs and pass/fail scoring.
- Batch mode + run-to-run comparison.
