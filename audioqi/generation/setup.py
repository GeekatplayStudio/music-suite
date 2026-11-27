"""One-step install of the local AI music engine (acestep.cpp + its models).

Used by the installers (``python -m audioqi.generation.setup``) and by the
"Install local engine" button in the app. Every source is fixed and pinned:
the engine is one specific git commit and each model file is checked by SHA-256.
"""

from __future__ import annotations

import argparse
import hashlib
import json
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

from audioqi.core import ollama_runtime
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
WINDOWS_TARGET_CMAKE = Path(__file__).with_name("windows_target.cmake")


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
                    "--source",
                    "winget",
                    "--accept-source-agreements",
                    "--accept-package-agreements",
                ],
                None,
            )
            cmake_bin = Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "CMake" / "bin"
            if cmake_bin.is_dir():
                os.environ["PATH"] = f"{cmake_bin}{os.pathsep}{os.environ.get('PATH', '')}"
        if shutil.which("cmake") is None:
            raise SetupError(
                "CMake is needed to build the engine. Install it (macOS: brew install cmake, "
                "Windows: winget install Kitware.CMake, Linux: your package manager) "
                "and run this again."
            )
    if sys.platform == "win32" and not _windows_cpp_toolchain_ready():
        winget = shutil.which("winget")
        if winget is None:
            raise SetupError(
                "A C++ compiler is needed. Install Visual Studio 2022 Build Tools with the "
                "Desktop development with C++ workload, then run this again."
            )
        report("tools", 4, "Installing the Microsoft C++ build tools (this can take a while).")
        _run(
            [
                winget,
                "install",
                "--id",
                "Microsoft.VisualStudio.2022.BuildTools",
                "-e",
                "--source",
                "winget",
                "--accept-source-agreements",
                "--accept-package-agreements",
                "--override",
                "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools "
                "--includeRecommended",
            ],
            None,
        )
        if not _windows_cpp_toolchain_ready():
            raise SetupError(
                "The C++ build tools were installed but could not be verified. Restart Windows, "
                "then run install.bat again."
            )
    if sys.platform == "darwin":
        probe = subprocess.run(["xcode-select", "-p"], capture_output=True, check=False)
        if probe.returncode != 0:
            raise SetupError(
                "Apple's command line tools are needed to build the engine. "
                "Run: xcode-select --install — then run this again."
            )


