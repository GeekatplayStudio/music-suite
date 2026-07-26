import Link from "next/link";

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
      <header className="z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-slate-950/95 px-4 shadow-xl backdrop-blur md:px-6">
        <div className="min-w-0">
          <p className="display-font truncate text-sm font-semibold text-slate-100">
            Music Suite <span className="text-cyan-300">/ Song Geometry Mapper</span>
          </p>
          <p className="truncate text-xs text-slate-400">
            {runId ? `Loaded song: ${trackName || runId}` : "Load a song here or return to Music Suite to select one."}
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Back to Music Suite
        </Link>
      </header>
      <iframe
        className="min-h-0 w-full flex-1 border-0 bg-black"
        src={mapperSrc}
        title="Song Geometry Mapper"
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    </main>
  );
}
