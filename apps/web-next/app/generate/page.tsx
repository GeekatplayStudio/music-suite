import type { Metadata } from "next";

import { GenerateStudio } from "@/components/generation/generate-studio";

export const metadata: Metadata = {
  title: "AI Song Studio | Music Suite"
};

type GeneratePageProps = {
  searchParams: Promise<{ project?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function GeneratePage({ searchParams }: GeneratePageProps) {
  const params = await searchParams;
  const projectId = params.project && UUID_PATTERN.test(params.project) ? params.project : null;
  return <GenerateStudio projectId={projectId} />;
}
