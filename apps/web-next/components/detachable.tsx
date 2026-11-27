"use client";

/**
 * Panels that can leave the page for a window of their own ("float"), to arrange the screen
 * the way you like or put a panel on another monitor.
 *
 * The window is opened by this page and the panel is rendered into it with a React portal, so
 * it is still the same component tree: the same state, playback and edits, with nothing to
 * keep in step. Closing the window brings the panel back. Styles, the colour theme and the
 * language follow the main page; keys typed in the window that the panel does not use (Space,
 * undo, the editor's shortcuts) are passed on to the main page.
 *
 * Each extra window is another browser page to draw, so the first pop-out explains the cost.
 *
 * Where each panel's window was and how big it was is kept per browser, so it opens there next
 * time. With more than one monitor, the browser is asked once for window placement (Chrome and
 * Edge), which lets a window open on, or come back to, a screen other than the main page's.
 * Which panels were floating is kept too: the language and colours menu lists the page's panels
 * and can reopen that layout (or does so by itself when the page opens, if asked to).
 */

import { ExternalLink, PanelTopClose } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { floatingPanels, placeWindow, rememberFloating, reopenFloating, saveGeometry, savedGeometry } from "@/lib/windows";

const WARNED_KEY = "music-suite:popout-warned";
const open = new Map<string, Window>();
/** Set while the main page is going away: its windows close, but the layout is kept. */
let unloading = false;

/**
 * Copy the page's styles into the window. Some libraries (charts) add their rules straight
 * into a stylesheet rather than as text, so a <style> is copied from its live rules, not its
 * text. Called again whenever the page's styles change.
 */
function copyStyles(from: Document, to: Document): void {
  for (const old of Array.from(to.head.querySelectorAll("[data-copied-style]"))) old.remove();
  for (const node of Array.from(from.querySelectorAll('link[rel="stylesheet"], style'))) {
    let copy: Element;
    if (node instanceof HTMLStyleElement) {
      copy = to.createElement("style");
      let rules = node.textContent ?? "";
      try {
        const live = node.sheet ? Array.from(node.sheet.cssRules, (rule) => rule.cssText).join(" ") : "";
        if (live.length > rules.length) rules = live;
      } catch {
        /* rules not readable: keep the text */
      }
      copy.textContent = rules;
    } else {
      copy = node.cloneNode(true) as Element;
    }
    copy.setAttribute("data-copied-style", "");
    to.head.appendChild(copy);
  }
}

function mirrorRoot(from: Document, to: Document): void {
  const source = from.documentElement;
  const target = to.documentElement;
  target.className = source.className;
  target.lang = source.lang;
  if (source.dataset.theme) target.dataset.theme = source.dataset.theme;
  else delete target.dataset.theme;
  to.body.className = from.body.className;
}

/** The window's title follows the panel's name (it changes with the language). */
function nameWindow(win: Window, title: string): void {
  const text = `${title} | Music Suite`;
  if (win.document.title !== text) win.document.title = text;
}

/** Close every popped-out window, for example when the main page goes away. */
function closeAll(): void {
  unloading = true;
  for (const win of open.values()) win.close();
  open.clear();
}

if (typeof window !== "undefined") window.addEventListener("pagehide", closeAll);

/* ---- The panels on the page, for the language and colours menu ---- */

export interface PanelEntry {
  id: string;
  title: string;
  detached: boolean;
  detach: (options?: DetachOptions) => boolean;
  attach: () => void;
}

const registry = new Map<string, PanelEntry>();
const listeners = new Set<() => void>();
let snapshot: PanelEntry[] = [];
const NONE: PanelEntry[] = [];

function publish(): void {
  snapshot = Array.from(registry.values());
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Every panel on the page that can float, in page order. */
export function usePanels(): PanelEntry[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => NONE);
}

export interface DetachOptions {
  /** No alert when the browser blocks the window (when reopening several at once). */
  quiet?: boolean;
}

export interface DetachState {
  detached: boolean;
  /** The panel's name, for buttons and the placeholder. */
  title: string;
  /** The panel's own window while detached: its animation frames, size and menus. */
  window: Window | null;
  /** Open the panel in its own window. Returns false when the browser blocked the window. */
  detach: (options?: DetachOptions) => boolean;
  /** Bring the panel back into the page. */
  attach: () => void;
  /** Wrap the panel's content: inline when attached, in the window when detached. */
  render: (content: ReactNode) => ReactNode;
}

/**
 * Make a panel detachable. `id` names its window (one per panel, unique in the app); `title`
 * is the window title and the panel's name in menus; `size` is the window's first size;
 * `listed` is false while the panel is not on the page (it is then left out of the menu).
 */
