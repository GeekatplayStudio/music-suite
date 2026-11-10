"""Online generation services: ElevenLabs Music and fal.ai. Off until the user adds a key.

What is sent: the style text and the lyrics, to the one service the user chose.
Audio is sent only for an ElevenLabs edit of a clip that was not made there, and only
after the user ticks "Allow uploading this clip" for that edit. File paths and project
data are never sent.
Requests go to fixed HTTPS hosts, redirects are followed only within an allowlist,
and downloaded audio must stay under the suite's upload size limit.
"""

from __future__ import annotations

import io
import math
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import numpy as np
import requests
import soundfile as sf
from scipy.signal import resample_poly

from audioqi.editor import projects
from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation import remote_songs, secrets
from audioqi.generation.providers.acestep import KEYS, LANGUAGES, SECTIONS, match_level
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.schema import field

ELEVENLABS_HOST = "api.elevenlabs.io"
ELEVENLABS_URL = f"https://{ELEVENLABS_HOST}/v1/music"
ELEVENLABS_PLAN_URL = f"https://{ELEVENLABS_HOST}/v1/music/plan"
ELEVENLABS_UPLOAD_URL = f"https://{ELEVENLABS_HOST}/v1/music/upload"
#: Song plans and inpainting need these models (the plan format is "chunks").
PLAN_MODELS = ("music_v2_5", "music_v2")
EDIT_OUTPUT_FORMAT = "mp3_48000_192"
MAX_CHUNKS = 30
MIN_CHUNK_SECONDS = 3.0
MAX_CHUNK_SECONDS = 120.0
MAX_CONDITIONING_SECONDS = 30.0
# Published prices, used only for the estimate shown before generating. They change; the
# provider's page is linked next to every estimate.
PRICES_AS_OF = "2026-11"
ELEVENLABS_USD_PER_MINUTE = 0.15
FAL_USD_PER_SONG = {"fal-ai/minimax-music/v2.6": 0.15, "fal-ai/lyria3/pro": 0.08}
ELEVENLABS_MODELS = ("music_v2_5", "music_v2", "music_v1")
ELEVENLABS_FORMATS = ("mp3_44100_192", "mp3_44100_128")
ELEVENLABS_PROMPT_LIMIT = 4100
FAL_QUEUE_HOST = "queue.fal.run"
FAL_MEDIA_HOSTS = ("fal.media", ".fal.media")
FAL_MODELS: dict[str, dict[str, Any]] = {
    "fal-ai/minimax-music/v2.6": {"label": "MiniMax Music 2.6", "lyrics_field": True},
    "fal-ai/lyria3/pro": {"label": "Google Lyria 3 Pro", "lyrics_field": False},
}
FAL_DEFAULT_MODEL = "fal-ai/minimax-music/v2.6"
MAX_REDIRECTS = 3
AUDIO_TYPES = {
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/ogg": ".ogg",
}


# --------------------------------------------------------------------------- shared helpers


def describe(values: dict[str, Any]) -> str:
    """One prompt line: the style plus the musical constraints the user set."""
    parts = [str(values.get("caption", "")).strip()]
    if values.get("bpm"):
        parts.append(f"{values['bpm']} BPM")
    if values.get("keyscale"):
        parts.append(f"in {values['keyscale']}")
    if values.get("instrumental"):
        parts.append("instrumental, no vocals")
    return ", ".join(part for part in parts if part)


def sings(values: dict[str, Any]) -> bool:
    return not values.get("instrumental") and bool(str(values.get("lyrics", "")).strip())


def prompt_with_lyrics(values: dict[str, Any], limit: int) -> str:
    text = describe(values)
    if sings(values):
        text = f"{text}\n\nLyrics:\n{str(values['lyrics']).strip()}"
    if len(text) > limit:
        raise EditorError(
            f"Style and lyrics together must stay under {limit} characters here.", 422
        )
    return text


def suffix_for(name: str, content_type: str = "", default: str = ".mp3") -> str:
    tail = urlparse(name).path.rsplit(".", 1)[-1].lower() if "." in urlparse(name).path else ""
    if f".{tail}" in set(AUDIO_TYPES.values()):
        return f".{tail}"
    return AUDIO_TYPES.get(content_type.split(";")[0].strip().lower(), default)


def host_allowed(url: str, hosts: tuple[str, ...]) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return False
    if parsed.port not in (None, 443):
        return False
    return any(host == h or (h.startswith(".") and host.endswith(h)) for h in hosts)


