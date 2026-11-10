"""Parameter schemas: each provider describes its controls and the UI builds the form.

A schema is a list of field dicts. ``validate`` is the single place a request's values
are checked, so a provider only ever sees fields it declared, in range.
"""

from __future__ import annotations

import math
from typing import Any

from audioqi.editor.projects import ParamError

TYPES = {"text", "lyrics", "int", "float", "bool", "enum", "seed", "model"}
MAX_SEED = 2**32 - 1


def field(key: str, kind: str, group: str, label: str, **extra: Any) -> dict[str, Any]:
    if kind not in TYPES:
        raise ValueError(f"Unknown field type {kind}")
    return {"key": key, "type": kind, "group": group, "label": label, **extra}


def _text(spec: dict[str, Any], value: Any) -> str:
    if not isinstance(value, str):
        raise ParamError(f"'{spec['key']}' must be text.")
    keep_lines = spec["type"] == "lyrics"
    cleaned = "".join(ch for ch in value if ch.isprintable() or (keep_lines and ch == "\n"))
    cleaned = cleaned.strip()
    limit = int(spec.get("max", 400))
    if len(cleaned) > limit:
        raise ParamError(f"'{spec['key']}' must be at most {limit} characters.")
    if len(cleaned) < int(spec.get("min", 0)):
        raise ParamError(f"'{spec['label']}' is too short.")
    return cleaned


def _number(spec: dict[str, Any], value: Any, *, integer: bool) -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ParamError(f"'{spec['key']}' must be a number.")
    if integer and float(value) != int(value):
        raise ParamError(f"'{spec['key']}' must be a whole number.")
    low, high = spec["min"], spec["max"]
    if not low <= value <= high:
        raise ParamError(f"'{spec['key']}' must be between {low:g} and {high:g}.")
    return int(value) if integer else float(value)


def _one(spec: dict[str, Any], value: Any) -> Any:
    kind = spec["type"]
    if kind in ("text", "lyrics"):
        return _text(spec, value)
    if kind == "int":
        return _number(spec, value, integer=True)
    if kind == "float":
        return _number(spec, value, integer=False)
    if kind == "seed":
        return _number({**spec, "min": -1, "max": MAX_SEED}, value, integer=True)
    if kind == "bool":
        if not isinstance(value, bool):
            raise ParamError(f"'{spec['key']}' must be true or false.")
        return value
    # enum and model: one of the listed values.
    options = [opt["value"] if isinstance(opt, dict) else opt for opt in spec.get("options", [])]
    if not isinstance(value, str) or value not in options:
        raise ParamError(f"'{spec['key']}' is not one of the available choices.")
    return value


def validate(fields: list[dict[str, Any]], task: str, values: Any) -> dict[str, Any]:
    """Return cleaned values for ``task``. Unset optional fields are left out."""
    if not isinstance(values, dict):
        raise ParamError("'fields' must be an object.")
    known = {spec["key"]: spec for spec in fields}
    unknown = sorted(set(values) - set(known))
    if unknown:
        raise ParamError(f"Unknown field(s): {', '.join(str(key)[:40] for key in unknown)}.")
    cleaned: dict[str, Any] = {}
    for key, spec in known.items():
        if "tasks" in spec and task not in spec["tasks"]:
            if values.get(key) not in (None, ""):
                raise ParamError(f"'{key}' does not apply to this task.")
            continue
        value = values.get(key)
        if value is None or (value == "" and spec["type"] not in ("text", "lyrics")):
            if spec.get("required"):
                raise ParamError(f"'{spec['label']}' is required.")
            continue
        result = _one(spec, value)
        if result == "" and spec.get("required"):
            raise ParamError(f"'{spec['label']}' is required.")
        if result != "":
            cleaned[key] = result
    return cleaned