export function useDetachable(id: string, title: string, size = { width: 900, height: 640 }, listed = true): DetachState {
  const { t } = useI18n();
  const [target, setTarget] = useState<{ win: Window; root: HTMLElement } | null>(null);

  const attach = useCallback(() => {
    const win = open.get(id);
    open.delete(id);
    if (win) saveGeometry(id, win, "");
    win?.close();
    rememberFloating(id, false);
    setTarget(null);
  }, [id]);

  const detach = useCallback(
    (options?: DetachOptions) => {
      const existing = open.get(id);
      if (existing && !existing.closed) return true;
      try {
        if (!localStorage.getItem(WARNED_KEY)) {
          // Shown once per browser: each window is another page for the computer to draw.
          if (!window.confirm(t("detach.warning"))) return false;
          localStorage.setItem(WARNED_KEY, "1");
        }
      } catch {
        /* storage unavailable: no warning memory, carry on */
      }
      const saved = savedGeometry(id);
      const place = saved ? `,left=${saved.left},top=${saved.top}` : "";
      const features = `popup,width=${saved?.width ?? size.width},height=${saved?.height ?? size.height}${place}`;
      const win = window.open("", `music-suite-${id}`, features);
      if (!win) {
        if (!options?.quiet) window.alert(t("detach.blocked"));
        return false;
      }
      void placeWindow(win, saved, { width: size.width, height: size.height });
      const doc = win.document;
      doc.head.replaceChildren();
      doc.body.replaceChildren();
      // Set after the head is cleared, which would remove it.
      doc.title = `${title} | Music Suite`;
      const meta = doc.createElement("meta");
      meta.setAttribute("name", "viewport");
      meta.setAttribute("content", "width=device-width, initial-scale=1");
      doc.head.appendChild(meta);
      copyStyles(document, doc);
      mirrorRoot(document, doc);
      doc.body.style.margin = "0";
      const root = doc.createElement("div");
      root.className = "flex h-screen min-h-0 flex-col";
      doc.body.appendChild(root);
      open.set(id, win);
      rememberFloating(id, true);
      setTarget({ win, root });
      return true;
    },
    [id, size.width, size.height, t, title]
  );

  // While detached: follow the main page's theme and language, pass unused keys back, and
  // come home when the window is closed.
  useEffect(() => {
    if (!target) return;
    const { win } = target;
    nameWindow(win, title);
    const observer = new MutationObserver(() => mirrorRoot(document, win.document));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "lang", "data-theme"] });
    // Styles added to the page later (charts, a new screen's CSS) are copied over too, and the
    // panel is told to measure itself again once they have loaded.
    let styleTimer = 0;
    const resync = () => {
      window.clearTimeout(styleTimer);
      styleTimer = window.setTimeout(() => {
        if (win.closed) return;
        copyStyles(document, win.document);
        window.dispatchEvent(new Event("resize"));
      }, 250);
    };
    const styles = new MutationObserver(resync);
    styles.observe(document.head, { childList: true, subtree: true, characterData: true });
    const settle = [600, 2000, 5000].map((delay) => window.setTimeout(resync, delay));
    // Charts and canvases listen for resizing on the main page: pass the window's on.
    const resized = () => window.dispatchEvent(new Event("resize"));
    win.addEventListener("resize", resized);
    const forward = (event: KeyboardEvent) => {
      // Elements in the other window are not instances of this window's HTMLElement.
      const element = event.target as Element | null;
      const field = typeof element?.closest === "function" && element.closest("input, textarea, select, [contenteditable]");
      if (event.defaultPrevented || field) return;
      window.dispatchEvent(
        new KeyboardEvent(event.type, {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          repeat: event.repeat,
          bubbles: true,
          cancelable: true
        })
      );
    };
    win.addEventListener("keydown", forward);
    win.addEventListener("keyup", forward);
    const gone = () => {
      if (open.get(id) === win) open.delete(id);
      // Closed by the user (not because the main page is going): it is docked again.
      if (!unloading) rememberFloating(id, false);
      setTarget(null);
    };
    win.addEventListener("pagehide", gone);
    // pagehide is not always delivered for windows closed by the user: check as well, and keep
    // note of where the window is for next time.
    let last = "";
    const timer = window.setInterval(() => {
      if (win.closed) gone();
      else last = saveGeometry(id, win, last);
    }, 500);
    return () => {
      observer.disconnect();
      styles.disconnect();
      window.clearTimeout(styleTimer);
      settle.forEach((timer) => window.clearTimeout(timer));
      win.removeEventListener("resize", resized);
      win.removeEventListener("keydown", forward);
      win.removeEventListener("keyup", forward);
      win.removeEventListener("pagehide", gone);
      window.clearInterval(timer);
    };
  }, [target, id, title]);

  // Leaving the page that owns the panel closes its window (the layout keeps it as floating).
  useEffect(() => () => open.get(id)?.close(), [id]);

  // Listed in the language and colours menu while on the page.
  const detached = target !== null;
  const shown = listed || detached;
  useEffect(() => {
    if (shown) registry.set(id, { id, title, detached, detach, attach });
    else if (!registry.delete(id)) return;
    publish();
  }, [id, title, detached, detach, attach, shown]);
  useEffect(
    () => () => {
      registry.delete(id);
      publish();
    },
    [id]
  );

  // Floating last time, and asked to reopen floating panels with their page.
  useEffect(() => {
    if (!listed || !reopenFloating() || !floatingPanels().has(id)) return;
    const timer = window.setTimeout(() => detach({ quiet: true }), 0);
    return () => window.clearTimeout(timer);
    // Only when the panel first appears on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, listed]);

  const render = useCallback(
    (content: ReactNode) => (target ? createPortal(content, target.root) : content),
    [target]
  );

  return { detached, title, window: target?.win ?? null, detach, attach, render };
}

/**
 * Reopen the panels that were floating last time and are on this page. Returns how many the
 * browser blocked: it allows one new window per click unless pop-ups are allowed for the app.
 */
export function reopenLayout(): number {
  const ids = floatingPanels();
  let blocked = 0;
  for (const entry of registry.values()) {
    if (ids.has(entry.id) && !entry.detached && !entry.detach({ quiet: true })) blocked += 1;
  }
  return blocked;
}

/** Bring every floating panel on this page back into it. */
export function dockAll(): void {
  for (const entry of registry.values()) if (entry.detached) entry.attach();
}

const BUTTON =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300";

/** The button that sends a panel to its own window, or brings it back. */
export function DetachButton({ state, label, className }: { state: DetachState; label: string; className?: string }) {
  const { t } = useI18n();
  const text = state.detached ? t("detach.attach", { panel: label }) : t("detach.detach", { panel: label });
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      onClick={() => (state.detached ? state.attach() : state.detach())}
      className={className ?? BUTTON}
    >
      {state.detached ? <PanelTopClose className="h-4 w-4" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
    </button>
  );
}

/** Shown in the page where a detached panel used to be. */
export function DetachedPlaceholder({ state, label, className }: { state: DetachState; label: string; className?: string }) {
  const { t } = useI18n();
  return (
    <div
      className={
        className ??
        "flex items-center justify-between gap-2 border-t border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-400"
      }
    >
      <span>{t("detach.away", { panel: label })}</span>
      <button type="button" className="rounded px-2 py-0.5 text-cyan-300 hover:bg-slate-800" onClick={state.attach}>
        {t("detach.bringBack")}
      </button>
    </div>
  );
}

/* ---- Any section of a page as a floating panel ---- */

const FloatContext = createContext<DetachState | null>(null);

/**
 * A section of a page that can float in a window of its own. Put a <FloatButton /> in the
 * section's heading (it finds this panel); without a heading, `corner` places it top-right.
 * `className` is for the section's place in the page (grid columns), `floatingClassName` for
 * the window.
 */
export function Floatable({
  id,
  title,
  size,
  className,
  floatingClassName,
  corner = false,
  children
}: {
  id: string;
  title: string;
  size?: { width: number; height: number };
  className?: string;
  floatingClassName?: string;
  corner?: boolean;
  children: ReactNode;
}) {
  const state = useDetachable(id, title, size);
  return (
    <FloatContext.Provider value={state}>
      {state.detached ? (
        <DetachedPlaceholder
          state={state}
          label={title}
          className={cn(
            "flex items-center justify-between gap-2 rounded-2xl border border-dashed border-white/15 bg-slate-950/40 px-4 py-3 text-xs text-slate-400",
            className
          )}
        />
      ) : null}
      {state.render(
        <div className={state.detached ? cn("relative min-h-0 flex-1 overflow-auto bg-slate-950 p-3", floatingClassName) : cn(corner && "relative", className)}>
          {children}
          {/* Positioned only for the corner button: a positioned panel would paint over menus above it. */}
          {corner ? <FloatButton className="absolute right-2 top-2 z-10" /> : null}
        </div>
      )}
    </FloatContext.Provider>
  );
}

/** The float / bring-back button of the Floatable it is in (nothing outside one). */
export function FloatButton({ className }: { className?: string }) {
  const state = useContext(FloatContext);
  const { t } = useI18n();
  if (!state) return null;
  const text = state.detached ? t("detach.dockNamed", { panel: state.title }) : t("detach.floatNamed", { panel: state.title });
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      onClick={() => (state.detached ? state.attach() : state.detach())}
      className={cn(BUTTON, "h-6 w-6 text-slate-400", className)}
    >
      {state.detached ? <PanelTopClose className="h-3.5 w-3.5" aria-hidden /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}
