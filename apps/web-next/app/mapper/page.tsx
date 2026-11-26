import { MapperFrame, MapperHeader } from "./mapper-header";

type MapperPageProps = {
  searchParams: Promise<{ run?: string; name?: string }>;
};

const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MapperPage({ searchParams }: MapperPageProps) {
  const params = await searchParams;
  const runId = params.run && RUN_ID_PATTERN.test(params.run) ? params.run : null;
  const trackName = (params.name || "").slice(0, 240);
  const mapperParams = new URLSearchParams();

  if (runId) {
    mapperParams.set("source", `/suite-api/runs/${runId}/audio`);
    mapperParams.set("run", runId);
    if (trackName) mapperParams.set("name", trackName);
  }

  const mapperSrc = `/song-mapper/index.html${mapperParams.size ? `?${mapperParams.toString()}` : ""}`;

  return (
    <main className="flex h-screen min-h-[720px] flex-col overflow-hidden bg-slate-950">
      <MapperHeader loaded={runId ? trackName || runId : null} />
      <MapperFrame src={mapperSrc} />
    </main>
  );
}