def _windows_cpp_toolchain_ready() -> bool:
    """Return whether CMake can find a usable Windows C++ compiler."""
    if shutil.which("cl") or shutil.which("g++"):
        return True
    program_files_x86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
    vswhere = Path(program_files_x86) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe"
    if not vswhere.is_file():
        return False
    result = subprocess.run(
        [
            str(vswhere),
            "-latest",
            "-products",
            "*",
            "-requires",
            "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "-property",
            "installationPath",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0 and bool(result.stdout.strip())


def _git(args: list[str], cwd: Path) -> str:
    """Run a read-only git query; "" when it fails or ``cwd`` does not exist yet."""
    # On a first install the engine folder is not there; Windows refuses to start a
    # process in a missing folder (WinError 267), so treat that as "no checkout".
    if not cwd.is_dir():
        return ""
    try:
        result = subprocess.run(
            ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=False
        )
    except OSError:
        return ""
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


def backend_options() -> tuple[str, list[str]]:
    """Select an available accelerator toolchain rather than silently building CPU-only."""
    from audioqi import addons

    requested = os.getenv("MUSIC_SUITE_ACESTEP_BACKEND", "auto").lower()
    if requested not in ("auto", "cpu", "cuda", "vulkan", "metal"):
        raise SetupError("Choose auto, cpu, cuda, vulkan or metal for MUSIC_SUITE_ACESTEP_BACKEND.")
    if requested == "cpu":
        return "cpu", ["-DGGML_CUDA=OFF", "-DGGML_VULKAN=OFF"]
    if sys.platform == "darwin":
        return "metal", ["-DGGML_BLAS=ON", "-DGGML_METAL=ON"]
    nvcc = shutil.which("nvcc")
    if nvcc and (sys.platform != "win32" or shutil.which("cl")) and requested in ("auto", "cuda"):
        return "cuda", ["-DGGML_CUDA=ON", "-DGGML_VULKAN=OFF", "-DCMAKE_CUDA_ARCHITECTURES=native"]
    candidates = [Path(os.environ["VULKAN_SDK"])] if os.getenv("VULKAN_SDK") else []
    if sys.platform == "win32":
        candidates.extend(sorted(Path("C:/VulkanSDK").glob("*"), reverse=True))
    sdk = next((p for p in candidates if (p / "Bin/glslc.exe").is_file()), None)
    glslc = str(sdk / "Bin/glslc.exe") if sdk else shutil.which("glslc")
    if requested in ("auto", "vulkan") and glslc:
        flags = ["-DGGML_CUDA=OFF", "-DGGML_VULKAN=ON", f"-DVulkan_GLSLC_EXECUTABLE={glslc}"]
        if sdk:
            flags += [
                f"-DCMAKE_PREFIX_PATH={sdk.as_posix()}",
                f"-DVulkan_INCLUDE_DIR={(sdk / 'Include').as_posix()}",
                f"-DVulkan_LIBRARY={(Path(os.getenv('WINDIR', 'C:/Windows')) / 'System32/vulkan-1.dll').as_posix()}",
            ]
        return "vulkan", flags
    if requested != "auto" or addons.gpu():
        raise SetupError(
            "GPU build tools are missing. Install the Vulkan SDK, or CUDA plus its C++ compiler. "
            "To choose CPU explicitly, set MUSIC_SUITE_ACESTEP_BACKEND=cpu."
        )
    return "cpu", ["-DGGML_CUDA=OFF", "-DGGML_VULKAN=OFF"]


def _build(target: Path, report: Report, *, force: bool) -> None:
    if engine.binary_path(target) is not None and not force:
        return
    report("build", 10, "Building the engine (a few minutes).")
    backend, flags = backend_options()
    report("build", 10, f"Building the engine with {backend.upper()} acceleration.")
    configure = ["cmake", "-S", ".", "-B", "build", "-DCMAKE_BUILD_TYPE=Release", *flags]
    if sys.platform == "win32":
        # MinGW only: target Windows 10 (its default hides CreateFile2, used by cpp-httplib)
        # and link the runtime statically so the engine starts without MinGW on PATH.
        configure.append(f"-DCMAKE_PROJECT_INCLUDE={WINDOWS_TARGET_CMAKE.as_posix()}")
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
    (target / "music-suite-backend.json").write_text(
        json.dumps({"backend": backend}), encoding="utf-8"
    )


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
    folder = settings.models_dir() if target == settings.engine_dir() else target / "models"
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
        for _attempt in range(3):
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


def pull_writer_model(report: Report, span: tuple[float, float] = (96.0, 99.0)) -> bool:
    """Make the lyrics writer ready: Ollama, running, with the lyrics model downloaded.

    On Windows a missing Ollama is added as Music Suite's own copy in .tools/ollama (see
    audioqi/core/ollama_runtime.py), never as a Windows install. Returns False when there is
    no Ollama and none can be added here (macOS and Linux: ollama.com).
    """
    low, high = span

    def part(start: float, end: float) -> ollama_runtime.Progress:
        def show(share: float, text: str) -> None:
            report("models", low + (high - low) * (start + (end - start) * share), text)

        return show

    try:
        if ollama_runtime.executable() is None:
            if not ollama_runtime.can_install():
                return False
            version = ollama_runtime.VERSION
            report("writer", low, f"Adding Ollama {version} to Music Suite's folder.")
            ollama_runtime.install(part(0.0, 0.2))
        if not ollama_runtime.ensure_running():
            raise SetupError(
                "Ollama did not start. Another program may be using its port (11434); "
                "see logs/ollama.log in the Music Suite folder."
            )
        model = str(settings.load()["writer_model"])
        if ollama_runtime.has_model(model):
            return True
        report("writer", low + (high - low) * 0.2, f"Downloading the lyrics model ({model}).")
        ollama_runtime.pull(model, part(0.2, 1.0))
    except ollama_runtime.OllamaError as exc:
        raise SetupError(str(exc)) from exc
    return True


def install_writer(report: Report) -> None:
    """Only the lyrics writer: Ollama and its model, without the music engine."""
    if not pull_writer_model(report, (1.0, 99.0)):
        raise SetupError("Install Ollama from ollama.com, then come back here.")
    report("done", 100, "The lyrics writer is ready.")


def _present(models: dict[str, tuple[int, str]]) -> bool:
    folder = settings.models_dir()
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
    *, writer: bool = False, editing: bool = False, quality: bool = False, writer_only: bool = False
) -> dict[str, Any]:
    with _LOCK:
        if _STATE["running"]:
            return dict(_STATE)
        _STATE.update(running=True, step="tools", percent=0.0, detail="Starting.", error=None)

    def work() -> None:
        def report(step: str, percent: float, detail: str) -> None:
            _set(step=step, percent=round(percent, 1), detail=detail)

        try:
            if writer_only:
                install_writer(report)
            elif quality:
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
    try:
        return _main(argv)
    finally:
        # An Ollama started here for a download is not left running after the installer.
        ollama_runtime.stop_started()


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Install the local AI music engine for Music Suite."
    )
    parser.add_argument("--yes", action="store_true", help="Install without asking.")
    parser.add_argument("--ask", action="store_true", help="Ask once; remember a 'no'.")
    parser.add_argument("--writer", action="store_true", help="Also fetch the Ollama lyrics model.")
    parser.add_argument(
        "--writer-only",
        action="store_true",
        help="Fetch the Ollama lyrics model and fail if Ollama is unavailable.",
    )
    parser.add_argument(
        "--editing",
        action="store_true",
        help="Also fetch the editing model (extract, add a part); --yes includes it.",
    )
    parser.add_argument(
        "--quality",
        action="store_true",
        help="Fetch the optional high-quality XL model (the engine must be installed).",
    )
    parser.add_argument(
        "--status", action="store_true", help="Print whether the engine is installed."
    )
    args = parser.parse_args(argv)

    if args.status:
        print("installed" if engine.install_status()["installed"] else "missing")
        return 0
    if args.writer_only:
        try:
            if not pull_writer_model(_console_report()):
                print(
                    "Ollama is not installed (get it from ollama.com); "
                    "the lyrics model was not downloaded.",
                    file=sys.stderr,
                )
                return 1
        except SetupError as exc:
            print(f"The lyrics model was not downloaded: {exc}", file=sys.stderr)
            return 1
        return 0
    if args.quality:
        if quality_ready():
            print("The high-quality model is already installed.")
            return 0
        try:
            install_quality(_console_report())
        except SetupError as exc:
            print(f"\nThe high-quality model was not downloaded: {exc}", file=sys.stderr)
            return 1
        return 0
    want_editing = args.yes or args.editing
    if engine.install_status()["installed"] and _git(
        ["rev-parse", "HEAD"], settings.engine_dir()
    ) in (ENGINE_COMMIT, ""):
        print("The local AI music engine is already installed.")
        if args.writer:
            try:
                if not pull_writer_model(_console_report()):
                    print("Ollama is not installed; the lyrics model was skipped.")
            except SetupError as exc:
                print(f"The lyrics model was not downloaded: {exc}", file=sys.stderr)
        if editing_ready():
            return 0
        if not want_editing and not (args.ask and _ask_editing()):
            return 0
        return _install_editing_cli()
    if args.ask and not args.yes:
        if settings.load()["setup_declined"] or not sys.stdin.isatty():
            print(
                "Skipping the local AI music engine. You can install it later from "
                "AI Song Studio > Settings."
            )
            return 0
        print()
        print(
            "Optional: local AI music generation (write and generate full songs on this computer)."
        )
        print(
            "This builds the ACE-Step engine and downloads about "
            f"{DOWNLOAD_BYTES / 1024**3:.1f} GB of models."
        )
        answer = input("Install it now? [Y/n] ").strip().lower()
        if answer not in ("", "y", "yes"):
            settings.update({"setup_declined": True})
            print("Skipped. You can install it any time from AI Song Studio > Settings in the app.")
            return 0
        if not args.writer and (ollama_runtime.executable() or ollama_runtime.can_install()):
            model = str(settings.load()["writer_model"])
            ollama_runtime.ensure_running()
            if not ollama_runtime.has_model(model):
                extra = ""
                if not ollama_runtime.executable():
                    extra = " and Ollama itself (1.6 GB, into this folder)"
                reply = input(f"Also download the lyrics model {model} (about 8 GB){extra}? [Y/n] ")
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
