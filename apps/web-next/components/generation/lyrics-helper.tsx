"use client";

/**
 * Rhymes and syllables for the lyrics being written, and alternatives for any line.
 *
 * The check runs by rule on the server (audioqi/generation/lyrics_tools.py), with no language
 * model, so it is instant and does not need Ollama: each sung line gets its syllable count and
 * a rhyme letter within its section (AABB, ABAB…). Lines much longer or shorter than the rest
 * of their section are marked, because they will not sit on the same melody.
 *
 * "Alternatives" asks the lyrics model for replacements of one line; every suggestion is then
 * measured by the same rules, and the ones that keep the rhyme and the syllable count are
 * listed first, so a fluent but unrhymed suggestion is never passed off as a rhyme.
 */

import { Check, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { generationApi, type LineSuggestions, type LyricsCheck, type LyricsLine } from "@/lib/generation/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const RHYME_COLOURS = [
  "bg-cyan-500/20 text-cyan-200",
  "bg-amber-500/20 text-amber-200",
  "bg-violet-500/20 text-violet-200",
  "bg-emerald-500/20 text-emerald-200",
  "bg-rose-500/20 text-rose-200",
  "bg-sky-500/20 text-sky-200"
];

const small =
  "inline-flex h-7 items-center gap-1 rounded-md bg-slate-800 px-2 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 " +
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-40";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** Replace one line of the text, keeping every other line exactly as it was. */
function replaceLine(lyrics: string, line: number, text: string): string {
  const rows = lyrics.split("\n");
  if (line < 0 || line >= rows.length) return lyrics;
  rows[line] = text;
  return rows.join("\n");
}

