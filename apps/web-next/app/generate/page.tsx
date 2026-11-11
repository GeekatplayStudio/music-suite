import type { Metadata } from "next";

import { GenerateStudio } from "@/components/generation/generate-studio";
import type { Incoming } from "@/lib/handoff";

export const metadata: Metadata = {
  title: "AI Song Studio | Music Suite"
};

type GeneratePageProps = {
  searchParams: Promise<{ project?: string; run?: string; from?: string; asset?: string; name?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function GeneratePage({ searchParams }: GeneratePageProps) {
  const params = await searchParams;
  const uuid = (value: string | undefined) => (value && UUID_PATTERN.test(value) ? value : null);
  const projectId = uuid(params.project);
  // A song to start from: an analysed file (?run=) or a clip in a session (?from=&asset=).
  const name = (params.name || "").slice(0, 120);
  const runId = uuid(params.run);
  const from = uuid(params.from);
  const asset = uuid(params.asset);
  const start: Incoming | null = runId
    ? { kind: "run", runId, name }
    : from && asset
      ? { kind: "clip", projectId: from, assetId: asset, name }
      : null;
  return <GenerateStudio projectId={projectId} start={start} />;
}
