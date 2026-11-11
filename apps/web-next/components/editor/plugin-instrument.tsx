"use client";

import { Download, Loader2, Piano, Play, Square, Star, Upload } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { ActionButton, PanelSection, fieldClass } from "@/components/editor/controls";
import { editorApi } from "@/lib/editor/api";
import { SOUND_FILE_EXTENSION, exportSound, loadFavourites, readSoundFile, toggleFavourite } from "@/lib/editor/sound-file";
import type { InstrumentOffer, PluginInfo, PluginSound, Track } from "@/lib/editor/types";

type Check = { status: "idle" } | { status: "checking" } | { status: "error"; message: string };

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** What is running for this clip's plugin instrument right now. */
/** "listening" loops the clip; "live" is on for a MIDI keyboard; "window" shows the plugin's own window. */
export type PluginSession = "none" | "starting" | "listening" | "live" | "window";

/**
 * Plays a MIDI clip's notes through an installed VST3 / Audio Unit instrument
 * (Surge XT and the like). The plugin runs in an isolated process on this computer;
 * a render lands on a new audio track.
 */
export function PluginInstrumentSection({
  track,
  available,
  plugins,
  busy,
  session,
  hasNotes,
  onSet,
  onPickSound,
  onImportSound,
  onPlay,
  onLive,
  onStop,
  onOpenWindow,
  onCloseWindow,
  onRender,
  onRefreshPlugins
}: {
  track: Track;
  available: boolean;
  plugins: PluginInfo[];
  busy: boolean;
  session: PluginSession;
  hasNotes: boolean;
  onSet: (instrument: Track["pluginInstrument"]) => void;
  onPickSound: (sound: PluginSound) => void;
  /** Use a sound opened from a file. */
  onImportSound: (sound: { name: string; state: string }) => void;
  /** Start hearing the clip through the plugin (a session starts if none is running). */
  onPlay: () => void;
  /** Start the plugin silent, to play it from a MIDI keyboard. */
  onLive: () => void;
  onStop: () => void;
  onOpenWindow: () => void;
  onCloseWindow: () => void;
  onRender: () => void;
  onRefreshPlugins: () => void;
}) {
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const [windowPlaying, setWindowPlaying] = useState(false);
  // A new window starts silent.
  const [seenSession, setSeenSession] = useState(session);
  if (seenSession !== session) {
    setSeenSession(session);
    setWindowPlaying(false);
  }
  const request = useRef(0);
  const current = track.pluginInstrument;
  // Plugins already known to be effects are left out; unknown ones are checked when chosen.
  const candidates = plugins.filter((plugin) => plugin.is_instrument !== false);
  const loopable = session === "window" || session === "live";
  const playing = session === "listening" || session === "starting" || (loopable && windowPlaying);

  const choose = (id: string) => {
    const ticket = ++request.current;
    if (!id) {
      setCheck({ status: "idle" });
      onSet(undefined);
      return;
    }
    setCheck({ status: "checking" });
    editorApi
      .describePlugin(id, true)
      .then((info) => {
        if (request.current !== ticket) return;
        setCheck({ status: "idle" });
        onSet({ id: info.id, name: info.name });
      })
      .catch((err: unknown) => {
        if (request.current !== ticket) return;
        setCheck({ status: "error", message: err instanceof Error ? err.message : "The plugin could not be loaded." });
        // A plugin found to be an effect now carries that flag, so it drops out of this list.
        onRefreshPlugins();
      });
  };

  if (!available) {
    return (
      <PanelSection title="Plugin instrument" hint="Plays this clip through a VST3 or Audio Unit instrument such as Surge XT.">
        <p className="text-[11px] text-slate-400">
          Plugin hosting is not installed. Run the installer again with the editor extras to use instruments such as Surge XT.
        </p>
      </PanelSection>
    );
  }

  return (
    <PanelSection
      title="Plugin instrument"
      hint="Plays this clip's notes through an installed VST3 or Audio Unit instrument, in a separate process, and puts the sound on a new audio track."
    >
      <select
        className={fieldClass}
        aria-label="Plugin instrument"
        value={current?.id ?? ""}
        disabled={check.status === "checking" || session !== "none"}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">{candidates.length ? "None: the built-in synth plays" : "No plugins found"}</option>
        {current && !candidates.some((plugin) => plugin.id === current.id) ? <option value={current.id}>{current.name} (not found)</option> : null}
        {candidates.map((plugin) => (
          <option key={plugin.id} value={plugin.id}>
            {plugin.name} ({plugin.format.toUpperCase()})
          </option>
        ))}
      </select>
      {check.status === "checking" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Loading the plugin to check it is an instrument…
        </p>
      ) : null}
      {check.status === "error" ? (
        <p className="text-[11px] text-rose-300" role="alert">
          {check.message}
        </p>
      ) : null}
      {current ? (
        <>
          <SoundBrowser key={current.id} pluginId={current.id} current={current.soundName} onPick={onPickSound} />
          <PluginSoundFiles
            plugin={current.name}
            sound={current.state ? { name: current.soundName ?? `${current.name} sound`, state: current.state } : null}
            onImport={onImportSound}
          />
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              disabled={!hasNotes || playing}
              title={hasNotes ? "Loops this clip through the plugin on this computer's speakers" : "Add notes to the clip first"}
              onClick={() => {
                if (loopable) setWindowPlaying(true);
                onPlay();
              }}
            >
              <Play className="h-3.5 w-3.5" aria-hidden /> Play
            </ActionButton>
            <ActionButton
              disabled={!playing && session !== "live"}
              title={session === "live" ? "Turns the plugin off" : "Stops playing"}
              onClick={() => {
                setWindowPlaying(false);
                onStop();
              }}
            >
              <Square className="h-3.5 w-3.5" aria-hidden /> Stop
            </ActionButton>
          </div>
          <ActionButton
            className="w-full"
            disabled={session !== "none"}
            title="Starts the plugin without the loop, so your MIDI keyboard plays it. Record as usual to capture the notes."
            onClick={onLive}
          >
            <Piano className="h-3.5 w-3.5" aria-hidden /> Play it from your MIDI keyboard
          </ActionButton>
          <p className="text-[11px] leading-snug text-slate-400" role="status">
            {session === "listening" || loopable
              ? `${current.name} is on: a connected MIDI keyboard plays it. Press record to capture what you play as notes. `
              : ""}
            {session === "live" && !playing ? "Stop turns it off." : ""}
            {!hasNotes
              ? "Add notes to this clip to hear it through the plugin."
              : session === "starting"
                ? `Starting ${current.name}…`
                : playing
                  ? "Playing this clip in a loop through your speakers. Pick sounds to hear each one."
                  : session === "live"
                    ? ""
                    : "Play loops this clip through the plugin, so each sound you pick is heard straight away."}
          </p>
          {session === "window" ? (
            <>
              <p className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2 py-1.5 text-[11px] leading-snug text-cyan-100" role="status">
                {current.name}&apos;s window is open on this computer (it may be behind this one). Changes made there are kept.
              </p>
              <ActionButton variant="primary" className="w-full" onClick={onCloseWindow}>
                Keep this sound and close the window
              </ActionButton>
            </>
          ) : (
            <ActionButton
              className="w-full"
              disabled={busy || session !== "none"}
              title={session !== "none" ? "Press Stop first" : "Shape the sound in the plugin's own controls"}
              onClick={onOpenWindow}
            >
              Edit in {current.name}&apos;s window
            </ActionButton>
          )}
          <ActionButton variant="primary" className="w-full" disabled={busy} onClick={onRender}>
            Render this clip with {current.name}
          </ActionButton>
        </>
      ) : null}
      <InstrumentInstaller onInstalled={onRefreshPlugins} />
    </PanelSection>
  );
}

