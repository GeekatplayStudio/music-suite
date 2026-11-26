"use client";

import { KeyboardMusic } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, IconButton, fieldClass } from "@/components/editor/controls";
import { midiHub } from "@/lib/editor/midi";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface MidiControlProps {
  /** The track the keyboard plays, or null when there is none to play. */
  targetName: string | null;
  /** True when the keyboard drives the track's vocoder or synth voice rather than its instrument. */
  playsVoice: boolean;
  /** True when the record button will capture keyboard notes rather than the microphone. */
  recordsNotes: boolean;
  onAddInstrument: () => void;
}

/** Header button for the MIDI keyboard: connection, device choice and what it is playing. */
export function MidiControl({ targetName, playsVoice, recordsNotes, onAddInstrument }: MidiControlProps) {
  const { t } = useI18n();
  const status = useSyncExternalStore(midiHub.watch, midiHub.snapshot, midiHub.serverSnapshot);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ledRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    void midiHub.connectIfAllowed();
    // The light flashes on every key; the Web Animations API keeps it off React's render path.
    return midiHub.subscribe((event) => {
      if (event.kind === "on") ledRef.current?.animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 220, easing: "ease-out" });
    });
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

  const ready = status.state === "ready";
  const listening = ready ? status.inputs.filter((input) => status.selected === "all" || input.id === status.selected) : [];
  const connected = listening.length > 0;
  const label = connected
    ? t("inspector.midiControl.connected", { names: listening.map((input) => input.name).join(", ") })
    : ready
      ? t("inspector.midiControl.noneFound")
      : t("inspector.midiControl.connect");

  let message: string;
  if (status.state === "unsupported") message = t("inspector.midiControl.unsupported");
  else if (status.state === "denied") message = t("inspector.midiControl.denied");
  else if (status.state === "connecting") message = t("inspector.midiControl.connecting");
  else if (!ready) message = t("inspector.midiControl.pressConnect");
  else if (!status.inputs.length) message = t("inspector.midiControl.noKeyboard");
  else message = t("inspector.midiControl.ready");

  return (
    <div ref={rootRef} className="relative">
      <IconButton label={label} active={open} onClick={() => setOpen((value) => !value)} aria-haspopup="dialog" aria-expanded={open}>
        <KeyboardMusic className="h-4 w-4" />
        <span
          ref={ledRef}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full opacity-25",
            connected ? "bg-emerald-400" : "bg-slate-500"
          )}
        />
      </IconButton>
      {open ? (
        <div
          role="dialog"
          aria-label={t("inspector.midiControl.title")}
          className="absolute left-0 top-11 z-50 w-80 space-y-2 rounded-xl border border-white/10 bg-slate-900 p-3 text-[11px] text-slate-300 shadow-2xl"
        >
          <h3 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-200">{t("inspector.midiControl.title")}</h3>
          <p className="leading-snug text-slate-400">{message}</p>
          {!ready && status.state !== "unsupported" ? (
            <ActionButton variant="primary" className="w-full" disabled={status.state === "connecting"} onClick={() => void midiHub.connect()}>
              {t("inspector.midiControl.connectButton")}
            </ActionButton>
          ) : null}
          {ready && status.inputs.length ? (
            <label className="block text-slate-400">
              {t("inspector.midiControl.listenTo")}
              <select className={`${fieldClass} mt-1`} value={status.selected} onChange={(event) => midiHub.select(event.target.value)} aria-label={t("inspector.midiControl.input")}>
                <option value="all">{t("inspector.midiControl.every")}</option>
                {status.inputs.map((input) => (
                  <option key={input.id} value={input.id}>
                    {input.name}
                  </option>
                ))}
                {status.selected !== "all" && !status.inputs.some((input) => input.id === status.selected) ? (
                  <option value={status.selected}>{t("inspector.midiControl.unplugged")}</option>
                ) : null}
              </select>
            </label>
          ) : null}
          <div className="rounded-lg bg-black/30 p-2 leading-snug">
            {targetName ? (
              <>
                <p>
                  {t("inspector.midiControl.plays")} <span className="font-semibold text-slate-100">{targetName}</span>
                  {playsVoice ? t("inspector.midiControl.playsVoice") : ""}
                </p>
                <p className="mt-1 text-slate-400">
                  {recordsNotes
                    ? t("inspector.midiControl.recordsNotes")
                    : t("inspector.midiControl.recordsHint")}
                </p>
              </>
            ) : (
              <p className="text-slate-400">{t("inspector.midiControl.selectTrack")}</p>
            )}
          </div>
          <ActionButton
            className="w-full"
            onClick={() => {
              onAddInstrument();
              setOpen(false);
            }}
          >
            {t("inspector.midiControl.addInstrument")}
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
