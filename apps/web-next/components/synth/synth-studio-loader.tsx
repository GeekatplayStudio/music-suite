"use client";

import dynamic from "next/dynamic";

/** The studio keeps its sound in the browser, so it renders there only. */
export const SynthStudioLoader = dynamic(() => import("@/components/synth/synth-studio").then((module) => module.SynthStudio), {
  ssr: false,
  loading: () => <p className="py-24 text-center text-sm text-slate-400">Opening Synth Studio…</p>
});
