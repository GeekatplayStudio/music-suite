/**
 * One connection to the computer's MIDI keyboards for the whole editor (Web MIDI API).
 * Any class-compliant USB keyboard works, Roland included; the browser asks permission once.
 */

export type MidiEvent =
  | { kind: "on"; pitch: number; velocity: number; timeStamp: number }
  | { kind: "off"; pitch: number; timeStamp: number }
  | { kind: "sustain"; down: boolean; timeStamp: number }
  /** Pitch-bend wheel position, -1 to 1. */
  | { kind: "bend"; value: number; timeStamp: number }
  /** Every input went away or changed; anything held must stop. */
  | { kind: "reset"; timeStamp: number };

export interface MidiInputInfo {
  id: string;
  name: string;
}

export interface MidiStatus {
  state: "idle" | "connecting" | "ready" | "unsupported" | "denied";
  inputs: MidiInputInfo[];
  /** "all" listens to every keyboard. */
  selected: string;
}

const STORAGE_KEY = "music-suite:midi-input";

function storedSelection(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "all";
  } catch {
    return "all";
  }
}

class MidiHub {
  private access: MIDIAccess | null = null;
  private pending: Promise<void> | null = null;
  private listeners = new Set<(event: MidiEvent) => void>();
  private watchers = new Set<() => void>();
  private attached = new Set<MIDIInput>();
  private status: MidiStatus = { state: "idle", inputs: [], selected: "all" };
  private static readonly SERVER: MidiStatus = { state: "idle", inputs: [], selected: "all" };

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
    this.update({ state: "connecting", selected: storedSelection() });
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
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* the choice just is not remembered */
    }
    this.update({ selected: id });
    this.refresh();
  }

  /** Note, pedal and bend events from the chosen keyboard(s). */
  subscribe(listener: (event: MidiEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** For useSyncExternalStore. */
  watch = (onChange: () => void): (() => void) => {
    this.watchers.add(onChange);
    return () => this.watchers.delete(onChange);
  };

  snapshot = (): MidiStatus => this.status;
  serverSnapshot = (): MidiStatus => MidiHub.SERVER;

  private update(patch: Partial<MidiStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const watcher of this.watchers) watcher();
  }

  /** Re-list inputs after a keyboard is plugged in or out, and listen to the chosen ones. */
  private refresh(): void {
    const access = this.access;
    if (!access) return;
    const inputs: MidiInputInfo[] = [];
    const wanted = new Set<MIDIInput>();
    for (const input of access.inputs.values()) {
      if (input.state === "disconnected") continue;
      inputs.push({ id: input.id, name: input.name || input.manufacturer || "MIDI input" });
      if (this.status.selected === "all" || this.status.selected === input.id) wanted.add(input);
    }
    let changed = false;
    for (const input of this.attached) {
      if (wanted.has(input)) continue;
      input.removeEventListener("midimessage", this.onMessage);
      this.attached.delete(input);
      changed = true;
    }
    for (const input of wanted) {
      if (this.attached.has(input)) continue;
      input.addEventListener("midimessage", this.onMessage);
      this.attached.add(input);
    }
    // A keyboard that vanished mid-note never sends its note-offs.
    if (changed) this.emit({ kind: "reset", timeStamp: performance.now() });
    this.update({ state: "ready", inputs });
  }

  private onMessage = (event: MIDIMessageEvent): void => {
    const data = event.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const timeStamp = event.timeStamp || performance.now();
    // System messages (clock, active sensing that Roland keyboards send constantly) are ignored.
    if (status === 0x90 && data[2] > 0) this.emit({ kind: "on", pitch: data[1], velocity: data[2] / 127, timeStamp });
    else if (status === 0x80 || (status === 0x90 && data[2] === 0)) this.emit({ kind: "off", pitch: data[1], timeStamp });
    else if (status === 0xb0 && data[1] === 64) this.emit({ kind: "sustain", down: data[2] >= 64, timeStamp });
    else if (status === 0xb0 && (data[1] === 120 || data[1] === 123)) this.emit({ kind: "reset", timeStamp });
    else if (status === 0xe0 && data.length >= 3) {
      const raw = (data[2] << 7) | data[1];
      this.emit({ kind: "bend", value: Math.max(-1, (raw - 8192) / 8191), timeStamp });
    }
  };

  private emit(event: MidiEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export const midiHub = new MidiHub();
