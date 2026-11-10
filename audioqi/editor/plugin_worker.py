"""Isolated worker: load one plugin with Pedalboard and process one file.

Run as ``python -m audioqi.editor.plugin_worker request.json in.wav out.wav report.json``.
It lives in its own process because a misbehaving plugin can crash its host.
Error text written to the report never contains filesystem paths.
"""

from __future__ import annotations

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


def run(request_path: Path, src: Path, dst: Path) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    request = json.loads(request_path.read_text(encoding="utf-8"))
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
