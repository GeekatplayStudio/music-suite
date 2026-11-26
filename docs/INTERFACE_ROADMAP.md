# Interface roadmap: languages, colour themes, multiple screens

Planned work, from viewer feedback (YouTube, 2026-11-26) and requests. Nothing here is built
yet. Sizes are rough, measured from the code on 2026-11-26:

| Measure | Count |
|---|---|
| Interface screens and components (`.tsx`) | 52 files, about 20,000 lines |
| User-facing English strings in them | about 1,200 |
| Backend messages a user can see (Python errors and notices) | about 400 |
| Colour classes written directly into components (`text-cyan-300`, `bg-slate-900`…) | about 1,180, plus 67 hex colours |
| Colour variables in the shared stylesheet | 18 |
| User manual / help guide | 930 + 380 lines |

---

## 1. Languages (i18n)

Many viewers write in Russian; the app is English only. Docs come last, after the app speaks
the language.

| Step | What | Size |
|---|---|---|
| 1 | Add `next-intl` (App Router support), a language setting (browser language by default, a switch in each header), and English as the source catalogue. | small |
| 2 | Move the interface strings into the catalogue, screen by screen: AI Song Studio and the editor's header first (most seen), then the inspector, the analyser, Models & engines, Synth Studio, the mapper. Plurals and numbers through the library, not string joins. | large (about 1,200 strings) |
| 3 | Backend messages: give each message a stable key with English text, send the key with the text, and translate in the browser. Messages built from values (file names, sizes) keep the values separate. | medium (about 400 messages) |
| 4 | Russian translation of the catalogue, checked by a native speaker. Then further languages from requests. | medium per language |
| 5 | Check layouts: Russian runs about 30% longer than English, so buttons and the editor header must wrap or truncate cleanly. | small |
| 6 | **Docs last:** the user manual (and the in-app Help page), the first-project guide and the install guides, in Russian. The Windows install guide already exists in Russian. | medium |

Not translated: model names, musical terms that are used in English by musicians (BPM, LUFS),
and log files.

## 2. Colour themes

The interface is dark slate with cyan accents, and the colours are written into each
component. Themes need those colours to come from shared names first.

| Step | What | Size |
|---|---|---|
| 1 | Define semantic colour tokens (surface, panel, text, muted text, accent, accent text, warning, danger, success, track colours) as CSS variables, exposed to Tailwind 4 through `@theme`. | small |
| 2 | Replace the hard-coded colour classes with the tokens, component by component (about 1,180). Mechanical but wide: one area per change, checked on screen. | large |
| 3 | A theme picker (header and Settings): the current *Midnight cyan*, plus for example *Amber studio*, *Violet*, *Forest*, and a light theme. Saved per browser. | small |
| 4 | Charts and canvases: the waveform, piano roll, spectral view, meters, Plotly charts and visualisers draw with their own colours; read them from the tokens. | medium |
| 5 | Contrast check of every theme (text and controls meet WCAG AA). | small |
| 6 | Surge XT's skin can follow the chosen theme (it is generated from Surge's own dark skin today). | small |

## 3. Multiple windows and monitors

Today each workspace is its own page, so the analyser (with its Visual AI views), the editor,
the AI Song Studio, Synth Studio, Models & engines and the Geometry Mapper can already be
opened in separate browser windows and dragged to different monitors. What does not exist is one session spread over several windows that stay
in step (for example the editor on one monitor and its visuals and mixer on another).

| Step | What | Size |
|---|---|---|
| 1 | **Pop-out panels** with the Document Picture-in-Picture API (Chrome and Edge): a panel such as the meters, the visualiser or the on-screen piano moves into its own always-on-top window that shares the page's state directly, so nothing needs syncing. | medium |
| 2 | **Linked windows** for bigger views (mixer, piano roll, visuals, analyser charts): open with `window.open`, kept in step through `BroadcastChannel` (playhead, selection, transport, track changes; audio levels and spectrum sent as small frames about 30 times a second). The editor window stays in charge; the others follow. | large |
| 3 | **Place windows on chosen monitors** with the Window Management API (Chrome and Edge, asks permission once): remember which panel goes on which screen and reopen the layout. | medium |
| 4 | **Layouts:** save and restore a window arrangement per session ("Editing", "Mixing", "Performance"). | small |
| 5 | **A warning before opening extra windows:** each window is another browser page; live visuals in several windows use more memory, processor and graphics power. Show the cost, and let a window pause its visuals when hidden. | small |

Firefox and Safari do not support all of these APIs; they keep single-window use.

---

## 4. From viewer comments (2026-11-26)

| Comment | Status in the code | Action |
|---|---|---|
| Generation ran on the processor until the Torch packages were downloaded in Settings | **True for the published version (`c097b72`)**: on Windows it builds the music engine for the processor only. GPU builds (Vulkan, CUDA, Metal) and Settings ▸ Local model downloads ▸ Rebuild runtime are in the next update (measured on an RTX 3090: a 30 s song in 7.8 s on the GPU, 49 s on the processor) | Release the GPU build; Models & engines now says what the music engine runs on and how to rebuild it for the graphics card |
| Only ACE-Step appears when downloading models | **True for the published version**: ACE-Step is the only local generator it installs (YuE2 and ACE-Step's own server need separate setup; online services need keys). The next update adds HeartMuLa, Stable Audio 3, MiniMax Music 3, DiffRhythm and Magenta RealTime 2 under AI Song Studio ▸ Settings ▸ Local model downloads; most need an NVIDIA GPU | Release them, and list every local generator on Models & engines, with what each needs and whether this computer can run it |
| Even the result has background noise | The editor has Reduce noise, DeClick, DeHum, DeReverb and spectral repair, but they are manual and were not shown | Covered in [FIRST_PROJECT.md](FIRST_PROJECT.md) step 7. Later: an AI denoise model (audio-separator includes denoise models) as a one-click clean-up for generated songs |
| Show the process step by step: melody from the keyboard, lyrics, model, result | Possible today (record notes, Export ▸ Start an AI song from the mix, Restyle with lyrics) | Written as [FIRST_PROJECT.md](FIRST_PROJECT.md); a video following it |
| Only for people who understand how music is built | The full editor is deep | First-project guide; later a simple mode that hides the advanced controls |
| Needs a powerful graphics card | Not required; everything runs on the processor, more slowly (30 s song: 49 s on the processor, 7.8 s on an RTX 3090) | Say so in the README and the guides |
| Not on Mac | Runs on macOS (Apple Silicon) with `install.command`; ACE-Step uses the Apple GPU, and AI stem separation can use it too. Of the new generators in the next update, only Magenta RealTime 2 and the small Stable Audio model run on a Mac; the rest need NVIDIA | State per model which systems it runs on (part of the Models & engines listing above) |
