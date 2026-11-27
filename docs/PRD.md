# Geekatplay Studio Music Suite — Product Requirements Document

**Maintained by Geekatplay Studio**

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
- Interface in six languages (English, Spanish, German, French, Russian, Ukrainian) with translated backend messages and a user manual per language; six colour themes including a light one.
- Every major panel can float in a window of its own to customise the layout or use a second monitor; windows remember their place, and the last floating layout can be reopened (implemented November 2026).

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

### Studio Editor (implemented November 2026)

- Multitrack editing of audio and MIDI with non-destructive clips, undo and autosave.
- Stem separation, restoration, pitch/time, warp and AI tempo/key matching as background jobs that keep the original.
- Mixing with per-track effects, buses, automation, a true-peak limiter and EBU R 128 metering.
- Recording with punch-in and take comping; piano roll, drum kit, multi-track MIDI import/export with instruments, audio-to-MIDI and section detection.
- *Write an arrangement*: drums, bass, chords, melody, pad and arpeggio written as editable notes from music theory, in 12 styles, with no model.
- Whole song to MIDI: a recording becomes one instrument track per part, from stems and per-instrument models, or optionally MuScriptor (non-commercial) on the whole mix.
- All 128 General MIDI instruments per track, played by a SoundFont (`.sf2`) the user loads for recorded instruments, or by the built-in synth's nearest sound without one.
- Stem separation up to 12 stems with the optional AI separators: 2, 4 or 6 stems, drums into kick, snare, toms, hi-hat, ride and crash, and vocals into lead and backing.
- Sheet music for a MIDI clip (two staves, key and time signature, triplets, eighth-note metres such as 6/8), printable and exportable as PDF.
- Live playing from a USB MIDI keyboard or an on-screen piano; voice effects (vocoder, pitch shift, robot, synth voice, distortion).
- VST3/AU plugins in an isolated process, including instruments such as Surge XT (one-click install, its 3,000 sounds, and its full interface in Music Suite's colours); opt-in in-browser Web Audio Module plugins.
- Export to WAV, FLAC and MP3, or hand the mix to AI Mastering or the AI Song Studio.
- Acceptance and verification status: `docs/EDITOR_ROADMAP.md` section 7.

### AI Song Studio (implemented November 2026)

- Full songs with vocals generated on this computer (ACE-Step 1.5), with optional online generators that use the user's own keys and show a cost first.
- Lyrics and style written by a local language model; albums of up to 20 songs generated in the background.
- Start from an existing song: its tempo, key, time signature, length and a style description are measured to fill the form; then make a new song in its style, restyle, extend, extract an instrument, add a part, or build a full song around it.
- Design and verification status: `docs/GENERATION_ROADMAP.md`.

### Synth Studio, Models & engines, and moving songs (implemented November 2026)

- Synth Studio (`/synth`): design and play sounds with the built-in synth or an instrument plugin, with a piano for mouse, touch, computer keys or a MIDI keyboard.
- Models & engines (`/models`): one page to see the graphics card and install optional engines and models (AI stem separation, the music engine and its models, the lyrics writer). Installs never change a package that is already installed.
- Any song moves between the analyser, the AI Song Studio and the Studio Editor in one or two clicks, and is always added (to a new or existing session, on a new track), never swapped in; it can be split into stems on arrival.

## Non-Functional Requirements

- Fully offline execution.
- Windows 11 first-class runtime.
- Chunk-based scanning and on-disk memmap to handle long files.
- Deterministic analysis given same input + config.
- GPU path optional; CPU path remains default and supported.

## Out of Scope (MVP)

- AI stem separation in the base install (it is an optional pack from Models & engines; the base install has a basic 2/4-stem splitter).
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
