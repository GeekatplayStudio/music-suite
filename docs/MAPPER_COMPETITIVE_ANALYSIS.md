# Song Geometry Mapper — competitive analysis

Last reviewed: 2026-07-26.

The mapper is easy to mis-position because it sits between four established
categories and is not really a member of any of them. This document says where
it actually competes, what it wins on today, what it loses on today, and what
would put it clearly ahead.

## The four categories it is measured against

**1. Video-export music visualisers.** Specterr, Renderforest, Visuval, Plane9,
MilkDrop/projectM. You supply audio, pick a preset, get a video. Optimised for
looking good on a release-day post. They do not claim to tell you anything
about the music, and they do not.

**2. Live and VJ engines.** TouchDesigner, Resolume Arena, VDMX, Unreal Engine.
Node graphs and shaders with audio-reactive inputs, built for stage and
installation work. Effectively unlimited, and effectively a second profession.

**3. Analysis tools.** Sonic Visualiser (with Vamp plugins), Audacity, iZotope
Insight/RX, Voxengo SPAN. Rigorous, well-founded, and almost entirely
two-dimensional: waveform, spectrogram, and time-series annotation lanes.

**4. Research latent-space explorers.** `latent-musicvis` (Stable Audio VAE +
UMAP, 3D, playback-synced), plus the general run of t-SNE/UMAP notebooks. This
is the closest conceptual neighbour: high-dimensional audio features projected
to 3D and made navigable.

The mapper is category 3's rigour, presented with category 1's production
values, using category 4's core idea. Nothing else in the list occupies that
position, which is the opportunity and also why comparisons are usually unfair
in one direction or the other.

## What we do better

**Similarity is distance you can fly through.** Sonic Visualiser can show a
self-similarity matrix; it is a 2D plot you read. We make the same relationship
a space you navigate, with a playhead moving through it in sync with the audio,
and section arcs joining passages that recur. For "why does this chorus feel
like that other bit", the spatial form answers faster than the matrix does.

**We refuse to guess.** Tempo and key both carry a confidence and print
"unclear" below threshold. Nearly every tool in categories 1 and 4 prints a BPM
unconditionally, including for ambient material with no beat. Getting this
right also forced two genuine bug fixes — the chroma window and the
peak-prominence measure — that a tool willing to print a plausible number would
never have caught.

**Every point explains itself.** Hover any node and get its eight descriptors
plus a sentence saying why the current mapping mode placed it at that
coordinate, in that mode's own terms. No tool in any of the four categories
does this. Dimensionality-reduction plots in particular are notorious for
axes nobody can interpret.

**Audio-clock-correct slow motion.** 0.05x–2x where trails, pulses and ribbons
keep their shape rather than shrinking, and pausing freezes the state for
inspection. This is the difference between a visualiser you watch and an
instrument you inspect with, and I have not found another tool that does it.

**Fully local, no account, no network.** Loopback only, no CDN assets, no
telemetry, no upload of your unreleased material to anyone's cloud. Category 1
is overwhelmingly cloud-rendered and account-gated. For anyone working on
unreleased music this is not a preference, it is a requirement.

**No third-party JavaScript.** Vanilla ES modules and Canvas 2D. Small,
auditable, no supply chain, no version churn, runs from a folder forever.

**Local LLM style description with the measurement kept beside it.** When
Ollama is present it writes the description; the measured, rule-derived reading
is always shown next to it. During testing llama3.1 called a mid-tempo C major
reference "metalcore or djent" — keeping both visible is what makes that
harmless rather than misleading.

**It is part of a pipeline.** The mapper shares a run with analysis, mastering
and reporting. Standalone visualisers are dead ends; this one sits next to the
work.

**Help on all 63 controls**, hover-and-hold, with a test that fails the build if
a control ships without it.

## What they do better

**Video export.** Specterr and Renderforest render 4K H.264 in the cloud on a
predictable timeline. We record WebM in real time via MediaRecorder and hand
the user an ffmpeg command. This is our weakest area outright.

**GPU throughput.** TouchDesigner, Unreal and the WebGL browser tools push
millions of particles. We are Canvas 2D at 2600 points. The recent work took
the default frame from 67 ms to 24 ms, but that is optimisation inside a
ceiling a shader-based renderer does not have.

