"""Optional engines and models, installed from inside Music Suite (or its installers).

Each *pack* adds Python packages to Music Suite's own environment. Installs never change
a package that is already there: every installed version is passed to pip as a
constraint, so a pack either fits beside what exists or fails with pip's explanation.

On Windows with an NVIDIA card, PyTorch comes from PyTorch's CUDA index (PyPI only has
CPU builds for Windows) and only from there, so pip cannot swap in a newer CPU build.

Usage from a terminal::

    python -m audioqi.addons list
    python -m audioqi.addons install stems            # pack plus its default models
    python -m audioqi.addons install stems --models none
"""

from __future__ import annotations

import argparse
import importlib
import importlib.metadata
import importlib.util
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from audioqi.editor import projects
from audioqi.editor.projects import EditorError

PIP_TIMEOUT_SECONDS = 2 * 60 * 60
MODEL_TIMEOUT_SECONDS = 60 * 60
LOG_LINES = 40
# Driver needed for each PyTorch CUDA build on Windows, newest first. Only builds that
# also ship torchaudio for Windows are listed.
CUDA_INDEXES = ((580, "cu130"), (560, "cu126"))
TORCH_INDEX = "https://download.pytorch.org/whl/{build}"

Report = Callable[[str, float, str], None]


@dataclass(frozen=True)
class Pack:
    id: str
    label: str
    summary: str
    unlocks: tuple[str, ...]
    packages: tuple[str, ...]
    # Importable names that must all be present for the pack to count as installed.
    modules: tuple[str, ...]
    torch: bool = False
    download_note: str = ""


@dataclass(frozen=True)
class Model:
    file: str
    label: str
    used_for: str
    default: bool = True


PACKS: dict[str, Pack] = {
    "stems": Pack(
        id="stems",
        label="AI stem separation",
        summary="Neural separators (Demucs, BS-RoFormer, MDX23C) that split songs far more cleanly "
        "than the built-in splitter, and into more parts.",
        unlocks=(
            "6 stems: vocals, drums, bass, guitar, piano and the rest",
            "Drums into kick, snare, toms, hi-hat, ride and crash",
            "Vocals into lead and backing",
            "Cleaner 2- and 4-stem splits",
            "AI beat and downbeat tracking for tempo matching",
        ),
        packages=("demucs>=4.0.1", "audio-separator[cpu]>=0.48.0", "beat-this>=1.1.0"),
        modules=("torch", "demucs", "audio_separator"),
        torch=True,
        download_note="About 3 GB with NVIDIA GPU support, about 1 GB without, plus the models.",
    ),
}

MODELS: tuple[Model, ...] = (
    Model("htdemucs_ft.yaml", "Demucs v4 (fine-tuned)", "4 stems"),
    Model("htdemucs_6s.yaml", "Demucs v4 6-stem", "6 stems: adds guitar and piano"),
    Model(
        "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        "BS-RoFormer",
        "2 stems: vocals and instrumental",
    ),
    Model(
        "MDX23C-DrumSep-aufr33-jarredou.ckpt",
        "DrumSep (MDX23C)",
        "drums into kick, snare, toms, hi-hat, ride and crash",
    ),
    Model(
        "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt",
        "Mel-RoFormer Karaoke",
        "vocals into lead and backing",
    ),
)
MODEL_FILES = {model.file for model in MODELS}

_LOCK = threading.Lock()


@dataclass
class _State:
    running: bool = False
    pack: str | None = None
    step: str = "idle"
    percent: float = 0.0
    detail: str = ""
    error: str | None = None
    finished_at: float | None = None
    log: list[str] = field(default_factory=list)


_STATE = _State()


# --------------------------------------------------------------------------- detection


def models_dir() -> Path:
    """Where the separators keep their weights (shared with ``editor.separation``)."""
    return projects.SETTINGS.data_dir.resolve() / "models" / "audio-separator"


