import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

import { WindowMemory } from "@/components/window-memory";
import { I18nProvider } from "@/lib/i18n";
import { DEFAULT_THEME, LOCALE_COOKIE, THEME_COOKIE, browserLocale, isLocale, isTheme } from "@/lib/prefs";

import "./globals.css";

export const metadata: Metadata = {
  title: "Geekatplay Studio | Music Suite",
  description: "Geekatplay Studio Music Suite: analysis, mastering, visualization, and AI generation."
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The saved language and theme come from cookies, so the first frame is already right.
  const jar = await cookies();
  const savedLocale = jar.get(LOCALE_COOKIE)?.value;
  const savedTheme = jar.get(THEME_COOKIE)?.value;
  const accept = (await headers()).get("accept-language") ?? "";
  const locale = isLocale(savedLocale) ? savedLocale : browserLocale(accept.split(",").map((part) => part.split(";")[0].trim()));
  const theme = isTheme(savedTheme) ? savedTheme : DEFAULT_THEME;
  return (
    <html lang={locale} className="dark" data-theme={theme === DEFAULT_THEME ? undefined : theme} suppressHydrationWarning>
      <body suppressHydrationWarning className="bg-background font-[family-name:var(--font-manrope)] text-foreground">
        <I18nProvider initialLocale={locale} initialTheme={theme}>
          <WindowMemory />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
