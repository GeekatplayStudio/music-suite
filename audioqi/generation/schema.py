"""Parameter schemas: each provider describes its controls and the UI builds the form.

A schema is a list of field dicts. ``validate`` is the single place a request's values
are checked, so a provider only ever sees fields it declared, in range.
"""

from __future__ import annotations

import math
from typing import Any

from audioqi.editor.projects import ParamError

TYPES = {"text", "lyrics", "int", "float", "bool", "enum", "seed", "model", "plan"}
ADHERENCE = ("low", "medium", "high")
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


def _styles(value: Any, label: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 50:
        raise ParamError(f"{label} must be a list of up to 50 styles.")
    styles = []
    for item in value:
        if not isinstance(item, str):
            raise ParamError(f"{label} must be text.")
        cleaned = " ".join("".join(ch for ch in item if ch.isprintable()).split())[:100]
        if cleaned:
            styles.append(cleaned)
    return styles


def _plan(spec: dict[str, Any], value: Any) -> list[dict[str, Any]]:
    """A song plan: ordered sections, each with its own lyrics, length and styles."""
    limit = int(spec.get("max_sections", 30))
    if not isinstance(value, list) or not 1 <= len(value) <= limit:
        raise ParamError(f"A song plan has 1 to {limit} sections.")
    sections: list[dict[str, Any]] = []
    total = 0.0
    for index, raw in enumerate(value, start=1):
        if not isinstance(raw, dict):
            raise ParamError(f"Section {index} is not valid.")
        unknown = set(raw) - {"name", "lyrics", "seconds", "styles", "avoid", "adherence"}
        if unknown:
            raise ParamError(f"Section {index} has unknown field(s).")
        name = " ".join(
            "".join(ch for ch in str(raw.get("name") or "") if ch.isprintable()).split()
        )
        if not 1 <= len(name) <= 100:
            raise ParamError(f"Section {index} needs a name of 1 to 100 characters.")
        lyrics = raw.get("lyrics") or ""
        if not isinstance(lyrics, str):
            raise ParamError(f"Section {index}: lyrics must be text.")
        lines = [
            "".join(ch for ch in line if ch.isprintable()).strip()
            for line in lyrics.replace("\r\n", "\n").split("\n")
        ]
        lines = [line for line in lines if line]
        if len(lines) > 30 or any(len(line) > 200 for line in lines):
            raise ParamError(f"Section {index}: up to 30 lyric lines of 200 characters each.")
        seconds = raw.get("seconds")
        if (
            isinstance(seconds, bool)
            or not isinstance(seconds, (int, float))
            or not math.isfinite(seconds)
        ):
            raise ParamError(f"Section {index} needs a length in seconds.")
        if not 3 <= seconds <= 120:
            raise ParamError(f"Section {index} must be 3 to 120 seconds long.")
        adherence = raw.get("adherence") or "high"
        if adherence not in ADHERENCE:
            raise ParamError(f"Section {index}: adherence is low, medium or high.")
        total += float(seconds)
        sections.append(
            {
                "name": name,
                "lyrics": "\n".join(lines),
                "seconds": round(float(seconds), 2),
                "styles": _styles(raw.get("styles"), f"Section {index} styles"),
                "avoid": _styles(raw.get("avoid"), f"Section {index} styles to avoid"),
                "adherence": adherence,
            }
        )
    if total > float(spec.get("max_total_seconds", 600)):
        raise ParamError(
            f"The whole plan must be at most {spec.get('max_total_seconds', 600)} seconds."
        )
    if not sections[0]["styles"]:
        raise ParamError("The first section needs at least one style: it sets the song's genre.")
    return sections


def _one(spec: dict[str, Any], value: Any) -> Any:
    kind = spec["type"]
    if kind == "plan":
        return _plan(spec, value)
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
    for key, original in known.items():
        spec = original
        if "required_tasks" in spec:
            spec = {**spec, "required": task in spec["required_tasks"]}
        if "tasks" in spec and task not in spec["tasks"]:
            if values.get(key) not in (None, ""):
                raise ParamError(f"'{key}' does not apply to this task.")
            continue
        value = values.get(key)
        if value is None or (value == "" and spec["type"] not in ("text", "lyrics")):
            if spec.get("required") and spec["type"] == "bool":
                raise ParamError(f"Please confirm: {spec['label']}")
            if spec.get("required"):
                raise ParamError(f"'{spec['label']}' is required.")
            continue
        result = _one(spec, value)
        if spec["type"] == "bool" and spec.get("required") and result is not True:
            raise ParamError(f"Please confirm: {spec['label']}")
        if result == "" and spec.get("required"):
            raise ParamError(f"'{spec['label']}' is required.")
        if result != "":
            cleaned[key] = result
    return cleaned
