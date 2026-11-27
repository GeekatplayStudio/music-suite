"""Music Suite's own Ollama: the local language model runner for lyrics and descriptions.

Like the rest of Music Suite on Windows, it is a private copy inside the suite's folder
(``.tools/ollama``), not a Windows install: no Start-menu entry, no tray icon, nothing that
starts with Windows, no auto-updater. It runs only while Music Suite runs. The API starts it
when it is needed and stops it with the API; stop.bat also stops anything still running from
``.tools/ollama``.

An Ollama already on the computer (from ollama.com) is used as it is, and one that is already
running is simply talked to. Models go into ``data/ollama/models``, except that models already
downloaded by an Ollama on the computer (its usual ``~/.ollama/models``, or the folder chosen in
the Ollama app) are used from there, so nothing is downloaded twice. Ollama also keeps a small
identity key; the private copy keeps it in ``data/ollama`` instead of the user's profile.

The download is one fixed version from Ollama's GitHub releases, checked against its known
SHA-256 before it is unpacked. Music Suite only ever talks to Ollama on loopback.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import platform
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from audioqi import portable

VERSION = "0.40.16"
_RELEASE = f"https://github.com/ollama/ollama/releases/download/v{VERSION}"
# (archive, size in bytes, SHA-256), from the release's own sha256sum.txt and GitHub's digests.
PACKAGES: dict[str, tuple[str, int, str]] = {
    "amd64": (
        "ollama-windows-amd64.zip",
        1618244995,
        "50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e",
    ),
    "arm64": (
        "ollama-windows-arm64.zip",
        386918926,
        "86d2b329cae3125684ff29b506623710b68e1393f679594f1c6aa267beac31c2",
    ),
}

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / ".tools" / "ollama"
LOG = ROOT / "logs" / "ollama.log"
_VERSION_FILE = ".music-suite-version"
DEFAULT_HOST = "127.0.0.1:11434"
START_SECONDS = 30.0
RETRY_AFTER_SECONDS = 60.0

Progress = Callable[[float, str], None]


class OllamaError(Exception):
    """Ollama could not be installed, started or asked; the message says why, in plain words."""


# --------------------------------------------------------------------------- where it is


def _host() -> str:
    """host:port from OLLAMA_HOST when it is on this computer, otherwise Ollama's default."""
    raw = os.environ.get("OLLAMA_HOST", "").strip()
    if not raw:
        return DEFAULT_HOST
    parsed = urlparse(raw if "://" in raw else f"http://{raw}")
    host = (parsed.hostname or "").lower()
    if host not in ("127.0.0.1", "localhost", "::1"):
        return DEFAULT_HOST  # GUARDRAILS.md: only a model on this computer.
    host = "127.0.0.1" if host == "localhost" else host
    port = parsed.port or 11434
    return f"[{host}]:{port}" if ":" in host else f"{host}:{port}"


def base_url() -> str:
    return f"http://{_host()}"


def _arch() -> str | None:
    machine = platform.machine().lower()
    if machine in ("amd64", "x86_64"):
        return "amd64"
    if machine in ("arm64", "aarch64"):
        return "arm64"
    return None


def can_install() -> bool:
    """Whether Music Suite can download its own copy here (Windows, x64 or ARM)."""
    return sys.platform == "win32" and _arch() in PACKAGES


def own_executable() -> Path | None:
    exe = TOOLS / ("ollama.exe" if sys.platform == "win32" else "bin/ollama")
    return exe if exe.is_file() else None


def own_version() -> str | None:
    try:
        return (TOOLS / _VERSION_FILE).read_text(encoding="utf-8").strip() or None
    except OSError:
        return None


def system_executable() -> str | None:
    """An Ollama installed on the computer (from ollama.com), if any."""
    found = shutil.which("ollama")
    if found:
        return found
    if sys.platform == "win32":
        # The ollama.com installer puts it here and adds it to PATH, which an open window
        # may not have picked up yet.
        places = [("LOCALAPPDATA", "Programs/Ollama"), ("ProgramFiles", "Ollama")]
        for variable, folder in places:
            base = os.environ.get(variable)
            if base and (Path(base) / folder / "ollama.exe").is_file():
                return str(Path(base) / folder / "ollama.exe")
    elif sys.platform == "darwin":
        app = Path("/Applications/Ollama.app/Contents/Resources/ollama")
        if app.is_file():
            return str(app)
    return None


def executable() -> tuple[str, bool] | None:
    """(path, is Music Suite's own copy): the private copy first, then one on the computer."""
    own = own_executable()
    if own:
        return str(own), True
    system = system_executable()
    return (system, False) if system else None


def _app_models_dir() -> Path | None:
    """The model folder chosen in the Ollama app's settings on Windows, when it holds models."""
    if sys.platform != "win32" or not os.environ.get("LOCALAPPDATA"):
        return None
    database = Path(os.environ["LOCALAPPDATA"]) / "Ollama" / "db.sqlite"
    if not database.is_file():
        return None
    try:  # Read-only: the Ollama app's own settings are never changed.
        uri = f"{database.as_uri()}?mode=ro"
        with contextlib.closing(sqlite3.connect(uri, uri=True, timeout=1.0)) as connection:
            row = connection.execute("SELECT models FROM settings LIMIT 1").fetchone()
    except sqlite3.Error:
        return None
    if not row or not isinstance(row[0], str) or not row[0].strip():
        return None
    folder = Path(row[0].strip())
    return folder if (folder / "manifests").is_dir() else None


