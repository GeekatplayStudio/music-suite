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

### Phase G2 — Editing with AI *(shipped 2026-11-10)*

**Shipped:** an **AI edit** section in the Studio Editor's clip panel, backed by the acestep.cpp provider.

| Edit | Engine task | Model | Result in the editor |
|---|---|---|---|
| Regenerate a section | `repaint` over the highlighted range | turbo | Replaces the clip's audio; everything outside the range is unchanged |
| Extend (before or after, 10–60 s) | `repaint` past the edge | turbo | Replaces the clip's audio and lengthens the clip |
| Restyle (keep 5–100%, optional "stay close" remix) | `cover` / `cover-nofsq` | turbo | Replaces the clip's audio |
| Extract an instrument | `extract` | base | New track under the clip |
| Add a part | `lego` | base | New track under the clip |
| Build a full song around it | `complete` | base | New track; the original part is muted |

- **Versions:** up to 4. The first replaces or adds; the others go on muted tracks to compare. Every change is one undo step.
- **Clip audio** is sent to the local engine as 24-bit WAV (it is stored as 32-bit float). The limit is 600 s including any extension, which is the engine's latent buffer.
- **Levels:**
  - The engine scales every result to full scale. Regenerate and extend are therefore gain-matched on the untouched audio: measured, the original part comes back unchanged to within 1e-5.
  - Restyle and build-a-song are brought to the source's loudness.
  - Extracted and added parts start 6 LU below it. They are generated rather than separated (correlation with the mix about 0.05), so their real level in the mix cannot be measured.
- **Editing model:**
  - The base DiT (`acestep-v15-base-Q8_0.gguf`, 2.4 GB) is pinned by SHA-256 like the others.
  - It is offered in the installer's question, by **Download editing model** in Settings, and by the task list, which marks those tasks as needing it.
  - The engine is always told which DiT to use, because with the base model present it would otherwise load the base model for new songs too (it picks alphabetically).

**Deferred:**

- Reference audio for style.
- LoRA training. Applying LoRA adapters is already in the schema when an `adapters/` folder has any.
- Running the planner model for add-a-part and build-a-song: the engine allows it, but it is untested here.

**Original G2 plan**

- Repaint selection, outpaint/extend, cover and cover-nofsq (restyle), with the editor's selection and clips filling the `region` and `audio` fields.
- Lego (add a layer), extract (one instrument) and complete. These need the **base** DiT, an extra Q8 download *(size to confirm)* offered when first used.
- LoRA adapters: list, apply and set scale. Training them stays out of scope.
- Reference audio for style ("make it sound like this clip").

### Phase G3 — External providers *(first pass shipped 2026-11-10)*

**Shipped:** ported from the `feature/song-generation` branch (commit `4b304ac`, written in a parallel session) and fitted into the G1 provider framework.

- **Key storage** (`audioqi/generation/secrets.py`). Keys are looked up in an environment variable first, then the OS keychain through `keyring`, then an owner-only file under `data/secrets/` on systems with no keychain. A key saved while a keychain is available is never written to disk. Keys are write-only: routes need the `X-Music-Suite-Action: generation-key` header, return only "configured" and the source, and never echo the key.
- **Saving a key switches that service on; removing it switches the service off.** Until then the service is off and absent from the generator list.
- **ElevenLabs Music:** style, lyrics, length (10–600 s), tempo and key folded into the prompt, instrumental, model (`music_v2_5`, `music_v2`, `music_v1`) and download quality. With *Plan the sections first*, it drafts a plan through the free `/v1/music/plan`, then composes from that plan, which is when a seed applies.
- **fal.ai:** MiniMax Music 2.6 (separate lyrics field) and Google Lyria 3 Pro (lyrics inside the prompt). Uses the queue API with polling and cancel, and downloads only from `*.fal.media`, following redirects only inside that allowlist.
- Online songs are levelled on import like local ones (MP3 included) and recorded in history.
- The memory guard is skipped for online services, since they use no local memory.

