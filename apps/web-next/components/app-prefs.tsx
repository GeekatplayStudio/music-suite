"use client";

import { Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { LOCALES, THEMES, type ThemeId, isLocale } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/** The language and colour-theme control shown in every workspace's header. */
export function AppPrefs({ className }: { className?: string }) {
  const { locale, setLocale, theme, setTheme, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("prefs.button")}
        aria-label={t("prefs.button")}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        <Languages className="h-4 w-4" aria-hidden />
        {locale.toUpperCase()}
        <span className="h-3 w-3 rounded-full border border-white/30" style={{ background: THEMES.find((entry) => entry.id === theme)?.swatch }} aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t("prefs.button")}
          className="absolute right-0 top-11 z-[60] w-64 space-y-3 rounded-xl border border-white/10 bg-slate-900 p-3 text-xs text-slate-300 shadow-2xl"
        >
          <label className="block space-y-1">
            <span className="font-semibold text-slate-200">{t("prefs.language")}</span>
            <select
              className="h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-sm text-slate-100"
              value={locale}
              onChange={(event) => isLocale(event.target.value) && setLocale(event.target.value)}
            >
              {LOCALES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="space-y-1">
            <legend className="font-semibold text-slate-200">{t("prefs.theme")}</legend>
            {THEMES.map((entry) => (
              <label key={entry.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-800">
                <input
                  type="radio"
                  name="ms-theme"
                  className="accent-cyan-400"
                  checked={theme === entry.id}
                  onChange={() => setTheme(entry.id as ThemeId)}
                />
                <span className="h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: entry.swatch }} aria-hidden />
                <span className="text-slate-100">{t(`prefs.themes.${entry.id}`)}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-[11px] text-slate-400">{t("prefs.note")}</p>
        </div>
      ) : null}
    </div>
  );
}