def models_dir(home: Path | None = None) -> Path:
    """Where the private copy keeps models (an explicit OLLAMA_MODELS always wins).

    Models already downloaded by an Ollama on this computer are used where they are: the
    folder chosen in the Ollama app's settings, or Ollama's usual ``~/.ollama/models``.
    """
    explicit = os.environ.get("OLLAMA_MODELS")
    if explicit:
        return Path(explicit)
    chosen = _app_models_dir()
    if chosen:
        return chosen
    usual = (home or Path.home()) / ".ollama" / "models"
    try:
        if any((usual / "manifests").iterdir()):
            return usual  # Already downloaded there, by Ollama itself or an older Music Suite.
    except OSError:
        pass
    return portable.data_dir() / "ollama" / "models"


def server_env(own: bool, home: Path | None = None) -> dict[str, str]:
    """The environment for ``ollama serve``. An Ollama on the computer gets the user's own."""
    env = dict(os.environ)
    env["OLLAMA_HOST"] = _host()
    if own:
        models = models_dir(home)
        state = portable.data_dir() / "ollama"
        state.mkdir(parents=True, exist_ok=True)
        env["OLLAMA_MODELS"] = str(models)
        # Ollama keeps its identity key in ~/.ollama; for the private copy that is data/ollama.
        env["USERPROFILE"] = env["HOME"] = str(state)
    return env


def autostart_allowed() -> bool:
    return os.environ.get("MUSIC_SUITE_OLLAMA_AUTOSTART", "1") != "0"


# --------------------------------------------------------------------------- running it


_LOCK = threading.Lock()
_process: subprocess.Popen[bytes] | None = None
_failed_at = 0.0


def reachable(timeout: float = 1.5) -> bool:
    try:
        return requests.get(f"{base_url()}/api/version", timeout=timeout).status_code == 200
    except requests.RequestException:
        return False


def ensure_running(wait: float = START_SECONDS) -> bool:
    """Start Ollama if it is installed and nothing answers on its port. True when it answers.

    A start that failed is not retried for a minute, so status checks never pile up processes.
    """
    global _process, _failed_at
    if reachable():
        return True
    if not autostart_allowed():
        return False
    with _LOCK:
        if reachable():
            return True
        if _process is None or _process.poll() is not None:
            if time.monotonic() - _failed_at < RETRY_AFTER_SECONDS and _failed_at:
                return False
            found = executable()
            if found is None:
                return False
            path, own = found
            LOG.parent.mkdir(parents=True, exist_ok=True)
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
            try:
                with LOG.open("ab") as log:
                    _process = subprocess.Popen(
                        [path, "serve"],
                        env=server_env(own),
                        stdin=subprocess.DEVNULL,
                        stdout=log,
                        stderr=subprocess.STDOUT,
                        creationflags=flags,
                    )
            except OSError:
                _failed_at = time.monotonic()
                return False
        deadline = time.monotonic() + wait
        while time.monotonic() < deadline:
            if reachable(0.5):
                _failed_at = 0.0
                return True
            if _process.poll() is not None:
                break  # It exited: another program holds the port, or it cannot run here.
            time.sleep(0.3)
        if _process.poll() is not None:
            _failed_at = time.monotonic()
        return False


def started_here() -> bool:
    return _process is not None and _process.poll() is None


def stop_started() -> None:
    """Stop the Ollama this process started (and its model runners). Others are left alone."""
    global _process
    process, _process = _process, None
    if process is None or process.poll() is not None:
        return
    if sys.platform == "win32":
        # The model runners are child processes; /T takes them too.
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            capture_output=True,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    else:
        process.terminate()
    with contextlib.suppress(subprocess.TimeoutExpired):
        process.wait(timeout=10)


def start_in_background() -> None:
    """At API start: get Ollama going if it is installed, without delaying anything."""
    if autostart_allowed() and executable() is not None:
        threading.Thread(target=ensure_running, name="ollama-start", daemon=True).start()


# --------------------------------------------------------------------------- installing


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _download(url: str, target: Path, size: int, progress: Progress) -> None:
    part = target.with_name(target.name + ".part")
    for _attempt in range(4):
        have = part.stat().st_size if part.exists() else 0
        if have > size:
            part.unlink()
            have = 0
        if have == size:
            break
        headers = {"Range": f"bytes={have}-"} if have else {}
        try:
            with requests.get(url, headers=headers, stream=True, timeout=60) as response:
                if have and response.status_code != 206:
                    have = 0  # The server does not resume; start again.
                response.raise_for_status()
                with part.open("ab" if have else "wb") as out:
                    done, shown = have, 0.0
                    for block in response.iter_content(1024 * 1024):
                        out.write(block)
                        done += len(block)
                        if time.monotonic() - shown > 0.5:
                            shown = time.monotonic()
                            progress(
                                done / size,
                                f"Downloading Ollama {VERSION} "
                                f"({done / 1e9:.2f} of {size / 1e9:.2f} GB).",
                            )
        except requests.RequestException:
            time.sleep(3.0)
    if not part.exists() or part.stat().st_size != size:
        raise OllamaError(
            "Ollama could not be downloaded. Check the internet connection and try again."
        )
    part.replace(target)


