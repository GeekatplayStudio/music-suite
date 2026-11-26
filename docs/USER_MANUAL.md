# Music Suite user manual

Music Suite is a music workstation that runs on your own computer. It analyses and masters finished songs, splits them into their instruments, turns audio into notes, edits and mixes multitrack sessions, generates songs with AI, designs synth sounds, and plays your music through a hardware keyboard such as a Roland GO:KEYS 3.

Everything runs locally. The only things that reach the internet are the online AI services you choose to switch on (with your own key), downloads of optional models, update checks, and community browser plugins if you allow them.

> **Tip:** every workspace has small **?** buttons next to its settings. They open this manual at the section that explains them, in a new tab, so nothing you are working on is lost.

## Getting started

### The workspaces

| Workspace | Address | What it is for |
|---|---|---|
| [Analyser and mastering](#analyser-and-mastering) | `/` | Measure a finished song, find its problems, master it, convert it to other formats. |
| [Studio Editor](#studio-editor) | `/editor` | Multitrack sessions: import, split into stems, repair, edit, record, write notes, mix and export. |
| [AI Song Studio](#ai-song-studio) | `/generate` | Generate songs from a description, or from a song you already have; albums. |
| [Synth Studio](#synth-studio) | `/synth` | Design synth sounds and play plugin instruments such as Surge XT. |
| [Song Geometry Mapper](#song-geometry-mapper) | `/mapper` | A 3D picture of a song's sound, for exploring and for video. |
| [Models and engines](#models-and-engines) | `/models` | Install optional AI models and instruments. |
| Help | `/help` | This manual. |

Songs move between workspaces with the buttons at the top of each page: for example **Studio Editor** on the analyser adds the selected song to a session, and **Send mix to the analyser and mastering** in the editor's Export menu sends a mix back.

### Language, colours and extra windows

The **language and colours** button (a globe with the current language, beside the header buttons in every workspace) sets:

- **Language:** English or Русский. The whole interface is translated, including messages from the engines and this manual (the Help page shows the Russian edition, [USER_MANUAL.ru.md](USER_MANUAL.ru.md), when the interface is Russian). Some things stay as they are on purpose:
  - names of models, plug-ins and presets;
  - units musicians use in English (BPM, LUFS, dB);
  - text that is sent to the music models, such as style prompts and the plan's section names, because the models read English;
  - track names the editor creates and later recognises, such as "Sing-along".
- **Colour theme:** Midnight cyan (the original), Amber studio, Violet night, Forest, Magenta or **Light (daytime)**. Status colours keep their meaning in every theme: red for errors, amber for warnings, green for success. In the light theme, the waveforms, piano roll, charts and visuals keep their dark drawing area.

Both are saved in this browser.

**Panels in their own windows (for a second monitor).** The **pop-out** button (a box with an arrow) opens a panel in a separate window that you can drag to another monitor.

- **Studio Editor:**
  - the **inspector** (button in the header);
  - the **piano roll, sheet music and spectral view** (button beside each panel's close button);
  - the **on-screen piano** (beside *Hide*).
- **Analyser:**
  - **Visual AI** (button beside its full-screen button);
  - the **charts** (button on the tip line above them). The Chart Studio's group buttons and quick-jump links stay on the page and work on the charts in the other window.

The panel keeps working exactly as before, and keys you press in its window (Space, undo, shortcuts) still reach the page. Close the window, or press **Bring it back**, to return it.

Each window remembers where it was and how big it was, and opens there next time. With more than one monitor, the browser asks once whether Music Suite may place windows; allow it, and a panel opens on the other screen the first time and returns to the screen you left it on after that.

The first time, a message explains that each extra window uses more memory, processor and graphics power. Works in Chrome and Edge; allow pop-ups for Music Suite if the browser blocks the window.

### Installing (Windows)

1. Double-click **install.bat** in the Music Suite folder.
2. It asks **Complete install? [y/N]**:
   - **Enter (Standard):** the app with everything it needs to run. About 10 GB free space is plenty.
   - **y (Complete):** also the local AI music engine and its models, the lyrics writer (Ollama), AI stem separation with all models, and the Surge XT synth. About 30 GB of downloads; have 45 GB free.
3. It works through five steps: tools (Python, FFmpeg, Node.js, Git), the Python environment, the web app (the slowest step), optional parts, and a final check. Each tool comes from its official source and is checked before it is used.
4. When it says **Music Suite is installed!**, double-click **start.bat**.

Anything left out can be added later from [Models and engines](#models-and-engines) and the AI Song Studio's Settings. See `docs/WINDOWS_INSTALL_GUIDE.md` for installer options.

Before downloading anything, the installer checks that:

- it can write to the folder;
- there is enough free disk space;
- this computer can reach the Python and web package servers.

If one of these fails, it says what to do. It also warns when the folder is inside OneDrive or has a very long path: both can make installs fail, and moving the folder to somewhere like `C:\MusicSuite` avoids it. A download that drops out is retried automatically.

**If installing fails,** the installer shows what went wrong. Run **install.bat** again: it keeps everything already done and carries on from there. If it stops in the same place twice, restart Windows and try once more. The full record is in `logs\install.log`.

### Starting and stopping

- **start.bat** starts Music Suite and opens it in your browser (normally http://127.0.0.1:3000). If something it needs is missing, it installs it first. If Music Suite is already running, it just opens the browser.
- **stop.bat** stops it. It only stops the Music Suite it started, never anything else.
- If a port is busy, Music Suite picks the next free one and says which.
- **After an update,** the first start brings the libraries up to date and rebuilds the app when the new version needs it. That takes a minute or two, once; every other start takes a few seconds.
- Use **Chrome or Edge**: hardware MIDI (keyboards) only works in those.

Start options (run `start.ps1` from PowerShell): `-NoBrowser` (don't open the browser), `-ApiPort` and `-WebPort` (preferred ports, 8008 and 3000), `-StartupTimeoutSeconds` (default 300), `-NoInstall` (report what is missing instead of installing), `-StartComfyUI -ComfyUIPath <folder>` (also start ComfyUI for MusicGen).

### Updating

On the analyser page, press **Configuration**:

- **Check for Updates** looks at the official Music Suite repository only.
- **Install Update** fetches it when one is available. It never overwrites changes you made yourself; if there are any, it refuses and says so.
- Restart Music Suite afterwards. New dependencies are installed when it starts.

In-app updates need Music Suite to have been installed with Git (a clone), not from a ZIP.

### Where your work is kept

| What | Where |
|---|---|
| Editor sessions, their audio and stems | `data\editor\<session id>\` |
| Analysed songs, masters, conversions and reports | `data\runs\` and `data\uploads\` |
| AI Song Studio settings, history and albums | `data\generation\` |
| The local AI music engine and its models | `data\engines\acestep.cpp\` |
| Stem separation models | `data\models\audio-separator\` |
| Logs (when something goes wrong) | `logs\` (`api.log`, `web.log`, `install.log`) and `data\generation\engine.log` |
| Online service keys | Windows Credential Manager ("Music Suite") |
| Surge XT | `%LOCALAPPDATA%\Programs\Common\VST3\` |
| Your synth sounds, plugin favourites, MIDI choices, mapper presets | Your browser's storage: not in the Music Suite folder, and not included in project files |

To back up or move a session, use the editor's **Export → Whole project** (see [Saving, project files and undo](#saving-project-files-and-undo)).

## Analyser and mastering

The home page (`/`) analyses a finished song in depth, tells you what is wrong with it, and masters it for delivery. Nothing here changes your original file: every result is a new file.

The page has a left column of controls (Session Control, Format Conversion, AI Mastering, Run History, Playback + Timeline) and a right column of results (status tiles, Overview Deck, File Intelligence, measurements, recommendations, markers and charts). On a narrow screen the left column comes first.

### The workflow in short

1. **Upload:** drag a file onto the drop zone or press **Browse File**. It uploads straight away and becomes the selected *run* (one song and everything made from it).
2. **Analyse:** press **Analyze**. A typical song takes from under a minute to a few minutes.
3. **Review:** read the tiles, recommendations, markers and charts.
4. **Master:** press **Apply Suggested Settings** (or set your own) and **Run Mastering**.
5. **Save:** when it finishes, the **Outputs Ready To Save** dialog asks where to save the files.

> **Tip:** don't press **Upload** after dropping a file: the file is already uploaded, and Upload makes a second copy in Run History.

### Header buttons

| Button | What it does |
|---|---|
| Configuration | Shows the installed version and checks for updates (see [Updating](#updating)). |
| Refresh Runs | Reloads the run list. |
| Geometry Mapper | Opens the selected song in the [Song Geometry Mapper](#song-geometry-mapper). |
| Make a song from this / AI Song Studio | Opens the [AI Song Studio](#ai-song-studio), with the selected song's tempo, key and style filled in. |
| Studio Editor | Adds the selected song to a [Studio Editor](#studio-editor) session, optionally split into stems. |
| Synth Studio, Models & engines | Open those workspaces. |
| Clear History | Deletes every run that is not working right now, including failed ones. Asks first. |
| Hard Reset | Cancels all queued work, restarts the background workers and deletes every run, including active ones. Use it only when something is stuck. Asks first. |

### Session Control

- **Drop zone / Browse File:** accepts WAV, FLAC, MP3, AAC, OGG, M4A and AIFF, up to 500 MB and 15 minutes by default (both can be changed, see [Settings reference](#settings-reference)).
- **Analyze:** measures the song. Running it again on a finished song re-analyses it.
- **Visual AI:** opens the Sonic Visual AI panel above the page: live **Spectrum**, **Orbit** and **Waveform** visuals with Bass, Mid and High meters and a fullscreen button. It has its own player. It stays open until you reload the page.
- **Use optional GPU spectrogram path** (off): computes the linear spectrogram with the GPU. It needs the GPU libraries; without them analysis continues on the CPU and says so.
- **Status box:** the run's state (uploaded, queued, running, completed, failed), a progress bar, and a line saying what it is doing now (see [Analysis stages](#analysis-stages)). An amber warning appears if nothing has changed for five minutes; a long spectrogram step can take that long, and a truly stuck analysis is stopped automatically after ten.
- **Exports: JSON, HTML, PDF:** the measurements as data, and a full report as a web page or PDF. They exist once analysis has finished. The PDF needs WeasyPrint; without it, only the HTML report is made.

### Format Conversion

Makes copies of the selected song in other formats.

| Setting | Range | Default |
|---|---|---|
| Formats | MP3, WAV, FLAC, AAC, OGG, M4A | MP3, WAV, FLAC |
| MP3 kbps | 96–320 | 320 |
| AAC kbps (also used for M4A) | 96–320 | 256 |

**Convert Selected** starts it. WAV copies are 16-bit; FLAC is lossless; OGG is Vorbis at quality 5. Conversion needs ffmpeg (installed with Music Suite). After analysis, the copies are made from the analysed 48 kHz version and are named `canonical.mp3`, `canonical.wav` and so on. Converting again replaces the previous copies.

### AI Mastering

Masters the song for its destination: sets loudness, controls peaks, balances the tone and fixes problems the analysis found.

#### Suggested From Analysis

After analysis, this box suggests a mode, preset, loudness and peak ceiling, with the reasons. **Apply Suggested Settings** copies them into the form below (it leaves Input Gain, Bass Mono, Stereo Width and Reference song alone).

How it decides:

- **V1** for dense, lossy, clipped or peak-sensitive sources; **V2** for cleaner songs with several problems; **V3** for stronger correction on material that can take it.
- **film** for very dynamic or quiet material, **voice** for speech-heavy material, **club** for bass-heavy material with room to push, otherwise **streaming**.

#### Mastering settings

| Setting | Choices / range | Default | What it does |
|---|---|---|---|
| Mode | V1, V2, V3 | V1 | **V1:** one careful mastering pass, then refinement. The safest. **V2:** tries several variations of the settings, scores each and keeps the best. **V3:** splits the sound into four frequency bands (bass, mids, transients, the rest), treats each, and recombines them. These are frequency splits, not AI stems. |
| Preset | streaming, club, film, voice | streaming | The starting point for the chain: compression, de-essing, punch and how far the bass is made mono. See the table below. |
| Normalization Profile | Off, YouTube, Spotify, Apple Music, Instagram, TikTok, Broadcast EBU, Podcast Voice | Off | Fills Target LUFS and True Peak with that platform's values. |
| Backend | internal, auto, ffmpeg, pedalboard, matchering | internal | An optional extra processing stage. See [Backends](#backends). |
| Reference song | None, or any other song in Run History | None | With matchering: makes the master sound like that song. |
| Target LUFS | −30 to −6 | −14 | How loud the master is overall. |
| True Peak dBFS | −6 to 0 | −1 | The highest peak allowed, including peaks between samples. |
| Input Gain (dB) | −12 to +12 | 0 | Turns the source up or down before mastering, which changes how hard the chain works. **Reset** returns it to 0. |
| Bass Mono | Preset default, Off, 80, 100, 120, 150 Hz | Preset default | Makes everything below that frequency mono, which tightens the low end and keeps it safe on mono speakers. Preset default lets mastering raise it if it finds phase problems; any other choice locks it. |
| Stereo Width | 0.5–1.5, or blank | blank (1.0) | Narrows (below 1) or widens (above 1) the stereo image. Blank lets mastering narrow it if it finds phase problems. |
| V2 Variants | 2–8 | 4 | How many variations V2 tries. More is a wider search but slower. Only used in V2. |
| Refine Passes | 1–5 | 2 | How many repair passes may follow the main one. A pass is kept only if it makes things better without making anything else worse. |

> **Important:** the Target LUFS and True Peak boxes always win over the preset. Choosing **club** with the boxes still at −14 and −1 masters to −14 LUFS, not club's −9. To use a preset's own loudness, clear both boxes, or use Apply Suggested Settings or a Normalization Profile.

What each preset aims for (when the boxes are cleared):

| Preset | Loudness | Peak ceiling | Character |
|---|---|---|---|
| streaming | −14 LUFS | −1 dBTP | Balanced, gentle compression, bass mono below 110 Hz. |
| club | −9 LUFS | −0.5 dBTP | Louder and denser, firmer compression, bass mono below 120 Hz. |
| film | −18 LUFS | −2 dBTP | Most dynamic, light compression, bass mono below 80 Hz. |
| voice | −16 LUFS | −1.5 dBTP | Clear speech, strongest de-essing, bass mono below 120 Hz. |

Platform profiles: YouTube, Spotify, Instagram and TikTok −14 LUFS / −1 dBTP; Apple Music −16 / −1; Broadcast EBU −23 / −1; Podcast Voice −16 / −1.5.

#### Backends

| Backend | What it adds | Needs |
|---|---|---|
| internal | Nothing extra: the built-in chain only. The safest, the fastest and the default. | Nothing |
| ffmpeg | A second pass of filtering, compression, loudness normalisation and limiting. | ffmpeg (installed) |
| pedalboard | A second pass of filtering, compression and limiting. | The Pedalboard library |
| matchering | Matches the tone and loudness of a reference song. | The Matchering library **and** a Reference song |
| auto | Picks matchering (when available with a reference), else pedalboard, else internal. Never ffmpeg. | |

If a backend is not installed, mastering quietly uses **internal** instead. Check "Backend selected" in the progress box to see what was used, and "Pro modules" to see which are installed.

On a slower computer the extra backends can take several minutes per song, where **internal** takes well under one. The **Active Run** tile shows the song's full run ID with a copy button, if you need it elsewhere.

Only one mastering pass runs per song at a time. Pressing **Run Mastering** again while one is under way says so and changes nothing; wait for it to finish, then run it with the new settings.

#### Running and reading the results

**Run Mastering** starts it; mastering again replaces that song's previous masters. The progress box shows the stage, the best output, the backend used, and a fingerprint (SHA-256) of the result.

- **Refinement:** how many repair passes were accepted, the final issue score and how many passes were rolled back. "Non-regression safeguard" means the refined result was worse than the source, so mastering started again from the source more gently.
- **Source-Aware Adaptation:** what mastering changed before it began, and why. For example, it lowers the peak ceiling for a source that already clips, raises de-essing for a harsh one, or narrows the width when it finds phase problems. Settings you locked (Bass Mono, Stereo Width) are not touched.
- **Post-Master Self-Check:** measures the master and compares it with the source.
  - *Assessment:* strong improvement, partial improvement, unchanged, or regression.
  - *Issue score before → after:* lower is better. Each kind of problem adds points (clipping, peak risk, too loud, mono problems, flattened loudness range 3; harshness, sub-bass, dips, too quiet, too dense 2). *Flattened loudness range* means the master kept less than half of the song's loudness range: quiet and loud sections ended up at nearly one level.
  - *Compliance: pass* means loudness is within 0.75 LU of the target, peaks are no more than 0.1 dB over the ceiling, there is no clipping, and the music still has punch (enough crest). If the first result fails, up to two stricter attempts are made automatically ("Post-check rescue").
  - *Resolved / Remaining / Worsened:* which problems changed, and *Recommended fixes* for what remains.
- **Mastered Outputs:** every file made, with its loudness, peak and (V2) score, where lower is better. All are 32-bit float WAV at 48 kHz.

| Mode | Files |
|---|---|
| V1 | `master_v1.wav` |
| V2 | `master_v2_variant_1…N.wav` and `master_v2_best.wav` |
| V3 | `master_v3.wav` plus the four band files `stem_bass`, `stem_vocals`, `stem_drums`, `stem_other` |

### Outputs Ready To Save

When a conversion or mastering job started from this page finishes, a dialog lists the new files (for mastering, the best master only; the others are in the Mastered Outputs table).

- **Save As...** lets you choose where to save. Browsers without a save picker download instead.
- **Quick Download** downloads to your usual folder.
- **Dismiss** removes the row.
- **Later** closes the dialog; **Save Ready Files (N)** in Session Control reopens it.

The list is lost if you reload the page; the files themselves stay in the tables.

### Run History

Every uploaded song, newest first (up to 50). Click a row to select it. Switching songs stops playback and resets the EQ, speed and loop; mastering settings are kept.

### Playback and the timeline

The player plays the **original upload** (there is no built-in A/B with the masters; download them, or open both in the Studio Editor).

- **Playhead:** drag to move through the song.
- **Selected Segment:** **Left Marker** and **Right Marker** choose a window (at least 0.25 s). The time-based charts zoom to it. **Full Track** selects everything.
- **Markers:** one chip per problem found; click one to jump there and zoom to it.
- **Overview Deck:**
  - **Waveform Review Strip:** click to scrub. Coloured bars along the bottom are markers: red high, amber medium, blue low.
  - **Transport:** **Play/Pause**, **−5s / +5s**, **Selection Start**, **Loop Selection**, **Speed** (0.75–1.5×), **Set Start / Set End** at the playhead, and **Reset Range** (full song, loop off).
  - **Keyboard:** Space plays and pauses; the left and right arrows jump 5 s.

### Delivery Readiness

| Tile | Reads |
|---|---|
| Loudness | **Aligned** within 1.5 LU of the selected Normalization Profile's target (−14 LUFS when Off), otherwise **Hot** or **Quiet**. |
| True Peak | **Safe** at −1 dBFS or below, **Tight** up to −0.2, otherwise **Risk**. |
| Marker Load | **Clean** with no serious markers, **Review** with up to 3, **Attention** with more. |
| Dynamics | **Open** with a crest of 8 dB or more, **Controlled** from 5 dB, otherwise **Dense**. |

Before analysis every value is zero, so these tiles read Hot, Risk and Dense until the song has been analysed.

### Manual EQ

A 20-band EQ (20 Hz to 16 kHz, ±12 dB each) for listening through the page's player. Tick **Enable EQ** first; the sliders do nothing while it is off. **Reset EQ** flattens it. **Export EQ WAV** renders the whole song through the EQ in your browser and saves a 16-bit WAV named `<song>_eq.wav`. With the EQ off, the export is an unprocessed copy. The EQ does not affect mastering.

### File Intelligence

| Tile | What it tells you |
|---|---|
| Format / Codec | The file type, and whether it is lossy (MP3, AAC…) or lossless. |
| Frequency Range | The range the file can hold, and the range that actually has sound in it. |
| Dynamic Range Snapshot | Crest factor (punch) and loudness range (LRA, how much the loudness moves). |
| Signal Properties | Sample rate, channels, bitrate and bit depth. |
| Compression Loss Estimate | How far below 20 kHz the sound stops. A "lossless" file whose sound stops at 16 kHz was probably made from an MP3. |
| Range Detail | Peak to noise floor, and peak to loudness. |

**Compression Assessment** sums this up in a sentence. **Why Some Values Are N/A** explains any blank tile; most often the song has no quiet gaps to measure noise from, or it was analysed by an older version (press Analyze again). **Metadata Tags** lists the file's tags; **Show Raw Metadata JSON** shows all of them. **Guide: What Everything Means** is a quick reference on the page itself.

### Measurements, recommendations and markers

| Measurement | What it means | Good values |
|---|---|---|
| Integrated LUFS | Overall loudness. | −14 for streaming, −9 to −8 for club, −23 for broadcast |
| True Peak dBFS | The highest peak, including between samples. | −1 or below |
| Crest Factor dB | The gap between peaks and average level: punch. | 8 dB or more for open-sounding music |
| Noise Floor dBFS | The background noise in quiet gaps. | as low as possible; blank if there are no gaps |

**Remastering Recommendations** list each problem with a priority (high, medium, low) and what to do about it, for example clipping, peaks above −1 dBTP, too loud or too quiet, over-compressed, mono problems, sibilance, harshness, too much sub-bass, a missing top end, or DC offset.

**Markers** are the moments where problems happen:

| Marker | Found when | Severity |
|---|---|---|
| clipping | Three or more samples in a row at full scale | high if it lasts 5 ms or more |
| true_peak_risk | Peaks at −1 dBFS or above | high |
| mono_incompatibility | Left and right cancel (correlation below −0.1) | high |
| loudness_dip | The level drops 8 LU or more below the song's average | medium |
| sibilance | Strong "s" sounds (6–10 kHz) | medium |
| harshness_band | Too much 3–9 kHz | medium |
| sub_bass_heavy | Too much 20–80 Hz | medium |
| dc_offset | The waveform is shifted off centre | medium |

The **Markers Near Playhead / Selection** table lists them, nearest the playhead first; click a row to jump there.

### Charts

**Chart Studio** filters the charts: **All Views**, **Mix Review**, **Stereo Focus** or **Spectral**. **Quick Jump** scrolls to a chart. Every chart can be zoomed with the mouse wheel, reset with a double-click, and saved as an image with the camera icon. Right-click and drag on a time chart to move the selected window. The time charts follow the Selected Segment.

| Chart | How to read it |
|---|---|
| Waveform + Envelope | The shape of the sound, with peak and average level over time. Flat tops mean heavy limiting or clipping. |
| Loudness Timeline | Loudness moment to moment (0.4 s) and phrase to phrase (3 s) against the song's overall loudness. |
| Average Spectrum | How much energy there is at each frequency: tilt, too much bass, harshness, missing air. |
| Stereo Correlation + M/S | Below zero means the left and right cancel when played in mono. |
| Correlation Meter | The same over time: green is safe, red risks disappearing in mono. |
| Mid/Side View | How much is in the centre against the sides, and left-right balance. |
| Vectorscope / Goniometer | A vertical line is mono; a wide cloud is wide stereo; a horizontal shape is out of phase. |
| STFT Spectrogram (Linear / Log) | Time against frequency, brightness is level. Log is easier to read musically. |
| Mel Spectrogram | Frequency spaced the way hearing groups it. |
| CQT Spectrogram | Frequency spaced in musical notes: shows pitches and harmonics. |

Mono files have no stereo charts.

### Analysis stages

The status line walks through: uploaded, queued, initialize, reading metadata, decoding, scanning, measuring loudness and dynamics, detecting markers, making spectrograms, building charts, making the report (HTML, then PDF), and completed. If nothing changes for 10 minutes, the analysis is stopped with a "Loop guard triggered" message; press **Hard Reset** if a run still looks stuck after that.

## Studio Editor

The Studio Editor is a multitrack audio and MIDI editor. Each piece of work is a *session* (also called a project) that saves itself as you go.

### Sessions

Opening `/editor` shows your sessions:

- **New session:** type a name (or leave it blank for "Untitled session") and press **New session** or Enter.
- **Open a project file…:** opens a `.musicsuite.zip` saved with Export → Whole project, as a new session. Your existing sessions are not touched.
- **Sessions list:** click a session to open it. The trash icon asks **Delete** or **Keep**. **Deleting a session is permanent**: it cannot be undone.

When a song is sent here from another workspace, the page asks **Where should "name" go?**:

- **Split it into stems when it opens**, and **how far**: as many as this computer can, 2, 4 or 6 stems, or Everything (12 stems with drum pieces and lead/backing vocals, which needs AI stem separation).
- **New session "name"**, or **Add here** on an existing session. The song is added on a new track at 0:00; nothing already there is replaced.

### The editor screen

From left to right along the top:

| Control | What it does | Shortcut |
|---|---|---|
| ← | Back to the sessions list. | |
| Project name | Rename the session. Under it: Saved, Saving…, or "Save failed — retrying on next edit". | |
| ✦ | Generate a song with AI into this session (opens the AI Song Studio). | |
| Return to start / Play / Loop | Transport. Loop uses the highlighted range if there is one. | Home / Space / L |
| Record (microphone) | Records audio, or notes when a MIDI keyboard is connected (see [Recording](#recording)). Its tooltip says which. | |
| MIDI keyboard icon | Connects a MIDI keyboard for playing and recording notes. | |
| **Wizard** | The [Keyboard wizard](#keyboard-wizard). | |
| **Keyboard** | Your hardware keyboard: play music on it, choose its voice, record through it (see [Your hardware keyboard](#your-hardware-keyboard)). | |
| Piano icon | Shows an on-screen piano for the selected instrument track. | |
| Clock | The playhead position. Click to switch the ruler between time (m:ss) and bars (bar.beat). | |
| Level and loudness | The master level meter, and the tempo, time signature and key. While playing: integrated, short-term and momentary loudness (LUFS) and the highest true peak. It turns pink if the peak goes over the limit. | |
| Select / Razor / Range tools | How the mouse edits the timeline (see below). | V / C / R |
| Magnet | Snapping on or off (on to start with). | N |
| Automation | Shows volume, then pan, then no automation on the tracks. The dropdown next to it picks any lane: volume, pan, reverb mix, delay mix, delay feedback, compressor threshold, EQ gains. | A |
| Spectral view | Shows the selected clip's frequencies over time. | W |
| Bookmark | Adds a marker at the playhead. | K |
| Undo / Redo | Up to 200 steps. | Ctrl+Z / Ctrl+Shift+Z |
| Zoom out / in / fit | | − / + / F |
| **Import** / **Export** | Bring files in; save your work out (see below). | |
| Keyboard | The list of keyboard shortcuts. | ? |

Some of these are hidden on narrow windows; widen the window to see them all.

Under the timeline, the status line shows what is being worked on, a notice (with **Dismiss**), or a hint for the current tool, and on the right the number of tracks, clips and the session's length.

The right-hand panel is the [inspector](#editor-tools-the-inspector).

### The timeline

**Tools:**

- **Select (V):** drag a clip to move it (also to another track), drag its edges to trim, drag the small square handles near its top corners to fade. Shift- or Ctrl-click to select several. Right-click for a menu.
- **Razor (C):** click a clip to cut it there.
- **Range (R):** drag across time to highlight it on all tracks. Then press Delete to remove it, Shift+Delete to remove it and close the gap, or L to loop it.

**Snapping** (N, on to start with) pulls edits to the grid, the playhead, markers, section edges and other clips' edges. A yellow line shows when it snaps to something other than the grid. Hold **Alt** while dragging to place freely.

**The ruler:** click to move the playhead, drag to scrub, **Shift+drag** to draw a loop. The band at the top shows sections and markers: click a section to highlight it, click a marker to jump to it, drag a marker to move it, Alt+click a marker to delete it.

**Editing:**

| Action | How |
|---|---|
| Split at the playhead | S (or Ctrl+E). With nothing selected it splits every clip under the playhead. |
| Delete | Delete. With no clip selected, it deletes the highlighted range. |
| Ripple delete | Shift+Delete: deletes and moves everything after it left to close the gap. |
| Duplicate | Ctrl+D: a copy straight after the clip. |
| Copy / cut / paste | Ctrl+C / X / V. Paste goes to the playhead. |
| Select all | Ctrl+A |
| Nudge | ← / → move the selected clips one grid step (or the playhead, when nothing is selected). |
| Highlight a clip's time | Double-click it. |
| Pin a warp marker | Alt+click a selected audio clip, then drag the dashed line to where that moment should land; apply it in the inspector's Warp section. |

**Right-click menu:** on a clip: Split here, Duplicate, Reverse / Play forwards, Mute / Unmute clip, Copy, Delete, Ripple delete. On empty space: Paste here, Move playhead here, Add track, and with a range highlighted: Loop, Delete range, Ripple delete range.

**Overlapping clips** blend with a crossfade (switch this off in the inspector's Project settings).

**Automation:** with a lane shown, click the yellow line to add a point, drag a point to move it, double-click a point to remove it.

**Markers and sections:** K adds a marker; [ and ] jump to the previous and next one. Shift+R turns the highlighted range into a section. Name, repeat and cut sections in the inspector.

### Tracks

**+** above the track headers (or Shift+T) adds a track. Each track header has:

| Control | Range | What it does |
|---|---|---|
| Name | up to 60 characters | |
| M | | Mute (M). |
| S | | Solo (Shift+S): only soloed tracks are heard. |
| Vol | −60 to +6 dB, default 0 | Track level. |
| Pan | left to right, default centre | Stereo position. |
| ˄ ˅ | | Move the track up or down. |
| × | | Delete the track and its clips. **No confirmation**, but Undo brings it back. |

Click a header to select the track. Its EQ, width, output, sends, colour, effects and instrument are in the [inspector](#track-effects-and-buses).

### Recording

**Audio** (the microphone button):

- **Normal take:** records from the playhead onto the selected track. If that stretch of the track already has a clip, or no track is selected, the take goes on a new track called "Recording": recordings never go over existing audio.
- **Punch-in:** highlight a range first. Recording starts 2 s early (so you can come in on time), keeps only what is inside the range and stops just after it.
- **Loop takes:** with the loop on, every pass becomes its own take on its own track; the last one is heard. Choose the best take, or the best bit of each, in the inspector's **Takes** section.
- Press record again, or Space, to stop.
- Recordings are 24-bit WAV at 48 kHz, with the browser's call processing (echo cancelling, noise suppression, automatic gain) switched off so the sound is untouched. The toolbar button records your default input; to record from a particular input (such as the keyboard's USB audio), use the **Keyboard** panel.

**Notes from a MIDI keyboard:** when a MIDI keyboard is connected (or the on-screen piano is open) and the selected track is an instrument track with a notes clip, the record button records notes instead of audio. The sustain pedal and pitch-bend wheel work. With the loop on, each pass adds to the same take. The new clip is called "Played HH:MM:SS"; with snapping on it is widened to whole bars.

**The MIDI keyboard panel** (the keyboard icon): **Connect**, then **Listen to** every connected keyboard or just one. It shows which track the keyboard plays and whether record will capture notes. **Add an instrument track** makes a new instrument track with an empty four-bar clip, ready to play into.

**The on-screen piano:** plays the selected instrument track with the mouse or touch, just like a MIDI keyboard.

### Piano roll, sheet music and spectral view

Only one of these shows at a time, under the timeline.

**Piano roll** (opens when you select a notes clip; P shows or hides it):

- Click empty space to add a note; keep dragging to set its length. Drag a note to move it; drag its right edge to resize it. Shift+drag to select several. **Right-click a note to delete it.**
- **Velocity** (how hard the selected notes are played, 6–127), **Copy**, **Paste** (at the playhead), **Delete**.
- **Note input:** type notes with the keys A W S E D F T G Y H U J K (C4 to C5) or a MIDI keyboard; each note goes at the playhead and moves it on.
- − / + zoom (or Ctrl+wheel). Drum clips show a drum grid with named rows.

> **Careful:** pressing the Delete key while the piano roll is open deletes the whole clip from the timeline, not the selected notes. Use the piano roll's **Delete** button or right-click instead. Undo brings the clip back.

**Sheet music** (inspector → Show as sheet music): the notes as a two-stave score, rounded to sixteenths or triplets. Click a bar to move the playhead there. Choose **A4** or **US Letter**, then **Print** or save as **PDF**.

**Spectral view** (W): the selected clip's frequencies over time, 50 Hz to 20 kHz. Drag a box around an unwanted sound (a cough, a squeak, a phone), then:

- **Attenuate** turns that box down by the chosen amount (−6 to −96 dB, default −24).
- **Heal** replaces it with a blend of the sound just before and after.

### Importing

**Import** accepts WAV, FLAC, MP3, AAC, OGG, M4A, AIFF and MIDI (.mid) files, several at once. Each file goes on a new track at 0:00. To choose the position or the track, drag files onto the timeline instead.

MIDI files are read in your browser. Each part becomes an instrument track set to the instrument the file asks for, and channel 10 becomes a drum track. The session's tempo is not changed by importing a MIDI file.

### Exporting

All audio is rendered at 48 kHz stereo through the full mix, including effects and their tails.

| Export menu item | What you get |
|---|---|
| Whole project · one file to reopen later | `<name>.musicsuite.zip`: the session and every recording in it. Open it on the sessions page with **Open a project file…** |
| Song from chosen tracks · WAV, FLAC or MP3… | Tick the tracks you want and pick WAV 24-bit, WAV 32-bit float, FLAC or MP3 320 kbps. Tracks that are muted now start unticked. Your mutes and solos are not changed. |
| Mixdown · WAV 24-bit / WAV 32-bit float / FLAC / MP3 320 kbps | The whole mix as you hear it (muted tracks left out). |
| Highlighted range · WAV 24-bit | Only the Range selection. |
| Each track · WAV 24-bit | One file per track. |
| Selected track · WAV 24-bit / MIDI file | Just the track you clicked (the menu shows its name). |
| Every instrument · MIDI file | One MIDI file with every notes track, the tempo and the time signature. |
| Send mix to the analyser and mastering → | Analyses the mix on the [analyser page](#analyser-and-mastering), ready to master. |
| Start an AI song from the mix → | Opens the AI Song Studio starting from the mix. |

### Saving, project files and undo

- **Sessions save themselves** within a second of every change. Nothing needs saving by hand.
- **Undo** (Ctrl+Z) and **Redo** (Ctrl+Shift+Z) cover up to 200 steps, including tempo, buses, markers and loop. Dragging a slider or typing a name counts as one step. Undo history is lost when you reload the page; renaming the session cannot be undone.
- Zoom, scroll position, the current tool and the selection are not saved.
- **Project files** (Export → Whole project) hold the session and all of its audio. Use them for backups and for moving a session to another computer. Synth sounds and plugin favourites kept in your browser are not included.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| Space | Play / pause |
| Home / End | Jump to start / end |
| V · C · R | Select · Razor · Range tool |
| S or Ctrl+E | Split at the playhead |
| Delete (or Backspace) | Delete clips, or the highlighted range |
| Shift+Delete | Ripple delete (close the gap) |
| Ctrl+D | Duplicate |
| Ctrl+C · X · V | Copy · cut · paste at the playhead |
| Ctrl+A | Select every clip |
| Ctrl+Z · Ctrl+Shift+Z (or Ctrl+Y) | Undo · redo |
| ← / → | Nudge clips, or step the playhead |
| M · Shift+S | Mute · solo the selected track |
| L | Loop (uses the range if one is highlighted) |
| N | Snapping on/off (hold Alt while dragging to bypass) |
| + / − / F | Zoom in · out · to fit |
| Ctrl+wheel / Shift+wheel | Zoom at the pointer / scroll sideways |
| Shift+drag on the ruler | Draw a loop region |
| Shift+T | Add a track |
| W · P · A | Spectral view · piano roll · automation lane |
| K · [ · ] | Add a marker · previous · next marker |
| Shift+R | Turn the highlighted range into a section |
| Esc | Close menus and clear the selection |
| ? | Show the shortcut list |

Shortcuts are ignored while you are typing in a box.

## Editor tools: the inspector

The inspector is the panel on the right of the Studio Editor. What it shows depends on what is selected:

| Selected | The inspector shows |
|---|---|
| An audio clip | Clip, Separate stems, Repair, Takes (loop takes only), Warp, Restore, Pitch and time, AI match, Plugins, Compose, AI edit, Generate a part, Favourites, then the clip's track and its effects |
| A MIDI (notes) clip | Clip, MIDI clip, Instrument, Plugin instrument, then the track and its effects |
| Nothing | Project settings, Write an arrangement, Create a song, Phase scope, Buses, Sections, Markers and Media |

### How processing works

- **Results replace the clip's sound.** A tool such as Reduce noise renders a new file and the selected clip switches to play it. The clip's name gets a note of what was done, for example "Vocal (denoised, declicked)". The original file is kept under **Media**, and **Undo** (Ctrl+Z) brings it back.
- **Some tools add tracks instead:** Separate stems, Convert to MIDI, Whole song to MIDI, Generate a part, rendering a plugin instrument, and the AI edits Extract, Add a part and Build. These leave the original where it is.
- **The Processing list** at the top of the inspector shows every running job with a progress bar and what stage it is at. Finished jobs disappear after a few seconds; failed ones stay with the reason in red until you dismiss them with ×.
- **Several clips at once:** select more than one clip and most audio tools run on all of them. The clip heading says "Clip (N selected)". Warp, AI match, Generate a part, AI edit, Whole song to MIDI and spectral repair work on the first selected clip only. Notes clips are skipped by audio tools.
- **Sliders:** double-click any slider to put it back to its default. Hover to see its value.
- If Music Suite is restarted while a job runs, the job fails with "The job was interrupted before it finished. Please run it again."

### Clip

| Control | Range / choices | Default | What it does |
|---|---|---|---|
| Clip name | up to 80 characters | file name | The name on the timeline. |
| Gain | −24 to +24 dB | 0 | Turns this clip up or down before the track fader. |
| Fade in / Fade out | 0 to 10 s | 0 | Fades the start or end of the clip. |
| Fade shape | Linear, Equal power, S-curve | Linear | Equal power keeps the level even through a crossfade; S-curve eases in and out. |
| Reverse | on / off | off | Plays the clip backwards. |
| Mute clip | on / off | off | Silences this clip only. |
| Split (S) | | | Cuts the clip in two at the playhead. |
| Duplicate (Ctrl+D) | | | Places a copy straight after it. |
| Delete clip (Del) | | | Removes it from the timeline (Undo brings it back). |

### MIDI clip

Shown for a clip of notes. It plays the track's instrument.

- **Open the piano roll (P):** edit the notes.
- **Show as sheet music:** the notes as a score.
- **Transpose −12, −1, +1, +12:** moves every note by that many semitones.
- **Quantise notes to 1/16:** snaps every note's start to the nearest sixteenth note at the project tempo.
- **Export as a .mid file:** saves just this clip's notes.

### Separate stems

Splits a recording into its instruments. Each one lands on its own track under the original, lined up with it; the original clip is muted, not removed.

| Control | Choices | What it does |
|---|---|---|
| Number of stems | 2: vocals + instrumental · 4: vocals, drums, bass, other · 6: adds guitar and piano | More stems means finer parts. 6 stems needs AI stem separation. |
| Split the drums into kick, snare, toms, hi-hat, ride and crash | on / off | Turns the drum stem into six tracks. Needs 4 or 6 stems and AI stem separation. |
| Split the vocals into lead and backing | on / off | Turns the vocal stem into two tracks. Needs AI stem separation. |

On a clip that is already a stem, two more buttons may appear: **Split this drum stem into kit pieces** and **Split this vocal stem into lead and backing**.

The engine used is shown at the top of the section. With the **AI stem separation** pack from [Models and engines](#models-and-engines) the app uses AI models (RoFormer, htdemucs and DrumSep); without it, a simple built-in splitter gives approximate 2 or 4 stems only.

For a more detailed split, install **MVSep Mega 53** from **Models & engines**, select a clip, then choose **Extract original stems → MVSep Mega 53 → Extract instrument tracks**. The first run downloads the weights. The model estimates every category, so some tracks can contain silence or bleed. A long song can produce several gigabytes of audio.

For one sound, install **Meta SAM Audio** and authenticate the Music Suite backend account with Hugging Face after receiving access to `facebook/sam-audio-small`. Choose **Meta SAM Audio**, enter a description such as `muted trumpet`, and select **Extract sound and remainder**.

To generate a replacement performance, select an extracted stem and open **AI edit → AI reconstruct this stem** with a generator that supports restyling. Review the suggested description and generation settings, then run the edit. The extracted clip supplies the reference. Listen for changes in notes, phrasing and timing.

> **Tip:** for turning a song into notes, 4 stems is better than 6. The six-stem split guesses which of guitar, piano and "other" each sound belongs to and changes its mind from moment to moment, which scatters one instrument across three tracks.

### Repair

| Control | Range | Default | What it does |
|---|---|---|---|
| Strength + **Reduce noise** | 10–100% | 60% | Removes hiss, hum and background noise. Higher removes more but can sound watery. |
| Loudness + **Normalise loudness** | −30 to −6 LUFS | −14 LUFS | Turns the whole clip up or down to that loudness, keeping peaks below −1 dBTP. A very peaky clip may end up a little quieter than asked. |

> **Tip:** for the cleanest noise reduction, use the Range tool (R) to highlight a passage of pure noise inside the clip first. That passage is used as the "noise print" (at least 0.1 s). Without one, the quietest part of each frequency band is treated as noise.

The same Loudness value is also the target for AI match's Loudness option.

### Takes

Shown on clips made by loop recording.

- **Use this take:** makes this take the one you hear over its whole passage and mutes the others there.
- **Use this take in the highlighted range:** the same, but only inside the Range selection, so you can build one performance from the best bits of several.

### Warp

Moves moments in a recording in time without changing its pitch. Shown for one clip that is not reversed.

1. Put the playhead on a moment (a drum hit, a word) and press **Add marker at the playhead**.
2. Type where it should land, or move the playhead there and press **Here**.
3. Press **Apply warp**. The audio between markers is stretched or squeezed to fit.

Each stretch must stay between a quarter and four times its original length.

- **Quantise beats to N BPM:** finds the played beats and pulls them onto the project's tempo grid. It works when the played tempo is within half to double the project tempo.
- **Stretch to the length of the highlighted range:** makes the clip exactly as long as the Range selection.

### Restore

Fixes for damaged recordings. **Amount** (10–100%, default 50%) sets how hard DeClick and DeReverb work.

| Button | What it fixes |
|---|---|
| DeClick | Clicks, pops and vinyl crackle. Higher Amount catches quieter clicks. |
| DeHum | 50 or 60 Hz mains hum and its harmonics, found automatically. |
| DeClip | Peaks flattened by recording too loud: rebuilds their shape, then lowers the level to leave room. |
| DeReverb | Room echo. Higher Amount is drier but can sound thinner. |

For a single cough or chair creak, open the spectral view (W) at the bottom and draw a box around it instead (see [Studio Editor](#studio-editor)).

### Pitch and time

| Control | Range | Default | What it does |
|---|---|---|---|
| Pitch + **Apply pitch shift** | −12 to +12 semitones | 0 | Changes the key; the length stays the same. |
| Speed + **Apply time stretch** | 50–200% | 100% | Changes the length; the pitch stays the same. |

Quality depends on the engine shown at the top: Rubber Band (installed with the editor extras) is best; the built-in fallback works but is rougher.

### AI match

Fits a clip to the project, or to another clip, in tempo, key and loudness.

- **Detect tempo & key:** analyses the clip and shows "Detected: 120 BPM · A minor · −12 LUFS". Nothing about the audio changes.
- **Set as project:** copies that tempo and key to the project and switches the ruler to bars.
- **Match to:** the project, or any other clip in the session.
- **Tempo / Key / Loudness** (Tempo and Key on by default): what to match. Tempo uses the closest of normal, half or double time and must stay within half to double. Key moves by the smallest step, at most six semitones; a relative key (A minor to C major) needs no change.
- **Match clip:** renders the matched version and lines its first downbeat up with the nearest bar.

### Plugins

Shown when plugin hosting is installed and VST3 effect plugins were found on this computer.

1. Choose a plugin. Its controls appear as sliders (the first 64).
2. **Audition 8 s from the playhead** to hear it without changing anything.
3. **Render through plugin** to apply it. The result is cut to the clip's length, so a reverb tail past the end is lost.

### Compose

| Button | What it does |
|---|---|
| Convert to MIDI notes | Writes down the notes of this clip on a new instrument track. With the **AI note transcription** pack it follows chords; without it, it writes one note at a time, which suits vocals, bass and lead lines. |
| Whole song to MIDI (every instrument) | Splits a full song and writes one notes track per instrument. See [Turning audio into notes](#turning-audio-into-notes). |
| Detect song sections | Finds where the song changes and marks the sections on the ruler (Section A, B…), giving repeated parts the same letter. Needs at least 8 s of sound. |

### AI edit

Changes a clip with AI, on this computer (ACE-Step 1.5) or with an online service you have set up in the [AI Song Studio](#ai-song-studio). Every change can be undone.

| Task | What it does | Needs |
|---|---|---|
| Regenerate a section | Remakes only the highlighted part and keeps the rest exactly. | A Range selection of at least 1 s inside the clip. |
| Extend | Adds 10, 20, 30 or 60 s of new music after the end or before the start. | |
| Restyle | The same song in a new style. **Keep** (5–100%, default 50%) sets how close it stays to the original. | |
| Extract an instrument | Recreates one instrument on its own track. For exact stems use Separate instead. | ACE-Step's editing model (2.4 GB) |
| Add a part | Writes a new instrument part that fits the clip. | ACE-Step's editing model |
| Build a full song around it | A band around, say, a vocal stem. The original is muted. | ACE-Step's editing model |

- **Style:** a short description of the sound you want (at least 3 characters).
- **Lyrics (optional):** for Regenerate, Extend and Restyle. Empty gives an instrumental.
- **Versions (1–4):** the first version replaces or adds the clip; the others go on muted tracks so you can compare.
- Online services ask you to allow uploading the clip and show the cost before running.

### Generate a part

Generates a new instrumental part from a text prompt (for example "warm upright bass, walking line") with MusicGen through ComfyUI on this computer, at the project tempo and key. Length 4–60 s, default 15 s. It needs ComfyUI running with the Sonic Holodeck nodes; the section says so when it is not.

### Favourites

Saves a chain of processing steps so you can run them again with one click.

- **Just run:** repeats one of your last three steps.
- **Last 1 / 2 / 3, Name, Save:** saves your last steps under a name. A saved favourite runs every step in order, each on the previous result.

Favourites are kept in this browser. Separation, warping, matching, transcription and AI tools cannot be saved as steps.

### Project

Shown when nothing is selected.

| Setting | Range | Default | What it does |
|---|---|---|---|
| Tempo | 40–240 BPM | 120 | The project's speed: grid, bars, metronome and generated parts follow it. |
| Beats / bar, Beat is | 2–12, quarter or eighth note | 4/4 | The time signature. |
| Key | any major or minor key | Not set | Used by matching, harmonies and generated parts. |
| Master | −60 to +6 dB | 0 | Overall output level. |
| True-peak limiter on the master | on / off | on | Stops the mix going over the ceiling, even between samples, so exports never distort. |
| Ceiling | −6 to −0.1 dBTP | −1 | The highest level the limiter allows. |
| Crossfade overlapping clips | on / off | on | Overlapping clips blend smoothly instead of cutting. |

**Add an instrument (MIDI) track** adds a four-bar notes clip at the playhead and opens the piano roll.

### Write an arrangement

Writes drums, bass, chords, a melody and more as notes, on this computer. Shown when the arranger is switched on.

| Setting | Choices | Default |
|---|---|---|
| Describe it (optional) | up to 400 characters; used only when Ollama is running | |
| Style | Pop, Rock, Ballad, Folk, Electronic, Lo-fi, Hip-hop, Funk, Jazz, Cinematic, Metal, Waltz | Pop |
| Form | verse-chorus, pop, short, loop, AABA, build, instrumental | verse-chorus |
| Key, Tempo | any, or Auto (from the style) | Auto |
| Length | 4–200 bars | 32 |
| Parts | Drums, Bass, Chords, Melody, Pad, Arpeggio | all on |
| Busyness | 0–1 | 0.5 |
| Seed | a number, or Auto | Auto: a different result each time |

**Write the parts** puts one instrument track per part at the playhead and marks the sections on the ruler. An empty project also takes the arrangement's tempo, key and time signature.

### Track, effects and buses

**Track** (any selected track):

| Control | Range | Default | What it does |
|---|---|---|---|
| Low / Mid / High | −12 to +12 dB | 0 | Three-band EQ. |
| Width | 0 (mono) to 200% | 100% | Narrows or widens the stereo image. |
| Set EQ frequencies and width (Q)… | Low 30–600 Hz, Mid 150 Hz–8 kHz, Mid Q 0.2–8, High 1.5–16 kHz | 160 Hz, 1.2 kHz, 0.8, 6 kHz | Where each EQ band acts. |
| Output | Master or a bus | Master | Where the track goes. |
| Sends | −48 to +6 dB per bus | −12 dB when switched on | Sends a copy to a reverb or delay bus, after the fader. |
| Colour | 8 colours | | The clip colour on the timeline. |

**Effects** run in this order: EQ, gate, voice, distortion, compressor, then delay and reverb alongside the dry sound. They are heard live and included in exports.

| Effect | Settings (default) | Use it to |
|---|---|---|
| Gate | Threshold −45 dB, Attack 2 ms, Hold 60 ms, Release 150 ms | Silence noise between phrases. |
| Distortion | Drive 40%, Mix 100% | Add grit or warmth. |
| Compressor | Threshold −18 dB, Ratio 3:1, Attack 10 ms, Release 200 ms, Make-up 0 dB | Even out loud and quiet moments. |
| Delay | Time 375 ms, Feedback 35%, Mix 25% | Echoes. |
| Reverb | Size 1.8 s, Mix 20% | Room or hall space. |

**Voice** turns a voice into something else:

- **Presets:** Robot singer, Deep vocoder, Monotone robot, Chipmunk (+12), Helium (+5), Monster (−7), Octave harmony, Ring-mod robot, Metallic robot, Synth voice, 8-bit voice, Vox distortion (megaphone), Old radio.
- **Type:**
  - Vocoder (robot singer)
  - Pitch shift (chipmunk or monster)
  - Robot (ring modulator)
  - Synth voice (follows your pitch)
  - Vox distortion
- **Notes** (vocoder and synth voice): follow the singing, snapped to semitones, with Transpose −24 to +24; or hold one note (C1–C6). Holding keys on a MIDI keyboard while the track plays chooses the notes yourself, chords included.
- **Mix:** 0–100% (default 100%).

The vocoder and synth voice work best on a solo voice; on a full mix they follow whichever note is loudest.

**Buses** (nothing selected): **+ Reverb**, **+ Delay** and **+ Group** add a shared effect or group track. Each bus has a level, mute and its own effects. Send tracks to it with their Sends.

**In-browser plugin:** community Web Audio plugins from webaudiomodules.com. It is the one part of the app that loads code from the internet, so it stays off until you press **Allow internet plugins in this browser**.

### Sections, markers and media

Shown when nothing is selected.

- **Sections:** **Add section from highlighted range** (Shift+R). Each section can be selected, **Repeat**ed (a copy is inserted straight after) or **Cut out** (removed and the gap closed).
- **Markers:** press K to add one at the playhead; click one to jump to it.
- **Media:** every file and rendered take in the project, including originals replaced by processing. Click one to add it on a new track at the playhead.
- **Phase scope:** shows whether left and right are in phase. Green is fine; red means parts cancel out when played in mono.

## Instruments and sounds

Every instrument (MIDI) track plays its notes through an instrument. Choose it in the inspector with a notes clip selected.

### Instrument types

- **Type:** *Synth (pitched notes)* or *Drum kit*. The built-in drum kit plays kick (note 36 and below), snare (37, 38, 40), clap (39), closed hi-hat (42, 44), open hi-hat (46), cymbal (49 and 51 up) and toms for the notes in between. Note length is ignored for drums.
- **Sound of:** *This track's own synth sound*, or any of the 128 General MIDI instruments (pianos, organs, guitars, basses, strings, brass, pads and so on). The General MIDI choice is also written into exported MIDI files.
- **SoundFont (.sf2):** load one with **Load a SoundFont** to hear the General MIDI instruments with real samples. Without one, the built-in synth plays its nearest sound. A SoundFont applies to every track, stays in this browser only, and is never uploaded. **Remove** forgets it.

### The built-in synth

Quick controls in the inspector:

| Control | Range | Default | What it does |
|---|---|---|---|
| Sound | 17 factory presets and your own sounds | Init | Analog bass, Acid bass, Sub bass, Wobble bass, Supersaw lead, Mono lead, Pluck, Warm pad, Sweep pad, Strings, Brass, Organ, FM bell, FM electric piano, Noise riser, Chip square. |
| Brightness | 60 Hz – 18 kHz | 3.2 kHz | Brighter or duller (the filter cutoff). |
| Attack | 1 ms – 2 s | 10 ms | How quickly a note fades in. |
| Release | 5 ms – 4 s | 200 ms | How long a note rings after you let go. |

**Edit sound…** opens the full sound editor, which is the same as the [Synth Studio](#synth-studio): three oscillators, filter, noise and FM, two envelopes, two LFOs and up to eight modulation routes. **Save as my sound** keeps a sound for every track and for the Synth Studio; **Export** and **Import** move sounds between computers as `.mssound` files.

### Plugin instruments (VST3)

Plugin instruments such as **Surge XT** (free, installed from [Models and engines](#models-and-engines)) run on this computer, outside the browser.

- **Plugin instrument:** *None* (the built-in synth plays) or one of the instruments found on this computer.
- **Sounds:** for Surge XT, a searchable list of its factory sounds. Star a sound to keep it in **★ Favourites**.
- **Play:** loops the clip through the plugin so you can hear it. **Stop** ends it.
- **Play it from your MIDI keyboard:** starts the plugin so your keyboard plays it live (record captures the notes).
- **Open <name>'s full interface:** opens the plugin's own window on the desktop (it may be behind the browser). **Keep this sound and close the window** saves what you shaped there.
- **Render this clip with <name>:** turns the notes into audio on a new track under the instrument track and mutes the notes clip, so it is not heard twice.
- **Export sound / Import sound:** save or load a plugin sound as a file.

Notes reach a plugin instrument 15–25 ms after you play; Bluetooth headphones add their own delay.

## Turning audio into notes

Music Suite can write down the notes of a recording as MIDI: one clip, or a whole song with one track per instrument.

### Ways to do it

| Where | Use it for |
|---|---|
| Inspector → Compose → **Convert to MIDI notes** | One clip: a vocal, a bass line, a piano, a stem. |
| Inspector → Compose → **Whole song to MIDI (every instrument)** | A full mix: one notes track per instrument. |
| The [Keyboard wizard](#keyboard-wizard), Song step | The same, with the best settings chosen for you. |

### What kind of recording it is

The wizard asks what the recording is. This matters more than any other setting:

| Choice | What happens | Best for |
|---|---|---|
| A full song, or not sure | Split into four stems (vocals, drums, bass, other), each written down with the model that suits it, then cleaned up. If one stem holds 90% or more of the sound, the recording is recognised as a single instrument and written down whole instead. | Mixes, and anything you are not sure about |
| Just a piano | Written down directly by a piano-only model, without splitting. | Solo piano: the most accurate option |
| One other instrument | Written down directly, chords included. | A guitar, synth or organ on its own |
| One voice or melody line | Written down as one note at a time. | A singer, a whistle, a lead line, a bass line |

Splitting a recording of one instrument tears it into pieces: a solo piano split six ways came back with 6% of its notes. Telling the app what the recording is avoids that.

### Which engines write the notes

| Part | Engine | Needs |
|---|---|---|
| Piano | Transkun, a piano-only model | AI note transcription pack |
| Chords and other instruments | basic-pitch | AI note transcription pack |
| Voice, bass, single lines | basic-pitch (one note at a time), or pYIN without the pack | |
| Drums | Hits found on each separated drum piece (kick, snare, toms, hi-hat, ride, crash) | AI stem separation for the drum pieces; without it, only kick, snare and hi-hat |
| Whole mix in one go (optional) | MuScriptor: names up to 35 instruments | Manual install; non-commercial use only |

**Method** (shown when MuScriptor is installed): *Best available* (the stems method, which measured better), *MuScriptor: one model hears the whole mix*, or *Stems: split first, then a model per instrument*.

### How the notes are cleaned up

- **Every note is checked against the audio.** A note that cannot be heard in the recording at that moment is dropped. This removes most "strange unrelated notes".
- Notes outside what a voice or bass can produce are dropped.
- Short, faint notes outside the song's key are dropped, but only when the key is detected with confidence.
- Sound that leaked from one instrument into another's stem is removed.
- Silent stems are skipped, and a song with no drums gets no drum part.
- Note starts are lined up with the song's own beat (sixteenths or triplets).
- The notes keep the length they are held in the recording.

### How accurate it is

Measured on a 47-note piano piece with known notes:

| Path | Right notes | Invented notes | Held length |
|---|---|---|---|
| Just a piano | 92% | none | 101% of written |
| A full song, or not sure (recognised as one instrument) | 92% | none | 101% |
| The same piece played on a Roland GO:KEYS 3, recorded and written down | 96% | none | 100% |

Clear parts (a lead vocal, a bass line, a solo instrument) come out close. Dense mixes are approximate, because the split itself blends instruments: on one full song, the notes that could be confirmed in the audio were about 95% for vocals, 91% guitar, 80% bass and 71% for the "other" stem. Check results by ear, and fix wrong notes in the piano roll.

> **Tip:** for the best results, install both **AI stem separation** and **AI note transcription** from [Models and engines](#models-and-engines).

## Your hardware keyboard

A hardware keyboard connected by USB (for example a Roland GO:KEYS 3) can play your music in its own voices, and its sound can be recorded straight back into a session. Everything is in the editor's **Keyboard** button.

### Connecting the keyboard

1. Connect the keyboard to the computer with a USB cable and switch it on. Set its volume about three-quarters up.
2. Open Music Suite in **Chrome or Edge** (other browsers cannot talk to MIDI hardware).
3. In the editor, press **Keyboard**, then **Connect**, and allow MIDI when the browser asks.
4. Choose the keyboard under **Keyboard**, and its **Channel**. A GO:KEYS 3 listens on **channel 4 only**; most other keyboards set to "receive all" answer on any.
5. **Test out: play three notes:** you should hear them on the keyboard.

A GO:KEYS 3 appears as "Roland Digital Piano" for MIDI and "Line (Roland Digital Piano)" for audio.

### Play my music on the keyboard

**What the keyboard plays when the song plays:**

- *Nothing:* notes play on the computer.
- *All parts together:* every notes track.
- *One part:* a single track.

The chosen notes go to the keyboard during normal playback, and their sound on the computer is silenced so they are not heard twice. Only tracks that have notes are listed; convert audio to notes first (see [Turning audio into notes](#turning-audio-into-notes)) or use the Wizard.

**Notes at once:** *All*, or a limit of 1, 2, 3, 4 or 6. Some keyboard voices, especially character voices, turn many simultaneous notes into a blur; a limit keeps the louder notes and drops the rest.

### Choosing the keyboard's voice

**Keyboard voice** picks any sound the keyboard has:

1. Choose a **bank**.
2. Step through its sounds with **◀ ▶**, or type the sound's number. Every change is sent to the keyboard and played, so what you see is what you hear.
3. **Listen** plays a short chord in the current voice.

You can also press a sound button on the keyboard itself; when the keyboard reports it, the app picks it up.

GO:KEYS 3 banks:

| Bank | What is in it |
|---|---|
| Extra voices (71/99) | Further voices not in Roland's published tone list; on the Minion edition, this is where its character voices are. |
| Preset A, B, C (71/96, 71/97, 71/98) | The main tone list: pianos (Preset A, number 1, is the grand piano), organs, strings, synths and so on. |
| Common 1–7 (87/85 to 87/91) | Further General MIDI-style sounds. |
| Drum kits (86/65) | Drum kits. |

The keyboard plays one voice at a time, so a song with several parts is recorded one part after another.

### Recording a part through the keyboard

1. **Audio in:** **Find inputs**, then choose the keyboard's own output (for a GO:KEYS 3, "Line (Roland Digital Piano)"). **Test in** shows whether sound is arriving.
2. **Timing:** **Measure the delay**. The keyboard answers a few tens of milliseconds late; measuring it once lets every take land exactly in time.
3. **Record a pass:** choose the part and press **Record … through the keyboard**. It plays the part out and records what comes back onto a new track called "<part> (keyboard)". The notes track stays as it was, so you can record it again.

**Automatic level:** before each take, the app plays the part's loudest chord, held as long as the part holds it (up to about 1.6 seconds, so voices that swell are measured), measures what comes back, and sets the keyboard's volume over MIDI so that moment sits at about a third of full scale. That leaves room for held chords that overlap and voices that keep swelling, so a whole take still stays below distortion. It adds a few seconds of test chords before each take. A very quiet voice may stay below the target even at full volume.

**Checks after each take:**

- *Silent:* the take is not saved, and you are told the keyboard stopped answering (see [Troubleshooting](#troubleshooting)).
- *Distorted:* the take is still saved and you are told. In the wizard it is recorded again by itself, each time about 6 dB quieter, up to three tries; only if even a low MIDI volume distorts are you asked to turn the keyboard's own volume knob down.

## Keyboard wizard

The **Wizard** button in the editor takes a song all the way through the keyboard, step by step: either adding a new voice to it, or re-voicing its parts. Each step says what it is doing while it does it.

### Step 1: Song

Say what the recording is: *A full song, or not sure*, *Just a piano*, *One other instrument*, or *One voice or melody line* (see [Turning audio into notes](#turning-audio-into-notes) for what each does). Then **Load a song file…**, or **Use this** for a song already on the timeline. The wizard splits it if needed and writes down its notes; a three-minute song takes a few minutes.

If the session already has notes tracks, **Skip** goes straight on.

### Step 2: Keyboard

**Check the keyboard** finds the keyboard's MIDI, finds its audio input, plays a test note and times how long the sound takes to come back. It lists all three when it works. Allow MIDI and the microphone when the browser asks: the keyboard's sound arrives as an audio input.

### Step 3: Voices

Choose what to do:

**Add a voice to the song** (the default). The song stays exactly as it is, and a new part is written to go with it:

| What the new voice does | How it is made |
|---|---|
| Sing the tune | The song's melody, one note at a time, folded into a singing range. Taken from the vocal part if there is one, otherwise from the top line of the other parts. |
| Sing a harmony | A third above the melody, inside the song's key. |
| Hold the chords | Long notes that follow the song's chords bar by bar, three at a time, like a backing choir. |

Tick one or more of them. Each ticked style becomes its own part, recorded in turn, and the takes play together: the tune, its harmony and held chords underneath. Held chords become three parts (low, middle, high), because the Minion voices sound one note at a time. Press **Write the sing-along part**. It is built from the song's own notes, so its key, tempo and chords come from the song. **Write it again** replaces it, for example after choosing another style. The new part starts on the keyboard's **Extra voices** bank, where the GO:KEYS 3 Minion edition keeps its character voices; step through it for the one you want. This doubles, harmonises or accompanies the song's existing melody; it does not compose a new counter-melody, and it is only as good as the notes written down in step 1.

**Re-voice the song's parts.** The song's own parts are played by the keyboard in voices you choose. Tick the parts to include. **Silence what the keyboard replaces** mutes each original part once its keyboard take is in; left unticked, the original keeps playing in full under the takes.

For each part:

| Setting | Choices | Default | What it does |
|---|---|---|---|
| Voice | Any bank and sound, or the keyboard's current sound | Piano parts: the grand piano; sing-along: Extra voices | What the keyboard plays the part with. |
| Notes at once | 1 (melody), 2, 3, 4, All | Vocal, bass and lead lines: 1; sing-along chords: 3; everything else: All | Thins chords for voices that blur them. |
| Octave | Singing range, 2 up, 1 up, As written, 1 down | Lines: Singing range; others: As written | Moves the part by whole octaves. Singing range centres it around the G above middle C. |
| Note length | Held to the next, Room to speak, As written | Lines: Held to the next; others: As written | *Held to the next* joins the notes (a long silence stays a silence); *Room to speak* gives short notes at least a quarter of a second. |
| One note at a time | on / off | On for the keyboard's Extra voices (the Minion voices); off otherwise | Measured on the GO:KEYS 3: these voices sound one note at a time, and a new note cuts off the word still being said. With this on, no note starts until the one before has had its shortest length, and each layer is recorded as a take of its own. |
| Shortest note | 0 to 2 seconds | Sung sing-along parts: 0.6 s; others: as shaped | Every note lasts at least this long. A voice that says a word (a Minion voice) is cut off when its note ends, so give it long enough for the word. |
| When a note runs into the next | Skip the next note (words finish), Let them overlap | Sing-along: Skip | *Skip* drops a short note that would start while a word is still being said, so fewer notes are sung but each word is whole. *Overlap* keeps every note and lets them ring over each other. Held chords are never skipped. |
| Move it a third up | on / off | off | Plays a third above the part instead of the part itself. |
| Add layers | 3rd above, 5th below, Octave above, Octave below | none | Notes added to every note of the part, a little quieter; a third and a fifth follow the song's key. With *One note at a time* on, each layer is recorded as its own take in the same rhythm, on its own track; otherwise they are played together in one take. |

Some Minion voices say a short word that ends by itself (about 0.3 to 0.8 seconds, measured) however long the key is held. A longer *Shortest note* does not lengthen such a word; it gives it room to finish before the next note.

### Step 4: Record

**Record one part at a time** (recommended). For each part:

1. Check or change its voice and settings, then **Record this part**, or **Skip it**.
2. Listen with **Hear it alone** or **Hear it with the song**. This only changes what you hear; nothing in the session changes.
3. **Record again** after changing anything (the new take replaces the old one), or **Keep it, next part**.

**Record all without stopping** records every part in turn without waiting for you.

Before each take the keyboard's level is set automatically (see [Your hardware keyboard](#your-hardware-keyboard)). If a take comes back distorted, the wizard records that part again by itself, about 6 dB quieter each time, up to three tries, and only then asks you to turn the keyboard's own volume knob down. If a take comes back silent the wizard stops instead of saving empty tracks.

### Step 5: Done

Each kept take is on its own track named after its part, and the notes tracks are muted. In *Add a voice* mode nothing else is changed; in *Re-voice* mode the replaced parts are muted if you ticked that option. **Play the result** plays the whole song from the start. Adjust the faders and export as usual (Export → Mixdown, or Song from chosen tracks).

## AI Song Studio

Under **Settings → Local model downloads**, select a runtime, review its requirements and confirm the download. After installation, select the engine in the generation form. HeartMuLa and MiniMax Music 3 accept lyrics. DiffRhythm uses timestamped lyrics and offers 95- and 285-second renders. Magenta RealTime 2 renders instrumentals offline. Stable Audio 3 also works from an editor clip. Select the clip and open **AI edit** to restyle it, regenerate a highlighted region, or continue past the end of the source. Each runtime has its own dependencies. Some weights download on first generation.

Generates songs with AI: on this computer with ACE-Step 1.5, or with an online service you switch on with your own key. Results open in the Studio Editor. The page has four tabs: **Create**, **Album**, **History** and **Settings**.

### Generators

| Generator | Where it runs | Needs | Notes |
|---|---|---|---|
| ACE-Step 1.5 (on this computer) | Your computer | The local engine (about 5.3 GB, installed from Settings) | On by default. Full songs with vocals, offline. Also does AI edits. |
| ACE-Step 1.5 (your own Python server) | Your computer | ACE-Step's own server already running | Off by default. Best on NVIDIA. |
| YuE2 (on this computer, non-commercial) | Your computer | NVIDIA GPU with about 24 GB and a separate YuE2 install | Off by default. Licence CC BY-NC 4.0: not for commercial use. |
| MusicGen through ComfyUI | Your computer | ComfyUI running, with the Sonic Holodeck nodes | Short instrumental parts, up to 120 s. |
| ElevenLabs Music | Online | Your ElevenLabs key | About $0.15 per minute (prices as of 2026-11). Song plans. |
| fal.ai: MiniMax Music, Lyria | Online | Your fal.ai key | About $0.08–0.15 per song. |
| Google Lyria | Online | Your Gemini key | About $0.04–0.08 per song. Every song carries Google's SynthID watermark. |

Suno is listed but not available: it has no public API, and unofficial connectors break its terms. The arranger (which writes notes, not audio) is used from the Studio Editor's inspector.

### Create

1. **Install local engine** if the card asks (first time only; about 5.3 GB and a few minutes).
2. **Generator:** shown when more than one is ready.
3. Either **Start from an idea**: describe the song in a sentence or two and press **Write style and lyrics** (about 30 s). It fills in the title, style, lyrics, tempo, key, time signature, language and length. Edit anything before generating. With Ollama installed the lyrics are fuller.
4. Or **Start from a song:** **Choose a song file** (or pick one you analysed). Its tempo, key, time signature, length and feel are measured and filled in. Then choose what to make from it:

| Choice | What it makes |
|---|---|
| New song in its style | A new song with the same tempo, key, length and feel. |
| Restyle | The same song in a new style. |
| Extend | More music before the start or after the end. |
| Extract an instrument | One instrument from it, as its own track. |
| Add a part | A new part (drums, bass, guitar…) that fits over it. |
| Build a full song around it | An arrangement around, say, a vocal or a riff. |

Extract, Add a part and Build need the editing model (2.4 GB, from Settings). With *New song in its style* and *Restyle*, the original's track is muted in the session.

5. Fill in the form and press **Generate** (or **Generate into this project** when you came from the editor).

**ACE-Step settings:**

| Setting | Range | Default | What it does |
|---|---|---|---|
| Style description | 3–1500 characters | | Genre, mood, instruments, voice and production, in plain words. Required. |
| Instrumental (no vocals) | on / off | off | No singing. |
| Length | 10–600 s | Auto | Leave on Auto to let the model choose. |
| Lyrics | up to 6000 characters | empty | Use tags like [Verse] and [Chorus] (the + Verse, + Chorus… buttons insert them). Empty lets the model write them. |
| Language | Auto and 21 languages | Auto | |
| Tempo / Key / Time signature | 30–300 BPM / any key / 4/4, 3/4, 2/4, 6/8 | Auto | |
| Versions to make | 1–4 | 1 | Each extra version takes extra time. |
| Seed | −1 or a number | −1 | −1 is random. Reuse a seed to get the same result again. |

**Advanced** (folded away):

- **Plan the song first:** on by default; adds about 15 s.
- **Let the planner rewrite the style.**
- **Planner temperature, guidance, top-p and top-k:** how adventurous the plan is.
- **Styles to avoid.**
- **Diffusion steps:** Auto is 8 for the fast models and 50 for the base model.
- **Diffusion guidance, Schedule shift and Solver.**
- **Music model and Planner model:** Auto uses the high-quality XL model when it is installed and switched on.
- **LoRA adapter and strength:** shown only when adapters are installed.

**Rewrite** (under the lyrics) changes the lyrics on request, for example "add a bridge" or "translate to Spanish". It needs Ollama.

The bar at the bottom shows how long it will take (local) or what it will cost (online). While generating it shows each stage and a **Cancel** button. Online services cannot be cancelled once the request is sent.

**Results:** each version has a player and its tempo, key, loudness and seed. The buttons are:

- **Open in Studio Editor**
- **Add to a session**
- **Split into stems**
- **Analyse**
- **Start a song from it**
- **Keep this seed for the next version**

Each version goes on its own track; extra versions are muted so you can compare them.

**ElevenLabs song plan:** an optional section-by-section plan, with up to 30 sections and 10 minutes in all. Each section has:

- a name and a length (3–120 s);
- how closely it follows its neighbours;
- its lyrics, one line per sung line;
- its styles and things to avoid.

**Draft a plan (free)** makes one for you. The first section's styles set the genre. With a plan, Length and Lyrics are not used.

### Album

Makes up to 20 songs in the background, one after another. They keep going after a restart.

- **Album title**, **Generator**, **What the album is about**, and **Shared style**.
- **Songs, one idea per line.**
- **Each song about** (30–300 s, default 150).
- **Instrumental**, and **Write lyrics and style for each song** (on).
- **Make N songs.**

Each album becomes its own session. When memory is short or the generator is busy, a song waits and tries again every minute for up to two hours. **Open in Studio Editor** places the finished songs one after another; **Stop** cancels the rest.

> **Tip:** use ACE-Step or an online service for albums. MusicGen and YuE2 take different settings, and an album made with them is likely to fail.

### History

Every song you made, with the settings that made it. **Use these settings** fills the form again; **Open project** opens it in the editor; the trash icon removes the entry (the audio stays in its session).

### Settings

| Card | Settings |
|---|---|
| Local music engine | **Install local engine**, **Download high-quality model (4.9 GB)** (better songs, about 25% slower), **Download editing model (2.4 GB)** (needed for Extract, Add a part and Build), **Unload now**, and **Use the high-quality (XL) model for new songs** (on). |
| Lyrics and style writer | Uses Ollama (from ollama.com) with the model you choose; **Download** gets it (gemma4:12b, about 8 GB). Without Ollama, the music engine's own planner writes a simpler draft. |
| Keeping your computer responsive | **Do not start below** 5–80% free memory (default 25%). **Unload the engine after** 1–240 idle minutes (default 10). |
| Loudness of new songs | **Level each new song when it is imported** (on), to a **Target loudness** of −30 to −6 LUFS (default −14), with peaks never above −1 dBTP. Not applied to AI edits or MusicGen. |
| Online services | Paste your API key and **Save key** to switch a service on; **Remove key** switches it off. Keys are kept in Windows Credential Manager. Each has a **Terms and pricing** link. |
| Generators | Switch each generator on or off. |

## Synth Studio

Design synth sounds and play them; sounds saved here appear as "My sounds" on instrument tracks in the Studio Editor. The **MIDI** button at the top connects a MIDI keyboard, which plays whichever tab is open (velocity, sustain pedal and pitch bend work).

### Music Suite synth

The built-in synth, running in your browser.

- **Sound bar:** the sound's name, **Load a preset…** (factory sounds and My sounds), **Save as my sound** (kept in this browser, up to 200), **Forget**, **Export** / **Import** (`.mssound` files) and **New sound** (back to Init).
- **Piano:** play with the mouse, touch, or the computer keys A W S E D F T G Y H U J K O L P; **Z / X** move the octave. Up to 12 notes at once.

| Section | Controls (default) |
|---|---|
| Oscillators 1, 2, 3 | **On** (only 1 is on at first). **Wave:** Saw, Square, Pulse 25%, Pulse 12%, Triangle, Sine, Organ, Hollow, Bright. **Octave** ±3, **Semitones** ±12, **Fine** ±100 cents, **Level** (80%). **Unison** 1–7 voices with **Detune** and **Stereo spread**, for a thicker sound. |
| Filter | **Type:** low-pass, high-pass, band-pass, notch. **Slope:** 12 or 24 dB/oct. **Cutoff** (3.2 kHz): brightness. **Resonance** (10%): a peak at the cutoff. **Drive**: grit. **Key follow** (30%): higher notes are brighter. **Env 2 amount**: how far envelope 2 sweeps the filter. |
| Noise, FM and voice | **Noise**. **FM (osc 2 → 1)**: bell and electric-piano tones. **Voices:** Poly (chords) or Mono (one note, glides) with **Glide** time. **Velocity** (60%): how much playing harder makes it louder. **Volume**. |
| Envelope 1 (Volume) | **Attack** (10 ms), **Decay** (300 ms), **Sustain** (80%), **Release** (200 ms): how a note starts, settles and ends. |
| Envelope 2 (Modulation) | The same four, for filter sweeps and the modulation routes. |
| LFOs 1 and 2 | **Shape:** sine, triangle, saw, square, random steps. **Sync:** free (with **Rate** 0.05–20 Hz) or tied to the tempo (1 bar to 1/16, triplets). Slow regular movement for vibrato, wobble and sweeps. |
| Modulation | Up to 8 routes from a **source** (LFO 1, LFO 2, Envelope 2, Velocity, Note) to a **destination** (pitch, an oscillator's pitch or level, noise, FM amount, cutoff, resonance, volume, pan) with an **Amount** of ±100%. At full amount, pitch moves an octave and cutoff four octaves. |

### Surge XT and plugins

Plays VST3 instrument plugins installed on this computer, such as Surge XT (install it free from [Models and engines](#models-and-engines)).

- **Instrument:** which plugin. Turn it off to choose another.
- **Open <name>'s full interface:** the plugin's own window, on the desktop. Closing it keeps the sound.
- **Play** loops a short demo phrase; **Stop** ends it.
- **Sounds:** a searchable list (Surge XT only), with ★ favourites. The arrow keys step through sounds.
- **Turn <name> off.**
- **Export sound / Import sound.**
- **The piano:** the first key you press switches the instrument on.

To use a sound in a song, star it here, then choose it on an instrument track in the editor.

## Song Geometry Mapper

Turns a song into a moving 3D cloud: every short slice of sound becomes a point placed by its character (brightness, spread, energy and so on), linked to its neighbours in time and in sound. Use it to see a song's structure, or to make visuals and video.

Open it from the analyser's **Geometry Mapper** button (the selected song loads and is analysed automatically), or load a file in the mapper itself.

- **Top bar:** **About** (how it works), **Song Info**, **Waveform** (click to seek), **Math HUD** (the measurements behind the picture), and live RMS, centroid and spread. **H** hides the overlays.
- **Moving around:** drag to orbit, scroll to zoom, arrow keys to pan, **F** to frame everything, **Space** to play, **[** and **]** to change speed.
- **Hover help:** hold the pointer on any control for half a second to see what it does.

| Tab | What is in it |
|---|---|
| Session (S) | **Analysis Model:** Classic (in the browser), Voice or Deep (on the computer, needs AI stem separation; falls back to Classic if unavailable). **Voice Focus:** vocals, full mix, drums, bass or other. **Load Audio File** (or a saved analysis JSON). Player, **Playback Speed** (0.05–2×), **Preserve pitch**. **AI Music Style:** a written description of the song's style, measured and optionally written up by Ollama. Display switches: connections, labels, cinema effects, nodes only. |
| Mapping (M) | How points are placed: **Mapping Mode** (Manifold, Time Spine, Hybrid Flow, Helix Orbit), **3D Frequency Spread**, offsets, how points are linked (**Edge Mode**, **Neighbor Links**), **Camera Preset** (Static, Drift, Orbit, Pulse, Dive) and **Display Decimation** (fewer points for speed). |
| Visual (V) | Point size, opacity and depth; connection style (Wave, Straight, Ribbon), strength and trails; time and structure layers (fog, ghost layers, time tube, section arcs); motion and pulse. |
| Post FX (FX) | **Visual Preset** (Cinematic, Observatory, Neon, Aurora…), glow, bloom, fog, lens flare, **Color Metric** (what the colours show) and palette. Save your own presets. |

**Export** (Post FX tab):

- **Export Analysis JSON:** reload the analysis later without analysing again.
- **Export 3D OBJ:** the visible cloud as a 3D model.
- **Capture Still:** a PNG; choose **4K Still** for print.
- **Start Video / Stop Video:** a WebM recording.
- **Copy MP4 Command:** an ffmpeg command that converts that recording to MP4.

## Models and engines

Optional engines and AI models. Everything here runs on this computer, and installing something never changes what is already installed.

**This computer** shows your graphics card and whether the AI models will use it. An NVIDIA card makes separation and transcription much faster. If it says to update the NVIDIA driver, do so to use the GPU.

| Pack | What it adds | Size |
|---|---|---|
| AI stem separation | Better 2- and 4-stem splits, 6 stems (adds guitar and piano), drum kit pieces (kick, snare, toms, hi-hat, ride, crash), lead and backing vocals, AI beat tracking. Choose which models to download; any not downloaded are fetched the first time they are needed. **Delete downloaded models** frees the space. | About 3 GB with NVIDIA support (1 GB without), plus models |
| AI note transcription | Whole song to MIDI, piano by a piano-only model (Transkun), chords in Convert to MIDI notes (basic-pitch). Works best with stem separation installed too. | About 120 MB |
| MuScriptor (optional, manual) | A whole-mix transcriber that names up to 35 instruments. Non-commercial use only. The page lists the install steps (a pip install, accepting its terms on Hugging Face, signing in). | Depends on the size chosen |
| Music engine (ACE-Step 1.5) | Full songs with vocals, offline, in the AI Song Studio. Needs a C++ compiler and CMake, which the installer fetches. | About 5.3 GB |
| Editing model | Extract an instrument, add a part, build a song around a part. | 2.4 GB |
| High-quality (XL) model | Better songs, a little slower. | 4.9 GB |
| Lyrics writer | Lyrics and style descriptions with Ollama. Needs Ollama running. | About 8 GB |
| Surge XT | A free hybrid synthesizer with thousands of factory sounds, for instrument tracks and the Synth Studio. | About 300 MB download |

When a pack finishes, reload any open editor pages to use it. **Install log** shows what the installer did if something fails.

From a terminal: `.venv\Scripts\python -m audioqi.addons install stems` and `python -m audioqi.editor.instruments install surge-xt`.

## Settings reference

Most settings are in the app itself and are explained where they appear in this manual:

| Settings | Where | See |
|---|---|---|
| Mastering | Analyser page → AI Mastering | [Analyser and mastering](#analyser-and-mastering) |
| Project tempo, key, master level, limiter, crossfades | Editor → inspector with nothing selected | [Project](#project) |
| Track EQ, width, sends, effects | Editor → inspector with a track selected | [Track, effects and buses](#track-effects-and-buses) |
| Instruments | Editor → inspector with a notes clip selected | [Instruments and sounds](#instruments-and-sounds) |
| MIDI channel, keyboard voice, notes at once, audio input | Editor → Keyboard | [Your hardware keyboard](#your-hardware-keyboard) |
| AI engines, memory, loudness of new songs, online keys | AI Song Studio → Settings | [AI Song Studio](#settings) |
| Optional models | Models & engines | [Models and engines](#models-and-engines) |

### Advanced: environment variables

For things the app does not offer as a setting, set a Windows environment variable before running start.bat (System Properties → Environment Variables, then restart Music Suite). There is no settings file for these.

| Variable | Default | What it changes |
|---|---|---|
| `AUDIOQI_DATA_DIR` | `data` in the Music Suite folder | Where all sessions, songs and models are kept. |
| `MUSIC_SUITE_MAX_UPLOAD_BYTES` | 524288000 (500 MB) | The largest file you can upload or generate. |
| `MUSIC_SUITE_MAX_AUDIO_DURATION_SECONDS` | 900 (15 minutes) | The longest song you can load. |
| `AUDIOQI_SAMPLE_RATE` | 48000 | The sample rate songs are analysed at. |
| `AUDIOQI_JOB_WORKERS` | 2 | How many analyses run at once. |
| `AUDIOQI_ANALYSIS_STALL_TIMEOUT_SECONDS` | 600 | How long an analysis may make no progress before it is stopped. |
| `AUDIOQI_REPORT_MAX_SECONDS` | 300 | Time limit for making the report; 0 is no limit. |
| `AUDIOQI_FFMPEG_TIMEOUT_SECONDS` | 900 | Time limit for conversions and for online, ComfyUI and Lyria generation. |
| `AUDIOQI_SKIP_PDF_EXPORT` | off | Set to 1 to skip the PDF report. |
| `MUSIC_SUITE_STARTUP_TIMEOUT_SECONDS` | 300 | How long start.bat waits for Music Suite to come up. |
| `MUSIC_SUITE_ELEVENLABS_API_KEY`, `MUSIC_SUITE_FAL_KEY`, `MUSIC_SUITE_GEMINI_API_KEY` | | Online service keys, instead of saving them in the app. |
| `MUSIC_SUITE_COMFYUI_URL` | http://127.0.0.1:8188 | Where ComfyUI is, for MusicGen. |
| `MUSIC_SUITE_ACESTEP_DIR`, `MUSIC_SUITE_ACESTEP_URL` | | The local engine's folder; your own ACE-Step server's address. |
| `MUSIC_SUITE_YUE2_PYTHON`, `MUSIC_SUITE_YUE2_DEVICE` | , cuda | The YuE2 install. |
| `MUSIC_SUITE_MUSCRIPTOR_SIZE` | | small, medium or large. |

## Troubleshooting

### The keyboard

| Problem | What to do |
|---|---|
| "No keyboard was found on MIDI" | Check the USB cable and that the keyboard is on. Use Chrome or Edge, and allow MIDI when asked. |
| Test notes are not heard | Check the **Channel** (4 for a GO:KEYS 3) and the keyboard's volume. |
| A take comes back silent, or the keyboard stops answering part-way through a session | Windows' connection to the keyboard's MIDI has stuck. Unplug the keyboard's USB cable, wait five seconds and plug it back in (or switch the keyboard off and on), then **Check the keyboard** again. If it still does not answer, restart the computer. |
| A take sounds distorted | The wizard re-records it quieter by itself (up to three tries). If it still says so, the keyboard's own volume knob is very high: turn it down to about half and record again. |
| The take is late or early | **Measure the delay** again, with nothing else playing. |
| The keyboard plays the wrong sound | Choose the voice in the app rather than on the keyboard, and press **Listen** before recording. |

### Notes

| Problem | What to do |
|---|---|
| Strange, unrelated notes | Tell the wizard what the recording is (*Just a piano*, *One voice*…). Install AI stem separation and AI note transcription. Check the result by ear and fix it in the piano roll. |
| Notes are too short | They keep the length held in the recording. For singing voices, choose **Note length: Held to the next** in the wizard. |
| A piano comes back split across several tracks | Choose *Just a piano*; or use 4 stems rather than 6. |
| An invented drum part | Fixed: a song without drums no longer gets one. Delete the track if an old session has it. |

### The editor

| Problem | What to do |
|---|---|
| "Save failed — retrying on next edit" | Music Suite's background service is not answering. Make any small edit to retry; if it keeps failing, restart with stop.bat and start.bat. Your last saved state is safe. |
| A tool says an engine is missing | Install it from [Models and engines](#models-and-engines), then reload the editor page. |
| The Delete key removed a whole clip | Undo (Ctrl+Z). In the piano roll, delete notes with right-click or the **Delete** button. |
| Recording is refused | Allow the microphone for the page in the browser's address bar. |
| An export is missing an in-browser plugin | Some community plugins cannot run during export; the notice names them. |

### Analysis and mastering

| Problem | What to do |
|---|---|
| Analysis stuck at the same percentage | Long spectrograms can take a while. After ten minutes without progress it stops itself; if a run still looks stuck, use **Hard Reset**. |
| No PDF report | PDF needs WeasyPrint; the HTML report has the same content. |
| Choosing a preset did not change the loudness | The Target LUFS and True Peak boxes win. Clear them, or use Apply Suggested Settings or a Normalization Profile. |
| "Backend selected: internal" when you chose another | That backend is not installed; mastering used the built-in chain instead. |
| An error shows raw text such as `{"detail": …}` | The message inside "detail" is the reason. |

### Generating songs

| Problem | What to do |
|---|---|
| "Not installed yet" | Settings → **Install local engine**. |
| "Only N% of memory is free…" | Close other apps or browser tabs, or lower **Do not start below** in Settings. |
| "Needs the editing model" | Settings → **Download editing model**. |
| ElevenLabs refuses the key or has no credit | Check the key and your ElevenLabs account. |
| "The AI engine stopped while starting" | See `data\generation\engine.log`. |

### Starting Music Suite

| Problem | What to do |
|---|---|
| "did not open port N within S seconds" | The computer is slow to start it: run `.\start.ps1 -StartupTimeoutSeconds 600`. |
| "Could not reach the Music Suite API" | Music Suite's background service stopped: run stop.bat, then start.bat. |
| Something else | Look in the `logs` folder: `api.error.log` and `web.error.log` usually say why. |

## Glossary

| Term | Meaning |
|---|---|
| Bus | A shared track that several tracks send to, for a shared reverb or delay, or to group them. |
| Clip | One piece of audio or notes on the timeline. |
| Crest factor | The gap between a song's peaks and its average level. More crest sounds punchier and more open. |
| dBFS / dBTP | Level relative to full scale; true peak (dBTP) includes peaks that occur between samples. |
| LRA | Loudness range: how much the loudness changes through a song. |
| LUFS | Loudness as people hear it. Streaming services play songs at about −14 LUFS. |
| MIDI | Notes as instructions (which key, when, how hard) rather than sound. |
| Mono compatibility | Whether a song still sounds right when left and right are mixed together (phones, club systems). |
| Normalise | Turn the whole thing up or down to a target level. |
| Run | One song uploaded to the analyser, and everything made from it. |
| Session / project | One piece of work in the Studio Editor. |
| Stem | One instrument separated out of a mix: vocals, drums, bass, other… |
| Take | One recorded attempt. |
| Velocity | How hard a note is played. |
| Voice (keyboard) | One sound on a hardware keyboard: a piano, a choir, a Minion voice. |

