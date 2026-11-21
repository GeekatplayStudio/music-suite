# Song → stems → MIDI → keyboard → back again

How to take a finished song (from Suno or anywhere else), split it into parts, play those
parts out of a hardware keyboard in its own voices, and record the result back into the
same project.

Written against a **Roland GO:KEYS 3 Minion Edition** over USB-C, but nothing here is
specific to the Minion artwork: it applies to the plain GO:KEYS 3, and most of it to any
class-compliant keyboard.

---

## 1. What the hardware will and will not do

These were measured on the instrument itself, not taken from the manual. They decide the
shape of the whole workflow, so read them before planning a session.

| Question | Answer | How it was established |
| --- | --- | --- |
| Does USB-C carry MIDI **and** audio? | Yes, both, class compliant. No driver, no audio interface, no cables beyond the one USB-C lead. | Roland's own specification, and confirmed by the ports appearing on this machine. |
| Which MIDI channel does it play? | **Channel 4, and only channel 4.** | All 16 channels were played in turn and the returning audio measured. Channel 4 gave −22 dBFS; every other channel sat at the −93 dBFS noise floor. |
| Is it multi-timbral? | **No.** One sound at a time. | Follows from the above: there is no second channel to put a second part on. |
| Can program change pick its tones? | **No.** | Programs 0–127 were swept, under bank MSB 0/87/92/93/121. Every one produced an identical sound (spectral centroid 1265 Hz, spread 1 Hz across the whole sweep). |
| Does program change do any harm? | **Yes — avoid it.** The first program change moved the instrument off the tone selected on the panel and it did not come back. | The take before any program change measured a centroid of 2018 Hz; every take after measured 1265 Hz. |
| Does velocity get through? | Yes, and it changes tone as well as level: 21.9 dB between velocity 20 and 127. | Four velocities played and measured. |
| What pitch range plays? | At least MIDI 24–108, wider than the 61 physical keys. | Each pitch played and measured. |
| How tight is the timing? | Within about 8 ms over a 1.5-second phrase. | A four-note phrase was played out and each note's own fundamental tracked in the returning audio. |

**The two consequences that shape everything below:**

1. **One part per pass.** The keyboard plays one sound at a time, so a four-stem song is
   four separate passes, not one.
2. **Choose the voice by hand.** The Minion buttons are the only way in. The app
   deliberately sends no program change, because doing so would knock the instrument off
   the voice you just selected.

---

## 2. Connect and test, once

1. Plug the keyboard into the computer with **USB-C**, and switch the keyboard on. Turn its
   volume up to around three-quarters — the USB audio level follows the volume control.
2. Open the editor and press the **cable icon** in the toolbar (next to the MIDI keyboard
   icon). This is the **Play out to a keyboard** panel.
3. **1. MIDI out** — press *Connect* and allow MIDI when the browser asks. Pick the keyboard
   in the list (it shows up as *Roland Digital Piano*). Leave the channel on **4**.
   Press **Test out: play three notes**. You should hear a rising C–E–G from the keyboard.
   - Nothing? Check the channel is 4 and the keyboard's volume is up.
4. **2. Audio in** — press **Find inputs** and allow audio input when asked. Choose
   **Line (Roland Digital Piano)**. Press **Test in**; play a few keys while it listens. It
   reports the level it heard.
   - Silent? You have probably picked a microphone instead of the keyboard's own line.
5. **3. Timing** — press **Measure the delay**. It plays a note, listens for it, and reports
   the round trip in milliseconds. This is stored and used to line up every recording.
   Measure it again if you change the audio input or the buffer size.

Steps 3 and 4 are the "test in and out" that must pass before anything else is worth
trying.

---

## 3. Get the song in and split it

1. **Bring the song in.** Drop the Suno export (or any WAV/MP3) onto the editor timeline.
2. **Split it into stems.** Use the separation the suite already has. Choose:
   - **4 stems** (vocals, drums, bass, other) for most songs;
   - **6 stems** when you want guitar and piano separately;
   - add the **drum-kit pass** to get kick, snare, toms, hi-hat, ride and crash on their own
     tracks, and the **lead/backing pass** to split the vocal, if the AI separation pack is
     installed.
3. **Check the stems** before going further. A stem that came out as mush will transcribe as
   mush. Re-split with a different stem count if one is poor.

---

## 4. Turn the stems into notes

Run **song to MIDI**. Each stem goes to the transcriber that suits it — piano to Transkun,
chordal parts to basic-pitch, vocals and bass to a single-line pitch tracker, drums to hit
detection on each kit piece. You end up with one MIDI track per part.

