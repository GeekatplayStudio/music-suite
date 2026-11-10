"""Cloud song engines: ElevenLabs Music and fal.ai. Opt-in, text only.

What is sent: the style prompt and the lyrics, to the one service the user chose.
What is never sent: audio, file paths, project data.

Every request goes to a fixed HTTPS host, redirects are not followed blindly, and
downloaded audio must come from the provider's own media host and stay under the
suite's upload size limit.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.editor.songs import keys
from audioqi.editor.songs.common import (
    ProducedAudio,
    SongRequest,
    check_size,
    describe,
    prompt_with_lyrics,
    suffix_for,
)

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/music"
ELEVENLABS_MODELS = ("music_v2_5", "music_v2")
ELEVENLABS_PROMPT_LIMIT = 4100

FAL_QUEUE_HOST = "queue.fal.run"
FAL_MEDIA_HOSTS = ("fal.media", ".fal.media")
FAL_MODELS: dict[str, dict[str, Any]] = {
    "fal-ai/minimax-music/v2.6": {"label": "MiniMax Music 2.6", "lyrics_field": True},
    "fal-ai/lyria3/pro": {"label": "Google Lyria 3 Pro", "lyrics_field": False},
}
FAL_DEFAULT_MODEL = "fal-ai/minimax-music/v2.6"
MAX_REDIRECTS = 3
CLOUD_NOTE = "Sends your style text and lyrics to {name}. No audio leaves this machine."


# --------------------------------------------------------------------------- status


def _status(engine: str, label: str, models: list[str], default: str, extra: dict[str, Any]):
    configured = keys.get(engine) is not None
    return {
        "id": engine,
        "label": label,
        "local": False,
        "available": configured,
        "models": models,
        "default_model": default,
        "commercial": True,
        "hint": (
            CLOUD_NOTE.format(name=label)
            if configured
            else f"Add your {label} API key to use it. Billed by {label}."
        ),
        **extra,
    }


def elevenlabs_status() -> dict[str, Any]:
    return _status(
        "elevenlabs",
        "ElevenLabs Music",
        list(ELEVENLABS_MODELS),
        ELEVENLABS_MODELS[0],
        {
            "license": "Commercial use per your ElevenLabs plan",
            "supports": {"lyrics": True, "duration": True, "bpm": True, "key": True, "seed": False},
            "max_seconds": 600,
        },
    )


def fal_status() -> dict[str, Any]:
    status = _status(
        "fal",
        "fal.ai",
        list(FAL_MODELS),
        FAL_DEFAULT_MODEL,
        {
            "license": "Commercial use per each model's terms on fal.ai",
            "supports": {
                "lyrics": True,
                "duration": False,
                "bpm": True,
                "key": True,
                "seed": False,
            },
            "max_seconds": 300,
        },
    )
    status["model_labels"] = {model: meta["label"] for model, meta in FAL_MODELS.items()}
    return status


# --------------------------------------------------------------------------- transport


def _host_allowed(url: str, hosts: tuple[str, ...]) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return False
    if parsed.port not in (None, 443):
        return False
    return any(host == h or (h.startswith(".") and host.endswith(h)) for h in hosts)


def _download(url: str, hosts: tuple[str, ...], headers: dict[str, str] | None = None):
    """GET audio from an allowlisted host, following redirects only within the allowlist."""
    limit = projects.SETTINGS.max_upload_bytes
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        if not _host_allowed(current, hosts):
            raise EditorError("The provider returned audio from an unexpected address.")
        try:
            response = requests.get(
                current, headers=headers, timeout=120.0, stream=True, allow_redirects=False
            )
        except requests.RequestException as exc:
            raise EditorError("The generated song could not be downloaded.") from exc
        if response.status_code in (301, 302, 303, 307, 308):
            current = urljoin(current, response.headers.get("location", ""))
            response.close()
            continue
        if response.status_code != 200:
            raise EditorError("The generated song could not be downloaded.")
        body = bytearray()
        for chunk in response.iter_content(1024 * 1024):
            body.extend(chunk)
            if len(body) > limit:
                response.close()
                raise EditorError("The generated song is larger than the upload limit.")
        return bytes(body), response.headers.get("content-type", ""), current
    raise EditorError("The provider redirected too many times.")


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


def _refuse(provider: str, response: requests.Response) -> EditorError:
    if response.status_code in (401, 403):
        return EditorError(f"{provider} rejected the API key. Check it in Song settings.")
    if response.status_code == 402:
        return EditorError(f"{provider} says the account has no credit left for this.")
    if response.status_code == 429:
        return EditorError(f"{provider} is rate limiting requests. Try again shortly.")
    detail = _error_detail(response)
    suffix = f": {detail}" if detail else "."
    return EditorError(f"{provider} refused the request ({response.status_code}){suffix}")


# --------------------------------------------------------------------------- ElevenLabs


def elevenlabs_payload(request: SongRequest) -> dict[str, Any]:
    model = request.model if request.model in ELEVENLABS_MODELS else ELEVENLABS_MODELS[0]
    return {
        "prompt": prompt_with_lyrics(request, ELEVENLABS_PROMPT_LIMIT),
        "music_length_ms": int(request.seconds * 1000),
        "model_id": model,
        "force_instrumental": bool(request.instrumental),
    }


def elevenlabs_generate(request: SongRequest, progress: Callable[[float, str], None]):
    key = keys.get("elevenlabs")
    if key is None:
        raise EditorError("Add an ElevenLabs API key in Song settings first.")
    payload = elevenlabs_payload(request)
    progress(10.0, "Sending the request to ElevenLabs Music.")
    try:
        response = requests.post(
            ELEVENLABS_URL,
            json=payload,
            headers={"xi-api-key": key, "Accept": "audio/mpeg"},
            timeout=float(projects.SETTINGS.ffmpeg_timeout_seconds or 900),
            stream=True,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise EditorError("ElevenLabs could not be reached. Check the connection.") from exc
    if response.status_code != 200:
        raise _refuse("ElevenLabs", response)
    progress(80.0, "Receiving the song.")
    body = bytearray()
    for chunk in response.iter_content(1024 * 1024):
        body.extend(chunk)
        if len(body) > projects.SETTINGS.max_upload_bytes:
            response.close()
            raise EditorError("The generated song is larger than the upload limit.")
    return ProducedAudio(
        content=check_size(bytes(body)),
        suffix=suffix_for("", response.headers.get("content-type", ""), ".mp3"),
        engine="elevenlabs",
        model=payload["model_id"],
        info={"song_id": response.headers.get("song-id")},
    )


# --------------------------------------------------------------------------- fal.ai


def fal_payload(request: SongRequest) -> tuple[str, dict[str, Any]]:
    model = request.model if request.model in FAL_MODELS else FAL_DEFAULT_MODEL
    if FAL_MODELS[model]["lyrics_field"]:
        prompt = describe(request)[:2000]
        if len(prompt) < 10:
            prompt = f"{prompt}, original song".strip(", ")
        payload: dict[str, Any] = {
            "prompt": prompt,
            "is_instrumental": not request.sings,
            "audio_setting": {"sample_rate": 44100, "format": "wav"},
        }
        if request.sings:
            payload["lyrics"] = request.lyrics.strip()[:3500]
        else:
            payload["lyrics"] = ""
    else:
        payload = {"prompt": prompt_with_lyrics(request, 4000)}
    return model, payload


def _text(value: Any, limit: int) -> str | None:
    return value[:limit] if isinstance(value, str) else None


def _fal_url(url: Any) -> str:
    if not isinstance(url, str) or not _host_allowed(url, (FAL_QUEUE_HOST,)):
        raise EditorError("fal.ai answered with an unexpected address.")
    return url


def fal_generate(request: SongRequest, progress: Callable[[float, str], None]):
    key = keys.get("fal")
    if key is None:
        raise EditorError("Add a fal.ai API key in Song settings first.")
    headers = {"Authorization": f"Key {key}", "Accept": "application/json"}
    model, payload = fal_payload(request)
    label = FAL_MODELS[model]["label"]
    progress(8.0, f"Queueing {label} on fal.ai.")
    try:
        submitted = requests.post(
            f"https://{FAL_QUEUE_HOST}/{model}",
            json=payload,
            headers=headers,
            timeout=30.0,
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise EditorError("fal.ai could not be reached. Check the internet connection.") from exc
    if submitted.status_code not in (200, 201, 202):
        raise _refuse("fal.ai", submitted)
    try:
        ticket = submitted.json() if submitted.content else {}
    except ValueError:
        ticket = {}
    if not isinstance(ticket, dict):
        ticket = {}
    status_url = _fal_url(ticket.get("status_url"))
    response_url = _fal_url(ticket.get("response_url"))

    limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900)
    started = time.monotonic()
    while True:
        elapsed = time.monotonic() - started
        if elapsed > limit:
            raise EditorError("Song generation took too long and was abandoned.")
        try:
            polled = requests.get(status_url, headers=headers, timeout=15.0, allow_redirects=False)
            state = polled.json() if polled.status_code in (200, 202) else {}
        except (requests.RequestException, ValueError):
            state = {}
        phase = state.get("status")
        if phase == "COMPLETED":
            break
        detail = "Waiting in fal.ai's queue." if phase == "IN_QUEUE" else f"{label} is writing."
        progress(12.0 + 70.0 * (1.0 - 1.0 / (1.0 + elapsed / 30.0)), detail)
        time.sleep(2.0)

    try:
        result = requests.get(response_url, headers=headers, timeout=30.0, allow_redirects=False)
    except requests.RequestException as exc:
        raise EditorError("The fal.ai result could not be fetched.") from exc
    if result.status_code != 200:
        raise _refuse("fal.ai", result)
    try:
        body = result.json() if result.content else {}
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    if body.get("error"):
        raise EditorError(f"fal.ai could not generate the song: {str(body['error'])[:200]}")
    audio = body.get("audio")
    if isinstance(audio, list):
        audio = audio[0] if audio else None
    if not isinstance(audio, dict) or not isinstance(audio.get("url"), str):
        raise EditorError("fal.ai finished but returned no audio.")
    progress(86.0, "Downloading the song.")
    content, content_type, final = _download(str(audio["url"]), FAL_MEDIA_HOSTS)
    name = str(audio.get("file_name") or final)
    return ProducedAudio(
        content=check_size(content),
        suffix=suffix_for(name, str(audio.get("content_type") or content_type)),
        engine="fal",
        model=model,
        info={"label": label, "lyrics": _text(body.get("lyrics"), 4000)},
    )
