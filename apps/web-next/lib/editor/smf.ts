/**
 * Standard MIDI Files, read and written in the browser.
 *
 * Reading accepts formats 0 and 1, honours tempo changes, and splits a track that plays on
 * several channels into one track per channel, so a format 0 file arrives as its separate
 * instruments rather than one pile of notes. Each track reports the General MIDI program it
 * asked for, and channel 10 (counted from zero, 9) is reported as drums.
 *
 * Writing produces a format 1 file: a conductor track carrying the name, tempo and time
 * signature, then one track per instrument with its name and a program change.
 */

import { DRUM_CHANNEL, clampProgram, gmProgramName } from "@/lib/editor/gm";
import type { Note } from "@/lib/editor/types";

export interface MidiFileTrack {
  name: string;
  notes: Note[];
  /** The General MIDI program this track asked for, 0-127. */
  program: number;
  /** True when the notes came from the percussion channel, where pitch picks the drum. */
  drums: boolean;
}

export interface MidiFile {
  bpm: number | null;
  tracks: MidiFileTrack[];
}

const MAX_NOTES_PER_TRACK = 20_000;
const DIVISION = 480;
/** Channels a melodic track may use, in the order they are handed out; 9 is the drum channel. */
const MELODIC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

interface RawNote {
  on: number;
  off: number;
  pitch: number;
  velocity: number;
  channel: number;
}

/** Read a Standard MIDI File (format 0 or 1) into notes timed in seconds. */
export function parseMidi(data: ArrayBuffer): MidiFile {
  const view = new DataView(data);
  let pos = 0;
  const tag = () => {
    const text = String.fromCharCode(view.getUint8(pos), view.getUint8(pos + 1), view.getUint8(pos + 2), view.getUint8(pos + 3));
    pos += 4;
    return text;
  };
  const u32 = () => {
    const value = view.getUint32(pos);
    pos += 4;
    return value;
  };
  if (data.byteLength < 14 || tag() !== "MThd") throw new Error("This is not a MIDI file.");
  const headerLength = u32();
  const trackCount = view.getUint16(pos + 2);
  const division = view.getUint16(pos + 4);
  pos += headerLength;
  if (division & 0x8000) throw new Error("MIDI files timed in video frames are not supported.");

  const tempos: { tick: number; usPerBeat: number }[] = [];
  const raw: { name: string; notes: RawNote[]; programs: Map<number, number> }[] = [];

  for (let t = 0; t < trackCount && pos + 8 <= data.byteLength; t++) {
    const chunk = tag();
    const length = u32();
    const end = Math.min(data.byteLength, pos + length);
    if (chunk !== "MTrk") {
      pos = end;
      continue;
    }
    const varLen = () => {
      let value = 0;
      for (let i = 0; i < 4 && pos < end; i++) {
        const byte = view.getUint8(pos++);
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) break;
      }
      return value;
    };
    let tick = 0;
    let running = 0;
    let name = "";
    const open = new Map<number, { on: number; velocity: number }[]>();
    const notes: RawNote[] = [];
    const programs = new Map<number, number>();
    while (pos < end) {
      tick += varLen();
      let status = view.getUint8(pos);
      if (status & 0x80) pos++;
      else status = running;
      if (status === 0xff) {
        const type = view.getUint8(pos++);
        const size = varLen();
        if (type === 0x51 && size === 3) {
          tempos.push({ tick, usPerBeat: (view.getUint8(pos) << 16) | (view.getUint8(pos + 1) << 8) | view.getUint8(pos + 2) });
        } else if (type === 0x03 && !name) {
          name = new TextDecoder().decode(new Uint8Array(data, pos, Math.min(size, end - pos))).slice(0, 60);
        }
        pos += size;
      } else if (status === 0xf0 || status === 0xf7) {
        pos += varLen();
      } else {
        running = status;
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const key = (channel << 8) | view.getUint8(pos);
        const first = view.getUint8(pos++);
        const second = kind === 0xc0 || kind === 0xd0 ? 0 : view.getUint8(pos++);
        if (kind === 0xc0) {
          // The first program a channel asks for is the one the track is named after.
          if (!programs.has(channel)) programs.set(channel, first & 0x7f);
        } else if (kind === 0x90 && second > 0) {
          open.set(key, [...(open.get(key) ?? []), { on: tick, velocity: second }]);
        } else if (kind === 0x80 || kind === 0x90) {
          const started = open.get(key)?.shift();
          if (started && notes.length < MAX_NOTES_PER_TRACK) {
            notes.push({ on: started.on, off: tick, pitch: first, velocity: started.velocity, channel });
          }
        }
      }
    }
    pos = end;
    raw.push({ name, notes, programs });
  }

  tempos.sort((a, b) => a.tick - b.tick);
  const toSeconds = (tick: number) => {
    let seconds = 0;
    let lastTick = 0;
    let usPerBeat = 500_000;
    for (const tempo of tempos) {
      if (tempo.tick >= tick) break;
      seconds += ((tempo.tick - lastTick) / division) * (usPerBeat / 1e6);
      lastTick = tempo.tick;
      usPerBeat = tempo.usPerBeat;
    }
    return seconds + ((tick - lastTick) / division) * (usPerBeat / 1e6);
  };

  const tracks: MidiFileTrack[] = [];
  for (const track of raw) {
    if (!track.notes.length) continue;
    // One editor track per channel: a format 0 file holds every instrument in one MTrk.
    const byChannel = new Map<number, RawNote[]>();
    for (const note of track.notes) {
      const list = byChannel.get(note.channel);
      if (list) list.push(note);
      else byChannel.set(note.channel, [note]);
    }
    const alone = byChannel.size === 1;
    for (const [channel, channelNotes] of [...byChannel.entries()].sort((a, b) => a[0] - b[0])) {
      const drums = channel === DRUM_CHANNEL;
      const program = track.programs.get(channel) ?? 0;
      // A track of its own keeps the name the file gave it; split channels are named
      // after their instrument, which says more than "Song 1", "Song 2".
      const fallback = drums ? "Drums" : gmProgramName(program);
      tracks.push({
        name: (alone ? track.name : "") || fallback,
        program,
        drums,
        notes: channelNotes
          .map((note) => {
            const t = toSeconds(note.on);
            return { t, d: Math.max(0.02, toSeconds(note.off) - t), p: note.pitch, v: note.velocity / 127 };
          })
          .sort((a, b) => a.t - b.t)
      });
    }
  }
  return { bpm: tempos.length ? Math.round((60e6 / tempos[0].usPerBeat) * 10) / 10 : null, tracks };
}

