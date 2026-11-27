"""Writes a song brief (style, lyrics, tempo, key) with a local language model.

Ollama on loopback is used when it is running; otherwise the music engine's own
planner drafts a simpler brief. The result always goes through ``_clean`` so the
caller only ever sees well-formed, bounded fields.
"""

from __future__ import annotations

import json
import re
from typing import Any

import requests

from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation import lyrics_tools, resources, settings
from audioqi.generation.providers.acestep import KEYS, LANGUAGES, AceStepProvider

OLLAMA = resources.OLLAMA
TIMEOUT_SECONDS = 240.0
MAX_OUTPUT_TOKENS = 2000
MODES = ("brief", "lyrics")
_LANGUAGE_CODES = {code for code, _ in LANGUAGES}
_KEY_LOOKUP = {key.lower(): key for key in KEYS}
_FLATS = {"db": "c#", "d#": "eb", "gb": "f#", "g#": "ab", "a#": "bb"}

BRIEF_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "caption": {"type": "string"},
        "lyrics": {"type": "string"},
        "bpm": {"type": "integer"},
        "key": {"type": "string"},
        "time_signature": {"type": "string", "enum": ["2", "3", "4", "6"]},
        "language": {"type": "string"},
        "duration": {"type": "integer"},
    },
    "required": [
        "title",
        "caption",
        "lyrics",
        "bpm",
        "key",
        "time_signature",
        "language",
        "duration",
    ],
}

BRIEF_PROMPT = """You are a songwriter preparing a brief for an AI music generator.
Write an ORIGINAL song. Never copy existing lyrics and never name real artists or bands.

Idea from the user:
{idea}

Return JSON with these keys:
- "title": a short song title.
- "caption": one paragraph (40-90 words) describing genre, mood, instruments, the singing voice and the production.
- "lyrics": the complete lyrics. Put a tag on its own line before every section, chosen from
  [Intro], [Verse], [Pre-Chorus], [Chorus], [Bridge], [Instrumental], [Outro]. 2-3 verses and a repeated chorus.
  Write only words to be sung: no stage directions, no instrument notes, nothing in parentheses.
  {instrumental}
- "bpm": tempo as a whole number between 50 and 200.
- "key": musical key such as "A minor" or "F# major".
- "time_signature": "4" for 4/4, "3" for 3/4, "6" for 6/8 or "2" for 2/4.
- "language": two-letter code of the lyrics language (for example "en").
- "duration": song length in seconds between 60 and 300 that fits the lyrics.
{extra}"""

LYRICS_PROMPT = """You are a songwriter editing lyrics for an AI music generator.
Keep the work original; never copy existing songs.

Style of the song:
{caption}

Current lyrics:
{lyrics}

What to do: {idea}

Return JSON with the same keys as a full song brief. Keep "caption" as given unless the request
is about the style. Keep section tags such as [Verse] and [Chorus] on their own lines.
- "title", "caption", "lyrics", "bpm", "key", "time_signature", "language", "duration"."""


def status() -> dict[str, Any]:
    model = str(settings.load()["writer_model"])
    result: dict[str, Any] = {
        "available": False,
        "model": model,
        "model_installed": False,
        "models": [],
    }
    try:
        tags = requests.get(f"{OLLAMA}/api/tags", timeout=2.0).json().get("models", [])
    except (requests.RequestException, ValueError):
        return result
    names = sorted(
        str(item.get("name")) for item in tags if isinstance(item, dict) and item.get("name")
    )
    result.update(
        available=True,
        models=names[:100],
        model_installed=model in names or f"{model}:latest" in names,
    )
    return result


