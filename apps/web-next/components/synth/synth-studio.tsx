"use client";

import { AppPrefs } from "@/components/app-prefs";
import { FloatButton, Floatable } from "@/components/detachable";
import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { AppWindow, Download, Loader2, Piano as PianoIcon, Play, Power, RotateCcw, SlidersHorizontal, Square, Waves } from "lucide-react";

import { PluginSoundFiles, SoundBrowser } from "@/components/editor/plugin-instrument";
import { PresetBar, SynthControls } from "@/components/editor/synth-editor";
import { Piano } from "@/components/synth/piano";
import { editorApi } from "@/lib/editor/api";
import { type MidiEvent, midiHub } from "@/lib/editor/midi";
import { initPatch, normalizePatch, startVoice, type Patch, type Voice } from "@/lib/editor/synth";
import type { Note, PluginInfo, PluginSound } from "@/lib/editor/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { openPageWindow } from "@/lib/windows";

const quiet =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 " +
  "hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";
const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 " +
  "hover:bg-cyan-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:pointer-events-none disabled:opacity-40";

const PATCH_KEY = "music-suite-synth-studio-patch";
/** Keys that can sound at once on the suite's synth before the oldest gives way. */
const MAX_HELD_VOICES = 12;
/** What Play loops through a plugin instrument: a bass note, a rising chord and a held chord. */
const DEMO_SECONDS = 4;
const DEMO_NOTES: Note[] = [
  { t: 0, d: 0.9, p: 36, v: 0.9 },
  { t: 0, d: 0.4, p: 60, v: 0.8 },
  { t: 0.5, d: 0.4, p: 63, v: 0.7 },
  { t: 1, d: 0.4, p: 67, v: 0.8 },
  { t: 1.5, d: 0.4, p: 72, v: 0.9 },
  { t: 2, d: 1.6, p: 48, v: 0.8 },
  { t: 2, d: 1.6, p: 60, v: 0.7 },
  { t: 2, d: 1.6, p: 63, v: 0.7 },
  { t: 2, d: 1.6, p: 67, v: 0.7 }
];

function loadPatch(): Patch {
  try {
    const saved = window.localStorage.getItem(PATCH_KEY);
    return saved ? normalizePatch(JSON.parse(saved)) : initPatch();
  } catch {
    return initPatch();
  }
}

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

type Tab = "builtin" | "plugin";

