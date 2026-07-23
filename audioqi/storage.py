from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from uuid import uuid4

from audioqi.config import get_settings

SETTINGS = get_settings()


def new_run_id() -> str:
    return str(uuid4())


def run_dir_for(run_id: str) -> Path:
    run_dir = SETTINGS.runs_dir / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "charts").mkdir(parents=True, exist_ok=True)
    return run_dir


def upload_path_for(run_id: str, filename: str) -> Path:
    upload_dir = SETTINGS.uploads_dir / run_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    safe = sanitize_filename(filename)
    return upload_dir / safe


def sanitize_filename(filename: str) -> str:
    # Prevent path traversal and normalize hostile filename input.
    base = Path(filename).name.strip()
    if not base:
        return "upload.bin"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base)
    return cleaned or "upload.bin"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True)


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)
