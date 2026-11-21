"use client";

import { Check, CircleDot, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import type { EditorEngine } from "@/lib/editor/engine";
import { TONE_BANKS, type Tone, midiOutHub } from "@/lib/editor/midi-out";
import { guessInstrumentInput, listAudioInputs, measureRoundTrip } from "@/lib/editor/reamp";
import { cn } from "@/lib/utils";

export interface WizardPart {
  id: string;
  name: string;
  noteCount: number;
  drums: boolean;
}

interface KeyboardWizardProps {
  engine: EditorEngine;
  /** Audio clips on the timeline that could be the song. */
  songs: { clipId: string; name: string }[];
  /** Tracks holding notes: the parts that can be played out. */
  parts: WizardPart[];
  /** What the editor is working on right now, for the progress line; null when idle. */
  progress: { title: string; fraction: number; detail: string } | null;
  passRunning: boolean;
  /** True while the editor is saving or importing, when a new pass must wait. */
  editorBusy: boolean;
  onClose: () => void;
  onImport: (file: File) => Promise<string | null>;
  onPrepare: (clipId: string) => Promise<boolean>;
  onStartPass: (options: { trackId: string; deviceId: string; latency: number; maxVoices: number }) => void;
  onStopPass: () => void;
  onFinish: (recordedTrackIds: string[]) => void;
}

type Step = "song" | "keyboard" | "voices" | "record" | "done";
const STEPS: { id: Step; label: string }[] = [
  { id: "song", label: "Song" },
  { id: "keyboard", label: "Keyboard" },
  { id: "voices", label: "Voices" },
  { id: "record", label: "Record" },
  { id: "done", label: "Done" }
];

interface PartChoice {
  include: boolean;
  /** Null leaves the keyboard on whatever sound it is already set to. */
  tone: Tone | null;
  /** Most notes at once; 0 sends the part as written. */
  voices: number;
}

/** A melody line reads best one note at a time; chords need a few; drums are sent whole. */
function defaultChoice(part: WizardPart): PartChoice {
  if (part.drums) return { include: false, tone: { msb: 86, lsb: 65, program: 1 }, voices: 0 };
  const line = /vocal|bass|lead/i.test(part.name);
  return { include: true, tone: null, voices: line ? 1 : 3 };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The whole trip in one place: a song goes in, is split and written out as notes, each part
 * is played by the keyboard in a chosen voice and recorded, and the takes are left mixed
 * with what was not replaced. Every step says what it is doing while it does it.
 */
export function KeyboardWizard(props: KeyboardWizardProps) {
  const { engine, songs, parts, progress, passRunning, editorBusy } = props;
  const out = useSyncExternalStore(midiOutHub.watch, midiOutHub.snapshot, midiOutHub.serverSnapshot);
  const [step, setStep] = useState<Step>(parts.length ? "keyboard" : "song");
  const [songId, setSongId] = useState<string>(songs[0]?.clipId ?? "");
  const [working, setWorking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [inputId, setInputId] = useState("");
  const [inputName, setInputName] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [choices, setChoices] = useState<Record<string, PartChoice>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);
  // The recording loop outlives renders, so it reads the latest values through refs.
  const liveRef = useRef({ passRunning, editorBusy });
  useEffect(() => {
    liveRef.current = { passRunning, editorBusy };
  }, [passRunning, editorBusy]);

  const choiceOf = (part: WizardPart): PartChoice => choices[part.id] ?? defaultChoice(part);
  const setChoice = (part: WizardPart, patch: Partial<PartChoice>) =>
    setChoices((prev) => ({ ...prev, [part.id]: { ...(prev[part.id] ?? defaultChoice(part)), ...patch } }));

  // A sound picked on the keyboard's own panel is taken for the part being set up, when the
  // keyboard reports it.
  const focusRef = useRef<WizardPart | null>(null);
  useEffect(() => {
    focusRef.current = parts.find((part) => part.id === focus) ?? null;
  }, [focus, parts]);
  useEffect(() => {
    if (out.state !== "ready") return;
    return midiOutHub.watchTones((tone) => {
      const part = focusRef.current;
      if (part) setChoices((prev) => ({ ...prev, [part.id]: { ...(prev[part.id] ?? defaultChoice(part)), tone } }));
    });
  }, [out.state]);

  const fail = (err: unknown, fallback: string) => setProblem(err instanceof Error ? err.message : fallback);

  /* ---------- Step 1: the song ---------- */

  const prepare = async (clipId: string) => {
    setProblem(null);
    setWorking("Splitting the song and writing its notes. A three-minute song takes a few minutes.");
    const ok = await props.onPrepare(clipId);
    setWorking(null);
    if (ok) setStep("keyboard");
    else setProblem("The song could not be prepared. The message at the top of the editor says why.");
  };

  const loadFile = async (file: File) => {
    setProblem(null);
    setWorking(`Loading ${file.name}…`);
    const clipId = await props.onImport(file);
    setWorking(null);
    if (!clipId) {
      setProblem("That file could not be read as audio.");
      return;
    }
    setSongId(clipId);
    await prepare(clipId);
  };

  /* ---------- Step 2: the keyboard ---------- */

  const checkKeyboard = async () => {
    setProblem(null);
    try {
      setWorking("Connecting to the keyboard's MIDI…");
      await midiOutHub.connect();
      if (!midiOutHub.ready()) throw new Error("No keyboard was found on MIDI. Plug it in by USB, switch it on, and allow MIDI for this page.");
      setWorking("Finding the keyboard's audio input…");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) track.stop();
      } catch {
        throw new Error("Audio input was refused. Allow the microphone for this page; the keyboard's sound arrives that way.");
      }
      const inputs = await listAudioInputs();
      const chosen = guessInstrumentInput(inputs);
      if (!chosen) throw new Error("No audio input was found.");
      setInputId(chosen);
      setInputName(inputs.find((input) => input.deviceId === chosen)?.label ?? "audio input");
      setWorking("Playing a test note and timing its return…");
      const measured = await measureRoundTrip(engine, { deviceId: chosen });
      setLatency(measured.seconds);
    } catch (err) {
      setLatency(null);
      fail(err, "The keyboard check failed.");
    }
    setWorking(null);
  };

  /* ---------- Step 3: voices ---------- */

  const audition = async (part: WizardPart) => {
    const tone = choiceOf(part).tone;
    if (tone) {
      midiOutHub.selectTone(tone);
      await wait(350);
    }
    const phrase = part.drums ? [36, 38, 42, 38] : [60, 64, 67];
    phrase.forEach((pitch, index) => {
      window.setTimeout(() => midiOutHub.noteOn(pitch, 0.8), index * 230);
      window.setTimeout(() => midiOutHub.noteOff(pitch), index * 230 + 200);
    });
  };

  const stepTone = (part: WizardPart, by: number) => {
    const tone = choiceOf(part).tone ?? { msb: TONE_BANKS[0].msb, lsb: TONE_BANKS[0].lsb, program: 1 };
    const bank = TONE_BANKS.find((b) => b.msb === tone.msb && b.lsb === tone.lsb) ?? TONE_BANKS[0];
    const program = ((tone.program - 1 + by + bank.programs) % bank.programs) + 1;
    const next = { msb: bank.msb, lsb: bank.lsb, program };
    setChoice(part, { tone: next });
    midiOutHub.selectTone(next);
    window.setTimeout(() => midiOutHub.noteOn(part.drums ? 38 : 60, 0.8), 350);
    window.setTimeout(() => midiOutHub.noteOff(part.drums ? 38 : 60), 750);
  };

  /* ---------- Step 4: recording every part ---------- */

  const until = async (test: () => boolean, timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (cancelRef.current) return false;
      if (test()) return true;
      await wait(100);
    }
    return false;
  };

  const recordAll = async () => {
    const queue = parts.filter((part) => choiceOf(part).include);
    if (!queue.length || latency === null) return;
    cancelRef.current = false;
    setProblem(null);
    setRecorded([]);
    setStep("record");
    const finished: string[] = [];
    for (const part of queue) {
      if (cancelRef.current) break;
      const choice = choiceOf(part);
      setCurrent(part.id);
      // The save of the pass before must be over, or two edits would land on top of each other.
      if (!(await until(() => !liveRef.current.passRunning && !liveRef.current.editorBusy, 120_000))) break;
      if (choice.tone) {
        midiOutHub.selectTone(choice.tone);
        await wait(450);
      }
      props.onStartPass({ trackId: part.id, deviceId: inputId, latency, maxVoices: choice.voices });
      if (!(await until(() => liveRef.current.passRunning, 8000))) {
        if (!cancelRef.current) setProblem(`The pass for ${part.name} did not start. The message at the top of the editor says why.`);
        break;
      }
      // A pass ends itself when its part has played; an hour is only a backstop.
      if (!(await until(() => !liveRef.current.passRunning, 3_600_000))) break;
      finished.push(part.id);
      setRecorded([...finished]);
    }
    setCurrent(null);
    await until(() => !liveRef.current.passRunning && !liveRef.current.editorBusy, 120_000);
    if (finished.length) {
      props.onFinish(finished);
      setStep("done");
    } else {
      setStep("voices");
    }
  };

  const stopAll = () => {
    cancelRef.current = true;
    props.onStopPass();
  };

  /* ---------- Layout ---------- */

  const included = parts.filter((part) => choiceOf(part).include);
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const busyLine = working ?? (progress ? `${progress.title}${progress.detail ? ` — ${progress.detail}` : ""}` : null);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Keyboard wizard">
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-slate-900 text-sm text-slate-200 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <h2 className="display-font text-sm font-semibold uppercase tracking-wider">Keyboard wizard</h2>
          <ol className="flex flex-1 items-center gap-1 text-[11px]">
            {STEPS.map((entry, index) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded-full px-2 py-0.5",
                  index === stepIndex ? "bg-cyan-400 font-semibold text-slate-950" : index < stepIndex ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                )}
              >
                {index + 1}. {entry.label}
              </li>
            ))}
          </ol>
          <button
            type="button"
            aria-label="Close the wizard"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40"
            disabled={step === "record"}
            onClick={props.onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {step === "song" ? (
            <>
              <p className="text-slate-300">
                Choose the song. It is split into its instruments and each one is written out as notes, with the settings that measured best. Nothing
                else to set.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void loadFile(file);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="primary" disabled={working !== null} onClick={() => fileRef.current?.click()}>
                  Load a song file…
                </ActionButton>
              </div>
              {songs.length ? (
                <div className="space-y-2 rounded-lg bg-black/30 p-3">
                  <p className="text-[12px] text-slate-400">Or use a song already on the timeline:</p>
                  <div className="flex gap-2">
                    <select className={fieldClass} value={songId} onChange={(event) => setSongId(event.target.value)} aria-label="Song on the timeline">
                      {songs.map((song) => (
                        <option key={song.clipId} value={song.clipId}>
                          {song.name}
                        </option>
                      ))}
                    </select>
                    <ActionButton disabled={working !== null || !songId} onClick={() => void prepare(songId)}>
                      Use this
                    </ActionButton>
                  </div>
                </div>
              ) : null}
              {parts.length ? (
                <ActionButton disabled={working !== null} onClick={() => setStep("keyboard")}>
                  Skip: this session already has {parts.length} parts written as notes
                </ActionButton>
              ) : null}
            </>
          ) : null}

          {step === "keyboard" ? (
            <>
              <p className="text-slate-300">
                Plug the keyboard in by USB and switch it on, with its volume about three-quarters up. One button finds it, plays a test note and
                times how long the sound takes to come back.
              </p>
              <ActionButton variant="primary" disabled={working !== null} onClick={() => void checkKeyboard()}>
                {latency === null ? "Check the keyboard" : "Check again"}
              </ActionButton>
              {latency !== null ? (
                <ul className="space-y-1 rounded-lg bg-black/30 p-3 text-[12px]">
                  <li className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> MIDI out: {out.outputs.find((o) => o.id === out.selected)?.name ?? "keyboard"}, channel {out.channel}
                  </li>
                  <li className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Audio in: {inputName}
                  </li>
                  <li className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Round trip: {(latency * 1000).toFixed(1)} ms, corrected automatically
                  </li>
                </ul>
              ) : null}
            </>
          ) : null}

          {step === "voices" ? (
            <>
              <p className="text-slate-300">
                Tick the parts the keyboard should play and give each a voice. Step through the keyboard&apos;s sounds with the arrows and listen, or
                click a part and press a sound button on the keyboard itself. Parts are recorded one after another, each in its own voice.
              </p>
              <ul className="space-y-2">
                {parts.map((part) => {
                  const choice = choiceOf(part);
                  const bank = choice.tone ? TONE_BANKS.find((b) => b.msb === choice.tone?.msb && b.lsb === choice.tone?.lsb) : null;
                  return (
                    <li
                      key={part.id}
                      onPointerDown={() => setFocus(part.id)}
                      className={cn("space-y-2 rounded-lg border bg-black/30 p-3", focus === part.id ? "border-cyan-400/60" : "border-transparent")}
                    >
                      <label className="flex items-center gap-2 font-semibold">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-400"
                          checked={choice.include}
                          onChange={(event) => setChoice(part, { include: event.target.checked })}
                        />
                        {part.name.replace(/ \(MIDI\)$/, "")}
                        <span className="font-normal text-slate-400">{part.noteCount} notes</span>
                      </label>
                      {choice.include ? (
                        <div className="flex flex-wrap items-center gap-2 text-[12px]">
                          <select
                            className={cn(fieldClass, "w-48")}
                            aria-label={`Sound bank for ${part.name}`}
                            value={choice.tone ? `${choice.tone.msb}/${choice.tone.lsb}` : ""}
                            onChange={(event) => {
                              if (!event.target.value) return setChoice(part, { tone: null });
                              const [msb, lsb] = event.target.value.split("/").map(Number);
                              setChoice(part, { tone: { msb, lsb, program: 1 } });
                            }}
                          >
                            <option value="">Keyboard&apos;s current sound</option>
                            {TONE_BANKS.map((entry) => (
                              <option key={entry.label} value={`${entry.msb}/${entry.lsb}`}>
                                {entry.label}
                              </option>
                            ))}
                            {choice.tone && !bank ? <option value={`${choice.tone.msb}/${choice.tone.lsb}`}>From the keyboard ({choice.tone.msb}/{choice.tone.lsb})</option> : null}
                          </select>
                          <ActionButton aria-label="Previous sound" disabled={!midiOutHub.ready()} onClick={() => stepTone(part, -1)}>
                            ◀
                          </ActionButton>
                          <span className="w-10 text-center font-mono tabular-nums">{choice.tone ? choice.tone.program : "—"}</span>
                          <ActionButton aria-label="Next sound" disabled={!midiOutHub.ready()} onClick={() => stepTone(part, 1)}>
                            ▶
                          </ActionButton>
                          <ActionButton disabled={!midiOutHub.ready()} onClick={() => void audition(part)}>
                            Listen
                          </ActionButton>
                          {part.drums ? null : (
                            <label className="flex items-center gap-1 text-slate-400">
                              Notes at once
                              <select
                                className={cn(fieldClass, "w-24")}
                                value={choice.voices}
                                onChange={(event) => setChoice(part, { voices: Number(event.target.value) })}
                              >
                                <option value={1}>1 (melody)</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                                <option value={0}>All</option>
                              </select>
                            </label>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {step === "record" ? (
            <>
              <p className="text-slate-300">Recording each part through the keyboard. Leave the keyboard alone until this finishes.</p>
              <ul className="space-y-1 rounded-lg bg-black/30 p-3 text-[12px]">
                {included.map((part) => (
                  <li key={part.id} className="flex items-center gap-2">
                    {recorded.includes(part.id) ? (
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                    ) : current === part.id ? (
                      <CircleDot className="h-3.5 w-3.5 animate-pulse text-rose-300" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-slate-600" />
                    )}
                    <span className={current === part.id ? "font-semibold text-slate-100" : "text-slate-300"}>{part.name.replace(/ \(MIDI\)$/, "")}</span>
                    <span className="text-slate-500">
                      {recorded.includes(part.id) ? "recorded" : current === part.id ? (passRunning ? "playing and recording…" : "getting ready…") : "waiting"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <p className="flex items-center gap-2 text-emerald-300">
                <Check className="h-4 w-4" /> {recorded.length} part{recorded.length === 1 ? "" : "s"} recorded through the keyboard and placed in time.
              </p>
              <p className="text-slate-300">
                Each take is on its own track, named after its part. The note tracks and the stems the keyboard replaced are muted; everything it did
                not replace still plays. Press play to hear the result, adjust the faders, and export from the editor as usual.
              </p>
            </>
          ) : null}

          {busyLine ? (
            <div className="space-y-1 rounded-lg bg-cyan-400/10 p-3 text-[12px] text-cyan-200">
              <p>{busyLine}</p>
              {progress ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100)}%` }} />
                </div>
              ) : null}
            </div>
          ) : null}
          {problem ? (
            <p className="flex items-start gap-2 rounded-lg bg-amber-400/10 p-3 text-[12px] text-amber-300">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
              {problem}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3">
          <ActionButton
            disabled={step === "song" || step === "record" || working !== null}
            onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].id === "record" ? "voices" : STEPS[Math.max(0, stepIndex - 1)].id)}
          >
            Back
          </ActionButton>
          {step === "keyboard" ? (
            <ActionButton variant="primary" disabled={latency === null || working !== null || !parts.length} onClick={() => setStep("voices")}>
              Next: choose voices
            </ActionButton>
          ) : null}
          {step === "voices" ? (
            <ActionButton variant="primary" disabled={!included.length || latency === null} onClick={() => void recordAll()}>
              Record {included.length} part{included.length === 1 ? "" : "s"} through the keyboard
            </ActionButton>
          ) : null}
          {step === "record" ? (
            <ActionButton variant="danger" onClick={stopAll}>
              Stop
            </ActionButton>
          ) : null}
          {step === "done" ? (
            <ActionButton variant="primary" onClick={props.onClose}>
              Close and listen
            </ActionButton>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
