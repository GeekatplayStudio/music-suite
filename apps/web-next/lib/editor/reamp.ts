/**
 * Re-amping: playing a track's notes out to a hardware keyboard and recording the sound it
 * makes back onto the timeline, so a transcribed part comes back in the instrument's own
 * voices instead of a software synth.
 *
 * The round trip is not instant. A note leaves the computer, the keyboard works out what to
 * play, and the sound travels back over USB into the browser's capture buffers: on a GO:KEYS
 * 3 that is tens of milliseconds, enough to smear a drum part. So the delay is measured
 * rather than guessed, and the recording is shifted back by it when it lands on the
 * timeline.
 *
 * One pass carries one part, because a GO:KEYS 3 plays one sound at a time (see
 * `lib/editor/midi-out.ts`). A four-stem song is four passes, each with its voice chosen by
 * hand on the instrument first.
 */

import type { EditorEngine } from "@/lib/editor/engine";
import { midiOutHub } from "@/lib/editor/midi-out";
import type { Clip, Note, ProjectState } from "@/lib/editor/types";

export interface AudioInputInfo {
  deviceId: string;
  label: string;
}

/** How far ahead of the playhead notes are handed to the browser's MIDI stack. */
const LOOKAHEAD = 0.25;
/** How often the driver tops up that queue. */
const TICK_MS = 50;
/** Inputs likely to be an instrument's own sound rather than a microphone. */
const INSTRUMENT_INPUT = /roland|go:?keys|yamaha|korg|casio|line|digital piano|usb audio/i;

/**
 * The computer's audio inputs. Labels are only readable once the page has been allowed to
 * record, so this is called after permission is in hand.
 */