/** Design and play sounds: the suite's own synth, and installed instruments such as Surge XT. */
export function SynthStudio() {
  const { t } = useI18n();
  // ?tab=plugin opens on the plug-in tab (a tab opened in a window of its own). This component
  // renders in the browser only, so the address can be read straight away.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get("tab") === "plugin" ? "plugin" : "builtin"));
  const [patch, setPatch] = useState<Patch>(loadPatch);
  const patchRef = useRef(patch);
  useEffect(() => {
    patchRef.current = patch;
    try {
      window.localStorage.setItem(PATCH_KEY, JSON.stringify(patch));
    } catch {
      /* storage unavailable: the sound lasts for this visit */
    }
  }, [patch]);

  /* ---------- Built-in synth: played live in the browser ---------- */

  const audio = useRef<{ ctx: AudioContext; out: AudioNode } | null>(null);
  const voices = useRef(new Map<number, Voice>());
  const output = () => {
    if (!audio.current) {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      // A gentle limiter so a loud sound or a fistful of keys cannot clip.
      const limiter = new DynamicsCompressorNode(ctx, { threshold: -8, knee: 6, ratio: 12, attack: 0.003, release: 0.15 });
      limiter.connect(ctx.destination);
      audio.current = { ctx, out: limiter };
    }
    if (audio.current.ctx.state !== "running") void audio.current.ctx.resume();
    return audio.current;
  };
  // Sustain pedal: released keys keep sounding until the pedal comes up.
  const pedal = useRef({ down: false, held: new Set<number>() });
  const bend = useRef(0);
  const endVoice = useCallback((pitch: number) => {
    const voice = voices.current.get(pitch);
    if (!voice || !audio.current) return;
    voices.current.delete(pitch);
    pedal.current.held.delete(pitch);
    voice.release(audio.current.ctx.currentTime);
  }, []);
  const noteOff = useCallback(
    (pitch: number) => {
      if (pedal.current.down && voices.current.has(pitch)) pedal.current.held.add(pitch);
      else endVoice(pitch);
    },
    [endVoice]
  );
  const allNotesOff = useCallback(() => {
    for (const pitch of [...voices.current.keys()]) endVoice(pitch);
  }, [endVoice]);
  const noteOn = useCallback(
    (pitch: number, velocity = 0.8) => {
      const { ctx, out } = output();
      const sound = patchRef.current;
      const now = ctx.currentTime + 0.003;
      let glideFrom: number | null = null;
      if (sound.mode === "mono") {
        // One note at a time: the held note ends and the new one glides from it.
        for (const held of [...voices.current.keys()]) {
          glideFrom = held;
          endVoice(held);
        }
      }
      endVoice(pitch);
      // A rich sound uses many oscillators per key: the oldest key gives way past the limit.
      while (voices.current.size >= MAX_HELD_VOICES) endVoice(voices.current.keys().next().value as number);
      const options = { velocity, bpm: 120, glideFrom, bendCents: bend.current };
      voices.current.set(pitch, startVoice(ctx, sound, out, pitch, 0.22, now, options));
    },
    [endVoice]
  );
  const setSustain = useCallback(
    (down: boolean) => {
      pedal.current.down = down;
      if (!down) for (const pitch of [...pedal.current.held]) endVoice(pitch);
    },
    [endVoice]
  );
  /** Pitch-bend wheel, -1 to 1: two semitones each way. */
  const setBend = useCallback((value: number) => {
    bend.current = value * 200;
    const now = audio.current?.ctx.currentTime ?? 0;
    for (const voice of voices.current.values()) voice.bend(bend.current, now);
  }, []);
  useEffect(() => {
    const held = voices.current;
    return () => {
      held.clear();
      void audio.current?.ctx.close();
      audio.current = null;
    };
  }, []);

  /* ---------- Plugin instruments: played by the suite's plugin host ---------- */

  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [pluginId, setPluginId] = useState("");
  const [sound, setSound] = useState<{ name: string; state: string } | null>(null);
  const [audition, setAudition] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [looping, setLooping] = useState(false);
  // True while the plugin's own interface (Surge XT's full panel) is open on this computer.
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auditionRef = useRef<string | null>(null);
  useEffect(() => {
    auditionRef.current = audition;
  }, [audition]);

  useEffect(() => {
    let alive = true;
    editorApi
      .plugins()
      .then((list) => {
        if (!alive) return;
        const instruments = list.plugins.filter((plugin) => plugin.is_instrument !== false);
        setPlugins(instruments);
        // Surge XT first: it is the one with a browsable sound library.
        setPluginId((instruments.find((plugin) => plugin.name === "Surge XT") ?? instruments[0])?.id ?? "");
      })
      .catch(() => alive && setPlugins([]));
    return () => {
      alive = false;
      // Leaving the page stops anything still playing.
      if (auditionRef.current) void editorApi.stopAudition(auditionRef.current).catch(() => undefined);
    };
  }, []);

  // Notice when an audition ends by itself (the plugin failed or the suite stopped it).
  useEffect(() => {
    if (!audition) return;
    const timer = window.setInterval(() => {
      editorApi
        .audition(audition)
        .then((status) => {
          if (status.running) return;
          auditionRef.current = null;
          setAudition(null);
          setLooping(false);
          setPanelOpen(false);
          // Whatever was dialled in on the plugin's own panel becomes the current sound.
          if (status.state) setSound({ name: t("synth.studio.editedFull"), state: status.state });
          if (status.error) setError(status.error);
        })
        .catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [audition, t]);

  /** Start the instrument: with the looping phrase, or silent and ready for the piano. */
  const start = async (loop: boolean, panel = false) => {
    if (!pluginId || auditionRef.current || starting) return;
    setError(null);
    setStarting(true);
    try {
      const body = {
        plugin_id: pluginId,
        state: sound?.state ?? null,
        notes: DEMO_NOTES,
        seconds: DEMO_SECONDS,
        play: loop,
        live: true,
        window: panel
      };
      const started = await editorApi.startAudition(body);
      auditionRef.current = started.id;
      setAudition(started.id);
      setLooping(loop);
      setPanelOpen(panel);
    } catch (err) {
      setError(message(err, t("synth.studio.errors.start")));
    }
    setStarting(false);
  };
  const play = () => {
    if (!audition) return void start(true);
    setLooping(true);
    void editorApi.previewAudition(audition, true).catch(() => undefined);
  };
  const stop = () => {
    if (!audition) return;
    setLooping(false);
    void editorApi.previewAudition(audition, false).catch(() => undefined);
  };
  const turnOff = () => {
    if (!audition) return;
    void editorApi.stopAudition(audition).catch(() => undefined);
    auditionRef.current = null;
    setAudition(null);
    setLooping(false);
    setPanelOpen(false);
  };
  /** Open the plugin's own interface: every oscillator, filter, envelope, LFO and scope it has. */
  const openPanel = async () => {
    if (panelOpen || starting) return;
    const wasLooping = looping;
    if (auditionRef.current) {
      // The instrument restarts with its window; the sound in use carries over.
      const key = auditionRef.current;
      auditionRef.current = null;
      setAudition(null);
      await editorApi.stopAudition(key).catch(() => undefined);
    }
    await start(wasLooping, true);
  };
  /** Notes from the piano or a MIDI keyboard, played through the instrument at once. */
  const sendLive = useCallback((messages: number[][]) => {
    const key = auditionRef.current;
    if (key) void editorApi.midiToAudition(key, messages).catch(() => undefined);
  }, []);
  const pluginNoteOn = (pitch: number, velocity = 0.8) => {
    if (!auditionRef.current) return void start(false); // The first key switches the instrument on.
    sendLive([[0x90, pitch, Math.min(127, Math.max(1, Math.round(velocity * 127)))]]);
  };
  const pluginNoteOff = (pitch: number) => sendLive([[0x80, pitch, 0]]);
  const applySound = async (built: { name: string; state: string }) => {
    setSound(built);
    if (auditionRef.current) await editorApi.loadInAudition(auditionRef.current, built.state);
  };
  const pick = async (picked: PluginSound) => {
    setError(null);
    try {
      await applySound(await editorApi.pluginSoundState(pluginId, picked.id));
    } catch (err) {
      setError(message(err, t("synth.studio.errors.sound")));
    }
  };
  const chosen = plugins?.find((plugin) => plugin.id === pluginId);

  /* ---------- MIDI keyboard: plays whichever tab is open ---------- */

  const midi = useSyncExternalStore(midiHub.watch, midiHub.snapshot, midiHub.serverSnapshot);
  const onMidi = useEffectEvent((event: MidiEvent) => {
    if (tab === "builtin") {
      if (event.kind === "on") noteOn(event.pitch, event.velocity);
      else if (event.kind === "off") noteOff(event.pitch);
      else if (event.kind === "sustain") setSustain(event.down);
      else if (event.kind === "bend") setBend(event.value);
      else allNotesOff();
      return;
    }
    if (event.kind === "on") pluginNoteOn(event.pitch, event.velocity);
    else if (event.kind === "off") pluginNoteOff(event.pitch);
    else if (event.kind === "sustain") sendLive([[0xb0, 64, event.down ? 127 : 0]]);
    else if (event.kind === "bend") {
      const wheel = Math.min(16383, Math.max(0, Math.round(((event.value + 1) / 2) * 16383)));
      sendLive([[0xe0, wheel & 0x7f, wheel >> 7]]);
    } else sendLive([[0xb0, 123, 0]]);
  });
  useEffect(() => {
    void midiHub.connectIfAllowed();
    return midiHub.subscribe((event) => onMidi(event));
  }, []);
  const midiLabel =
    midi.state === "ready"
      ? midi.inputs.length
        ? t("synth.studio.midi.inputs", { names: midi.inputs.map((input) => input.name).join(", ") })
        : t("synth.studio.midi.noKeyboard")
      : midi.state === "connecting"
        ? t("synth.studio.midi.connecting")
        : midi.state === "unsupported"
          ? t("synth.studio.midi.unsupported")
          : midi.state === "denied"
            ? t("synth.studio.midi.denied")
            : t("synth.studio.midi.connect");
  const instrumentName = chosen?.name ?? t("synth.studio.theInstrument");
  const instrumentStart = chosen?.name ?? t("synth.studio.theInstrumentStart");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 px-3 pb-16 pt-6 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="display-font text-xl font-semibold text-slate-100 sm:text-2xl">
            Music Suite <span className="text-cyan-300">/ {t("synth.studio.title")}</span>
          </p>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            {t("synth.studio.intro")}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label={t("synth.studio.nav.label")}>
          <button
            type="button"
            className={cn(quiet, midi.state === "ready" && midi.inputs.length ? "text-emerald-300" : "")}
            disabled={midi.state === "connecting" || midi.state === "unsupported"}
            title={t("synth.studio.nav.midiTitle")}
            onClick={() => void midiHub.connect()}
          >
            <PianoIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="max-w-56 truncate">{midiLabel}</span>
          </button>
          <Link href="/editor" className={quiet}>
            {t("synth.studio.nav.editor")}
          </Link>
          <Link href="/generate" className={quiet}>
            {t("synth.studio.nav.studio")}
          </Link>
          <Link href="/models" className={quiet}>
            {t("synth.studio.nav.models")}
          </Link>
          <a href="/help#synth-studio" target="_blank" rel="noreferrer" className={quiet}>
            {t("synth.studio.nav.help")}
          </a>
          <Link href="/" className={quiet}>
            {t("synth.studio.nav.back")}
          </Link>
          <AppPrefs />
        </nav>
      </header>

      <div className="flex items-stretch gap-2 self-start">
      <div role="tablist" aria-label={t("synth.studio.tabs.label")} className="flex gap-1 rounded-xl bg-slate-900/80 p-1">
        {(
          [
            ["builtin", t("synth.studio.tabs.builtin"), SlidersHorizontal],
            ["plugin", t("synth.studio.tabs.plugin"), Waves]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => {
              // Nothing keeps sounding from the tab being left.
              allNotesOff();
              sendLive([[0xb0, 123, 0]]);
              setTab(id);
            }}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 sm:px-4",
              tab === id ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        title={t("windows.tab", { tab: t(`synth.studio.tabs.${tab}`) })}
        aria-label={t("windows.tab", { tab: t(`synth.studio.tabs.${tab}`) })}
        onClick={() => {
          if (!openPageWindow(`synth-${tab}`, `/synth?tab=${tab}`)) window.alert(t("windows.blocked"));
        }}
        className="inline-flex w-12 items-center justify-center rounded-xl bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <AppWindow className="h-4 w-4" aria-hidden />
      </button>
      </div>

      {tab === "builtin" ? (
        <div id="panel-builtin" role="tabpanel" aria-labelledby="tab-builtin" className="flex flex-col gap-4">
          <Floatable id="synth-sound" title={t("synth.studio.sound")}>
          <section className="glass rounded-2xl border border-white/10 p-3 sm:p-4" aria-label={t("synth.studio.sound")}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display-font mr-1 text-base font-semibold text-slate-100">{t("synth.studio.sound")}</h2>
              <PresetBar patch={patch} onChange={(next) => setPatch(next)} />
              <button type="button" className={quiet} onClick={() => setPatch(initPatch())} title={t("synth.studio.newSoundTitle")}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("synth.studio.newSound")}
              </button>
              <FloatButton className="ml-auto" />
            </div>
            <Piano className="mt-3" onNoteOn={noteOn} onNoteOff={noteOff} />
          </section>
          </Floatable>
          <Floatable id="synth-controls" title={t("detach.titles.synthControls")}>
            <p className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("detach.titles.synthControls")}
              <FloatButton className="ml-auto" />
            </p>
            <SynthControls patch={patch} onChange={(next) => setPatch(next)} wide />
          </Floatable>
        </div>
      ) : (
        <div id="panel-plugin" role="tabpanel" aria-labelledby="tab-plugin" className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <Floatable id="synth-instrument" title={t("synth.studio.instrument")}>
          <section className="glass space-y-3 rounded-2xl border border-white/10 p-3 sm:p-4" aria-label={t("synth.studio.pluginSection")}>
            <h2 className="display-font flex items-center gap-2 text-base font-semibold text-slate-100">
              {t("synth.studio.instrument")}
              <FloatButton className="ml-auto" />
            </h2>
            {plugins === null ? (
              <p className="flex items-center gap-2 text-sm text-slate-400" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("synth.studio.looking")}
              </p>
            ) : plugins.length === 0 ? (
              <>
                <p className="text-sm text-slate-300">{t("synth.studio.noPlugins")}</p>
                <Link href="/models" className={primary}>
                  <Download className="h-4 w-4" aria-hidden /> {t("synth.studio.installSurge")}
                </Link>
              </>
            ) : (
              <>
                <select
                  className="h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-sm text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  aria-label={t("synth.studio.instrument")}
                  value={pluginId}
                  disabled={Boolean(audition) || starting}
                  title={audition ? t("synth.studio.turnOffFirst") : undefined}
                  onChange={(event) => {
                    setPluginId(event.target.value);
                    setSound(null);
                  }}
                >
                  {plugins.map((plugin) => (
                    <option key={plugin.id} value={plugin.id}>
                      {plugin.name} ({plugin.format.toUpperCase()})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={cn(primary, "w-full")}
                  disabled={panelOpen || starting}
                  onClick={() => void openPanel()}
                  title={t("synth.studio.fullTitle")}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  {panelOpen
                    ? t("synth.studio.fullOpen", { name: instrumentStart })
                    : t("synth.studio.openFull", { name: instrumentName })}
                </button>
                <p className="text-xs leading-snug text-slate-400">
                  {panelOpen
                    ? t("synth.studio.fullOpenHelp")
                    : t("synth.studio.fullHelp")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={primary} disabled={looping || starting} onClick={play}>
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {t("synth.studio.play")}
                  </button>
                  <button type="button" className={cn(primary, "bg-slate-700 text-slate-100 hover:bg-slate-600")} disabled={!looping} onClick={stop}>
                    <Square className="h-4 w-4" aria-hidden /> {t("synth.studio.stop")}
                  </button>
                </div>
                <p className="text-xs leading-snug text-slate-400" role="status">
                  {starting
                    ? t("synth.studio.starting", { name: instrumentName })
                    : looping
                      ? t("synth.studio.looping")
                      : audition
                        ? t("synth.studio.on", { name: instrumentStart })
                        : t("synth.studio.idle")}
                </p>
                {audition ? (
                  <button type="button" className={cn(quiet, "w-full")} onClick={turnOff}>
                    <Power className="h-3.5 w-3.5" aria-hidden /> {t("synth.studio.turnOff", { name: instrumentName })}
                  </button>
                ) : null}
                {error ? (
                  <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {error}
                  </p>
                ) : null}
                {chosen ? (
                  <PluginSoundFiles
                    plugin={chosen.name}
                    sound={sound}
                    onImport={(read) => void applySound(read).catch((err: unknown) => setError(message(err, t("synth.studio.errors.sound"))))}
                  />
                ) : null}
                <p className="text-xs leading-snug text-slate-400">
                  {t("synth.studio.useInSongBefore")}{" "}
                  <Link href="/editor" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
                    {t("synth.studio.nav.editor")}
                  </Link>
                  {t("synth.studio.useInSongAfter")}
                </p>
              </>
            )}
          </section>
          </Floatable>
          {pluginId ? (
            <Floatable id="synth-sounds" title={t("synth.studio.sounds")}>
            <section className="glass rounded-2xl border border-white/10 p-3 sm:p-4" aria-label={t("synth.studio.sounds")}>
              <h2 className="display-font mb-2 flex items-center gap-2 text-base font-semibold text-slate-100">
                {t("synth.studio.sounds")}
                <FloatButton className="ml-auto" />
              </h2>
              <SoundBrowser key={pluginId} pluginId={pluginId} current={sound?.name} onPick={(picked) => void pick(picked)} tall />
              {chosen && chosen.name !== "Surge XT" ? (
                <p className="text-xs text-slate-400">{t("synth.studio.surgeOnly")}</p>
              ) : null}
            </section>
            </Floatable>
          ) : null}
          {pluginId ? (
            <Floatable id="synth-play" title={t("synth.studio.playSection")} className="lg:col-span-2">
            <section className="glass rounded-2xl border border-white/10 p-3 sm:p-4" aria-label={t("synth.studio.playSection")}>
              <h2 className="display-font mb-2 flex items-center gap-2 text-base font-semibold text-slate-100">
                {t("synth.studio.playName", { name: instrumentName })}
                <FloatButton className="ml-auto" />
              </h2>
              <Piano className="" onNoteOn={pluginNoteOn} onNoteOff={pluginNoteOff} />
              <p className="mt-1 text-xs text-slate-400">
                {t("synth.studio.latency")}
              </p>
            </section>
            </Floatable>
          ) : null}
        </div>
      )}
    </main>
  );
}
