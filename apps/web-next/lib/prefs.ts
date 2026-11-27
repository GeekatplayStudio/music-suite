/**
 * Per-browser interface preferences: language and colour theme.
 *
 * Kept in cookies (so the server renders the page in the right language and colours from
 * the first frame, with no flash) and mirrored on <html lang> and <html data-theme>.
 */

export const LOCALES = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "ru", label: "Русский" },
  { id: "uk", label: "Українська" }
] as const;
export type Locale = (typeof LOCALES)[number]["id"];
export const DEFAULT_LOCALE: Locale = "en";

/** Ids match app/themes.css; "midnight" is the default with no overrides. */
export const THEMES = [
  { id: "midnight", swatch: "#00d2ef" },
  { id: "amber", swatch: "#fbbf24" },
  { id: "violet", swatch: "#a78bfa" },
  { id: "forest", swatch: "#34d399" },
  { id: "magenta", swatch: "#e879f9" },
  { id: "light", swatch: "#f1f5f9" }
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "midnight";

export const LOCALE_COOKIE = "ms-lang";
export const THEME_COOKIE = "ms-theme";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((entry) => entry.id === value);
}

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((entry) => entry.id === value);
}

/** The best match for the browser's languages, used before anything has been chosen. */
export function browserLocale(languages: readonly string[] | undefined): Locale {
  for (const language of languages ?? []) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Remember a preference for a year; the cookie is read by the server on the next page load. */
export function rememberPref(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}