**Merged afterwards (same day, at the user's request that nothing on GitHub be lost):** pull request #4 was merged into `main` with its commit kept in history. Its remaining engines became providers:

- **ACE-Step 1.5 through its own Python server** (`providers/acestep_server.py`): off by default, loopback only (`MUSIC_SUITE_ACESTEP_URL`), downloads only through the server's `/v1/audio` route, up to 4 versions. It suits NVIDIA machines that already run that server. On Apple Silicon the built-in acestep.cpp engine uses far less memory.
- **YuE2** (`providers/yue2_engine.py` and `yue2_worker.py`): off by default. It needs `MUSIC_SUITE_YUE2_PYTHON` pointing at a YuE2 install (NVIDIA, about 24 GB), runs in a separate process, and every request must tick the non-commercial licence box (CC BY-NC 4.0).
- The branch's in-editor panel became a **Create a song** section in the editor's side panel (shown when no clip is selected), which opens AI Song Studio for that project.

Its duplicate modules (`audioqi/editor/songs/`, the `song` job and the `/editor/songs` routes) were not kept, because AI Song Studio covers each of them; they remain in the merge history.

**Completed later the same day (G3 finish):**

- **Song plan editor** (ElevenLabs, Music 2 / 2.5):
  - sections with name, lyrics, length (3–120 s), styles, styles to avoid and adherence;
  - reorder, add and remove;
  - **Draft a plan (free)** through `/v1/music/plan`, converted from either plan format;
  - validated on the server: 1–30 sections, at most 10 minutes, at most 30 lines of 200 characters per section, and at least one style in the first section.
- **ElevenLabs edits in the Studio Editor:**
  - **Regenerate a section** (3–120 s) and **Extend** (5–120 s), built as a composition plan: kept parts of the stored song (pieces of 3–120 s, slivers under 3 s absorbed into the new section) plus one generated chunk;
  - an optional conditioning on the original section (its first 30 s);
  - songs generated here are stored for inpainting, and their ids are remembered per project;
  - other clips are uploaded (MP3) only with the per-edit **Allow uploading this clip** tick, and only once;
  - results are gain-matched to the source like local edits.
- **Cost estimates** before every online request:
  - ElevenLabs at about $0.15 per minute, including the upload;
  - fal.ai at $0.15 per MiniMax song and $0.08 per Lyria song;
  - all dated 2026-11 and linked to the provider's page. The ElevenLabs rate is from secondary sources; fal.ai's are from its model pages.

**Still open:**

- Real calls against both services. They were tested only against recorded response shapes, because no paid key was available. In particular, whether ElevenLabs accepts reference chunks longer than 120 s or shorter than 3 s is unknown, so the app keeps to 3–120 s.
- A "compose detailed" mode with word timestamps.

**Original G3 plan**

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

### Phase G4 — More providers and polish *(shipped 2026-11-10)*

**Shipped**

- **Albums** (`audioqi/generation/albums.py`, AI Song Studio ▸ *Album*):
  - up to 20 song ideas generated one after another into one project, with an optional lyrics-and-style brief written per track from the album concept (your own settings win over the writer's);
  - low memory or a busy generator makes a track wait (up to 2 hours) instead of failing;
  - a failed track does not stop the album;
  - albums interrupted by a shutdown resume when the API starts again;
  - Stop and Remove (the project is kept);
  - **Open in Studio Editor** places finished songs one after another, 2 s apart, each on its own track, and marks them placed so they never duplicate.
- **Google Lyria through the Gemini API** (`providers/lyria.py`):
  - your own Gemini key, off until saved;
  - Interactions API (`POST /v1beta/interactions`, `Api-Revision: 2026-05-20`, `x-goog-api-key`);
  - models `lyria-3.5` ($0.08 per song, WAV available) and `lyria-3-clip-preview` (30 s, $0.04), prices from Google's pricing page;
  - style, lyrics, instrumental, tempo, key and a length request are folded into the prompt, because Lyria takes them that way;
  - the audio is found in the response's content blocks, which is defensive because Google shows no full raw response;
  - Google's error messages are passed on without the key;
  - SynthID watermark noted.
- **XL music model** (optional, 4.9 GB, SHA-256 pinned):
  - downloaded from Settings;
  - used for new songs when present unless switched off; AI edits keep the standard model.
- **Not added:**
  - **Suno:** still no public API on 2026-11-10 (partner programme only); its card explains why.
  - **LeVo 2:** non-commercial licence, PyTorch-only, and memory-heavy on this class of machine.

**Original G4 plan**

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
5. **Parallel branch:** `origin/feature/song-generation` has been ported in part (see G3) and can be deleted from GitHub once you are happy with this.
6. **Still open:** the benchmark copies at `~/Projects/ACE-Step-1.5` (about 10 GB) and `~/Projects/acestep.cpp` (about 5.6 GB) are no longer used and can be deleted by the user.

## 7.1 Verification log

### Phase G4 (2026-11-10, Apple M5, 24 GB)

- **Automated:** 21 new tests:
  - albums: a whole album into one project, the writer filling tracks with user settings winning, waiting out low memory, a failed track not stopping the rest, resume after a restart, cancel, placed and remove, eight kinds of bad request, a switched-off provider refused;
  - Lyria: the prompt built from every setting, both models, audio found in the documented response shape, bad base64 refused, a full job with the right host and headers, and Google errors explained without the key;
  - the XL model pinned and preferred only when present and allowed.

  Full suite: 406 passed, 1 skipped.
- **Real XL benchmark** (2-minute song with the planner):

  | Model | Time | Engine memory peak | Lowest free memory |
  |---|---|---|---|
  | Standard | 63 s | 4.4 GB | 45% |
  | XL | 80 s | 5.0 GB | 41% |

  The download took 211 s, checksum verified.
- **Real album in the browser:** "Harbour Lights", 2 songs of 30 s, lyrics written by `gemma4:12b`, local engine: about 2 minutes in all. Opening it placed both songs one after another (1:03 session); the placed flags prevent duplicates.
- **Not tested:** any real Lyria request (no Gemini key here); an album across an actual API restart (covered by a test only); an overnight-length album; listening quality, including XL compared with standard.

### Phase G2 (2026-11-10, Apple M5, 24 GB)

- **Automated:** 16 new tests covering:
  - mapping of each task to the engine request;
  - region and length limits;
  - base-model gating, both before queueing and in the request;
  - required fields per task;
  - level matching for repaint, extend before the start, loudness for new audio, and parts 6 LU below;
  - a full edit job against a stand-in engine (24-bit upload, two versions, untouched audio at the source level);
  - the turbo model always named for new songs;
  - the installer's editing-model prompt.

  Full suite: 366 passed, 1 skipped.
- **Real engine, through the API, on a 30 s song** (minimum free memory 55%):

  | Edit | Time | Result |
  |---|---|---|
  | Regenerate 10–18 s | 18 s | audio before the region unchanged (max difference < 1e-5) |
  | Extend by 15 s | 27 s | original 30 s unchanged |
  | Restyle | 18 s | — |
  | Extract vocals | 27 s | — |
  | Add a bass part | 25 s | — |
  | Build a song around it | 25 s | — |

- **Browser:** highlighted 0:10–0:20 with the Range tool, selected the clip, and ran Regenerate a section: the clip was replaced in place and Undo restored it. Extend after the end lengthened the session from 0:44.4 to 1:04.4. Extract vocals on the 64 s clip added a new track in about 85 s. No console errors.
- **Real download:** the editing model through `install_editing`: 2.4 GB in 64 s, checksum verified.
- **Not tested:** listening quality of any edit; the planner with add-a-part and build-a-song; Windows and Linux.

### Merge of pull requests #3 and #4 (2026-11-10)

- **#3 (mastering input gain and stereo stage, by an outside contributor):** reviewed in full (signal processing only, no network or file access), merged with its commit kept. Its out-of-date `pnpm-lock.yaml` was not taken. Its 8 tests pass.
- **#4:** merged as described under G3.
  - 12 tests for the ported engines: ACE-Step server field mapping, versions, absolute-URL refusal, loopback-only addresses, a switched-off provider never touching the network; YuE2 off by default, the licence box, and a real separate-process run with a stand-in `yue2` package.
  - **Real check:** a 20-second song through ACE-Step's own Python server on this Mac, with the requested tempo and key, imported and levelled, in 91 s. The server's model list is empty until its first song loads a model, so the model picker appears after that.
- **Full suite:** 351 passed, 1 skipped.

### Phase G3 finish (2026-11-10)

- **Automated:** 20 new tests:
  - plan validation (10 kinds of bad plan) and plan-to-chunks mapping;
  - plans needing Music 2+, and drafting plus conversion of both plan formats;
  - inpaint plans: kept pieces split at 120 s, slivers absorbed, the 3–120 s rule, conditioning, extend at either end;
  - upload consent: nothing is sent without it;
  - one upload reused across edits, with gain matching;
  - estimates for prompts, plans, edits with an upload, fal models and local providers;
  - stored songs remembered after generation.

  Full suite: 386 passed, 1 skipped.
- **Browser, with an obviously fake key (nothing sent to ElevenLabs):**
  - the Song plan panel: sections added, first-section styles taken from the description, commas typed in style lists;
  - the live estimate ($0.10 for a 40 s plan), and a clear reason when the request is not ready;
  - in the editor, ElevenLabs offered for Regenerate a section and Extend, with the upload consent and a $0.37 estimate for extending a 64 s clip by 20 s including its upload.

  The key was removed afterwards, and `security find-generic-password` confirmed it was gone.
- **Not tested:** any real ElevenLabs or fal.ai request.

### Phase G3 first pass (2026-11-10)

- **Automated:** 24 new tests: key storage (write-only, keychain-first with the on-disk file absent, file fallback 0600 inside a 0700 folder, environment wins, bad keys rejected), ElevenLabs payloads in prompt and plan mode, refusal messages that never contain the key, the fal.ai queue flow, download allowlist and redirect escape, foreign queue addresses, Lyria prompt folding, and no memory check for online services. Every test uses a fake keychain. Full suite: 331 passed, 1 skipped.
- **Browser:** saved an obviously fake key from Settings. The key never appeared in any API response, ElevenLabs switched on, and its form showed its own controls with the "sends your text, bills your account" note. Removing the key switched it off, and `security find-generic-password` confirmed the Keychain item was gone. No request was sent to either service.

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