def _normal_key(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    match = re.match(
        r"\s*([A-Ga-g])\s*([#b♯♭]?)\s*(maj(?:or)?|min(?:or)?|[mM])?\s*$",
        value.strip(),
        re.IGNORECASE,
    )
    if not match:
        return None
    note = (match.group(1) + match.group(2).replace("♯", "#").replace("♭", "b")).lower()
    note = _FLATS.get(note, note)
    raw_mode = match.group(3) or "major"
    # A bare "M" means major; "m", "min" and "minor" mean minor.
    minor = raw_mode == "m" or raw_mode.lower().startswith("min")
    mode = "minor" if minor else "major"
    return _KEY_LOOKUP.get(f"{note} {mode}")


def _clean(raw: Any) -> dict[str, Any]:
    """Bound and normalise a model's brief. Raises ValueError when it is unusable."""
    if not isinstance(raw, dict):
        raise ValueError("not an object")
    caption = " ".join(str(raw.get("caption") or "").split())[:1500]
    if len(caption) < 10:
        raise ValueError("caption missing")
    lyrics = str(raw.get("lyrics") or "")
    lyrics = "".join(ch for ch in lyrics if ch.isprintable() or ch == "\n").strip()[:6000]
    brief: dict[str, Any] = {
        "title": " ".join(str(raw.get("title") or "").split())[:80] or "Untitled song",
        "caption": caption,
        "lyrics": re.sub(r"\n{3,}", "\n\n", lyrics),
    }
    bpm = raw.get("bpm")
    if isinstance(bpm, (int, float)) and not isinstance(bpm, bool) and 30 <= bpm <= 300:
        brief["bpm"] = round(bpm)
    key = _normal_key(raw.get("key") or raw.get("keyscale"))
    if key:
        brief["keyscale"] = key
    signature = (
        str(raw.get("time_signature") or raw.get("timesignature") or "").split("/")[0].strip()
    )
    if signature in ("2", "3", "4", "6"):
        brief["timesignature"] = signature
    language = str(raw.get("language") or raw.get("vocal_language") or "").strip().lower()[:8]
    if language in _LANGUAGE_CODES:
        brief["vocal_language"] = language
    duration = raw.get("duration")
    if (
        isinstance(duration, (int, float))
        and not isinstance(duration, bool)
        and 10 <= duration <= 600
    ):
        brief["duration"] = float(round(duration))
    return brief


def _ollama_json(model: str, prompt: str, schema: dict[str, Any], temperature: float = 0.9) -> Any:
    """The model's JSON answer, shaped by ``schema``. Raises ValueError when it is not JSON."""
    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "format": schema,
        "keep_alive": "2m",
        "options": {"temperature": temperature, "num_predict": MAX_OUTPUT_TOKENS},
    }
    try:
        response = requests.post(f"{OLLAMA}/api/generate", json=payload, timeout=TIMEOUT_SECONDS)
    except requests.RequestException as exc:
        raise EditorError("The lyrics model did not answer in time.", 504) from exc
    if response.status_code != 200:
        raise EditorError("The lyrics model reported an error.", 502)
    try:
        return json.loads(response.json().get("response") or "")
    except (ValueError, TypeError) as exc:
        raise ValueError(str(exc)) from exc


def _ask_ollama(model: str, prompt: str) -> dict[str, Any]:
    try:
        return _clean(_ollama_json(model, prompt, BRIEF_SCHEMA))
    except (ValueError, TypeError) as exc:
        raise ValueError(str(exc)) from exc


def _text(value: Any, name: str, limit: int, *, required: bool = True) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise ParamError(f"'{name}' must be text.")
    cleaned = "".join(ch for ch in value if ch.isprintable() or ch == "\n").strip()
    if len(cleaned) > limit or (required and len(cleaned) < 3):
        raise ParamError(f"'{name}' must be between 3 and {limit} characters.")
    return cleaned


