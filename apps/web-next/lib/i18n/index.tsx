"use client";

/**
 * The interface's languages. English (en.ts) is the source: every other dictionary must have
 * exactly the same keys, which TypeScript checks. Strings may contain {placeholders}.
 * Plural forms are objects ({ one, few, many, other }) chosen with Intl.PluralRules.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { type Locale, LOCALE_COOKIE, THEME_COOKIE, type ThemeId, rememberPref } from "@/lib/prefs";

import { en } from "./en";
import { ru } from "./ru";

/** A plural entry: Intl.PluralRules categories, "other" always present. */
export type Plural = { one?: string; few?: string; many?: string; other: string };

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Plural
      ? never
      : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type PluralLeaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends Plural
      ? `${Prefix}${K}`
      : PluralLeaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** The shape every dictionary must have: English's, with any text in place of English text. */
export type Dictionary = Widen<typeof en>;
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Widen<T[K]> };

export type MessageKey = Leaves<typeof en>;
export type PluralKey = PluralLeaves<typeof en>;
export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Dictionary> = { en, ru };

function lookup(dictionary: Dictionary, key: string): unknown {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  /** A message; falls back to English, then to the key itself, so nothing ever shows blank. */
  t: (key: MessageKey, vars?: Vars) => string;
  /** A counted message, with the plural form the language needs; {n} is the count. */
  tp: (key: PluralKey, n: number, vars?: Vars) => string;
}

const Context = createContext<I18n | null>(null);

export function I18nProvider({
  initialLocale,
  initialTheme,
  children
}: {
  initialLocale: Locale;
  initialTheme: ThemeId;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    rememberPref(LOCALE_COOKIE, next);
    document.documentElement.lang = next;
  }, []);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    rememberPref(THEME_COOKIE, next);
    if (next === "midnight") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }, []);

  const value = useMemo<I18n>(() => {
    const dictionary = DICTIONARIES[locale];
    const plurals = new Intl.PluralRules(locale);
    const text = (key: string): unknown => lookup(dictionary, key) ?? lookup(en, key);
    return {
      locale,
      setLocale,
      theme,
      setTheme,
      t: (key, vars) => {
        const found = text(key);
        return typeof found === "string" ? fill(found, vars) : key;
      },
      tp: (key, n, vars) => {
        const found = text(key) as Plural | undefined;
        if (!found || typeof found !== "object") return key;
        const form = (found as Record<string, string | undefined>)[plurals.select(n)] ?? found.other;
        return fill(form, { n, ...vars });
      }
    };
  }, [locale, setLocale, theme, setTheme]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The interface's language and theme, and the translate functions. */
export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
