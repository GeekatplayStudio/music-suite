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
- **General MIDI instruments** (2026-11-17): a track can name one of the 128 General MIDI instruments (`lib/editor/gm.ts`). A SoundFont (`.sf2`) the user loads plays it as a recorded instrument (`lib/editor/soundfont.ts`, kept in this browser by `soundfont-store.ts`); without one the built-in synth plays its nearest sound. The program number travels in and out of MIDI files, so the choice survives a round trip.
- **MIDI files**: import `.mid` (formats 0 and 1, tempo changes honoured; one track per channel, each set to the instrument the file names) and export either one clip or the whole project as a format 1 file with a track per instrument, its program, the tempo and the time signature. Both happen in the browser.
- **Audio to MIDI** ("Convert to MIDI notes"): transcribes a clip onto a new instrument track. Uses Spotify's `basic-pitch` (chords and melodies) when installed, otherwise pYIN, which follows one note at a time.
- **Song-section detection** ("Detect song sections"): finds where harmony and timbre change and labels repeated parts alike (A, B, A, B). The sections appear on the ruler, ready for the Phase 2 Repeat and Cut out tools.
- Also: transpose and quantise for MIDI clips.
- **Instrument plugins** (2026-11-11): a MIDI clip can be played through an installed VST3 / AU instrument. The isolated plugin worker gained an `instrument` mode (Pedalboard renders the notes as raw MIDI) and an `editor` mode (opens the plugin's own window and returns its state, base64, when closed; the app can close it through `POST /jobs/{id}/close-window`, which the worker watches for). A restored state is followed by 0.25 s of silence because Surge XT applies it on its next audio block. While the window is open the worker keeps the plugin's audio engine running, as a DAW does, and plays the clip's notes in a loop to the default output on Play (`POST /jobs/{id}/preview`). It paces itself by the clock because Pedalboard's `AudioStream.write` spins while its buffer is full: measured about 8% of one core with Surge XT playing, versus a full core before. A patch picked from Surge XT's own patch menu is not taken in this host (the menu opens, the pick is dropped before Surge's loader runs; a 10-minute file and stack monitor saw no patch file opened). The editor therefore offers Surge XT's library itself (`audioqi/editor/sounds.py`): it lists the `.fxp` files of the factory, third-party and user libraries by opaque id, and builds a saved sound by wrapping the file's `sub3` chunk in JUCE's VST3 state container (`VC2!` binary XML, `IComponent` in JUCE's 6-bit text encoding, an empty `JUCEPrivateData` trailer). Verified: Surge XT reports the picked patch's name after loading such a state, and renders change accordingly. Play now starts a listening session without a window (`plugin_window` with `window: false`); picking a sound during a session switches it live (`POST /jobs/{id}/load`), applied by the audio thread between blocks. **Synth Studio** (`/synth`, 2026-11-11) is a page of its own: the sound editor's controls and preset bar were split out of the dialog (`SynthControls`, `PresetBar`) and are shared by both; a responsive piano (`components/synth/piano.tsx`) fits 1 to 7 octaves to its width and plays by pointer, touch glide and computer keys; plugin instruments are auditioned without a project through `POST /editor/audition` (one at a time, no window). Sounds export and import as `.mssound` files (`lib/editor/sound-file.ts`): JSON with `format: music-suite-sound`, `version: 1` and either a synth patch or a plugin's name and saved state; imports are normalised and checked. Favourite plugin sounds are kept per plugin in the browser and listed first. **Live playing** (2026-11-11): a session started with `live: true` renders in 256-frame blocks into a 512-frame output buffer and opens a loopback UDP socket (port published in its control folder; datagrams carry a per-session token, then 3-byte MIDI messages). `POST /jobs/{id}/midi` and `POST /audition/{key}/midi` validate note on/off, controller and pitch-bend messages and forward them. Measured with Surge XT on an M5 MacBook Air: browser request 5 ms median (6 ms p90), 4–5 ms average wait for an audio block (10.6 ms worst), then 5.3 ms block and up to 10.7 ms buffer: about 15–26 ms before the output device. In the editor, MIDI keyboard events go to the running session of the played track instead of the built-in synth, and note takes record as before. The user confirmed it with a hardware MIDI keyboard. The Studio Editor has a dockable on-screen piano that feeds `midiHub.play`, so it shares the MIDI keyboard's whole path (live synth or plugin session, note takes). Synth Studio's own synth gained a 12-key limit with oldest-note stealing, sustain pedal, pitch bend and all-notes-off on tab change. **Sheet music** (2026-11-11): `lib/editor/notation.ts` turns a clip's notes into bars for a grand staff (sixteenth-note grid, one chord line per staff split at middle C, values aligned to the beat, plain beat-aligned rests, ties across barlines, key signature from the project key), and `components/editor/sheet-music.tsx` engraves it with VexFlow 5 (MIT), loaded only when the view is opened. Read-only; one voice per staff. Print and PDF (`lib/editor/sheet-pages.ts`): the same drawing routine (`sheet-render.ts`) engraves A4 or US Letter pages on 200 dpi canvases, with a title block and page numbers; printing puts the pages in a hidden frame and opens the browser's print dialog, and PDF export places them in a file with jsPDF 4 (MIT). The pages are images, so the PDF's notes are not selectable text or vectors. Layout (`layoutSheet`): a fixed width per bar let busy bars spill over their barline, so each bar now takes two thirds of VexFlow's pre-calculated width with a floor per note, lines are packed greedily (six bars at most) and justified, and ties across line and page breaks are drawn as two halves. Checked on a 40-bar, 305-note clip in F major: 5 US Letter pages, every bass note held over its barline. A second pass in 3/4 and E major with extreme pitches (A0 to C8), clusters, off-grid notes and an empty clip added: room above and below a line for notes far outside the staves (three units a semitone beyond C6 and C2), with pages filled by line height; a bar with nothing in it written as one centred whole rest; and half-ties that name every note of a chord (VexFlow rejected a tied chord across a line break). A4 output verified by its MediaBox. **Triplets**: the grid is 12 units to a quarter; per staff, a beat whose note starts fit thirds better than quarters (and has a start on a third) is quantised to triplet eighths and drawn with a VexFlow `Tuplet`, while other beats stay on sixteenths. Covers rests inside a triplet, quarter-plus-eighth triplets, chords and ties out of a triplet. Not covered: sixteenth or quarter-note triplets, other tuplets, and other tuplets. **Compound metres**: the project state gained `beatUnit` (4 or 8, absent in older projects = 4); `beatSeconds`, `barSeconds` and `timeSignature` in `lib/editor/types.ts` replace the scattered `60 / bpm * beatsPerBar`, so the ruler, grid, snapping, new-clip length and piano roll follow it. Tempo stays in quarter notes per minute. In notation, x/8 with beats in threes (6, 9, 12) is compound: values are cut at the dotted-quarter pulse, rests may be dotted quarters, beams group by 3/8, and triplet detection is off. 5/8 and 7/8 are written with plain grouping. Jobs `render_instrument` and `plugin_window` need no source asset; the state is stored on the track (`pluginInstrument`). `audioqi/editor/instruments.py` installs Surge XT 1.3.4 (GPL-3.0) in one click from pinned release files checked by size and SHA-256: the plugin-only zip into the user's VST3 folder and the portable content into `~/Library/Application Support/Surge XT` (macOS) or a `SurgeXTData` folder beside the plugin (Windows), the locations Surge's own code searches. The scanner now also reads the per-user Windows VST3 folder.

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
- **Sample-based instruments** are now covered for General MIDI by the SoundFont player (2026-11-17), but not as a sampler of one's own: there is no way to load your own samples onto a track, map them across the keyboard or edit their loop points. Still open: lasso and brush selections in the spectral view, mid/side EQ, bus automation, and automation of the remaining effect parameters.

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