export async function listAudioInputs(): Promise<AudioInputInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "audioinput" && device.deviceId)
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Audio input ${index + 1}`
    }));
}

/** The input most likely to be the keyboard, for a sensible first choice. */
export function guessInstrumentInput(inputs: AudioInputInfo[]): string {
  const named = inputs.find((input) => INSTRUMENT_INPUT.test(input.label) && input.deviceId !== "default");
  return named?.deviceId ?? inputs.find((input) => input.deviceId !== "default")?.deviceId ?? inputs[0]?.deviceId ?? "";
}

/** The loudest sample in a capture, for a level meter and for judging whether anything came back. */
export function peakOf(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const value = Math.abs(channel[i]);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

/**
 * Where a sound starts in a capture, as a sample index, or null when nothing is there.
 *
 * The first stretch is taken as the noise floor, and the onset is the first sample that
 * clearly rises above it. Found on short windows rather than single samples so a stray
 * click does not count.
 */
export function findOnset(channels: Float32Array[], sampleRate: number): number | null {
  const mono = channels[0];
  if (!mono || mono.length < sampleRate * 0.05) return null;
  const window = Math.max(16, Math.round(sampleRate * 0.001));
  const floorEnd = Math.min(mono.length, Math.round(sampleRate * 0.03));
  let floor = 0;
  for (let i = 0; i < floorEnd; i++) floor = Math.max(floor, Math.abs(mono[i]));
  // Loud enough to be a note, and well clear of whatever hiss the input already had.
  const threshold = Math.max(floor * 8, 0.004);
  for (let start = floorEnd; start + window <= mono.length; start += window) {
    let loudest = 0;
    for (let i = start; i < start + window; i++) loudest = Math.max(loudest, Math.abs(mono[i]));
    if (loudest < threshold) continue;
    // Walk back to where the rise actually began inside this window.
    let at = start;
    while (at > floorEnd && Math.abs(mono[at - 1]) > threshold * 0.25) at--;
    return at;
  }
  return null;
}

export interface RoundTrip {
  /** Seconds from asking for a note to its sound appearing on the input. */
  seconds: number;
  /** The loudest sample heard, 0-1, so a too-quiet keyboard can be reported. */
  peak: number;
}

/**
 * Measure the round trip by playing one note and finding when it comes back.
 *
 * Both ends are read on the audio clock: the time just before the note is sent, and the
 * capture's own frame numbers. Repeated a few times and the median is kept, because USB
 * audio buffers jitter by a few milliseconds from one note to the next.
 */
export async function measureRoundTrip(
  engine: EditorEngine,
  options: { deviceId?: string; pitch?: number; tries?: number } = {}
): Promise<RoundTrip> {
  if (!midiOutHub.ready()) throw new Error("Choose the keyboard's MIDI output first.");
  const pitch = options.pitch ?? 60;
  const tries = Math.max(1, options.tries ?? 3);
  const measured: number[] = [];
  let peak = 0;

  for (let attempt = 0; attempt < tries; attempt++) {
    let sentAt: number | null = null;
    const take = await engine.captureProbe(1.2, {
      deviceId: options.deviceId,
      onArmed: (contextTime) => {
        // Read the clock and send in the same breath, so the two refer to one instant.
        sentAt = contextTime;
        midiOutHub.noteOn(pitch, 0.86);
        window.setTimeout(() => midiOutHub.noteOff(pitch), 400);
      }
    });
    midiOutHub.allOff();
    peak = Math.max(peak, peakOf(take.channels));
    const onset = findOnset(take.channels, take.sampleRate);
    if (onset === null || sentAt === null) continue;
    const heardAt = take.firstTime + onset / take.sampleRate;
    const delay = heardAt - sentAt;
    // Anything outside this is not the note we played.
    if (delay > 0.001 && delay < 0.9) measured.push(delay);
  }

  if (!measured.length) {
    throw new Error(
      peak > 0.002
        ? "Sound arrived but its start could not be found. Try a louder volume on the keyboard."
        : "Nothing came back. Check the keyboard is on, its volume is up, and the right audio input is chosen."
    );
  }
  measured.sort((a, b) => a - b);
  return { seconds: measured[Math.floor(measured.length / 2)], peak };
}

/**
 * Every note a track will play, at its position in the song rather than in its clip.
 *
 * Follows the same rules as playback: a note sounds only if it starts inside its clip, and
 * it is cut at the clip's end.
 */
export function trackNotes(state: ProjectState, trackId: string): Note[] {
  const notes: Note[] = [];
  for (const clip of state.clips as Clip[]) {
    if (clip.trackId !== trackId || clip.muted || !clip.notes) continue;
    const clipEnd = clip.start + clip.duration;
    for (const note of clip.notes) {
      if (note.t < clip.offset - 1e-6 || note.t >= clip.offset + clip.duration) continue;
      const start = clip.start + note.t - clip.offset;
      const end = Math.min(clipEnd, start + note.d);
      if (end <= start) continue;
      notes.push({ t: start, d: end - start, p: note.p, v: note.v });
    }
  }
  return notes.sort((a, b) => a.t - b.t || a.p - b.p);
}

/** The last moment anything on the track sounds, so a pass knows when it is done. */
export function notesEnd(notes: Note[]): number {
  return notes.reduce((latest, note) => Math.max(latest, note.t + note.d), 0);
}

/**
 * Feeds a track's notes to the keyboard in step with the playhead, for as long as it runs.
 *
 * Each note is stamped with the moment it should sound, so the browser's MIDI stack places
 * it accurately instead of it going out whenever the timer happened to fire.
 */
export class MidiPassDriver {
  private timer: number | null = null;
  private sentUntil: number;
  private readonly notes: Note[];

  constructor(
    private readonly engine: EditorEngine,
    notes: Note[],
    private readonly from: number,
    private readonly onEnd?: () => void
  ) {
    this.notes = notes;
    this.sentUntil = from;
  }

  start(): void {
    if (this.timer !== null) return;
    this.pump();
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    midiOutHub.allOff();
  }

  private pump(): void {
    const position = this.engine.position();
    // A jump backwards (a loop, or the user moving the playhead) starts the queue again.
    if (position < this.sentUntil - LOOKAHEAD - 0.5) {
      midiOutHub.allOff();
      this.sentUntil = position;
    }
    const to = Math.max(this.sentUntil, position) + LOOKAHEAD;
    midiOutHub.scheduleNotes(this.notes, this.sentUntil, to, (at) => {
      const clock = this.engine.performanceTimeFor(at);
      // Stopped mid-pass: send it now rather than at a time that no longer means anything.
      return clock ?? performance.now();
    });
    this.sentUntil = to;
    const finished = notesEnd(this.notes);
    if (finished > 0 && position > finished + 0.4) {
      this.stop();
      this.onEnd?.();
    }
  }

  /** Where the pass started, for placing what comes back. */
  startedFrom(): number {
    return this.from;
  }
}

/**
 * A part thinned to at most `voices` notes at once, keeping the louder ones.
 *
 * A transcribed accompaniment can hold a dozen notes a second. A software synth copes; a
 * character voice on a keyboard turns that into a blur. When a new note would exceed the
 * limit it replaces the quietest one sounding if it is louder, and is left out otherwise.
 */
export function capVoices(notes: Note[], voices: number): Note[] {
  if (voices <= 0) return notes;
  const kept: Note[] = [];
  let sounding: Note[] = [];
  for (const source of [...notes].sort((a, b) => a.t - b.t || b.v - a.v)) {
    const note = { ...source };
    sounding = sounding.filter((other) => other.t + other.d > note.t + 0.005);
    if (sounding.length >= voices) {
      const quietest = sounding.reduce((low, other) => (other.v < low.v ? other : low));
      if (quietest.v >= note.v) continue;
      // The quieter note gives way: it ends where the louder one begins.
      quietest.d = Math.max(0.02, note.t - quietest.t);
      sounding = sounding.filter((other) => other !== quietest);
    }
    sounding.push(note);
    kept.push(note);
  }
  return kept;
}