/** Searchable list of the plugin's own sounds (Surge XT's patch library), with favourites. */
export function SoundBrowser({
  pluginId,
  current,
  onPick,
  tall
}: {
  pluginId: string;
  current?: string;
  onPick: (sound: PluginSound) => void;
  /** A longer list, for pages with room. */
  tall?: boolean;
}) {
  const [sounds, setSounds] = useState<PluginSound[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const [favourites, setFavourites] = useState<string[]>(() => loadFavourites(pluginId));

  useEffect(() => {
    let cancelled = false;
    editorApi
      .pluginSounds(pluginId)
      .then((list) => !cancelled && setSounds(list.sounds))
      .catch(() => !cancelled && setSounds([]));
    return () => {
      cancelled = true;
    };
  }, [pluginId]);

  if (!sounds?.length) return null;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sounds.filter((sound) => {
    const text = `${sound.name} ${sound.category} ${sound.library}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const groups = new Map<string, PluginSound[]>();
  const starred = shown.filter((sound) => favourites.includes(sound.id));
  if (starred.length) groups.set("★ Favourites", starred);
  for (const sound of shown.slice(0, 600)) {
    const key = sound.library === "Factory" ? sound.category : `${sound.library}: ${sound.category}`;
    groups.set(key, [...(groups.get(key) ?? []), sound]);
  }
  const isFavourite = favourites.includes(picked);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>Sound</span>
        <span className="truncate pl-2 text-slate-200" title={current}>
          {current ?? "Plugin default"}
        </span>
      </div>
      <div className="flex gap-1.5">
        <input
          type="search"
          className={fieldClass}
          placeholder={`Search ${sounds.length} sounds: bass, pad, keys…`}
          aria-label="Search sounds"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          disabled={!picked}
          aria-pressed={isFavourite}
          aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
          title={picked ? (isFavourite ? "Remove from favourites" : "Keep this sound at the top of the list") : "Pick a sound first"}
          onClick={() => setFavourites(toggleFavourite(pluginId, picked))}
          className="inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40"
        >
          <Star className={`h-4 w-4 ${isFavourite ? "fill-amber-300 text-amber-300" : ""}`} aria-hidden />
        </button>
      </div>
      <select
        className={`${fieldClass} ${tall ? "h-[min(60vh,34rem)] text-sm" : "h-36"}`}
        size={tall ? 20 : 8}
        aria-label="Sounds"
        value={picked}
        onChange={(event) => {
          const sound = sounds.find((item) => item.id === event.target.value);
          setPicked(event.target.value);
          if (sound) onPick(sound);
        }}
      >
        {[...groups.entries()].map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map((sound) => (
              // A favourite is listed twice: its copy at the top needs its own key.
              <option key={`${group}-${sound.id}`} value={sound.id}>
                {sound.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="text-[11px] text-slate-500">
        {shown.length > 600 ? `Showing 600 of ${shown.length}: search to narrow down.` : `${shown.length} sounds.`} Use the arrow keys to step
        through them while playing. The star keeps a sound at the top.
      </p>
    </div>
  );
}

/** Save the plugin's current sound to a file, or open one. */
export function PluginSoundFiles({
  plugin,
  sound,
  onImport
}: {
  plugin: string;
  sound: { name: string; state: string } | null;
  onImport: (sound: { name: string; state: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const open = async (file: File | undefined) => {
    if (!file) return;
    setFailure(null);
    try {
      const read = await readSoundFile(file);
      if (read.kind !== "plugin") throw new Error("That is a Music Suite synth sound. Open it with Import in the synth's sound editor.");
      if (read.plugin !== plugin) throw new Error(`That sound is for ${read.plugin}, not ${plugin}.`);
      onImport({ name: read.name, state: read.state });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "That file could not be opened.");
    }
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          disabled={!sound}
          title={sound ? "Save this sound as a file, to back it up or share it" : "Pick or shape a sound first"}
          onClick={() => sound && exportSound({ kind: "plugin", plugin, name: sound.name, state: sound.state })}
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> Export sound
        </ActionButton>
        <ActionButton onClick={() => fileRef.current?.click()} title="Open a sound file saved with Export">
          <Upload className="h-3.5 w-3.5" aria-hidden /> Import sound
        </ActionButton>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={`${SOUND_FILE_EXTENSION},application/json`}
        className="hidden"
        aria-label="Plugin sound file to import"
        onChange={(event) => {
          void open(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {failure ? (
        <p role="alert" className="text-[11px] text-rose-300">
          {failure}
        </p>
      ) : null}
    </>
  );
}

/** One-click download of free instrument plugins that are not installed yet. */
function InstrumentInstaller({ onInstalled }: { onInstalled: () => void }) {
  const [offers, setOffers] = useState<InstrumentOffer[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const running = offers?.some((offer) => offer.running) ?? false;
  const installed = useEffectEvent(onInstalled);

  useEffect(() => {
    let cancelled = false;
    editorApi
      .instruments()
      .then((items) => !cancelled && setOffers(items))
      .catch(() => !cancelled && setOffers([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      editorApi
        .instruments()
        .then((items) => {
          if (cancelled) return;
          setOffers(items);
          if (!items.some((offer) => offer.running) && items.some((offer) => offer.installed)) installed();
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [running]);

  const install = (id: string) => {
    setFailure(null);
    editorApi
      .installInstrument(id)
      .then((offer) => setOffers((prev) => (prev ?? []).map((item) => (item.id === id ? { ...item, ...offer, running: true } : item))))
      .catch((err: unknown) => setFailure(err instanceof Error ? err.message : "The install could not start."));
  };

  const missing = (offers ?? []).filter((offer) => offer.supported && (!offer.installed || offer.running));
  if (!missing.length && !failure) return null;
  return (
    <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
      {failure ? (
        <p className="text-[11px] text-rose-300" role="alert">
          {failure}
        </p>
      ) : null}
      {missing.map((offer) => (
        <div key={offer.id} className="space-y-1.5">
          <p className="text-[11px] leading-snug text-slate-300">
            <strong>{offer.name}</strong> {offer.version}: {offer.summary}
          </p>
          {offer.running ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={offer.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Installing ${offer.name}`}>
                <div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${offer.percent}%` }} />
              </div>
              <p className="text-[11px] text-slate-400">{offer.detail}</p>
            </>
          ) : (
            <>
              {offer.error ? (
                <p className="text-[11px] text-rose-300" role="alert">
                  {offer.error}
                </p>
              ) : null}
              <p className="text-[11px] leading-snug text-slate-400">
                Downloads {megabytes(offer.download_bytes)} from the {offer.name} project&apos;s official releases on GitHub, checks it
                against a fixed fingerprint and installs it for your user only. Free software ({offer.license}); it runs on this
                computer when you use it.
              </p>
              <ActionButton className="w-full" onClick={() => install(offer.id)}>
                Install {offer.name} (free)
              </ActionButton>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
