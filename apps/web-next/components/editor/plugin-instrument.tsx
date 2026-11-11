"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { ActionButton, PanelSection, fieldClass } from "@/components/editor/controls";
import { editorApi } from "@/lib/editor/api";
import type { InstrumentOffer, PluginInfo, Track } from "@/lib/editor/types";

type Check = { status: "idle" } | { status: "checking" } | { status: "error"; message: string };

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/**
 * Plays a MIDI clip's notes through an installed VST3 / Audio Unit instrument
 * (Surge XT and the like). The plugin runs in an isolated process on this computer;
 * the result lands on a new audio track.
 */
export function PluginInstrumentSection({
  track,
  available,
  plugins,
  busy,
  onSet,
  onOpenWindow,
  onRender,
  onRefreshPlugins
}: {
  track: Track;
  available: boolean;
  plugins: PluginInfo[];
  busy: boolean;
  onSet: (instrument: Track["pluginInstrument"]) => void;
  onOpenWindow: () => void;
  onRender: () => void;
  onRefreshPlugins: () => void;
}) {
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const request = useRef(0);
  const current = track.pluginInstrument;
  // Plugins already known to be effects are left out; unknown ones are checked when chosen.
  const candidates = plugins.filter((plugin) => plugin.is_instrument !== false);

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
        disabled={check.status === "checking"}
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
          <ActionButton className="w-full" disabled={busy} onClick={onOpenWindow}>
            Open {current.name}&apos;s window
          </ActionButton>
          <p className="text-[11px] leading-snug text-slate-400">
            Pick or shape a sound in the plugin&apos;s own window, then close it: the sound is kept with this track.
            {current.state ? " A sound is saved." : " Until then the plugin's default sound plays."}
          </p>
          <ActionButton variant="primary" className="w-full" disabled={busy} onClick={onRender}>
            Render this clip with {current.name}
          </ActionButton>
        </>
      ) : null}
      <InstrumentInstaller onInstalled={onRefreshPlugins} />
    </PanelSection>
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
