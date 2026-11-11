import {
  type Asset,
  type Clip,
  type ProjectState,
  type TimeRange,
  type Track,
  type AutoPoint,
  type Bus,
  type LaneId,
  type Marker,
  type Note,
  type Region,
  EQ_DEFAULTS,
  LANES,
  MIN_CLIP_SECONDS,
  TRACK_COLORS,
  clamp,
  defaultFx,
  defaultSynth,
  lanePoints,
  newId,
  withLane,
  beatSeconds
} from "@/lib/editor/types";

const HISTORY_LIMIT = 200;
const COALESCE_MS = 900;

export interface History {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  gestureBase: ProjectState | null;
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction =
  | { type: "load"; state: ProjectState }
  | { type: "set"; state: ProjectState; key?: string; at?: number }
  | { type: "gestureStart" }
  | { type: "transient"; state: ProjectState }
  | { type: "gestureEnd" }
  | { type: "undo" }
  | { type: "redo" };

export function initialHistory(state: ProjectState): History {
  return { past: [], present: state, future: [], gestureBase: null, lastKey: null, lastAt: 0 };
}

function pushPast(past: ProjectState[], state: ProjectState): ProjectState[] {
  const next = past.length >= HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT + 1) : past.slice();
  next.push(state);
  return next;
}

export function historyReducer(history: History, action: HistoryAction): History {
  switch (action.type) {
    case "load":
      return initialHistory(action.state);
    case "set": {
      if (action.state === history.present) return history;
      const at = action.at ?? 0;
      const coalesce =
        action.key !== undefined && action.key === history.lastKey && at - history.lastAt < COALESCE_MS;
      return {
        past: coalesce ? history.past : pushPast(history.past, history.present),
        present: action.state,
        future: [],
        gestureBase: null,
        lastKey: action.key ?? null,
        lastAt: at
      };
    }
    case "gestureStart":
      return { ...history, gestureBase: history.present, lastKey: null };
    case "transient":
      return { ...history, present: action.state };
    case "gestureEnd": {
      const base = history.gestureBase;
      if (!base || base === history.present) return { ...history, gestureBase: null };
      return { ...history, past: pushPast(history.past, base), future: [], gestureBase: null };
    }
    case "undo": {
      if (!history.past.length) return history;
      const previous = history.past[history.past.length - 1];
      return {
        ...history,
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
        gestureBase: null,
        lastKey: null
      };
    }
    case "redo": {
      if (!history.future.length) return history;
      const [next, ...rest] = history.future;
      return {
        ...history,
        past: pushPast(history.past, history.present),
        present: next,
        future: rest,
        gestureBase: null,
        lastKey: null
      };
    }
  }
}

/* ---------- Track operations ---------- */

export function nextTrackColor(state: ProjectState): string {
  return TRACK_COLORS[state.tracks.length % TRACK_COLORS.length];
}

export function makeTrack(state: ProjectState, name: string): Track {
  return {
    id: newId(),
    name,
    color: nextTrackColor(state),
    volumeDb: 0,
    pan: 0,
    width: 1,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    mute: false,
    solo: false,
    volumeAuto: [],
    panAuto: [],
    auto: {},
    ...EQ_DEFAULTS,
    output: "master",
    sends: {},
    synth: defaultSynth(),
    fx: defaultFx()
  };
}

export function addTrack(state: ProjectState, name?: string): { state: ProjectState; track: Track } {
  const track = makeTrack(state, name ?? `Track ${state.tracks.length + 1}`);
  return { state: { ...state, tracks: [...state.tracks, track] }, track };
}

export function updateTrack(state: ProjectState, trackId: string, patch: Partial<Track>): ProjectState {
  return { ...state, tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) };
}

export function removeTrack(state: ProjectState, trackId: string): ProjectState {
  return {
    ...state,
    tracks: state.tracks.filter((t) => t.id !== trackId),
    clips: state.clips.filter((c) => c.trackId !== trackId)
  };
}

