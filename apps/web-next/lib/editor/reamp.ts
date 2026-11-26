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

/** Why a keyboard check failed, for the interface to say in its own language. */
export type ReampErrorCode = "noMidiOut" | "noOnset" | "nothingBack";

/** A failed keyboard check: the English message plus a code the interface translates. */
export class ReampError extends Error {
  constructor(
    readonly code: ReampErrorCode,
    message: string
  ) {
    super(message);
  }
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
  if (!midiOutHub.ready()) throw new ReampError("noMidiOut", "Choose the keyboard's MIDI output first.");
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
    throw peak > 0.002
      ? new ReampError("noOnset", "Sound arrived but its start could not be found. Try a louder volume on the keyboard.")
      : new ReampError("nothingBack", "Nothing came back. Check the keyboard is on, its volume is up, and the right audio input is chosen.");
  }
  measured.sort((a, b) => a - b);
  return { seconds: measured[Math.floor(measured.length / 2)], peak };
}

/**
 * Where the loudest moment of the level check should sit: about 10 dB below distortion.
 * The check is a moment of the part, while the take is all of it: held chords overlap as
 * one fades and the next starts, and sustained voices keep swelling, so the take comes
 * back louder than the check. This much headroom absorbs that.
 */
export const LEVEL_TARGET = 0.32;
/** Accepted around the target, so a near miss does not cost another check. */
const LEVEL_BAND = [0.75, 1.25] as const;
/** The lowest MIDI volume worth sending; below it the keyboard's own knob is the problem. */
export const MIN_VOLUME = 10;
/** Level follows the square of the volume setting on a GO:KEYS 3 (measured), so 0.7 is -6 dB. */
export const QUIETER = 0.7;

/** The notes sounding at the part's loudest moment, judged by how hard and how many are held at once. */
function loudestMoment(notes: Note[]): Note[] {
  let best: Note[] = [];
  let bestWeight = 0;
  for (const anchor of notes) {
    const together = notes.filter((note) => note.t <= anchor.t + 0.03 && note.t + note.d > anchor.t);
    const weight = together.reduce((sum, note) => sum + note.v, 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = together;
    }
  }
  return best.slice(0, 12);
}

/**
 * Set the keyboard's volume so the part's loudest moment comes back well below distortion.
 *
 * The keyboard's own output overruns the USB input on a full chord or a loud voice, and
 * what is clipped there cannot be repaired afterwards. So before a take the loudest chord
 * of the part is played, the level that comes back is measured, and the keyboard's MIDI
 * volume is moved until it sits at the target. On a GO:KEYS 3 the level follows the square
 * of the volume setting (measured), which is what the correction assumes.
 * Returns the volume chosen and the peak last measured, or null when nothing came back.
 */
