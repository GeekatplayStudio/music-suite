# Interface roadmap: languages, colour themes, multiple screens

Planned work, from viewer feedback (YouTube, 2026-11-26) and requests.

**Done (2026-11-26):**
- The whole interface in English and Russian, with a language switch in every header. Backend messages are translated in the browser, and the user manual has a Russian edition.
- Six colour themes, including a light one.
- Pop-out windows for the editor's inspector, lower panel and on-screen piano, and for the analyser's Visual AI and charts. They come with a one-time resource warning, remember their place, and with several monitors reopen on the other screen.

What is still open is marked below. Sizes are rough, measured from the code on 2026-11-26:

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
| 1 | **Done.** A small built-in system instead of `next-intl` (`lib/i18n`): English is the source; TypeScript refuses a language file with a missing or extra key. The language comes from a cookie (the browser language at first), so pages render translated from the first frame. Switch in every header. | small |
| 2 | **Done.** Every screen's strings are in the catalogue, with Russian plural forms (about 2,200 strings in 14 areas). The 128 General MIDI instruments are included. Left in English on purpose: names saved in projects that the code matches (e.g. "Sing-along", "Section A"), text sent to the music models (style prompts, plan section names), plug-in, preset and model names, and form fields described by a provider's own schema. | large |
| 3 | **Done, in the browser.** Backend messages are translated without changing the backend: `lib/i18n/server-messages-ru.ts` holds the backend's English sentences (515 exact, 142 patterns with values kept, extracted from the Python source) and the API helpers translate error details and progress text as they arrive. Codes the interface compares (`status`, `stage`) are never touched. Still English: provider schemas, mastering notes lists, raw install logs. Re-run the extractor when backend messages change. | medium |
| 4 | Russian translation of the catalogue (shipped as written; a native speaker's review is welcome). Then further languages from requests. | medium per language |
| 5 | Check layouts: Russian runs about 30% longer than English, so buttons and the editor header must wrap or truncate cleanly. | small |
| 6 | **Done for the manual:** `docs/USER_MANUAL.ru.md` and `docs/FIRST_PROJECT.ru.md`; the Help page shows the Russian manual when the interface is Russian. The Windows install guide already exists in Russian. | medium |

Not translated: model names, musical terms that are used in English by musicians (BPM, LUFS),
and log files.

## 2. Colour themes

The interface is dark slate with cyan accents, and the colours are written into each
component. Themes need those colours to come from shared names first.

| Step | What | Size |
|---|---|---|
| 1-3 | **Done, by a shorter route.** Tailwind 4 colour classes read CSS variables, so `app/themes.css` re-maps the accent (cyan) and surface (slate) palettes per theme; about 900 of the 1,180 hard-coded colours follow without editing components. Themes: Midnight cyan, Amber studio, Violet night, Forest, Magenta; picked in every header, saved per browser. | small |
| 3b | **Done.** Light (daytime): every palette the interface uses is turned over (950 ↔ 50…), and white and black swap, so translucent borders and overlays still work. It also sets its own page background, glass panels and native controls. | small |
| 4 | Charts and canvases: the waveform, piano roll, spectral view, meters, Plotly charts and visualisers draw with their own colours, so they stay dark in the light theme. Read them from the tokens. | medium |
| 5 | Contrast check of every theme (text and controls meet WCAG AA). | small |
| 6 | Surge XT's skin can follow the chosen theme (it is generated from Surge's own dark skin today). | small |

## 3. Multiple windows and monitors

Today each workspace is its own page, so the analyser (with its Visual AI views), the editor,
the AI Song Studio, Synth Studio, Models & engines and the Geometry Mapper can already be
opened in separate browser windows and dragged to different monitors. What does not exist is one session spread over several windows that stay
in step (for example the editor on one monitor and its visuals and mixer on another).

| Step | What | Size |
|---|---|---|
| 1 | **Done, for the editor.** Pop-out panels: the inspector, the lower panel (piano roll, sheet music, spectral view) and the on-screen piano open in windows of their own, rendered from the same page (a React portal into a window it opened), so state and playback are shared with nothing to sync; unused keys are passed back to the editor; closing the window brings the panel back. Several can be open at once. **Also done:** the analyser's Visual AI and its charts (the Chart Studio controls stay on the page and the charts follow on the other monitor). Styles are copied from the live stylesheet rules and kept in step, the window's resizing reaches charts and canvases, and charts measure themselves in a pop-out. The editor has no separate mixer panel yet; when it does, it gets a pop-out too. | medium |
| 2 | **Linked windows** for bigger views (mixer, piano roll, visuals, analyser charts): open with `window.open`, kept in step through `BroadcastChannel` (playhead, selection, transport, track changes; audio levels and spectrum sent as small frames about 30 times a second). The editor window stays in charge; the others follow. | large |
| 3 | **Done.** Each panel's window remembers its position and size. With several monitors, the Window Management API (Chrome and Edge, asks permission once) puts it back on the screen it was on, or on a screen other than the main page's the first time. Browsers do not allow reopening windows by themselves on page load, so windows are reopened with their buttons. | medium |
| 4 | **Layouts:** save and restore a window arrangement per session ("Editing", "Mixing", "Performance"). | small |
| 5 | **Done.** A one-time warning explains the cost. Visual AI pauses when its window is hidden and draws with its own window's frame timer, so it keeps running when the main page is behind other windows. | small |

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
