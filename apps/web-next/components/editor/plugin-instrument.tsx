"use client";

import { Download, Loader2, Piano, Play, Square, Star, Upload } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { ActionButton, PanelSection, fieldClass } from "@/components/editor/controls";
import { editorApi } from "@/lib/editor/api";
import { SOUND_FILE_EXTENSION, exportSound, loadFavourites, readSoundFile, toggleFavourite } from "@/lib/editor/sound-file";
import type { InstrumentOffer, PluginInfo, PluginSound, Track } from "@/lib/editor/types";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
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
        setCheck({ status: "error", message: err instanceof Error ? err.message : t("synth.plugin.loadFailed") });
        // A plugin found to be an effect now carries that flag, so it drops out of this list.
        onRefreshPlugins();
      });
  };

  if (!available) {
    return (
      <PanelSection title={t("synth.plugin.title")} hint={t("synth.plugin.hintShort")}>
        <p className="text-[11px] text-slate-400">{t("synth.plugin.notInstalled")}</p>
      </PanelSection>
    );
  }

  return (
    <PanelSection
      title={t("synth.plugin.title")}
      hint={t("synth.plugin.hint")}
    >
      <select
        className={fieldClass}
        aria-label={t("synth.plugin.title")}
        value={current?.id ?? ""}
        disabled={check.status === "checking" || session !== "none"}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">{candidates.length ? t("synth.plugin.none") : t("synth.plugin.noneFound")}</option>
        {current && !candidates.some((plugin) => plugin.id === current.id) ? <option value={current.id}>{t("synth.plugin.notFound", { name: current.name })}</option> : null}
        {candidates.map((plugin) => (
          <option key={plugin.id} value={plugin.id}>
            {plugin.name} ({plugin.format.toUpperCase()})
          </option>
        ))}
      </select>
      {check.status === "checking" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t("synth.plugin.checking")}
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
            sound={current.state ? { name: current.soundName ?? t("synth.plugin.soundOf", { name: current.name }), state: current.state } : null}
            onImport={onImportSound}
          />
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              disabled={!hasNotes || playing}
              title={hasNotes ? t("synth.plugin.playTitle") : t("synth.plugin.addNotesFirst")}
              onClick={() => {
                if (loopable) setWindowPlaying(true);
                onPlay();
              }}
            >
              <Play className="h-3.5 w-3.5" aria-hidden /> {t("synth.plugin.play")}
            </ActionButton>
            <ActionButton
              disabled={!playing && session !== "live"}
              title={session === "live" ? t("synth.plugin.stopOff") : t("synth.plugin.stopPlaying")}
              onClick={() => {
                setWindowPlaying(false);
                onStop();
              }}
            >
              <Square className="h-3.5 w-3.5" aria-hidden /> {t("synth.plugin.stop")}
            </ActionButton>
          </div>
          <ActionButton
            className="w-full"
            disabled={session !== "none"}
            title={t("synth.plugin.liveTitle")}
            onClick={onLive}
          >
            <Piano className="h-3.5 w-3.5" aria-hidden /> {t("synth.plugin.live")}
          </ActionButton>
          <p className="text-[11px] leading-snug text-slate-400" role="status">
            {session === "listening" || loopable
              ? t("synth.plugin.isOn", { name: current.name })
              : ""}
            {session === "live" && !playing ? t("synth.plugin.stopTurnsOff") : ""}
            {!hasNotes
              ? t("synth.plugin.addNotes")
              : session === "starting"
                ? t("synth.plugin.starting", { name: current.name })
                : playing
                  ? t("synth.plugin.looping")
                  : session === "live"
                    ? ""
                    : t("synth.plugin.idle")}
          </p>
          {session === "window" ? (
            <>
              <p className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2 py-1.5 text-[11px] leading-snug text-cyan-100" role="status">
                {t("synth.plugin.windowOpen", { name: current.name })}
              </p>
              <ActionButton variant="primary" className="w-full" onClick={onCloseWindow}>
                {t("synth.plugin.keepClose")}
              </ActionButton>
            </>
          ) : (
            <ActionButton
              className="w-full"
              disabled={busy || session !== "none"}
              variant="primary"
              title={
                session !== "none"
                  ? t("synth.plugin.stopFirst")
                  : t("synth.plugin.fullTitle")
              }
              onClick={onOpenWindow}
            >
              {t("synth.plugin.openFull", { name: current.name })}
            </ActionButton>
          )}
          <ActionButton variant="primary" className="w-full" disabled={busy} onClick={onRender}>
            {t("synth.plugin.render", { name: current.name })}
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
  const { t, tp } = useI18n();
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
  if (starred.length) groups.set(t("synth.browser.favourites"), starred);
  for (const sound of shown.slice(0, 600)) {
    const key = sound.library === "Factory" ? sound.category : `${sound.library}: ${sound.category}`;
    groups.set(key, [...(groups.get(key) ?? []), sound]);
  }
  const isFavourite = favourites.includes(picked);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{t("synth.browser.sound")}</span>
        <span className="truncate pl-2 text-slate-200" title={current}>
          {current ?? t("synth.browser.pluginDefault")}
        </span>
      </div>
      <div className="flex gap-1.5">
        <input
          type="search"
          className={fieldClass}
          placeholder={t("synth.browser.search", { n: sounds.length })}
          aria-label={t("synth.browser.searchLabel")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          disabled={!picked}
          aria-pressed={isFavourite}
          aria-label={isFavourite ? t("synth.browser.removeFav") : t("synth.browser.addFav")}
          title={picked ? (isFavourite ? t("synth.browser.removeFav") : t("synth.browser.keepTop")) : t("synth.browser.pickFirst")}
          onClick={() => setFavourites(toggleFavourite(pluginId, picked))}
          className="inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:pointer-events-none disabled:opacity-40"
        >
          <Star className={`h-4 w-4 ${isFavourite ? "fill-amber-300 text-amber-300" : ""}`} aria-hidden />
        </button>
      </div>
      <select
        className={`${fieldClass} ${tall ? "h-[min(60vh,34rem)] text-sm" : "h-36"}`}
        size={tall ? 20 : 8}
        aria-label={t("synth.browser.list")}
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
        {shown.length > 600 ? t("synth.browser.showing", { n: shown.length }) : tp("synth.browser.count", shown.length)}{" "}
        {t("synth.browser.keysHint")}
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
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const open = async (file: File | undefined) => {
    if (!file) return;
    setFailure(null);
    try {
      const read = await readSoundFile(file);
      if (read.kind !== "plugin") throw new Error(t("synth.files.isSynth"));
      if (read.plugin !== plugin) throw new Error(t("synth.files.otherPlugin", { other: read.plugin, plugin }));
      onImport({ name: read.name, state: read.state });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : t("synth.files.openFailed"));
    }
  };
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          disabled={!sound}
          title={sound ? t("synth.files.exportTitle") : t("synth.files.shapeFirst")}
          onClick={() => sound && exportSound({ kind: "plugin", plugin, name: sound.name, state: sound.state })}
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> {t("synth.files.exportSound")}
        </ActionButton>
        <ActionButton onClick={() => fileRef.current?.click()} title={t("synth.files.importTitle")}>
          <Upload className="h-3.5 w-3.5" aria-hidden /> {t("synth.files.importSound")}
        </ActionButton>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={`${SOUND_FILE_EXTENSION},application/json`}
        className="hidden"
        aria-label={t("synth.files.fileLabel")}
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
  const { t } = useI18n();
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
      .catch((err: unknown) => setFailure(err instanceof Error ? err.message : t("synth.installer.startFailed")));
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
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={offer.percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("synth.installer.installing", { name: offer.name })}>
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
                {t("synth.installer.about", { size: megabytes(offer.download_bytes), name: offer.name, license: offer.license })}
              </p>
              <ActionButton className="w-full" onClick={() => install(offer.id)}>
                {t("synth.installer.install", { name: offer.name })}
              </ActionButton>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
