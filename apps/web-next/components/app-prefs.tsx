"use client";

import { AppWindow, ExternalLink, Languages, PanelTopClose, PanelsTopLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { dockAll, reopenLayout, usePanels } from "@/components/detachable";
import { useI18n } from "@/lib/i18n";
import { LOCALES, THEMES, type ThemeId, isLocale } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { floatingPanels, openPageWindow, reopenFloating, setReopenFloating } from "@/lib/windows";

/** Workspaces that can open in a window of their own, with their paths. */
const WORKSPACES = [
  ["analyser", "/"],
  ["editor", "/editor"],
  ["studio", "/generate"],
  ["synth", "/synth"],
  ["models", "/models"],
  ["mapper", "/mapper"],
  ["help", "/help"]
] as const;

/** The language and colour-theme control shown in every workspace's header. */
export function AppPrefs({ className }: { className?: string }) {
  const { locale, setLocale, theme, setTheme, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panels = usePanels();
  const [autoReopen, setAutoReopen] = useState(reopenFloating);
  // The layout lives in this browser's storage; read while the menu is open (only in the browser).
  const remembered = open ? floatingPanels() : new Set<string>();
  const toReopen = panels.filter((panel) => remembered.has(panel.id) && !panel.detached).length;

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
        <span className="h-3 w-3 rounded-full border border-slate-400/60" style={{ background: THEMES.find((entry) => entry.id === theme)?.swatch }} aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t("prefs.button")}
          className="absolute right-0 top-11 z-[60] max-h-[80vh] w-72 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-3 text-xs text-slate-300 shadow-2xl"
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
                <span className="h-3.5 w-3.5 rounded-full border border-slate-400/60" style={{ background: entry.swatch }} aria-hidden />
                <span className="text-slate-100">{t(`prefs.themes.${entry.id}`)}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-[11px] text-slate-400">{t("prefs.note")}</p>
          <div className="space-y-1 border-t border-white/10 pt-3">
            <p className="flex items-center gap-1.5 font-semibold text-slate-200">
              <PanelsTopLeft className="h-3.5 w-3.5" aria-hidden /> {t("detach.menu.heading")}
            </p>
            {panels.length ? (
              <ul className="space-y-0.5">
                {panels.map((panel) => (
                  <li key={panel.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-800">
                    <span className={cn("min-w-0 flex-1 truncate", panel.detached ? "text-cyan-200" : "text-slate-100")} title={panel.title}>
                      {panel.title}
                    </span>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                      title={panel.detached ? t("detach.dockNamed", { panel: panel.title }) : t("detach.floatNamed", { panel: panel.title })}
                      onClick={() => (panel.detached ? panel.attach() : panel.detach())}
                    >
                      {panel.detached ? <PanelTopClose className="h-3 w-3" aria-hidden /> : <ExternalLink className="h-3 w-3" aria-hidden />}
                      {panel.detached ? t("detach.menu.dock") : t("detach.menu.float")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-400">{t("detach.menu.none")}</p>
            )}
            {panels.length ? (
              <div className="grid grid-cols-2 gap-1 pt-1">
                <button
                  type="button"
                  disabled={!toReopen}
                  className="rounded-lg bg-slate-800 px-2 py-1.5 text-left text-slate-100 hover:bg-slate-700 disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  onClick={() => {
                    if (reopenLayout() > 0) window.alert(t("detach.menu.blocked"));
                  }}
                >
                  {t("detach.menu.reopen")}
                </button>
                <button
                  type="button"
                  disabled={!panels.some((panel) => panel.detached)}
                  className="rounded-lg bg-slate-800 px-2 py-1.5 text-left text-slate-100 hover:bg-slate-700 disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  onClick={dockAll}
                >
                  {t("detach.menu.dockAll")}
                </button>
              </div>
            ) : null}
            <label className="flex cursor-pointer items-start gap-2 px-1 pt-1">
              <input
                type="checkbox"
                className="mt-0.5 accent-cyan-400"
                checked={autoReopen}
                onChange={(event) => {
                  setReopenFloating(event.target.checked);
                  setAutoReopen(event.target.checked);
                }}
              />
              <span className="text-slate-200">{t("detach.menu.auto")}</span>
            </label>
            <p className="text-[11px] text-slate-400">{t("detach.menu.note")}</p>
          </div>
          <div className="space-y-1 border-t border-white/10 pt-3">
            <p className="flex items-center gap-1.5 font-semibold text-slate-200">
              <AppWindow className="h-3.5 w-3.5" aria-hidden /> {t("windows.newWindow")}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {WORKSPACES.map(([id, path]) => (
                <button
                  key={id}
                  type="button"
                  className="truncate rounded-lg bg-slate-800 px-2 py-1.5 text-left text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                  title={`${t(`common.workspaces.${id}`)}: ${t("windows.newWindow")}`}
                  onClick={() => {
                    if (!openPageWindow(id, path)) window.alert(t("windows.blocked"));
                    setOpen(false);
                  }}
                >
                  {t(`common.workspaces.${id}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400">{t("windows.note")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