def install(progress: Progress) -> Path:
    """Download and unpack Music Suite's own Ollama into .tools/ollama (Windows only)."""
    arch = _arch()
    if not can_install() or arch is None:
        raise OllamaError("Install Ollama from ollama.com, then come back here.")
    name, size, sha256 = PACKAGES[arch]
    if own_executable() and own_version() == VERSION:
        return TOOLS
    TOOLS.parent.mkdir(parents=True, exist_ok=True)
    archive = TOOLS.parent / name
    _download(f"{_RELEASE}/{name}", archive, size, lambda share, text: progress(share * 0.9, text))
    progress(0.9, "Checking the download.")
    if _sha256(archive) != sha256:
        archive.unlink(missing_ok=True)
        raise OllamaError(
            "The Ollama download did not match its known fingerprint and was deleted. Try again."
        )
    progress(0.92, "Unpacking Ollama.")
    stage = TOOLS.with_name("ollama.new")
    shutil.rmtree(stage, ignore_errors=True)
    try:
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(stage)  # extractall refuses absolute and ".." paths.
        if not (stage / "ollama.exe").is_file():
            raise OllamaError("The Ollama download did not contain ollama.exe.")
        (stage / _VERSION_FILE).write_text(VERSION, encoding="utf-8")
        if TOOLS.exists():
            stop_started()
            shutil.rmtree(TOOLS)
        stage.replace(TOOLS)
    finally:
        shutil.rmtree(stage, ignore_errors=True)
        archive.unlink(missing_ok=True)
    progress(1.0, "Ollama is ready.")
    return TOOLS


# --------------------------------------------------------------------------- models


def installed_models(timeout: float = 2.0) -> list[str]:
    try:
        tags = requests.get(f"{base_url()}/api/tags", timeout=timeout).json().get("models", [])
    except (requests.RequestException, ValueError):
        return []
    return sorted(str(item["name"]) for item in tags if isinstance(item, dict) and item.get("name"))


def has_model(model: str) -> bool:
    names = installed_models()
    return model in names or f"{model}:latest" in names


def pull(model: str, progress: Progress) -> None:
    """Download a model through the running Ollama, reporting its progress."""
    totals: dict[str, tuple[int, int]] = {}
    shown = 0.0
    try:
        with requests.post(
            f"{base_url()}/api/pull",
            json={"model": model, "stream": True},
            stream=True,
            timeout=(10, 600),
        ) as response:
            response.raise_for_status()
            for raw in response.iter_lines():
                if not raw:
                    continue
                try:
                    line: dict[str, Any] = json.loads(raw)
                except ValueError:
                    continue
                if line.get("error"):
                    raise OllamaError(f"Ollama could not download {model}: {line['error']}")
                digest, total = line.get("digest"), line.get("total")
                if digest and isinstance(total, int) and total > 0:
                    totals[digest] = (int(line.get("completed") or 0), total)
                if line.get("status") == "success":
                    progress(1.0, f"{model} is downloaded.")
                    return
                if totals and time.monotonic() - shown > 0.5:
                    shown = time.monotonic()
                    done = sum(value[0] for value in totals.values())
                    whole = sum(value[1] for value in totals.values())
                    text = f"Downloading {model} ({done / 1e9:.1f} of {whole / 1e9:.1f} GB)."
                    progress(done / whole, text)
    except requests.RequestException as exc:
        raise OllamaError(
            f"The download of {model} stopped. Check the internet connection and try again."
        ) from exc
    raise OllamaError(f"The download of {model} did not finish. Try again.")


def info() -> dict[str, Any]:
    """What the app shows about Ollama: is there one, is it Music Suite's own, can it be added."""
    found = executable()
    arch = _arch()
    package = PACKAGES.get(arch) if arch else None
    return {
        "installed": found is not None,
        "own": bool(found and found[1]),
        "version": own_version() if found and found[1] else None,
        "can_install": found is None and can_install(),
        "download_gb": round(package[1] / 1e9, 1) if package else None,
    }


def main(argv: list[str] | None = None) -> int:
    """``python -m audioqi.core.ollama_runtime install|status``."""
    args = sys.argv[1:] if argv is None else argv
    command = args[0] if args else "status"
    if command == "install":
        try:
            install(lambda share, text: print(f"\r[{share:6.1%}] {text}"[:79], end="", flush=True))
        except OllamaError as exc:
            print(f"\n{exc}", file=sys.stderr)
            return 1
        print()
        return 0
    if command == "status":
        place = {"running": reachable(), "url": base_url(), "models_dir": str(models_dir())}
        print(json.dumps({**info(), **place}, indent=2))
        return 0
    print("Usage: python -m audioqi.core.ollama_runtime install|status", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
