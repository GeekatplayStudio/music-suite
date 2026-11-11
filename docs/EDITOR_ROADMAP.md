# Multitrack Editor — Reference and Roadmap

**Geekatplay Studio Music Suite · Studio Editor**

This document is the working reference for the multitrack audio editor: what it is modelled on, which libraries it uses and why, how it is built, what ships today, and what comes next. Research was done on 2026-11-09; items marked *(unverified)* could not be confirmed from a primary source that day.

---

## 1. Goal

A local-first, Audition-class multitrack editor inside Music Suite:

- Load several tracks, or split one song into stems, and edit each independently.
- Clip editing on a waveform timeline: cut, split, trim, move, duplicate, fade, reverse, ripple delete.
- Per-track mixing: volume, pan/balance, stereo width, 3-band EQ, mute, solo.
- Restoration and transformation: noise reduction, loudness normalisation, pitch shift, time stretch.
- AI-assisted matching of tempo, key, beat phase and loudness between tracks.
- Industry-standard plugin hosting (VST3, Audio Units).
- Nothing leaves the machine. The existing [guardrails](../GUARDRAILS.md) apply unchanged.

---

## 2. What we benchmarked against

### 2.1 Suno Studio (Premier tier, Studio 2.0, August 2026)

| Area | Suno Studio | Music Suite Editor |
|---|---|---|
| Stems | Auto Split up to 12 stems; Split from Mix (one part + complement); Advanced Split from ~100 instruments. Stems land on new time-aligned tracks. | 2 / 4 / 6 stems, time-aligned on new tracks. Engine: `audio-separator` (BS-RoFormer) → Demucs → built-in fallback. **Phase 1** |
| Clip editing | Split (Cmd/Ctrl+E), trim, loop, clip gain, reverse, disable, fade toggle, Duplicate Time / Delete Time. | Split, trim, move across tracks, clip gain, reverse, mute, drag fades, duplicate, range delete and ripple delete. **Phase 1** |
| Warp / pitch | Warp markers, pitch stepper, formant knob, 0.5×/2× speed. | Pitch ±24 st, stretch 0.25–4×, warp markers and beat quantise, all rendered with Rubber Band. **Shipped.** Live warp: **Phase 4** |
| Mixing | Volume, pan, mute, solo; automation lanes. | Volume, pan, width, EQ, mute, solo, meters, volume and pan automation. **Shipped** |
| Effects | Seven built-ins (compressor, EQ, reverb, convolution, delay, distortion, gate). No VST/AU. | Real-time EQ, gate, compressor, delay and reverb per track and bus; VST3/AU rendering through Pedalboard. **Shipped.** Distortion: **Phase 3** |
| Take lanes / comping | Two takes per generation, comp to main track. | Loop-recorded takes on lanes with whole or per-range comping. **Shipped** |
| MIDI | Piano roll, audio-to-MIDI, import/export. | Instrument tracks, piano roll, audio-to-MIDI, .mid import/export. **Shipped.** Keyboard input, samplers: **Phase 4** |
| Generation | New stems against existing tracks from a prompt. | Via the optional ComfyUI integration. **Phase 4** |
| Export | Full song, range or multitrack; 32-bit/48 kHz WAV or MP3. | Mixdown, range and per-track WAV (24-bit or 32-bit float), FLAC, MP3. **Shipped** |
| Layout | Transport on top, track lanes in the centre, context panel that changes with the selection, right-click actions. | Same model: select, then act in the inspector. |

Suno does not publish its full stem list, and no global key-change control was found.

### 2.2 Adobe Audition and Sound Forge Pro

