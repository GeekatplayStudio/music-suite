"""Generate a new musical part with a local ComfyUI running the Sonic Holodeck nodes.

Only a loopback ComfyUI is ever contacted. The request is a two-node graph:
``SonicHoloSynth`` (MusicGen) feeding ComfyUI's own ``SaveAudio``.
"""

from __future__ import annotations

import os
import secrets
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from audioqi.editor import assets, projects
from audioqi.editor.projects import EditorError

DEFAULT_URL = "http://127.0.0.1:8188"
SYNTH_NODE = "SonicHoloSynth"
DEFAULT_MODEL = "facebook/musicgen-stereo-medium"
MAX_SECONDS = 120
_LOOPBACK = {"127.0.0.1", "localhost", "::1"}
UNAVAILABLE = (
    "ComfyUI is not running. Start ComfyUI with the Sonic Holodeck nodes installed, "
    "then try again."
)


def base_url() -> str:
    raw = os.getenv("MUSIC_SUITE_COMFYUI_URL", DEFAULT_URL).strip().rstrip("/")
    parsed = urlparse(raw)
    if parsed.scheme != "http" or parsed.hostname not in _LOOPBACK or parsed.username:
        raise EditorError("ComfyUI must be a plain http address on this machine (loopback).")
    return raw


def _get(path: str, timeout: float, **params: Any) -> requests.Response:
    return requests.get(f"{base_url()}{path}", params=params or None, timeout=timeout)


def _post(path: str, payload: dict[str, Any], timeout: float) -> requests.Response:
    return requests.post(f"{base_url()}{path}", json=payload, timeout=timeout)


def status() -> dict[str, Any]:
    """Whether ComfyUI answers and has the generator node, plus the models it offers."""
    result: dict[str, Any] = {"available": False, "node_installed": False, "models": []}
    try:
        if _get("/system_stats", 2.0).status_code != 200:
            return result
        result["available"] = True
        info = _get(f"/object_info/{SYNTH_NODE}", 4.0)
        described = info.json().get(SYNTH_NODE) if info.status_code == 200 else None
    except (requests.RequestException, ValueError, EditorError):
        return result
    if isinstance(described, dict):
        result["node_installed"] = True
        choices = described.get("input", {}).get("required", {}).get("model_name", [[]])[0]
        if isinstance(choices, list):
            result["models"] = [str(choice) for choice in choices][:32]
    return result


def workflow(prompt: str, bpm: int, seconds: int, model: str, seed: int) -> dict[str, Any]:
    return {
        "1": {
            "class_type": SYNTH_NODE,
            "inputs": {
                "model_name": model,
                "prompt": prompt,
                "bpm": bpm,
                "duration": seconds,
                "cfg": 4.0,
                "temperature": 1.0,
                "top_k": 250,
                "top_p": 0.0,
                "mastering": "None",
                "seed": seed,
            },
        },
        "2": {
            "class_type": "SaveAudio",
            "inputs": {"audio": ["1", 0], "filename_prefix": "music_suite/editor"},
        },
    }


def generate(
    project_id: str,
    *,
    prompt: str,
    bpm: int,
    seconds: int,
    model: str,
    parent_id: str | None,
    progress: Callable[[float, str], None],
) -> dict[str, Any]:
    """Run one generation and import the result as a new asset."""
    current = status()
    if not current["available"]:
        raise EditorError(UNAVAILABLE)
    if not current["node_installed"]:
        raise EditorError(
            "ComfyUI is running, but the Sonic Holodeck nodes are not installed in it."
        )
    if current["models"] and model not in current["models"]:
        model = current["models"][0]
    graph = workflow(prompt, bpm, seconds, model, secrets.randbelow(2**48))
    try:
        queued = _post("/prompt", {"prompt": graph, "client_id": "music-suite-editor"}, 15.0)
        prompt_id = queued.json().get("prompt_id") if queued.status_code == 200 else None
    except (requests.RequestException, ValueError) as exc:
        raise EditorError("ComfyUI did not accept the request.") from exc
    if not isinstance(prompt_id, str):
        raise EditorError("ComfyUI rejected the generation request.")

    limit = float(projects.SETTINGS.ffmpeg_timeout_seconds or 900)
    started = time.monotonic()
    outputs: dict[str, Any] | None = None
    while time.monotonic() - started < limit:
        elapsed = time.monotonic() - started
        # Generation gives no percentage, so progress creeps towards 85% as time passes.
        progress(15.0 + 70.0 * (1.0 - 1.0 / (1.0 + elapsed / 30.0)), f"Generating with {model}.")
        try:
            history = _get(f"/history/{prompt_id}", 10.0).json().get(prompt_id)
        except (requests.RequestException, ValueError):
            history = None
        if isinstance(history, dict):
            state = history.get("status") or {}
            if state.get("status_str") == "error":
                raise EditorError("ComfyUI reported an error while generating.")
            if history.get("outputs"):
                outputs = history["outputs"]
                break
        time.sleep(1.0)
    if outputs is None:
        raise EditorError("Generation took too long and was abandoned.")

    files = [
        item
        for node in outputs.values()
        if isinstance(node, dict)
        for item in node.get("audio") or []
        if isinstance(item, dict) and isinstance(item.get("filename"), str)
    ]
    if not files:
        raise EditorError("ComfyUI finished but produced no audio.")
    chosen = files[0]
    progress(88.0, "Importing the generated audio.")
    try:
        response = _get(
            "/view",
            60.0,
            filename=chosen["filename"],
            subfolder=str(chosen.get("subfolder") or ""),
            type=str(chosen.get("type") or "output"),
        )
    except requests.RequestException as exc:
        raise EditorError("The generated audio could not be fetched from ComfyUI.") from exc
    if response.status_code != 200 or not response.content:
        raise EditorError("The generated audio could not be fetched from ComfyUI.")
    if len(response.content) > projects.SETTINGS.max_upload_bytes:
        raise EditorError("The generated audio is larger than the upload limit.")
    suffix = Path(chosen["filename"]).suffix.lower()
    if suffix not in {".flac", ".wav", ".mp3", ".ogg"}:
        suffix = ".flac"
    with tempfile.TemporaryDirectory(dir=projects.scratch_dir()) as tmp:
        staged = Path(tmp) / f"generated{suffix}"
        staged.write_bytes(response.content)
        record = assets.import_audio_file(
            project_id, staged, name=f"{prompt[:48]} (generated)", source="process"
        )
    if parent_id:
        record["parent_id"] = parent_id
    return {"asset": assets.public(record), "model": model}
