import type { Metadata } from "next";

import { SynthStudioLoader } from "@/components/synth/synth-studio-loader";

export const metadata: Metadata = {
  title: "Synth Studio | Music Suite"
};

export default function Page() {
  return <SynthStudioLoader />;
}
