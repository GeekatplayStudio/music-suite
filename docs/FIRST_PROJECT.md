# Your first song in Music Suite, step by step

From a melody you play on a keyboard (or hum, or upload) to a finished, cleaned-up song with
your own lyrics. Every step names the button to press. It takes about 20–30 minutes the
first time, most of it installing and waiting for the model.

You do not need to know music theory. You need:

- Music Suite installed and started (see [Windows install guide](WINDOWS_INSTALL_GUIDE.md); on
  macOS double-click `install.command`, then `start.command`).
- Chrome or Edge (they can talk to MIDI keyboards; Safari cannot).
- Optional: a USB MIDI keyboard. Without one, the on-screen piano works the same way.
- Optional but recommended: an NVIDIA graphics card. Everything runs on the processor too,
  only slower (measured on one computer: a 30-second song took 49 s on the processor and
  7.8 s on an RTX 3090).

> **Two ways in.** If you just want a song from a description, skip to
> [Shortcut: a song from an idea](#shortcut-a-song-from-an-idea). The full path below is for
> turning *your own* melody into a song.

---

## 1. Install the music engine (first time only)

1. Open **AI Song Studio** (button on the main page).
2. If a card says **One step before your first song**, press **Install local engine**. It
   downloads about 5.3 GB and builds the engine; this takes several minutes.
3. Open **Models & engines** (button in every workspace header) and check the **Music engine**
   row. It says what the engine runs on, for example *Runs on the graphics card (Vulkan)*. If it
   says the processor while your computer has a graphics card, follow the hint on that row.
4. For **Build a full song around it** in step 5 you also need the **Editing model** (2.4 GB):
   press **Install** on its row.

## 2. Make a session and an instrument track

1. Open **Studio Editor**, type a name such as *My first song*, and press **New session**.
2. Plug in your MIDI keyboard. Press the **keyboard icon** in the editor's header, then
   **Connect**, and allow MIDI when the browser asks. (No keyboard? Press the **piano icon** in
   the header to open the on-screen piano; it plays and records the same way.)
3. In that same panel press **Add an instrument track**. You get a track with an empty
   four-bar notes clip, ready to play into. Select it (click its header).

## 3. Record your melody

1. Set the tempo you want in the project panel on the right (**Tempo**, for example 100 BPM).
2. Press **record** (the microphone button). With an instrument track selected and a keyboard
   connected (or the on-screen piano open), it records **notes**, not audio; its tooltip says
   which.
3. Play your melody. Press **record** again (or Space) to stop. A clip called
   *Played HH:MM:SS* appears.
4. Fix wrong notes: select the clip and the **piano roll** opens under the timeline (P shows or
   hides it). Drag a note to move it, drag its right edge to change its length, right-click a
   note to delete it. **Show as sheet music** shows it as written music if you prefer.
5. Listen with Space. Happy with it? Go on.

> Prefer to sing or hum? Press the **microphone** button instead to record audio, then use
> **Turning audio into notes** (Help ▸ Turning audio into notes) to write it out as notes, or
> send the recording straight to step 4.

## 4. Send the melody to the AI Song Studio

1. **Export ▸ Start an AI song from the mix →**. The AI Song Studio opens with your melody in
   the **Starting from** panel. It has measured the tempo, key and length and filled them in.
2. Under **What to make from it**, choose:
   - **Restyle**: your melody becomes a full song in the style you describe, **with your
     lyrics**. Use this one for a sung song.
   - **Build a full song around it**: an arrangement around your melody (no lyrics; needs the
     editing model).
   - **New song in its style**: a new song with the same tempo, key and feel (your lyrics
     allowed, but your melody is not kept).

## 5. Add lyrics and a style, and generate

1. **Style description** (required): genre, mood, instruments and voice in plain words, for
   example *warm pop ballad, female vocal, piano and strings, slow build*.
2. **Lyrics**: type them, using **+ Verse**, **+ Chorus** to add section tags. Or describe the
   song under **Start from an idea** and press **Write style and lyrics** (fuller lyrics need
   Ollama, offered in Settings).
3. For **Restyle**: **How much of the original to keep**. Higher stays closer to your melody,
   lower follows the new style more freely. Start around the middle. **Stay close to the
   original (remix)** keeps melody and timing and changes mostly the production.
4. **Versions to make**: 2 is a good start, so you can pick the better one.
5. Press the **Generate** button (its label names the choice, for example *Restyle from …*).
   The bar shows each stage and a time estimate.

The model follows your melody, but not note for note: it is a starting point, not a copy. If
a result drifts too far, keep more of the original and generate again, or press **Keep this
seed for the next version** on a result you like and change only the lyrics or style.

## 6. Open the result in the editor

Each version has a player. Press **Open in Studio Editor** (or **Add to a session**). The
versions land on their own tracks next to your melody; extra versions start muted so you can
compare them with the M and S buttons.

Optional: **Split into stems** on a result gives vocals, drums, bass and the rest on separate
tracks, so you can change one part (for example replace the drums, or play a part through
your keyboard with the **Wizard**).

## 7. Clean up the sound

Generated songs sometimes carry hiss or a faint background noise. In the editor, select the
clip and use the inspector:

1. **Repair ▸ Reduce noise.** For the cleanest result, first use the **Range tool (R)** to
   highlight a short passage that is *only* noise (at least 0.1 s), so it is used as the noise
   print. Start at 40–60% strength; higher can sound watery.
2. **Restore**: **DeClick** for clicks, **DeHum** for mains hum, **DeReverb** for too much room.
3. A single cough or click: open the **spectral view (W)** and draw a box around it.

Every step can be undone (Ctrl+Z), and the original clip is kept.

## 8. Finish and export

1. Balance the tracks with their **Vol** faders; mute what you do not want.
2. For a polished, streaming-ready loudness: **Export ▸ Send mix to the analyser and
   mastering →**, then use **AI Mastering** on the analyser page.
3. Or export straight away: **Export ▸ Mixdown · MP3 320 kbps** (or WAV for the best quality).
   **Song from chosen tracks…** lets you tick exactly which tracks go in.
4. **Export ▸ Whole project** saves everything in one file to reopen later.

---

## Shortcut: a song from an idea

1. **AI Song Studio ▸ Create**.
2. Under **Start from an idea**, describe the song in a sentence or two, for example
   *a late-night drive along the coast, hopeful, dreamy synth-pop, female voice*, and press
   **Write style and lyrics**.
3. Edit anything, then press **Generate**.
4. Continue from [step 6](#6-open-the-result-in-the-editor).

## Where to go next

- **Help** (in the app) is the full manual, with search.
- **Keyboard wizard** (the wand in the editor): play a song's parts through a hardware
  keyboard in its own voices and record them back, or add a sing-along voice.
- **Synth Studio**: design your own sounds, or open Surge XT's full interface.
