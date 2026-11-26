"use client";

import { Check, CircleDot, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import { HelpLink } from "@/components/help-link";
import type { EditorEngine } from "@/lib/editor/engine";
import { VoicePicker } from "@/components/editor/voice-picker";
import { type Tone, midiOutHub } from "@/lib/editor/midi-out";
import { SING_STYLES, type SingStyle } from "@/lib/editor/singalong";
import {
  LAYERS,
  type Layer,
  isMonoTone,
  MIN_VOLUME,
  QUIETER,
  type PartShape,
  ReampError,
  guessInstrumentInput,
  listAudioInputs,
  measureRoundTrip
} from "@/lib/editor/reamp";
import { useI18n } from "@/lib/i18n";
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
  passResult: { count: number; silent: boolean; clipped: boolean; volume: number | null };
  onPrepare: (clipId: string, source: SourceKind) => Promise<boolean>;
  onStartPass: (options: {
    trackId: string;
    deviceId: string;
    latency: number;
    shape: PartShape;
    label: string;
    replace: boolean;
    /** Where this take is filed when a part has several (a layer's own take). */
    takeKey?: string;
    /** A set keyboard volume instead of a measured one (a quieter retry). */
    level?: number;
    managed?: boolean;
  }) => void;
  onStopPass: () => void;
  /** Play a part's take back, alone or with the rest of the song. */
  onAudition: (partId: string, alone: boolean) => void;
  onStopAudition: () => void;
  playing: boolean;
  onFinish: (recordedTrackIds: string[], addOnly: boolean) => void;
  /** Write a part that goes with the song; returns its track, or null when it could not be made. */
  onSingAlong: (styles: SingStyle[]) => string | null;
  /** Play the finished song from the start. */
  onPlayResult: () => void;
}

type SourceKind = "song" | "piano" | "instrument" | "voice";
/** Labels and hints are editorTools.wizard.sources.<id>. */
const SOURCES: SourceKind[] = ["song", "piano", "instrument", "voice"];

type Step = "song" | "keyboard" | "voices" | "record" | "done";
/** Takes of one part before the wizard asks for the keyboard's own volume to come down. */
const MAX_TRIES = 3;