def write(payload: Any) -> dict[str, Any]:
    """Draft or revise a song brief. Returns ``{"brief": {...}, "engine": "..."}``."""
    if not isinstance(payload, dict):
        raise ParamError("The request must be an object.")
    unknown = set(payload) - {"mode", "idea", "caption", "lyrics", "instrumental"}
    if unknown:
        raise ParamError("Unknown field(s) in the request.")
    mode = payload.get("mode", "brief")
    if mode not in MODES:
        raise ParamError(f"'mode' must be one of: {', '.join(MODES)}.")
    idea = _text(payload.get("idea"), "idea", 1000)
    instrumental = payload.get("instrumental") is True
    if mode == "lyrics":
        prompt = LYRICS_PROMPT.format(
            idea=idea,
            caption=_text(payload.get("caption"), "caption", 1500, required=False) or "(not given)",
            lyrics=_text(payload.get("lyrics"), "lyrics", 6000, required=False) or "(none yet)",
        )
    else:
        prompt = BRIEF_PROMPT.format(
            idea=idea,
            instrumental='The song is instrumental: set "lyrics" to exactly "[Instrumental]".'
            if instrumental
            else "",
            extra="",
        )

    if not resources.GENERATION_LOCK.acquire(blocking=False):
        raise EditorError(
            "A song is being generated. Write lyrics again when it has finished.", 409
        )
    try:
        current = status()
        if current["available"] and current["model_installed"]:
            for attempt in range(2):
                try:
                    return {
                        "brief": _ask_ollama(current["model"], prompt),
                        "engine": f"ollama:{current['model']}",
                    }
                except ValueError as exc:
                    if attempt == 0:
                        prompt += f"\n\nYour previous answer was unusable ({exc}). Return only the JSON object."
        if mode == "brief":
            # No usable Ollama: the music engine's planner can still draft a simpler brief.
            plan = AceStepProvider().inspire(idea)
            try:
                return {
                    "brief": _clean({**plan, "key": plan.get("keyscale"), "title": idea[:60]}),
                    "engine": "acestep-planner",
                }
            except ValueError as exc:
                raise EditorError(
                    "The planner could not draft this song. Try rewording the idea.", 502
                ) from exc
        if not current["available"]:
            raise EditorError("Ollama is not running. Start Ollama to rewrite lyrics.", 503)
        if not current["model_installed"]:
            raise EditorError(
                f"The lyrics model “{current['model']}” is not downloaded. Get it from AI Song Studio > Settings.",
                503,
            )
        raise EditorError("The lyrics model returned an unusable answer. Please try again.", 502)
    finally:
        resources.GENERATION_LOCK.release()


# --------------------------------------------------------------------------- style and lines

CAPTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"caption": {"type": "string"}},
    "required": ["caption"],
}
LINES_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"lines": {"type": "array", "items": {"type": "string"}}},
    "required": ["lines"],
}

CAPTION_PROMPT = """You improve style descriptions for an AI music generator.
Keep the work original: never name real artists, bands or songs.

Current style description:
{caption}
{lyrics_hint}{direction}
Rewrite it as one paragraph of 30-80 words, in English (the music models understand English
best). Keep the user's genre, mood and intent, and make it concrete: genre and subgenre, mood,
tempo feel, the main instruments, the singing voice (or that it is instrumental) and the
production sound. Return JSON: {{"caption": "..."}}."""

LINE_PROMPT = """You are a songwriter. Suggest replacements for ONE line of a song.
Write every suggestion in {language_name}, the language of the lyrics.

Style of the song: {caption}

The whole lyrics, for context:
{lyrics}

The line to replace: "{line}"

Each suggestion must:
- have {syllables} syllables, the same singing rhythm as the line it replaces;
{rhyme_rule}
- keep the meaning and mood of the song, be original, and contain no stage directions and
  nothing in brackets.
{direction}
Return JSON: {{"lines": [...]}} with {count} different suggestions."""

_LANGUAGE_NAMES = {
    "en": "English",
    "ru": "Russian",
    "uk": "Ukrainian",
    "es": "Spanish",
    "de": "German",
    "fr": "French",
}
SUGGESTIONS = 8