export function moveTrack(state: ProjectState, trackId: string, direction: -1 | 1): ProjectState {
  const index = state.tracks.findIndex((t) => t.id === trackId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.tracks.length) return state;
  const tracks = state.tracks.slice();
  [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
  return { ...state, tracks };
}

/* ---------- Clip operations ---------- */

export function makeClip(asset: Asset, trackId: string, start: number): Clip {
  return {
    id: newId(),
    trackId,
    assetId: asset.id,
    name: asset.label ?? stripExtension(asset.name),
    start: Math.max(0, start),
    offset: 0,
    duration: asset.duration_seconds,
    gainDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    fadeInCurve: "linear",
    fadeOutCurve: "linear",
    reversed: false,
    muted: false
  };
}

export function makeMidiClip(trackId: string, start: number, duration: number, notes: Note[], name = "MIDI"): Clip {
  return {
    id: newId(),
    trackId,
    assetId: "",
    name,
    start: Math.max(0, start),
    offset: 0,
    duration,
    gainDb: 0,
    fadeIn: 0,
    fadeOut: 0,
    fadeInCurve: "linear",
    fadeOutCurve: "linear",
    reversed: false,
    muted: false,
    notes
  };
}

export function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{2,5}$/, "");
}

export function addAssetOnNewTrack(
  state: ProjectState,
  asset: Asset,
  start = 0
): { state: ProjectState; track: Track; clip: Clip } {
  const added = addTrack(state, asset.label ? capitalize(asset.label) : stripExtension(asset.name));
  const clip = makeClip(asset, added.track.id, start);
  return { state: { ...added.state, clips: [...added.state.clips, clip] }, track: added.track, clip };
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function updateClips(
  state: ProjectState,
  ids: Iterable<string>,
  fn: (clip: Clip) => Clip
): ProjectState {
  const set = ids instanceof Set ? (ids as Set<string>) : new Set(ids);
  if (!set.size) return state;
  return { ...state, clips: state.clips.map((c) => (set.has(c.id) ? fn(c) : c)) };
}

function fitFades(clip: Clip): Clip {
  const fadeIn = clamp(clip.fadeIn, 0, clip.duration);
  const fadeOut = clamp(clip.fadeOut, 0, clip.duration - fadeIn);
  return fadeIn === clip.fadeIn && fadeOut === clip.fadeOut ? clip : { ...clip, fadeIn, fadeOut };
}

/** Split one clip at a timeline time; returns null when the time is outside it. */
export function splitClip(clip: Clip, time: number): [Clip, Clip] | null {
  const local = time - clip.start;
  if (local < MIN_CLIP_SECONDS || clip.duration - local < MIN_CLIP_SECONDS) return null;
  const rest = clip.duration - local;
  const left: Clip = fitFades({
    ...clip,
    duration: local,
    offset: clip.reversed ? clip.offset + rest : clip.offset,
    fadeOut: 0
  });
  const right: Clip = fitFades({
    ...clip,
    id: newId(),
    start: time,
    duration: rest,
    offset: clip.reversed ? clip.offset : clip.offset + local,
    fadeIn: 0
  });
  return [left, right];
}

/** Split the given clips (or every clip when ids is null) at a time. */
export function splitAt(
  state: ProjectState,
  time: number,
  ids: Set<string> | null
): { state: ProjectState; created: string[] } {
  const created: string[] = [];
  const clips: Clip[] = [];
  for (const clip of state.clips) {
    const parts = !ids || ids.has(clip.id) ? splitClip(clip, time) : null;
    if (parts) {
      clips.push(parts[0], parts[1]);
      created.push(parts[1].id);
    } else {
      clips.push(clip);
    }
  }
  return created.length ? { state: { ...state, clips }, created } : { state, created };
}

export function deleteClips(state: ProjectState, ids: Set<string>, ripple: boolean): ProjectState {
  if (!ids.size) return state;
  const removed = state.clips.filter((c) => ids.has(c.id));
  let clips = state.clips.filter((c) => !ids.has(c.id));
  if (ripple) {
    clips = clips.map((clip) => {
      let shift = 0;
      for (const gone of removed) {
        if (gone.trackId === clip.trackId && gone.start < clip.start) shift += gone.duration;
      }
      return shift ? { ...clip, start: Math.max(0, clip.start - shift) } : clip;
    });
  }
  return { ...state, clips };
}

/** Remove a time range from the given tracks (all tracks when trackIds is null). */
export function deleteRange(
  state: ProjectState,
  range: TimeRange,
  ripple: boolean,
  trackIds: Set<string> | null
): ProjectState {
  const length = range.end - range.start;
  if (length <= 0) return state;
  const clips: Clip[] = [];
  for (const original of state.clips) {
    if (trackIds && !trackIds.has(original.trackId)) {
      clips.push(original);
      continue;
    }
    const end = original.start + original.duration;
    if (end <= range.start) {
      clips.push(original);
      continue;
    }
    if (original.start >= range.end) {
      clips.push(ripple ? { ...original, start: original.start - length } : original);
      continue;
    }
    let head: Clip | null = original;
    let tail: Clip | null = null;
    const atEnd = splitClip(original, range.end);
    if (atEnd) {
      head = atEnd[0];
      tail = atEnd[1];
    } else if (end > range.end && original.start > range.end - MIN_CLIP_SECONDS) {
      // The clip begins within a hair of the range end: too close to split, so it is all tail.
      head = null;
      tail = original;
    }
    if (head) {
      const atStart = splitClip(head, range.start);
      if (atStart) clips.push(atStart[0]);
      else if (head.start < range.start) clips.push(head);
    }
    if (tail) {
      clips.push(ripple ? { ...tail, start: Math.max(0, tail.start - length) } : tail);
    }
  }
  const next = { ...state, clips };
  // A ripple across every track closes the gap for markers, sections and automation too.
  return ripple && !trackIds ? removeTime(next, range.start, length) : next;
}

const ALL_LANES: LaneId[] = LANES.map((lane) => lane.id);

function mapLanes(track: Track, fn: (points: AutoPoint[]) => AutoPoint[]): Track {
  let next = track;
  for (const lane of ALL_LANES) {
    const points = lanePoints(next, lane);
    if (points.length) next = withLane(next, lane, fn(points));
  }
  return next;
}

/** Close a gap of `length` at `from` for everything anchored to time except clips. */
function removeTime(state: ProjectState, from: number, length: number): ProjectState {
  const to = from + length;
  const shift = (t: number) => (t >= to ? t - length : Math.min(t, from));
  return {
    ...state,
    markers: state.markers.filter((m) => m.time < from || m.time >= to).map((m) => ({ ...m, time: shift(m.time) })),
    regions: state.regions
      .map((r) => ({ ...r, start: shift(r.start), end: shift(r.end) }))
      .filter((r) => r.end - r.start > 0.01),
    tracks: state.tracks.map((track) =>
      mapLanes(track, (points) => points.filter((p) => p.t < from || p.t >= to).map((p) => ({ ...p, t: shift(p.t) })))
    )
  };
}

/** Open a gap of `length` at `at`: later clips, markers, sections and automation move right. */
export function insertTime(state: ProjectState, at: number, length: number): ProjectState {
  const split = splitAt(state, at, null).state;
  const shift = (t: number) => (t >= at - 1e-6 ? t + length : t);
  return {
    ...split,
    clips: split.clips.map((c) => (c.start >= at - 1e-6 ? { ...c, start: c.start + length } : c)),
    markers: split.markers.map((m) => ({ ...m, time: shift(m.time) })),
    regions: split.regions.map((r) => ({
      ...r,
      start: shift(r.start),
      end: r.end > at + 1e-6 ? r.end + length : r.end
    })),
    tracks: split.tracks.map((track) => mapLanes(track, (points) => points.map((p) => ({ ...p, t: shift(p.t) }))))
  };
}

/** The pieces of every clip that fall inside a range, as new clips at their original positions. */
function clipsInRange(state: ProjectState, range: TimeRange): Clip[] {
  const pieces: Clip[] = [];
  for (const clip of state.clips) {
    let piece: Clip | null = clip;
    if (piece.start + piece.duration <= range.start || piece.start >= range.end) continue;
    const head = splitClip(piece, range.start);
    if (head) piece = head[1];
    const tail: [Clip, Clip] | null = splitClip(piece, range.end);
    if (tail) piece = tail[0];
    pieces.push({ ...piece, id: newId() });
  }
  return pieces;
}

export function duplicateClips(
  state: ProjectState,
  ids: Set<string>
): { state: ProjectState; created: string[] } {
  const created: string[] = [];
  const copies: Clip[] = [];
  for (const clip of state.clips) {
    if (!ids.has(clip.id)) continue;
    const copy = { ...clip, id: newId(), start: clip.start + clip.duration };
    copies.push(copy);
    created.push(copy.id);
  }
  return copies.length ? { state: { ...state, clips: [...state.clips, ...copies] }, created } : { state, created };
}

export function pasteClips(
  state: ProjectState,
  clipboard: Clip[],
  time: number,
  targetTrackId: string | null
): { state: ProjectState; created: string[] } {
  if (!clipboard.length) return { state, created: [] };
  const earliest = Math.min(...clipboard.map((c) => c.start));
  const trackIds = new Set(state.tracks.map((t) => t.id));
  const singleTrack = new Set(clipboard.map((c) => c.trackId)).size === 1;
  const created: string[] = [];
  const copies: Clip[] = [];
  for (const clip of clipboard) {
    let trackId = clip.trackId;
    if (singleTrack && targetTrackId && trackIds.has(targetTrackId)) trackId = targetTrackId;
    if (!trackIds.has(trackId)) continue;
    const copy = { ...clip, id: newId(), trackId, start: Math.max(0, time + clip.start - earliest) };
    copies.push(copy);
    created.push(copy.id);
  }
  return copies.length ? { state: { ...state, clips: [...state.clips, ...copies] }, created } : { state, created };
}

/** Trim the left edge to a new timeline start, bounded by the asset and the minimum length. */
export function trimLeft(clip: Clip, newStart: number, assetDuration: number): Clip {
  const end = clip.start + clip.duration;
  const room = clip.reversed ? assetDuration - (clip.offset + clip.duration) : clip.offset;
  const start = clamp(newStart, Math.max(0, clip.start - room), end - MIN_CLIP_SECONDS);
  const delta = start - clip.start;
  return fitFades({
    ...clip,
    start,
    duration: clip.duration - delta,
    offset: clip.reversed ? clip.offset : clip.offset + delta
  });
}

export function trimRight(clip: Clip, newEnd: number, assetDuration: number): Clip {
  const room = clip.reversed ? clip.offset : assetDuration - (clip.offset + clip.duration);
  const end = clamp(newEnd, clip.start + MIN_CLIP_SECONDS, clip.start + clip.duration + room);
  const delta = end - (clip.start + clip.duration);
  return fitFades({
    ...clip,
    duration: clip.duration + delta,
    offset: clip.reversed ? clip.offset - delta : clip.offset
  });
}

export function setFade(clip: Clip, edge: "in" | "out", seconds: number): Clip {
  if (edge === "in") return { ...clip, fadeIn: clamp(seconds, 0, clip.duration - clip.fadeOut) };
  return { ...clip, fadeOut: clamp(seconds, 0, clip.duration - clip.fadeIn) };
}

/** Rescale a clip after its asset was time-stretched by `rate` (2 = twice as fast). */
export function rescaleClip(clip: Clip, rate: number, assetId: string): Clip {
  return {
    ...clip,
    assetId,
    offset: clip.offset / rate,
    duration: clip.duration / rate,
    fadeIn: clip.fadeIn / rate,
    fadeOut: clip.fadeOut / rate
  };
}

export function gridStep(state: ProjectState, pxPerSec: number, minPx = 14): number {
  if (state.rulerMode === "bars") {
    const beat = beatSeconds(state);
    const bar = beat * state.beatsPerBar;
    const steps = [beat / 4, beat / 2, beat, bar, bar * 2, bar * 4, bar * 8, bar * 16, bar * 32];
    return steps.find((s) => s * pxPerSec >= minPx) ?? bar * 64;
  }
  const steps = [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * pxPerSec >= minPx) ?? 1200;
}

/* ---------- Automation and markers ---------- */

export function sortPoints(points: AutoPoint[]): AutoPoint[] {
  return points.slice().sort((a, b) => a.t - b.t);
}

export function setAutomation(
  state: ProjectState,
  trackId: string,
  lane: LaneId,
  points: AutoPoint[]
): ProjectState {
  return {
    ...state,
    tracks: state.tracks.map((t) => (t.id === trackId ? withLane(t, lane, sortPoints(points)) : t))
  };
}

export function addMarker(state: ProjectState, time: number): { state: ProjectState; marker: Marker } {
  const marker: Marker = { id: newId(), time: Math.max(0, time), name: `Marker ${state.markers.length + 1}` };
  const markers = [...state.markers, marker].sort((a, b) => a.time - b.time);
  return { state: { ...state, markers }, marker };
}

export function updateMarker(state: ProjectState, id: string, patch: Partial<Marker>): ProjectState {
  const markers = state.markers
    .map((m) => (m.id === id ? { ...m, ...patch } : m))
    .sort((a, b) => a.time - b.time);
  return { ...state, markers };
}

export function removeMarker(state: ProjectState, id: string): ProjectState {
  return { ...state, markers: state.markers.filter((m) => m.id !== id) };
}

/* ---------- Sections (named regions) ---------- */

export function addRegion(state: ProjectState, range: TimeRange, name?: string): { state: ProjectState; region: Region } {
  const region: Region = {
    id: newId(),
    start: range.start,
    end: range.end,
    name: name ?? `Section ${state.regions.length + 1}`,
    color: TRACK_COLORS[(state.regions.length + 3) % TRACK_COLORS.length]
  };
  const regions = [...state.regions, region].sort((a, b) => a.start - b.start);
  return { state: { ...state, regions }, region };
}

export function updateRegion(state: ProjectState, id: string, patch: Partial<Region>): ProjectState {
  return { ...state, regions: state.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function removeRegion(state: ProjectState, id: string): ProjectState {
  return { ...state, regions: state.regions.filter((r) => r.id !== id) };
}

/** Repeat a section straight after itself, pushing everything later along. */
export function duplicateSection(state: ProjectState, id: string): ProjectState {
  const region = state.regions.find((r) => r.id === id);
  if (!region) return state;
  const length = region.end - region.start;
  const pieces = clipsInRange(state, region);
  const opened = insertTime(state, region.end, length);
  const copy: Region = { ...region, id: newId(), start: region.end, end: region.end + length, name: `${region.name} (repeat)` };
  return {
    ...opened,
    clips: [...opened.clips, ...pieces.map((c) => ({ ...c, start: c.start + length }))],
    regions: [...opened.regions, copy].sort((a, b) => a.start - b.start)
  };
}

/** Cut a section out of the arrangement and close the gap. */
export function deleteSection(state: ProjectState, id: string): ProjectState {
  const region = state.regions.find((r) => r.id === id);
  if (!region) return state;
  return deleteRange(removeRegion(state, id), region, true, null);
}

/* ---------- Buses ---------- */

export function addBus(state: ProjectState, kind: "reverb" | "delay" | "group"): { state: ProjectState; bus: Bus } {
  const fx = defaultFx();
  // Effect returns are fully wet: the dry signal already reaches the master from the track.
  if (kind === "reverb") fx.reverb = { on: true, size: 2.4, mix: 1 };
  if (kind === "delay") fx.delay = { on: true, time: 0.375, feedback: 0.4, mix: 1 };
  const label = kind === "reverb" ? "Reverb" : kind === "delay" ? "Delay" : "Group";
  const count = state.buses.filter((b) => b.name.startsWith(label)).length;
  const bus: Bus = { id: newId(), name: count ? `${label} ${count + 1}` : label, volumeDb: 0, mute: false, fx };
  return { state: { ...state, buses: [...state.buses, bus] }, bus };
}

export function updateBus(state: ProjectState, id: string, patch: Partial<Bus>): ProjectState {
  return { ...state, buses: state.buses.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

export function removeBus(state: ProjectState, id: string): ProjectState {
  return {
    ...state,
    buses: state.buses.filter((b) => b.id !== id),
    tracks: state.tracks.map((t) => {
      const sends = { ...t.sends };
      delete sends[id];
      return { ...t, output: t.output === id ? "master" : t.output, sends };
    })
  };
}

/* ---------- Takes ---------- */

/**
 * Comp: make one take the audible one, for the whole passage or only inside `range`.
 * Every take in the group is cut at the range edges so the choice can differ per stretch.
 */
export function compTake(state: ProjectState, clipId: string, range: TimeRange | null): ProjectState {
  const chosen = state.clips.find((c) => c.id === clipId);
  if (!chosen?.takeGroup) return state;
  const group = chosen.takeGroup;
  const region = range ?? { start: chosen.start, end: chosen.start + chosen.duration };
  const ids = () => new Set(nextState.clips.filter((c) => c.takeGroup === group).map((c) => c.id));
  let nextState = state;
  nextState = splitAt(nextState, region.start, ids()).state;
  nextState = splitAt(nextState, region.end, ids()).state;
  return {
    ...nextState,
    clips: nextState.clips.map((c) => {
      const inside = c.start >= region.start - 1e-6 && c.start + c.duration <= region.end + 1e-6;
      if (c.takeGroup !== group || !inside) return c;
      return { ...c, muted: c.trackId !== chosen.trackId };
    })
  };
}

/** Map a time through a warp's (source, target) anchors. */
export function warpTime(anchors: [number, number][], time: number): number {
  for (let i = 1; i < anchors.length; i++) {
    const [s0, t0] = anchors[i - 1];
    const [s1, t1] = anchors[i];
    if (time <= s1 || i === anchors.length - 1) {
      return s1 === s0 ? t0 : t0 + ((time - s0) * (t1 - t0)) / (s1 - s0);
    }
  }
  return time;
}
