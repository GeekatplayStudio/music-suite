"use client";

import { Music4, Trash2, Upload } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import { gmFamilies, gmPatch, gmProgramName } from "@/lib/editor/gm";
import { currentSoundFont, watchSoundFont } from "@/lib/editor/soundfont";
import { forgetSoundFont, installSoundFont } from "@/lib/editor/soundfont-store";
import type { Synth } from "@/lib/editor/types";

const FAMILIES = gmFamilies();

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
      setFailure(err instanceof Error ? err.message : "This SoundFont could not be read.");
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
          <span>Play the General MIDI kit from the SoundFont instead of the built-in kit</span>
        </label>
      ) : (
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="w-16 shrink-0">Sound of</span>
          <select
            className={fieldClass}
            value={synth.program === undefined ? "" : String(synth.program)}
            aria-label="General MIDI instrument"
            onChange={(event) => pick(event.target.value)}
          >
            <option value="">This track&apos;s own synth sound</option>
            {FAMILIES.map((family) => (
              <optgroup key={family.family} label={family.family}>
                {family.programs.map((program) => (
                  <option key={program.program} value={String(program.program)}>
                    {program.name}
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
              Played by <span className="text-slate-200">{font.name}</span>
              {drums ? "" : `, as ${gmProgramName(synth.program)}`}. This is the instrument written to MIDI files.
            </>
          ) : (
            <>
              No SoundFont is loaded, so the built-in synthesizer plays its nearest sound. The instrument is still
              written to MIDI files.
            </>
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton disabled={busy} onClick={() => fileRef.current?.click()} title="Choose a SoundFont (.sf2) on this computer">
          {font ? <Music4 className="h-3.5 w-3.5" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
          {busy ? "Reading…" : font ? "Change SoundFont" : "Load a SoundFont (.sf2)"}
        </ActionButton>
        {font ? (
          <ActionButton
            variant="danger"
            disabled={busy}
            onClick={() => void forgetSoundFont()}
            title="Stop using this SoundFont and forget it"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
          </ActionButton>
        ) : null}
      </div>
      {font ? (
        <p className="text-[11px] text-slate-500">
          {font.programCount} instrument{font.programCount === 1 ? "" : "s"}
          {font.drums.length ? " and a drum kit" : ""}, kept in this browser only.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          A SoundFont holds the recorded sound of real instruments. The file stays in this browser and is never
          uploaded.
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".sf2"
        className="hidden"
        aria-label="SoundFont file to load"
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
