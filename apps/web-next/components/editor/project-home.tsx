"use client";

import { AudioWaveform, Loader2, Plus, Scissors, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import { editorApi } from "@/lib/editor/api";
import { type Capabilities, type ProjectSummary } from "@/lib/editor/types";
import { type Incoming, type SplitDepth, placeIncoming } from "@/lib/handoff";

interface ProjectHomeProps {
  /** A song sent here from the analyser or another session; the page asks where it goes. */
  incoming: Incoming | null;
  /** Start with "split into stems" ticked (the "Deconstruct" buttons send this). */
  split: boolean;
  depth: SplitDepth;
}

export function ProjectHome({ incoming, split: splitInitially, depth: depthInitially }: ProjectHomeProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [split, setSplit] = useState(splitInitially);
  const [depth, setDepth] = useState<SplitDepth>(depthInitially);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    editorApi
      .capabilities()
      .then((caps) => !cancelled && setCapabilities(caps))
      .catch(() => undefined);
    editorApi
      .listProjects()
      .then((list) => !cancelled && setProjects(list))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load projects."));
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const project = await editorApi.createProject(name.trim() || "Untitled session");
      router.push(`/editor?project=${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be created.");
      setBusy(false);
    }
  };

  /** Add the incoming song to a session (null: a new one) on its own track, then open it. */
  const place = async (targetId: string | null) => {
    if (!incoming) return;
    setPlacing(targetId ?? "new");
    setError(null);
    try {
      const { projectId, asset } = await placeIncoming(targetId, incoming);
      router.push(`/editor?project=${projectId}${split ? `&split=${asset.id}&stems=${depth}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The song could not be added to the session.");
      setPlacing(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await editorApi.deleteProject(id);
      setProjects((list) => (list ?? []).filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be deleted.");
    }
    setConfirmId(null);
  };

  const songName = incoming?.name || "this song";
  const home = incoming && incoming.kind === "clip" ? incoming.projectId : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="display-font text-2xl font-semibold text-slate-100">
            Music Suite <span className="text-cyan-300">/ Studio Editor</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Multitrack editing, stem separation, repair and AI matching. Everything stays on this machine.
          </p>
        </div>
        <Link
          href="/generate"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          AI Song Studio
        </Link>
        <Link
          href="/synth"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Synth Studio
        </Link>
        <Link
          href="/models"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Models &amp; engines
        </Link>
        <Link
          href="/"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Back to Music Suite
        </Link>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {incoming ? (
        <section className="glass space-y-4 rounded-2xl border border-cyan-300/30 p-4" aria-label="Where should the song go">
          <div>
            <h2 className="display-font text-lg font-semibold text-slate-100">Where should “{songName}” go?</h2>
            <p className="mt-1 text-sm text-slate-400">
              It is added on a new track. Nothing already in a session is replaced.
            </p>
          </div>
          <label className="flex items-start gap-3 rounded-xl bg-slate-900/70 p-3 text-sm text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-cyan-400"
              checked={split}
              disabled={placing !== null}
              onChange={(event) => setSplit(event.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <Scissors className="h-4 w-4 text-cyan-300" aria-hidden /> Split it into stems when it opens
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                Vocals, drums, bass and the rest, each on its own track, ready to sample, turn into MIDI or rebuild with AI.
                The original stays, muted, above them.
              </span>
            </span>
          </label>
          {split ? (
            <label className="flex flex-wrap items-center gap-2 px-3 text-sm text-slate-300">
              <span className="font-semibold">How far</span>
              <select
                className={`${fieldClass} h-9 w-auto min-w-72 text-sm`}
                value={depth}
                disabled={placing !== null}
                onChange={(event) => setDepth(event.target.value as SplitDepth)}
                aria-label="How many stems"
              >
                <option value="auto">As many as this computer can ({Math.max(...(capabilities?.separation.stem_options ?? [4]))} stems)</option>
                <option value="2">2 stems: vocals and instrumental</option>
                <option value="4">4 stems: vocals, drums, bass, other</option>
                {capabilities?.separation.stem_options.includes(6) ? (
                  <option value="6">6 stems: adds guitar and piano</option>
                ) : null}
                {capabilities?.separation.detail ? (
                  <option value="full">Everything: 12 stems with drum kit pieces and lead/backing vocals</option>
                ) : null}
              </select>
              {capabilities && !capabilities.separation.detail ? (
                <a href="/models" className="text-xs font-semibold text-cyan-300 underline-offset-2 hover:underline">
                  More stems with AI stem separation
                </a>
              ) : null}
            </label>
          ) : null}
          <ActionButton
            variant="primary"
            className="h-11 w-full text-sm"
            disabled={placing !== null}
            onClick={() => void place(null)}
          >
            {placing === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New session “{songName}”
          </ActionButton>
          <div>
            <h3 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-400">
              Or add it to a session
            </h3>
            {projects === null && !error ? (
              <p className="mt-2 text-sm text-slate-400">Loading…</p>
            ) : projects && projects.length ? (
              <ul className="mt-2 space-y-2">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-2">
                    <AudioWaveform className="ml-1 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{project.name}</span>
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
                      {new Date(project.updated_at).toLocaleString()}
                    </span>
                    <ActionButton disabled={placing !== null} onClick={() => void place(project.id)}>
                      {placing === project.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {project.id === home ? "Open (it is here)" : "Add here"}
                    </ActionButton>
                  </li>
                ))}
              </ul>
            ) : projects ? (
              <p className="mt-2 text-sm text-slate-400">No other sessions yet.</p>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <form
            className="glass flex flex-col gap-3 rounded-2xl border border-white/10 p-4 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <input
              className={`${fieldClass} h-11 flex-1 text-sm`}
              placeholder="New session name"
              aria-label="New session name"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
            <ActionButton type="submit" variant="primary" className="h-11 px-5 text-sm" disabled={busy}>
              <Plus className="h-4 w-4" /> New session
            </ActionButton>
          </form>

          <section aria-label="Sessions">
            <h2 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-400">Sessions</h2>
            {projects === null && !error ? (
              <p className="mt-3 text-sm text-slate-400">Loading…</p>
            ) : projects && projects.length ? (
              <ul className="mt-3 space-y-2">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-2">
                    <Link
                      href={`/editor?project=${project.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                    >
                      <AudioWaveform className="h-5 w-5 shrink-0 text-cyan-300" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{project.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {new Date(project.updated_at).toLocaleString()}
                      </span>
                    </Link>
                    {confirmId === project.id ? (
                      <>
                        <ActionButton variant="danger" onClick={() => void remove(project.id)}>
                          Delete
                        </ActionButton>
                        <ActionButton onClick={() => setConfirmId(null)}>Keep</ActionButton>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${project.name}`}
                        title="Delete session"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-rose-300 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
                        onClick={() => setConfirmId(project.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : projects ? (
              <p className="mt-3 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-slate-400">
                No sessions yet. Create one above, or open a song from the Music Suite workspace.
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
