/**
 * Playing MIDI *out* to a hardware instrument (Web MIDI API), so the computer drives the
 * keyboard's own sounds instead of a software synth.
 *
 * The companion of `lib/editor/midi.ts`, which listens to keyboards. Permission covers both
 * directions, so a page already allowed to read MIDI connects here without asking again.
 *
 * Messages can be stamped with a time in the `performance.now()` clock, which is how a whole
 * phrase is handed over at once and still plays in time: the browser's MIDI stack sends each
 * byte at the moment asked for rather than when the script got round to it.
 *
 * ## What a GO:KEYS 3 does with this (measured, firmware 1.12)
 *
 * * It answers on **MIDI channel 4 and nothing else**, so it plays one part at a time. A
 *   multi-track song has to go over in one pass per part.
 * * **Its tones are chosen with bank select and program change**, but only from Roland's own
 *   banks: MSB 71 with LSB 96-99, MSB 87 with LSB 85-91, and MSB 86 LSB 65 for drum kits.
 *   Program change alone, or under a bank it does not have, lands on a fallback sound and
 *   takes it off the tone chosen on the panel, which is why an earlier sweep of the usual
 *   General MIDI banks looked as though tone selection did nothing.
 * * Bank 71/99 is not in the published GO:KEYS 3 tone list; on the Minion edition it holds
 *   a further set of distinct voices.
 * * Velocity and the full 0-127 pitch range do get through.
 */

export interface MidiOutputInfo {
  id: string;
  name: string;
}

/** A sound on the instrument: bank select MSB and LSB, and the program as its list counts it (1-128). */
export interface Tone {
  msb: number;
  lsb: number;
  program: number;
}

/** The banks a GO:KEYS 3 has, in the order of Roland's tone list. */
export const TONE_BANKS: { label: string; msb: number; lsb: number; programs: number }[] = [
  { label: "Extra voices (71/99)", msb: 71, lsb: 99, programs: 128 },
  { label: "Preset A (71/96)", msb: 71, lsb: 96, programs: 128 },
  { label: "Preset B (71/97)", msb: 71, lsb: 97, programs: 128 },
  { label: "Preset C (71/98)", msb: 71, lsb: 98, programs: 61 },
  { label: "Common 1 (87/85)", msb: 87, lsb: 85, programs: 128 },
  { label: "Common 2 (87/86)", msb: 87, lsb: 86, programs: 128 },
  { label: "Common 3 (87/87)", msb: 87, lsb: 87, programs: 128 },
  { label: "Common 4 (87/88)", msb: 87, lsb: 88, programs: 128 },
  { label: "Common 5 (87/89)", msb: 87, lsb: 89, programs: 128 },
  { label: "Common 6 (87/90)", msb: 87, lsb: 90, programs: 128 },
  { label: "Common 7 (87/91)", msb: 87, lsb: 91, programs: 69 },
  { label: "Drum kits (86/65)", msb: 86, lsb: 65, programs: 74 }
];

export interface MidiOutStatus {
  state: "idle" | "connecting" | "ready" | "unsupported" | "denied";
  outputs: MidiOutputInfo[];
  /** The chosen output's id, or "" when none has been chosen yet. */
  selected: string;
  /** The channel messages are sent on, 1-16 as the instrument's manual counts them. */
  channel: number;
}

/** What a GO:KEYS 3 listens on, and a sane default for most keyboards set to "receive all". */
export const DEFAULT_CHANNEL = 4;

const PORT_KEY = "music-suite:midi-output";
const CHANNEL_KEY = "music-suite:midi-output-channel";
/** Instruments whose own voices are worth driving tend to be named like this. */
const PREFERRED = /roland|go:?keys|yamaha|korg|casio|nord|kurzweil/i;

function stored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* the choice just is not remembered */
  }
}

function storedChannel(): number {
  const raw = Number(stored(CHANNEL_KEY, ""));
  return Number.isFinite(raw) && raw >= 1 && raw <= 16 ? Math.round(raw) : DEFAULT_CHANNEL;
}

class MidiOutHub {
  private access: MIDIAccess | null = null;
  private pending: Promise<void> | null = null;
  private watchers = new Set<() => void>();
  private status: MidiOutStatus = { state: "idle", outputs: [], selected: "", channel: DEFAULT_CHANNEL };
  private static readonly SERVER: MidiOutStatus = { state: "idle", outputs: [], selected: "", channel: DEFAULT_CHANNEL };
  /** Pitches sounding per channel, so anything held can always be stopped. */
  private held = new Map<number, Set<number>>();
  /** When a tone was last sent from here, so the instrument's echo of it is not taken for a choice made on its panel. */
  private toneSentAt = 0;

