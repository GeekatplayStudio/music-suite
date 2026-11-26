"use client";

import { AudioWaveform, FolderOpen, Loader2, Plus, Scissors, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppPrefs } from "@/components/app-prefs";
import { ActionButton, fieldClass } from "@/components/editor/controls";
import { editorApi } from "@/lib/editor/api";
import { type Capabilities, type ProjectSummary } from "@/lib/editor/types";
import { type Incoming, type SplitDepth, placeIncoming } from "@/lib/handoff";
import { useI18n } from "@/lib/i18n";

interface ProjectHomeProps {
  /** A song sent here from the analyser or another session; the page asks where it goes. */
  incoming: Incoming | null;
  /** Start with "split into stems" ticked (the "Deconstruct" buttons send this). */
  split: boolean;
  depth: SplitDepth;
}

export function ProjectHome({ incoming, split: splitInitially, depth: depthInitially }: ProjectHomeProps) {
  const router = useRouter();
  const { t, tp, locale } = useI18n();
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
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : t("sessions.errors.load")));
    return () => {
      cancelled = true;
    };
    // Loaded once; the fallback message is in the language at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const project = await editorApi.createProject(name.trim() || t("sessions.untitled"));
      router.push(`/editor?project=${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sessions.errors.create"));
      setBusy(false);
    }
  };

  /** Open a project saved to a file from the editor's Export menu, as a new session. */
  const openFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const project = await editorApi.openProjectFile(file);
      router.push(`/editor?project=${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sessions.errors.open"));
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
      setError(err instanceof Error ? err.message : t("sessions.errors.place"));
      setPlacing(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await editorApi.deleteProject(id);
      setProjects((list) => (list ?? []).filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sessions.errors.delete"));
    }
    setConfirmId(null);
  };

  const songName = incoming?.name || t("sessions.place.thisSong");
  const home = incoming && incoming.kind === "clip" ? incoming.projectId : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="display-font text-2xl font-semibold text-slate-100">
            {t("common.appName")} <span className="text-cyan-300">/ {t("sessions.title")}</span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {t("sessions.tagline")}
          </p>
        </div>
        <Link
          href="/generate"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {t("common.workspaces.studio")}
        </Link>
        <Link
          href="/synth"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {t("common.workspaces.synth")}
        </Link>
        <Link
          href="/models"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {t("common.workspaces.models")}
        </Link>
        <a href="/help#studio-editor" target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300">
          {t("common.workspaces.help")}
        </a>
        <Link
          href="/"
          className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {t("common.back")}
        </Link>
        <AppPrefs />
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      {incoming ? (
        <section className="glass space-y-4 rounded-2xl border border-cyan-300/30 p-4" aria-label={t("sessions.place.region")}>
          <div>
            <h2 className="display-font text-lg font-semibold text-slate-100">{t("sessions.place.heading", { name: songName })}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {t("sessions.place.added")}
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
                <Scissors className="h-4 w-4 text-cyan-300" aria-hidden /> {t("sessions.place.split")}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                {t("sessions.place.splitHint")}
              </span>
            </span>
          </label>
          {split ? (
            <label className="flex flex-wrap items-center gap-2 px-3 text-sm text-slate-300">
              <span className="font-semibold">{t("sessions.place.howFar")}</span>
              <select
                className={`${fieldClass} h-9 w-auto min-w-72 text-sm`}
                value={depth}
                disabled={placing !== null}
                onChange={(event) => setDepth(event.target.value as SplitDepth)}
                aria-label={t("sessions.place.howMany")}
              >
                <option value="auto">{tp("sessions.place.auto", Math.max(...(capabilities?.separation.stem_options ?? [4])))}</option>
                <option value="2">{t("sessions.place.two")}</option>
                <option value="4">{t("sessions.place.four")}</option>
                {capabilities?.separation.stem_options.includes(6) ? (
                  <option value="6">{t("sessions.place.six")}</option>
                ) : null}
                {capabilities?.separation.detail ? (
                  <option value="full">{t("sessions.place.full")}</option>
                ) : null}
              </select>
              {capabilities && !capabilities.separation.detail ? (
                <a href="/models" className="text-xs font-semibold text-cyan-300 underline-offset-2 hover:underline">
                  {t("sessions.place.moreStems")}
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
            {t("sessions.place.newSession", { name: songName })}
          </ActionButton>
          <div>
            <h3 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("sessions.place.orAdd")}
            </h3>
            {projects === null && !error ? (
              <p className="mt-2 text-sm text-slate-400">{t("common.loading")}</p>
            ) : projects && projects.length ? (
              <ul className="mt-2 space-y-2">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 p-2">
                    <AudioWaveform className="ml-1 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{project.name}</span>
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
                      {new Date(project.updated_at).toLocaleString(locale)}
                    </span>
                    <ActionButton disabled={placing !== null} onClick={() => void place(project.id)}>
                      {placing === project.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {project.id === home ? t("sessions.place.openHere") : t("sessions.place.addHere")}
                    </ActionButton>
                  </li>
                ))}
              </ul>
            ) : projects ? (
              <p className="mt-2 text-sm text-slate-400">{t("sessions.place.noOthers")}</p>
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
              placeholder={t("sessions.newName")}
              aria-label={t("sessions.newName")}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
            <ActionButton type="submit" variant="primary" className="h-11 px-5 text-sm" disabled={busy}>
              <Plus className="h-4 w-4" /> {t("sessions.newSession")}
            </ActionButton>
            <label
              className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-5 text-sm font-semibold text-slate-100 hover:bg-slate-700 ${busy ? "pointer-events-none opacity-50" : ""}`}
            >
              <FolderOpen className="h-4 w-4" /> {t("sessions.openFile")}
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void openFile(file);
                }}
              />
            </label>
          </form>

          <section aria-label={t("sessions.list")}>
            <h2 className="display-font text-xs font-semibold uppercase tracking-wider text-slate-400">{t("sessions.list")}</h2>
            {projects === null && !error ? (
              <p className="mt-3 text-sm text-slate-400">{t("common.loading")}</p>
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
                        {new Date(project.updated_at).toLocaleString(locale)}
                      </span>
                    </Link>
                    {confirmId === project.id ? (
                      <>
                        <ActionButton variant="danger" onClick={() => void remove(project.id)}>
                          {t("common.delete")}
                        </ActionButton>
                        <ActionButton onClick={() => setConfirmId(null)}>{t("common.keep")}</ActionButton>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={t("sessions.deleteNamed", { name: project.name })}
                        title={t("sessions.deleteSession")}
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
                {t("sessions.empty")}
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
