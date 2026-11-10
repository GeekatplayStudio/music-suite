# AI Music Generation — Plan and Roadmap

**Geekatplay Studio Music Suite · Generation module**

This document plans a module that writes and generates complete songs. The module works with a model on this machine or with an external service, and a settings screen chooses between them. It records what we researched and measured, which engines we chose and why, how the module fits into the suite and the [Studio Editor](EDITOR_ROADMAP.md), and the order of work. Research and benchmarks were done on 2026-11-10. Items marked *(unverified)* could not be confirmed from a primary source that day.

---

## 1. Goal

- **Generate music** from a description, from lyrics, or from both. The result is a full song or a single part, and it lands in the Studio Editor as tracks ready to edit.
- **Choose the provider in a configuration menu**:
  - a model running on this machine;
  - a model downloaded once and run locally;
  - an external API, enabled only by the user.
- **Expose every parameter a provider offers.** A provider such as ElevenLabs (or Suno, once it has an API) shows all of its controls, not a lowest common denominator. That includes style, lyrics, structure, length, variations, and editing tasks such as repaint and cover.
- **Write lyrics and style descriptions with a local language model** through Ollama, and let the user edit them before generating.
- **Never overload the machine.** Only one heavy model is in memory at a time, memory is checked before work starts, and engines shut down when idle.

---

## 2. Findings

### 2.1 External services (2026-11-10)

| Service | Official API | What it offers | Decision |
|---|---|---|---|
| **Suno** | **No public API.** A partner programme was announced in July 2026, and `platform.suno.com` shows only a sign-in page, with no public docs or pricing. | — | **Reserve a provider slot; build nothing yet.** Third-party "Suno APIs" are unofficial wrappers that break Suno's terms and can stop working at any time. We will not ship one. The adapter is written when Suno publishes an API or the user gets partner access. |
| **ElevenLabs Music** | **Yes, documented.** | `POST /v1/music` compose: a `prompt`, or a `composition_plan` with sections, lyrics lines, positive and negative styles per section or chunk, and durations. Also `force_instrumental`, `seed`, length up to 10 minutes, models `music_v1`, `music_v2` and `music_v2_5`, and many output formats. `POST /v1/music/plan` builds a composition plan for free. Inpainting and streaming guides exist. | **First external provider.** ElevenLabs says its training data is licensed. |
| **Google Lyria (Gemini API)** | Yes, in preview. | `lyria-3-clip-preview` (about 30 s) and `lyria-3-pro-preview` (full songs), plus a newer `lyria-3.5` *(model IDs unverified)*. Takes a text prompt and up to 10 images. Every output carries a SynthID watermark. | **Later provider**, once the API leaves preview and the fields are confirmed. |
| **Mureka** | Yes. | One source quotes about $1,000 a month at 3¢ per song *(unverified)*. | Optional, only if asked for. |
| **MiniMax Music** | Unclear. | Reportedly closed to new customers in August 2026 *(unverified)*. | Not planned. |

### 2.2 Local song models

**ACE-Step 1.5** (MIT, by ACE Studio and StepFun) is the best open model we can ship.
- It led a blind listening test of open models.
- LeVo 2 claims better vocals, but its licence is non-commercial and its weights' origin is unclear.
- Its controls cover caption (style), lyrics in 50+ languages with section tags, BPM, key, time signature, length (10–600 s), seed, and up to 8 variations.
- It supports editing tasks: cover, repaint (inpaint and outpaint), lego (add an instrument layer), extract (one instrument), and complete.
- Its own planner language model can write lyrics and settings from a short idea.

### 2.3 Benchmarks on the target machine

The target is an Apple M5 with 24 GB of unified memory. Every test used the same caption, lyrics, BPM, key and seed, and the "Python" rows used the 2B turbo DiT.

| Engine | 2-min song | 2-min with planner LM | 3.5-min song | 2 variations | Memory while generating | Free memory (worst) | Extra swap |
|---|---|---|---|---|---|---|---|
| ACE-Step Python service, defaults | 108–140 s | 140 s | 132 s | 126 s | 21 GB held, 30 GB peak | 8% | ~15 GB |
| ACE-Step Python, offload off, LM off | 52 s | — | 76 s | 84 s | 19 GB held, 31 GB peak | 2% | ~15 GB |
| **acestep.cpp, Q8, default mode** | **42–49 s** | **61 s** (LM 15 s) | **71 s** | **82 s** | **0.7 GB idle, 2.3 GB peak, 4.5 GB with LM** | **41–44%** | **none** |
| acestep.cpp with `gemma4:12b` also loaded | 50 s | 68 s | — | — | 2.3 GB peak, 4.3 GB with LM, plus 7.9 GB for Gemma | 10% | +1.7 GB |

