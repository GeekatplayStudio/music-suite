"""Isolated worker: load one plugin with Pedalboard and process one file.

Run as ``python -m audioqi.editor.plugin_worker request.json in.wav out.wav report.json``.
It lives in its own process because a misbehaving plugin can crash its host.
Error text written to the report never contains filesystem paths.

The request's ``mode`` picks the job:

* ``effect`` (default): run ``in.wav`` through an audio effect.
* ``instrument``: play the request's notes through an instrument plugin into ``out.wav``.
* ``editor``: open the plugin's own window; when it is closed, report its saved state.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import sys
from pathlib import Path
from typing import Any

MAX_DESCRIBED_PARAMETERS = 512


def _load(path: str) -> Any:
    import pedalboard

    try:
        return pedalboard.load_plugin(path)
    except ValueError:
        # A bundle holding several plugins needs an explicit name; take the first.
        cls = pedalboard.AudioUnitPlugin if path.endswith(".component") else pedalboard.VST3Plugin
        names = cls.get_plugin_names_for_file(path)
        if not names:
            raise
        return pedalboard.load_plugin(path, plugin_name=names[0])


def _describe(plugin: Any) -> list[dict[str, Any]]:
    described: list[dict[str, Any]] = []
    for name, parameter in list(plugin.parameters.items())[:MAX_DESCRIBED_PARAMETERS]:
        low, high = getattr(parameter, "min_value", None), getattr(parameter, "max_value", None)
        if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
            continue
        if not (math.isfinite(low) and math.isfinite(high)) or high <= low:
            continue
        raw = getattr(parameter, "default_raw_value", 0.0)
        raw = float(raw) if isinstance(raw, (int, float)) and math.isfinite(raw) else 0.0
        default = float(low) + min(1.0, max(0.0, raw)) * (float(high) - float(low))
        described.append(
            {"name": str(name), "min": float(low), "max": float(high), "default": default}
        )
    return described


def _apply_parameters(plugin: Any, values: dict[str, float]) -> None:
    known = plugin.parameters
    for name, value in values.items():
        parameter = known.get(name)
        if parameter is None:
            raise ValueError(f"unknown parameter '{name[:64]}'")
        low, high = getattr(parameter, "min_value", None), getattr(parameter, "max_value", None)
        if isinstance(low, (int, float)) and isinstance(high, (int, float)):
            value = min(float(high), max(float(low), float(value)))
        if getattr(parameter, "type", None) is bool:
            value = bool(round(value))
        setattr(plugin, name, value)


def _restore(plugin: Any, state: Any) -> None:
    """Put back a sound saved from the plugin's own window."""
    if not state:
        return
    try:
        raw = base64.b64decode(str(state), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("the saved sound is damaged") from exc
    plugin.raw_state = raw


def midi_events(notes: list[dict[str, Any]]) -> list[tuple[bytes, float]]:
    """Note-on/off messages in time order; at the same moment, note-offs come first."""
    events: list[tuple[float, int, bytes]] = []
    for note in notes:
        pitch = int(note["p"])
        start = float(note["t"])
        end = start + float(note["d"])
        velocity = max(1, min(127, round(float(note.get("v", 0.8)) * 127)))
        events.append((start, 1, bytes([0x90, pitch, velocity])))
        events.append((end, 0, bytes([0x80, pitch, 0])))
    events.sort(key=lambda e: (e[0], e[1]))
    return [(message, time) for time, _, message in events]


def render_instrument(request: dict[str, Any], dst: Path) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    if not getattr(plugin, "is_instrument", False):
        return {"ok": False, "error": "it is an audio effect, not an instrument"}
    try:
        _restore(plugin, request.get("state"))
        _apply_parameters(plugin, dict(request.get("parameters") or {}))
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception:
        return {"ok": False, "error": "the saved sound could not be loaded into the plugin"}
    sample_rate = int(request.get("sample_rate", 48000))
    try:
        out = plugin(
            midi_events(list(request.get("notes") or [])),
            duration=float(request["seconds"]),
            sample_rate=float(sample_rate),
            num_channels=2,
            reset=True,
        )
    except Exception:
        return {"ok": False, "error": "playing the notes failed inside the plugin"}
    out = np.asarray(out, dtype=np.float32)
    out = out[None] if out.ndim == 1 else out
    sf.write(str(dst), out.T, sample_rate, subtype="FLOAT")
    return {"ok": True, "is_instrument": True}


def open_editor(request: dict[str, Any]) -> dict[str, Any]:
    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    try:
        _restore(plugin, request.get("state"))
    except Exception:
        return {"ok": False, "error": "the saved sound could not be loaded into the plugin"}
    try:
        plugin.show_editor()  # Blocks until the user closes the plugin's window.
    except Exception:
        return {"ok": False, "error": "the plugin's window could not be opened"}
    return {
        "ok": True,
        "state": base64.b64encode(bytes(plugin.raw_state)).decode("ascii"),
        "is_instrument": bool(getattr(plugin, "is_instrument", False)),
    }


def run(request_path: Path, src: Path, dst: Path) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    request = json.loads(request_path.read_text(encoding="utf-8"))
    mode = request.get("mode", "effect")
    if mode == "instrument":
        return render_instrument(request, dst)
    if mode == "editor":
        return open_editor(request)
    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    if getattr(plugin, "is_instrument", False):
        return {"ok": False, "error": "it is an instrument, not an audio effect"}
    try:
        _apply_parameters(plugin, dict(request.get("parameters") or {}))
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception:
        return {"ok": False, "error": "a parameter value was rejected"}
    audio, sample_rate = sf.read(str(src), dtype="float32", always_2d=True)
    try:
        out = plugin(np.ascontiguousarray(audio.T), float(sample_rate), reset=True)
    except Exception:
        return {"ok": False, "error": "processing failed inside the plugin"}
    out = np.asarray(out, dtype=np.float32)
    out = out[None] if out.ndim == 1 else out
    sf.write(str(dst), out.T, int(sample_rate), subtype="FLOAT")
    return {"ok": True, "parameters": _describe(plugin)}


def describe(request_path: Path) -> dict[str, Any]:
    request = json.loads(request_path.read_text(encoding="utf-8"))
    try:
        plugin = _load(str(request["plugin"]))
    except Exception:
        return {"ok": False, "error": "the plugin could not be loaded"}
    return {
        "ok": True,
        "parameters": _describe(plugin),
        "is_instrument": bool(getattr(plugin, "is_instrument", False)),
    }


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 4):
        return 2
    paths = [Path(item) for item in argv]
    report = paths[-1]
    try:
        outcome = describe(paths[0]) if len(paths) == 2 else run(paths[0], paths[1], paths[2])
    except Exception:
        outcome = {"ok": False, "error": "the plugin worker failed"}
    report.write_text(json.dumps(outcome), encoding="utf-8")
    return 0 if outcome.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
