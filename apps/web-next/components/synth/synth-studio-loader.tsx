"use client";

import dynamic from "next/dynamic";

import { useI18n } from "@/lib/i18n";

function Opening() {
  const { t } = useI18n();
  return <p className="py-24 text-center text-sm text-slate-400">{t("synth.studio.opening")}</p>;
}

/** The studio keeps its sound in the browser, so it renders there only. */
export const SynthStudioLoader = dynamic(() => import("@/components/synth/synth-studio").then((module) => module.SynthStudio), {
  ssr: false,
  loading: Opening
});
