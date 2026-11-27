"""Build helpers for the prebuilt AI music engine packages (.github/workflows/engine-packages.yml).

Runs in GitHub Actions, not on users' computers. Music Suite's installer downloads the packages
this produces (audioqi/generation/setup.py pins each one by size and SHA-256), so installing
the engine needs no CMake, compiler or Git.

  cuda DEST                       CUDA compiler and libraries from NVIDIA's redistributable
                                  archives, each checked against NVIDIA's published SHA-256.
  pack-windows-engine BUILD SRC VCREDIST OUT NAME
                                  NAME-windows-x64.zip: engine, CPU variants, Vulkan and the
                                  Visual C++ runtime.
  pack-windows-cuda BUILD CUDA OUT NAME
                                  NAME-windows-x64-cuda.zip: the NVIDIA backend and its CUDA
                                  libraries.
  pack-macos BUILD SRC OUT NAME   NAME-macos-arm64.tar.gz (one program, Metal built in).
  sums DIR                        SHA256SUMS and packages.json (name, bytes, sha256).
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

CUDA_VERSION = "12.9.1"
CUDA_REDIST = "https://developer.download.nvidia.com/compute/cuda/redist/"
CUDA_COMPONENTS = (
    "cuda_nvcc",
    "cuda_cudart",
    "cuda_cccl",
    "libcublas",
    "cuda_nvrtc",
    "cuda_nvtx",
    "cuda_profiler_api",
    "visual_studio_integration",
)
# The CUDA libraries the NVIDIA backend loads (redistributable under NVIDIA's CUDA EULA).
CUDA_RUNTIME = ("cudart64_12.dll", "cublas64_12.dll", "cublasLt64_12.dll")
ENGINE_PROGRAM = "ace-server"
NVIDIA_NOTICE = """\
This package contains NVIDIA CUDA runtime libraries (cudart, cuBLAS, cuBLASLt) {version},
redistributed under the NVIDIA CUDA Toolkit End User License Agreement:
https://docs.nvidia.com/cuda/eula/index.html
"""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _fetch(url: str, dest: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "music-suite-ci"})
    with urllib.request.urlopen(request, timeout=120) as response, dest.open("wb") as handle:
        shutil.copyfileobj(response, handle, 4 * 1024 * 1024)


def cuda(dest: Path) -> None:
    """Merge the CUDA redistributable archives into one toolkit folder."""
    with tempfile.TemporaryDirectory() as temp:
        manifest_path = Path(temp) / "redistrib.json"
        _fetch(f"{CUDA_REDIST}redistrib_{CUDA_VERSION}.json", manifest_path)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        dest.mkdir(parents=True, exist_ok=True)
        for component in CUDA_COMPONENTS:
            entry = manifest[component]["windows-x86_64"]
            archive = Path(temp) / Path(entry["relative_path"]).name
            print(f"{component} {manifest[component]['version']}", flush=True)
            _fetch(CUDA_REDIST + entry["relative_path"], archive)
            if _sha256(archive) != entry["sha256"]:
                raise SystemExit(f"{archive.name}: checksum mismatch")
            with zipfile.ZipFile(archive) as bundle:
                for member in bundle.infolist():
                    # Each archive holds one top folder (cuda_nvcc-windows-x86_64-...-archive/).
                    parts = Path(member.filename).parts[1:]
                    if not parts or member.is_dir() or ".." in parts:
                        continue
                    target = dest.joinpath(*parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(member) as source, target.open("wb") as handle:
                        shutil.copyfileobj(source, handle)
            archive.unlink()


def _licenses(src: Path, stage: Path) -> None:
    shutil.copy2(src / "LICENSE", stage / "LICENSE-acestep.cpp.txt")
    shutil.copy2(src / "ggml" / "LICENSE", stage / "LICENSE-ggml.txt")
    (stage / "SOURCE.txt").write_text(
        "acestep.cpp (https://github.com/ServeurpersoCom/acestep.cpp), built by Music Suite's\n"
        ".github/workflows/engine-packages.yml from the commit named in music-suite-engine.json.\n",
        encoding="utf-8",
    )


def _zip(stage: Path, out: Path) -> None:
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(stage.rglob("*")):
            if path.is_file():
                bundle.write(path, path.relative_to(stage).as_posix())
    print(f"{out.name}: {out.stat().st_size / 1024**2:.1f} MB", flush=True)


def pack_windows_engine(build: Path, src: Path, vcredist: Path, out: Path, name: str) -> None:
    """The engine, its CPU variants, Vulkan and the Visual C++ runtime (built without CUDA)."""
    out.mkdir(parents=True, exist_ok=True)
    libraries = list(build.glob("*.dll"))
    if not (build / f"{ENGINE_PROGRAM}.exe").is_file() or not (build / "ggml-vulkan.dll").is_file():
        raise SystemExit(f"{build} holds no {ENGINE_PROGRAM}.exe or no Vulkan backend")
    if not any(p.name.startswith("ggml-cpu-") for p in libraries):
        raise SystemExit("The CPU variants were not built")
    with tempfile.TemporaryDirectory() as temp:
        stage = Path(temp) / "engine"
        stage.mkdir()
        shutil.copy2(build / f"{ENGINE_PROGRAM}.exe", stage)
        for library in libraries:
            shutil.copy2(library, stage)
        # The Visual C++ runtime and OpenMP beside the program (Microsoft's app-local
        # deployment), so it starts on a Windows without the Visual C++ Redistributable.
        runtime = [
            *(vcredist / "x64").glob("Microsoft.VC*.CRT/*.dll"),
            *(vcredist / "x64").glob("Microsoft.VC*.OpenMP/*.dll"),
        ]
        if not any(p.name.lower() == "vcomp140.dll" for p in runtime):
            raise SystemExit(f"No Visual C++ runtime under {vcredist}")
        for library in runtime:
            shutil.copy2(library, stage)
        _licenses(src, stage)
        _zip(stage, out / f"{name}-windows-x64.zip")


def pack_windows_cuda(build: Path, cuda_root: Path, out: Path, name: str) -> None:
    """The NVIDIA backend and the CUDA libraries it loads, unpacked beside the engine."""
    out.mkdir(parents=True, exist_ok=True)
    gpu = build / "ggml-cuda.dll"
    if not gpu.is_file():
        raise SystemExit("The CUDA backend was not built")
    with tempfile.TemporaryDirectory() as temp:
        extra = Path(temp) / "cuda"
        extra.mkdir()
        shutil.copy2(gpu, extra)
        for library in CUDA_RUNTIME:
            shutil.copy2(cuda_root / "bin" / library, extra)
        (extra / "NOTICE-NVIDIA-CUDA.txt").write_text(
            NVIDIA_NOTICE.format(version=CUDA_VERSION), encoding="utf-8"
        )
        _zip(extra, out / f"{name}-windows-x64-cuda.zip")


def pack_macos(build: Path, src: Path, out: Path, name: str) -> None:
    out.mkdir(parents=True, exist_ok=True)
    program = build / ENGINE_PROGRAM
    if not program.is_file():
        raise SystemExit(f"{build} holds no {ENGINE_PROGRAM}")
    with tempfile.TemporaryDirectory() as temp:
        stage = Path(temp) / "engine"
        stage.mkdir()
        shutil.copy2(program, stage)
        (stage / ENGINE_PROGRAM).chmod(0o755)
        _licenses(src, stage)
        target = out / f"{name}-macos-arm64.tar.gz"
        with tarfile.open(target, "w:gz", compresslevel=9) as bundle:
            for path in sorted(stage.iterdir()):
                bundle.add(path, path.name)
        print(f"{target.name}: {target.stat().st_size / 1024**2:.1f} MB", flush=True)


def sums(folder: Path) -> None:
    rows = []
    for path in sorted(folder.iterdir()):
        if path.is_file() and path.suffix in (".zip", ".gz"):
            rows.append({"name": path.name, "bytes": path.stat().st_size, "sha256": _sha256(path)})
    (folder / "SHA256SUMS").write_text(
        "".join(f"{row['sha256']}  {row['name']}\n" for row in rows), encoding="utf-8"
    )
    (folder / "packages.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(rows, indent=2))


def main(argv: list[str]) -> None:
    command, *args = argv or ["help"]
    paths = [Path(arg) for arg in args]
    if command == "cuda" and len(args) == 1:
        cuda(paths[0])
    elif command == "pack-windows-engine" and len(args) == 5:
        pack_windows_engine(*paths[:4], args[4])
    elif command == "pack-windows-cuda" and len(args) == 4:
        pack_windows_cuda(*paths[:3], args[3])
    elif command == "pack-macos" and len(args) == 4:
        pack_macos(*paths[:3], args[3])
    elif command == "sums" and len(args) == 1:
        sums(paths[0])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
