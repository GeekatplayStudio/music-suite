"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Play, RotateCcw, SlidersHorizontal, Square, Waves } from "lucide-react";

import { SoundBrowser } from "@/components/editor/plugin-instrument";
import { PresetBar, SynthControls } from "@/components/editor/synth-editor";
import { Piano } from "@/components/synth/piano";
import { editorApi } from "@/lib/editor/api";
import { initPatch, normalizePatch, startVoice, type Patch, type Voice } from "@/lib/editor/synth";
import type { Note, PluginInfo, PluginSound } from "@/lib/editor/types";
import { cn } from "@/lib/utils";

const quiet =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 text-xs font-semibold text-slate-100 " +
  "hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40";
const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 " +
  "hover:bg-cyan-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:pointer-events-none disabled:opacity-40";

const PATCH_KEY = "music-suite-synth-studio-patch";
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
  const [tab, setTab] = useState<Tab>("builtin");
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
  const lastPitch = useRef<number | null>(null);
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
  const noteOff = useCallback((pitch: number) => {
    const voice = voices.current.get(pitch);
    if (!voice || !audio.current) return;
    voices.current.delete(pitch);
    voice.release(audio.current.ctx.currentTime);
  }, []);
  const noteOn = useCallback(
    (pitch: number) => {
      const { ctx, out } = output();
      const sound = patchRef.current;
      const now = ctx.currentTime + 0.003;
      let glideFrom: number | null = null;
      if (sound.mode === "mono") {
        // One note at a time: the held note ends and the new one glides from it.
        for (const held of [...voices.current.keys()]) {
          glideFrom = held;
          noteOff(held);
        }
      }
      noteOff(pitch);
      voices.current.set(pitch, startVoice(ctx, sound, out, pitch, 0.22, now, { velocity: 0.8, bpm: 120, glideFrom }));
      lastPitch.current = pitch;
    },
    [noteOff]
  );
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
          setAudition(null);
          if (status.error) setError(status.error);
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [audition]);

  const play = async () => {
    if (!pluginId || audition || starting) return;
    setError(null);
    setStarting(true);
    try {
      const started = await editorApi.startAudition({ plugin_id: pluginId, state: sound?.state ?? null, notes: DEMO_NOTES, seconds: DEMO_SECONDS });
      setAudition(started.id);
    } catch (err) {
      setError(message(err, "Playing could not start."));
    }
    setStarting(false);
  };
  const stop = () => {
    if (!audition) return;
    void editorApi.stopAudition(audition).catch(() => undefined);
    setAudition(null);
  };
  const pick = async (picked: PluginSound) => {
    setError(null);
    try {
      const built = await editorApi.pluginSoundState(pluginId, picked.id);
      setSound(built);
      if (auditionRef.current) await editorApi.loadInAudition(auditionRef.current, built.state);
    } catch (err) {
      setError(message(err, "That sound could not be loaded."));
    }
  };
  const chosen = plugins?.find((plugin) => plugin.id === pluginId);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 px-3 pb-16 pt-6 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="display-font text-xl font-semibold text-slate-100 sm:text-2xl">
            Music Suite <span className="text-cyan-300">/ Synth Studio</span>
          </p>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Design sounds and play them. Sounds saved here appear as &ldquo;My sounds&rdquo; on instrument tracks in the Studio Editor.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Music Suite">
          <Link href="/editor" className={quiet}>
            Studio Editor
          </Link>
          <Link href="/generate" className={quiet}>
            AI Song Studio
          </Link>
          <Link href="/models" className={quiet}>
            Models &amp; engines
          </Link>
          <Link href="/" className={quiet}>
            Back to Music Suite
          </Link>
        </nav>
      </header>

      <div role="tablist" aria-label="Instrument" className="flex gap-1 self-start rounded-xl bg-slate-900/80 p-1">
        {(
          [
            ["builtin", "Music Suite synth", SlidersHorizontal],
            ["plugin", "Surge XT and plugins", Waves]
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 sm:px-4",
              tab === id ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === "builtin" ? (
        <div id="panel-builtin" role="tabpanel" aria-labelledby="tab-builtin" className="flex flex-col gap-4">
          <section className="glass rounded-2xl border border-white/10 p-3 sm:p-4" aria-label="Sound">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="display-font mr-1 text-base font-semibold text-slate-100">Sound</h2>
              <PresetBar patch={patch} onChange={(next) => setPatch(next)} />
              <button type="button" className={quiet} onClick={() => setPatch(initPatch())} title="Start again from a plain sound">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> New sound
              </button>
            </div>
            <Piano className="mt-3" onNoteOn={noteOn} onNoteOff={noteOff} />
          </section>
          <SynthControls patch={patch} onChange={(next) => setPatch(next)} wide />
        </div>
      ) : (
        <div id="panel-plugin" role="tabpanel" aria-labelledby="tab-plugin" className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <section className="glass space-y-3 rounded-2xl border border-white/10 p-3 sm:p-4" aria-label="Plugin instrument">
            <h2 className="display-font text-base font-semibold text-slate-100">Instrument</h2>
            {plugins === null ? (
              <p className="flex items-center gap-2 text-sm text-slate-400" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking for instruments…
              </p>
            ) : plugins.length === 0 ? (
              <>
                <p className="text-sm text-slate-300">No instrument plugins are installed yet.</p>
                <Link href="/models" className={primary}>
                  <Download className="h-4 w-4" aria-hidden /> Install Surge XT (free)
                </Link>
              </>
            ) : (
              <>
                <select
                  className="h-10 w-full rounded-lg border border-white/10 bg-slate-900 px-2 text-sm text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  aria-label="Instrument"
                  value={pluginId}
                  disabled={Boolean(audition) || starting}
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
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={primary} disabled={Boolean(audition) || starting} onClick={() => void play()}>
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Play
                  </button>
                  <button type="button" className={cn(primary, "bg-slate-700 text-slate-100 hover:bg-slate-600")} disabled={!audition} onClick={stop}>
                    <Square className="h-4 w-4" aria-hidden /> Stop
                  </button>
                </div>
                <p className="text-xs leading-snug text-slate-400" role="status">
                  {starting
                    ? `Starting ${chosen?.name ?? "the instrument"}…`
                    : audition
                      ? "Playing a short phrase in a loop through your speakers. Pick sounds to hear each one."
                      : "Play loops a short phrase (bass note, rising chord, held chord) so each sound you pick is heard straight away."}
                </p>
                {error ? (
                  <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {error}
                  </p>
                ) : null}
                <p className="text-xs leading-snug text-slate-400">
                  To use a sound in a song, select a MIDI clip in the{" "}
                  <Link href="/editor" className="font-semibold text-cyan-300 underline-offset-2 hover:underline">
                    Studio Editor
                  </Link>{" "}
                  and pick it in the clip&apos;s Plugin instrument section.
                </p>
              </>
            )}
          </section>
          {pluginId ? (
            <section className="glass rounded-2xl border border-white/10 p-3 sm:p-4" aria-label="Sounds">
              <h2 className="display-font mb-2 text-base font-semibold text-slate-100">Sounds</h2>
              <SoundBrowser key={pluginId} pluginId={pluginId} current={sound?.name} onPick={(picked) => void pick(picked)} tall />
              {chosen && chosen.name !== "Surge XT" ? (
                <p className="text-xs text-slate-400">The sound list is available for Surge XT. Other instruments play their default sound here.</p>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