Feature parity targets *(Audition checklist is from general knowledge; Adobe's help pages were unreachable)*:

| Capability | Status |
|---|---|
| Non-destructive multitrack view | **Phase 1** |
| Razor / split, trim, ripple delete, nudge, snapping | **Phase 1** |
| Fades with drag handles, curve shapes, automatic crossfades on overlap | **Shipped** |
| Noise reduction with noise print | **Phase 1** |
| Loudness normalise to LUFS with true-peak ceiling | **Phase 1** |
| Stereo tools: balance, width, mono, phase scope and correlation | **Shipped.** Mid/side EQ: **Phase 3** |
| Track automation: volume, pan, reverb mix, delay mix, compressor threshold | **Shipped.** Remaining effect parameters: **Phase 3** |
| Spectral frequency display and spectral repair | **Shipped** (rectangular selections) |
| DeClick, DeHum, DeClip, DeReverb | **Shipped** |
| Recording with punch-in, take lanes and comping | **Shipped** |
| Batch processing and favourites | **Shipped** |
| Plugin hosting (VST3, AU) | **Phase 1** offline render. Real-time preview: **Phase 3** |

Sound Forge is a single-file destructive editor; the existing analysis workspace already covers that role, so the new work targets the multitrack side.

---

## 3. Library audit and decisions

### 3.1 Upgraded on 2026-11-09

Every direct and transitive dependency was moved to its latest release and verified (backend tests, lint, type check, production build, npm audit).

Notable jumps: FastAPI 0.140 → 0.162, Starlette 1.3 → 1.10, librosa 0.11 → 1.0, NumPy 2.4 → 2.5, pandas 3.0 → 3.1, Plotly 6.9 → 7.1, MCP SDK 1.28 → 2.3, SQLAlchemy 2.0 → 2.1, Next.js 16.3 → 16.4, React 19.3.1, Tailwind 4.3.5, ESLint 9 → 10, lucide-react 1.70.

**Held back:** TypeScript stays on 6.0.3. TypeScript 7.0 compiles the project, but `typescript-eslint` does not support it yet, so linting breaks. Revisit when typescript-eslint supports TS 7.1 or later.

### 3.2 Chosen for the editor

| Need | Choice | Why | Fallback |
|---|---|---|---|
| Timeline UI | **Custom Canvas 2D timeline** | No feature ceiling; all gestures stay client-side; no extra styling runtime. `waveform-playlist` v16 is the only ready-made DAW timeline, but it needs styled-components, changes major version almost monthly, has one maintainer and forbids overlapping clips. `wavesurfer.js` and `peaks.js` are single-file renderers. | — |
| Playback engine | **Web Audio API** (native graph) | Sample-accurate scheduling, offline render with the identical graph for export. | — |
| Stem separation | **`audio-separator`** with BS-RoFormer | Tops the MVSEP leaderboard (~12.3 dB vocal SDR against ~8.2 dB for htdemucs). | Demucs 4.1 (`htdemucs`, `htdemucs_6s`), then built-in HPSS + mid/side split |
| Time stretch / pitch | **Pedalboard** (Rubber Band R3) | Best open offline quality; already an optional dependency. | `rubberband` CLI, then librosa |
| Browser stretch (Phase 3) | **signalsmith-stretch** (MIT, WASM) | Real-time worklet; best between 0.75× and 1.5×. | — |
| Noise reduction | **`noisereduce`** 3.x + FFmpeg `afftdn` | Material-agnostic spectral gating; supports a noise print. Speech models (DeepFilterNet, RNNoise) damage music. | Built-in STFT gate |
| Beats / downbeats | **`beat_this`** 1.1 | Current state of the art, MIT, no madmom dependency. | librosa |
| Key | Krumhansl-Schmuckler on chroma-CQT | Dependency-free. Essentia is better but AGPL with no Windows wheels. | — |
| Plugins | **VST3 + AU via Pedalboard** | The two formats that cover nearly all commercial plugins on macOS and Windows. | — |

**Rejected:** Spleeter (unmaintained, outclassed), madmom (Python ≤3.9, non-commercial models), allin1 (hard Windows build), CLAP and LV2 hosting (no maintained Python host).

### 3.3 Licensing notes

- Pedalboard and Rubber Band are **GPLv3**; Matchering is GPLv3 as well. The suite is MIT, and these stay *optional extras* loaded at runtime. Anyone redistributing a bundled build must comply with the GPL or buy a Rubber Band commercial licence.
- Many community RoFormer weights are CC-BY-NC-SA. Check a model's licence before using its output commercially. Demucs weights have an unclear licence.

---

## 4. Architecture

```
Browser (Next.js /editor)                    FastAPI (loopback)
┌─────────────────────────────────┐          ┌──────────────────────────────┐
│ Canvas timeline · track headers │          │ /editor/projects   project + │
│ Inspector · transport · meters  │  JSON    │                    state     │
│                                 │ ───────► │ /editor/.../assets canonical │
│ Reducer store with undo history │          │                    WAV       │
│ Web Audio graph (live + offline)│ ◄─────── │ /editor/.../jobs   separate, │
│ Client-side peaks + WAV export  │  WAV     │   stretch, pitch, denoise,   │
└─────────────────────────────────┘          │   normalize, analyze, match, │
                                             │   plugin                     │
                                             └──────────────────────────────┘
```

**Rules**

1. **Interactive gestures never touch the network.** Drag, trim, fade, scrub, zoom and mixing run entirely in the browser. Only heavy DSP goes to the backend, as a job with progress.
2. **Non-destructive by default.** A clip is a window (`offset`, `duration`) onto an immutable asset. Backend processing creates a *new* asset; the original is kept, so every operation can be undone.
3. **One graph, two contexts.** The same graph builder feeds live playback and `OfflineAudioContext` export, so the export always matches what was heard.
4. **Guardrails unchanged.** Loopback only, UUID-validated identifiers, sanitised filenames, streamed uploads with size and duration caps, all paths resolved under `data/editor/`, plugin identifiers are server-issued and never client paths.

**Signal chain per track**

`clip source → clip gain + fade curves → 3-band EQ → gate → compressor → delay / reverb → stereo width (mid/side matrix) → pan → track fader → mute/solo → meter → master or bus (plus post-fader sends to buses) → master fader → true-peak limiter → loudness, true-peak and phase meters → output`

A bus is `input → gate → compressor → delay / reverb → bus fader → master`.

**Project state** (stored as JSON by the backend, schema version 1): tracks, clips, tempo, time signature, key, loop region, snap settings, master level, and cached per-asset analysis.

---

## 5. Roadmap

### Phase 1 — Core editor *(this release)*

- Projects with autosave; import by upload, drag-and-drop, or from an existing analysis run.
- Canvas timeline with waveforms, time and bars/beats rulers, zoom and scroll.
- Tools: Select, Razor, Range. Move (across tracks), trim, split, duplicate, copy/cut/paste, delete, ripple delete, nudge, drag fades, clip gain, reverse, clip mute.
- Snapping to grid, clip edges and playhead, with a visible indicator and Alt to bypass.
- Track volume, pan, stereo width, 3-band EQ, mute, solo, colour, rename, reorder; live meters.
- Loop playback, undo/redo (200 steps), keyboard shortcuts with an in-app reference.
- Backend jobs: stem separation, time stretch, pitch shift, noise reduction (optional noise print from the range selection), LUFS normalise, tempo/key/beat analysis, VST3/AU render.
- **AI Match**: stretch to the project tempo (half/double-time aware), transpose by the smallest interval to the project key (relative keys count as compatible), align the first downbeat to the bar grid, and optionally match loudness.
- Export: mixdown or per-track WAV at 24-bit or 32-bit float.

### Phase 2 — Mixing depth *(shipped 2026-11-09)*

- **Automation lanes** for volume, pan, reverb mix, delay mix and compressor threshold. Press A (or use the lane menu) to show one, click the line to add a point, drag to shape it, double-click a point to remove it. Volume and pan lanes sit on top of the fader and knob; effect lanes replace the control while they have points.
- **Fade shapes** (linear, equal-power, S-curve) per clip edge, and automatic equal-power crossfades wherever two clips overlap on a track.
- **Effect rack** per track and per bus: gate, compressor, delay, reverb, after a 3-band EQ whose frequencies and mid-band Q are adjustable.
- **Buses and sends**: reverb, delay or group buses; each track can be routed to a bus instead of the master and can send post-fader to any other bus.
- **True-peak limiter** on the master: 5 ms look-ahead, 4× oversampled peak detection, two passes, adjustable ceiling.
- **Metering**: EBU R 128 integrated, short-term and momentary loudness plus maximum true peak for each playback pass, and a phase scope with a correlation bar.
- **Markers** (K, drag on the ruler, `[` / `]` to jump) and **sections**: name a highlighted range (Shift+R), then select, repeat or cut it as a block. Repeating and cutting move later clips, markers, sections and automation with them.
- **Export**: highlighted range, FLAC and MP3 (encoded by the suite's FFmpeg; nothing is kept on disk), and "Send mix to Mastering".

The gate, limiter and loudness meter are custom audio processors (`public/editor-worklets.js`) because the Web Audio API has no built-in equivalents. If a browser cannot load them, the gate is skipped, the limiter falls back to a fast compressor and the loudness figures stay blank.

Deferred to Phase 3: automation of the remaining effect parameters, bus automation and bus meters, a spectrum display on the EQ, and distortion.

### Phase 3 — Restoration and performance *(shipped 2026-11-09)*

- **Restore tools**: DeClick, DeHum (automatic 50/60 Hz), DeClip, DeReverb. NumPy/SciPy only, so they work on every install.
- **Spectral view** (W): log-frequency spectrogram of the selected clip; drag a box, then Attenuate or Heal. Only the box changes.
- **Recording**: uncompressed, sample-stamped capture with call-processing switched off and output latency compensated.
  - With a range highlighted: punch-in with 2 s pre-roll and automatic stop.
  - With the loop on: every pass becomes a **take** on its own lane, newest audible. "Use this take" comps a whole passage or only the highlighted range.
  - Takes never land on top of existing audio.
- **Warp**: pin moments in a clip and say where each should land; the stretches between markers are rendered with Rubber Band and crossfaded. Also "Quantise beats", which finds the played attacks and moves each onto the project tempo grid, and "Stretch to the length of the highlighted range".
- **Plugins**: parameter sliders for the chosen VST3/AU plugin, and **Audition**, which renders 8 s from the playhead through the plugin and plays it without changing the session.
- **Batch processing** on all selected clips, and **Favourites**: save the last one to three processing steps as a one-click chain (kept in the browser, available in every session).
- **Mixing additions**: distortion; automation lanes for EQ low/mid/high gain and delay feedback; level meters on buses; a live spectrum with the EQ curve on each track.
- **Waveform overviews computed on the server** and cached beside each file, so waveforms appear before the audio has finished decoding.

Two items changed shape, because of how the editor is built:

- **Warp is rendered, not live.** Clips play through the browser's sample player; stretching in real time needs a different playback engine (a signalsmith-stretch worklet per clip). Dragging markers directly on the waveform with live preview moves to Phase 4.
- **Plugin preview is an audition, not live.** VST3/AU plugins run in the Python backend, so the browser cannot process through them in real time. In-browser plugins (Web Audio Modules) in Phase 4 are the route to live plugin preview.

Moved to Phase 4: lasso and brush selections in the spectral view, mid/side EQ, bus automation, automation of the remaining effect parameters, loop-record auto-comping.

### Phase 4 — Composition *(first pass shipped 2026-11-09)*

Shipped:

- **MIDI clips and instrument tracks.** A MIDI clip holds notes and plays the track's built-in synth (`lib/editor/synth.ts`). Since 2026-11-11 it has three oscillators with unison and stereo spread, FM, noise, a 12/24 dB filter with drive and key follow, two ADSR envelopes, two tempo-syncable LFOs, an eight-route modulation matrix, mono glide and 17 presets levelled by measurement. Each voice is native Web Audio nodes, so live play, previews and exports share it. Older projects migrate automatically. The synth feeds the track's EQ, effects, sends and automation like any audio, and is included in exports. MIDI clips move, trim, split and duplicate like audio clips.
- **Piano roll** (P): click to add a note, drag to move it in time and pitch, drag its right edge to resize, right-click to delete; per-note velocity; snapping to sixteenths of the project tempo; notes sound as you place them.
- **MIDI files**: import `.mid` (formats 0 and 1, tempo changes honoured; one track per MIDI track) and export any MIDI clip. Both happen in the browser.
- **Audio to MIDI** ("Convert to MIDI notes"): transcribes a clip onto a new instrument track. Uses Spotify's `basic-pitch` (chords and melodies) when installed, otherwise pYIN, which follows one note at a time.
- **Song-section detection** ("Detect song sections"): finds where harmony and timbre change and labels repeated parts alike (A, B, A, B). The sections appear on the ruler, ready for the Phase 2 Repeat and Cut out tools.
- Also: transpose and quantise for MIDI clips.
- **Instrument plugins** (2026-11-11): a MIDI clip can be played through an installed VST3 / AU instrument. The isolated plugin worker gained an `instrument` mode (Pedalboard renders the notes as raw MIDI) and an `editor` mode (opens the plugin's own window and returns its state, base64, when closed; the app can close it through `POST /jobs/{id}/close-window`, which the worker watches for). A restored state is followed by 0.25 s of silence because Surge XT applies it on its next audio block. While the window is open the worker keeps the plugin's audio engine running, as a DAW does, and plays the clip's notes in a loop to the default output on Play (`POST /jobs/{id}/preview`). It paces itself by the clock because Pedalboard's `AudioStream.write` spins while its buffer is full: measured about 8% of one core with Surge XT playing, versus a full core before. A patch picked from Surge XT's own patch menu is not taken in this host (the menu opens, the pick is dropped before Surge's loader runs; a 10-minute file and stack monitor saw no patch file opened). The editor therefore offers Surge XT's library itself (`audioqi/editor/sounds.py`): it lists the `.fxp` files of the factory, third-party and user libraries by opaque id, and builds a saved sound by wrapping the file's `sub3` chunk in JUCE's VST3 state container (`VC2!` binary XML, `IComponent` in JUCE's 6-bit text encoding, an empty `JUCEPrivateData` trailer). Verified: Surge XT reports the picked patch's name after loading such a state, and renders change accordingly. Play now starts a listening session without a window (`plugin_window` with `window: false`); picking a sound during a session switches it live (`POST /jobs/{id}/load`), applied by the audio thread between blocks. **Synth Studio** (`/synth`, 2026-11-11) is a page of its own: the sound editor's controls and preset bar were split out of the dialog (`SynthControls`, `PresetBar`) and are shared by both; a responsive piano (`components/synth/piano.tsx`) fits 1 to 7 octaves to its width and plays by pointer, touch glide and computer keys; plugin instruments are auditioned without a project through `POST /editor/audition` (one at a time, no window). Sounds export and import as `.mssound` files (`lib/editor/sound-file.ts`): JSON with `format: music-suite-sound`, `version: 1` and either a synth patch or a plugin's name and saved state; imports are normalised and checked. Favourite plugin sounds are kept per plugin in the browser and listed first. **Live playing** (2026-11-11): a session started with `live: true` renders in 256-frame blocks into a 512-frame output buffer and opens a loopback UDP socket (port published in its control folder; datagrams carry a per-session token, then 3-byte MIDI messages). `POST /jobs/{id}/midi` and `POST /audition/{key}/midi` validate note on/off, controller and pitch-bend messages and forward them. Measured with Surge XT on an M5 MacBook Air: browser request 5 ms median (6 ms p90), 4–5 ms average wait for an audio block (10.6 ms worst), then 5.3 ms block and up to 10.7 ms buffer: about 15–26 ms before the output device. In the editor, MIDI keyboard events go to the running session of the played track instead of the built-in synth, and note takes record as before. Not tested with a hardware MIDI keyboard. Jobs `render_instrument` and `plugin_window` need no source asset; the state is stored on the track (`pluginInstrument`). `audioqi/editor/instruments.py` installs Surge XT 1.3.4 (GPL-3.0) in one click from pinned release files checked by size and SHA-256: the plugin-only zip into the user's VST3 folder and the portable content into `~/Library/Application Support/Surge XT` (macOS) or a `SurgeXTData` folder beside the plugin (Windows), the locations Surge's own code searches. The scanner now also reads the per-user Windows VST3 folder.

Library note: `basic-pitch` 0.4 is the best open-source polyphonic transcriber, but it pins an old NumPy and cannot be installed on Python 3.13+, including this machine. The code uses it when present; that path has not been run here.

Second pass (2026-11-09):

- **Piano roll**: shift-drag to select several notes, move them together, copy and paste at the playhead, delete, shared velocity, zoom (buttons or Ctrl/Cmd+wheel) and sideways scrolling. Rows no longer shift while notes are added.
- **Drum kit**: an instrument track can be switched from the synth to a built-in kit (kick, snare, clap, hats, toms, cymbal on their General MIDI pitches). The piano roll becomes a labelled drum grid.
- **Note input**: with "Note input" on, the keys A W S E D F T G Y H U J K (or a connected MIDI keyboard) add notes at the playhead and step it forward.
- **Warp markers on the waveform**: Alt-click a selected clip to pin a moment, then drag its dashed line to where it should land. Applying still renders through Rubber Band.
- **Generate a part**: describe a new part for the selected clip; a local ComfyUI running the suite's Sonic Holodeck nodes (MusicGen) generates it at the project tempo and it lands on a new track. Only a loopback ComfyUI is ever contacted.

Third pass (2026-11-09) — in-browser plugins:

- **Web Audio Modules 2.** Each track has one insert slot, after its own effects, for a WAM effect. Plugins come from the community catalogue (53 effects at the time of writing) or any `https://` address, show their own control panel, run live, are re-created on the export context so they are included in exports, and have their settings saved with the session.
- This is opt-in per browser and is the suite's one deliberate exception to "local only"; see the Studio Editor section of `GUARDRAILS.md` for exactly what is fetched and the risk a plugin carries.

Fourth pass (2026-11-09) — MIDI keyboard and voice effects:

- **MIDI keyboard connector.** One Web MIDI connection for the whole editor, with a header button that connects, lists keyboards as they are plugged in or out, and lets you choose one. Keys play the selected track live (velocity, sustain pedal, ±2-semitone pitch bend; system messages such as Roland's active sensing are ignored). On a track with a MIDI clip, the record button records the performance as a new MIDI clip, compensated for output latency and rounded to whole bars when snapping is on.
- **Voice effects** (an AudioWorklet in each track's effect chain, after the gate): a 20-band vocoder whose carrier follows the sung pitch (YIN, snapped to semitones), holds one note, or is played from the MIDI keyboard; a two-tap pitch shifter (chipmunk / monster / harmony); a ring-modulator robot; a synth voice that follows pitch and loudness; and a megaphone distortion. Thirteen presets. Included in exports.
- **Header layout**: the tempo and loudness readout has a fixed width, so a tempo change no longer moves the buttons beside it.

Not done, and why:

- **Keyboard-played vocoder notes in exports.** Held keys steer the vocoder live only; exports use the saved carrier setting. Recording the keys onto a MIDI track that feeds the vocoder would fix this.
- **Live microphone through the voice effects.** Recording does not yet monitor the input through the track's effects.
- **Live (real-time) warp audio.** Markers can now be dragged on the waveform, but you hear the result only after applying. `signalsmith-stretch` (MIT) can do it; wiring a second playback path through it is the remaining work.
- **Sample-based instruments**, lasso and brush selections in the spectral view, mid/side EQ, bus automation, and automation of the remaining effect parameters.

---

## 6. Interface design principles

The interface was designed against established human-factors findings. Each row lists the rule and how the editor applies it. This is a heuristic evaluation, not a user study; Section 7 lists what was measured.

| Principle | Finding | Applied as |
|---|---|---|
| **Fitts's law** | Acquisition time grows with distance and shrinks with target size. | The play button is 44 px, other toolbar buttons 36 px, and all sit along the top edge. Clip trim zones are 8 px wide but run the full height of the clip, and fade handles are 12 px. |
| **Hick's law** | Decision time grows with the number of choices. | Three tools only (Select, Razor, Range). Everything else lives in the context-sensitive inspector or behind a shortcut. |
| **Gestalt: common region, proximity, similarity** | Items in a shared region or colour read as a group. | Each track's header and lane share one row and one colour. Stems created from one clip are adjacent and inherit related hues. Colour is never the only cue: tracks are also named and numbered (WCAG 1.4.1). |
| **Direct manipulation** (Shneiderman) | Visible objects, incremental reversible actions, immediate feedback. | Drag the object itself to move, trim or fade; the waveform updates during the drag; every action is one undo step. |
| **Response-time limits** (Nielsen) | 0.1 s feels instant, 1 s keeps flow, 10 s holds attention. | All gestures render in the same animation frame. Backend jobs longer than a second always show a named stage and a progress bar. |
| **Recognition over recall** | Visible options beat memorised ones. | Every toolbar control has a tooltip with its shortcut; `?` opens the full shortcut list; the cursor changes to show what a click will do. |
| **Error prevention and recovery** | Make errors hard and recovery easy. | Non-destructive edits, 200-step undo, autosave, processing never overwrites the source. |
| **Cognitive load / progressive disclosure** | Working memory is limited. | The inspector shows only what applies to the current selection: project settings, or clip tools, plus the selected track's mixer. |
| **Contrast** (WCAG 2.2) | 4.5:1 for text, 3:1 for meaningful graphics. | Verified numerically for text, waveforms, playhead and selection outlines (Section 7). |
| **Dark interface** | Dark mode is *not* more legible in general; its real value is low glare in dim rooms and letting coloured signal data stand out. | Dark theme with a blue-grey base rather than pure black, and high-luminance waveforms. |
| **Convention** | Transfer from tools people already know. | Space play/stop, S or Cmd/Ctrl+E split, V/C/R tools, Cmd/Ctrl+Z undo, Cmd/Ctrl+D duplicate, M/Shift+S mute/solo, Home/End, +/− zoom. |

---

## 7. Verification log

Filled in at the end of each phase.

### Phase 1

Tested on 2026-11-09 (macOS arm64, Python 3.14, Chromium) with two generated songs (120 BPM and a noisy 100 BPM loop).

**Automated**

- Backend: 212 tests pass (87 new editor tests covering every route, the security rejections and each processing operation on the fallback engines).
- Frontend: TypeScript, ESLint and the production build are clean; `pnpm audit --prod` reports no known vulnerabilities.

**Exercised by hand in the browser**

| Check | Result |
|---|---|
| Add media to new tracks; import through the file picker | Pass |
| Move a clip, trim an edge, drag a fade handle, reverse | Pass |
| Split at the playhead; undo | Pass |
| Range tool + ripple delete across all tracks (offsets and positions checked in the saved state) | Pass |
| Context menu | Pass |
| Playback, clock, track and master meters, loop | Pass |
| Tempo/key detection (`beat_this`): 120.0 BPM detected on the 120 BPM song | Pass |
| AI match: 100 BPM loop re-rendered and re-detected at 120.0 BPM, clip rescaled | Pass |
| 4-stem separation (`audio-separator`): four aligned stem tracks, source clip muted | Pass |
| Noise reduction (`noisereduce`): clip swapped to the denoised take | Pass |
| 24-bit mixdown: valid stereo 48 kHz WAV of the right length with signal | Pass |
| Autosave and reload restore the session | Pass |

**Measured design checks**

- Waveform against its clip background: 5.0:1 to 7.5:1 across the eight track colours; 3.7:1 or better when selected; 3.1:1 when muted (minimum 3:1).
- Clip label text: 5.6:1 or better; ruler text 9.3:1; secondary panel text 7.0:1 or better (minimum 4.5:1).
- Playhead 18.7:1 and range edges 12.2:1 against the lane.
- Three tools in the palette; play button 44 px, other toolbar buttons 36 px, track buttons 24 px.

**Not yet verified**

- Opening a song from the analysis workspace ("Studio Editor" button) is covered by API tests but was not clicked through.
- Pitch shift, time stretch, loudness normalise and the 2- and 6-stem options were run through the API tests and share the UI path tested above, but were not each clicked.
- Rendering through a real VST3/AU plugin: plugins are listed, but no render was run.
- Per-track export, drag-and-drop from the desktop, Windows, Firefox and Safari.
- No usability study with real users; Section 6 is a heuristic evaluation.

### Phase 2 (first pass)

Tested on 2026-11-09 with the same two generated songs.

**Automated**

- Backend: 215 tests pass, including 3 new tests for the FLAC/MP3 encode route (valid output, rejection of non-WAV input, nothing left on disk).
- Frontend: TypeScript, ESLint and the production build are clean.

**Exercised by hand in the browser**

| Check | Result |
|---|---|
| A session saved in the Phase 1 format loads and gains the new fields | Pass |
| Volume automation: add a point, add and drag a second; rendered track level falls by 51 dB across the ramp, matching the lane | Pass |
| Automatic crossfade on overlapping clips: level through the overlap stays within 2 dB of either side | Pass |
| Compressor, delay and reverb switched on together during playback, no errors | Pass |
| Master loudness and phase readout update during playback | Pass |
| Markers: add, drag (snaps), jump with `]`, listed in the project panel | Pass |
| Pan automation lane shows | Pass |
| MP3 mixdown through the backend (valid file, includes the reverb tail) | Pass |
| Highlighted-range export (4.000 s range gives a 4.000 s file) | Pass |
| Per-track export | Pass |
| Reload restores automation, effects, markers and view | Pass |

**Not yet verified**

- "Send mix to Mastering" was not clicked, because it adds a run to the real run history that can only be removed by clearing all history. It reuses the existing upload call.
- FLAC export from the menu (the route is covered by tests; MP3 was clicked).
- Fade-shape selectors, pan automation editing, effect sliders, the limiter and crossfade toggles, and deleting an automation point were not each exercised.
- The loudness readout was not compared against a reference meter; treat it as a guide, not a compliance figure.
- How the effects sound was not judged by ear; only that they run and render.

### Phase 2 (completion)

Tested on 2026-11-09. Reference figures come from pyloudnorm and an 8× Kaiser resampler in Python, run on the same audio.

**Measured**

| Check | Result |
|---|---|
| True-peak limiter, mix driven 13 dB over full scale, ceiling −1.0 dBTP | Export measured −0.97 dBTP against the independent reference (sample peak −1.10 dB) |
| Integrated loudness of a 16 s song played start to finish | Editor showed −20.6 LUFS; pyloudnorm gives −20.62 |
| Maximum true peak of the same song | Editor showed −2.4 dBTP; reference −2.34 |
| Reverb bus with a −12 dB send | Reverb tail present after the song ends (−47.5 dB), bus adds to the mix |
| Gate at 0 dB threshold, then −80 dB | Track fully silent, then unchanged |
| Reverb-mix lane ramping 20 % → 90 % | Tail rises to −36.6 dB |

The limiter's first version measured −0.76 dBTP in the same test. Its peak estimator was sharpened, a 0.1 dB margin added and a second pass cascaded to reach the figure above.

**Exercised by hand in the browser**

- Section from a range, Repeat (16 s song became 20 s with clips, offsets and sections correct), then Cut out (back to 16 s).
- Phase scope and correlation bar draw during playback; loudness readout updates.
- A focused slider now keeps Home/End (found and fixed during this test: the editor was taking them for the playhead).
- Sessions saved in earlier formats load.

**Not yet verified**

- Group buses (routing a track's output to a bus), the delay bus, bus mute and bus effects editing were not exercised; only a reverb send was.
- EQ frequency and Q sliders, delay-mix and compressor-threshold lanes, and the limiter ceiling slider were not exercised.
- Short-term and momentary loudness were not compared with a reference, only integrated.
- The fallback path for browsers without AudioWorklet was not run.
- "Send mix to Mastering" is still not clicked, for the reason given above.
- Sound quality of the gate, limiter and effects was measured, not judged by ear.

### Phase 3 (first pass)

Tested on 2026-11-09 with generated audio that was damaged on purpose, so each repair could be compared with the undamaged original.

**Automated**

- Backend: 234 tests pass, 19 of them new (each restoration tool on synthetic damage, "leaves clean audio alone" cases, spectral repair touching only its selection, request validation, plugin-description id checks).
- Frontend: TypeScript, ESLint and the production build are clean.

**Measured through the editor**

| Check | Result |
|---|---|
| Song with 34 clicks, 60 Hz hum and a 1.5 s 3 kHz tone: Heal (spectral view), then DeClick, then DeHum | Error against the clean original fell from −20.6 dB to −56.4 dB (music at −16.8 dB) |
| Sine clipped about 10 dB over: DeClip | Distortion against the unclipped signal fell from −17.9 dB to −39.0 dB |
| Punch-in over 3–5 s with a test tone as the input | Playback began at 1 s, stopped by itself, clip placed at exactly 3.000–5.000 s on a new track |
| Free recording | 2.56 s take saved as 48 kHz WAV and placed at the start position |
| Batch: two clips selected, DeReverb | Two jobs ran, both clips swapped to the processed takes |
| Distortion on | Odd harmonics rise by 30–40 dB in the export |
| Plugin description | An installed Audio Unit loaded and reported its (empty) parameter list; one that cannot load failed with a clean message |

**Not yet verified**

- Recording used a generated test tone in place of a microphone. A real input device, its permission prompt and real-world latency were not tested, so timing against the backing track may need a manual offset.
- DeReverb is only checked on a synthetic decaying tail (automated test); it was not judged on real room recordings and can sound artificial at high amounts.
- No plugin with adjustable parameters is installed on this machine, so the parameter sliders were not exercised with a real plugin.
- Attenuate in the spectral view is covered by automated tests; only Heal was clicked.
- The restoration tools were measured on synthetic damage, not judged by ear on real recordings.
- Distortion raises quiet material noticeably as drive goes up; it has not been level-matched by ear.

### Phase 3 (completion)

Tested on 2026-11-09.

**Automated**

- Backend: 248 tests pass. New: warp (marked moments land on target, untouched audio stays identical), warp validation, beat quantise, peak files (never under-draw a peak; removed with the asset), merged processing names, plugin audition excerpt.
- Frontend: TypeScript, ESLint and the production build are clean.

**Measured through the editor**

| Check | Result |
|---|---|
| Warp: marker at 2.44 s moved to 3.05 s on a click track | All five clicks within 1 ms of where the map sends them; clip length 6.000 s → 6.608 s |
| Quantise: 14 beats played up to 62 ms off the grid (`beat_this` + Rubber Band) | Worst error 62 ms → 3 ms; mean 32 ms → 2 ms |
| Loop recording over a 2.09 s loop with a test-tone input | Three passes became three take lanes, newest audible |
| Comp "Use this take" on take 2 | Take 2 audible, the others muted over the same passage |
| Favourites: save DeClick as "Clean up", run it | Saved to the browser, ran as a one-step chain |
| Server waveform overviews | Waveforms draw from the overview; a reload shows them immediately |
| Automation lane menu | Lists the four new lanes |
| EQ display | Curve draws once the audio engine has started |

**Bug found and fixed**: stopping a recording could fire twice (the Stop button and the playback watcher), producing a stray "Nothing was recorded" notice.

**Not yet verified**

- **Rendering or auditioning through a real plugin.** The only plugins installed here are Apple spatial-audio components, which refuse to process a plain stereo file (the failure is reported cleanly). The audition path is covered by an automated test with a stand-in plugin; the browser playback of an audition was not exercised.
- Recording still used a generated tone, not a microphone.
- Comping inside a highlighted range (only whole-take comping was clicked; the range logic is the same code path with a different region).
- Multi-step favourites (a one-step chain was run), and batch favourites.
- The new automation lanes, the bus meters and the live spectrum were not checked against measurements; the lanes share the scheduling code measured in Phase 2.
- "Stretch to the length of the highlighted range" was not clicked.
- Warp on a clip that starts part-way into its audio.

### Phase 4 (first pass)

Tested on 2026-11-09.

**Automated**

- Backend: 253 tests pass. New: melody transcription (pitches exact, onsets within 40 ms), silence handling, section detection on 64 s and 48 s A-B-A-B songs, short-audio rejection.
- Frontend: TypeScript, ESLint and the production build are clean.

**Exercised through the editor**

| Check | Result |
|---|---|
| Convert an eight-note melody to MIDI (pYIN) | All eight pitches correct, on a new instrument track |
| Detect sections on a 48 s A-B-A-B song | A 0–11.5, B 11.5–24, A 24–35.5, B 35.5–48 (true changes at 12, 24, 36) |
| Piano roll: click to add a note | Added at the snapped time and clicked pitch |
| Synth in the per-track export | The rendered audio carries the notes' pitches (three spot checks; one read an octave high because a sawtooth's second harmonic can out-measure its fundamental) |
| Export a MIDI clip, import the file again | Nine notes back, same pitches, timing within 0.5 ms |
| Add an instrument track | New track with a four-bar clip; piano roll opens |
| Playback with audio and MIDI together | Meters move on every sounding track, no errors |

**Found and fixed during testing**

- Section detection missed a boundary on the shorter song (it cut too coarsely). It now cuts finer and merges neighbours that sound alike.
- Transcribed notes started about 35 ms early and ran long; the analysis-window bias is now corrected.
- Detecting sections twice stacked duplicates; a new run now replaces the earlier automatic sections.

**Not yet verified**

- Polyphonic transcription (`basic-pitch`) cannot be installed here, so only single-line material was transcribed. Chords will come out wrong with the fallback.
- Section detection was tested on synthetic songs with clear changes. Real songs with gradual transitions will be less tidy.
- Dragging and resizing notes, velocity, right-click delete, transpose, quantise and the synth controls were not each exercised; adding a note was.
- Importing a MIDI file made by another program (only the editor's own export was read back; the parser's tempo-map and running-status paths are untested).
- How the synth sounds was not judged by ear.

### Phase 4 (second pass)

Tested on 2026-11-09.

**Automated**

- Backend: 260 tests pass. New: generation against a stand-in ComfyUI (workflow contents, model fallback, import of the result), clean failures when ComfyUI or its nodes are missing, request validation, loopback-only address.
- Frontend: TypeScript, ESLint and the production build are clean.

**Exercised in the browser**

| Check | Result |
|---|---|
| Alt-click a selected clip, drag the dashed line | Marker pinned at 2.19 s, target moved to 2.90 s |
| Switch an instrument track to the drum kit | Grid shows drum names; hits render in the export (−13.8 dB during a hit, silence between) |
| Shift-drag selection, Delete | Four notes selected and removed |
| Copy and Paste | Three notes duplicated at the playhead |
| Note input with A, S, D | C, D, E added at 0, 0.25 and 0.5 s; playhead advanced; editor shortcuts on those keys did not fire |
| Generation panel with no ComfyUI running | Explains what to start and offers "Check again" |

**Found and fixed**: the piano roll re-centred its rows after every new note, so later clicks landed on the wrong pitch.

**Not yet verified**

- **Real generation.** No ComfyUI is installed on this machine, so "Generate a part" has only run against a stand-in server that mimics ComfyUI's replies. The request format is built from the Sonic node's declared inputs but has never been accepted by a real ComfyUI.
- **A MIDI keyboard.** Only computer-keyboard input was tested.
- Moving a group of notes by dragging, piano-roll scrolling and Ctrl/Cmd+wheel zoom were not exercised (the zoom button was).
- How the drum kit sounds was not judged by ear.

### Phase 4 (third pass: in-browser plugins)

Tested on 2026-11-09 with "Simple Distortion" from the community catalogue.

| Check | Result |
|---|---|
| Consent gate | Nothing fetched until "Allow internet plugins" was clicked; the warning is shown first |
| Catalogue | Loaded; 53 effects listed |
| Load a plugin on a track | Loaded with no errors |
| Plugin's own control panel | Opens in a floating window (drive, level, symmetry, clipping) |
| Live playback through the plugin | Meters move, no errors |
| Export | Plugin included: the 5th harmonic of a 220 Hz note rose from −171 dB to −73 dB |
| Save settings | The plugin's state is stored in the session |
| Reload | The plugin is restored and plays |

**Not yet verified**

- Only one plugin was tried. Others in the catalogue may fail to load, may not support export (the editor then exports without them and says which), or may not restore their settings.
- Instrument plugins are filtered out of the list; only effects are offered.
- Opening a session that contains a plugin while internet plugins are switched off (it should play without the plugin and show a notice).
- A custom plugin address, removing a plugin, and one plugin on several tracks at once.
- Other browsers. Firefox and Safari handle cross-origin module loading and AudioWorklets differently.

### Phase 4 (fourth pass: MIDI keyboard and voice effects)

Tested on 2026-11-09.

**Automated**

- Frontend: TypeScript, ESLint and the production build are clean.

**Measured by running the voice processor on synthetic signals (Node, 48 kHz)**

| Check | Result |
|---|---|
| Pitch shift +12 on a 220 Hz tone | Output peak 442 Hz; level unchanged (RMS 0.212 → 0.211) |
| Pitch shift −7 on a 440 Hz tone | Output peak 292 Hz (target 294) |
| Pitch tracker on harmonic tones at 196 Hz and 330 Hz | 196.0 Hz and 330.3 Hz |
| Vocoder level (follow, fixed note, three held keys) | −2.1 dB, 0 dB and +3 dB against the input |
| Silence through the vocoder and synth voice | Exact silence, no NaNs |
| Mix at 0% | Bit-identical to the dry input |
| Cost | Vocoder 53× real time, pitch shift 134× real time, on this machine |

**Found and fixed**: the vocoder ran about 5 dB quiet, and the first audio block ignored a 0% mix setting.

**Not yet verified**

- **A real MIDI keyboard.** No hardware was connected; connection, hot-plugging, live playing, sustain, pitch bend and MIDI recording have not been exercised in a browser.
- **Listening.** None of the voice effects has been judged by ear or run in a browser AudioWorklet; the measurements above came from the same code run in Node.
- MIDI recording across a loop wrap, and the overlap rule that puts a take on a new track.
- Firefox's Web MIDI permission flow.

### Separation up to 12 stems, and Models & engines (2026-11-10, Windows 11, RTX 3090)

- **What changed:** `separate` takes `drum_kit`, `lead_backing` and `part` (`mix`, `drums`, `vocals`). The finer passes use audio-separator models: MDX23C DrumSep (kick, snare, toms, hh, ride, crash) and Mel-RoFormer Karaoke (vocals and instrumental, used as lead and backing). `audioqi/addons.py` installs the AI separators from the app (`/models`), the CLI and the installers. On Windows with an NVIDIA driver of 580 or newer it installs PyTorch from the `cu130` index only. The dry run showed that allowing PyPI as well makes pip pick PyPI's newer CPU-only build. Every installed package is passed to pip as a constraint.
- **Real install on this machine:** `python -m audioqi.addons install stems` installed torch 2.14.1+cu130 and torchaudio 2.11.0+cu130, then demucs, audio-separator 0.48 and beat-this, then downloaded all five models (2.2 GB). numpy 2.5.3, scipy 1.18.1 and librosa 1.0.0 were unchanged; `torch.cuda.is_available()` is true on the RTX 3090.
- **Real split:** a 45 s excerpt of a user song gave 12 stems in 20 s on the GPU. Each stem had the input's shape, and the stems sum back to the mix within −24.7 dB. Energy-weighted spectra put each part where it belongs: kick centred at 93 Hz (94% below 150 Hz), bass at 119 Hz (80% below 150 Hz), snare at about 2 kHz, hi-hat at 8.8 kHz (81% above 5 kHz), ride at 11 kHz (95% above 5 kHz). In the browser (headless Chromium, separate API and data folder), `?split=…&stems=full` placed Lead vocals, Backing vocals, Kick, Snare, Toms, Hi-hat, Ride, Crash, Bass, Guitar, Piano and Other under the muted original in about 26 s.
- **Tests:** 15 in `tests/test_addons.py`: CUDA build per driver, the PyTorch plan per platform, PyTorch from the CUDA index only, constraints on every install, the install order, the routes' confirmation header, unknown packs and models refused, model deletion, and the 12-stem order and shapes with a stand-in separator, plus validation and the missing-pack message. 298 tests pass across the editor, generation, upload-security, API-helper and add-on suites.
- **Not verified:** lead/backing quality on a song with prominent vocals (the test excerpt is mostly instrumental), the install on macOS or Linux, a GPU without CUDA 13 support (the `cu126` path), and the BS-Roformer-SW 6-stem model (not wired in; its output names are unchecked).
- **Not done:** the better MIDI transcriber (basic-pitch) could not be offered because it tries to build an old numpy from source in this environment.