**Preset ecosystems.** MilkDrop/projectM have thousands of community presets
and Plane9 ships 250+. We have ten built-ins plus user-saved presets.

**Live performance.** Resolume and TouchDesigner do live audio input, MIDI and
timecode sync, multi-screen output, NDI. We are file-based and offline by
design, which is a real limitation for stage use.

**Beat and downbeat tracking.** Sonic Visualiser's Vamp beat trackers give
per-beat and per-downbeat positions. We give one global BPM. Theirs is strictly
more useful.

**Deep-learning tagging.** A CLAP-style audio embedding classifies genre and
mood far better than a language model reasoning over eight DSP numbers. The
Geekatplay MusicMapper ComfyUI node already does this, so the gap is inside our
own family of tools.

**Cross-song comparison.** Research tools routinely embed a whole corpus in one
space. We map exactly one song at a time.

**Shareability.** Cloud tools produce a link. We produce a file on your disk.

## What would put us ahead

Ranked by differentiation gained per unit of work, and constrained to things
that fit the vanilla/offline architecture.

1. **Beat and downbeat grid.** The onset envelope already exists — it is what
   the tempo estimator autocorrelates. Extracting beat positions from it gives
   a bar ruler on the waveform strip, bar-quantised camera moves, and a
   musically meaningful time axis. Closes the clearest gap against Sonic
   Visualiser using data already in memory.

2. **Named structural segmentation.** We already detect repeats. A novelty
   curve over the self-similarity data would turn those into labelled sections
   — intro, verse, chorus — colouring the waveform strip and the cloud by
   section. This is the single feature most likely to make someone say the tool
   showed them something they did not already know.

3. **Click a node to hear that moment.** `latent-musicvis` proves how
   compelling this is, and we already have hit-testing and a seekable
   transport. Small change, large payoff in how the map feels.

4. **Cross-song mode.** Map several songs into one space: an album's
   consistency, a mix against its reference, a master against its source. This
   is the feature that would make the mapper indispensable inside a mastering
   suite rather than adjacent to one, and nothing in category 1 or 2 can do it
   at all.

5. **Deterministic offline video export.** Render frame-by-frame at a fixed
   timestep to an offscreen canvas and hand ffmpeg a real frame sequence,
   instead of recording the live canvas. Fixes the weakest area and removes the
   dropped-frame problem that makes real-time capture unreliable on slow
   machines.

6. **A raw WebGL2 renderer behind a flag.** No library, so the no-dependency
   rule survives. Lifts the point ceiling by orders of magnitude and makes
   ghost layers and haze nearly free. Large job; only worth it after 1–4.

7. **Local audio embedding for genre tags.** The backend already runs Python.
   A CLAP-style embedding would give genre and mood far better than the current
   DSP-plus-LLM path, and could feed the haze and palette so scene styling is
   driven by actual genre rather than by centroid.

8. **Stems as layers in one space.** With separation already available in the
   backend, drawing vocals, drums, bass and other as distinct colour layers in
   the same geometry would show the arrangement, not just the mix.

## Honest summary

Against the visualisers we win on rigour and lose on polish-per-click. Against
the analysis tools we win on legibility and lose on measurement depth. Against
the research tools we win on being a finished product and lose on model
sophistication. The defensible position is the one we already occupy — the only
tool that is analytically honest, spatially legible, cinematic, and completely
local — and items 1 through 4 above widen it without leaving that ground.

## Sources

- [Best Free Music Visualizers in 2026 (Compared) — Visuval](https://visuval.io/blog/best-free-music-visualizers-2026)
- [10+ BEST Music Visualizers In 2026 — Software Testing Help](https://www.softwaretestinghelp.com/best-music-visualizer-software/)
- [Sonic Visualiser — Wikipedia](https://en.wikipedia.org/wiki/Sonic_Visualiser)
- [Vamp Plugins](https://www.vamp-plugins.org/download.html)
- [Audacity vs Sonic Visualiser — SaaSHub](https://www.saashub.com/compare-audacity-vs-sonic-visualiser)
- [latent-musicvis: music visualization via UMAP of Stable Audio latents](https://github.com/lyramakesmusic/latent-musicvis)
- [Visual Display and Retrieval of Music Information (arXiv)](https://arxiv.org/pdf/1807.10204)
- [Barwise Music Structure Analysis with Correlation Block-Matching (arXiv)](https://arxiv.org/pdf/2311.18604)
