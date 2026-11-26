"use client";

/**
 * A panel that can leave the page for a window of its own, to put on another monitor.
 *
 * The window is opened by this page and the panel is rendered into it with a React portal, so
 * it is still the same component tree: the same state, playback and edits, with nothing to
 * keep in step. Closing the window brings the panel back. Styles, the colour theme and the
 * language follow the main page; keys typed in the window that the panel does not use (Space,
 * undo, the editor's shortcuts) are passed on to the main page.
 *
 * Each extra window is another browser page to draw, so the first pop-out explains the cost.
 */

import { ExternalLink, PanelTopClose } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useI18n } from "@/lib/i18n";

const WARNED_KEY = "music-suite:popout-warned";
const open = new Map<string, Window>();

function copyStyles(from: Document, to: Document): void {
  for (const node of Array.from(from.querySelectorAll('link[rel="stylesheet"], style'))) {
    to.head.appendChild(node.cloneNode(true));
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

/** Close every popped-out window, for example when the main page goes away. */
function closeAll(): void {
  for (const win of open.values()) win.close();
  open.clear();
}

if (typeof window !== "undefined") window.addEventListener("pagehide", closeAll);

export interface DetachState {
  detached: boolean;
  /** Open the panel in its own window. Returns false when the browser blocked the window. */
  detach: () => boolean;
  /** Bring the panel back into the page. */
  attach: () => void;
  /** Wrap the panel's content: inline when attached, in the window when detached. */
  render: (content: ReactNode) => ReactNode;
}

/**
 * Make a panel detachable. `id` names its window (one per panel); `title` is the window title;
 * `size` is the window's first size.
 */
export function useDetachable(id: string, title: string, size = { width: 900, height: 640 }): DetachState {
  const { t } = useI18n();
  const [target, setTarget] = useState<{ win: Window; root: HTMLElement } | null>(null);

  const attach = useCallback(() => {
    const win = open.get(id);
    open.delete(id);
    win?.close();
    setTarget(null);
  }, [id]);

  const detach = useCallback(() => {
    try {
      if (!localStorage.getItem(WARNED_KEY)) {
        // Shown once per browser: each window is another page for the computer to draw.
        if (!window.confirm(t("detach.warning"))) return false;
        localStorage.setItem(WARNED_KEY, "1");
      }
    } catch {
      /* storage unavailable: no warning memory, carry on */
    }
    const features = `popup,width=${size.width},height=${size.height}`;
    const win = window.open("", `music-suite-${id}`, features);
    if (!win) return false;
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
    setTarget({ win, root });
    return true;
  }, [id, size.width, size.height, t, title]);

  // While detached: follow the main page's theme and language, pass unused keys back, and
  // come home when the window is closed.
  useEffect(() => {
    if (!target) return;
    const { win } = target;
    const observer = new MutationObserver(() => mirrorRoot(document, win.document));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "lang", "data-theme"] });
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
      setTarget(null);
    };
    win.addEventListener("pagehide", gone);
    // pagehide is not always delivered for windows closed by the user: check as well.
    const timer = window.setInterval(() => win.closed && gone(), 500);
    return () => {
      observer.disconnect();
      win.removeEventListener("keydown", forward);
      win.removeEventListener("keyup", forward);
      win.removeEventListener("pagehide", gone);
      window.clearInterval(timer);
    };
  }, [target, id]);

  // Leaving the page that owns the panel closes its window.
  useEffect(() => () => open.get(id)?.close(), [id]);

  const render = useCallback(
    (content: ReactNode) => (target ? createPortal(content, target.root) : content),
    [target]
  );

  return { detached: target !== null, detach, attach, render };
}

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
      className={
        className ??
        "inline-flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
      }
    >
      {state.detached ? <PanelTopClose className="h-4 w-4" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
    </button>
  );
}

/** Shown in the page where a detached panel used to be. */
export function DetachedPlaceholder({ state, label }: { state: DetachState; label: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-400">
      <span>{t("detach.away", { panel: label })}</span>
      <button type="button" className="rounded px-2 py-0.5 text-cyan-300 hover:bg-slate-800" onClick={state.attach}>
        {t("detach.bringBack")}
      </button>
    </div>
  );
}
