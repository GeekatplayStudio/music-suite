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
 * * **Program change and bank select do not pick its tones.** Every program from 0 to 127,
 *   under every bank tried, produced the same sound, and the first program change moved it
 *   off the tone chosen on the panel. So nothing of the sort is ever sent from here: the
 *   voice is the one selected by hand on the instrument.
 * * Velocity and the full 0-127 pitch range do get through.
 */

export interface MidiOutputInfo {
  id: string;
  name: string;
}

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
    for (let wire = 0; wire < 16; wire++) {
      try {
        port.send([0xb0 | wire, 64, 0]); // sustain pedal up
        port.send([0xb0 | wire, 123, 0]); // all notes off
        port.send([0xb0 | wire, 120, 0]); // all sound off
      } catch {
        return;
      }
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
