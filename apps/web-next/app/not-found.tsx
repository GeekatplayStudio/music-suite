"use client";

import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="max-w-xl space-y-4 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">{t("common.appName")}</p>
        <h1 className="text-4xl font-semibold">{t("charts.notFound.title")}</h1>
        <p className="text-base text-muted-foreground">{t("charts.notFound.body")}</p>
      </div>
    </main>
  );
}
