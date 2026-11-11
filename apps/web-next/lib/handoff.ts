/**
 * Moving a song between the analyser, the AI Song Studio and the Studio Editor.
 *
 * Nothing here replaces work: a song sent to a session is added on a new track, and a
 * song sent to the analyser or the creator is a copy, so its session is left as it was.
 */

import { analyzeRun, runFromAsset } from "@/lib/api";
import { editorApi } from "@/lib/editor/api";
import { addAssetOnNewTrack } from "@/lib/editor/store";
import { emptyProjectState, type Asset } from "@/lib/editor/types";

/** A clip in a Studio Editor session: a generated song, a stem or an upload. */
export interface ClipRef {
  projectId: string;
  assetId: string;
  name: string;
}

/** How far a split on arrival goes: "full" is 6 stems plus drum kit pieces and lead/backing vocals. */
export type SplitDepth = "auto" | "2" | "4" | "6" | "full";

/** The separate-job parameters for a depth; "auto" is the most stems the engines offer. */
export function splitParams(depth: SplitDepth, stemOptions: number[]): Record<string, unknown> {
  if (depth === "full") return { stems: 6, drum_kit: true, lead_backing: true };
  const wanted = depth === "auto" ? Math.max(...stemOptions, 4) : Number(depth);
  return { stems: stemOptions.includes(wanted) ? wanted : 4 };
}

/** What is being brought into a session: an analysed file or a clip from another session. */
export type Incoming = { kind: "run"; runId: string; name: string } | ({ kind: "clip" } & ClipRef);

function query(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
}

/** The editor's "where should this go?" page for a clip. */
export function placeInEditorUrl(clip: ClipRef, split = false): string {
  return `/editor?${query({ from: clip.projectId, asset: clip.assetId, name: clip.name.slice(0, 120), split: split ? "1" : undefined })}`;
}

/** The AI Song Studio with this clip as the song to start from. */
export function startSongUrl(source: ClipRef | { runId: string; name: string }): string {
  return "runId" in source
    ? `/generate?${query({ run: source.runId, name: source.name.slice(0, 120) })}`
    : `/generate?${query({ from: source.projectId, asset: source.assetId, name: source.name.slice(0, 120) })}`;
}

/** Copy a clip to the analyser, start its analysis and return the new run's id. */
export async function analyseClip(clip: ClipRef): Promise<string> {
  const { run } = await runFromAsset(clip.projectId, clip.assetId);
  await analyzeRun(run.id, false);
  return run.id;
}

/**
 * Put an incoming song into a session on a new track and return where it went.
 * ``targetId`` null makes a new session named after the song.
 */
export async function placeIncoming(targetId: string | null, incoming: Incoming): Promise<{ projectId: string; asset: Asset }> {
  const projectId = targetId ?? (await editorApi.createProject(incoming.name.slice(0, 120) || "Imported song")).id;
  const project = await editorApi.getProject(projectId);
  let state = project.state ?? emptyProjectState();
  let asset: Asset;
  if (incoming.kind === "clip" && incoming.projectId === projectId) {
    // Already in this session: use it where it is, and only add a track if it has none.
    const existing = project.assets.find((a) => a.id === incoming.assetId);
    if (!existing) throw new Error("That clip is no longer in its session.");
    asset = existing;
    if (state.clips.some((c) => c.assetId === asset.id)) return { projectId, asset };
  } else {
    asset =
      incoming.kind === "run"
        ? await editorApi.importRun(projectId, incoming.runId)
        : await editorApi.copyAsset(projectId, incoming.projectId, incoming.assetId);
  }
  state = addAssetOnNewTrack(state, asset).state;
  await editorApi.saveState(projectId, state);
  return { projectId, asset };
}
