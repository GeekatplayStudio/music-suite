"use client";

import { Cable, CircleCheck, CircleDot, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, IconButton, fieldClass } from "@/components/editor/controls";
import type { EditorEngine } from "@/lib/editor/engine";
import { midiOutHub } from "@/lib/editor/midi-out";
import { type AudioInputInfo, guessInstrumentInput, listAudioInputs, measureRoundTrip, peakOf } from "@/lib/editor/reamp";
import { cn } from "@/lib/utils";

const INPUT_KEY = "music-suite:reamp-input";

export interface ReampTrack {
  id: string;
  name: string;
  noteCount: number;
}

interface ReampPanelProps {
  engine: EditorEngine;
  /** Tracks that have notes to send; only these can be played out. */
  tracks: ReampTrack[];
  selectedTrackId: string | null;
  /** True while a pass is recording, so the panel offers to stop instead of start. */
  passRunning: boolean;
  disabled: boolean;
  onStartPass: (options: { trackId: string; deviceId: string; latency: number }) => void;
  onStopPass: () => void;
}

function storedInput(): string {
  try {
    return window.localStorage.getItem(INPUT_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Setting up and running a pass through a hardware keyboard: choose the ports, check the
 * sound goes out and comes back, measure the delay, then play a track out and record it.
 */
export function ReampPanel({
  engine,
  tracks,
  selectedTrackId,
  passRunning,
  disabled,
  onStartPass,
  onStopPass
}: ReampPanelProps) {
  const out = useSyncExternalStore(midiOutHub.watch, midiOutHub.snapshot, midiOutHub.serverSnapshot);
  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState<AudioInputInfo[]>([]);
  const [inputId, setInputId] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const chosenTrack = tracks.find((track) => track.id === (trackId ?? selectedTrackId)) ?? null;

  useEffect(() => {
    void midiOutHub.connectIfAllowed();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /** Device labels only arrive once recording has been allowed, so ask first, then list. */
  const refreshInputs = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch {
      setNote({ tone: "warn", text: "Audio input was refused. Allow it for this page, then press Find inputs again." });
      return;
    }
    const found = await listAudioInputs();
    setInputs(found);
    const remembered = storedInput();
    const pick = found.some((input) => input.deviceId === remembered) ? remembered : guessInstrumentInput(found);
    setInputId(pick);
    setNote(found.length ? null : { tone: "warn", text: "No audio inputs were found." });
  };

  const chooseInput = (id: string) => {
    setInputId(id);
    setLatency(null);
    try {
      window.localStorage.setItem(INPUT_KEY, id);
    } catch {
      /* the choice just is not remembered */
    }
  };

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(label);
    setNote(null);
    try {
      await job();
    } catch (err) {
      setNote({ tone: "warn", text: err instanceof Error ? err.message : "That did not work." });
    }
    setBusy(null);
  };

  const testOut = () =>
    run("Playing a note…", async () => {
      if (!midiOutHub.ready()) throw new Error("Choose the keyboard's MIDI output first.");
      // A short rising figure is unmistakable even on a sustained voice.
      for (const [index, pitch] of [60, 64, 67].entries()) {
        window.setTimeout(() => midiOutHub.noteOn(pitch, 0.8), index * 220);
        window.setTimeout(() => midiOutHub.noteOff(pitch), index * 220 + 400);
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
      setNote({ tone: "ok", text: "Three notes were sent. If you heard nothing, check the channel and the keyboard's volume." });
    });

  const testIn = () =>
    run("Listening…", async () => {
      const take = await engine.captureProbe(1.5, { deviceId: inputId || undefined });
      const peak = peakOf(take.channels);
      const db = peak > 0 ? 20 * Math.log10(peak) : -120;
      setNote(
        peak > 0.004
          ? { tone: "ok", text: `Heard the input at ${db.toFixed(1)} dBFS peak. Play the keyboard while testing to see it rise.` }
          : { tone: "warn", text: "That input is silent. Check it is the keyboard's own output and that its volume is up." }
      );
    });

  const calibrate = () =>
    run("Measuring the round trip…", async () => {
      const measured = await measureRoundTrip(engine, { deviceId: inputId || undefined });
      setLatency(measured.seconds);
      setNote({
        tone: "ok",
        text: `Round trip is ${(measured.seconds * 1000).toFixed(1)} ms. Recordings are shifted back by this so they land in time.`
      });
    });

  const ready = out.state === "ready";
  const connected = midiOutHub.ready();
  const canPass = connected && inputId !== "" && latency !== null && chosenTrack !== null && !disabled;

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        label={connected ? `Play out to ${out.outputs.find((o) => o.id === out.selected)?.name ?? "a keyboard"}` : "Play a part out to a hardware keyboard"}
        active={open}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Cable className="h-4 w-4" />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full",
            passRunning ? "bg-rose-400" : connected ? "bg-emerald-400 opacity-60" : "bg-slate-500 opacity-40"
          )}
        />
      </IconButton>

      {open ? (
        <div
          role="dialog"
          aria-label="Play out to a hardware keyboard"
          className="absolute left-0 top-11 z-50 w-96 space-y-3 rounded-xl border border-white/10 bg-slate-900 p-3 text-[11px] text-slate-300 shadow-2xl"
        >
          <div>
            <h3 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-200">Play out to a keyboard</h3>
            <p className="mt-1 leading-snug text-slate-400">
              Sends one track&apos;s notes to the keyboard and records the sound it makes back onto the timeline, in its own voices.
            </p>
          </div>

          {/* ---- MIDI out ---- */}
          <div className="space-y-2 rounded-lg bg-black/30 p-2">
            <p className="font-semibold text-slate-200">1. MIDI out</p>
            {!ready ? (
              <ActionButton variant="primary" className="w-full" disabled={out.state === "connecting"} onClick={() => void midiOutHub.connect()}>
                {out.state === "connecting" ? "Waiting for permission…" : "Connect"}
              </ActionButton>
            ) : (
              <>
                <label className="block text-slate-400">
                  Keyboard
                  <select
                    className={`${fieldClass} mt-1`}
                    value={out.selected}
                    onChange={(event) => midiOutHub.select(event.target.value)}
                    aria-label="MIDI output"
                  >
                    {out.outputs.length ? null : <option value="">No MIDI outputs found</option>}
                    {out.outputs.map((output) => (
                      <option key={output.id} value={output.id}>
                        {output.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-slate-400">
                  Channel
                  <select
                    className={`${fieldClass} mt-1`}
                    value={out.channel}
                    onChange={(event) => midiOutHub.setChannel(Number(event.target.value))}
                    aria-label="MIDI channel"
                  >
                    {Array.from({ length: 16 }, (_value, index) => index + 1).map((channel) => (
                      <option key={channel} value={channel}>
                        {channel}
                        {channel === 4 ? " — GO:KEYS 3" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <ActionButton className="w-full" disabled={busy !== null || !connected} onClick={() => void testOut()}>
                  Test out: play three notes
                </ActionButton>
              </>
            )}
          </div>

          {/* ---- Audio in ---- */}
          <div className="space-y-2 rounded-lg bg-black/30 p-2">
            <p className="font-semibold text-slate-200">2. Audio in</p>
            {inputs.length ? (
              <label className="block text-slate-400">
                The keyboard&apos;s sound comes in on
                <select className={`${fieldClass} mt-1`} value={inputId} onChange={(event) => chooseInput(event.target.value)} aria-label="Audio input">
                  {inputs.map((input) => (
                    <option key={input.deviceId} value={input.deviceId}>
                      {input.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="leading-snug text-slate-400">Connect the keyboard by USB, then find its audio input.</p>
            )}
            <div className="flex gap-2">
              <ActionButton className="flex-1" disabled={busy !== null} onClick={() => void refreshInputs()}>
                Find inputs
              </ActionButton>
              <ActionButton className="flex-1" disabled={busy !== null || !inputs.length} onClick={() => void testIn()}>
                Test in
              </ActionButton>
            </div>
          </div>

          {/* ---- Timing ---- */}
          <div className="space-y-2 rounded-lg bg-black/30 p-2">
            <p className="font-semibold text-slate-200">3. Timing</p>
            <p className="leading-snug text-slate-400">
              The keyboard answers a few tens of milliseconds late. Measuring that once lets every pass land in time.
            </p>
            <div className="flex items-center gap-2">
              <ActionButton className="flex-1" disabled={busy !== null || !connected || !inputs.length} onClick={() => void calibrate()}>
                Measure the delay
              </ActionButton>
              <span className="w-20 text-right font-mono tabular-nums text-slate-200">
                {latency === null ? "—" : `${(latency * 1000).toFixed(1)} ms`}
              </span>
            </div>
          </div>

          {/* ---- The pass ---- */}
          <div className="space-y-2 rounded-lg bg-black/30 p-2">
            <p className="font-semibold text-slate-200">4. Record a pass</p>
            <p className="leading-snug text-slate-400">
              Choose the voice <strong className="text-slate-200">by hand on the keyboard</strong> first. Program change does not pick
              its tones, so nothing of the sort is sent. One part per pass.
            </p>
            {tracks.length ? (
              <label className="block text-slate-400">
                Part to play out
                <select
                  className={`${fieldClass} mt-1`}
                  value={chosenTrack?.id ?? ""}
                  onChange={(event) => setTrackId(event.target.value)}
                  aria-label="Track to play out"
                >
                  {tracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name} ({track.noteCount} notes)
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="leading-snug text-slate-400">No track has notes yet. Split the song and turn a stem into MIDI first.</p>
            )}
            {passRunning ? (
              <ActionButton variant="danger" className="w-full" onClick={onStopPass}>
                Stop the pass
              </ActionButton>
            ) : (
              <ActionButton
                variant="primary"
                className="w-full"
                disabled={!canPass || busy !== null}
                onClick={() => {
                  if (!chosenTrack) return;
                  setOpen(false);
                  onStartPass({ trackId: chosenTrack.id, deviceId: inputId, latency: latency ?? 0 });
                }}
              >
                Record {chosenTrack ? chosenTrack.name : "the part"} through the keyboard
              </ActionButton>
            )}
            {!canPass && !passRunning ? (
              <p className="leading-snug text-slate-500">
                {!connected
                  ? "Connect a MIDI output first."
                  : !inputs.length
                    ? "Find the keyboard's audio input first."
                    : latency === null
                      ? "Measure the delay first."
                      : !chosenTrack
                        ? "Pick a part with notes."
                        : "Waiting for the editor."}
              </p>
            ) : null}
          </div>

          {busy ? <p className="text-cyan-300">{busy}</p> : null}
          {note ? (
            <p className={cn("flex items-start gap-1.5 leading-snug", note.tone === "ok" ? "text-emerald-300" : "text-amber-300")}>
              {note.tone === "ok" ? <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />}
              {note.text}
            </p>
          ) : null}
          {passRunning ? (
            <p className="flex items-center gap-1.5 text-rose-300">
              <CircleDot className="h-3.5 w-3.5 shrink-0 animate-pulse" />
              Recording the keyboard. It stops on its own at the end of the part.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