/** Labels are editorTools.wizard.steps.<id>. */
const STEPS: { id: Step }[] = [{ id: "song" }, { id: "keyboard" }, { id: "voices" }, { id: "record" }, { id: "done" }];

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
    const sung = /tune|harmony/i.test(part.name);
    // Every sing-along part is one line: a chord's notes are parts of their own.
    return {
      include: true,
      tone: { msb: 71, lsb: 99, program: 1 },
      voices: 1,
      octave: sung ? "auto" : 0,
      length: sung ? "legato" : "written",
      harmony: false,
      // A character voice says a word per note and plays one note at a time: each word gets
      // long enough to finish, and nothing starts on top of it.
      minLength: sung ? 0.6 : 0,
      overlap: false,
      layers: [],
      mono: true
    };
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
  const { t, tp } = useI18n();
  const out = useSyncExternalStore(midiOutHub.watch, midiOutHub.snapshot, midiOutHub.serverSnapshot);
  const [step, setStep] = useState<Step>(parts.length ? "keyboard" : "song");
  const [songId, setSongId] = useState<string>(songs[0]?.clipId ?? "");
  const [source, setSource] = useState<SourceKind>("song");
  const [replaceToo, setReplaceToo] = useState(false);
  /** "add" writes a new voice to go with the song and replaces nothing; "replace" re-voices the song's own parts. */
  const [goal, setGoal] = useState<"add" | "replace">("add");
  const [styles, setStyles] = useState<SingStyle[]>(["tune"]);
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

  const fail = (err: unknown, fallback: string) =>
    setProblem(err instanceof ReampError ? t(`editorTools.reampErrors.${err.code}`) : err instanceof Error ? err.message : fallback);

  /* ---------- Step 1: the song ---------- */

  const prepare = async (clipId: string) => {
    setProblem(null);
    setWorking(t("editorTools.wizard.splitting"));
    const ok = await props.onPrepare(clipId, source);
    setWorking(null);
    if (ok) setStep("keyboard");
    else setProblem(t("editorTools.wizard.prepareFailed"));
  };

  const loadFile = async (file: File) => {
    setProblem(null);
    setWorking(t("editorTools.wizard.loading", { name: file.name }));
    const clipId = await props.onImport(file);
    setWorking(null);
    if (!clipId) {
      setProblem(t("editorTools.wizard.notAudio"));
      return;
    }
    setSongId(clipId);
    await prepare(clipId);
  };

  /* ---------- Step 2: the keyboard ---------- */

  const checkKeyboard = async () => {
    setProblem(null);
    try {
      setWorking(t("editorTools.wizard.connecting"));
      await midiOutHub.connect();
      if (!midiOutHub.ready()) throw new Error(t("editorTools.wizard.noKeyboard"));
      setWorking(t("editorTools.wizard.findingInput"));
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) track.stop();
      } catch {
        throw new Error(t("editorTools.wizard.inputRefused"));
      }
      const inputs = await listAudioInputs();
      const chosen = guessInstrumentInput(inputs);
      if (!chosen) throw new Error(t("editorTools.wizard.noInput"));
      setInputId(chosen);
      setInputName(inputs.find((input) => input.deviceId === chosen)?.label ?? t("editorTools.wizard.audioInput"));
      setWorking(t("editorTools.wizard.testing"));
      const measured = await measureRoundTrip(engine, { deviceId: chosen });
      setLatency(measured.seconds);
    } catch (err) {
      setLatency(null);
      fail(err, t("editorTools.wizard.checkFailed"));
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
    const plain = part.name.replace(/ \(MIDI\)$/, "");
    const layers = choice.layers ?? [];
    // A one-note voice cannot stack layers: each layer is a take of its own, in the same rhythm.
    const passes: { layerOnly?: Layer; label: string; takeKey: string }[] = [
      { label: choice.harmony ? `${plain} harmony` : plain, takeKey: part.id },
      ...(choice.mono
        ? layers.map((layer) => ({
            layerOnly: layer,
            label: `${plain} (${LAYERS.find((entry) => entry.id === layer)?.label ?? layer})`,
            takeKey: `${part.id}:${layer}`
          }))
        : [])
    ];
    for (const pass of passes) {
      if (cancelRef.current) break;
      // A take that distorts is recorded again by itself, each time about 6 dB quieter. Only when
      // even a low MIDI volume distorts is the keyboard's own volume knob the thing to turn down.
      let level: number | undefined;
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        const before = liveRef.current.passResult.count;
        props.onStartPass({
          trackId: part.id,
          deviceId: inputId,
          latency,
          shape: {
            voices: choice.voices,
            octave: choice.octave,
            length: choice.length,
            harmony: choice.harmony,
            minLength: choice.minLength ?? 0,
            overlap: choice.overlap ?? true,
            layers: choice.mono ? [] : layers,
            mono: Boolean(choice.mono),
            layerOnly: pass.layerOnly
          },
          label: pass.label,
          takeKey: pass.takeKey,
          // A part recorded a second time replaces its first take.
          replace: true,
          level,
          managed: true
        });
        if (!(await until(() => liveRef.current.passRunning, 25_000))) {
          if (!cancelRef.current) setProblem(t("editorTools.wizard.passNotStarted", { name: part.name }));
          return "stopped";
        }
        // A pass ends itself when its part has played; an hour is only a backstop.
        if (!(await until(() => !liveRef.current.passRunning, 3_600_000))) return "stopped";
        await until(() => liveRef.current.passResult.count > before, 5000);
        const result = liveRef.current.passResult;
        if (result.silent) {
          setProblem(t("editorTools.wizard.noSound", { name: plain }));
          setLatency(null);
          return "silent";
        }
        if (!result.clipped) {
          setProblem(null);
          break;
        }
        const used = result.volume ?? 100;
        const next = Math.round(used * QUIETER);
        if (attempt === MAX_TRIES || next < MIN_VOLUME || cancelRef.current) {
          setProblem(t("editorTools.wizard.stillDistorted", { name: pass.label, volume: used }));
          break;
        }
        setProblem(t("editorTools.wizard.tooLoud", { name: pass.label, attempt: attempt + 1, tries: MAX_TRIES }));
        level = next;
        // The take just saved must finish saving before the next one replaces it.
        await until(() => !liveRef.current.editorBusy, 120_000);
      }
      // The take just made must finish saving before the next layer's take starts.
      await until(() => !liveRef.current.passRunning && !liveRef.current.editorBusy, 120_000);
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
                            // A one-note voice is recorded one note at a time; another voice keeps its last setting.
                            onChange={(tone) => setChoice(part, isMonoTone(tone) ? { tone, mono: true } : { tone })}
                          />
                          {part.drums ? null : (
                            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 text-slate-400">
                              <label className="flex items-center gap-1">
                                {t("editorTools.wizard.notesAtOnce")}
                                <select className={cn(fieldClass, "w-24")} value={choice.voices} onChange={(event) => setChoice(part, { voices: Number(event.target.value) })}>
                                  <option value={1}>{t("editorTools.wizard.melody")}</option>
                                  <option value={2}>2</option>
                                  <option value={3}>3</option>
                                  <option value={4}>4</option>
                                  <option value={0}>{t("editorTools.wizard.all")}</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1">
                                {t("editorTools.wizard.octave")}
                                <select
                                  className={cn(fieldClass, "w-32")}
                                  value={String(choice.octave)}
                                  onChange={(event) => setChoice(part, { octave: event.target.value === "auto" ? "auto" : Number(event.target.value) })}
                                >
                                  <option value="auto">{t("editorTools.wizard.singingRange")}</option>
                                  <option value="2">{t("editorTools.wizard.up2")}</option>
                                  <option value="1">{t("editorTools.wizard.up1")}</option>
                                  <option value="0">{t("editorTools.wizard.asWritten")}</option>
                                  <option value="-1">{t("editorTools.wizard.down1")}</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1">
                                {t("editorTools.wizard.noteLength")}
                                <select
                                  className={cn(fieldClass, "w-36")}
                                  value={choice.length}
                                  onChange={(event) => setChoice(part, { length: event.target.value as PartShape["length"] })}
                                >
                                  <option value="legato">{t("editorTools.wizard.legato")}</option>
                                  <option value="full">{t("editorTools.wizard.full")}</option>
                                  <option value="written">{t("editorTools.wizard.asWritten")}</option>
                                </select>
                              </label>
                              <label className="flex items-center gap-1">
                                <input type="checkbox" className="h-4 w-4 accent-cyan-400" checked={choice.harmony} onChange={(event) => setChoice(part, { harmony: event.target.checked })} />
                                {t("editorTools.wizard.thirdUp")}
                              </label>
                              <label
                                className="flex w-full items-center gap-2"
                                title={t("editorTools.wizard.monoTitle")}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-cyan-400"
                                  checked={Boolean(choice.mono)}
                                  onChange={(event) => setChoice(part, { mono: event.target.checked })}
                                />
                                {t("editorTools.wizard.mono")}
                              </label>
                              <label className="flex w-full flex-wrap items-center gap-2" title={t("editorTools.wizard.shortestTitle")}>
                                {t("editorTools.wizard.shortest")}
                                <input
                                  type="range"
                                  className="w-40 accent-cyan-400"
                                  min={0}
                                  max={2}
                                  step={0.05}
                                  value={choice.minLength ?? 0}
                                  aria-label={t("editorTools.wizard.shortestLabel")}
                                  onChange={(event) => setChoice(part, { minLength: Number(event.target.value) })}
                                />
                                <span className="w-24 tabular-nums text-slate-200">
                                  {(choice.minLength ?? 0) > 0 ? `${(choice.minLength ?? 0).toFixed(2)} s` : t("editorTools.wizard.asShaped")}
                                </span>
                                {(choice.minLength ?? 0) > 0 && !choice.mono ? (
                                  <select
                                    className={cn(fieldClass, "w-56")}
                                    aria-label={t("editorTools.wizard.overlapLabel")}
                                    value={choice.overlap ?? true ? "overlap" : "skip"}
                                    onChange={(event) => setChoice(part, { overlap: event.target.value === "overlap" })}
                                  >
                                    <option value="skip">{t("editorTools.wizard.skipNext")}</option>
                                    <option value="overlap">{t("editorTools.wizard.overlap")}</option>
                                  </select>
                                ) : null}
                              </label>
                              <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1" role="group" aria-label={t("editorTools.wizard.layersLabel")}>
                                <span title={t("editorTools.wizard.layersTitle")}>
                                  {choice.mono ? t("editorTools.wizard.addLayersMono") : t("editorTools.wizard.addLayers")}
                                </span>
                                {LAYERS.map((layer) => {
                                  const on = (choice.layers ?? []).includes(layer.id);
                                  return (
                                    <label key={layer.id} className="flex items-center gap-1">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-cyan-400"
                                        checked={on}
                                        onChange={(event) => {
                                          const rest = (choice.layers ?? []).filter((id: Layer) => id !== layer.id);
                                          setChoice(part, { layers: event.target.checked ? [...rest, layer.id] : rest });
                                        }}
                                      />
                                      {t(`editorTools.wizard.layers.${layer.id}`)}
                                    </label>
                                  );
                                })}
                              </div>
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={t("editorTools.wizard.title")}>
      <div className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-slate-900 text-sm text-slate-200 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <h2 className="display-font text-sm font-semibold uppercase tracking-wider">{t("editorTools.wizard.title")}</h2>
          <ol className="flex flex-1 items-center gap-1 text-[11px]">
            {STEPS.map((entry, index) => (
              <li
                key={entry.id}
                className={cn(
                  "rounded-full px-2 py-0.5",
                  index === stepIndex ? "bg-cyan-400 font-semibold text-slate-950" : index < stepIndex ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                )}
              >
                {index + 1}. {t(`editorTools.wizard.steps.${entry.id}`)}
              </li>
            ))}
          </ol>
          <HelpLink section="keyboard-wizard" label={t("editorTools.wizard.helpLabel")} />
          <button
            type="button"
            aria-label={t("editorTools.wizard.close")}
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
              <p className="text-slate-300">{t("editorTools.wizard.songIntro")}</p>
              <div className="grid grid-cols-2 gap-2">
                {SOURCES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={source === id}
                    onClick={() => setSource(id)}
                    className={cn(
                      "rounded-lg border p-2 text-left text-[12px] transition-colors",
                      source === id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10 bg-black/30 hover:border-white/30"
                    )}
                  >
                    <span className="block font-semibold text-slate-100">{t(`editorTools.wizard.sources.${id}.label`)}</span>
                    <span className="text-slate-400">{t(`editorTools.wizard.sources.${id}.hint`)}</span>
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
                  {t("editorTools.wizard.loadFile")}
                </ActionButton>
              </div>
              {songs.length ? (
                <div className="space-y-2 rounded-lg bg-black/30 p-3">
                  <p className="text-[12px] text-slate-400">{t("editorTools.wizard.orTimeline")}</p>
                  <div className="flex gap-2">
                    <select className={fieldClass} value={songId} onChange={(event) => setSongId(event.target.value)} aria-label={t("editorTools.wizard.songOnTimeline")}>
                      {songs.map((song) => (
                        <option key={song.clipId} value={song.clipId}>
                          {song.name}
                        </option>
                      ))}
                    </select>
                    <ActionButton disabled={working !== null || !songId} onClick={() => void prepare(songId)}>
                      {t("editorTools.wizard.useThis")}
                    </ActionButton>
                  </div>
                </div>
              ) : null}
              {parts.length ? (
                <ActionButton disabled={working !== null} onClick={() => setStep("keyboard")}>
                  {tp("editorTools.wizard.skipSong", parts.length)}
                </ActionButton>
              ) : null}
            </>
          ) : null}

          {step === "keyboard" ? (
            <>
              <p className="text-slate-300">
                {t("editorTools.wizard.keyboardIntro")}
              </p>
              <ActionButton variant="primary" disabled={working !== null} onClick={() => void checkKeyboard()}>
                {latency === null ? t("editorTools.wizard.check") : t("editorTools.wizard.checkAgain")}
              </ActionButton>
              {latency !== null ? (
                <ul className="space-y-1 rounded-lg bg-black/30 p-3 text-[12px]">
                  <li className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> {t("editorTools.wizard.midiOut", { name: out.outputs.find((o) => o.id === out.selected)?.name ?? t("editorTools.wizard.keyboard"), channel: out.channel })}
                  </li>
                  <li className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> {t("editorTools.wizard.audioIn", { name: inputName })}
                  </li>
                  <li className="flex items-center gap-2 text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> {t("editorTools.wizard.roundTrip", { ms: (latency * 1000).toFixed(1) })}
                  </li>
                </ul>
              ) : null}
            </>
          ) : null}

          {step === "voices" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {([{ id: "add" }, { id: "replace" }] as const).map((entry) => (
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
                    <span className="block font-semibold text-slate-100">{t(`editorTools.wizard.goals.${entry.id}.label`)}</span>
                    <span className="text-slate-400">{t(`editorTools.wizard.goals.${entry.id}.hint`)}</span>
                  </button>
                ))}
              </div>
              {goal === "add" ? (
                <div className="space-y-2 rounded-lg bg-black/30 p-3 text-[12px]">
                  <p className="text-slate-300">
                    {t("editorTools.wizard.addIntro")}
                  </p>
                  <div className="space-y-1" role="group" aria-label={t("editorTools.wizard.stylesLabel")}>
                    {SING_STYLES.map((entry) => (
                      <label key={entry.id} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-cyan-400"
                          checked={styles.includes(entry.id)}
                          onChange={(event) =>
                            setStyles((prev) => (event.target.checked ? [...prev, entry.id] : prev.filter((id) => id !== entry.id)))
                          }
                        />
                        <span>
                          <span className="text-slate-200">{t(`editorTools.wizard.styles.${entry.id}.label`)}</span>
                          <span className="block text-slate-400">{t(`editorTools.wizard.styles.${entry.id}.hint`)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionButton
                      variant={shown.length ? "secondary" : "primary"}
                      disabled={!styles.length}
                      onClick={() => {
                        setProblem(null);
                        if (!props.onSingAlong(styles)) setProblem(t("editorTools.wizard.noNotesForPart"));
                      }}
                    >
                      {shown.length ? t("editorTools.wizard.writeAgain") : t("editorTools.wizard.write")}
                    </ActionButton>
                    <span className="text-slate-400">{t("editorTools.wizard.eachStyle")}</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-slate-300">
                    {t("editorTools.wizard.replaceIntro")}
                  </p>
                  <label className="flex items-start gap-2 rounded-lg bg-black/30 p-3 text-[12px]">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-cyan-400" checked={replaceToo} onChange={(event) => setReplaceToo(event.target.checked)} />
                    <span>
                      <span className="font-semibold text-slate-100">{t("editorTools.wizard.silence")}</span>{" "}
                      <span className="text-slate-400">{t("editorTools.wizard.silenceHint")}</span>
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
                        <span className="font-normal text-slate-400">{tp("editorTools.wizard.notes", part.noteCount)}</span>
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
                {t("editorTools.wizard.stepIntro", { n: position + 1, total: queue.length })}
              </p>
              <div className="space-y-2 rounded-lg border border-cyan-400/40 bg-black/30 p-3">
                <p className="flex items-center gap-2 font-semibold text-slate-100">
                  {phase === "recording" ? <CircleDot className="h-3.5 w-3.5 animate-pulse text-rose-300" /> : null}
                  {queued.name.replace(/ \(MIDI\)$/, "")}
                  <span className="font-normal text-slate-400">
                    {phase === "recording" ? (passRunning ? t("editorTools.wizard.playingRecording") : t("editorTools.wizard.gettingReady")) : phase === "review" ? t("editorTools.wizard.listenToIt") : tp("editorTools.wizard.notes", queued.noteCount)}
                  </span>
                </p>
                {phase === "recording" ? null : settingsFor(queued)}
                <div className="flex flex-wrap gap-2 pt-1">
                  {phase === "ready" ? (
                    <>
                      <ActionButton variant="primary" onClick={() => void recordQueued()}>
                        {t("editorTools.wizard.recordThis")}
                      </ActionButton>
                      <ActionButton onClick={() => moveOn(false)}>{t("editorTools.wizard.skipIt")}</ActionButton>
                    </>
                  ) : null}
                  {phase === "recording" ? (
                    <ActionButton variant="danger" onClick={stopAll}>
                      {t("editorTools.wizard.stop")}
                    </ActionButton>
                  ) : null}
                  {phase === "review" ? (
                    <>
                      {props.playing ? (
                        <ActionButton onClick={props.onStopAudition}>{t("editorTools.wizard.stopPlaying")}</ActionButton>
                      ) : (
                        <>
                          <ActionButton onClick={() => props.onAudition(queued.id, true)}>{t("editorTools.wizard.hearAlone")}</ActionButton>
                          <ActionButton onClick={() => props.onAudition(queued.id, false)}>{t("editorTools.wizard.hearWithSong")}</ActionButton>
                        </>
                      )}
                      <ActionButton onClick={() => void recordQueued()}>{t("editorTools.wizard.recordAgain")}</ActionButton>
                      <ActionButton variant="primary" onClick={() => moveOn(true)}>
                        {position + 1 < queue.length ? t("editorTools.wizard.keepNext") : t("editorTools.wizard.keepFinish")}
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
                      <span className="text-slate-500">{recorded.includes(id) ? t("editorTools.wizard.kept") : index === position ? t("editorTools.wizard.now") : index < position ? t("editorTools.wizard.skipped") : t("editorTools.wizard.waiting")}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {step === "record" && !stepwise ? (
            <>
              <p className="text-slate-300">{t("editorTools.wizard.recordingAll")}</p>
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
                      {recorded.includes(part.id) ? t("editorTools.wizard.recorded") : current === part.id ? (passRunning ? t("editorTools.wizard.playingRecording") : t("editorTools.wizard.gettingReady")) : t("editorTools.wizard.waiting")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <p className="flex items-center gap-2 text-emerald-300">
                <Check className="h-4 w-4" /> {tp("editorTools.wizard.doneCount", recorded.length)}
              </p>
              <p className="text-slate-300">
                {t("editorTools.wizard.doneTracks")}{" "}
                {addOnly ? t("editorTools.wizard.doneAdd") : t("editorTools.wizard.doneReplace")}{" "}
                {t("editorTools.wizard.doneExport")}
              </p>
              <ActionButton variant="primary" onClick={props.onPlayResult}>
                {t("editorTools.wizard.playResult")}
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
            {t("editorTools.wizard.back")}
          </ActionButton>
          {step === "keyboard" ? (
            <ActionButton variant="primary" disabled={latency === null || working !== null || !parts.length} onClick={() => setStep("voices")}>
              {t("editorTools.wizard.nextVoices")}
            </ActionButton>
          ) : null}
          {step === "voices" ? (
            <div className="flex gap-2">
              <ActionButton disabled={!included.length || latency === null} onClick={() => void recordAll()}>
                {t("editorTools.wizard.recordAll")}
              </ActionButton>
              <ActionButton
                variant="primary"
                disabled={!included.length || latency === null}
                onClick={() => {
                  setStepwise(true);
                  startStepwise();
                }}
              >
                {t("editorTools.wizard.recordStepwise")}
              </ActionButton>
            </div>
          ) : null}
          {step === "record" && !stepwise ? (
            <ActionButton variant="danger" onClick={stopAll}>
              {t("editorTools.wizard.stop")}
            </ActionButton>
          ) : null}
          {step === "done" ? (
            <ActionButton variant="primary" onClick={props.onClose}>
              {t("editorTools.wizard.closeListen")}
            </ActionButton>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