def _rhyme_rule(word: str | None, language: str) -> str:
    if not word:
        return "- (it does not need to rhyme with anything);"
    if language in ("ru", "uk"):
        letters = lyrics_tools.ending_letters(word, language)
        return (
            f'- its LAST WORD must end with the letters "-{letters}" and sound like "{word}" at the '
            f'end (a real rhyme), must not be "{word}" itself, and the line must still read naturally;'
        )
    return f'- end with a word that rhymes with "{word}" (a real rhyme, not that same word);'


def _writer_model() -> str:
    """The installed lyrics model, or an error saying what to do."""
    current = status()
    if not current["available"]:
        raise EditorError("Ollama is not running. Start Ollama to rewrite lyrics.", 503)
    if not current["model_installed"]:
        raise EditorError(
            f"The lyrics model “{current['model']}” is not downloaded. Get it from AI Song Studio > Settings.",
            503,
        )
    return str(current["model"])


def _locked(work: Any) -> Any:
    if not resources.GENERATION_LOCK.acquire(blocking=False):
        raise EditorError("A song is being generated. Write lyrics again when it has finished.", 409)
    try:
        return work()
    finally:
        resources.GENERATION_LOCK.release()


def check_lyrics(payload: Any) -> dict[str, Any]:
    """Syllables and rhyme letters for every sung line (no language model)."""
    if not isinstance(payload, dict):
        raise ParamError("The request must be an object.")
    lyrics = payload.get("lyrics")
    if not isinstance(lyrics, str) or len(lyrics) > 6000:
        raise ParamError("'lyrics' must be text of at most 6000 characters.")
    language = payload.get("language")
    return lyrics_tools.analyse(lyrics, language if isinstance(language, str) else None)


def improve_caption(payload: Any) -> dict[str, Any]:
    """A clearer, more concrete style description, keeping the user's intent."""
    if not isinstance(payload, dict):
        raise ParamError("The request must be an object.")
    caption = _text(payload.get("caption"), "caption", 1500)
    lyrics = _text(payload.get("lyrics"), "lyrics", 6000, required=False)
    direction = _text(payload.get("idea"), "idea", 300, required=False)
    prompt = CAPTION_PROMPT.format(
        caption=caption,
        lyrics_hint=f"\nThe song's lyrics begin:\n{lyrics[:600]}\n" if lyrics else "",
        direction=f"\nThe user also asks: {direction}\n" if direction else "",
    )

    def work() -> dict[str, Any]:
        current = status()
        if current["available"] and current["model_installed"]:
            ask = prompt
            for _attempt in range(2):
                try:
                    raw = _ollama_json(str(current["model"]), ask, CAPTION_SCHEMA, 0.7)
                    text = " ".join(str((raw or {}).get("caption") or "").split())[:1500]
                    if len(text) >= 10:
                        return {"caption": text, "engine": f"ollama:{current['model']}"}
                except ValueError:
                    pass
                ask = prompt + "\n\nReturn only the JSON object."
        # No usable Ollama: the music engine's planner can still describe the style.
        try:
            plan = AceStepProvider().inspire(caption)
            text = " ".join(str(plan.get("caption") or "").split())[:1500]
        except Exception as exc:
            raise EditorError(
                "No language model is available to improve the style. Start Ollama, or install the local music engine.",
                503,
            ) from exc
        if len(text) < 10:
            raise EditorError("The style could not be improved. Try rewording it.", 502)
        return {"caption": text, "engine": "acestep-planner"}

    return _locked(work)


