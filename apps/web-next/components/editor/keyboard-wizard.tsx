"use client";

import { Check, CircleDot, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import { HelpLink } from "@/components/help-link";
import type { EditorEngine } from "@/lib/editor/engine";
import { VoicePicker } from "@/components/editor/voice-picker";
import { type Tone, midiOutHub } from "@/lib/editor/midi-out";
import { SING_STYLES, type SingStyle } from "@/lib/editor/singalong";
import { type PartShape, guessInstrumentInput, listAudioInputs, measureRoundTrip } from "@/lib/editor/reamp";
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
  /** How the last pass ended; `count` goes up by one for each pass. */
  passResult: { count: number; silent: boolean; clipped: boolean };
  onPrepare: (clipId: string, source: SourceKind) => Promise<boolean>;
  onStartPass: (options: { trackId: string; deviceId: string; latency: number; shape: PartShape; label: string; replace: boolean }) => void;
  onStopPass: () => void;
  /** Play a part's take back, alone or with the rest of the song. */
  onAudition: (partId: string, alone: boolean) => void;
  onStopAudition: () => void;
  playing: boolean;
  onFinish: (recordedTrackIds: string[], addOnly: boolean) => void;
  /** Write a part that goes with the song; returns its track, or null when it could not be made. */
  onSingAlong: (style: SingStyle) => string | null;
  /** Play the finished song from the start. */
  onPlayResult: () => void;
}

type SourceKind = "song" | "piano" | "instrument" | "voice";
const SOURCES: { id: SourceKind; label: string; hint: string }[] = [
  { id: "song", label: "A full song, or not sure", hint: "Split into vocals, bass, drums and the rest. One instrument on its own is recognised and kept whole." },
  { id: "piano", label: "Just a piano", hint: "Written down directly by the piano model. The most accurate there is." },
  { id: "instrument", label: "One other instrument", hint: "Written down directly, chords included." },
  { id: "voice", label: "One voice or melody line", hint: "Written down as a single line, one note at a time." }
];

type Step = "song" | "keyboard" | "voices" | "record" | "done";
const STEPS: { id: Step; label: string }[] = [
  { id: "song", label: "Song" },
  { id: "keyboard", label: "Keyboard" },
  { id: "voices", label: "Voices" },
  { id: "record", label: "Record" },
  { id: "done", label: "Done" }
];

interface PartChoice extends PartShape {
  include: boolean;
  /** Null leaves the keyboard on whatever sound it is already set to. */
  tone: Tone | null;
}

/**
 * A sung line is one note at a time, held until the next, in a singing octave. Everything
 * else is sent exactly as written. Drums are sent whole.
 */
/** A part the wizard wrote to go with the song, rather than one found in it. */
function isSingAlong(part: WizardPart): boolean {
  return /^Sing-along/.test(part.name);
}

function defaultChoice(part: WizardPart): PartChoice {
  if (isSingAlong(part)) {
    // The keyboard's extra voices are where its character voices live.
    const chords = /chords/i.test(part.name);
    return { include: true, tone: { msb: 71, lsb: 99, program: 1 }, voices: chords ? 3 : 1, octave: chords ? 0 : "auto", length: chords ? "written" : "legato", harmony: false };
  }
  if (part.drums) {
    return { include: false, tone: { msb: 86, lsb: 65, program: 1 }, voices: 0, octave: 0, length: "written", harmony: false };
  }
  // A piano is answered by the keyboard's own piano unless another voice is picked.
  if (/piano/i.test(part.name)) {
    return { include: true, tone: { msb: 71, lsb: 96, program: 1 }, voices: 0, octave: 0, length: "written", harmony: false };
  }
  const line = /vocal|voice|bass|lead/i.test(part.name);
  // Everything else goes over exactly as written: every note, at its own length.
  return { include: true, tone: null, voices: line ? 1 : 0, octave: line ? "auto" : 0, length: line ? "legato" : "written", harmony: false };
}