### Surge XT's full interface, skin and window (2026-11-11, Windows 11)

- **Loading fix:** the plugin host could not scan Surge XT 1.3.4's bundle folder on Windows ("unsupported plugin format or scan failure"); the worker now falls back to the plugin file inside the bundle. Before this every Surge XT feature failed on this machine.
- **Full interface:** Synth Studio's auditions take `window: true`, showing Surge's own window while the piano and MIDI keyboard play it; the sound left in the window becomes the current sound when it closes. Verified by opening it through that path and capturing the window, and by the state (92 KB) coming back.
- **Skin:** `audioqi/editor/surge_skin.py` recolours Surge's factory dark skin (greys to slate, blues to cyan, orange kept) into a user skin and sets it, plus Surge's on-screen keyboard, as defaults the user has not set. Surge only honours `defaultSkin` with a trailing path separator; found by testing, confirmed by screenshots. No Surge artwork (GPL-3) is stored in the repository.
- **Window:** it opened with its title bar above the screen (could not be dragged) and behind the browser. It is now centred on the work area, brought to the front and titled "Surge XT — Music Suite". Resizing is through Surge's Zoom (confirmed: 75% gave a 694 x 503 window on a 4K screen).
- **Not verified by hand:** clicking Surge's on-screen piano and its Zoom menu; the skin and window placement on macOS. `test_install_checks_every_download_and_places_the_files` fails on Windows with a path bug in the test itself, before and after these changes.


