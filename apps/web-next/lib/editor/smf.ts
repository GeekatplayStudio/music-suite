import type { Note } from "@/lib/editor/types";

export interface MidiFileTrack {
  name: string;
  notes: Note[];
}

export interface MidiFile {
  bpm: number | null;
  tracks: MidiFileTrack[];
}

const MAX_NOTES_PER_TRACK = 20_000;

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
  const raw: { name: string; notes: { on: number; off: number; pitch: number; velocity: number }[] }[] = [];

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
    const notes: { on: number; off: number; pitch: number; velocity: number }[] = [];
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
        const key = ((status & 0x0f) << 8) | view.getUint8(pos);
        const first = view.getUint8(pos++);
        const second = kind === 0xc0 || kind === 0xd0 ? 0 : view.getUint8(pos++);
        if (kind === 0x90 && second > 0) {
          open.set(key, [...(open.get(key) ?? []), { on: tick, velocity: second }]);
        } else if (kind === 0x80 || kind === 0x90) {
          const started = open.get(key)?.shift();
          if (started && notes.length < MAX_NOTES_PER_TRACK) {
            notes.push({ on: started.on, off: tick, pitch: first, velocity: started.velocity });
          }
        }
      }
    }
    pos = end;
    raw.push({ name, notes });
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

  const tracks = raw
    .filter((track) => track.notes.length)
    .map((track, index) => ({
      name: track.name || `MIDI ${index + 1}`,
      notes: track.notes
        .map((note) => {
          const t = toSeconds(note.on);
          return { t, d: Math.max(0.02, toSeconds(note.off) - t), p: note.pitch, v: note.velocity / 127 };
        })
        .sort((a, b) => a.t - b.t)
    }));
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

/** Write notes as a single-track Standard MIDI File at the given tempo. */
export function writeMidi(notes: Note[], bpm: number, name: string): Blob {
  const division = 480;
  const toTicks = (seconds: number) => Math.max(0, Math.round((seconds * bpm * division) / 60));
  const events: { tick: number; order: number; bytes: number[] }[] = [];
  for (const note of notes) {
    const pitch = Math.min(127, Math.max(0, Math.round(note.p)));
    const velocity = Math.min(127, Math.max(1, Math.round(note.v * 127)));
    const on = toTicks(note.t);
    events.push({ tick: on, order: 1, bytes: [0x90, pitch, velocity] });
    events.push({ tick: Math.max(on + 1, toTicks(note.t + note.d)), order: 0, bytes: [0x80, pitch, 0] });
  }
  // Note-offs sort before note-ons on the same tick so repeated notes retrigger.
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const usPerBeat = Math.round(60e6 / bpm);
  const title = [...new TextEncoder().encode(name.slice(0, 60))];
  const body: number[] = [
    0, 0xff, 0x03, ...varLenBytes(title.length), ...title,
    0, 0xff, 0x51, 3, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff
  ];
  let last = 0;
  for (const event of events) {
    body.push(...varLenBytes(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  body.push(0, 0xff, 0x2f, 0);

  const out = new Uint8Array(14 + 8 + body.length);
  const view = new DataView(out.buffer);
  out.set([0x4d, 0x54, 0x68, 0x64], 0);
  view.setUint32(4, 6);
  view.setUint16(8, 0);
  view.setUint16(10, 1);
  view.setUint16(12, division);
  out.set([0x4d, 0x54, 0x72, 0x6b], 14);
  view.setUint32(18, body.length);
  out.set(body, 22);
  return new Blob([out], { type: "audio/midi" });
}