/** Wait for something to become true, giving up after a while or as soon as the run is cancelled. */
async function waitUntil(cancelled: { current: boolean }, test: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cancelled.current) return false;
    if (test()) return true;
    await wait(100);
  }
  return false;
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
  const [source, setSource] = useState<SourceKind>("song");
  const [replaceToo, setReplaceToo] = useState(false);
  /** "add" writes a new voice to go with the song and replaces nothing; "replace" re-voices the song's own parts. */
  const [goal, setGoal] = useState<"add" | "replace">("add");
  const [style, setStyle] = useState<SingStyle>("tune");
  const addOnly = goal === "add" || !replaceToo;
  const [working, setWorking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [inputId, setInputId] = useState("");
  const [inputName, setInputName] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [choices, setChoices] = useState<Record<string, PartChoice>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  /** One part at a time, each approved before the next; false records every part without stopping. */
  const [stepwise, setStepwise] = useState(true);
  const [queue, setQueue] = useState<string[]>([]);
  const [position, setPosition] = useState(0);
  const [phase, setPhase] = useState<"ready" | "recording" | "review">("ready");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);
  // The recording loop outlives renders, so it reads the latest values through refs.
  const liveRef = useRef({ passRunning, editorBusy, passResult: props.passResult });
  useEffect(() => {
    liveRef.current = { passRunning, editorBusy, passResult: props.passResult };
  }, [passRunning, editorBusy, props.passResult]);

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

  // Adding a voice records only the part written for it; replacing records the ticked parts of the song.
  const wanted = (part: WizardPart) => (goal === "add" ? isSingAlong(part) : choiceOf(part).include && !isSingAlong(part));

  const fail = (err: unknown, fallback: string) => setProblem(err instanceof Error ? err.message : fallback);

  /* ---------- Step 1: the song ---------- */

  const prepare = async (clipId: string) => {
    setProblem(null);
    setWorking("Splitting the song and writing its notes. A three-minute song takes a few minutes.");
    const ok = await props.onPrepare(clipId, source);
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

  /* ---------- Step 4: recording every part ---------- */

  const until = (test: () => boolean, timeoutMs: number) => waitUntil(cancelRef, test, timeoutMs);

  /** One part through the keyboard, with its voice and settings as they stand now. */
  const recordOne = async (part: WizardPart): Promise<"ok" | "silent" | "stopped"> => {
    if (latency === null) return "stopped";
    const choice = choiceOf(part);
    setCurrent(part.id);
    // The save of the pass before must be over, or two edits would land on top of each other.
    if (!(await until(() => !liveRef.current.passRunning && !liveRef.current.editorBusy, 120_000))) return "stopped";
    if (choice.tone) {
      midiOutHub.selectTone(choice.tone);
      await wait(450);
    }
    const before = liveRef.current.passResult.count;
    const plain = part.name.replace(/ \(MIDI\)$/, "");
    props.onStartPass({
      trackId: part.id,
      deviceId: inputId,
      latency,
      shape: { voices: choice.voices, octave: choice.octave, length: choice.length, harmony: choice.harmony },
      label: choice.harmony ? `${plain} harmony` : plain,
      // A part recorded a second time replaces its first take.
      replace: true
    });
    if (!(await until(() => liveRef.current.passRunning, 25_000))) {
      if (!cancelRef.current) setProblem(`The pass for ${part.name} did not start. The message at the top of the editor says why.`);
      return "stopped";
    }
    // A pass ends itself when its part has played; an hour is only a backstop.
    if (!(await until(() => !liveRef.current.passRunning, 3_600_000))) return "stopped";
    await until(() => liveRef.current.passResult.count > before, 5000);
    if (liveRef.current.passResult.silent) {
      setProblem(
        `The keyboard made no sound for ${plain}. Its MIDI connection has stopped answering: ` +
          "switch the keyboard off and on (or unplug and replug its USB cable), then check the keyboard again."
      );
      setLatency(null);
      return "silent";
    }
    if (liveRef.current.passResult.clipped) {
      setProblem(`${plain} came back too loud and is distorted. Turn the keyboard's volume down a little and record again.`);
    }
    await until(() => !liveRef.current.editorBusy, 120_000);
    return cancelRef.current ? "stopped" : "ok";
  };

  /* One part at a time: record, listen, then keep it, change something and record again, or skip. */

  const startStepwise = () => {
    const ids = parts.filter(wanted).map((part) => part.id);
    if (!ids.length || latency === null) return;
    setProblem(null);
    setRecorded([]);
    setQueue(ids);
    setPosition(0);
    setPhase("ready");
    setStep("record");
  };

  const queued = parts.find((part) => part.id === queue[position]) ?? null;

  const recordQueued = async () => {
    if (!queued) return;
    cancelRef.current = false;
    setProblem(null);
    props.onStopAudition();
    setPhase("recording");
    const result = await recordOne(queued);
    setCurrent(null);
    if (result === "silent") setStep("keyboard");
    setPhase(result === "ok" ? "review" : "ready");
  };

  const moveOn = (keep: boolean) => {
    if (!queued) return;
    props.onStopAudition();
    const kept = keep ? [...recorded.filter((id) => id !== queued.id), queued.id] : recorded;
    setRecorded(kept);
    setProblem(null);
    if (position + 1 < queue.length) {
      setPosition(position + 1);
      setPhase("ready");
    } else if (kept.length) {
      props.onFinish(kept, addOnly);
      setStep("done");
    } else {
      setStep("voices");
    }
  };

  const recordAll = async () => {
    const queue = parts.filter(wanted);
    if (!queue.length || latency === null) return;
    cancelRef.current = false;
    setProblem(null);
    setRecorded([]);
    setStepwise(false);
    setStep("record");
    const finished: string[] = [];
    for (const part of queue) {
      if (cancelRef.current) break;
      // Carrying on after silence would only record more of it, one empty take per part.
      if ((await recordOne(part)) !== "ok") break;
      finished.push(part.id);
      setRecorded([...finished]);
    }
    setCurrent(null);
    await until(() => !liveRef.current.passRunning && !liveRef.current.editorBusy, 120_000);
    if (finished.length) {
      props.onFinish(finished, addOnly);
      setStep("done");
    } else {
      setStep(liveRef.current.passResult.silent ? "keyboard" : "voices");
    }
  };

  const stopAll = () => {
    cancelRef.current = true;
    props.onStopPass();
  };

  /* ---------- Layout ---------- */

  /** A part's voice and how its notes are shaped, shown when choosing voices and again before each take. */
  const settingsFor = (part: WizardPart) => {
    const choice = choiceOf(part);
    return (
                        <div className="flex flex-wrap items-center gap-2 text-[12px]">
                          <VoicePicker
                            tone={choice.tone}
                            allowNone
                            drums={part.drums}
                            label={part.name}
                            onChange={(tone) => setChoice(part, { tone })}
                          />
                          {part.drums ? null : (
                            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 text-slate-400">
                              <label className="flex items-center gap-1">
                                Notes at once
                                <select className={cn(fieldClass, "w-24")} value={choice.voices} onChange={(event) => setChoice(part, { voices: Number(event.target.value) })}>
                                  <option value={1}>1 (melody)</option>
                                  <option value={2}>2</option>
                                  <option value={3}>3</option>
                                  <option value={4}>4</option>
                                  <option value={0}>All</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1">
                                Octave
                                <select
                                  className={cn(fieldClass, "w-32")}
                                  value={String(choice.octave)}
                                  onChange={(event) => setChoice(part, { octave: event.target.value === "auto" ? "auto" : Number(event.target.value) })}
                                >
                                  <option value="auto">Singing range</option>
                                  <option value="2">2 up</option>
                                  <option value="1">1 up</option>
                                  <option value="0">As written</option>
                                  <option value="-1">1 down</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1">
                                Note length
                                <select
                                  className={cn(fieldClass, "w-36")}
                                  value={choice.length}
                                  onChange={(event) => setChoice(part, { length: event.target.value as PartShape["length"] })}
                                >
                                  <option value="legato">Held to the next</option>
                                  <option value="full">Room to speak</option>
                                  <option value="written">As written</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1">
                                <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={choice.harmony} onChange={(event) => setChoice(part, { harmony: event.target.checked })} />
                                Harmony (a third above)
                              </label>
                            </div>
                          )}
                        </div>
    );
  };

  const included = parts.filter(wanted);
  const shown = goal === "add" ? parts.filter(isSingAlong) : parts.filter((part) => !isSingAlong(part));
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
          <HelpLink section="keyboard-wizard" label="the keyboard wizard" />
          <button
            type="button"
            aria-label="Close the wizard"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40"
            disabled={step === "record" && (!stepwise || phase === "recording")}
            onClick={() => {
              props.onStopAudition();
              props.onClose();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {step === "song" ? (
            <>
              <p className="text-slate-300">Say what the recording is, then choose it. Its notes are written out with the settings that measured best.</p>
              <div className="grid grid-cols-2 gap-2">
                {SOURCES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={source === entry.id}
                    onClick={() => setSource(entry.id)}
                    className={cn(
                      "rounded-lg border p-2 text-left text-[12px] transition-colors",
                      source === entry.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/30 hover:border-white/30"
                    )}
                  >
                    <span className="block font-semibold text-slate-100">{entry.label}</span>
                    <span className="text-slate-400">{entry.hint}</span>
                  </button>
                ))}
              </div>
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
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: "add", label: "Add a voice to the song", hint: "The song stays as it is. A new part is written to go with it and the keyboard sings it on top." },
                    { id: "replace", label: "Re-voice the song's parts", hint: "The song's own parts are played by the keyboard in voices you choose." }
                  ] as const
                ).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={goal === entry.id}
                    onClick={() => setGoal(entry.id)}
                    className={cn(
                      "rounded-lg border p-2 text-left text-[12px] transition-colors",
                      goal === entry.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/30 hover:border-white/30"
                    )}
                  >
                    <span className="block font-semibold text-slate-100">{entry.label}</span>
                    <span className="text-slate-400">{entry.hint}</span>
                  </button>
                ))}
              </div>
              {goal === "add" ? (
                <div className="space-y-2 rounded-lg bg-black/30 p-3 text-[12px]">
                  <p className="text-slate-300">
                    What should the new voice do? It is written from the song&apos;s own notes, so it is in its key, on its beat and follows its chords.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className={cn(fieldClass, "w-44")} aria-label="What the new voice does" value={style} onChange={(event) => setStyle(event.target.value as SingStyle)}>
                      {SING_STYLES.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <ActionButton
                      variant={shown.length ? "secondary" : "primary"}
                      onClick={() => {
                        setProblem(null);
                        if (!props.onSingAlong(style)) setProblem("The new part could not be written: the song has no notes to build it from.");
                      }}
                    >
                      {shown.length ? "Write it again" : "Write the sing-along part"}
                    </ActionButton>
                  </div>
                  <p className="text-slate-400">{SING_STYLES.find((entry) => entry.id === style)?.hint}</p>
                </div>
              ) : (
                <>
                  <p className="text-slate-300">
                    Tick the parts the keyboard should play and give each a voice: pick a bank, then step through its sounds or type a number, or
                    click a part and press a sound button on the keyboard itself.
                  </p>
                  <label className="flex items-start gap-2 rounded-lg bg-black/30 p-3 text-[12px]">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-cyan-400" checked={replaceToo} onChange={(event) => setReplaceToo(event.target.checked)} />
                    <span>
                      <span className="font-semibold text-slate-100">Silence what the keyboard replaces.</span>{" "}
                      <span className="text-slate-400">Left unticked, the original keeps playing in full under the keyboard&apos;s takes.</span>
                    </span>
                  </label>
                </>
              )}
              <ul className="space-y-2">
                {shown.map((part) => {
                  const choice = choiceOf(part);
                  return (
                    <li
                      key={part.id}
                      onPointerDown={() => setFocus(part.id)}
                      className={cn("space-y-2 rounded-lg border bg-black/30 p-3", focus === part.id ? "border-cyan-400/60" : "border-transparent")}
                    >
                      <label className="flex items-center gap-2 font-semibold">
                        {goal === "add" ? null : (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-cyan-400"
                            checked={choice.include}
                            onChange={(event) => setChoice(part, { include: event.target.checked })}
                          />
                        )}
                        {part.name.replace(/ \(MIDI\)$/, "")}
                        <span className="font-normal text-slate-400">{part.noteCount} notes</span>
                      </label>
                      {choice.include || goal === "add" ? (
                        settingsFor(part)
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {step === "record" && stepwise && queued ? (
            <>
              <p className="text-slate-300">
                Part {position + 1} of {queue.length}. Record it, listen, and keep it only when you like it. Change the voice or the settings and
                record again as often as you want; the new take replaces the old one.
              </p>
              <div className="space-y-2 rounded-lg border border-cyan-400/40 bg-black/30 p-3">
                <p className="flex items-center gap-2 font-semibold text-slate-100">
                  {phase === "recording" ? <CircleDot className="h-3.5 w-3.5 animate-pulse text-rose-300" /> : null}
                  {queued.name.replace(/ \(MIDI\)$/, "")}
                  <span className="font-normal text-slate-400">
                    {phase === "recording" ? (passRunning ? "playing and recording…" : "getting ready…") : phase === "review" ? "recorded: listen to it" : `${queued.noteCount} notes`}
                  </span>
                </p>
                {phase === "recording" ? null : settingsFor(queued)}
                <div className="flex flex-wrap gap-2 pt-1">
                  {phase === "ready" ? (
                    <>
                      <ActionButton variant="primary" onClick={() => void recordQueued()}>
                        Record this part
                      </ActionButton>
                      <ActionButton onClick={() => moveOn(false)}>Skip it</ActionButton>
                    </>
                  ) : null}
                  {phase === "recording" ? (
                    <ActionButton variant="danger" onClick={stopAll}>
                      Stop
                    </ActionButton>
                  ) : null}
                  {phase === "review" ? (
                    <>
                      {props.playing ? (
                        <ActionButton onClick={props.onStopAudition}>Stop playing</ActionButton>
                      ) : (
                        <>
                          <ActionButton onClick={() => props.onAudition(queued.id, true)}>Hear it alone</ActionButton>
                          <ActionButton onClick={() => props.onAudition(queued.id, false)}>Hear it with the song</ActionButton>
                        </>
                      )}
                      <ActionButton onClick={() => void recordQueued()}>Record again</ActionButton>
                      <ActionButton variant="primary" onClick={() => moveOn(true)}>
                        {position + 1 < queue.length ? "Keep it, next part" : "Keep it and finish"}
                      </ActionButton>
                    </>
                  ) : null}
                </div>
              </div>
              <ul className="space-y-1 rounded-lg bg-black/30 p-3 text-[12px]">
                {queue.map((id, index) => {
                  const part = parts.find((entry) => entry.id === id);
                  if (!part) return null;
                  return (
                    <li key={id} className="flex items-center gap-2">
                      {recorded.includes(id) ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-600" />}
                      <span className={index === position ? "font-semibold text-slate-100" : "text-slate-300"}>{part.name.replace(/ \(MIDI\)$/, "")}</span>
                      <span className="text-slate-500">{recorded.includes(id) ? "kept" : index === position ? "now" : index < position ? "skipped" : "waiting"}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {step === "record" && !stepwise ? (
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
                Each take is on its own track, named after its part. The note tracks are muted.{" "}
                {addOnly
                  ? "Nothing else was changed: the original plays in full with the keyboard voices on top."
                  : "What the keyboard replaced is muted too; everything it did not replace still plays."}{" "}
                Adjust the faders and export from the editor as usual.
              </p>
              <ActionButton variant="primary" onClick={props.onPlayResult}>
                Play the result
              </ActionButton>
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
            disabled={step === "song" || (step === "record" && (!stepwise || phase === "recording")) || working !== null}
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
            <div className="flex gap-2">
              <ActionButton disabled={!included.length || latency === null} onClick={() => void recordAll()}>
                Record all without stopping
              </ActionButton>
              <ActionButton
                variant="primary"
                disabled={!included.length || latency === null}
                onClick={() => {
                  setStepwise(true);
                  startStepwise();
                }}
              >
                Record one part at a time
              </ActionButton>
            </div>
          ) : null}
          {step === "record" && !stepwise ? (
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