def has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def gpu() -> dict[str, Any] | None:
    """The graphics card PyTorch could use, without importing PyTorch."""
    if sys.platform == "darwin":
        import platform

        return (
            {"vendor": "apple", "name": "Apple GPU (Metal)"}
            if platform.machine() == "arm64"
            else None
        )
    smi = shutil.which("nvidia-smi")
    if not smi:
        return None
    try:
        out = subprocess.run(
            [smi, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    first = next((line for line in out.splitlines() if line.strip()), "")
    parts = [part.strip() for part in first.split(",")]
    if len(parts) < 3:
        return None
    try:
        memory_gb = round(float(parts[1]) / 1024, 1)
    except ValueError:
        memory_gb = None
    return {"vendor": "nvidia", "name": parts[0], "memory_gb": memory_gb, "driver": parts[2]}


def cuda_build(driver: str | None) -> str | None:
    """The PyTorch CUDA build for an NVIDIA driver version ("610.88" -> "cu130")."""
    match = re.match(r"(\d+)", driver or "")
    if not match:
        return None
    major = int(match.group(1))
    return next((build for minimum, build in CUDA_INDEXES if major >= minimum), None)


def torch_plan(card: dict[str, Any] | None = None, platform: str | None = None) -> dict[str, Any]:
    """Where PyTorch would come from and what it would run on."""
    platform = platform or sys.platform
    card = gpu() if card is None else card
    if platform == "win32" and card and card.get("vendor") == "nvidia":
        build = cuda_build(card.get("driver"))
        if build:
            return {"index": TORCH_INDEX.format(build=build), "build": build, "device": "cuda"}
        return {
            "index": None,
            "build": "cpu",
            "device": "cpu",
            "note": "Update the NVIDIA driver to use the GPU.",
        }
    if platform.startswith("linux") and card and card.get("vendor") == "nvidia":
        return {
            "index": None,
            "build": "pypi",
            "device": "cuda",
        }  # PyPI's Linux builds include CUDA.
    if platform == "darwin" and card:
        return {"index": None, "build": "pypi", "device": "mps"}
    return {"index": None, "build": "cpu", "device": "cpu"}


def torch_status() -> dict[str, Any]:
    """The installed PyTorch, read from its metadata so the API process stays light."""
    version = package_version("torch")
    if not version:
        return {"installed": False}
    build = (
        version.split("+", 1)[1]
        if "+" in version
        else ("pypi" if sys.platform != "win32" else "cpu")
    )
    return {"installed": True, "version": version, "cuda": build.startswith("cu")}


def model_status() -> list[dict[str, Any]]:
    folder = models_dir()
    return [
        {
            "file": model.file,
            "label": model.label,
            "used_for": model.used_for,
            "default": model.default,
            "downloaded": (folder / model.file).is_file(),
        }
        for model in MODELS
    ]


def folder_size(path: Path) -> int:
    if not path.is_dir():
        return 0
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def pack_installed(pack: Pack) -> bool:
    return all(has_module(name) for name in pack.modules)


def state() -> dict[str, Any]:
    with _LOCK:
        return {
            "running": _STATE.running,
            "pack": _STATE.pack,
            "step": _STATE.step,
            "percent": round(_STATE.percent, 1),
            "detail": _STATE.detail,
            "error": _STATE.error,
            "finished_at": _STATE.finished_at,
            "log": list(_STATE.log[-LOG_LINES:]),
        }


def overview() -> dict[str, Any]:
    """Every pack with its status, the GPU, the PyTorch plan and any install in progress."""
    card = gpu()
    return {
        "gpu": card,
        "torch": {**torch_status(), "plan": torch_plan(card)},
        "packs": [
            {
                "id": pack.id,
                "label": pack.label,
                "summary": pack.summary,
                "unlocks": list(pack.unlocks),
                "download_note": pack.download_note,
                "installed": pack_installed(pack),
                "versions": {
                    name: package_version(name)
                    for name in ("torch", "demucs", "audio-separator", "beat-this")
                    if pack.id == "stems"
                },
            }
            for pack in PACKS.values()
        ],
        "models": model_status(),
        "models_bytes": folder_size(models_dir()),
        "install": state(),
    }


# --------------------------------------------------------------------------- installing


def _freeze() -> list[str]:
    """``name==version`` for everything installed, to pin it during an install."""
    out = subprocess.run(
        [sys.executable, "-m", "pip", "list", "--format=freeze", "--disable-pip-version-check"],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    ).stdout
    keep = []
    for line in out.splitlines():
        line = line.strip()
        if "==" not in line or line.startswith("-e") or line.lower().startswith("music-suite=="):
            continue
        keep.append(line)
    return keep


def pip_command(args: list[str], constraints: Path) -> list[str]:
    return [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--progress-bar",
        "off",
        "-c",
        str(constraints),
        *args,
    ]


def torch_args(plan: dict[str, Any]) -> list[str]:
    """pip arguments for PyTorch: its CUDA index *only* when one is used."""
    args = ["torch", "torchaudio"]
    return [*args, "--index-url", plan["index"]] if plan.get("index") else args


def _describe(line: str) -> str | None:
    """A short progress message from a line of pip output."""
    if line.startswith("Collecting "):
        return f"Resolving {line.split()[1]}"
    if line.startswith("Downloading "):
        name = Path(line.split()[1]).name.split("-")[0]
        size = re.search(r"\(([^)]+)\)", line)
        return f"Downloading {name}" + (f" ({size.group(1)})" if size else "")
    if line.startswith("Installing collected packages"):
        return "Installing (this can take a few minutes)"
    if line.startswith("Successfully installed"):
        return "Installed"
    return None


def _stream(
    command: list[str], report: Report, step: str, start: float, end: float, timeout: int
) -> None:
    """Run a command, report each meaningful line, raise with the tail of its output on failure."""
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            errors="replace",
        )
    except OSError as exc:
        raise EditorError(f"Could not start {Path(command[0]).name}.") from exc
    started = time.monotonic()
    lines: list[str] = []
    seen = 0
    assert process.stdout is not None
    for raw in process.stdout:
        line = raw.strip()
        if not line:
            continue
        lines = [*lines[-LOG_LINES:], line]
        _log(line)
        message = _describe(line)
        if message:
            seen += 1
            # Creep towards the end of the span; the step's real length is unknown up front.
            report(step, start + (end - start) * (1 - 0.9**seen), message)
        if time.monotonic() - started > timeout:
            process.kill()
            raise EditorError("The install took too long and was stopped.")
    if process.wait() != 0:
        tail = "\n".join(lines[-8:])
        raise EditorError(f"The install failed:\n{tail}")


def _log(line: str) -> None:
    with _LOCK:
        _STATE.log = [*_STATE.log[-LOG_LINES:], line[:300]]


_DOWNLOAD_SCRIPT = """
import logging, sys, tempfile
from audio_separator.separator import Separator
separator = Separator(
    log_level=logging.WARNING, model_file_dir=sys.argv[1], output_dir=tempfile.gettempdir()
)
download = getattr(separator, "download_model_files", None)
if download is not None:
    download(sys.argv[2])
else:
    separator.load_model(model_filename=sys.argv[2])
print("Downloaded", sys.argv[2])
"""


def download_model(file: str, report: Report, start: float = 0.0, end: float = 100.0) -> None:
    if file not in MODEL_FILES:
        raise EditorError("Unknown model.", 404)
    if not has_module("audio_separator"):
        raise EditorError("Install AI stem separation first.")
    folder = models_dir()
    folder.mkdir(parents=True, exist_ok=True)
    label = next(model.label for model in MODELS if model.file == file)
    report("models", start, f"Downloading {label}")
    _stream(
        [sys.executable, "-c", _DOWNLOAD_SCRIPT, str(folder), file],
        report,
        "models",
        start,
        end,
        MODEL_TIMEOUT_SECONDS,
    )


def install(pack_id: str, models: list[str] | None, report: Report) -> None:
    """Install a pack and download ``models`` (None: the pack's default models)."""
    pack = PACKS.get(pack_id)
    if pack is None:
        raise EditorError("Unknown pack.", 404)
    wanted = [m.file for m in MODELS if m.default] if models is None else models
    unknown = [name for name in wanted if name not in MODEL_FILES]
    if unknown:
        raise EditorError("Unknown model.", 404)
    with tempfile.TemporaryDirectory() as tmp:
        constraints = Path(tmp) / "constraints.txt"
        if pack.torch and not has_module("torch"):
            plan = torch_plan()
            where = f"the {plan['build']} build" if plan.get("index") else "PyPI"
            report("torch", 2, f"Installing PyTorch from {where}")
            constraints.write_text("\n".join(_freeze()) + "\n", encoding="utf-8")
            _stream(
                pip_command(torch_args(plan), constraints),
                report,
                "torch",
                2,
                55,
                PIP_TIMEOUT_SECONDS,
            )
        # Re-pinned after PyTorch, so the next step keeps the build just installed.
        constraints.write_text("\n".join(_freeze()) + "\n", encoding="utf-8")
        report("packages", 56, f"Installing {pack.label}")
        _stream(
            pip_command(list(pack.packages), constraints),
            report,
            "packages",
            56,
            80,
            PIP_TIMEOUT_SECONDS,
        )
    importlib.invalidate_caches()
    for index, file in enumerate(wanted):
        span = 19 / max(1, len(wanted))
        download_model(file, report, 80 + index * span, 80 + (index + 1) * span)
    report("done", 100, f"{pack.label} is ready.")


def _run_background(target: Callable[[Report], None], pack: str) -> dict[str, Any]:
    with _LOCK:
        if _STATE.running:
            raise EditorError("Something is already being installed. Wait for it to finish.", 409)
        _STATE.running, _STATE.pack, _STATE.step = True, pack, "starting"
        _STATE.percent, _STATE.detail, _STATE.error, _STATE.log = 0.0, "Starting", None, []

    def report(step: str, percent: float, detail: str) -> None:
        with _LOCK:
            _STATE.step, _STATE.percent, _STATE.detail = step, max(_STATE.percent, percent), detail

    def run() -> None:
        try:
            target(report)
        except Exception as exc:  # Reported to the page; the install can simply be retried.
            with _LOCK:
                _STATE.error = (
                    str(exc) if isinstance(exc, EditorError) else f"Install failed: {exc}"
                )
        finally:
            with _LOCK:
                _STATE.running = False
                _STATE.finished_at = time.time()

    threading.Thread(target=run, name=f"addon-{pack}", daemon=True).start()
    return state()


def start_install(pack_id: str, models: list[str] | None) -> dict[str, Any]:
    if pack_id not in PACKS:
        raise EditorError("Unknown pack.", 404)
    return _run_background(lambda report: install(pack_id, models, report), pack_id)


def start_model_download(file: str) -> dict[str, Any]:
    if file not in MODEL_FILES:
        raise EditorError("Unknown model.", 404)
    if not has_module("audio_separator"):
        raise EditorError("Install AI stem separation first.")
    return _run_background(lambda report: download_model(file, report, 2, 99), "models")


def delete_models() -> int:
    """Remove every downloaded separation model; returns the bytes freed."""
    with _LOCK:
        if _STATE.running:
            raise EditorError("Wait for the install to finish.", 409)
    folder = models_dir()
    freed = folder_size(folder)
    if folder.is_dir():
        shutil.rmtree(folder)
    return freed


# --------------------------------------------------------------------------- command line


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m audioqi.addons", description=__doc__.split("\n")[0]
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="show packs, models, GPU and PyTorch")
    add = sub.add_parser("install", help="install a pack")
    add.add_argument("pack", choices=sorted(PACKS))
    add.add_argument(
        "--models",
        default="default",
        help="'default', 'all', 'none', or comma-separated model files",
    )
    args = parser.parse_args(argv)

    if args.command == "list":
        info = overview()
        card = info["gpu"]
        print(f"GPU: {card['name'] if card else 'none found'}")
        plan = info["torch"]["plan"]
        print(
            f"PyTorch: {info['torch'].get('version', 'not installed')} "
            f"(would install: {plan['build']})"
        )
        for pack in info["packs"]:
            print(f"[{'x' if pack['installed'] else ' '}] {pack['id']}: {pack['label']}")
        for model in info["models"]:
            print(
                f"    [{'x' if model['downloaded'] else ' '}] {model['label']}: {model['used_for']}"
            )
        return 0

    choice = args.models.strip().lower()
    models = (
        None
        if choice == "default"
        else [m.file for m in MODELS]
        if choice == "all"
        else []
        if choice == "none"
        else [name.strip() for name in args.models.split(",") if name.strip()]
    )

    def report(step: str, percent: float, detail: str) -> None:
        print(f"[{percent:5.1f}%] {detail}", flush=True)

    try:
        install(args.pack, models, report)
    except EditorError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