export async function autoLevel(
  engine: EditorEngine,
  notes: Note[],
  options: { deviceId?: string; startVolume?: number } = {}
): Promise<{ volume: number; peak: number } | null> {
  const chord = loudestMoment(notes);
  if (!chord.length || !midiOutHub.ready()) return null;
  // Held as long as the part holds it (within reason): sustained voices swell after the attack.
  const hold = Math.min(1.6, Math.max(0.55, Math.max(...chord.map((note) => note.d))));
  let volume = Math.min(127, Math.max(MIN_VOLUME, Math.round(options.startVolume ?? 100)));
  let peak = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    midiOutHub.setVolume(volume);
    const take = await engine.captureProbe(hold + 0.6, {
      deviceId: options.deviceId,
      onArmed: () => {
        for (const note of chord) midiOutHub.noteOn(note.p, note.v);
        window.setTimeout(() => {
          for (const note of chord) midiOutHub.noteOff(note.p);
        }, hold * 1000);
      }
    });
    midiOutHub.allOff();
    peak = peakOf(take.channels);
    if (peak < 0.002) return null;
    if (peak >= LEVEL_TARGET * LEVEL_BAND[0] && peak <= LEVEL_TARGET * LEVEL_BAND[1]) break;
    // At full scale the true level is unknown, only that it is too high: come down firmly.
    const next = peak >= 0.98 ? volume * 0.5 : volume * Math.sqrt(LEVEL_TARGET / peak);
    const clamped = Math.min(127, Math.max(MIN_VOLUME, Math.round(next)));
    if (clamped === volume) break;
    volume = clamped;
  }
  // The last correction is sent too: it was worked out after the last check.
  midiOutHub.setVolume(volume);
  // Let the last chord die away so it is not on the start of the take.
  await new Promise((resolve) => setTimeout(resolve, 350));
  return { volume, peak };
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
    /** Called once the part has played, after which the driver stops. Without it the driver follows the playhead until stopped. */
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
    // A jump forwards: the notes that were skipped are not all sent at once.
    if (position > this.sentUntil + 0.5) {
      midiOutHub.allOff();
      this.sentUntil = position;
    }
    // The queue reaches a fixed distance past the playhead. It must be measured from the
    // playhead, not from where the queue already ends: that grew it by LOOKAHEAD every tick,
    // four times faster than time passes, until it looked like a jump backwards and every
    // note was silenced (all notes off about five times a second; measured on a GO:KEYS 3).
    const to = position + LOOKAHEAD;
    if (to > this.sentUntil) {
      midiOutHub.scheduleNotes(this.notes, this.sentUntil, to, (at) => {
        const clock = this.engine.performanceTimeFor(at);
        // Stopped mid-pass: send it now rather than at a time that no longer means anything.
        return clock ?? performance.now();
      });
      this.sentUntil = to;
    }
    const finished = notesEnd(this.notes);
    if (this.onEnd && finished > 0 && position > finished + 0.4) {
      this.stop();
      this.onEnd();
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

/**
 * The same key struck twice needs lifting in between. When a note runs up to or past the
 * next one on its pitch, its note-off lands on top of the new note-on and the keyboard cuts
 * the new note short. Each such note is ended a moment before its successor starts.
 */
export function clearRepeats(notes: Note[], gap = 0.03): Note[] {
  const out = notes.map((note) => ({ ...note })).sort((a, b) => a.t - b.t || a.p - b.p);
  const last = new Map<number, Note>();
  for (const note of out) {
    const pitch = Math.round(note.p);
    const before = last.get(pitch);
    if (before && before.t + before.d > note.t - gap) before.d = Math.max(0.02, note.t - gap - before.t);
    last.set(pitch, note);
  }
  return out;
}

/** Extra notes stacked on every note of a part, played together in the same voice. */
export type Layer = "third-up" | "fifth-down" | "octave-up" | "octave-down";

export const LAYERS: { id: Layer; label: string }[] = [
  { id: "third-up", label: "3rd above" },
  { id: "fifth-down", label: "5th below" },
  { id: "octave-up", label: "Octave above" },
  { id: "octave-down", label: "Octave below" }
];

/** How a part is reshaped on its way to the keyboard. */
export interface PartShape {
  /** "auto" moves the part by whole octaves into a singing range; a number is octaves up or down. */
  octave: "auto" | number;
  /** "written" keeps the lengths found; "full" gives short notes room to speak; "legato" holds each note until the next. */
  length: "written" | "full" | "legato";
  /** Sing a third above the written line, inside the song's key, instead of the line itself. */
  harmony: boolean;
  /** Most notes at once, per layer; 0 is no limit. */
  voices: number;
  /**
   * The shortest a note may be, in seconds; 0 leaves lengths alone. A keyboard voice that
   * says a word (a Minion voice) is cut off at its note's end, so a word needs this long.
   */
  minLength?: number;
  /**
   * What happens when a note made longer runs into the next one. True lets them ring over
   * each other; false skips the next one, so fewer notes are sung but every word finishes.
   * Notes that were already long (held chords) are never skipped and never cause a skip.
   */
  overlap?: boolean;
  /** Notes added on top of each note: a third above, a fifth below, an octave either way. */
  layers?: Layer[];
  /**
   * The voice sounds one note at a time: a new note takes over and cuts off the one before
   * (measured on the GO:KEYS 3 Extra voices bank, the Minion voices). Then no note starts
   * until the one before has had its shortest length, and layers are not stacked: each is
   * recorded as a take of its own.
   */
  mono?: boolean;
  /** Only this layer's notes, in the part's rhythm: one layer's own take on a one-note voice. */
  layerOnly?: Layer;
}

/** The GO:KEYS 3 Extra voices bank (the Minion voices) plays one note at a time (measured). */
export function isMonoTone(tone: { msb: number; lsb: number } | null | undefined): boolean {
  return Boolean(tone && tone.msb === 71 && tone.lsb === 99);
}

/**
 * One note at a time, each allowed to finish. A note that would start while the one before
 * is still within its shortest length is skipped; of notes struck together the loudest (then
 * the highest) is kept. Each kept note ends just before the next one starts, so the voice is
 * never asked to play two at once.
 */
export function oneAtATime(notes: Note[], minLength: number): Note[] {
  const sorted = [...notes].sort((a, b) => a.t - b.t || b.v - a.v || b.p - a.p);
  const kept: Note[] = [];
  let busyUntil = -Infinity;
  for (const source of sorted) {
    if (source.t < busyUntil - 0.02) continue;
    const note = { ...source, d: Math.max(source.d, minLength) };
    const before = kept[kept.length - 1];
    if (before && before.t + before.d > note.t - 0.01) before.d = Math.max(0.02, note.t - 0.01 - before.t);
    kept.push(note);
    busyUntil = note.t + Math.max(note.d, minLength);
  }
  return kept;
}

/** ``steps`` notes of the scale up (or down, when negative) from ``pitch``. */
function scaleStep(pitch: number, steps: number, scale: Set<number>): number {
  let out = Math.round(pitch);
  const direction = steps < 0 ? -1 : 1;
  for (let moved = 0; moved < Math.abs(steps); ) {
    out += direction;
    if (scale.has(((out % 12) + 12) % 12)) moved += 1;
  }
  return out;
}

/** Where a layer puts a note: a third above or a fifth below in the key, or an octave either way. */
function layerPitch(pitch: number, layer: Layer, scale: Set<number>): number {
  if (layer === "third-up") return scaleStep(pitch, 2, scale);
  if (layer === "fifth-down") return scaleStep(pitch, -4, scale);
  return pitch + (layer === "octave-up" ? 12 : -12);
}

/** Each note with the asked-for layers stacked on it, a little quieter than the note itself. */
export function addLayers(notes: Note[], layers: Layer[], scale: Set<number>): Note[] {
  if (!layers.length) return notes;
  const out: Note[] = [];
  for (const note of notes) {
    out.push(note);
    for (const layer of layers) {
      const pitch = layerPitch(note.p, layer, scale);
      if (pitch < 0 || pitch > 127) continue;
      out.push({ ...note, p: pitch, v: note.v * 0.8 });
    }
  }
  return out;
}

/** Only one layer's notes, at the part's own times and lengths. */
export function layerAlone(notes: Note[], layer: Layer, scale: Set<number>): Note[] {
  return notes
    .map((note) => ({ ...note, p: layerPitch(note.p, layer, scale) }))
    .filter((note) => note.p >= 0 && note.p <= 127);
}

/**
 * Notes given at least ``minLength`` seconds. With ``overlap`` off, a lengthened note that
 * would still be sounding when the next short note starts makes that next note (and anything
 * struck with it) be skipped, so the word in progress finishes. Notes that were already at
 * least ``minLength`` long, such as held chords, neither skip nor get skipped.
 */
export function lengthenNotes(notes: Note[], minLength: number, overlap: boolean): Note[] {
  if (minLength <= 0) return notes;
  const sorted = [...notes].sort((a, b) => a.t - b.t || a.p - b.p);
  const out: Note[] = [];
  let busyUntil = -Infinity;
  let groupStart = -Infinity;
  let groupKept = true;
  for (const source of sorted) {
    const note = { ...source };
    if (note.d >= minLength) {
      out.push(note);
      continue;
    }
    // Notes struck together (a word and its harmony) are kept or skipped together.
    if (note.t - groupStart > 0.03) {
      groupStart = note.t;
      groupKept = overlap || note.t >= busyUntil - 0.02;
    }
    if (!groupKept) continue;
    note.d = minLength;
    busyUntil = Math.max(busyUntil, note.t + note.d);
    out.push(note);
  }
  return out;
}

/** Where a sung line sits comfortably on a keyboard voice: around the C above middle C. */
const SINGING_CENTRE = 67;
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * The key a set of notes is in, from how long each pitch class sounds, matched against the
 * usual major and minor profiles. Returns the pitch classes of its scale.
 */
export function scaleOf(notes: Note[]): Set<number> {
  const held = new Array<number>(12).fill(0);
  for (const note of notes) held[((Math.round(note.p) % 12) + 12) % 12] += note.d;
  let best = { score: -Infinity, tonic: 0, minor: false };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const profile = minor ? MINOR : MAJOR;
      let score = 0;
      for (let step = 0; step < 12; step++) score += held[(tonic + step) % 12] * profile[step];
      if (score > best.score) best = { score, tonic, minor };
    }
  }
  const steps = best.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return new Set(steps.map((step) => (best.tonic + step) % 12));
}

