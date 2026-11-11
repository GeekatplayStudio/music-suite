import type { Metadata } from "next";

import { EditorApp } from "@/components/editor/editor-app";
import { ProjectHome } from "@/components/editor/project-home";
import type { Incoming } from "@/lib/handoff";

export const metadata: Metadata = {
  title: "Studio Editor | Music Suite"
};

type EditorPageProps = {
  searchParams: Promise<{ project?: string; run?: string; name?: string; from?: string; asset?: string; split?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const params = await searchParams;
  const uuid = (value: string | undefined) => (value && UUID_PATTERN.test(value) ? value : null);
  const projectId = uuid(params.project);
  // ?split=<asset> splits that clip into stems once the session opens.
  if (projectId) return <EditorApp key={projectId} projectId={projectId} splitAssetId={uuid(params.split)} />;

  // A song sent from the analyser (?run=) or another session (?from=&asset=) asks where to go.
  const name = (params.name || "").slice(0, 120);
  const runId = uuid(params.run);
  const from = uuid(params.from);
  const asset = uuid(params.asset);
  const incoming: Incoming | null = runId
    ? { kind: "run", runId, name }
    : from && asset
      ? { kind: "clip", projectId: from, assetId: asset, name }
      : null;
  return <ProjectHome incoming={incoming} split={params.split === "1"} />;
}
