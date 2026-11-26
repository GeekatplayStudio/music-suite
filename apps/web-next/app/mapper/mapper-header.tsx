"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n";

/** The mapper's header, in the interface language (the page itself renders on the server). */
export function MapperHeader({ loaded }: { loaded: string | null }) {
  const { t } = useI18n();
  return (
    <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-slate-950/95 px-4 shadow-xl backdrop-blur-sm md:px-6">
      <div className="min-w-0">
        <p className="display-font truncate text-sm font-semibold text-slate-100">
          {t("common.appName")} <span className="text-cyan-300">/ {t("charts.mapper.title")}</span>
        </p>
        <p className="truncate text-xs text-slate-400">
          {loaded ? t("charts.mapper.loaded", { name: loaded }) : t("charts.mapper.none")}
        </p>
      </div>
      <Link
        href="/"
        className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {t("common.back")}
      </Link>
      <a
        href="/help#song-geometry-mapper"
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {t("common.workspaces.help")}
      </a>
    </header>
  );
}

/** The mapper frame's accessible title. */
export function MapperFrame({ src }: { src: string }) {
  const { t } = useI18n();
  return (
    <iframe
      className="min-h-0 w-full flex-1 border-0 bg-black"
      src={src}
      title={t("charts.mapper.title")}
      allow="autoplay; fullscreen"
      allowFullScreen
    />
  );
}
