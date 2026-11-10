"""ACE-Step 1.5 through its own Python REST server (``uv run acestep-api``), on loopback only.

Ported from the ``feature/song-generation`` branch. On Apple Silicon the built-in
acestep.cpp provider uses far less memory; this one suits NVIDIA machines that
already run ACE-Step's own server. The suite only speaks its documented API:
``/health``, ``/v1/models``, ``/release_task``, ``/query_result`` and ``/v1/audio``.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any
from urllib.parse import urlparse

import requests

from audioqi.editor import projects
from audioqi.editor.projects import EditorError
from audioqi.generation import settings
from audioqi.generation.providers.acestep import INSTRUMENTAL, KEYS, LANGUAGES, SECTIONS
from audioqi.generation.providers.base import Output, RunContext
from audioqi.generation.schema import field

DEFAULT_URL = "http://127.0.0.1:8001"
URL_ENV = "MUSIC_SUITE_ACESTEP_URL"
KEY_ENV = "MUSIC_SUITE_ACESTEP_API_KEY"
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
UNAVAILABLE = (
    "ACE-Step's own server is not running. In your ACE-Step-1.5 folder run "
    "“uv run acestep-api”, then check again."
)
AUDIO_TYPES = {
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
}


def base_url() -> str:
    """The server address: plain http on this machine, no credentials, no query."""
    value = os.getenv(URL_ENV, DEFAULT_URL).strip().rstrip("/")
    parsed = urlparse(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in LOOPBACK_HOSTS
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise EditorError(
            f"{URL_ENV} must be a plain http address on this machine (loopback).", 500
        )
    return value


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
        raise EditorError(f"ACE-Step refused the request: set {KEY_ENV} to its API key.", 502)
    if response.status_code == 429:
        raise EditorError("ACE-Step's queue is full. Try again in a moment.", 503)
    try:
        body = response.json()
    except ValueError as exc:
        raise EditorError("ACE-Step returned an unreadable answer.", 502) from exc
    if response.status_code != 200 or not isinstance(body, dict):
        detail = body.get("detail") if isinstance(body, dict) else None
        message = f"ACE-Step rejected the request ({response.status_code})"
        raise EditorError(f"{message}: {str(detail)[:200]}" if detail else f"{message}.", 502)
    if body.get("error"):
        raise EditorError(f"ACE-Step reported an error: {str(body['error'])[:200]}", 502)
    return body.get("data")


def _models() -> list[str]:
    try:
        listed = _data(_get("/v1/models", 4.0))
    except (requests.RequestException, EditorError):
        return []
    if not isinstance(listed, dict):
        return []
    return [
        str(item["name"])
        for item in listed.get("models") or []
        if isinstance(item, dict) and isinstance(item.get("name"), str) and "/" not in item["name"]
    ][:16]


def _results(item: dict[str, Any]) -> list[dict[str, Any]]:
    raw = item.get("result")
    if isinstance(raw, str) and raw.strip():
        try:
            raw = json.loads(raw)
        except ValueError:
            return []
    if isinstance(raw, dict):
        raw = [raw]
    return (
        [entry for entry in raw or [] if isinstance(entry, dict)] if isinstance(raw, list) else []
    )


class AceStepServerProvider:
    id = "acestep_server"
    name = "ACE-Step 1.5 (your own Python server)"
    kind = "local"

    def _enabled(self) -> bool:
        return bool(settings.load()["providers"].get(self.id, False))

    def status(self) -> dict[str, Any]:
        if not self._enabled():
            return {
                "ready": False,
                "message": "Off. For machines that already run ACE-Step's own server "
                "(best on NVIDIA GPUs). Switch it on, then start the server.",
            }
        try:
            running = _get("/health", 2.0).status_code == 200
        except (requests.RequestException, EditorError):
            running = False
        return {
            "ready": running,
            "message": "Running on this machine." if running else UNAVAILABLE,
            "models": {"dit": _models() if running else []},
        }

    def describe(self) -> dict[str, Any]:
        models = _models() if self._enabled() else []
        fields = [
            field(
                "caption",
                "text",
                "Song",
                "Style description",
                required=True,
                min=3,
                max=1500,
                multiline=True,
                help="Genre, mood, instruments, voice and production, in plain words.",
            ),
            field("instrumental", "bool", "Song", "Instrumental (no vocals)", default=False),
            field(
                "duration", "float", "Song", "Length", min=10, max=600, step=5, unit="s", auto=True
            ),
            field(
                "lyrics",
                "lyrics",
                "Lyrics",
                "Lyrics",
                max=6000,
                sections=SECTIONS,
                help="Use tags such as [Verse] and [Chorus]. Leave empty to let the model write them.",
            ),
            field(
                "vocal_language",
                "enum",
                "Lyrics",
                "Language",
                auto=True,
                options=[{"value": code, "label": label} for code, label in LANGUAGES],
            ),
            field("bpm", "int", "Music", "Tempo", min=30, max=300, step=1, unit="BPM", auto=True),
            field("keyscale", "enum", "Music", "Key", auto=True, options=KEYS),
            field(
                "timesignature",
                "enum",
                "Music",
                "Time signature",
                auto=True,
                options=[
                    {"value": "4", "label": "4/4"},
                    {"value": "3", "label": "3/4"},
                    {"value": "2", "label": "2/4"},
                    {"value": "6", "label": "6/8"},
                ],
            ),
            field(
                "variations",
                "int",
                "Variations",
                "Versions to make",
                min=1,
                max=4,
                step=1,
                default=1,
            ),
            field("seed", "seed", "Variations", "Seed", default=-1, help="-1 picks a random seed."),
            field(
                "thinking",
                "bool",
                "Advanced",
                "Plan the song first",
                default=True,
                advanced=True,
                help="ACE-Step's planner sketches the song before audio is made.",
            ),
            field(
                "use_cot_caption",
                "bool",
                "Advanced",
                "Let the planner rewrite the style",
                default=False,
                advanced=True,
            ),
            field(
                "lm_temperature",
                "float",
                "Advanced",
                "Planner temperature",
                min=0.0,
                max=2.0,
                step=0.05,
                default=0.85,
                advanced=True,
            ),
            field(
                "lm_cfg_scale",
                "float",
                "Advanced",
                "Planner guidance",
                min=1.0,
                max=10.0,
                step=0.1,
                default=2.5,
                advanced=True,
            ),
            field(
                "lm_top_p",
                "float",
                "Advanced",
                "Planner top-p",
                min=0.05,
                max=1.0,
                step=0.05,
                default=0.9,
                advanced=True,
            ),
            field(
                "inference_steps",
                "int",
                "Advanced",
                "Diffusion steps",
                min=1,
                max=200,
                step=1,
                auto=True,
                advanced=True,
                help="Auto uses 8 for turbo models and about 50 for base models.",
            ),
            field(
                "guidance_scale",
                "float",
                "Advanced",
                "Diffusion guidance",
                min=1.0,
                max=15.0,
                step=0.1,
                auto=True,
                advanced=True,
                help="Only used by base models.",
            ),
            field(
                "shift",
                "float",
                "Advanced",
                "Schedule shift",
                min=1.0,
                max=5.0,
                step=0.1,
                auto=True,
                advanced=True,
                help="Only used by base models.",
            ),
            field(
                "infer_method",
                "enum",
                "Advanced",
                "Solver",
                default="ode",
                advanced=True,
                options=[
                    {"value": "ode", "label": "ODE (Euler, faster)"},
                    {"value": "sde", "label": "SDE (stochastic)"},
                ],
            ),
        ]
        if models:
            fields.append(
                field(
                    "model",
                    "model",
                    "Advanced",
                    "Music model",
                    auto=True,
                    advanced=True,
                    options=[{"value": name, "label": name} for name in models],
                )
            )
        return {
            "tasks": [{"id": "text2music", "label": "New song"}],
            "groups": ["Song", "Lyrics", "Music", "Variations", "Advanced"],
            "fields": fields,
        }

    def payload(self, values: dict[str, Any]) -> dict[str, Any]:
        lyrics = str(values.get("lyrics", "")).strip()
        body: dict[str, Any] = {
            "prompt": values["caption"],
            "lyrics": INSTRUMENTAL if values.get("instrumental") or not lyrics else lyrics,
            "audio_format": "flac",
            "batch_size": int(values.get("variations", 1)),
            "thinking": bool(values.get("thinking", True)),
            "use_cot_caption": bool(values.get("use_cot_caption", False)),
        }
        if values.get("instrumental") or not lyrics:
            # Empty lyrics would make the planner invent some; say so explicitly instead.
            body["lyrics"] = INSTRUMENTAL if values.get("instrumental") else ""
        renames = {
            "duration": "audio_duration",
            "keyscale": "key_scale",
            "timesignature": "time_signature",
        }
        for key in (
            "duration",
            "bpm",
            "keyscale",
            "timesignature",
            "vocal_language",
            "lm_temperature",
            "lm_cfg_scale",
            "lm_top_p",
            "inference_steps",
            "guidance_scale",
            "shift",
            "infer_method",
            "model",
        ):
            if key in values:
                body[renames.get(key, key)] = values[key]
        seed = values.get("seed", -1)
        if isinstance(seed, int) and seed >= 0:
            body["use_random_seed"] = False
            body["seed"] = seed
        return body

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        ctx.progress(12.0, "Contacting ACE-Step.")
        try:
            if _get("/health", 3.0).status_code != 200:
                raise EditorError(UNAVAILABLE, 503)
            queued = _data(_post("/release_task", self.payload(values), 30.0))
        except requests.RequestException as exc:
            raise EditorError(UNAVAILABLE, 503) from exc
        task_id = queued.get("task_id") if isinstance(queued, dict) else None
        if not isinstance(task_id, str) or not task_id:
            raise EditorError("ACE-Step did not accept the song request.", 502)

        limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900)
        started = time.monotonic()
        entries: list[dict[str, Any]] = []
        while True:
            elapsed = time.monotonic() - started
            if ctx.cancelled():
                raise EditorError(
                    "Generation was cancelled. ACE-Step may finish it in the background.", 409
                )
            if elapsed > limit:
                raise EditorError("Song generation took too long and was abandoned.", 504)
            ctx.progress(
                14.0 + 70.0 * (1.0 - 1.0 / (1.0 + elapsed / 25.0)), "ACE-Step is writing the song."
            )
            try:
                found = _data(_post("/query_result", {"task_id_list": [task_id]}, 15.0))
            except requests.RequestException:
                found = None
            item = next(
                (x for x in found or [] if isinstance(x, dict) and x.get("task_id") == task_id),
                None,
            )
            if item is not None:
                if item.get("status") == 2:
                    parsed = next(iter(_results(item)), {})
                    reason = parsed.get("error") or parsed.get("generation_info") or ""
                    raise EditorError(
                        f"ACE-Step failed to generate the song. {str(reason)[:200]}", 502
                    )
                if item.get("status") == 1:
                    entries = [e for e in _results(item) if e.get("file")]
                    break
            time.sleep(1.5)
        if not entries:
            raise EditorError("ACE-Step finished but did not report a downloadable file.", 502)

        outputs: list[Output] = []
        for index, entry in enumerate(entries):
            location = str(entry.get("file") or "")
            # Only the server's own download route is followed, never an absolute URL.
            if not location.startswith("/v1/audio?"):
                raise EditorError("ACE-Step reported a file outside its download route.", 502)
            ctx.progress(86.0 + 3.0 * index / len(entries), "Downloading the song from ACE-Step.")
            try:
                response = requests.get(
                    f"{base_url()}{location}",
                    headers=_headers(),
                    timeout=120.0,
                    allow_redirects=False,
                )
            except requests.RequestException as exc:
                raise EditorError("The song could not be fetched from ACE-Step.", 502) from exc
            if response.status_code != 200 or not response.content:
                raise EditorError("The song could not be fetched from ACE-Step.", 502)
            if len(response.content) > projects.SETTINGS.max_upload_bytes:
                raise EditorError("The generated song is larger than the upload limit.", 502)
            raw_metas = entry.get("metas")
            metas: dict[str, Any] = raw_metas if isinstance(raw_metas, dict) else {}
            kind = response.headers.get("content-type", "").split(";")[0].strip().lower()
            outputs.append(
                Output(
                    data=response.content,
                    suffix=AUDIO_TYPES.get(kind, ".flac"),
                    meta={
                        "caption": values.get("caption"),
                        "lyrics": values.get("lyrics", ""),
                        "bpm": metas.get("bpm"),
                        "keyscale": metas.get("keyscale"),
                        "timesignature": metas.get("timesignature"),
                        "duration": metas.get("duration"),
                        "seed": entry.get("seed_value"),
                        "model": entry.get("dit_model"),
                    },
                )
            )
        return outputs
