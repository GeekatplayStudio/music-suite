/**
 * Windows of Music Suite's own: where each one was, putting it back there (on another monitor
 * when the browser allows window placement), and opening a whole workspace or tab as a window.
 *
 * Used by pop-out panels (components/detachable.tsx) and by "Open in a new window", which opens
 * a page of the app in a window named "music-suite-page-<id>". That page remembers its own
 * place (WindowMemory in the root layout), so it opens there next time.
 */

const PAGE_PREFIX = "music-suite-page-";

/** Saved per window id: panels use their own id, whole pages "page-<id>". */
const geometryKey = (id: string) => `music-suite:popout-geometry:${id}`;

/** A window's place on the desktop: screen coordinates and inner size. */
export interface Geometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function savedGeometry(id: string): Geometry | null {
  try {
    const value = JSON.parse(localStorage.getItem(geometryKey(id)) ?? "null") as Geometry | null;
    if (value && [value.left, value.top, value.width, value.height].every(Number.isFinite) && value.width >= 200 && value.height >= 120) {
      return value;
    }
  } catch {
    /* nothing saved, or storage unavailable */
  }
  return null;
}

/** Remember where the window is now; returns what was saved so callers can skip repeats. */
export function saveGeometry(id: string, win: Window, last: string): string {
  try {
    if (win.closed || win.innerWidth < 200 || win.innerHeight < 120) return last;
    const value = JSON.stringify({ left: win.screenX, top: win.screenY, width: win.innerWidth, height: win.innerHeight });
    if (value !== last) localStorage.setItem(geometryKey(id), value);
    return value;
  } catch {
    return last;
  }
}

interface ScreenArea {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
}

/**
 * With several monitors, ask for window placement (once; the browser remembers the answer) and
 * then put the window back where it was, or on a screen other than the main page's the first
 * time. Without the permission, browsers keep pop-ups on the opener's screen.
 */
export async function placeWindow(win: Window, saved: Geometry | null, size: { width: number; height: number }): Promise<void> {
  const host = window as Window & { getScreenDetails?: () => Promise<{ screens: ScreenArea[]; currentScreen: ScreenArea }> };
  const extended = (window.screen as Screen & { isExtended?: boolean }).isExtended;
  if (!host.getScreenDetails || !extended) return;
  try {
    const details = await host.getScreenDetails();
    if (win.closed) return;
    if (saved) {
      win.moveTo(saved.left, saved.top);
      return;
    }
    const other = details.screens.find((entry) => entry !== details.currentScreen);
    if (!other) return;
    const width = Math.min(size.width, other.availWidth - 80);
    const height = Math.min(size.height, other.availHeight - 80);
    win.moveTo(other.availLeft + Math.round((other.availWidth - width) / 2), other.availTop + Math.round((other.availHeight - height) / 2));
    win.resizeTo(width, height);
  } catch {
    /* permission refused or not available: the window stays where the browser put it */
  }
}

/**
 * Open a page of the app (a workspace, or a tab of one) in a window of its own, where that
 * window was last time. Returns false when the browser blocked it.
 */
export function openPageWindow(id: string, url: string, size = { width: 1280, height: 860 }): boolean {
  const key = `page-${id}`;
  const saved = savedGeometry(key);
  const place = saved ? `,left=${saved.left},top=${saved.top}` : "";
  const features = `popup,width=${saved?.width ?? size.width},height=${saved?.height ?? size.height}${place}`;
  const win = window.open(url, PAGE_PREFIX + id, features);
  if (!win) return false;
  win.focus();
  void placeWindow(win, saved, size);
  return true;
}

/** In a window opened by openPageWindow: its id, so it can remember its own place. */
export function pageWindowId(): string | null {
  return typeof window !== "undefined" && window.name.startsWith(PAGE_PREFIX) ? window.name.slice(PAGE_PREFIX.length) : null;
}

/**
 * The window an element is drawn in: the main page's, or a floating panel's. Animation frames,
 * size watching and "click elsewhere" listeners must come from that window, because the main
 * page stops drawing when it is minimised or covered while a panel on another monitor is not.
 */
export function viewOf(node: Node | null | undefined): Window & typeof globalThis {
  return (node?.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined) ?? window;
}

const FLOATING_KEY = "music-suite:floating-panels";
const REOPEN_KEY = "music-suite:reopen-floating";

/** The panels that were floating when last used (their ids), to reopen them as a layout. */
export function floatingPanels(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(FLOATING_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberFloating(id: string, floating: boolean): void {
  try {
    const ids = floatingPanels();
    if (floating) ids.add(id);
    else ids.delete(id);
    localStorage.setItem(FLOATING_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* storage unavailable: the layout is not remembered */
  }
}

/** Whether floating panels open again by themselves when their page opens (needs pop-ups allowed). */
export function reopenFloating(): boolean {
  try {
    return localStorage.getItem(REOPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setReopenFloating(on: boolean): void {
  try {
    if (on) localStorage.setItem(REOPEN_KEY, "1");
    else localStorage.removeItem(REOPEN_KEY);
  } catch {
    /* storage unavailable */
  }
}
