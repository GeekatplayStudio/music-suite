"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { editorApi } from "@/lib/editor/api";
import type { Asset } from "@/lib/editor/types";

type LiveStatus = { ready: boolean; supported: boolean; reason: string; models: string[]; note: string };
const field = "w-full rounded-lg border border-white/10 bg-slate-900 p-2 text-sm";
const button = "rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";

async function api<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(`/suite-api/generation/live${path}`, payload === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "The live engine did not respond.");
  }
  return response.json();
}

export function LivePanel({ projectId, assetId, onSaved }: {
  projectId: string | null; assetId?: string; onSaved: (project: string, asset: Asset) => Promise<void>;
}) {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [caption, setCaption] = useState("Warm acoustic folk, steady rhythm");
  const [model, setModel] = useState("mrt2_small");
  const [running, setRunning] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [midi, setMidi] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false);
  const [referenceWeight, setReferenceWeight] = useState(.5);
  const [guidance, setGuidance] = useState(3);
  const [noteGuidance, setNoteGuidance] = useState(1);
  const [temperature, setTemperature] = useState(1.3);
  const [topK, setTopK] = useState(40);
  const [latency, setLatency] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const session = useRef<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const abort = useRef<AbortController | null>(null);
  const notes = useRef(new Set<number>());
  const drum = useRef(-1);
  const midiAccess = useRef<MIDIAccess | null>(null);
  const settings = useRef({ caption, midi, reference_weight: referenceWeight, guidance, note_guidance: noteGuidance, temperature, top_k: topK });
  useEffect(() => { settings.current = { caption, midi, reference_weight: referenceWeight, guidance, note_guidance: noteGuidance, temperature, top_k: topK }; },
    [caption, midi, referenceWeight, guidance, noteGuidance, temperature, topK]);
  useEffect(() => {
    let alive = true;
    api<LiveStatus>("").then(value => { if (alive) { setStatus(value); if (!value.models.includes(model)) setModel(value.models[0] || "mrt2_small"); } })
      .catch(err => { if (alive) setError(String(err.message)); });
    return () => {
      alive = false;
      if (session.current) void fetch(`/suite-api/generation/live/${session.current}/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true
      });
      session.current = null; abort.current?.abort(); void audio.current?.close();
      midiAccess.current?.inputs.forEach(input => { input.onmidimessage = null; });
      if (midiAccess.current) midiAccess.current.onstatechange = null;
    };
    // The model selection is initialized only when this panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function connectMidi() {
    try {
      const access = await navigator.requestMIDIAccess();
      midiAccess.current = access;
      const attach = () => access.inputs.forEach(input => {
        input.onmidimessage = event => {
          const [command, pitch, velocity] = event.data ?? [];
          const kind = command & 0xf0;
          if (kind === 0x90 && velocity > 0) {
            if ((command & 0x0f) === 9) drum.current = 1;
            else notes.current.add(pitch);
          } else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) notes.current.delete(pitch);
          else if (kind === 0xb0 && [120, 123].includes(pitch)) notes.current.clear();
        };
      });
      attach(); access.onstatechange = attach; setMidi(true); setMidiConnected(true);
    } catch (err) { setError(err instanceof Error ? err.message : "MIDI access was not granted."); }
  }
  async function stop(save: boolean) {
    const id = session.current;
    session.current = null; abort.current?.abort(); setRunning(false); setWorking(true);
    await audio.current?.close(); audio.current = null;
    try {
      if (id) {
        const result = await api<{ project_id: string; asset?: Asset }>(`/${id}/stop`, { save });
        if (result.asset) await onSaved(result.project_id, result.asset);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the live take."); }
    finally { setWorking(false); }
  }
  async function start() {
    setWorking(true); setError(""); setSeconds(0);
    try {
      const context = new AudioContext(); await context.resume(); audio.current = context;
      const target = projectId || (await editorApi.createProject("Magenta live session")).id;
      const result = await api<{ id: string }>("", { project_id: target, model, ...(assetId ? { asset_id: assetId } : {}) });
      session.current = result.id; setRunning(true); setWorking(false);
      let scheduled = context.currentTime + .1;
      while (session.current === result.id) {
        const controller = new AbortController(); abort.current = controller;
        const started = performance.now();
        const response = await fetch(`/suite-api/generation/live/${result.id}/chunk`, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ ...settings.current, notes: [...notes.current], drums: drum.current, frames: 10 })
        });
        drum.current = -1;
        if (!response.ok) { const body = await response.json(); throw new Error(body.detail || "Live render failed."); }
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (session.current !== result.id) break;
        setLatency((performance.now()-started)/1000); setSeconds(value => value + buffer.duration);
        const player = context.createBufferSource(); player.buffer = buffer; player.connect(context.destination);
        scheduled = Math.max(scheduled, context.currentTime + .03); player.start(scheduled); scheduled += buffer.duration;
        while (session.current === result.id && scheduled-context.currentTime > 1.2) await new Promise(resolve => setTimeout(resolve, 80));
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "The live session stopped.");
        await stop(false);
      }
    } finally { setWorking(false); }
  }
  return <section className="glass space-y-4 rounded-2xl border border-white/10 p-5">
    <h2 className="display-font text-lg font-semibold">Live music and MIDI steering</h2>
    <p className="text-sm text-slate-400">{status?.note || "Checking live engine availability…"}</p>
    {status && !status.supported && <p role="status" className="text-amber-200">{status.reason}</p>}
    {status?.supported && !status.ready && <p>Install a Magenta checkpoint in Settings before starting. <Link href="/models" className="text-cyan-300 underline">Models &amp; engines</Link></p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm">Checkpoint<select className={field} value={model} disabled={running || working} onChange={e => setModel(e.target.value)}>
        {(status?.models.length ? status.models : ["mrt2_small", "mrt2_base"]).map(name => <option key={name}>{name}</option>)}
      </select></label>
      <label className="space-y-1 text-sm">Live description<input className={field} value={caption} maxLength={4000} onChange={e => setCaption(e.target.value)} /></label>
      {[
        { label: "Style guidance", value: guidance, set: setGuidance, min: -1, max: 7, step: .1 },
        { label: "MIDI guidance", value: noteGuidance, set: setNoteGuidance, min: -1, max: 7, step: .1 },
        { label: "Temperature", value: temperature, set: setTemperature, min: .01, max: 3, step: .01 },
        { label: "Top K", value: topK, set: setTopK, min: 1, max: 1024, step: 1 }
      ].map(control => <label key={control.label} className="space-y-1 text-sm">{control.label}<input type="number" className={field}
        value={control.value} min={control.min} max={control.max} step={control.step} onChange={e => control.set(Number(e.target.value))} /></label>)}
      {assetId && <label className="space-y-1 text-sm">Reference sound weight: {Math.round(referenceWeight*100)}%<input className="w-full" type="range" min={0} max={1} step={.05} value={referenceWeight} onChange={e => setReferenceWeight(Number(e.target.value))} /></label>}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button className={button} disabled={working || running || !status?.ready || !caption.trim()} onClick={() => void start()}>Start live music</button>
      <button className={button} disabled={working || !running} onClick={() => void stop(true)}>Stop and save take</button>
      <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm" disabled={working || !running} onClick={() => void stop(false)}>Discard take</button>
      <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm" onClick={() => void connectMidi()}>Connect MIDI keyboard</button>
      {midiConnected && <label className="text-sm"><input type="checkbox" checked={midi} onChange={e => { setMidi(e.target.checked); if (!e.target.checked) notes.current.clear(); }} /> MIDI steering enabled</label>}
    </div>
    <p role="status" className="text-sm text-slate-300">{working ? "Preparing the live engine…" : running ? `Recording ${seconds.toFixed(1)} s` : "Stopped"}{latency !== null ? ` · Last 0.4 s chunk rendered in ${latency.toFixed(2)} s` : ""}</p>
    {latency !== null && latency > .4 && <p className="text-sm text-amber-200">This device is rendering slower than playback. Audio may pause between chunks.</p>}
    {error && <p role="alert" className="text-rose-300">{error}</p>}
  </section>;
}