export function LyricsHelper({
  lyrics,
  language,
  caption,
  disabled,
  onChange
}: {
  lyrics: string;
  /** The vocal language chosen in the form, if any; otherwise it is guessed from the letters. */
  language?: string;
  caption?: string;
  disabled: boolean;
  onChange: (lyrics: string) => void;
}) {
  const { t, tp } = useI18n();
  const [check, setCheck] = useState<LyricsCheck | null>(null);
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<number | null>(null);

  // Checked a moment after typing stops.
  useEffect(() => {
    if (!lyrics.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      generationApi
        .checkLyrics(lyrics, language)
        .then((result) => !cancelled && setCheck(result))
        .catch(() => !cancelled && setCheck(null));
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lyrics, language]);

  const sections = useMemo(() => {
    const groups = new Map<number, LyricsLine[]>();
    for (const entry of check?.lines ?? []) {
      groups.set(entry.section_index, [...(groups.get(entry.section_index) ?? []), entry]);
    }
    return Array.from(groups.values());
  }, [check]);

  if (!lyrics.trim() || !check || !check.lines.length) return null;
  const approximate = check.language !== "es" && (check.language !== "en" || !check.dictionary);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-200"
      >
        <span className="flex-1">{t("studio.lyricsHelper.heading")}</span>
        <span className="font-normal text-slate-400">{tp("studio.lyricsHelper.lines", check.lines.length)}</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-white/10 px-3 pb-3 pt-2">
          <p className="text-[11px] leading-snug text-slate-400">
            {t("studio.lyricsHelper.help")} {approximate ? t("studio.lyricsHelper.approximate") : null}
          </p>
          {sections.map((rows) => {
            const typical = median(rows.map((row) => row.syllables));
            const letters = Array.from(new Set(rows.map((row) => row.rhyme).filter(Boolean))) as string[];
            return (
              <div key={rows[0].section_index} className="space-y-0.5">
                {rows[0].section ? <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{rows[0].section}</p> : null}
                {rows.map((row) => {
                  const off = rows.length > 2 && Math.abs(row.syllables - typical) > 2;
                  return (
                    <div key={row.line}>
                      <div className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[13px] hover:bg-slate-800/60">
                        <span
                          className={cn(
                            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold",
                            row.rhyme ? RHYME_COLOURS[letters.indexOf(row.rhyme) % RHYME_COLOURS.length] : "text-slate-600"
                          )}
                          title={row.rhyme ? t("studio.lyricsHelper.rhymeTitle", { letter: row.rhyme }) : t("studio.lyricsHelper.noRhyme")}
                        >
                          {row.rhyme ?? "·"}
                        </span>
                        <span
                          className={cn("w-7 shrink-0 text-right font-mono text-[11px] tabular-nums", off ? "text-amber-300" : "text-slate-400")}
                          title={off ? t("studio.lyricsHelper.offTitle", { n: row.syllables, typical }) : tp("studio.lyricsHelper.syllables", row.syllables)}
                        >
                          {row.syllables}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-slate-200">{row.text}</span>
                        <button
                          type="button"
                          className={small}
                          disabled={disabled}
                          aria-expanded={active === row.line}
                          onClick={() => setActive((current) => (current === row.line ? null : row.line))}
                          title={t("studio.lyricsHelper.alternativesTitle")}
                        >
                          <Sparkles className="h-3 w-3" aria-hidden /> {t("studio.lyricsHelper.alternatives")}
                        </button>
                      </div>
                      {active === row.line ? (
                        <LineAlternatives
                          key={row.line}
                          lyrics={lyrics}
                          row={row}
                          section={rows}
                          language={check.language}
                          caption={caption}
                          disabled={disabled}
                          onUse={(text) => {
                            onChange(replaceLine(lyrics, row.line, text));
                            setActive(null);
                          }}
                          onClose={() => setActive(null)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function LineAlternatives({
  lyrics,
  row,
  section,
  language,
  caption,
  disabled,
  onUse,
  onClose
}: {
  lyrics: string;
  row: LyricsLine;
  section: LyricsLine[];
  language: string;
  caption?: string;
  disabled: boolean;
  onUse: (text: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [rhyme, setRhyme] = useState<string>("auto");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LineSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggest = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await generationApi.suggestLine({
          lyrics,
          line: row.line,
          language,
          rhyme_with: rhyme === "auto" ? "auto" : rhyme === "none" ? null : Number(rhyme),
          caption: caption || undefined,
          idea: idea.trim() || undefined
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("studio.lyricsHelper.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="my-1 ml-7 space-y-2 rounded-lg border border-cyan-400/20 bg-slate-900/80 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-slate-300">
          {t("studio.lyricsHelper.rhymeWith")}
          <select
            value={rhyme}
            onChange={(event) => setRhyme(event.target.value)}
            disabled={busy}
            className="h-7 max-w-56 rounded-md border border-white/10 bg-slate-950 px-1.5 text-xs text-slate-100"
          >
            <option value="auto">{t("studio.lyricsHelper.rhymeAuto")}</option>
            {section
              .filter((other) => other.line !== row.line)
              .map((other) => (
                <option key={other.line} value={String(other.line)}>
                  «{other.end_word}» — {other.text.slice(0, 40)}
                </option>
              ))}
            <option value="none">{t("studio.lyricsHelper.rhymeNone")}</option>
          </select>
        </label>
        <input
          type="text"
          value={idea}
          maxLength={300}
          disabled={busy}
          onChange={(event) => setIdea(event.target.value)}
          placeholder={t("studio.lyricsHelper.ideaPlaceholder")}
          aria-label={t("studio.lyricsHelper.ideaPlaceholder")}
          className="h-7 min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-2 text-xs text-slate-100 placeholder:text-slate-500"
        />
        <button type="button" className={cn(small, "bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30")} disabled={busy || disabled} onClick={() => void suggest()}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
          {busy ? t("studio.lyricsHelper.suggesting") : t("studio.lyricsHelper.suggest")}
        </button>
        <button type="button" className={small} onClick={onClose} aria-label={t("common.close")}>
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
      {error ? <p role="alert" className="rounded-md bg-rose-500/10 px-2 py-1 text-rose-200">{error}</p> : null}
      {result ? (
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">
            {result.rhyme_word
              ? t("studio.lyricsHelper.target", { n: result.syllables, word: result.rhyme_word })
              : t("studio.lyricsHelper.targetFree", { n: result.syllables })}
          </p>
          {result.suggestions.length ? (
            result.suggestions.map((item) => {
              const good = item.fits && item.rhymes !== false;
              return (
                <div key={item.text} className={cn("flex items-center gap-2 rounded-md px-1.5 py-1", good ? "bg-emerald-500/5" : "opacity-70")}>
                  <span
                    className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded", good ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-500")}
                    title={
                      item.rhymes === false
                        ? t("studio.lyricsHelper.noRhymeMark")
                        : !item.fits
                          ? t("studio.lyricsHelper.lengthMark", { n: item.syllables })
                          : t("studio.lyricsHelper.goodMark")
                    }
                  >
                    {good ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                  </span>
                  <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-400">{item.syllables}</span>
                  <span className="min-w-0 flex-1 text-[13px] text-slate-100">{item.text}</span>
                  <button type="button" className={small} disabled={disabled} onClick={() => onUse(item.text)}>
                    {t("studio.lyricsHelper.use")}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-slate-400">{t("studio.lyricsHelper.none")}</p>
          )}
          {result.suggestions.length && !result.suggestions.some((item) => item.fits && item.rhymes !== false) ? (
            <p className="text-[11px] text-amber-200">{t("studio.lyricsHelper.noneGood")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
