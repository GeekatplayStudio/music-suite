"""ACE-Step 1.5 through its own REST server (``uv run acestep-api``), on loopback only.

ACE-Step keeps its own Python environment and models; the suite only speaks to
its documented API: ``/health``, ``/v1/models``, ``/release_task``,
``/query_result`` and ``/v1/audio``.
"""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from typing import Any

import requests

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.editor.songs.common import (
    INSTRUMENTAL_TAG,
    ProducedAudio,
    SongRequest,
    check_size,
    describe,
    loopback_url,
    suffix_for,
)

ENGINE = "acestep"
DEFAULT_URL = "http://127.0.0.1:8001"
URL_ENV = "MUSIC_SUITE_ACESTEP_URL"
KEY_ENV = "MUSIC_SUITE_ACESTEP_API_KEY"
UNAVAILABLE = (
    "ACE-Step is not running. Start its API server on this machine "
    "(in the ACE-Step-1.5 folder: uv run acestep-api), then check again."
)


def base_url() -> str:
    return loopback_url(os.getenv(URL_ENV, DEFAULT_URL), "The ACE-Step address")


def _headers() -> dict[str, str]:
    key = os.getenv(KEY_ENV, "").strip()
    return {"Authorization": f"Bearer {key}"} if key else {}


def _get(path: str, timeout: float, **params: Any) -> requests.Response:
    return requests.get(
        f"{base_url()}{path}",
        params=params or None,
        headers=_headers(),
        timeout=timeout,
        allow_redirects=False,
    )


def _post(path: str, payload: dict[str, Any], timeout: float) -> requests.Response:
    return requests.post(
        f"{base_url()}{path}",
        json=payload,
        headers=_headers(),
        timeout=timeout,
        allow_redirects=False,
    )


def _data(response: requests.Response) -> Any:
    """Unwrap ACE-Step's ``{code, data, error}`` envelope."""
    if response.status_code == 401:
        raise EditorError(f"ACE-Step refused the request: set {KEY_ENV} to its API key.")
    if response.status_code == 429:
        raise EditorError("ACE-Step's queue is full. Try again in a moment.")
    try:
        body = response.json()
    except ValueError as exc:
        raise EditorError("ACE-Step returned an unreadable answer.") from exc
    if response.status_code != 200 or not isinstance(body, dict):
        detail = body.get("detail") if isinstance(body, dict) else None
        message = f"ACE-Step rejected the request ({response.status_code})"
        raise EditorError(f"{message}: {str(detail)[:200]}" if detail else f"{message}.")
    if body.get("error"):
        raise EditorError(f"ACE-Step reported an error: {str(body['error'])[:200]}")
    return body.get("data")


def status() -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": ENGINE,
        "label": "ACE-Step 1.5 (local)",
        "local": True,
        "available": False,
        "models": [],
        "default_model": None,
        "license": "MIT — songs may be used commercially",
        "commercial": True,
        "supports": {"lyrics": True, "duration": True, "bpm": True, "key": True, "seed": True},
        "max_seconds": 600,
        "hint": UNAVAILABLE,
    }
    try:
        if _get("/health", 2.0).status_code != 200:
            return result
        result["available"] = True
        result["hint"] = "Running on this machine."
        listed = _data(_get("/v1/models", 4.0))
    except (requests.RequestException, EditorError):
        return result
    if isinstance(listed, dict):
        names = [
            str(item.get("name"))
            for item in listed.get("models") or []
            if isinstance(item, dict) and item.get("name")
        ]
        result["models"] = names[:16]
        default = listed.get("default_model")
        result["default_model"] = str(default) if default else (names[0] if names else None)
    return result


def task_payload(request: SongRequest) -> dict[str, Any]:
    lyrics = request.lyrics.strip() if request.sings else INSTRUMENTAL_TAG
    payload: dict[str, Any] = {
        "prompt": describe(request),
        "lyrics": lyrics,
        "audio_duration": float(request.seconds),
        "vocal_language": request.language,
        "audio_format": "flac",
        "batch_size": 1,
        "thinking": request.think,
    }
    if request.bpm:
        payload["bpm"] = request.bpm
    if request.key:
        payload["key_scale"] = request.key
    if request.seed is not None:
        payload["use_random_seed"] = False
        payload["seed"] = request.seed
    if request.model:
        payload["model"] = request.model
    return payload


def _result_entry(item: dict[str, Any]) -> dict[str, Any] | None:
    raw = item.get("result")
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except ValueError:
            return None
    if isinstance(raw, list):
        raw = next((entry for entry in raw if isinstance(entry, dict) and entry.get("file")), None)
    return raw if isinstance(raw, dict) else None


def generate(request: SongRequest, progress: Callable[[float, str], None]) -> ProducedAudio:
    progress(5.0, "Contacting ACE-Step.")
    try:
        if _get("/health", 3.0).status_code != 200:
            raise EditorError(UNAVAILABLE)
        queued = _data(_post("/release_task", task_payload(request), 30.0))
    except requests.RequestException as exc:
        raise EditorError(UNAVAILABLE) from exc
    task_id = queued.get("task_id") if isinstance(queued, dict) else None
    if not isinstance(task_id, str) or not task_id:
        raise EditorError("ACE-Step did not accept the song request.")

    limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900)
    started = time.monotonic()
    entry: dict[str, Any] | None = None
    while time.monotonic() - started < limit:
        elapsed = time.monotonic() - started
        progress(10.0 + 75.0 * (1.0 - 1.0 / (1.0 + elapsed / 25.0)), "Writing the song.")
        try:
            found = _data(_post("/query_result", {"task_id_list": [task_id]}, 15.0))
        except requests.RequestException:
            found = None
        item = next(
            (x for x in found or [] if isinstance(x, dict) and x.get("task_id") == task_id),
            None,
        )
        if item is not None:
            state = item.get("status")
            if state == 2:
                parsed = _result_entry(item) or {}
                reason = parsed.get("error") or parsed.get("generation_info") or ""
                raise EditorError(f"ACE-Step failed to generate the song. {str(reason)[:200]}")
            if state == 1:
                entry = _result_entry(item)
                break
        time.sleep(1.5)
    if entry is None:
        raise EditorError("Song generation took too long and was abandoned.")

    location = str(entry.get("file") or "")
    # Only the server's own download route is followed, never an absolute URL.
    if not location.startswith("/v1/audio?"):
        raise EditorError("ACE-Step finished but did not report a downloadable file.")
    progress(88.0, "Downloading the song from ACE-Step.")
    try:
        response = requests.get(
            f"{base_url()}{location}", headers=_headers(), timeout=120.0, allow_redirects=False
        )
    except requests.RequestException as exc:
        raise EditorError("The song could not be fetched from ACE-Step.") from exc
    if response.status_code != 200:
        raise EditorError("The song could not be fetched from ACE-Step.")
    content = check_size(response.content)
    raw_metas = entry.get("metas")
    metas: dict[str, Any] = raw_metas if isinstance(raw_metas, dict) else {}
    return ProducedAudio(
        content=content,
        suffix=suffix_for(location.split("path=", 1)[-1], response.headers.get("content-type", "")),
        engine=ENGINE,
        model=str(entry.get("dit_model") or request.model or "acestep-v15"),
        info={
            "bpm": metas.get("bpm"),
            "key": metas.get("keyscale"),
            "seed": entry.get("seed_value"),
            "lm_model": entry.get("lm_model"),
        },
    )
