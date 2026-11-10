"""Online generation services: ElevenLabs Music and fal.ai. Off until the user adds a key.

What is sent: the style text and the lyrics, to the one service the user chose.
What is never sent: audio, file paths or project data.
Requests go to fixed HTTPS hosts, redirects are followed only within an allowlist,
and downloaded audio must stay under the suite's upload size limit.
"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.generation import secrets
from audioqi.generation.providers.acestep import KEYS, LANGUAGES, SECTIONS
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.schema import field

ELEVENLABS_HOST = "api.elevenlabs.io"
ELEVENLABS_URL = f"https://{ELEVENLABS_HOST}/v1/music"
ELEVENLABS_PLAN_URL = f"https://{ELEVENLABS_HOST}/v1/music/plan"
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
                "No audio leaves this computer."
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

    def describe(self) -> dict[str, Any]:
        common = _common_fields(lyrics_max=3500)
        return {
            "tasks": [{"id": "text2music", "label": "New song"}],
            "groups": ["Song", "Lyrics", "Music", "Advanced"],
            "fields": [
                *common[:2],
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
                ),
                *common[2:],
                field(
                    "model_id",
                    "enum",
                    "Advanced",
                    "Model",
                    default=ELEVENLABS_MODELS[0],
                    advanced=True,
                    options=[
                        {"value": m, "label": m.replace("music_", "Music ").replace("_", ".")}
                        for m in ELEVENLABS_MODELS
                    ],
                ),
                field(
                    "output_format",
                    "enum",
                    "Advanced",
                    "Download quality",
                    default=ELEVENLABS_FORMATS[0],
                    advanced=True,
                    options=[
                        {"value": "mp3_44100_192", "label": "MP3 192 kbps"},
                        {"value": "mp3_44100_128", "label": "MP3 128 kbps"},
                    ],
                ),
                field(
                    "use_plan",
                    "bool",
                    "Advanced",
                    "Plan the sections first",
                    default=False,
                    advanced=True,
                    help="Asks ElevenLabs for a section-by-section plan (free), then composes from it. "
                    "Needed for a fixed seed.",
                ),
                field(
                    "seed",
                    "seed",
                    "Advanced",
                    "Seed",
                    default=-1,
                    advanced=True,
                    help="Only used with “Plan the sections first”. -1 is random.",
                ),
            ],
        }

    def payload(self, values: dict[str, Any]) -> dict[str, Any]:
        model = values.get("model_id", ELEVENLABS_MODELS[0])
        return {
            "prompt": prompt_with_lyrics(values, ELEVENLABS_PROMPT_LIMIT),
            "music_length_ms": int(float(values.get("duration", 120)) * 1000),
            "model_id": model,
            "force_instrumental": bool(values.get("instrumental")),
        }

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        headers = {"xi-api-key": self._key(), "Accept": "audio/mpeg"}
        body = self.payload(values)
        if values.get("use_plan"):
            ctx.progress(12.0, "Asking ElevenLabs for a song plan.")
            try:
                planned = requests.post(
                    ELEVENLABS_PLAN_URL,
                    json={k: body[k] for k in ("prompt", "music_length_ms", "model_id")},
                    headers={**headers, "Accept": "application/json"},
                    timeout=120.0,
                    allow_redirects=False,
                )
            except requests.RequestException as exc:
                raise EditorError(
                    "ElevenLabs could not be reached. Check the connection.", 502
                ) from exc
            if planned.status_code != 200:
                raise refuse("ElevenLabs", planned)
            try:
                plan = planned.json()
            except ValueError as exc:
                raise EditorError("ElevenLabs returned an unreadable plan.", 502) from exc
            if not isinstance(plan, dict):
                raise EditorError("ElevenLabs returned an unreadable plan.", 502)
            body = {"composition_plan": plan, "model_id": body["model_id"]}
            seed = values.get("seed", -1)
            if isinstance(seed, int) and seed >= 0:
                body["seed"] = seed
        if ctx.cancelled():
            raise EditorError("Generation was cancelled.", 409)
        ctx.progress(20.0, "ElevenLabs is composing. This cannot be cancelled once sent.")
        try:
            response = requests.post(
                ELEVENLABS_URL,
                params={"output_format": values.get("output_format", ELEVENLABS_FORMATS[0])},
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
        ctx.progress(82.0, "Receiving the song.")
        meta = {
            "model": body["model_id"],
            "song_id": response.headers.get("song-id"),
            "caption": values.get("caption"),
            "lyrics": values.get("lyrics", ""),
            "bpm": values.get("bpm"),
            "keyscale": values.get("keyscale"),
        }
        suffix = suffix_for("", response.headers.get("content-type", ""), ".mp3")
        return [Output(data=_read_capped(response), suffix=suffix, meta=meta)]


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
