"use client";

import { Music4, Trash2, Upload } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import { gmFamilies, gmPatch, gmProgramName } from "@/lib/editor/gm";
import { currentSoundFont, watchSoundFont } from "@/lib/editor/soundfont";
import { forgetSoundFont, installSoundFont } from "@/lib/editor/soundfont-store";
import type { Synth } from "@/lib/editor/types";
import { type I18n, type MessageKey, useI18n } from "@/lib/i18n";

const FAMILIES = gmFamilies();

/** A General MIDI name in the interface language, by its number, falling back to English. */
function gmText(t: I18n["t"], key: string, english: string): string {
  const found = t(`inspector.gm.${key}` as MessageKey);
  return found === `inspector.gm.${key}` ? english : found;
}

function programName(t: I18n["t"], program: number): string {
  return gmText(t, `programs.p${program}`, gmProgramName(program));
}

function serverSnapshot(): null {
  return null;
}

/** Back to the track's own sound: with no program there is no instrument to look up. */
function withoutProgram(synth: Synth): Synth {
  return { kind: synth.kind, patch: synth.patch };
}

/** The SoundFont in use, re-read whenever one is loaded or removed. */
export function useSoundFont() {
  return useSyncExternalStore(watchSoundFont, currentSoundFont, serverSnapshot);
}

/**
 * Choosing the instrument a MIDI track plays: a General MIDI program, plus the SoundFont
 * that gives those programs their real recorded sound.
 */
export function GmInstrumentSection({ synth, onSet }: { synth: Synth; onSet: (synth: Synth) => void }) {
  const { t, tp } = useI18n();
  const font = useSoundFont();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const drums = synth.kind === "drums";

  const load = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setFailure(null);
    try {
      await installSoundFont(file);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : t("inspector.gm.readFailed"));
    }
    setBusy(false);
  };

  const pick = (value: string) => {
    if (!value) {
      onSet(withoutProgram(synth));
      return;
    }
    const program = Number(value);
    onSet({ ...synth, program, patch: drums ? synth.patch : gmPatch(program) });
  };

  return (
    <>
      {drums ? (
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-cyan-400"
            checked={synth.program !== undefined}
            onChange={(event) => onSet(event.target.checked ? { ...synth, program: 0 } : withoutProgram(synth))}
          />
          <span>{t("inspector.gm.drumsKit")}</span>
        </label>
      ) : (
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="w-16 shrink-0">{t("inspector.gm.soundOf")}</span>
          <select
            className={fieldClass}
            value={synth.program === undefined ? "" : String(synth.program)}
            aria-label={t("inspector.gm.label")}
            onChange={(event) => pick(event.target.value)}
          >
            <option value="">{t("inspector.gm.own")}</option>
            {FAMILIES.map((family, index) => (
              <optgroup key={family.family} label={gmText(t, `families.f${index}`, family.family)}>
                {family.programs.map((program) => (
                  <option key={program.program} value={String(program.program)}>
                    {gmText(t, `programs.p${program.program}`, program.name)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {synth.program !== undefined ? (
        <p className="text-[11px] leading-snug text-slate-400">
          {font ? (
            <>
              {t("inspector.gm.playedBy")}
              <span className="text-slate-200">{font.name}</span>
              {drums ? "" : t("inspector.gm.asProgram", { name: programName(t, synth.program) })}
              {t("inspector.gm.writtenToMidi")}
            </>
          ) : (
            <>
              {t("inspector.gm.noFont")}
            </>
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton disabled={busy} onClick={() => fileRef.current?.click()} title={t("inspector.gm.chooseTitle")}>
          {font ? <Music4 className="h-3.5 w-3.5" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
          {busy ? t("inspector.gm.reading") : font ? t("inspector.gm.change") : t("inspector.gm.load")}
        </ActionButton>
        {font ? (
          <ActionButton
            variant="danger"
            disabled={busy}
            onClick={() => void forgetSoundFont()}
            title={t("inspector.gm.removeTitle")}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t("inspector.gm.remove")}
          </ActionButton>
        ) : null}
      </div>
      {font ? (
        <p className="text-[11px] text-slate-500">
          {tp("inspector.gm.count", font.programCount)}
          {font.drums.length ? t("inspector.gm.andKit") : ""}
          {t("inspector.gm.kept")}
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          {t("inspector.gm.about")}
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".sf2"
        className="hidden"
        aria-label={t("inspector.gm.fileLabel")}
        onChange={(event) => {
          void load(event.target.files?.[0]);
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