def _read_capped(response: requests.Response) -> bytes:
    limit = projects.SETTINGS.max_upload_bytes
    body = bytearray()
    for chunk in response.iter_content(1024 * 1024):
        body.extend(chunk)
        if len(body) > limit:
            response.close()
            raise EditorError("The generated song is larger than the upload limit.", 502)
    if not body:
        raise EditorError("The service finished but returned no audio.", 502)
    return bytes(body)


def download(url: str, hosts: tuple[str, ...]) -> tuple[bytes, str, str]:
    """GET audio from an allowlisted host, following redirects only within the allowlist."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        if not host_allowed(current, hosts):
            raise EditorError("The service returned audio from an unexpected address.", 502)
        try:
            response = requests.get(current, timeout=120.0, stream=True, allow_redirects=False)
        except requests.RequestException as exc:
            raise EditorError("The generated song could not be downloaded.", 502) from exc
        if response.status_code in (301, 302, 303, 307, 308):
            current = urljoin(current, response.headers.get("location", ""))
            response.close()
            continue
        if response.status_code != 200:
            raise EditorError("The generated song could not be downloaded.", 502)
        return _read_capped(response), response.headers.get("content-type", ""), current
    raise EditorError("The service redirected too many times.", 502)


def _error_detail(response: requests.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""
    detail = body.get("detail") if isinstance(body, dict) else None
    if detail is None and isinstance(body, dict) and isinstance(body.get("error"), dict):
        detail = body["error"].get("message")
    if isinstance(detail, dict):
        detail = detail.get("message") or detail.get("status")
    if isinstance(detail, list) and detail and isinstance(detail[0], dict):
        detail = detail[0].get("msg")
    return str(detail)[:200] if detail else ""


def refuse(name: str, response: requests.Response) -> EditorError:
    if response.status_code in (401, 403):
        return EditorError(
            f"{name} rejected the API key. Check it in AI Song Studio > Settings.", 502
        )
    if response.status_code == 402:
        return EditorError(f"{name} says the account has no credit left for this.", 502)
    if response.status_code == 429:
        return EditorError(f"{name} is limiting requests right now. Try again shortly.", 502)
    detail = _error_detail(response)
    return EditorError(
        f"{name} refused the request ({response.status_code}){': ' + detail if detail else '.'}",
        502,
    )


def _common_fields(*, lyrics_max: int) -> list[dict[str, Any]]:
    return [
        field(
            "caption",
            "text",
            "Song",
            "Style description",
            required=True,
            min=3,
            max=1000,
            multiline=True,
            help="Genre, mood, instruments, voice and production, in plain words.",
        ),
        field("instrumental", "bool", "Song", "Instrumental (no vocals)", default=False),
        field(
            "lyrics",
            "lyrics",
            "Lyrics",
            "Lyrics",
            max=lyrics_max,
            sections=SECTIONS,
            help="Use tags such as [Verse] and [Chorus]. Leave empty to let the service write them.",
        ),
        field(
            "bpm",
            "int",
            "Music",
            "Tempo",
            min=30,
            max=300,
            step=1,
            unit="BPM",
            auto=True,
            help="Added to the style text; the service treats it as a request, not a guarantee.",
        ),
        field("keyscale", "enum", "Music", "Key", auto=True, options=KEYS),
    ]


class _CloudProvider:
    kind = "external"
    id = ""
    name = ""
    short = ""
    terms_url = ""

    def _key(self) -> str:
        key = secrets.get(self.id)
        if key is None:
            raise EditorError(
                f"Add your {self.short} API key in AI Song Studio > Settings first.", 403
            )
        return key

    def status(self) -> dict[str, Any]:
        key = secrets.summary(self.id)
        return {
            "ready": bool(key["configured"]),
            "message": (
                f"Sends your style text and lyrics to {self.short}, which bills your account. "
                "Audio is sent only when you allow uploading a clip to edit it."
                if key["configured"]
                else f"Add your own {self.short} API key to use it."
            ),
            "key": key,
            "terms_url": self.terms_url,
        }


# --------------------------------------------------------------------------- ElevenLabs


class ElevenLabsProvider(_CloudProvider):
    id = "elevenlabs"
    name = "ElevenLabs Music (online service)"
    short = "ElevenLabs"
    terms_url = "https://elevenlabs.io/terms-of-use"
    pricing_url = "https://elevenlabs.io/pricing/api"

    # -- description

    def describe(self) -> dict[str, Any]:
        common = _common_fields(lyrics_max=3500)
        caption, instrumental, lyrics, bpm, keyscale = common
        # A new song needs a description or a plan (checked in payload); edits need a description.
        caption = {**caption, "required_tasks": ["repaint", "extend"]}
        caption.pop("required", None)
        plan_models = [m for m in ELEVENLABS_MODELS if m in PLAN_MODELS]
        return {
            "tasks": [
                {"id": "text2music", "label": "New song"},
                {"id": "repaint", "label": "Regenerate a section", "source": True},
                {"id": "extend", "label": "Extend", "source": True},
            ],
            "groups": ["Song", "Song plan", "Edit", "Lyrics", "Music", "Advanced"],
            "fields": [
                caption,
                {**instrumental, "tasks": ["text2music"]},
                field(
                    "duration",
                    "float",
                    "Song",
                    "Length",
                    min=10,
                    max=600,
                    step=5,
                    unit="s",
                    default=120,
                    tasks=["text2music"],
                    help="Ignored when you use a song plan: the plan's sections set the length.",
                ),
                field(
                    "plan",
                    "plan",
                    "Song plan",
                    "Song plan",
                    tasks=["text2music"],
                    max_sections=MAX_CHUNKS,
                    max_total_seconds=600,
                    help="Optional. Write the song section by section, each with its own lyrics, "
                    "length and styles. Drafting a plan from your description is free.",
                ),
                {**lyrics, "tasks": ["text2music", "repaint", "extend"]},
                bpm,
                keyscale,
                field(
                    "region_start",
                    "float",
                    "Edit",
                    "Section start",
                    min=0,
                    max=600,
                    step=0.01,
                    unit="s",
                    editor=True,
                    tasks=["repaint"],
                    required_tasks=["repaint"],
                ),
                field(
                    "region_end",
                    "float",
                    "Edit",
                    "Section end",
                    min=0,
                    max=600,
                    step=0.01,
                    unit="s",
                    editor=True,
                    tasks=["repaint"],
                    required_tasks=["repaint"],
                ),
                field(
                    "extend_seconds",
                    "float",
                    "Edit",
                    "Add",
                    min=5,
                    max=120,
                    step=5,
                    unit="s",
                    default=20,
                    tasks=["extend"],
                ),
                field(
                    "extend_at",
                    "enum",
                    "Edit",
                    "Where",
                    default="end",
                    tasks=["extend"],
                    options=[
                        {"value": "end", "label": "After the end"},
                        {"value": "start", "label": "Before the start"},
                    ],
                ),
                field(
                    "follow_original",
                    "bool",
                    "Edit",
                    "Stay close to the original",
                    default=False,
                    tasks=["repaint"],
                    help="Conditions the new section on the old one (its first 30 seconds).",
                ),
                field(
                    "allow_upload",
                    "bool",
                    "Edit",
                    "Allow uploading this clip to ElevenLabs",
                    default=False,
                    tasks=["repaint", "extend"],
                    help="Needed for clips not made with ElevenLabs. ElevenLabs bills an upload "
                    "like generating the same length.",
                ),
                field(
                    "model_id",
                    "enum",
                    "Advanced",
                    "Model",
                    default=ELEVENLABS_MODELS[0],
                    advanced=True,
                    tasks=["text2music"],
                    help="Song plans need Music 2 or 2.5.",
                    options=[{"value": m, "label": _model_label(m)} for m in ELEVENLABS_MODELS],
                ),
                field(
                    "output_format",
                    "enum",
                    "Advanced",
                    "Download quality",
                    default=ELEVENLABS_FORMATS[0],
                    advanced=True,
                    tasks=["text2music"],
                    options=[
                        {"value": "mp3_44100_192", "label": "MP3 192 kbps"},
                        {"value": "mp3_44100_128", "label": "MP3 128 kbps"},
                    ],
                ),
                field(
                    "use_plan",
                    "bool",
                    "Advanced",
                    "Draft a plan automatically first",
                    default=False,
                    advanced=True,
                    tasks=["text2music"],
                    help="ElevenLabs drafts a section plan from your description (free), then "
                    "composes from it. Not needed when you write your own plan.",
                ),
                field(
                    "keep_for_editing",
                    "bool",
                    "Advanced",
                    "Keep the song for editing",
                    default=True,
                    advanced=True,
                    tasks=["text2music"],
                    help="ElevenLabs stores the song so its sections can be regenerated later "
                    "without uploading it again.",
                ),
                field(
                    "seed",
                    "seed",
                    "Advanced",
                    "Seed",
                    default=-1,
                    advanced=True,
                    tasks=["text2music"],
                    help="Used with a song plan. -1 is random.",
                ),
            ],
            "plan_models": plan_models,
        }

    def status(self) -> dict[str, Any]:
        return {**super().status(), "pricing": self.pricing()}

    @staticmethod
    def pricing() -> dict[str, Any]:
        return {
            "usd_per_minute": ELEVENLABS_USD_PER_MINUTE,
            "as_of": PRICES_AS_OF,
            "url": "https://elevenlabs.io/pricing/api",
            "note": "Billed by length. Uploading a clip to edit it costs the same as generating it.",
        }

    # -- plans

    def draft_plan(self, values: dict[str, Any]) -> list[dict[str, Any]]:
        """Ask ElevenLabs to draft a section plan from the description (free of charge)."""
        model = values.get("model_id", ELEVENLABS_MODELS[0])
        if model not in PLAN_MODELS:
            model = PLAN_MODELS[0]
        body = {
            "prompt": prompt_with_lyrics(values, ELEVENLABS_PROMPT_LIMIT),
            "music_length_ms": int(float(values.get("duration", 120)) * 1000),
            "model_id": model,
        }
        planned = self._post_json(ELEVENLABS_PLAN_URL, body, timeout=120.0)
        sections = plan_from_api(planned)
        if not sections:
            raise EditorError("ElevenLabs returned a plan this app cannot read.", 502)
        return sections

    def _post_json(self, url: str, body: dict[str, Any], *, timeout: float) -> Any:
        headers = {"xi-api-key": self._key(), "Accept": "application/json"}
        try:
            response = requests.post(
                url, json=body, headers=headers, timeout=timeout, allow_redirects=False
            )
        except requests.RequestException as exc:
            raise EditorError(
                "ElevenLabs could not be reached. Check the connection.", 502
            ) from exc
        if response.status_code != 200:
            raise refuse("ElevenLabs", response)
        try:
            return response.json()
        except ValueError as exc:
            raise EditorError("ElevenLabs returned an unreadable answer.", 502) from exc

    # -- new songs

    def payload(self, values: dict[str, Any]) -> dict[str, Any]:
        model = values.get("model_id", ELEVENLABS_MODELS[0])
        if values.get("plan"):
            if model not in PLAN_MODELS:
                raise ParamError("Song plans need the Music 2 or Music 2.5 model.")
            body: dict[str, Any] = {
                "composition_plan": plan_to_api(values["plan"]),
                "model_id": model,
            }
            seed = values.get("seed", -1)
            if isinstance(seed, int) and seed >= 0:
                body["seed"] = seed
        else:
            if len(str(values.get("caption", "")).strip()) < 3:
                raise ParamError("Describe the song, or write a song plan.")
            body = {
                "prompt": prompt_with_lyrics(values, ELEVENLABS_PROMPT_LIMIT),
                "music_length_ms": int(float(values.get("duration", 120)) * 1000),
                "model_id": model,
                "force_instrumental": bool(values.get("instrumental")),
            }
        if values.get("keep_for_editing", True):
            body["store_for_inpainting"] = True
        return body

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        if task in ("repaint", "extend"):
            return self._edit(task, values, ctx)
        body = self.payload(values)
        if values.get("use_plan") and "prompt" in body:
            ctx.progress(12.0, "Asking ElevenLabs for a song plan.")
            draft = self.draft_plan(values)
            model = body["model_id"] if body["model_id"] in PLAN_MODELS else PLAN_MODELS[0]
            body = {
                "composition_plan": plan_to_api(draft),
                "model_id": model,
                **({"store_for_inpainting": True} if body.get("store_for_inpainting") else {}),
            }
            seed = values.get("seed", -1)
            if isinstance(seed, int) and seed >= 0:
                body["seed"] = seed
        if ctx.cancelled():
            raise EditorError("Generation was cancelled.", 409)
        ctx.progress(20.0, "ElevenLabs is composing. This cannot be cancelled once sent.")
        data, content_type, song_id = self._compose(
            body, values.get("output_format", ELEVENLABS_FORMATS[0])
        )
        ctx.progress(86.0, "Receiving the song.")
        meta = {
            "model": body["model_id"],
            "song_id": song_id,
            "caption": values.get("caption"),
            "lyrics": values.get("lyrics", ""),
            "bpm": values.get("bpm"),
            "keyscale": values.get("keyscale"),
            "sections": len(values["plan"]) if values.get("plan") else None,
        }
        return [Output(data=data, suffix=suffix_for("", content_type, ".mp3"), meta=meta)]

    def _compose(self, body: dict[str, Any], output_format: str) -> tuple[bytes, str, str | None]:
        headers = {"xi-api-key": self._key(), "Accept": "audio/mpeg"}
        try:
            response = requests.post(
                ELEVENLABS_URL,
                params={"output_format": output_format},
                json=body,
                headers=headers,
                timeout=float(projects.SETTINGS.ffmpeg_timeout_seconds or 900),
                stream=True,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise EditorError(
                "ElevenLabs could not be reached. Check the connection.", 502
            ) from exc
        if response.status_code != 200:
            raise refuse("ElevenLabs", response)
        song_id = response.headers.get("song-id")
        return _read_capped(response), response.headers.get("content-type", ""), song_id

    # -- editing existing audio (inpainting)

    def _song_id(self, values: dict[str, Any], ctx: RunContext, seconds: float) -> tuple[str, bool]:
        """The stored song for the clip, uploading it first when the user allowed that."""
        known = remote_songs.get(ctx.project_id, ctx.parent_id, self.id)
        if known:
            return known, False
        if not values.get("allow_upload"):
            raise EditorError(
                "This clip was not made with ElevenLabs, so it has to be uploaded there first "
                "(billed like generating the same length). Tick “Allow uploading this clip” to go on.",
                422,
            )
        assert ctx.source is not None
        ctx.progress(12.0, "Uploading the clip to ElevenLabs.")
        with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
            mp3 = Path(tmp) / "clip.mp3"
            encoded = subprocess.run(  # noqa: S603 - fixed argv
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    "-i",
                    str(ctx.source),
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "256k",
                    str(mp3),
                ],
                capture_output=True,
                timeout=float(projects.SETTINGS.ffmpeg_timeout_seconds or 900),
                check=False,
            )
            if encoded.returncode != 0 or not mp3.is_file():
                raise EditorError("The clip could not be prepared for upload.", 500)
            headers = {"xi-api-key": self._key(), "Accept": "application/json"}
            try:
                with mp3.open("rb") as handle:
                    response = requests.post(
                        ELEVENLABS_UPLOAD_URL,
                        files={"file": ("clip.mp3", handle, "audio/mpeg")},
                        headers=headers,
                        timeout=600.0,
                        allow_redirects=False,
                    )
            except requests.RequestException as exc:
                raise EditorError("The clip could not be uploaded to ElevenLabs.", 502) from exc
        if response.status_code != 200:
            raise refuse("ElevenLabs", response)
        try:
            song_id = response.json().get("song_id")
        except (ValueError, AttributeError):
            song_id = None
        if not isinstance(song_id, str) or not song_id:
            raise EditorError("ElevenLabs accepted the upload but returned no song id.", 502)
        if ctx.parent_id:
            remote_songs.put(ctx.project_id, ctx.parent_id, self.id, song_id)
        return song_id, True

    def _edit(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        if ctx.source is None or not ctx.source.is_file():
            raise EditorError("Select a clip first: this edits existing audio.", 422)
        source, rate = sf.read(str(ctx.source), dtype="float32", always_2d=True)
        seconds = len(source) / float(rate)
        song_id, uploaded = self._song_id(values, ctx, seconds)
        chunks, region = inpaint_plan(task, values, seconds, song_id)
        body = {
            "composition_plan": {"chunks": chunks},
            "model_id": PLAN_MODELS[0],
            "store_for_inpainting": True,
        }
        if ctx.cancelled():
            raise EditorError("Generation was cancelled.", 409)
        ctx.progress(30.0, "ElevenLabs is composing. This cannot be cancelled once sent.")
        data, _content_type, new_song_id = self._compose(body, EDIT_OUTPUT_FORMAT)
        ctx.progress(86.0, "Receiving the song.")
        audio, out_rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        if int(out_rate) != int(rate):
            audio = resample_poly(audio, int(rate), int(out_rate), axis=0).astype(np.float32)
            out_rate = rate
        audio, level = match_level(
            task,
            {"repainting_start": region[0], "repainting_end": region[1]},
            source,
            int(rate),
            audio,
            int(out_rate),
        )
        buffer = io.BytesIO()
        sf.write(buffer, audio, int(out_rate), format="WAV", subtype="FLOAT")
        meta: dict[str, Any] = {
            "task": task,
            "caption": values.get("caption"),
            "song_id": new_song_id,
            "uploaded": uploaded,
            "source_seconds": round(seconds, 3),
            "result_seconds": round(len(audio) / float(out_rate), 3),
            "region": list(region),
            **level,
        }
        if task == "extend":
            meta["extend_at"] = values.get("extend_at", "end")
            meta["extended_seconds"] = float(values.get("extend_seconds", 20))
        return [Output(data=buffer.getvalue(), suffix=".wav", meta=meta, normalize=False)]

    # -- cost

    def estimate(
        self, task: str, values: dict[str, Any], source_seconds: float | None, stored: bool
    ) -> dict[str, Any]:
        if task == "text2music":
            if values.get("plan"):
                seconds = sum(float(section["seconds"]) for section in values["plan"])
            else:
                seconds = float(values.get("duration", 120))
            lines = [f"{seconds / 60:.1f} min of music"]
        else:
            source_seconds = float(source_seconds or 0.0)
            added = float(values.get("extend_seconds", 20)) if task == "extend" else 0.0
            seconds = source_seconds + added
            lines = [
                f"{seconds / 60:.1f} min song with the new part (the whole result may be billed)"
            ]
            if not stored:
                seconds += source_seconds
                lines.append(f"plus uploading this clip ({source_seconds / 60:.1f} min)")
        usd = seconds / 60.0 * ELEVENLABS_USD_PER_MINUTE
        return {
            "usd": round(usd, 2),
            "summary": f"About ${usd:.2f} on your ElevenLabs account ({', '.join(lines)}).",
            "as_of": PRICES_AS_OF,
            "url": self.pricing_url,
        }


def _model_label(model: str) -> str:
    return model.replace("music_", "Music ").replace("_", ".")


def plan_to_api(sections: list[dict[str, Any]]) -> dict[str, Any]:
    """Our sections as an ElevenLabs CompositionPlan (Music 2 and 2.5)."""
    chunks = []
    for section in sections:
        text = f"[{section['name']}]"
        if section.get("lyrics"):
            text += "\n" + section["lyrics"]
        chunk: dict[str, Any] = {
            "text": text,
            "duration_ms": int(round(float(section["seconds"]) * 1000)),
            "positive_styles": list(section.get("styles") or []),
            "negative_styles": list(section.get("avoid") or []),
            "context_adherence": section.get("adherence") or "high",
        }
        chunks.append(chunk)
    return {"chunks": chunks}


def plan_from_api(plan: Any) -> list[dict[str, Any]]:
    """An ElevenLabs plan (either format) as our editable sections."""
    if not isinstance(plan, dict):
        return []
    sections: list[dict[str, Any]] = []
    if isinstance(plan.get("chunks"), list):
        for chunk in plan["chunks"]:
            if not isinstance(chunk, dict) or "text" not in chunk:
                continue
            text = str(chunk.get("text") or "").strip()
            name, lyrics = "Section", text
            if text.startswith("["):
                head, _, rest = text.partition("]")
                name, lyrics = head[1:].strip() or "Section", rest.strip()
            sections.append(
                _section(
                    name,
                    lyrics,
                    chunk.get("duration_ms"),
                    chunk.get("positive_styles"),
                    chunk.get("negative_styles"),
                    chunk.get("context_adherence"),
                )
            )
    elif isinstance(plan.get("sections"), list):
        global_styles = [s for s in plan.get("positive_global_styles") or [] if isinstance(s, str)]
        for index, section in enumerate(plan["sections"]):
            if not isinstance(section, dict):
                continue
            styles = [s for s in section.get("positive_local_styles") or [] if isinstance(s, str)]
            sections.append(
                _section(
                    section.get("section_name") or "Section",
                    "\n".join(str(line) for line in section.get("lines") or []),
                    section.get("duration_ms"),
                    (global_styles + styles) if index == 0 else styles,
                    section.get("negative_local_styles"),
                    "high",
                )
            )
    return sections[:MAX_CHUNKS]


def _section(
    name: Any, lyrics: Any, duration_ms: Any, styles: Any, avoid: Any, adherence: Any
) -> dict[str, Any]:
    seconds = float(duration_ms) / 1000.0 if isinstance(duration_ms, (int, float)) else 15.0
    return {
        "name": str(name)[:100] or "Section",
        "lyrics": str(lyrics or "")[:6000],
        "seconds": round(min(120.0, max(3.0, seconds)), 2),
        "styles": [str(s)[:100] for s in (styles or []) if isinstance(s, str)][:50],
        "avoid": [str(s)[:100] for s in (avoid or []) if isinstance(s, str)][:50],
        "adherence": adherence if adherence in ("low", "medium", "high") else "high",
    }


def _split(start: float, end: float) -> list[tuple[float, float]]:
    """Cut a kept stretch into pieces of 3 to 120 seconds."""
    length = end - start
    if length <= 0:
        return []
    count = max(1, math.ceil(length / MAX_CHUNK_SECONDS))
    step = length / count
    return [(start + i * step, start + (i + 1) * step) for i in range(count)]


def _styles_from(values: dict[str, Any]) -> list[str]:
    styles = [
        part.strip()[:100] for part in str(values.get("caption", "")).split(",") if part.strip()
    ]
    if values.get("bpm"):
        styles.append(f"{values['bpm']} BPM")
    if values.get("keyscale"):
        styles.append(str(values["keyscale"]))
    return styles[:50] or ["music"]


def inpaint_plan(
    task: str, values: dict[str, Any], seconds: float, song_id: str
) -> tuple[list[dict[str, Any]], tuple[float, float]]:
    """Chunks that keep the stored song and generate the edited part.

    Returns the chunks and the generated region in the result's own timeline, in the
    same convention as the local engine (a negative start means "before the original").
    """
    if seconds < MIN_CHUNK_SECONDS:
        raise ParamError("The clip is too short to edit with ElevenLabs (at least 3 seconds).")
    lyrics = str(values.get("lyrics", "")).strip()
    text_head = "[Instrumental]" if not lyrics else ("" if lyrics.startswith("[") else "[Verse]\n")
    gen_text = (text_head + lyrics) if lyrics else text_head

    def ref(a: float, b: float) -> dict[str, Any]:
        return {
            "song_id": song_id,
            "range": {"start_ms": int(round(a * 1000)), "end_ms": int(round(b * 1000))},
        }

    def gen(duration: float) -> dict[str, Any]:
        return {
            "text": gen_text,
            "duration_ms": int(round(duration * 1000)),
            "positive_styles": _styles_from(values),
            "negative_styles": [],
            "context_adherence": "high",
        }

    if task == "repaint":
        start = float(values["region_start"])
        end = min(float(values["region_end"]), seconds)
        # A kept piece shorter than a chunk's minimum is regenerated with the section instead.
        if start < MIN_CHUNK_SECONDS:
            start = 0.0
        if seconds - end < MIN_CHUNK_SECONDS:
            end = seconds
        if not MIN_CHUNK_SECONDS <= end - start <= MAX_CHUNK_SECONDS:
            raise ParamError("With ElevenLabs, regenerate a section of 3 to 120 seconds.")
        chunk = gen(end - start)
        if values.get("follow_original"):
            # The new section stays close to the old one (ElevenLabs takes up to 30 s of it).
            chunk["conditioning_ref"] = ref(start, min(end, start + MAX_CONDITIONING_SECONDS))
            chunk["condition_strength"] = "high"
        chunks = [
            *(ref(a, b) for a, b in _split(0.0, start)),
            chunk,
            *(ref(a, b) for a, b in _split(end, seconds)),
        ]
        region = (start, end)
    else:
        added = float(values.get("extend_seconds", 20))
        if seconds + added > 600:
            raise ParamError("The clip and the extension together must stay under 600 seconds.")
        kept = [ref(a, b) for a, b in _split(0.0, seconds)]
        if values.get("extend_at", "end") == "start":
            chunks, region = [gen(added), *kept], (-added, 0.0)
        else:
            chunks, region = [*kept, gen(added)], (seconds, seconds + added)
    if len(chunks) > MAX_CHUNKS:
        raise ParamError("This edit needs more sections than ElevenLabs allows.")
    return chunks, region


# --------------------------------------------------------------------------- fal.ai


class FalProvider(_CloudProvider):
    id = "fal"
    name = "fal.ai — MiniMax Music, Lyria (online service)"
    short = "fal.ai"
    terms_url = "https://fal.ai/terms"

    def describe(self) -> dict[str, Any]:
        common = _common_fields(lyrics_max=3500)
        return {
            "tasks": [{"id": "text2music", "label": "New song"}],
            "groups": ["Song", "Lyrics", "Music"],
            "fields": [
                field(
                    "model",
                    "enum",
                    "Song",
                    "Model",
                    default=FAL_DEFAULT_MODEL,
                    options=[
                        {"value": m, "label": meta["label"]} for m, meta in FAL_MODELS.items()
                    ],
                    help="Each model chooses the song length itself.",
                ),
                *common,
                field(
                    "vocal_language",
                    "enum",
                    "Lyrics",
                    "Language",
                    auto=True,
                    options=[{"value": code, "label": label} for code, label in LANGUAGES],
                ),
            ],
        }

    def payload(self, values: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        model = values.get("model", FAL_DEFAULT_MODEL)
        if FAL_MODELS[model]["lyrics_field"]:
            prompt = describe(values)[:2000]
            if len(prompt) < 10:
                prompt = f"{prompt}, original song".strip(", ")
            return model, {
                "prompt": prompt,
                "is_instrumental": not sings(values),
                "lyrics": str(values["lyrics"]).strip()[:3500] if sings(values) else "",
                "audio_setting": {"sample_rate": 44100, "format": "wav"},
            }
        return model, {"prompt": prompt_with_lyrics(values, 4000)}

    def status(self) -> dict[str, Any]:
        return {
            **super().status(),
            "pricing": {
                "usd_per_song": FAL_USD_PER_SONG,
                "as_of": PRICES_AS_OF,
                "url": "https://fal.ai/pricing",
            },
        }

    def estimate(
        self, task: str, values: dict[str, Any], source_seconds: float | None, stored: bool
    ) -> dict[str, Any]:
        model = values.get("model", FAL_DEFAULT_MODEL)
        usd = FAL_USD_PER_SONG.get(model, 0.0)
        label = FAL_MODELS.get(model, {}).get("label", model)
        return {
            "usd": usd,
            "summary": f"About ${usd:.2f} on your fal.ai account (one {label} song).",
            "as_of": PRICES_AS_OF,
            "url": f"https://fal.ai/models/{model}",
        }

    @staticmethod
    def _queue_url(url: Any) -> str:
        if not isinstance(url, str) or not host_allowed(url, (FAL_QUEUE_HOST,)):
            raise EditorError("fal.ai answered with an unexpected address.", 502)
        return url

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        headers = {"Authorization": f"Key {self._key()}", "Accept": "application/json"}
        model, payload = self.payload(values)
        label = FAL_MODELS[model]["label"]
        ctx.progress(12.0, f"Queueing {label} on fal.ai.")
        try:
            submitted = requests.post(
                f"https://{FAL_QUEUE_HOST}/{model}",
                json=payload,
                headers=headers,
                timeout=30.0,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            raise EditorError(
                "fal.ai could not be reached. Check the internet connection.", 502
            ) from exc
        if submitted.status_code not in (200, 201, 202):
            raise refuse("fal.ai", submitted)
        try:
            ticket = submitted.json() if submitted.content else {}
        except ValueError:
            ticket = {}
        if not isinstance(ticket, dict):
            ticket = {}
        status_url = self._queue_url(ticket.get("status_url"))
        response_url = self._queue_url(ticket.get("response_url"))
        cancel_url = ticket.get("cancel_url")

        limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900)
        started = time.monotonic()
        while True:
            elapsed = time.monotonic() - started
            if ctx.cancelled():
                if isinstance(cancel_url, str) and host_allowed(cancel_url, (FAL_QUEUE_HOST,)):
                    try:
                        requests.put(
                            cancel_url, headers=headers, timeout=10.0, allow_redirects=False
                        )
                    except requests.RequestException:
                        pass
                raise EditorError("Generation was cancelled.", 409)
            if elapsed > limit:
                raise EditorError("Song generation took too long and was abandoned.", 504)
            try:
                polled = requests.get(
                    status_url, headers=headers, timeout=15.0, allow_redirects=False
                )
                state = polled.json() if polled.status_code in (200, 202) else {}
            except (requests.RequestException, ValueError):
                state = {}
            phase = state.get("status") if isinstance(state, dict) else None
            if phase == "COMPLETED":
                break
            detail = "Waiting in fal.ai's queue." if phase == "IN_QUEUE" else f"{label} is writing."
            ctx.progress(14.0 + 68.0 * (1.0 - 1.0 / (1.0 + elapsed / 30.0)), detail)
            time.sleep(2.0)

        try:
            result = requests.get(
                response_url, headers=headers, timeout=30.0, allow_redirects=False
            )
        except requests.RequestException as exc:
            raise EditorError("The fal.ai result could not be fetched.", 502) from exc
        if result.status_code != 200:
            raise refuse("fal.ai", result)
        try:
            body = result.json() if result.content else {}
        except ValueError:
            body = {}
        if not isinstance(body, dict):
            body = {}
        if body.get("error"):
            raise EditorError(
                f"fal.ai could not generate the song: {str(body['error'])[:200]}", 502
            )
        audio = body.get("audio")
        if isinstance(audio, list):
            audio = audio[0] if audio else None
        if not isinstance(audio, dict) or not isinstance(audio.get("url"), str):
            raise EditorError("fal.ai finished but returned no audio.", 502)
        ctx.progress(86.0, "Downloading the song.")
        content, content_type, final = download(str(audio["url"]), FAL_MEDIA_HOSTS)
        written = body.get("lyrics")
        meta = {
            "model": label,
            "caption": values.get("caption"),
            "lyrics": written[:4000] if isinstance(written, str) else values.get("lyrics", ""),
            "bpm": values.get("bpm"),
            "keyscale": values.get("keyscale"),
        }
        name = str(audio.get("file_name") or final)
        suffix = suffix_for(name, str(audio.get("content_type") or content_type))
        return [Output(data=content, suffix=suffix, meta=meta)]
