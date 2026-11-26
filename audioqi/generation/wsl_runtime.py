"""Use an existing WSL2 distribution for engines without a native Windows GPU backend.

No distribution is installed or modified globally: uv, Python, packages and weights
are placed beneath the suite's data directory. Commands never pass through a shell.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path

import requests

from audioqi.editor.projects import EditorError
from audioqi.generation import settings


def distribution() -> str | None:
    if os.name != "nt":
        return None
    import winreg

    choices = []
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Lxss"
        ) as root:
            for index in range(winreg.QueryInfoKey(root)[0]):
                with winreg.OpenKey(root, winreg.EnumKey(root, index)) as key:
                    name = winreg.QueryValueEx(key, "DistributionName")[0]
                    version = winreg.QueryValueEx(key, "Version")[0]
                    if version == 2 and not name.lower().startswith(("docker", "rancher")):
                        choices.append(name)
    except OSError:
        return None
    requested = os.getenv("MUSIC_SUITE_WSL_DISTRO")
    if requested:
        return requested if requested in choices else None
    return next(
        (name for name in choices if name.lower().startswith("ubuntu")),
        choices[0] if choices else None,
    )


def linux_path(path) -> str:
    value = str(path)
    if value.startswith("/"):
        return value
    absolute = Path(path).resolve()
    drive = absolute.drive
    if not re.fullmatch(r"[A-Za-z]:", drive):
        raise EditorError(
            "WSL workers require the suite and project files on a local Windows drive.", 409
        )
    return f"/mnt/{drive[0].lower()}/" + absolute.as_posix()[3:]


def _prefix(distro):
    return ["wsl.exe", "--distribution", distro, "--exec"]


def _linux_uv(tools: Path) -> Path:
    executable = tools / "uv"
    if executable.is_file():
        return executable
    response = requests.get("https://api.github.com/repos/astral-sh/uv/releases/latest", timeout=15)
    response.raise_for_status()
    asset = next(
        item
        for item in response.json()["assets"]
        if item["name"] == "uv-x86_64-unknown-linux-gnu.tar.gz"
    )
    digest = asset.get("digest", "").removeprefix("sha256:")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise RuntimeError("The Python installer publisher did not provide a SHA-256 checksum.")
    tools.mkdir(parents=True, exist_ok=True)
    archive = tools / "uv.tar.gz"
    with requests.get(asset["browser_download_url"], stream=True, timeout=60) as download:
        download.raise_for_status()
        checksum = hashlib.sha256()
        with archive.open("wb") as stream:
            for chunk in download.iter_content(1024 * 1024):
                stream.write(chunk)
                checksum.update(chunk)
    if checksum.hexdigest() != digest:
        archive.unlink(missing_ok=True)
        raise RuntimeError("The Python installer checksum did not match its publisher.")
    with tarfile.open(archive, "r:gz") as package:
        member = next(
            item for item in package.getmembers() if item.isfile() and item.name.endswith("/uv")
        )
        with package.extractfile(member) as source, executable.open("wb") as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
    (tools / "uv-version.json").write_text(
        json.dumps({"sha256": digest, "url": asset["browser_download_url"]}), encoding="utf-8"
    )
    return executable


def prepare(folder: Path, log) -> None:
    distro = distribution()
    if not distro:
        raise EditorError("Configure a WSL2 Linux distribution to use Magenta on Windows.", 409)
    tools = settings.root() / "tools/linux"
    uv = _linux_uv(tools)
    prefix = _prefix(distro)

    def run(*args):
        subprocess.run(
            [*prefix, *args],
            stdout=log,
            stderr=log,
            stdin=subprocess.DEVNULL,
            timeout=1800,
            check=True,
        )

    run("chmod", "+x", linux_path(uv))
    python_home = tools / "python"
    run(
        linux_path(uv),
        "python",
        "install",
        "3.12",
        "--install-dir",
        linux_path(python_home),
        "--no-bin",
    )
    # uv resolves the exact managed interpreter; the user distribution's Python is untouched.
    run(
        "env",
        f"UV_PYTHON_INSTALL_DIR={linux_path(python_home)}",
        linux_path(uv),
        "venv",
        "--python",
        "3.12",
        "--managed-python",
        "--seed",
        linux_path(folder / "env"),
    )
    (folder / "wsl.json").write_text(
        json.dumps({"distribution": distro, "uv": linux_path(uv)}), encoding="utf-8"
    )


def command(folder: Path, *args, offline: bool = False, use_uv: bool = True) -> list[str]:
    configuration = json.loads((folder / "wsl.json").read_text(encoding="utf-8"))
    values = [str(arg) for arg in args]
    program = values.pop(0)
    if Path(program).name.lower() in ("python.exe", "python"):
        program = linux_path(folder / "env/bin/python")
    values = [
        linux_path(value) if re.match(r"^[A-Za-z]:[\\/]", value) else value for value in values
    ]
    if use_uv and values[:3] == ["-m", "pip", "install"]:
        values = [
            "pip",
            "install",
            "--python",
            program,
            "--cache-dir",
            linux_path(settings.root() / "cache/uv-linux"),
            "--link-mode",
            "hardlink",
            *values[3:],
        ]
        program = configuration["uv"]
    env = ["PYTHONIOENCODING=utf-8", "XLA_PYTHON_CLIENT_PREALLOCATE=false"]
    if offline:
        env += ["HF_HUB_OFFLINE=1", "TRANSFORMERS_OFFLINE=1"]
    return [*_prefix(configuration["distribution"]), "env", *env, program, *values]


def paths(job: dict) -> dict:
    return {
        key: linux_path(value)
        if key in {"source", "runtime", "cache", "adapters", "checkpoint_root", "pid_file"}
        and value
        else value
        for key, value in job.items()
    }


def process_environment(env: dict) -> dict:
    result = dict(env)
    try:
        from huggingface_hub import get_token

        token = get_token()
        if token:
            result["HF_TOKEN"] = token
            result["WSLENV"] = ":".join(filter(None, [result.get("WSLENV", ""), "HF_TOKEN"]))
    except ImportError:
        pass
    return result


def terminate(folder: Path, work: Path) -> None:
    if work is None:
        return
    pid_file = work / "worker.pid"
    try:
        identity = json.loads(pid_file.read_text(encoding="utf-8"))
        request_file = work / ("setup.json" if (work / "setup.json").is_file() else "request.json")
        request = json.loads(request_file.read_text(encoding="utf-8"))
        if identity.get("nonce") != request.get("nonce") or type(identity.get("pid")) is not int:
            return
        pid = identity["pid"]
        if pid < 2:
            return
    except (OSError, ValueError):
        return
    script = (
        "import os,signal,sys,time;from pathlib import Path;"
        "pid=int(sys.argv[1]);p=Path('/proc')/str(pid)/'cmdline';"
        "args=p.read_bytes().split(b'\\0') if p.exists() else [];"
        "owned=sys.argv[2].encode() in args;"
        "os.kill(pid,signal.SIGKILL) if owned else None"
    )
    subprocess.run(
        command(folder, str(folder / "env/bin/python"), "-c", script, str(pid), linux_path(work)),
        timeout=15,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