Then, before sending anything out:

- **Fix the obvious errors in the piano roll.** Transcription invents notes, especially on
  vocals and on anything with heavy reverb. Five minutes here saves a bad pass.
- **Mind the range.** Minion voices are character voices; they read best in the middle of
  the keyboard. A bass line at MIDI 28 will play, but it will not sound like a Minion.
  Transpose up an octave or two if it sounds wrong.
- **Thin out the notes.** A dense transcription played by a character voice turns to
  porridge. Melodies and hooks work; sixteenth-note pads do not.

---

## 5. Record a pass per part

For **each** part you want in a Minion voice:

1. **Select the Minion voice on the keyboard by hand** — the dedicated buttons, 32
   variations of Bob, Kevin and Stuart. Play a few keys to be sure it is the one you want.
   The app will not change it, and must not.
2. Open the **cable panel**, section **4. Record a pass**.
3. Choose the part in **Part to play out**. The list shows only tracks that have notes, with
   how many.
4. Press **Record … through the keyboard**.
   - Playback starts one second before the part's first note.
   - The notes go out on channel 4, stamped so they land in time rather than whenever the
     browser got round to them.
   - The keyboard's audio is recorded the whole time.
   - It stops on its own at the end of the part. Press **Stop the pass** to end it early.
5. What comes back lands on a **new track named after the part**, for example
   `Vocals (keyboard)`, shifted earlier by the measured round trip so it sits exactly where
   the notes were. The MIDI original is untouched, so you can change the voice and run it
   again.
6. **Mute the MIDI original** once you are happy, so you hear the keyboard version instead
   of the software synth.

Repeat for the next part, selecting a different Minion voice first.

> Nothing stops you re-running a part as many times as you like. Each pass makes a new
> track, so you can keep two takes side by side and choose later.

---

## 6. Put the song back together

Now it is an ordinary mix, with the keyboard takes sitting alongside whatever you kept from
the original:

1. **Decide what stays.** A common shape is: original drums and bass, Minion voices on the
   vocal and the lead line. All-Minion is funnier for ten seconds and tiring after that.
2. **Level each take.** The keyboard's output will not match the stems' level. Use the
   faders, and the loudness meter on the master.
3. **Fix the edges.** Trim each keyboard take to where the part really starts and ends, and
   put short fades on both ends so nothing clicks.
4. **Nudge if needed.** The round-trip compensation is measured, not guessed, but if a part
   still feels early or late, drag the clip by a few milliseconds. Re-measuring the delay
   fixes it properly.
5. **Export.** Render the mix as you would any other project.

---

## 7. When something goes wrong

| What you see | What it usually is |
| --- | --- |
| *Test out* makes no sound | Wrong channel (it must be 4), keyboard volume down, or the wrong MIDI port chosen. |
| *Test in* is silent | A microphone is selected instead of **Line (Roland Digital Piano)**. |
| "Nothing came back" when measuring | The keyboard is off, muted, or the MIDI port and audio input belong to different devices. |
| The take is late or early | Measure the delay again. It changes if you switch audio device or the system changes buffer size. |
| The take sounds like a piano, not a Minion | A program change reached the instrument and moved it off the panel voice. Re-select the Minion voice by hand. The app sends none, so check nothing else is driving the keyboard. |
| Notes play but the wrong ones | The transcription is wrong, not the keyboard. Fix it in the piano roll. |
| The take is distorted | Keyboard volume too high into the USB input. Bring it down to about three-quarters and measure again. |
| Only the first note of a chord sounds | Expected on a monophonic voice. Some character voices are one-note-at-a-time. |

---

## 8. Where this lives in the code

| Piece | File |
| --- | --- |
| MIDI output: ports, channel, timed note scheduling, panic | `apps/web-next/lib/editor/midi-out.ts` |
| Device listing, round-trip measurement, onset finding, the pass driver | `apps/web-next/lib/editor/reamp.ts` |
| Input selection, latency override, calibration capture | `apps/web-next/lib/editor/engine.ts` |
| The panel | `apps/web-next/components/editor/reamp-panel.tsx` |
| Starting a pass and saving what comes back | `apps/web-next/components/editor/editor-app.tsx` |
| Stem separation | `audioqi/editor/separation.py` |
| Song to MIDI | `audioqi/editor/transcribe.py` |

The measured facts in section 1 are repeated as comments at the top of `midi-out.ts`, so
whoever changes that code next does not have to rediscover them.
