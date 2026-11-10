"use client";

import { AudioWaveform, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ActionButton, fieldClass } from "@/components/editor/controls";
import { editorApi } from "@/lib/editor/api";
import { addAssetOnNewTrack } from "@/lib/editor/store";
import { type ProjectSummary, emptyProjectState } from "@/lib/editor/types";

interface ProjectHomeProps {
  /** When set, a new project is created from this analysis run and opened. */
  runId: string | null;
  runName: string;
}

export function ProjectHome({ runId, runName }: ProjectHomeProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(Boolean(runId));
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (runId) {
      // Strict mode runs effects twice in development; create the project once.
      if (startedRef.current) return;
      startedRef.current = true;
      void (async () => {
        try {
          const project = await editorApi.createProject((runName || "Imported song").slice(0, 120));
          const asset = await editorApi.importRun(project.id, runId);
          await editorApi.saveState(project.id, addAssetOnNewTrack(emptyProjectState(), asset).state);
          router.replace(`/editor?project=${project.id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "The song could not be opened in the editor.");
          setBusy(false);
        }
      })();
      return;
    }
    let cancelled = false;
    editorApi
      .listProjects()
      .then((list) => !cancelled && setProjects(list))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Could not load projects."));
    return () => {
      cancelled = true;
    };
  }, [runId, runName, router]);

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

  const remove = async (id: string) => {
    try {
      await editorApi.deleteProject(id);
      setProjects((list) => (list ?? []).filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The project could not be deleted.");
    }
    setConfirmId(null);
  };

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

      {runId && busy ? (
        <p className="rounded-xl bg-slate-900 px-4 py-6 text-center text-sm text-slate-300" aria-live="polite">
          Opening “{runName || "song"}” in the editor…
        </p>
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
