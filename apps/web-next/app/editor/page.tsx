import type { Metadata } from "next";

import { EditorApp } from "@/components/editor/editor-app";
import { ProjectHome } from "@/components/editor/project-home";

export const metadata: Metadata = {
  title: "Studio Editor | Music Suite"
};

type EditorPageProps = {
  searchParams: Promise<{ project?: string; run?: string; name?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EditorPage({ searchParams }: EditorPageProps) {
  const params = await searchParams;
  const projectId = params.project && UUID_PATTERN.test(params.project) ? params.project : null;
  if (projectId) return <EditorApp key={projectId} projectId={projectId} />;

  const runId = params.run && UUID_PATTERN.test(params.run) ? params.run : null;
  return <ProjectHome runId={runId} runName={(params.name || "").slice(0, 120)} />;
}