  supported(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
  }

  /** Connect without prompting when this page was already allowed to use MIDI. */
  async connectIfAllowed(): Promise<void> {
    if (!this.supported()) {
      this.update({ state: "unsupported" });
      return;
    }
    try {
      const permission = await navigator.permissions?.query({ name: "midi" as PermissionName });
      if (permission?.state === "granted") await this.connect();
    } catch {
      // Browsers that cannot report the permission wait for the user to press Connect.
    }
  }

  connect(): Promise<void> {
    if (this.access) return Promise.resolve();
    if (!this.supported()) {
      this.update({ state: "unsupported" });
      return Promise.resolve();
    }
    if (this.pending) return this.pending;
    this.update({ state: "connecting", selected: stored(PORT_KEY, ""), channel: storedChannel() });
    this.pending = navigator
      .requestMIDIAccess({ sysex: false })
      .then((access) => {
        this.access = access;
        access.onstatechange = () => this.refresh();
        this.refresh();
      })
      .catch(() => this.update({ state: "denied" }))
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  select(id: string): void {
    remember(PORT_KEY, id);
    this.update({ selected: id });
  }

  setChannel(channel: number): void {
    const clamped = Math.min(16, Math.max(1, Math.round(channel)));
    this.allOff();
    remember(CHANNEL_KEY, String(clamped));
    this.update({ channel: clamped });
  }

  /** For useSyncExternalStore. */
  watch = (onChange: () => void): (() => void) => {
    this.watchers.add(onChange);
    return () => this.watchers.delete(onChange);
  };

  snapshot = (): MidiOutStatus => this.status;
  serverSnapshot = (): MidiOutStatus => MidiOutHub.SERVER;

  /** The chosen output, or null when nothing usable is connected. */
  port(): MIDIOutput | null {
    const access = this.access;
    if (!access) return null;
    const chosen = access.outputs.get(this.status.selected);
    if (chosen && chosen.state !== "disconnected") return chosen;
    return null;
  }

  ready(): boolean {
    return this.port() !== null;
  }

  /**
   * Send one message, optionally at a moment on the `performance.now()` clock. Returns false
   * when there is no port to send to, so callers can report it rather than fail silently.
   */
  send(bytes: number[], at?: number): boolean {
    const port = this.port();
    if (!port) return false;
    try {
      // A time already past is sent straight away by the browser, which is what we want.
      port.send(bytes, at);
      return true;
    } catch {
      return false;
    }
  }

  noteOn(pitch: number, velocity: number, at?: number, channel = this.status.channel): boolean {
    const wire = (channel - 1) & 0x0f;
    const level = Math.min(127, Math.max(1, Math.round(velocity * 127)));
    const note = Math.min(127, Math.max(0, Math.round(pitch)));
    const sounding = this.held.get(wire) ?? new Set<number>();
    sounding.add(note);
    this.held.set(wire, sounding);
    return this.send([0x90 | wire, note, level], at);
  }

  noteOff(pitch: number, at?: number, channel = this.status.channel): boolean {
    const wire = (channel - 1) & 0x0f;
    const note = Math.min(127, Math.max(0, Math.round(pitch)));
    this.held.get(wire)?.delete(note);
    return this.send([0x80 | wire, note, 0], at);
  }

  /**
   * Switch the instrument to a tone: bank select MSB, bank select LSB, then program change,
   * in that order, on the channel it listens to. The instrument needs a moment afterwards
   * before notes play in the new sound; callers wait about a third of a second.
   */
  selectTone(tone: Tone, channel = this.status.channel): boolean {
    const wire = (channel - 1) & 0x0f;
    const program = Math.min(128, Math.max(1, Math.round(tone.program)));
    this.toneSentAt = performance.now();
    return (
      this.send([0xb0 | wire, 0, tone.msb & 0x7f]) &&
      this.send([0xb0 | wire, 32, tone.lsb & 0x7f]) &&
      this.send([0xc0 | wire, program - 1])
    );
  }

  /** Set the instrument's volume for the channel in use (controller 7), 0-127. */
  setVolume(level: number, channel = this.status.channel): boolean {
    const wire = (channel - 1) & 0x0f;
    return this.send([0xb0 | wire, 7, Math.min(127, Math.max(0, Math.round(level)))]);
  }

  /**
   * Hear about tones chosen on the instrument itself. When its panel sends bank select and
   * program change, the choice is reported here, so it can be remembered and sent back
   * later. Instruments that send nothing simply never call back.
   */
  watchTones(onTone: (tone: Tone) => void): () => void {
    const access = this.access;
    if (!access) return () => undefined;
    const bank = new Map<number, { msb: number; lsb: number }>();
    const listener = (event: MIDIMessageEvent) => {
      const data = event.data;
      if (!data || data.length < 2) return;
      const kind = data[0] & 0xf0;
      const wire = data[0] & 0x0f;
      const held = bank.get(wire) ?? { msb: 0, lsb: 0 };
      if (kind === 0xb0 && data[1] === 0) bank.set(wire, { ...held, msb: data[2] });
      else if (kind === 0xb0 && data[1] === 32) bank.set(wire, { ...held, lsb: data[2] });
      else if (kind === 0xc0) {
        // Only a tone from a bank the instrument really has is worth sending back: a bare
        // program change would be stored under bank 0/0 and recalled as a fallback sound.
        // Anything arriving just after a tone was sent from here is its echo, not a choice.
        const known = TONE_BANKS.some((entry) => entry.msb === held.msb && entry.lsb === held.lsb);
        if (known && performance.now() - this.toneSentAt > 1000) onTone({ msb: held.msb, lsb: held.lsb, program: data[1] + 1 });
      }
    };
    const inputs = [...access.inputs.values()];
    for (const input of inputs) input.addEventListener("midimessage", listener);
    return () => {
      for (const input of inputs) input.removeEventListener("midimessage", listener);
    };
  }

  /**
   * Stop everything, now. Sent per channel as explicit note-offs for what we started plus
   * the two "all off" controllers, because instruments vary in which they honour.
   */
  allOff(): void {
    const port = this.port();
    if (!port) {
      this.held.clear();
      return;
    }
    for (const [wire, pitches] of this.held) {
      for (const pitch of pitches) {
        try {
          port.send([0x80 | wire, pitch, 0]);
        } catch {
          /* the port went away mid-panic */
        }
      }
    }
    this.held.clear();
    // Only on the channel in use. Sweeping all sixteen sent 48 messages in one burst. The
    // keyboard's USB port once stopped answering part-way through a session of passes; the
    // sweep was never proven to be the cause, but nothing needs it, so it is not sent.
    const wire = (this.status.channel - 1) & 0x0f;
    try {
      port.send([0xb0 | wire, 64, 0]); // sustain pedal up
      port.send([0xb0 | wire, 123, 0]); // all notes off
    } catch {
      /* the port went away mid-panic */
    }
  }

  /**
   * Hand a stretch of notes to the browser's MIDI stack, each stamped with when it should
   * play. `toClock` turns a position in the song into a moment on the `performance.now()`
   * clock. Notes outside `from`..`to` are left for the next call.
   */
  scheduleNotes(
    notes: { t: number; d: number; p: number; v: number }[],
    from: number,
    to: number,
    toClock: (position: number) => number
  ): number {
    if (!this.ready()) return 0;
    let sent = 0;
    for (const note of notes) {
      if (note.t < from || note.t >= to) continue;
      const on = toClock(note.t);
      // A note is held at least briefly so the instrument always articulates it.
      const off = toClock(note.t + Math.max(0.02, note.d));
      this.noteOn(note.p, note.v, on);
      this.noteOff(note.p, off);
      sent++;
    }
    return sent;
  }

  private update(patch: Partial<MidiOutStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const watcher of this.watchers) watcher();
  }

  /** Re-list outputs after an instrument is plugged in or out, keeping the choice sensible. */
  private refresh(): void {
    const access = this.access;
    if (!access) return;
    const outputs: MidiOutputInfo[] = [];
    for (const output of access.outputs.values()) {
      if (output.state === "disconnected") continue;
      outputs.push({ id: output.id, name: output.name || output.manufacturer || "MIDI output" });
    }
    let selected = this.status.selected || stored(PORT_KEY, "");
    if (!outputs.some((output) => output.id === selected)) {
      // Nothing chosen, or it was unplugged: prefer a real instrument over a software synth.
      const instrument = outputs.find((output) => PREFERRED.test(output.name));
      selected = instrument?.id ?? outputs[0]?.id ?? "";
      if (selected) remember(PORT_KEY, selected);
    }
    this.update({ state: "ready", outputs, selected, channel: storedChannel() });
  }
}

export const midiOutHub = new MidiOutHub();
