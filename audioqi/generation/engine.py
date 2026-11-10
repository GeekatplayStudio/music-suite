"""Starts, watches and stops the local acestep.cpp server.

The server is always bound to 127.0.0.1. It is started on first use and stopped after
an idle period, so it holds no memory while nobody is generating.
"""

from __future__ import annotations

import atexit
import contextlib
import os
import socket
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import requests

from audioqi.editor.projects import EditorError
from audioqi.generation import settings

HOST = "127.0.0.1"
PREFERRED_PORT = 8085
REQUIRED_MODEL_KINDS = ("lm", "embedding", "dit", "vae")
NOT_INSTALLED = (
    "The local AI music engine is not installed yet. Open AI Song Studio and "
    "choose “Install local engine”."
)


def binary_path(engine_dir: Path | None = None) -> Path | None:
    base = engine_dir or settings.engine_dir()
    names = ("ace-server.exe",) if sys.platform == "win32" else ("ace-server",)
    for folder in ("build", "build/Release", "build/bin", "build/bin/Release"):
        for name in names:
            candidate = base / folder / name
            if candidate.is_file():
                return candidate
    return None


def classify_model(filename: str) -> str:
    lowered = filename.lower()
    if "embedding" in lowered:
        return "embedding"
    if lowered.startswith("vae") or "-vae" in lowered:
        return "vae"
    if "-lm-" in lowered:
        return "lm"
    return "dit"


def list_models(engine_dir: Path | None = None) -> dict[str, list[str]]:
    """GGUF files in the engine's models folder, grouped the way the engine groups them."""
    found: dict[str, list[str]] = {kind: [] for kind in REQUIRED_MODEL_KINDS}
    models = (engine_dir or settings.engine_dir()) / "models"
    if models.is_dir():
        for path in sorted(models.glob("*.gguf")):
            if path.is_file():
                found[classify_model(path.name)].append(path.name)
    return found


def list_adapters(engine_dir: Path | None = None) -> list[str]:
    folder = (engine_dir or settings.engine_dir()) / "adapters"
    if not folder.is_dir():
        return []
    return sorted(
        p.name
        for p in folder.iterdir()
        if p.suffix == ".safetensors" or (p.is_dir() and not p.name.startswith("."))
    )[:64]


def install_status() -> dict[str, Any]:
    base = settings.engine_dir()
    models = list_models(base)
    missing = [kind for kind in REQUIRED_MODEL_KINDS if not models[kind]]
    built = binary_path(base) is not None
    return {
        "built": built,
        "models": models,
        "missing_models": missing,
        "installed": built and not missing,
    }


def _safe_binary(path: Path) -> None:
    """Refuse a binary that somebody else could have swapped."""
    if not path.is_file() or path.is_symlink():
        raise EditorError("The AI engine program is not a regular file.", 500)
    if hasattr(os, "getuid"):
        info = path.stat()
        if info.st_uid != os.getuid() or info.st_mode & 0o022:
            raise EditorError(
                "The AI engine program must belong to you and not be writable by others.", 500
            )


def _free_port() -> int:
    for port in range(PREFERRED_PORT, PREFERRED_PORT + 50):
        with socket.socket() as sock:
            try:
                sock.bind((HOST, port))
                return port
            except OSError:
                continue
    with socket.socket() as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


class EngineSupervisor:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._process: subprocess.Popen[bytes] | None = None
        self._port = 0
        self._active = 0
        self._last_used = 0.0
        self._watcher: threading.Thread | None = None

    # -- state

    def running(self) -> bool:
        with self._lock:
            return self._process is not None and self._process.poll() is None

    def base_url(self) -> str:
        return f"http://{HOST}:{self._port}"

    # -- lifecycle

    def _start(self) -> None:
        base = settings.engine_dir()
        binary = binary_path(base)
        if binary is None or install_status()["missing_models"]:
            raise EditorError(NOT_INSTALLED, 503)
        _safe_binary(binary)
        self._port = _free_port()
        command = [
            str(binary),
            "--host",
            HOST,
            "--port",
            str(self._port),
            "--models",
            str(base / "models"),
        ]
        if (base / "adapters").is_dir():
            command += ["--adapters", str(base / "adapters")]
        log = (settings.root() / "engine.log").open("ab")
        try:
            self._process = subprocess.Popen(
                command,
                cwd=str(base),
                stdout=log,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
            )
        except OSError as exc:
            raise EditorError("The AI engine could not be started.", 500) from exc
        finally:
            log.close()
        deadline = time.monotonic() + 60.0
        while time.monotonic() < deadline:
            if self._process.poll() is not None:
                self._process = None
                raise EditorError(
                    "The AI engine stopped while starting. See data/generation/engine.log.", 500
                )
            with contextlib.suppress(requests.RequestException):
                if requests.get(f"{self.base_url()}/health", timeout=1.0).status_code == 200:
                    return
            time.sleep(0.2)
        self.stop()
        raise EditorError("The AI engine did not become ready in time.", 504)

    def _watch(self) -> None:
        while True:
            time.sleep(15.0)
            with self._lock:
                if not self.running():
                    self._watcher = None
                    return
                idle_for = time.monotonic() - self._last_used
                if self._active == 0 and idle_for > float(settings.load()["idle_minutes"]) * 60.0:
                    self.stop()
                    self._watcher = None
                    return

    @contextlib.contextmanager
    def session(self) -> Iterator[str]:
        """Use the engine; it is started if needed and kept alive while in use."""
        with self._lock:
            if not self.running():
                self._start()
            self._active += 1
            self._last_used = time.monotonic()
            if self._watcher is None:
                self._watcher = threading.Thread(
                    target=self._watch, name="ace-engine-idle", daemon=True
                )
                self._watcher.start()
            url = self.base_url()
        try:
            yield url
        finally:
            with self._lock:
                self._active = max(0, self._active - 1)
                self._last_used = time.monotonic()

    def stop(self) -> None:
        with self._lock:
            process, self._process = self._process, None
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=10.0)
        except subprocess.TimeoutExpired:
            process.kill()
            with contextlib.suppress(subprocess.TimeoutExpired):
                process.wait(timeout=5.0)


SUPERVISOR = EngineSupervisor()
atexit.register(SUPERVISOR.stop)
