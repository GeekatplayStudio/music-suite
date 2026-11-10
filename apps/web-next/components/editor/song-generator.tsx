"use client";

import { useMemo, useState } from "react";
import { Cloud, Cpu, KeyRound, Loader2, RefreshCw } from "lucide-react";

import { ActionButton, PanelSection, Slider, fieldClass } from "@/components/editor/controls";
import type {
  SongCloudProvider,
  SongEngine,
  SongEngineId,
  SongEnginesStatus,
  SongParams
} from "@/lib/editor/types";

const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["ru", "Russian"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"]
];

const SECTION_TAGS = ["[verse]", "[pre-chorus]", "[chorus]", "[bridge]", "[outro]"];

const PROVIDER_LABELS: Record<SongCloudProvider, string> = {
  elevenlabs: "ElevenLabs",
  fal: "fal.ai"
};

/** Suite key labels ("F# minor") map onto the form song engines expect. */
function engineKey(label: string | null): string | null {
  if (!label) return null;
  const match = /^([A-G][#b]?)\s+(major|minor)$/i.exec(label.trim());
  return match ? `${match[1]} ${match[2].toLowerCase()}` : null;
}

interface SongGeneratorProps {
  status: SongEnginesStatus | null;
  projectBpm: number;
  projectKey: string | null;
  busy: boolean;
  onRefresh: () => void;
  onGenerate: (params: SongParams, title: string) => void;
  onSaveKey: (provider: SongCloudProvider, key: string) => Promise<boolean>;
  onRemoveKey: (provider: SongCloudProvider) => Promise<boolean>;
}

export function SongGenerator(props: SongGeneratorProps) {
  const engines = useMemo(() => props.status?.engines ?? [], [props.status]);
  // Until the user picks one, use the first engine that can run (local before cloud).
  const [picked, setPicked] = useState<SongEngineId | null>(null);
  const [model, setModel] = useState("");
  const [style, setStyle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [seconds, setSeconds] = useState(120);
  const [useTempo, setUseTempo] = useState(false);
  const [language, setLanguage] = useState("en");
  const [seed, setSeed] = useState("");
  const [acceptNc, setAcceptNc] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const engineId: SongEngineId = picked ?? engines.find((e) => e.available)?.id ?? "acestep";
  const engine: SongEngine | undefined = engines.find((e) => e.id === engineId);
  const supports = engine?.supports;
  const maxSeconds = Math.min(600, engine?.max_seconds ?? 600);
  const chosenModel = model && engine?.models.includes(model) ? model : engine?.default_model ?? "";
  const key = engineKey(props.projectKey);
  const needsAck = engine?.id === "yue2";
  const parsedSeed = seed.trim() === "" ? null : Math.max(0, Math.min(2_147_483_647, Math.floor(Number(seed))));
  const seedOk = parsedSeed === null || Number.isFinite(parsedSeed);
  const canGenerate =
    !!engine?.available && !props.busy && style.trim().length >= 3 && seedOk && (!needsAck || acceptNc);

  const insertTag = (tag: string) => {
    setLyrics((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n${tag}\n` : `${tag}\n`));
  };

  const generate = () => {
    if (!engine || !canGenerate) return;
    const params: SongParams = {
      engine: engine.id,
      style: style.trim(),
      lyrics: instrumental ? "" : lyrics,
      seconds: Math.round(Math.min(maxSeconds, Math.max(10, seconds))),
      instrumental,
      bpm: useTempo ? Math.round(Math.min(300, Math.max(30, props.projectBpm))) : null,
      key: useTempo ? key : null,
      language,
      seed: supports?.seed ? parsedSeed : null,
      model: chosenModel || null
    };
    if (needsAck) params.accept_noncommercial = acceptNc;
    props.onGenerate(params, `Writing a song with ${engine.label}`);
  };

  if (!props.status) {
    return (
      <PanelSection title="Create a song" hint="Full songs with vocals from a style and your lyrics.">
        <p className="flex items-center gap-2 text-[11px] text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for song engines…
        </p>
      </PanelSection>
    );
  }

  return (
    <PanelSection
      title="Create a song"
      hint="Describe the style, add lyrics (or go instrumental), and a finished song lands on a new track at the playhead."
    >
      <div className="flex items-center gap-1.5">
        <select
          className={fieldClass}
          aria-label="Song engine"
          value={engineId}
          onChange={(event) => {
            setPicked(event.target.value as SongEngineId);
            setModel("");
          }}
        >
          {engines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.local ? "Local · " : "Cloud · "}
              {e.label}
              {e.available ? "" : " (not ready)"}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Check engines again"
          title="Check engines again"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
          onClick={props.onRefresh}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {engine ? (
        <p
          className={`flex gap-1.5 rounded-lg px-2 py-1.5 text-[11px] leading-snug ${
            engine.available ? "bg-slate-900 text-slate-300" : "bg-amber-500/10 text-amber-200"
          }`}
        >
          {engine.local ? <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Cloud className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>
            {engine.hint}
            <span className="mt-0.5 block text-slate-400">Licence: {engine.license}</span>
          </span>
        </p>
      ) : null}

      {engine && engine.models.length > 1 ? (
        <select
          className={fieldClass}
          aria-label="Song model"
          value={chosenModel}
          onChange={(event) => setModel(event.target.value)}
        >
          {engine.models.map((name) => (
            <option key={name} value={name}>
              {engine.model_labels?.[name] ?? name}
            </option>
          ))}
        </select>
      ) : null}

      <textarea
        className={`${fieldClass} h-16 resize-none py-1.5`}
        placeholder="Style: e.g. dark synthwave, female vocal, analog bass, cinematic build"
        aria-label="Song style"
        maxLength={1000}
        value={style}
        onChange={(event) => setStyle(event.target.value)}
      />

      <label className="flex min-h-6 cursor-pointer items-center gap-2 text-[11px] text-slate-200">
        <input
          type="checkbox"
          className="h-4 w-4 accent-cyan-400"
          checked={instrumental}
          onChange={(event) => setInstrumental(event.target.checked)}
        />
        Instrumental (no vocals)
      </label>

      {!instrumental ? (
        <>
          <div className="flex flex-wrap gap-1">
            {SECTION_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-slate-700"
                onClick={() => insertTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <textarea
            className={`${fieldClass} h-36 resize-y py-1.5 font-mono`}
            placeholder={"[verse]\nYour first line here\n\n[chorus]\nThe hook goes here"}
            aria-label="Lyrics"
            maxLength={3500}
            value={lyrics}
            onChange={(event) => setLyrics(event.target.value)}
          />
          <p className="text-right text-[10px] text-slate-500">{lyrics.length} / 3500</p>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-16 shrink-0">Language</span>
            <select
              className={fieldClass}
              aria-label="Vocal language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {LANGUAGES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <Slider
        label="Length"
        value={Math.min(seconds, maxSeconds)}
        min={10}
        max={maxSeconds}
        step={5}
        defaultValue={120}
        disabled={supports ? !supports.duration : false}
        format={(v) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`}
        onChange={setSeconds}
      />
      {supports && !supports.duration ? (
        <p className="text-[10px] text-slate-500">This engine sets the length from the lyrics.</p>
      ) : null}

      <label className="flex min-h-6 cursor-pointer items-start gap-2 text-[11px] text-slate-200">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-cyan-400"
          checked={useTempo}
          onChange={(event) => setUseTempo(event.target.checked)}
        />
        <span>
          Match the project ({Math.round(props.projectBpm)} BPM{key ? `, ${key}` : ""})
          <span className="block text-slate-400">So the song lines up with what is already in the session.</span>
        </span>
      </label>

      {supports?.seed ? (
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className="w-16 shrink-0">Seed</span>
          <input
            type="number"
            className={fieldClass}
            placeholder="Random"
            min={0}
            value={seed}
            aria-label="Seed"
            onChange={(event) => setSeed(event.target.value)}
          />
        </label>
      ) : null}

      {needsAck ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-100">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-amber-400"
            checked={acceptNc}
            onChange={(event) => setAcceptNc(event.target.checked)}
          />
          <span>
            I understand YuE2 songs are for personal and research use only and cannot go into monetised videos or paid
            releases.
          </span>
        </label>
      ) : null}

      <ActionButton variant="primary" className="w-full" disabled={!canGenerate} onClick={generate}>
        {engine && !engine.local ? <Cloud className="h-3.5 w-3.5" /> : null}
        Generate song
      </ActionButton>

      <button
        type="button"
        className="flex w-full items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200"
        aria-expanded={showKeys}
        onClick={() => setShowKeys((v) => !v)}
      >
        <KeyRound className="h-3.5 w-3.5" />
        Cloud services (optional)
      </button>
      {showKeys ? <CloudKeys status={props.status} onSave={props.onSaveKey} onRemove={props.onRemoveKey} /> : null}
    </PanelSection>
  );
}

function CloudKeys({
  status,
  onSave,
  onRemove
}: {
  status: SongEnginesStatus;
  onSave: (provider: SongCloudProvider, key: string) => Promise<boolean>;
  onRemove: (provider: SongCloudProvider) => Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<Record<SongCloudProvider, string>>({ elevenlabs: "", fal: "" });
  const [saving, setSaving] = useState<SongCloudProvider | null>(null);
  const providers = Object.keys(PROVIDER_LABELS) as SongCloudProvider[];

  return (
    <div className="space-y-2 rounded-lg bg-slate-900 p-2">
      <p className="text-[11px] leading-snug text-slate-400">
        Cloud engines receive only your style text and lyrics, never audio. Keys stay on this computer and are never shown
        again after saving.
      </p>
      {providers.map((provider) => {
        const info = status.keys[provider];
        return (
          <div key={provider} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-200">{PROVIDER_LABELS[provider]}</span>
              <span className={info?.configured ? "text-emerald-300" : "text-slate-500"}>
                {info?.configured ? (info.source === "environment" ? `Set by ${info.env}` : "Key saved") : "No key"}
              </span>
            </div>
            {info?.source === "environment" ? null : (
              <div className="flex gap-1.5">
                <input
                  type="password"
                  autoComplete="off"
                  className={fieldClass}
                  placeholder={info?.configured ? "Replace key" : "Paste API key"}
                  aria-label={`${PROVIDER_LABELS[provider]} API key`}
                  value={drafts[provider]}
                  onChange={(event) => setDrafts((d) => ({ ...d, [provider]: event.target.value }))}
                />
                <ActionButton
                  disabled={saving !== null || drafts[provider].trim().length < 16}
                  onClick={async () => {
                    setSaving(provider);
                    const ok = await onSave(provider, drafts[provider]);
                    setSaving(null);
                    if (ok) setDrafts((d) => ({ ...d, [provider]: "" }));
                  }}
                >
                  Save
                </ActionButton>
                {info?.configured ? (
                  <ActionButton
                    variant="danger"
                    disabled={saving !== null}
                    onClick={async () => {
                      setSaving(provider);
                      await onRemove(provider);
                      setSaving(null);
                    }}
                  >
                    Remove
                  </ActionButton>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
