"use client";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import { TONE_BANKS, type Tone, midiOutHub } from "@/lib/editor/midi-out";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface VoicePickerProps {
  /** Null is "leave the keyboard on whatever sound it has". */
  tone: Tone | null;
  onChange: (tone: Tone | null) => void;
  /** Offer "the keyboard's current sound" as a choice. */
  allowNone?: boolean;
  /** Audition with drum hits instead of a chord. */
  drums?: boolean;
  label: string;
}

/** Play a short figure on the keyboard, in whatever sound it is on. */
export function auditionKeyboard(drums = false): void {
  const phrase = drums ? [36, 38, 42, 38] : [60, 64, 67];
  phrase.forEach((pitch, index) => {
    window.setTimeout(() => midiOutHub.noteOn(pitch, 0.8), index * 230);
    window.setTimeout(() => midiOutHub.noteOff(pitch), index * 230 + 200);
  });
}

/**
 * Choosing any sound the keyboard has: its bank, then the number within it, by stepping or
 * by typing. Every change is sent to the keyboard at once and played, so what is shown is
 * what is heard.
 */
export function VoicePicker({ tone, onChange, allowNone = false, drums = false, label }: VoicePickerProps) {
  const { t } = useI18n();
  const bank = tone ? (TONE_BANKS.find((entry) => entry.msb === tone.msb && entry.lsb === tone.lsb) ?? null) : null;
  const connected = midiOutHub.ready();

  const choose = (next: Tone) => {
    onChange(next);
    if (!midiOutHub.selectTone(next)) return;
    // The keyboard needs a moment to change sound before a note plays in the new one.
    window.setTimeout(() => auditionKeyboard(drums), 350);
  };

  const step = (by: number) => {
    const from = tone ?? { msb: TONE_BANKS[0].msb, lsb: TONE_BANKS[0].lsb, program: 1 };
    const within = TONE_BANKS.find((entry) => entry.msb === from.msb && entry.lsb === from.lsb) ?? TONE_BANKS[0];
    const program = ((from.program - 1 + by + within.programs) % within.programs) + 1;
    choose({ msb: within.msb, lsb: within.lsb, program });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={cn(fieldClass, "w-44")}
        aria-label={t("inspector.voicePicker.bank", { label })}
        value={tone ? `${tone.msb}/${tone.lsb}` : ""}
        onChange={(event) => {
          if (!event.target.value) return onChange(null);
          const [msb, lsb] = event.target.value.split("/").map(Number);
          choose({ msb, lsb, program: 1 });
        }}
      >
        {allowNone || !tone ? <option value="">{allowNone ? t("inspector.voicePicker.current") : t("inspector.voicePicker.chooseBank")}</option> : null}
        {TONE_BANKS.map((entry) => (
          <option key={entry.label} value={`${entry.msb}/${entry.lsb}`}>
            {entry.label}
          </option>
        ))}
        {tone && !bank ? (
          <option value={`${tone.msb}/${tone.lsb}`}>
            {t("inspector.voicePicker.fromKeyboard", { msb: tone.msb, lsb: tone.lsb })}
          </option>
        ) : null}
      </select>
      <ActionButton aria-label={t("inspector.voicePicker.previous")} disabled={!connected} onClick={() => step(-1)}>
        ◀
      </ActionButton>
      <input
        type="number"
        className={cn(fieldClass, "w-16 text-center font-mono tabular-nums")}
        aria-label={t("inspector.voicePicker.number", { label })}
        min={1}
        max={bank?.programs ?? 128}
        disabled={!tone}
        value={tone ? tone.program : ""}
        onChange={(event) => {
          const typed = Math.round(Number(event.target.value));
          if (!tone || !Number.isFinite(typed) || typed < 1 || typed > (bank?.programs ?? 128)) return;
          choose({ ...tone, program: typed });
        }}
      />
      <ActionButton aria-label={t("inspector.voicePicker.next")} disabled={!connected} onClick={() => step(1)}>
        ▶
      </ActionButton>
      <ActionButton
        disabled={!connected}
        onClick={() => {
          if (tone) {
            midiOutHub.selectTone(tone);
            window.setTimeout(() => auditionKeyboard(drums), 350);
          } else auditionKeyboard(drums);
        }}
      >
        {t("inspector.voicePicker.listen")}
      </ActionButton>
    </div>
  );
}