### General MIDI instruments, SoundFonts and multi-track MIDI files (2026-11-17, Windows 11)

- **What changed:** a MIDI track can now name a General MIDI instrument, and a SoundFont can play it. `lib/editor/gm.ts` holds the 128 program names, the 16 families, General MIDI's percussion map and a sound for every program built from the existing synthesizer's primitives (45 archetypes mapped across the 128 programs, reusing factory presets and their measured levels where one fits). `Synth` in `lib/editor/types.ts` gained an optional `program`, absent on a track keeping its own synth sound, so older projects load and sound exactly as before. `lib/editor/soundfont.ts` reads a `.sf2` file into zones — a sample per key and velocity range with its tuning, loop points, volume envelope, attenuation, pan and initial filter — and plays them with plain Web Audio nodes, so live play, previews and offline exports share one path as the synth does. Only the generators General MIDI needs are read; modulators, the modulation envelope and the LFOs are ignored. `lib/editor/soundfont-store.ts` keeps the chosen file in IndexedDB (nothing is uploaded) and reloads it when the editor opens.
- **Instrument selection:** `components/editor/gm-instrument.tsx` adds a *Sound of* list (programs grouped by family) to the clip inspector's Instrument section, plus loading, status and removal of the SoundFont. A drum track gets a checkbox for the General MIDI kit instead. The engine prefers the SoundFont and falls back to the built-in synth whenever the font has no zone for that program, note or velocity, so a sparse font never goes silent. Changing a track's instrument now reschedules during playback, which patch edits did not do before.
- **MIDI files:** `lib/editor/smf.ts` writes format 1 — a conductor track with the name, tempo and time signature, then one track per instrument with its name, a program change and drums on channel 10 — in place of the previous single-track format 0. Reading now takes program changes and splits a track that plays on several channels into one track per channel, so a format 0 file arrives as its separate instruments. Import sets each new track's instrument from the file. **Export ▸ Every instrument · MIDI file** writes the whole project, with notes positioned as the clips sit on the timeline and muted clips left out.
- **Verified:** 68 checks on the compiled modules under Node (the frontend has no test runner, so `lib/editor/{smf,gm,soundfont,synth,types}.ts` were compiled with `tsc` and exercised directly). Round trip of a three-part file (piano, bass, drums at 90 BPM in 6/8): format 1 with four chunks, the time-signature event `FF 58 04 06 03 18 08`, tempo, names, programs 0 and 33, the drum flag, and every pitch, start, length and velocity back within a MIDI step. Also: repeated notes on one pitch staying separate, a three-note chord, 20 parts (more than MIDI's 16 channels) round-tripping with programs intact, and a non-MIDI file refused with a readable message. A hand-built format 0 file with channels 1, 2 and 10 split into three tracks named "Acoustic Grand Piano", "Acoustic Bass" and "Drums", with the right programs, the drum flag on channel 10, and one beat measuring 0.5 s at 120 BPM. The SoundFont parser was run against synthetic `.sf2` files covering the full chunk tree: name, program count, key range, root-key override, sample frames and rate, loop points, sample modes 0 and 1, attenuation (200 cB read as −20 dB), bank 128 becoming the drum kit, a preset's own program number, and a non-SoundFont refused. Playback was checked through a stand-in audio context: one buffer source per note at the sample's own rate, an octave above the root key doubling the playback rate, loop points in seconds, the envelope ramping and releasing, velocity changing the level, pitch bend retuning a held note, and `false` returned (not silence) for an absent program, absent drums or a note outside every key range. `tsc --noEmit` and `eslint` clean, `next build` succeeds, and the 135 tests in `tests/test_editor.py` pass.
- **Not verified:** no real SoundFont was played on this machine — the suite ships none, and no `.sf2` was available here, so every SoundFont check used synthetic files and a stand-in audio context. Nobody has listened to the result, so the loudness of the sampler against the built-in synth and the mix balance between tracks are unmeasured, as is the memory a 100 MB+ font uses in the browser. The 45 built-in archetypes were written by analogy and ear, not measured like the 17 factory presets, so levels may jump when switching instruments without a font. Stereo samples are read as two independent mono zones rather than linked pairs. Compressed SoundFonts (`.sf3`) and DLS files are not read.
- **Since done:** symbolic MIDI generation, as the arranger (Phase G6 in `docs/GENERATION_ROADMAP.md`), which uses these instruments and this file format. Still not done: the drum grid still labels only the pitches the built-in kit plays, rather than the full General MIDI map a font provides; and a one-click SoundFont install (as `instruments.py` does for Surge XT) needs a pinned release whose licence has been checked.

### Whole song to MIDI (2026-11-17, Windows 11, RTX 3090)

- **What changed:** `audioqi/editor/transcribe.py` and the `song_to_midi` job turn a recording into one track of notes per instrument. The song is split into stems (6 stems plus the drum-kit pass when AI stem separation is installed) and each stem goes to the transcriber that suits it: piano to **Transkun 2.0.1** (MIT), a piano-only model; guitar, "other", bass and vocals to **basic-pitch 0.4.0** (Apache-2.0), with bass and vocals kept to one note at a time; drums to loudness-based hit detection on each separated kit piece, mapped to General MIDI percussion, or on three frequency bands of the drum stem without the kit separator. Then: notes outside a part's plausible range are dropped, faint overtones of a louder simultaneous note are removed, a note that appears on two stems stays only where it is loudest, and a stem below 4% of the loudest stem's level is skipped. The job returns `tracks` in its result as *Convert to MIDI notes* does; the editor puts each on a new instrument track under the source clip, aligned to it, with its General MIDI program. `audioqi/addons.py` gained a `notes` pack (Models & engines ▸ AI note transcription, or `python -m audioqi.addons install notes`).
- **Why these models:** searched 2026-11-17. YourMT3+ transcribes a whole mix but is GPL-3.0; MuScriptor (2026) reports the best whole-mix scores but its weights are CC-BY-NC, gated behind a contact form, and its authors' own figure is about 60% of note onsets with no velocities; ADTOF (drums) is CC-BY-NC-SA. Stems-then-specialists uses only MIT and Apache-2.0 models and puts the strongest model there is (Transkun, 98% onset F1 on MAESTRO by its authors) on the instrument it was built for. No open-source equivalent of Melodyne's or RipX's in-audio note editing was found.
- **Installing:** `pip install --dry-run` with every installed package as a constraint showed Transkun adds 15 packages and changes none. basic-pitch could not be resolved that way (it pins TensorFlow and an old NumPy), which is why the roadmap earlier called it uninstallable; installed with `--no-deps` it runs on the NumPy 2.5.3, librosa 1.0 and onnxruntime 1.31 already here. Transkun's command-line entry needs `pkg_resources`, which this environment lacks, so its model is loaded directly from the checkpoint inside the package. NumPy, librosa and PyTorch versions were unchanged afterwards.
- **Measured accuracy** (note-onset F1 within 50 ms, pitch exact, `mir_eval`), on audio synthesized from the arranger's notes so the right answer is known: Transkun on piano chords 0.984 and 0.986 (precision 1.000). basic-pitch near its default thresholds averaged about 0.85 over 25 parts (five styles × bass, melody, arpeggio, pad, chords); at the thresholds now used (onset 0.55, frame 0.45, minimum length 90 ms) about 0.92, with melodies 0.99, pads 0.99, chords 0.95, bass 0.9 and fast arpeggios the weakest at about 0.75. Drums by frequency band 0.88–0.89 with recall 1.000. A hand-written pYIN-plus-attacks tracker for bass and voice was measured too and lost to basic-pitch on every case (0.29–0.56 on bass against 0.64–0.91), so it is only the fallback. **Whole pipeline on a synthesized four-part mix:** 0.71 for pitched notes (precision 0.74, recall 0.68) and 0.78 for drums; the separators, trained on real recordings, sent the synthetic piano to the guitar and "other" stems and skipped the synthetic voice, so this figure says more about separating unnatural timbres than about real songs, in either direction.
- **Real songs:** two user songs through the pipeline. 2:14 in 28 s: vocals, bass, guitar, other and drums, 1,327 notes, piano skipped as silent. 4:22 through the job itself (API route, in-process, real models) in 57 s: five tracks, 2,992 notes, a result of about 150 KB. There is no reference transcription for these, so they show that it runs and how long it takes, not how right it is.
- **Tests:** 11 in `tests/test_transcribe.py`, with the neural models replaced by stand-ins: tidying and de-duplication, overtone removal, bleed between stems, single-line reduction, engine choice and fallback when a model fails, drum hits found in frequency bands at the right times, kit pieces mapped to General MIDI with bleed ignored, a song routed to one track per instrument with a silent stem skipped and out-of-range notes dropped, silence refused, the job end to end on the fallback engines, and the pack installing basic-pitch without its pins but under the constraints. They found a real bug: one kick was counted two or three times, because a spectral-flux detector reads a drum's falling pitch as new onsets; hits are now found from the loudness envelope.
- **Not verified:** accuracy on real recordings — nobody has compared a result with the song by ear or against a reference, and the thresholds were tuned on synthetic audio only. The button and the new tracks were not exercised in a browser this time (the running site and API predate the change); the frontend type-checks and builds, and the placement code mirrors *Convert to MIDI notes*. CPU-only speed, macOS, and the pack's install from the Models page were not run; the install was done by hand with the same commands.
- **Not done:** tempo and bar detection for the result (notes are in seconds, aligned to the audio, not quantised); pedal from Transkun; pitch bends and vibrato; telling a guitar from a keyboard inside "other"; lead and backing vocals as separate parts; and anything like Melodyne's editing of notes inside the audio itself.

### MIDI songs played silently: notes are now scheduled a few seconds ahead (2026-11-17, Windows 11)

- **Fault:** an imported MIDI song showed its tracks and a moving playhead but made no sound. Pressing Play scheduled every note of every clip at once, and each note is its own graph of oscillators, filters and envelopes, so a song of a few thousand notes built tens of thousands of nodes. The audio thread could not render them in time and fell behind.
- **Measured** (the 16-track `onestop.mid`, 4,279 notes, built-in synth, AudioContext clock against wall time): with every note scheduled at once the context advanced 0.77 s in about 10 s, 6% of real time. A few short clips never showed it, which is why it went unnoticed until whole songs could be imported.
- **Fix:** `lib/editor/engine.ts` schedules notes that start within 4 s of the playhead and tops that up from the transport tick when 2 s remain, dropping finished voices as it goes. Audio clips are still scheduled once. Offline export has no clock to keep up with and still takes everything at once. With the fix the same song ran at 1.000 of real time over 6 s and again over 20 s.
- **Not verified:** nobody has listened to it; the measurement is the audio clock keeping time and the track meters showing signal, not the sound itself. A browser tab hidden for more than about two seconds at a stretch may have its timer held back and miss notes until it wakes. Export of a long MIDI song may be slow for the same underlying reason and was not timed.

### Whole song to MIDI, second pass: tuned on real songs (2026-11-17, Windows 11, RTX 3090)

- **Report:** on real songs the drums were right but the other instruments were "not good at all".
- **What was wrong, measured on two user songs** (2:14 in C minor at 97 BPM, 4:22 in F minor at 143 BPM), with no reference transcription, so by what the notes look like: 94–100% of the pitched notes were inside the song's key, so the pitches were mostly right. But a pitched part held about one note at a time (1.0–1.6 sounding together) and covered under half of the time the stem was sounding. The thresholds chosen in the first pass were tuned on synthesized audio, where every note has a strong, steady signal; on real stems they dropped quieter notes and thinned chords to single notes. Separately, the tracks were given a string ensemble ("other") and a choir (vocals), whose sounds in the built-in bank take 0.25–0.35 s to swell in; with notes about 0.15 s long they were over before they could be heard.
- **Changes** in `audioqi/editor/transcribe.py`: basic-pitch now runs with a firm onset threshold and a loose frame threshold (0.6, 0.2, minimum 100 ms, against 0.55, 0.45, 90 ms), so a note needs a clear attack but is then held while there is any evidence of it. A sweep of five settings on the first 100 s of both songs' stems put this one ahead: on the "other" stem, time covered went from 42 s to 90 s and from 43 s to 74 s, and notes sounding together from 1.3 to 2.6 and 1.7 to 3.0, with the in-key share at 99% and 92% (99% and 96% before). Instruments that speak at once: flute for vocals, electric piano for "other", organ for backing vocals. A single line joins a semitone slide into the note it leads to and never overlaps itself. With a key measured at 0.7 confidence or more, notes outside it are dropped when short (under 0.25 s) or faint, and kept when long and strong. Note starts are moved onto the song's own beat grid, built from the beats tracked in that recording so it follows the playing, choosing sixteenths or triplets by which fits, and leaving alone a note more than 45% of a step from any line. The result reports `bpm`, `key` and `grid`.
- **After, same two songs, whole pipeline:** 2,464 notes (1,327 before) and 4,520 (2,992); "other" at 2.6 and 2.7 notes together; 98–100% in key on every pitched part; every note start on the sixteenth grid.
- **Tests:** 14 in `tests/test_transcribe.py` (three new: slides joined and no overlap in a single line, the key filter, grid snapping including triplets and a note left alone between lines).
- **Not verified:** whether it sounds right. These figures say the notes are denser, held longer, in key and in time; they cannot say the notes are the ones played, and more notes can mean more wrong ones (the "other" part of the slower song now averages over ten notes a second, which may be too many). No reference transcriptions of real recordings were available, and nobody has listened. The first pass's synthetic scores no longer describe the shipped settings.
- **Still true:** this is the ceiling of open, permissively licensed models on a dense mix. The stronger whole-mix model found (MuScriptor) has non-commercial weights behind a sign-in, and its authors report about 60% of note onsets on real music.

### Whole song to MIDI: MuScriptor as an optional whole-mix engine (2026-11-17, Windows 11)

- **What changed:** `song_to_midi` takes `engine`: `auto` (default), `stems` or `muscriptor`. With MuScriptor's code installed and its weights reachable, `auto` sends the full mix through it in one pass and gets a track for each of the instrument groups it names (35 pitched groups mapped to General MIDI programs, plus drums); otherwise, or if it fails, the stems method runs and the result says why in `whole_mix_problem`. The same key clean-up and beat-grid snapping follow. MuScriptor reports no velocities, so each note takes one from the recording's loudness at its start. `capabilities.song_to_midi.whole_mix` is `ready`, `needs-access` or `not-installed`, and the button's tooltip says which.
- **Installed here:** `muscriptor` 0.4.0 (code MIT) from GitHub. A dry run with every installed package as a constraint showed 8 new packages and none changed.
- **Not run:** the model itself. Its weights (CC BY-NC 4.0) are behind a Hugging Face gate that asks the user to accept terms, including not transcribing music without the rights to it and an indemnity; this machine has no Hugging Face sign-in, and accepting terms is the user's to do. Everything here was written against the package's own interface (`TranscriptionModel.load_model`, `transcribe`, its start, end and progress events) and tested with a stand-in: 16 tests in `tests/test_transcribe.py`, two new, covering a track per instrument, drums, an unknown group, velocities, the size setting, refusal with the sign-in steps when asked for by name, and fallback to stems when the download is refused. Whether it is better than the stems method on real songs is therefore still unknown; its authors report about 60% of note onsets on their own real-music test set.
- **Licence consequence:** with MuScriptor in use the output comes from non-commercial weights. The stems method (Transkun, basic-pitch; MIT and Apache-2.0) stays the default wherever MuScriptor is absent.

### Whole song to MIDI: MuScriptor measured, made the default where available (2026-11-17, Windows 11, RTX 3090)

- **Setup on this machine:** the user accepted the terms and signed in with `hf auth login`. The account could download `muscriptor-large` (5.5 GB) but not `muscriptor-medium` (403: each size's terms are accepted separately), so `_load_whole_mix` now tries the size asked for (or one already downloaded) and then the others, and reports the size it used.
- **Measured on mixes with known notes** (piano chords, bass, a synthesized voice and drums; note-onset F1 within 50 ms, exact pitch, `mir_eval`), stems method against MuScriptor large: pop 0.62 against 0.81 (precision 0.57 against 0.88), rock 0.64 against 0.83, ballad 0.38 against 0.69. The bass part on its own: 0.45/0.56, 0.58/0.85, 0.28/0.00 (MuScriptor wrote no bass for the ballad). Drums: 0.90/0.89, 0.91/0.90, 0.82/0.68. MuScriptor is clearly more accurate on pitched parts and names the instruments; it is weaker on drums in the sparse ballad. Speed: 9–34 s for 51 s of audio, against 11–24 s for stems.
- **Real songs:** MuScriptor wrote 2,687 notes on 13 tracks for the 2:14 song (electric guitar, bass, organ, synth lead and pad, piano, flute, trumpet and more) and 5,543 notes on 4 tracks for the 4:22 song in 300 s. It wrote no voice part for either, and only 14–19% of the stems method's sung notes appeared anywhere in its output. So when it writes no voice part, a two-stem split (BS-RoFormer) now isolates the vocals and a single line is written from them (`sung_line`), unless the vocal stem is under 5% of the backing's level (real singing measured 11% and 28%; bleed is near zero). That added 32 and 382 sung notes, in 53 s and 100 s. Its agreement with the stems method's own vocal line is low (F1 0.05 and 0.29): with no reference for these songs, neither can be called right, and the sung line remains the least reliable part.
- **Default:** `engine: auto` uses MuScriptor plus the sung line when MuScriptor is ready, and stems otherwise. The editor shows a *Method* list (best available, MuScriptor, Stems) once MuScriptor is ready, and says that its model is for non-commercial use. The Models page shows MuScriptor's state (ready with the size, needs sign-in, not installed), the sizes downloaded, and the steps to set it up; the suite still never installs or downloads it itself. Groups the model names only by General MIDI program (`program_99`) are now named after that program's family.
- **Tests:** 21 in `tests/test_transcribe.py`, 5 new: a size the account cannot download gives way to one it can; the sung line is added only when the model wrote no voice part; it comes from a two-way split and only when there is singing, within the sung range; when MuScriptor finds no notes, *Best available* gives the stems method a turn (found by a run from the editor on a plain test tone, which failed outright before); groups named by program number.
- **In the browser** (a dev server against a test API and its own data folder, both removed afterwards): the Models page showed MuScriptor *Ready · large* with *Downloaded: large*; on a clip, Compose showed the *Method* list defaulting to *Best available (MuScriptor)* and the non-commercial note; *Whole song to MIDI* on a 35 s piano, bass and drums mix completed through MuScriptor and placed *Electric piano (MIDI)* and *Drums (MIDI)* tracks under the clip. MuScriptor merged the synthesized bass into the electric piano part there. The stems tests are pinned to the stems method whatever this machine has installed, after one of them picked up the real model.
- **Not verified:** nobody has listened; every real-song figure is about what was written, not whether it is right. The synthesized test voice was not recognised as a voice by the separator, so the sung line was never scored against known notes. MuScriptor's licence (CC BY-NC 4.0) applies to anything transcribed with it.