def suggest_line(payload: Any) -> dict[str, Any]:
    """Alternatives for one line that keep its syllable count and its rhyme.

    The language model proposes; lyrics_tools measures every proposal, and the ones that
    rhyme and fit come first. If too few pass, the model is asked once more with the
    failures named.
    """
    if not isinstance(payload, dict):
        raise ParamError("The request must be an object.")
    lyrics = payload.get("lyrics")
    if not isinstance(lyrics, str) or not lyrics.strip() or len(lyrics) > 6000:
        raise ParamError("'lyrics' must be text of at most 6000 characters.")
    line = payload.get("line")
    rows = lyrics.splitlines()
    if not isinstance(line, int) or isinstance(line, bool) or not 0 <= line < len(rows):
        raise ParamError("'line' must be the number of a line in the lyrics.")
    language = payload.get("language")
    analysis = lyrics_tools.analyse(lyrics, language if isinstance(language, str) else None)
    lang = analysis["language"]
    me = next((entry for entry in analysis["lines"] if entry["line"] == line), None)
    if me is None:
        raise ParamError("That line has no words to replace.")
    wanted = payload.get("rhyme_with", "auto")
    if wanted == "auto":
        partner = lyrics_tools.rhyme_partner(analysis, line)
    elif wanted is None:
        partner = None
    elif isinstance(wanted, int) and not isinstance(wanted, bool):
        partner = wanted
    else:
        raise ParamError("'rhyme_with' must be a line number, null or \"auto\".")
    target = next((entry for entry in analysis["lines"] if entry["line"] == partner), None)
    rhyme_word = target["end_word"] if target else None
    caption = _text(payload.get("caption"), "caption", 1500, required=False) or "(not given)"
    direction = _text(payload.get("idea"), "idea", 300, required=False)
    prompt = LINE_PROMPT.format(
        language_name=_LANGUAGE_NAMES.get(lang, "the language of the lyrics"),
        caption=caption,
        lyrics=lyrics,
        line=me["text"],
        syllables=me["syllables"],
        rhyme_rule=_rhyme_rule(rhyme_word, lang),
        direction=f"- also: {direction}" if direction else "",
        count=SUGGESTIONS,
    )

    def good(item: dict[str, Any]) -> bool:
        return bool(item["fits"]) and item["rhymes"] is not False

    def work() -> dict[str, Any]:
        model = _writer_model()
        seen = {" ".join(me["text"].lower().split())}
        scored: list[dict[str, Any]] = []
        ask = prompt
        # Small models rhyme worst in Russian and Ukrainian: one more try there.
        attempts = 3 if lang in ("ru", "uk") and rhyme_word else 2
        for attempt in range(attempts):
            try:
                raw = _ollama_json(model, ask, LINES_SCHEMA, 0.9)
            except ValueError:
                raw = {}
            for text in (raw or {}).get("lines") or []:
                if not isinstance(text, str):
                    continue
                clean = " ".join("".join(ch for ch in text if ch.isprintable()).split()).strip(" \"'«»“”")
                key = clean.lower()
                if not clean or len(clean) > 200 or key in seen or not lyrics_tools.words_of(clean):
                    continue
                seen.add(key)
                scored.append(lyrics_tools.score_candidate(clean, lang, me["syllables"], rhyme_word))
            if sum(1 for item in scored if good(item)) >= 3 or attempt == attempts - 1:
                break
            misses = [item["text"] for item in scored if not good(item)][:6]
            ask = (
                prompt
                + "\n\nThese suggestions did not work (wrong number of syllables"
                + (f" or no real rhyme with \"{rhyme_word}\"" if rhyme_word else "")
                + "):\n"
                + "\n".join(f"- {text}" for text in misses)
                + f"\nWrite {SUGGESTIONS} new ones that do."
            )
        scored.sort(key=lambda item: (not good(item), item["rhymes"] is False, abs(item["syllables"] - me["syllables"])))
        return {
            "line": line,
            "original": me["text"],
            "syllables": me["syllables"],
            "rhyme_with": partner if target else None,
            "rhyme_word": rhyme_word,
            "language": lang,
            "suggestions": scored[:SUGGESTIONS],
            "engine": f"ollama:{model}",
        }

    return _locked(work)
