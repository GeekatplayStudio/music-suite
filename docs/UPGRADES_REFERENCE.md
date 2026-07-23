# Geekatplay Studio Music Suite Pro Upgrades Reference

**Created by Vladimir Chopine · Geekatplay Studio**

## Purpose

This document tracks the pro-level mastering upgrades added to AudioQI, why they were added, and how they are wired through API, DSP engine, UI, and tests.

## Implemented Upgrades

### 1) Marker-aware corrective mastering

The mastering engine now applies local, issue-specific fixes before final self-check scoring:

- `harshness_band`: local 3k-9k attenuation pass (band-limited).
- `sub_bass_heavy`: local 20-120 attenuation pass (band-limited).
- `mono_incompatibility`: local M/S narrowing + low-end mono blend in flagged windows.
- `loudness_dip`: local gain lift in dip windows.
- `clipping`: local attenuation on clipping windows.
- `true_peak_risk`: safety limiter pass.

All corrections are smoothed with segment ramps to reduce zipper artifacts.

### 1.5) Source-aware adaptive preflight

Before the main render, the mastering engine now profiles the source and can safely adjust preset parameters:

- tighter true-peak ceiling and lighter limiter drive when clipping or true-peak risk is detected
- stronger de-essing and slightly lower top-end target when harshness is detected
- lower low-band target and slightly stronger control when sub-bass excess is detected
- lighter limiter drive when mono-compatibility risk is detected
- slightly lower compression threshold when loudness dips are detected
- gentler compression/limiting when crest factor suggests the source is already too dense

These changes are recorded in the mastering manifest under `adaptation` so operators can see exactly what was changed and why.

### 2) Bounded iterative self-improvement loop

Mastering now runs a bounded correction loop with rollback:

- Configurable `max_refine_passes` (API/UI, clamped 1..5).
- Each pass re-profiles markers and issue score.
- Accepts pass only if profile improves.
- On non-improving pass, rollback triggers and loop stops.
- Manifest stores refinement telemetry:
  - accepted passes
  - history per pass
  - rollback count
  - fallback applied flags
  - final issue score

### 3) Stem-rescue fallback

If issues remain after refinement, a stem-based rescue pass is attempted (when enabled by mode):

- Uses spectral stems (`bass`, `vocals`, `drums`, `other`).
- Applies stem-specific corrections based on remaining issue profile.
- Kept only if profile improves.

### 4) Optional mastering backends

New backend selector:

- `internal` (default deterministic chain)
- `auto` (advanced runtime selection)
- `ffmpeg`
- `pedalboard`
- `matchering` (reference-based; requires reference run/file)

Behavior:

- Backend availability is detected at runtime.
- Unavailable backends auto-fallback to internal.
- Manifest records requested backend, selected backend, availability map, and notes.
- UI and API defaults now start on `internal`; `auto` remains available for explicit advanced use.

### 4.5) Iterative normalization

Normalization is no longer a single LUFS gain pass.

- The engine now renders candidate outputs, measures the actual post-limiter loudness and true peak, and searches for the closest valid result.
- The objective favors the requested LUFS target while penalizing true-peak overshoots.
- If loudness and ceiling cannot both be met perfectly, the selected output prefers the safer true-peak-compliant result.

### 5) Optional EBU metrics hook

If `pyebur128` is installed, EBU R128 fields are appended to mastering metrics/profile payloads when available.

## API Additions

`POST /runs/{run_id}/master` now accepts:

- `backend` = `auto|internal|ffmpeg|pedalboard|matchering`
- `reference_run_id` (optional; used for matchering workflows)
- `max_refine_passes` (1..5)

Validation:

- Invalid backend returns `400`.
- Missing reference run for `reference_run_id` returns `404`.

## UI Additions

AI Mastering panel now includes:

- backend selector
- max refine passes input
- reference run id input
- source-aware adaptation summary
- backend selected status
- refinement summary (accepted/max passes, final score, rollbacks, stem fallback)
- detected pro module availability badges
- analyzer-applied suggested backend and refine-pass values

Session and review UI also includes:

- stage ticker + stage detail progress text
- hard reset action for clearing stalled workers and queued jobs
- de-duplicated marker-near-playhead table with timeline jump support
- timeline segment selection used for focused graph review

## In-App Help Updates

Help text now includes:

- backend selector usage
- source-aware adaptation behavior
- iterative normalization behavior
- refine pass/rollback semantics
- reference run guidance for matchering
- self-check interpretation and follow-up fix hints
- save/export behavior guidance for conversion/master outputs
- guidance for long spectrogram stages and advisory stale-stage warnings

## Manifest Additions

Each mastering manifest now includes:

- `adaptation`
- `backend`
- `refinement`
- `pro_features`

Existing fields remain unchanged to preserve compatibility.

## Packaging

Added optional dependency group:

- `pro = [pyebur128, pedalboard, matchering]`

Core install remains unchanged and fully offline-capable without extras.

## Related Docs

- `docs/HELP_GUIDE.md`
- `docs/REFERENCES.md`
- `docs/PRD.md`
- `docs/TRD.md`

## Test Coverage

Updated tests cover:

- normalization accuracy and true-peak protection
- presence of new manifest section (`adaptation`)
- presence of new manifest sections (`backend`, `refinement`, `pro_features`)
- backend/reference validation path
- completion path with backend+reference parameters

## Operational Notes

- `matchering` requires a valid reference track.
- `pedalboard`/`matchering` are optional runtime integrations with graceful fallback.
- For deterministic production workflows, `internal` backend remains canonical.