/**
 * A part made ready for a keyboard voice: harmonised if asked, moved to the right octave,
 * its notes given the length they need, and thinned to what the voice can carry.
 * `context` is every note in the song, which is what decides the key.
 */
export function shapeNotes(notes: Note[], shape: PartShape, context: Note[] = notes): Note[] {
  if (!notes.length) return notes;
  let shaped = notes.map((note) => ({ ...note }));
  const layers = shape.layers ?? [];
  const scale = scaleOf(context.length ? context : notes);

  if (shape.harmony) {
    shaped = shaped.map((note) => {
      // Two scale steps up: a third, major or minor as the key has it at that point.
      let pitch = Math.round(note.p);
      let steps = 0;
      while (steps < 2) {
        pitch += 1;
        if (scale.has(((pitch % 12) + 12) % 12)) steps += 1;
      }
      return { ...note, p: pitch, v: note.v * 0.85 };
    });
  }

  let shift = 0;
  if (shape.octave === "auto") {
    const sorted = shaped.map((note) => note.p).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    shift = Math.round((SINGING_CENTRE - median) / 12) * 12;
  } else {
    shift = shape.octave * 12;
  }
  if (shift) shaped = shaped.map((note) => ({ ...note, p: Math.min(127, Math.max(0, note.p + shift)) }));

  shaped = capVoices(shaped, shape.voices);

  if (shape.length !== "written") {
    shaped.sort((a, b) => a.t - b.t || a.p - b.p);
    for (let index = 0; index < shaped.length; index++) {
      const note = shaped[index];
      // The next note that starts clearly later is where this one may be held to.
      let next: Note | undefined;
      for (let ahead = index + 1; ahead < shaped.length; ahead++) {
        if (shaped[ahead].t > note.t + 0.03) {
          next = shaped[ahead];
          break;
        }
      }
      const room = next ? next.t - note.t - 0.01 : note.d + 0.5;
      if (shape.length === "legato") {
        // Held to the next note, but a long silence in the tune stays a silence.
        note.d = room <= 1.2 ? Math.max(note.d, room) : Math.max(note.d, 0.3);
      } else {
        note.d = Math.max(note.d, Math.min(0.28, Math.max(0.05, room)));
      }
    }
  }
  if (shape.mono) {
    // One note at a time, each word allowed to finish; a layer is its own take in the same rhythm.
    shaped = oneAtATime(shaped, shape.minLength ?? 0);
    return shape.layerOnly ? layerAlone(shaped, shape.layerOnly, scale) : shaped;
  }
  // Lengthened before layering, so a word and the notes stacked on it are kept or skipped together.
  shaped = lengthenNotes(shaped, shape.minLength ?? 0, shape.overlap ?? true);
  if (shape.layerOnly) return layerAlone(shaped, shape.layerOnly, scale);
  return addLayers(shaped, layers, scale);
}
