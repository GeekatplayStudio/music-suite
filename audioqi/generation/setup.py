"""One-step install of the local AI music engine (acestep.cpp + its models).

Used by the installers (``python -m audioqi.generation.setup``) and by the
"Install local engine" button in the app. Every source is fixed and pinned:
the engine is one specific git commit and each model file is checked by SHA-256.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import requests

from audioqi.generation import engine, settings

ENGINE_REPO = "https://github.com/ServeurpersoCom/acestep.cpp.git"
ENGINE_COMMIT = "07abf07da3a9c1c45bd85aabed401644f8eb7c72"
MODEL_BASE = (
    "https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF/resolve/"
    "666ac70204440867d8c01ba4b119cc79c95b370a/"
)
# name -> (bytes, sha256)
MODELS: dict[str, tuple[int, str]] = {
    "vae-BF16.gguf": (
        337420928,
        "0599862ac5d15cd308e1d2e368373aea6c02e25ebd1737ad4a4562a0901b0ef8",
    ),
    "Qwen3-Embedding-0.6B-Q8_0.gguf": (
        784144960,
        "972f23255e46adfe744a0eb9a0039f3c63988f65753b0968d776e8b27168c321",
    ),
    "acestep-5Hz-lm-1.7B-Q8_0.gguf": (
        1975837568,
        "726f99a82f050b32ebc5c5e36acaa9d7acd06bfe5e579a62b00e0d0d6d0b7ec6",
    ),
    "acestep-v15-turbo-Q8_0.gguf": (
        2549528000,
        "288f708a61cfc241013a98a62f98ba331f83fe34d0d3559acdd9b0f6a2f7cd6b",
    ),
}
DOWNLOAD_BYTES = sum(size for size, _ in MODELS.values())
#: The base music model, needed only to extract instruments, add parts or build a song
#: around a part. Offered when first wanted, not installed by default.
EDIT_MODELS: dict[str, tuple[int, str]] = {
    "acestep-v15-base-Q8_0.gguf": (
        2549527936,
        "10329f321010cedc3571c24b6371d002ce49238f48be47def4a1c76bf27ee150",
    ),
}
EDIT_DOWNLOAD_BYTES = sum(size for size, _ in EDIT_MODELS.values())
#: The larger XL turbo music model: an optional quality upgrade for new songs.
QUALITY_MODELS: dict[str, tuple[int, str]] = {
    "acestep-v15-xl-turbo-Q8_0.gguf": (
        5305828736,
        "4f1044fb646374fb5730e10f64325766883eb2fc02a643c1b403f2d61f39dc19",
    ),
}
QUALITY_DOWNLOAD_BYTES = sum(size for size, _ in QUALITY_MODELS.values())
BUILD_TIMEOUT_SECONDS = 3600


class SetupError(Exception):
    """A failure whose message is safe and useful to show to the user."""


Report = Callable[[str, float, str], None]

_LOCK = threading.Lock()
_STATE: dict[str, Any] = {
    "running": False,
    "step": "idle",
    "percent": 0.0,
    "detail": "",
    "error": None,
    "finished_at": None,
}


def state() -> dict[str, Any]:
    with _LOCK:
        return dict(_STATE)


def _set(**changes: Any) -> None:
    with _LOCK:
        _STATE.update(changes)


# --------------------------------------------------------------------------- steps


def _run(
    command: list[str], cwd: Path | None, on_line: Callable[[str], None] | None = None
) -> None:
    try:
        process = subprocess.Popen(
            command,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            errors="replace",
        )
    except OSError as exc:
        raise SetupError(f"Could not run {command[0]}.") from exc
    tail: list[str] = []
    started = time.monotonic()
    assert process.stdout is not None
    for line in process.stdout:
        tail = [*tail[-14:], line.rstrip()]
        if on_line:
            on_line(line)
        if time.monotonic() - started > BUILD_TIMEOUT_SECONDS:
            process.kill()
            raise SetupError(f"{command[0]} took too long and was stopped.")
    if process.wait() != 0:
        raise SetupError(f"{command[0]} failed:\n" + "\n".join(tail[-8:]))


def _ensure_tools(report: Report) -> None:
    report("tools", 2, "Checking build tools.")
    if shutil.which("git") is None:
        raise SetupError("Git is needed to fetch the engine. Install Git and run this again.")
    if shutil.which("cmake") is None:
        brew = shutil.which("brew")
        if sys.platform == "darwin" and brew:
            report("tools", 3, "Installing CMake with Homebrew.")
            _run([brew, "install", "cmake"], None)
        elif sys.platform == "win32" and shutil.which("winget"):
            report("tools", 3, "Installing CMake with winget.")
            _run(
                [
                    "winget",
                    "install",
                    "--id",
                    "Kitware.CMake",
                    "-e",
                    "--accept-source-agreements",
                    "--accept-package-agreements",
                ],
                None,
            )
        if shutil.which("cmake") is None:
            raise SetupError(
                "CMake is needed to build the engine. Install it (macOS: brew install cmake, "
                "Windows: winget install Kitware.CMake, Linux: your package manager) and run this again."
            )
    if sys.platform == "darwin":
        probe = subprocess.run(["xcode-select", "-p"], capture_output=True, check=False)
        if probe.returncode != 0:
            raise SetupError(
                "Apple's command line tools are needed to build the engine. "
                "Run: xcode-select --install — then run this again."
            )


def _git(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=False
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def _fetch_source(target: Path, report: Report) -> bool:
    """Check out the pinned commit. Returns True when the source changed."""
    if (
        _git(["rev-parse", "HEAD"], target) == ENGINE_COMMIT
        and (target / "ggml" / "CMakeLists.txt").is_file()
    ):
        return False
    report("source", 5, "Fetching the engine source.")
    target.mkdir(parents=True, exist_ok=True)
    if not (target / ".git").is_dir():
        _run(["git", "init", "--quiet"], target)
        _run(["git", "remote", "add", "origin", ENGINE_REPO], target)
    _run(["git", "fetch", "--quiet", "--depth", "1", "origin", ENGINE_COMMIT], target)
    _run(["git", "checkout", "--quiet", "--force", ENGINE_COMMIT], target)
    _run(["git", "submodule", "update", "--init", "--recursive", "--depth", "1", "--quiet"], target)
    return True


def _build(target: Path, report: Report, *, force: bool) -> None:
    if engine.binary_path(target) is not None and not force:
        return
    report("build", 10, "Building the engine (a few minutes).")
    configure = ["cmake", "-S", ".", "-B", "build", "-DCMAKE_BUILD_TYPE=Release"]
    if sys.platform == "darwin":
        configure.append("-DGGML_BLAS=ON")  # Metal and Accelerate are picked up automatically.
    _run(configure, target)

    def on_line(line: str) -> None:
        match = re.match(r"\[\s*(\d+)%\]", line)
        if match:
            report("build", 10 + 0.2 * float(match.group(1)), "Building the engine.")

    jobs = str(max(1, (os.cpu_count() or 2) - 1))
    _run(
        ["cmake", "--build", "build", "--config", "Release", "--target", "ace-server", "-j", jobs],
        target,
        on_line,
    )
    if engine.binary_path(target) is None:
        raise SetupError("The build finished but the engine program was not produced.")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _download_models(
    target: Path,
    report: Report,
    models: dict[str, tuple[int, str]] | None = None,
    span: tuple[float, float] = (30.0, 95.0),
) -> None:
    models = MODELS if models is None else models
    total = sum(size for size, _ in models.values())
    low, high = span
    folder = target / "models"
    folder.mkdir(parents=True, exist_ok=True)
    pending = {
        name: spec
        for name, spec in models.items()
        if not ((folder / name).is_file() and (folder / name).stat().st_size == spec[0])
    }
    if not pending:
        return
    need = sum(size for size, _ in pending.values())
    if shutil.disk_usage(folder).free < need + 1024**3:
        raise SetupError(
            f"Not enough free disk space: the models need {need / 1024**3:.1f} GB plus 1 GB spare."
        )
    done = total - need
    for name, (size, digest) in pending.items():
        part = folder / f"{name}.part"
        for attempt in range(3):
            have = part.stat().st_size if part.is_file() else 0
            if have > size:
                part.unlink()
                have = 0
            try:
                if have < size:
                    headers = {"Range": f"bytes={have}-"} if have else {}
                    with requests.get(
                        MODEL_BASE + name, headers=headers, stream=True, timeout=60
                    ) as res:
                        if res.status_code not in (200, 206):
                            raise SetupError(f"Model download failed ({res.status_code}).")
                        if res.status_code == 200:
                            have = 0
                        with part.open("ab" if have else "wb") as handle:
                            for chunk in res.iter_content(1024 * 1024):
                                handle.write(chunk)
                                have += len(chunk)
                                report(
                                    "models",
                                    low + (high - low) * (done + have) / total,
                                    f"Downloading models: {(done + have) / 1024**3:.1f} of "
                                    f"{total / 1024**3:.1f} GB.",
                                )
                if part.stat().st_size == size and _sha256(part) == digest:
                    break
                part.unlink(missing_ok=True)  # Corrupt or truncated: start this file again.
            except requests.RequestException:
                time.sleep(3.0)
        else:
            raise SetupError(
                f"Could not download {name}. Check the internet connection and try again."
            )
        part.replace(folder / name)
        done += size


def pull_writer_model(report: Report) -> bool:
    """Fetch the lyrics model if Ollama is installed. Returns False when Ollama is absent."""
    ollama = shutil.which("ollama")
    if ollama is None:
        return False
    model = str(settings.load()["writer_model"])
    listed = subprocess.run([ollama, "list"], capture_output=True, text=True, check=False).stdout
    if any(line.split()[:1] == [model] for line in listed.splitlines()):
        return True
    report("writer", 96, f"Downloading the lyrics model ({model}).")
    _run([ollama, "pull", model], None)
    return True


def _present(models: dict[str, tuple[int, str]]) -> bool:
    folder = settings.engine_dir() / "models"
    return all(
        (folder / name).is_file() and (folder / name).stat().st_size == size
        for name, (size, _) in models.items()
    )


def editing_ready() -> bool:
    return _present(EDIT_MODELS)


def quality_ready() -> bool:
    return _present(QUALITY_MODELS)


def install_quality(report: Report) -> None:
    """Download the XL music model (the engine must be installed)."""
    if not engine.install_status()["installed"]:
        raise SetupError("Install the local engine first.")
    _download_models(settings.engine_dir(), report, QUALITY_MODELS, (2.0, 99.0))
    report("done", 100, "The high-quality model is ready.")


def install_editing(report: Report) -> None:
    """Download the base model used by the instrument tasks (the engine must be installed)."""
    if not engine.install_status()["installed"]:
        raise SetupError("Install the local engine first.")
    _download_models(settings.engine_dir(), report, EDIT_MODELS, (2.0, 99.0))
    report("done", 100, "The editing model is ready.")


def install(report: Report, *, writer: bool = False) -> None:
    target = settings.engine_dir()
    _ensure_tools(report)
    changed = _fetch_source(target, report)
    _build(target, report, force=changed)
    _download_models(target, report)
    if writer:
        try:
            pull_writer_model(report)
        except SetupError as exc:  # Lyrics fall back to the engine's own planner.
            report("writer", 97, f"The lyrics model was skipped: {str(exc).splitlines()[0]}")
    report("done", 100, "The local AI music engine is ready.")


# --------------------------------------------------------------------------- background use


def start_background(
    *, writer: bool = False, editing: bool = False, quality: bool = False
) -> dict[str, Any]:
    with _LOCK:
        if _STATE["running"]:
            return dict(_STATE)
        _STATE.update(running=True, step="tools", percent=0.0, detail="Starting.", error=None)

    def work() -> None:
        def report(step: str, percent: float, detail: str) -> None:
            _set(step=step, percent=round(percent, 1), detail=detail)

        try:
            if quality:
                install_quality(report)
            elif editing:
                install_editing(report)
            else:
                install(report, writer=writer)
            settings.update({"setup_declined": False})
            _set(running=False, finished_at=time.time())
        except SetupError as exc:
            _set(running=False, step="failed", error=str(exc), finished_at=time.time())
        except Exception as exc:
            _set(
                running=False,
                step="failed",
                error=f"Setup failed ({type(exc).__name__}).",
                finished_at=time.time(),
            )

    threading.Thread(target=work, name="ace-engine-setup", daemon=True).start()
    return state()


# --------------------------------------------------------------------------- command line


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Install the local AI music engine for Music Suite."
    )
    parser.add_argument("--yes", action="store_true", help="Install without asking.")
    parser.add_argument("--ask", action="store_true", help="Ask once; remember a 'no'.")
    parser.add_argument("--writer", action="store_true", help="Also fetch the Ollama lyrics model.")
    parser.add_argument(
        "--editing",
        action="store_true",
        help="Also fetch the editing model (extract, add a part); --yes includes it.",
    )
    parser.add_argument(
        "--status", action="store_true", help="Print whether the engine is installed."
    )
    args = parser.parse_args(argv)

    if args.status:
        print("installed" if engine.install_status()["installed"] else "missing")
        return 0
    want_editing = args.yes or args.editing
    if engine.install_status()["installed"] and _git(
        ["rev-parse", "HEAD"], settings.engine_dir()
    ) in (ENGINE_COMMIT, ""):
        print("The local AI music engine is already installed.")
        if editing_ready():
            return 0
        if not want_editing and not (args.ask and _ask_editing()):
            return 0
        return _install_editing_cli()
    if args.ask and not args.yes:
        if settings.load()["setup_declined"] or not sys.stdin.isatty():
            print(
                "Skipping the local AI music engine. You can install it later from AI Song Studio > Settings."
            )
            return 0
        print()
        print(
            "Optional: local AI music generation (write and generate full songs on this computer)."
        )
        print(
            f"This builds the ACE-Step engine and downloads about {DOWNLOAD_BYTES / 1024**3:.1f} GB of models."
        )
        answer = input("Install it now? [Y/n] ").strip().lower()
        if answer not in ("", "y", "yes"):
            settings.update({"setup_declined": True})
            print("Skipped. You can install it any time from AI Song Studio > Settings in the app.")
            return 0
        ollama = shutil.which("ollama")
        if ollama and not args.writer:
            model = str(settings.load()["writer_model"])
            listed = subprocess.run(
                [ollama, "list"], capture_output=True, text=True, check=False
            ).stdout
            if not any(line.split()[:1] == [model] for line in listed.splitlines()):
                reply = input(
                    f"Also download the lyrics model {model} with Ollama (about 8 GB)? [Y/n] "
                )
                args.writer = reply.strip().lower() in ("", "y", "yes")
        want_editing = _ask_editing()

    report = _console_report()
    try:
        install(report, writer=args.writer)
    except SetupError as exc:
        print(f"\nThe AI music engine was not installed: {exc}", file=sys.stderr)
        print(
            "Music Suite itself still works. Try again later from AI Song Studio > Settings.",
            file=sys.stderr,
        )
        return 1
    return _install_editing_cli() if want_editing else 0


def _ask_editing() -> bool:
    """Offer the editing model once in a terminal; remember a no."""
    if settings.load()["editing_declined"] or not sys.stdin.isatty():
        return False
    reply = input(
        f"Also download the editing model ({EDIT_DOWNLOAD_BYTES / 1024**3:.1f} GB) to extract "
        "instruments and add parts in the Studio Editor? [Y/n] "
    )
    if reply.strip().lower() in ("", "y", "yes"):
        return True
    settings.update({"editing_declined": True})
    print("Skipped. You can download it any time from AI Song Studio > Settings.")
    return False


def _install_editing_cli() -> int:
    try:
        install_editing(_console_report())
    except SetupError as exc:
        print(f"\nThe editing model was not downloaded: {exc}", file=sys.stderr)
        print(
            "Everything else works. Try again later from AI Song Studio > Settings.",
            file=sys.stderr,
        )
        return 0  # Optional extra: never fail an install over it.
    return 0


def _console_report() -> Report:
    last = {"line": ""}

    def report(step: str, percent: float, detail: str) -> None:
        if step == "build" and not sys.stdout.isatty():
            percent = float(int(percent / 5) * 5)  # Keep log files short.
        line = f"[{percent:5.1f}%] {detail}"
        if step == "models" and sys.stdout.isatty():
            print("\r" + line.ljust(70), end="", flush=True)
        elif line != last["line"]:
            print(("\n" if last["line"].startswith("\r") else "") + line, flush=True)
        last["line"] = "\r" if step == "models" and sys.stdout.isatty() else line

    return report


if __name__ == "__main__":
    raise SystemExit(main())