function varLenBytes(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

function textEvent(type: number, text: string): number[] {
  const bytes = [...new TextEncoder().encode(text.slice(0, 60))];
  return [0, 0xff, type, ...varLenBytes(bytes.length), ...bytes];
}

function chunk(tag: string, body: number[]): number[] {
  const length = body.length;
  return [
    ...[...tag].map((character) => character.charCodeAt(0)),
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body
  ];
}

/** One instrument's part in a MIDI file. */
export interface MidiOutTrack {
  name: string;
  notes: Note[];
  /** The General MIDI program to ask for, 0-127. Ignored when `drums` is set. */
  program?: number;
  /** Write on the percussion channel, where the pitch picks the drum. */
  drums?: boolean;
}

export interface MidiOutOptions {
  /** Quarter notes per minute. */
  bpm: number;
  beatsPerBar?: number;
  /** 4 for a quarter-note beat (4/4, 3/4), 8 for an eighth (6/8). */
  beatUnit?: 4 | 8;
  /** The name of the piece, written to the conductor track. */
  name?: string;
}

function trackChunk(track: MidiOutTrack, channel: number, bpm: number): number[] {
  const toTicks = (seconds: number) => Math.max(0, Math.round((seconds * bpm * DIVISION) / 60));
  const events: { tick: number; order: number; bytes: number[] }[] = [];
  for (const note of track.notes) {
    const pitch = Math.min(127, Math.max(0, Math.round(note.p)));
    const velocity = Math.min(127, Math.max(1, Math.round(note.v * 127)));
    const on = toTicks(note.t);
    events.push({ tick: on, order: 1, bytes: [0x90 | channel, pitch, velocity] });
    events.push({ tick: Math.max(on + 1, toTicks(note.t + note.d)), order: 0, bytes: [0x80 | channel, pitch, 0] });
  }
  // Note-offs sort before note-ons on the same tick so repeated notes retrigger.
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const body: number[] = [...textEvent(0x03, track.name || "Instrument")];
  if (!track.drums) body.push(0, 0xc0 | channel, clampProgram(track.program ?? 0));
  let last = 0;
  for (const event of events) {
    body.push(...varLenBytes(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return chunk("MTrk", body);
}

/**
 * Write several instruments as one format 1 Standard MIDI File. Note times are in seconds
 * on a shared timeline, so a track's notes must already be positioned where they sound.
 */
export function writeMidiFile(tracks: MidiOutTrack[], options: MidiOutOptions): Blob {
  const { bpm, beatsPerBar = 4, beatUnit = 4, name = "Music Suite project" } = options;
  const usPerBeat = Math.round(60e6 / bpm);
  const conductor = chunk("MTrk", [
    ...textEvent(0x03, name),
    0, 0xff, 0x51, 3, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff,
    // Denominator as a power of two, 24 MIDI clocks to a metronome click, 8 thirty-seconds to a quarter.
    0, 0xff, 0x58, 4, Math.min(255, Math.max(1, Math.round(beatsPerBar))), beatUnit === 8 ? 3 : 2, 24, 8,
    0, 0xff, 0x2f, 0
  ]);

  let next = 0;
  const parts = tracks.map((track) => {
    const channel = track.drums ? DRUM_CHANNEL : MELODIC_CHANNELS[next++ % MELODIC_CHANNELS.length];
    return trackChunk(track, channel, bpm);
  });

  const header = chunk("MThd", [0, 1, (parts.length + 1) >> 8, (parts.length + 1) & 0xff, DIVISION >> 8, DIVISION & 0xff]);
  const out = new Uint8Array([...header, ...conductor, ...parts.flat()]);
  return new Blob([out], { type: "audio/midi" });
}

/** Write one instrument's notes as a MIDI file; used for exporting a single clip. */
export function writeMidi(notes: Note[], bpm: number, name: string, instrument?: { program?: number; drums?: boolean }): Blob {
  return writeMidiFile([{ name, notes, program: instrument?.program, drums: instrument?.drums }], { bpm, name });
}
