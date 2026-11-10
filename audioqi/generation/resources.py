"""Keeps generation from overloading the machine.

One heavy generation runs at a time, the lyrics model is unloaded first, and work is
refused while free memory is under the configured threshold.
"""

from __future__ import annotations

import contextlib
import ctypes
import re
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path

import requests

from audioqi.editor.projects import EditorError
from audioqi.generation import settings

OLLAMA = "http://127.0.0.1:11434"
GENERATION_LOCK = threading.Lock()


def free_memory_percent() -> float | None:
    """System-wide free memory as a percentage, or None when it cannot be read."""
    try:
        if sys.platform == "darwin":
            out = subprocess.run(
                ["/usr/bin/memory_pressure"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            ).stdout
            match = re.search(r"free percentage:\s*(\d+)%", out)
            return float(match.group(1)) if match else None
        if sys.platform.startswith("linux"):
            info = dict(
                line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines()
            )
            total = float(info["MemTotal"].split()[0])
            return 100.0 * float(info["MemAvailable"].split()[0]) / total
        if sys.platform == "win32":

            class _Status(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    *[(name, ctypes.c_ulonglong) for name in "abcdefg"],
                ]

            status = _Status()
            status.dwLength = ctypes.sizeof(_Status)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):  # type: ignore[attr-defined]
                return 100.0 - float(status.dwMemoryLoad)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return None
    return None


def unload_ollama_models() -> list[str]:
    """Ask a local Ollama to drop every loaded model. Silent when Ollama is not running."""
    unloaded: list[str] = []
    try:
        loaded = requests.get(f"{OLLAMA}/api/ps", timeout=2.0).json().get("models", [])
    except (requests.RequestException, ValueError):
        return unloaded
    for model in loaded:
        name = model.get("name") if isinstance(model, dict) else None
        if not isinstance(name, str):
            continue
        with contextlib.suppress(requests.RequestException):
            requests.post(
                f"{OLLAMA}/api/generate", json={"model": name, "keep_alive": 0}, timeout=10.0
            )
            unloaded.append(name)
    return unloaded


def ensure_memory(
    report: Callable[[str], None] | None = None,
    *,
    wait_seconds: float = 20.0,
    cancelled: Callable[[], bool] | None = None,
) -> None:
    """Free what we can, then refuse to continue if memory is still too tight."""
    threshold = float(settings.load()["min_free_percent"])
    if unload_ollama_models() and report:
        report("Unloading the lyrics model to free memory.")
    deadline = time.monotonic() + wait_seconds
    while True:
        free = free_memory_percent()
        if free is None or free >= threshold:
            return
        if time.monotonic() >= deadline or (cancelled and cancelled()):
            raise EditorError(
                f"Only {free:.0f}% of memory is free and generation needs {threshold:.0f}%. "
                "Close some apps or browser tabs and try again.",
                503,
            )
        if report:
            report(f"Waiting for memory to free up ({free:.0f}% free).")
        time.sleep(2.0)
