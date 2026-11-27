/**
 * Messages from the Python backend (errors, job progress, install and setup steps) in the
 * interface's language. The backend always speaks English; this looks each message up in a
 * catalogue: word for word, then as a pattern with values in it (whose values are looked up
 * too, so "Install failed: Unknown model." translates both halves), then sentence by sentence.
 * Anything not in the catalogue stays as the backend wrote it. No React: the API helpers call
 * it, and it reads the language from <html lang>.
 */

type Catalogue = { exact: Record<string, string>; patterns: [RegExp, string][]; keep: ReadonlySet<string> };
type CatalogueModule = { EXACT: Record<string, string>; PATTERNS: [string, string][]; KEEP: ReadonlySet<string> };

/**
 * One catalogue per language (server-messages-<locale>.ts), each loaded the first time that
 * language is used so the others are not downloaded. Until it arrives, messages stay English.
 */
const LOADERS: Record<string, () => Promise<CatalogueModule>> = {
  ru: () => import("./server-messages-ru"),
  es: () => import("./server-messages-es"),
  de: () => import("./server-messages-de"),
  fr: () => import("./server-messages-fr"),
  uk: () => import("./server-messages-uk")
};
const loaded = new Map<string, Catalogue>();

/** Fetch a language's catalogue (once). Safe to call repeatedly; never throws. */
export async function loadServerMessages(locale: string): Promise<void> {
  const load = LOADERS[locale];
  if (!load || loaded.has(locale)) return;
  try {
    const book = await load();
    loaded.set(locale, {
      exact: book.EXACT,
      patterns: book.PATTERNS.map(([source, text]) => [new RegExp(source), text]),
      keep: book.KEEP
    });
  } catch {
    /* offline or missing: messages stay English */
  }
}

/** The current language's catalogue, loaded: API helpers wait for it alongside each request. */
export function serverMessagesReady(): Promise<void> {
  return loadServerMessages(currentLocale());
}

function catalogue(locale: string): Catalogue | null {
  return loaded.get(locale) ?? null;
}

function currentLocale(): string {
  if (typeof document === "undefined") return "en";
  return (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
}

function translateWhole(text: string, book: Catalogue, depth: number): string | null {
  const exact = book.exact[text];
  if (exact !== undefined) return exact;
  for (const [pattern, template] of book.patterns) {
    const found = pattern.exec(text);
    if (!found) continue;
    // Values inside a message may themselves be messages ("Waiting: Install failed.").
    return template.replace(/\{(\d+)\}/g, (_, index: string) => {
      const value = found[Number(index)] ?? "";
      return depth < 3 ? (translate(value, book, depth + 1) ?? value) : value;
    });
  }
  return null;
}

// Sentence ends followed by a capital (or a quote/bracket), and line breaks.
const SENTENCE_BREAK = /(?<=[.!?…])\s+(?=[A-Z"“'(])|\n/;

function translate(text: string, book: Catalogue, depth: number): string | null {
  const trimmed = text.trim();
  if (!trimmed || book.keep.has(trimmed)) return null;
  const whole = translateWhole(trimmed, book, depth);
  if (whole !== null) return text.replace(trimmed, whole);
  const pieces = trimmed.split(SENTENCE_BREAK);
  if (pieces.length < 2) return null;
  let changed = false;
  const out = pieces.map((piece) => {
    const done = translateWhole(piece.trim(), book, depth);
    if (done === null) return piece;
    changed = true;
    return done;
  });
  return changed ? text.replace(trimmed, out.join(trimmed.includes("\n") ? "\n" : " ")) : null;
}

/** A backend message in the interface language, or unchanged when there is no translation. */
export function localizeServerText(text: string, locale: string = currentLocale()): string {
  try {
    const book = catalogue(locale);
    if (!book || typeof text !== "string") return text;
    return translate(text, book, 0) ?? text;
  } catch {
    return text;
  }
}

/**
 * Fields of API responses that carry messages for people. Codes that the interface compares
 * (status, stage, step, op, ids) and names are left alone.
 */
const MESSAGE_FIELDS = new Set([
  "detail",
  "stage_detail",
  "error",
  "error_message",
  "message",
  "reason",
  "note",
  "check_error",
  "summary",
  "download_note",
  "used_for",
  "unlocks",
  "hardware"
]);

/**
 * Fields that carry sentences in some responses and codes in others, so they are translated
 * only when the value has a space in it. The analyser's recommendations and the mastering
 * self-check both use `issue` and `assessment`: a sentence in one ("Top end stops near 0.6
 * kHz.") and a code in the other ("loudness_range_collapse", "strong_improvement").
 */
const PROSE_FIELDS = new Set(["issue", "action", "reasons", "when", "assessment", "warnings", "notes"]);
const isProse = (text: string) => /\s/.test(text.trim());

/**
 * A copy of an API response with its message fields in the interface language. `extra` adds
 * field names for one response (for example the add-on packs' `label`).
 */
export function localizeServerFields<T>(value: T, extra: readonly string[] = []): T {
  try {
    const book = catalogue(currentLocale());
    if (!book) return value;
    const fields = extra.length ? new Set([...MESSAGE_FIELDS, ...extra]) : MESSAGE_FIELDS;
    return walk(value, fields, book) as T;
  } catch {
    return value;
  }
}

function walk(value: unknown, fields: Set<string>, book: Catalogue): unknown {
  if (Array.isArray(value)) return value.map((item) => walk(item, fields, book));
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const prose = PROSE_FIELDS.has(key);
    const wanted = (text: string) => !prose || isProse(text);
    if ((fields.has(key) || prose) && typeof item === "string") {
      out[key] = wanted(item) ? (translate(item, book, 0) ?? item) : item;
    } else if ((fields.has(key) || prose) && Array.isArray(item) && item.every((entry) => typeof entry === "string")) {
      out[key] = item.map((entry: string) => (wanted(entry) ? (translate(entry, book, 0) ?? entry) : entry));
    } else {
      out[key] = walk(item, fields, book);
    }
  }
  return out;
}
