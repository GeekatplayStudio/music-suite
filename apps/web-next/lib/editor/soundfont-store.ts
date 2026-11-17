/**
 * Remembers the SoundFont this browser is using.
 *
 * A `.sf2` file is tens of megabytes, too large for local storage, so the file the user picks
 * is kept in IndexedDB on this machine and reloaded the next time the editor opens. Nothing
 * is uploaded: the file never leaves the browser.
 */

import { type SoundFont, parseSoundFont, setSoundFont } from "@/lib/editor/soundfont";

const DB_NAME = "music-suite-soundfont";
const STORE = "files";
const KEY = "current";
/** Beyond this a font is more likely to exhaust the browser's storage than to play. */
export const MAX_SOUNDFONT_BYTES = 512 * 1024 * 1024;

interface StoredFont {
  name: string;
  data: ArrayBuffer;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store a SoundFont."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The browser's storage could not be opened."));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("The browser's storage refused the request."));
        transaction.oncomplete = () => db.close();
      })
  );
}

/** Parse a `.sf2` file, make it the editor's instrument bank, and remember it in this browser. */
export async function installSoundFont(file: File): Promise<SoundFont> {
  if (file.size > MAX_SOUNDFONT_BYTES) {
    throw new Error(`This SoundFont is ${Math.round(file.size / 1e6)} MB; the limit is ${Math.round(MAX_SOUNDFONT_BYTES / 1e6)} MB.`);
  }
  const data = await file.arrayBuffer();
  // Parse before storing, so a file that cannot be played is never kept.
  const font = parseSoundFont(data);
  setSoundFont(font);
  try {
    await run("readwrite", (store) => store.put({ name: file.name, data } satisfies StoredFont, KEY));
  } catch {
    // Playing now matters more than remembering; the user can pick the file again.
  }
  return font;
}

/** Load and apply the remembered SoundFont, if this browser has one. */
export async function restoreSoundFont(): Promise<SoundFont | null> {
  let stored: StoredFont | undefined;
  try {
    stored = await run<StoredFont | undefined>("readonly", (store) => store.get(KEY));
  } catch {
    return null;
  }
  if (!stored?.data) return null;
  try {
    const font = parseSoundFont(stored.data);
    setSoundFont(font);
    return font;
  } catch {
    // A font that no longer parses is dropped rather than asked for again every time.
    await forgetSoundFont();
    return null;
  }
}

export async function forgetSoundFont(): Promise<void> {
  setSoundFont(null);
  try {
    await run("readwrite", (store) => store.delete(KEY));
  } catch {
    // Nothing to undo: the font is already out of use for this session.
  }
}

/** The name of the remembered file, without loading or parsing it. */
export async function storedSoundFontName(): Promise<string | null> {
  try {
    const stored = await run<StoredFont | undefined>("readonly", (store) => store.get(KEY));
    return stored?.name ?? null;
  } catch {
    return null;
  }
}