**Lyrics writer:** `gemma4:12b` in Ollama wrote a caption, BPM, key and 50 lines of tagged lyrics in 27–30 s. It used 7.9 GB, and free memory stayed at 20% or more. The larger installed models will not fit next to a music engine: `qwen3.6` is 23 GB and `qwen2.5:32b` is 19 GB.

**Output:**
- The Python service's songs measured about −13 LUFS with peaks near −1 dBFS.
- acestep.cpp's songs measured about −10 LUFS with peaks at 0 dBFS. That is hot, so the import step turns it down to the suite's loudness target.
- Every song had the requested length, was 48 kHz stereo, and had no silent gaps.

**Not yet tested:** nobody has listened to the outputs critically yet, and the base and XL DiT variants and the 4B planner have not been benchmarked.

### 2.4 Conclusions

1. **The local engine is [acestep.cpp](https://github.com/ServeurpersoCom/acestep.cpp)** (MIT, C++/GGML with Metal).
   - It runs the same ACE-Step weights, compressed to Q8.
   - It loads one module at a time, so a full song never needs more than about 4.5 GB.
   - It has a job-queue HTTP API and covers every ACE-Step task.
   - The Python implementation is not used: on a 24 GB Mac it pushes the system into swap.
2. **The lyrics and style writer is Ollama**, defaulting to `gemma4:12b`. ACE-Step's own planner (`lm_mode: inspire` and `format`) is the no-Ollama fallback.
3. **The writer is unloaded before music generation starts.** The two can share memory, but with only 10% left free the rest of the Mac slows down.

---

## 3. Architecture

### 3.1 Overview

```
Browser (Next.js)                         Music Suite API (FastAPI, loopback)
───────────────────                       ─────────────────────────────────────────────
Settings ▸ AI Generation   ── REST ──▶    /generation/settings, /providers, /keys, /test
Generate panel (editor)    ── REST ──▶    /generation/lyrics      ─▶ Ollama   127.0.0.1:11434
  form built from schema                  editor job "generate_song" etc.
                                            │  GenerationQueue (one heavy job at a time)
                                            │  ResourceGuard (unload LLM, check memory)
                                            ▼
                                          Provider registry
                                            ├─ acestep_local ─▶ EngineSupervisor ─▶ ace-server 127.0.0.1:<port>
                                            ├─ comfyui_musicgen ─▶ ComfyUI 127.0.0.1:8188 (existing)
                                            ├─ elevenlabs ─▶ https://api.elevenlabs.io (opt-in)
                                            ├─ lyria ─▶ Gemini API (opt-in, later)
                                            └─ suno ─▶ reserved, disabled until an official API exists
                                            ▼
                                          Import: normalise (true-peak capped) ─▶ editor asset + generation record
```

### 3.2 Backend package `audioqi/generation/`

| File | Responsibility |
|---|---|
| `providers/base.py` | `Provider` protocol: `id`, `name`, `kind` (`local` / `external`), `describe()` returning the parameter schema and task list, `status()`, `generate(request, progress, cancel)`, and an optional `write()` for providers that draft lyrics or plans themselves. |
| `providers/acestep.py` | Maps the schema to acestep.cpp's `AceRequest`. Calls `POST /lm` and `/synth`, polls `GET /job`, and cancels with `POST /job?id=N&cancel=1`. Sends source audio as multipart for cover, repaint, lego, extract and complete. Lists models and adapters from `GET /props`. |
| `providers/comfyui.py` | Moves today's `audioqi/editor/generation.py` (MusicGen through ComfyUI) behind the same protocol. The editor's existing "Generate a part" keeps working. |
| `providers/elevenlabs.py` | `POST /v1/music/plan` (free) and `POST /v1/music` with `prompt` or `composition_plan`. Phase G3. |
| `providers/lyria.py`, `providers/suno.py` | Phase G4. Suno stays a disabled stub that explains why. |
| `schema.py` | The parameter schema format (see 3.3), plus server-side validation of every request against it. Unknown fields are rejected and numbers are clamped to the provider's ranges. |
| `settings.py` | Non-secret settings in `data/generation/settings.json`, written atomically with mode 0600: enabled providers, engine path and port, default models, writer model, loudness target, idle timeout. |
| `secrets.py` | API keys in the macOS Keychain (Windows Credential Manager on Windows) through **`keyring`**, a new dependency. Keys are write-only from the browser: the API reports "key saved" or "no key", never the value. An environment-variable fallback covers headless use. |
| `engine.py` | `EngineSupervisor` for acestep.cpp, described below. |
| `resources.py` | `ResourceGuard`, described below. |
| `writer.py` | Ollama lyrics and style writer, described below. |
| `records.py` | A generation record per result: provider, model, every parameter, seed, timings and cost estimate. It is stored with the editor asset so "regenerate", "variation" and "same seed, new lyrics" are one click. |

**EngineSupervisor**
- Starts `ace-server --host 127.0.0.1 --port <port> --models <dir>` on first use. The host is hard-coded, and acestep.cpp's own `server.sh`, which binds `0.0.0.0`, is never used.
- Waits for `/health`.
- Stops the server after an idle timeout (default 10 minutes) and when the API shuts down.
- Restarts it once after a crash, then reports the failure.
- The binary and model folder are settings, and the supervisor refuses a path that is not a regular file the user owns.

**ResourceGuard**
- Generation jobs go through their own single-slot queue, separate from the editor's DSP pool, so two songs never generate at once.
- Before a music job it asks Ollama to unload all loaded models (`keep_alive: 0`).
- It reads free memory (`memory_pressure` on macOS, `psutil` elsewhere) and waits or refuses below a threshold (default 25% free). The message says what to close.
- It caps variations by available memory.
- It refuses to start a local engine while a VST/AU worker or stem separation is running.

**Writer**
- Uses Ollama `/api/generate` with `format` set to a JSON schema that returns `caption`, `lyrics` (section-tagged), `bpm`, `key`, `time_signature`, `language` and `duration`.
- Validates the output and retries once with the validation error. On failure it falls back to ACE-Step's `inspire` mode.
- Modes:
  - idea → full song brief;
  - rewrite or extend lyrics;
  - translate;
  - restyle a caption;
  - describe a reference track — this uses the suite's existing BPM, key and loudness analysis, so the model gets facts rather than guessing.
- The existing loopback rule and output-token budget from [GUARDRAILS](../GUARDRAILS.md) apply.

### 3.3 Parameter schema: how every provider shows every control

Each provider describes its own controls, and the UI renders them generically. Adding a provider, or a new parameter on an existing one, needs no UI work.

```json
{
  "provider": "acestep_local",
  "tasks": ["text2music", "cover", "cover-nofsq", "repaint", "lego", "extract", "complete"],
  "groups": ["Song", "Lyrics", "Music", "Variation", "Advanced"],
  "fields": [
    {"key": "caption", "type": "text", "group": "Song", "label": "Style description", "max": 1200, "required": true},
    {"key": "lyrics", "type": "lyrics", "group": "Lyrics", "sections": ["Intro","Verse","Pre-Chorus","Chorus","Bridge","Outro","Instrumental"]},
    {"key": "bpm", "type": "int", "group": "Music", "min": 30, "max": 300, "auto": true},
    {"key": "track", "type": "enum", "group": "Song", "tasks": ["lego","extract","complete"], "options": ["vocals","drums","bass","guitar","..."]}
  ]
}
```

Field types are `text`, `lyrics`, `int`, `float`, `bool`, `enum`, `seed`, `duration`, `region` (filled from the editor selection), `audio` (filled from a clip), `sections` (ElevenLabs composition plans) and `model` (filled from the provider's live model list). A field can be marked `auto`, which means "leave empty and let the model decide". It can also list the `tasks` it applies to and carry a `help` text. Fields marked `advanced` stay collapsed until asked for (progressive disclosure, per the [editor's interface principles](EDITOR_ROADMAP.md#6-interface-design-principles)).

**ACE-Step fields exposed:**
- Text and structure: caption, lyrics (or `[Instrumental]`), BPM, key and scale, time signature, vocal language, duration.
- Variations and the planner LM: seed, LM variations, synth variations, the planner LM on or off, and `lm_mode` (`generate`/`inspire`/`format`).
- LM sampling: temperature, CFG, top-p and top-k, and LM negative prompt.
- Diffusion: inference steps, guidance scale, shift, solver, DCW settings and custom timesteps.
- Editing tasks: cover strength, cover noise strength, repaint start and end, and track (for lego, extract and complete).
- Models and output: DiT model, LM model, LoRA adapter and scale, peak clip, and output format.

**ElevenLabs fields exposed (G3):**
- Prompt mode: prompt, length, and force instrumental.
- Composition plan mode, edited section by section:
  - `music_v1`: section name, local positive and negative styles, duration and lyric lines;
  - `music_v2` and `v2_5`: chunks of text, styles, duration, context adherence and conditioning reference.
- Global: global styles, `model_id`, seed, output format, `store_for_inpainting`, and `sign_with_c2pa`.

### 3.4 API routes (FastAPI, loopback)

| Route | Purpose |
|---|---|
| `GET /generation/providers` | Providers, with status (installed, running, key saved, enabled) and their schemas. |
| `GET` / `PUT /generation/settings` | Non-secret settings. |
| `PUT` / `DELETE /generation/providers/{id}/key` | Store or remove an API key. The key is never echoed back. |
| `POST /generation/providers/{id}/test` | Health check, or a free metadata call: `/props` locally, `/v1/music/plan` on ElevenLabs. |
| `POST /generation/lyrics` | The writer (Ollama), returning a validated song brief. |
| `POST /editor/projects/{id}/jobs` | New job types `generate_song`, `generate_part`, `repaint`, `cover`, `extract_track`, `add_layer` and `complete`, validated against the chosen provider's schema. |

### 3.5 Interface

- **Settings ▸ AI Generation** is reached from the home page and the editor.
  - It shows one card per provider: status light, enable switch, engine or model choice, a key field for external services, a "Test" button, and plain text on what that provider receives.
  - The local card shows the engine path, models found, disk used, idle timeout and the memory threshold.
- **Generate panel** in the editor, and "New song" on the home page:
  - **Simple:** one idea, then the writer drafts the caption and lyrics, the user edits, and presses Generate.
  - **Custom:** the full schema form, with lyrics in an editor that understands section tags.
  - **Variations:** results appear as takes, using the editor's existing take lanes, so they can be compared and comped.
  - **History:** past generations with their parameters, and "regenerate / variation / reuse seed".
- **Clip and selection actions in the editor:**
  - Repaint selection: regenerate a region and keep the rest.
  - Restyle clip: cover.
  - Extract an instrument.
  - Add a layer, for example "add a bass track" (lego).
  - Extend or complete the song: outpaint and complete.
- **Progress and cancel:** progress is shown in stages (writing → planning → generating → decoding → importing) with honest time estimates from the benchmarks, and a Cancel button that stops the engine job.

---

## 4. Safety, privacy and rights

- **Local stays local.** acestep.cpp and Ollama are contacted on loopback only, and the supervisor refuses to bind anything else.
- **External providers are the second deliberate exception to "local only"**, alongside in-browser plugins, and they are handled the same way:
  - **Off by default.** Each external provider is enabled separately in settings.
  - The first use shows exactly what is sent: prompts and lyrics always, and the source audio for editing tasks such as inpaint or cover.
  - Requests go only to the provider's fixed HTTPS host, never to an address supplied by a page.
  - Keys live in the OS keychain, are never sent to the browser, and are never logged. Request logs strip lyrics unless the user turns on debug logging.
- **No unofficial Suno wrappers.** They break Suno's terms and would carry account and legal risk for the user.
- **Rights notes shown in the UI:**
  - ACE-Step and acestep.cpp are MIT-licensed. The output belongs to the user, subject to the usual caution about resemblance to existing works.
  - For ElevenLabs, Lyria and others, the provider's terms apply and are linked from the provider card.
  - Lyria output is watermarked (SynthID).
  - The generation record keeps the provider and model for provenance.
- [GUARDRAILS.md](../GUARDRAILS.md) gets a "Generation boundary" section when phase G1 ships.

---

## 5. Roadmap

### Phase G1 — Local generation, end to end *(shipped 2026-11-10)*

**Shipped**

- **AI Song Studio** at `/generate`, opened from the workspace, the editor's project list, or the ✨ button inside an editor project (which generates into that project).
- **One-step engine install:** `audioqi/generation/setup.py` fetches acestep.cpp at pinned commit `07abf07`, builds it, and downloads four model files (5.3 GB) from a pinned Hugging Face revision, checking each by SHA-256. Downloads resume. It runs from the installers (asks once, remembers a "no", never fails the install) and from the **Install local engine** button, with progress.
- **Provider framework:** `audioqi/generation/` — provider protocol, parameter schema with server-side validation, settings, single-slot generation lock, memory guard, history.
- **acestep.cpp provider:** new songs with 23 controls (25 when LoRA adapters are present), 1–4 versions, cancel, engine started on demand on `127.0.0.1` and stopped after the idle timeout or with the API.
- **Writer:** Ollama (`gemma4:12b` by default) drafts a full brief from an idea and rewrites lyrics on request (which also covers translation). Without Ollama, a new brief falls back to the engine's planner.
- **Import:** as planned; a brand-new project also takes the song's tempo and key.
- **ComfyUI MusicGen** is listed as a second local provider through the same protocol. The editor's older "Generate a part" panel still uses its original job.

**Deferred from the G1 plan**

- Versions land on separate tracks (extra versions muted) rather than as take lanes.
- "Describe a reference track" for the writer.
- The guard does not yet check for a running stem separation or VST/AU worker; it checks free memory, which those reduce.
- The number of versions is capped at 4, not adjusted to free memory.

**Original G1 plan**


- **Provider framework:** the provider protocol, schema format and validation, settings store, generation queue and ResourceGuard.
- **acestep.cpp provider:**
  - EngineSupervisor;
  - text2music with the full schema;
  - variations;
  - cancel;
  - models and adapters listed from `/props`.
- **Writer:** Ollama brief, rewrite, translate, and describe a reference track. Falls back to ACE-Step `inspire`.
- **Import:** loudness-normalise with the editor's existing `normalize` in `audioqi/editor/processing.py` (default −14 LUFS, configurable). It applies one static gain capped at a −1 dBTP true-peak ceiling. ACE-Step's hot output (about −10 LUFS, 0 dBFS peaks) is simply turned down, with no limiting and no change to the dynamics. Results go into a new project or the open one, with a generation record saved.
- **UI:** Settings ▸ AI Generation (local cards), the Simple and Custom generate panel, and history.
- **Installer:** an optional step in `install.command` (and `install.ps1`) that clones acestep.cpp at a pinned commit (`07abf07`, 2026-11-06), builds it, and downloads the Q8 turbo models (about 5.6 GB) after asking.
- **Migration:** the existing ComfyUI MusicGen generation moves behind the provider protocol.

### Phase G2 — Editing with AI

- Repaint selection, outpaint/extend, cover and cover-nofsq (restyle), with the editor's selection and clips filling the `region` and `audio` fields.
- Lego (add a layer), extract (one instrument) and complete. These need the **base** DiT, an extra Q8 download *(size to confirm)* offered when first used.
- LoRA adapters: list, apply and set scale. Training them stays out of scope.
- Reference audio for style ("make it sound like this clip").

### Phase G3 — External providers

- Key storage (`keyring`), provider consent dialogs, and the GUARDRAILS update.
- **ElevenLabs Music:**
  - prompt mode;
  - composition-plan editor (sections or chunks, styles, lyric lines, durations);
  - free plan drafting through `/v1/music/plan`;
  - seed;
  - model choice;
  - output formats;
  - inpainting of a selection *(endpoint details to confirm against the inpainting guide)*.
- Cost hints shown before generating, wherever the provider publishes prices.

### Phase G4 — More providers and polish

- Google Lyria, once out of preview, with fields confirmed against the live docs.
- **Suno:** implemented if and when an official API is documented or partner access is granted. Until then the card explains why it is unavailable.
- Optional extra local engines *(each to be re-evaluated)*: ACE-Step XL turbo (needs about 9 GB of weights before compression), and LeVo 2 for non-commercial use.
- Batch "album" generation from a list of song briefs, queued overnight with the same memory guard.

---

## 6. Verification plan

- **Unit tests:**
  - schema validation (ranges, enums, task-specific fields, unknown fields rejected);
  - settings and secrets: a key never appears in any response or log;
  - writer JSON validation and retry;
  - ResourceGuard decisions;
  - the supervisor refuses non-loopback hosts and unsafe paths.
- **Contract tests:** a fake ace-server and a fake ElevenLabs server built on recorded response shapes, covering job polling, multipart results, cancel, errors, timeouts and crashes.
- **Benchmarks:** the 2.3 table is repeated on every engine upgrade. Release gates: no swap growth and at least 25% free memory during a local generation on a 24 GB Mac.
- **Browser tests:** settings cards, the generate flow, cancel mid-generation, takes and repaint on a selection, and keyboard-only use. Contrast is checked against the editor's measured thresholds.
- **Listening:** a short critical-listening checklist per release, covering vocal intelligibility, structure following the tags, artefacts, and loudness after import. Results that were not listened to are reported as such.

---

## 7. Decisions

Phase G1 went ahead with the recommended defaults (2026-11-10):

1. **Where acestep.cpp lives:** `data/engines/acestep.cpp`, built by the installer. `MUSIC_SUITE_ACESTEP_DIR` or the `engine_dir` setting points at another build.
2. **Default lyrics model:** `gemma4:12b`, changeable in AI Song Studio ▸ Settings.
3. **Import loudness:** −14 LUFS, changeable or switched off in Settings.
4. **First external provider:** ElevenLabs, in phase G3. It needs the user's own API key and paid plan.
5. **Still open:** the benchmark copies at `~/Projects/ACE-Step-1.5` (about 10 GB) and `~/Projects/acestep.cpp` (about 5.6 GB) are no longer used and can be deleted by the user.

## 7.1 Verification log

### Phase G1 (2026-11-10, Apple M5, 24 GB, macOS 26.6)

- **Automated:** 46 new tests in `tests/test_generation.py` (schema, settings, job flow, cancel, memory refusal, writer, engine safety, pinned sources, checksum and resume, installer hooks). Full suite: 307 passed, 1 skipped. `mypy` clean on the new package; `tsc` and ESLint clean.
- **Real install:** `python -m audioqi.generation.setup --yes` from an empty engine folder cloned, built (about 30 s) and downloaded the VAE with its checksum verified; the three larger models were copied from the benchmark folder to save bandwidth, so their download path was exercised by one file only. A second run reported "already installed".
- **Real generation through the API:** idea → brief with `gemma4:12b` in 25 s; a 40 s song in two versions in 33 s; cancel stopped a running song within a second; a bad tempo was rejected with 422; "Unload now" left no engine process.
- **Browser (desktop and 375 px):** install button with live progress, writer filling the form, a 45 s song in 26 s, the result playing and opening in the Studio Editor on its own track, generating two versions into an open project, history, no horizontal scroll, no console errors.
- **Not tested:** Windows and Linux installs; a Mac without CMake or without Apple's command line tools; a machine without Ollama (covered by tests with fakes only); the planner fallback through the app; listening quality; songs longer than 3.5 minutes; LoRA adapters.

---

## 8. Sources

- [Suno explores developer API (Music Business Worldwide)](https://www.musicbusinessworldwide.com/suno-explores-developer-api-seeking-apps-that-unlock-experiences-generative-music-makes-possible-for-the-first-time/)
- [Suno platform sign-in page](https://platform.suno.com)
- [ElevenLabs: Compose music](https://elevenlabs.io/docs/api-reference/music/compose)
- [ElevenLabs: Create composition plan](https://elevenlabs.io/docs/api-reference/music/create-composition-plan)
- [ElevenLabs: Composition plans guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans.md)
- [ElevenLabs: Music inpainting guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/inpainting.md)
- [Google: Generate music with Lyria](https://ai.google.dev/gemini-api/docs/lyria/music-generation)
- [ACE-Step 1.5 (GitHub)](https://github.com/ace-step/ACE-Step-1.5)
- [ACE-Step 1.5 paper](https://arxiv.org/pdf/2602.00744)
- [acestep.cpp (GitHub)](https://github.com/ServeurpersoCom/acestep.cpp)
- [ACE-Step 1.5 GGUF models](https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF)
- [Awesome ACE-Step](https://github.com/ace-step/awesome-ace-step)
- [LeVo 2 paper](https://arxiv.org/pdf/2606.30642)
- [AI music rights comparison (invideo)](https://invideo.io/blog/ai-music-copyright-comparison/)
- [Ollama: gemma4](https://ollama.com/library/gemma4)
