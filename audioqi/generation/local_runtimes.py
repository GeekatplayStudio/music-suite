"""Optional generation runtimes. Only an explicit install starts a download."""

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from audioqi.editor.projects import EditorError
from audioqi.generation import model_catalog, settings

REPOS = {
    "acestep_local": "ServeurpersoCom/acestep.cpp",
    "heartmula": "HeartMuLa/heartlib",
    "stable_audio3": "Stability-AI/stable-audio-3",
    "diffrhythm": "ASLP-lab/DiffRhythm",
    "magenta_rt2": "magenta/magenta-realtime",
    "yue2": "multimodal-art-projection/YuE",
    "minimax3": "huggingface/diffusers",
    "mega53": "openmirlab/bs-roformer-infer",
    "sam-audio": "facebookresearch/sam-audio",
}
APPLE = sys.platform == "darwin" and platform.machine().lower() == "arm64"
_LOCK = threading.Lock()
_jobs: dict[str, str] = {}
_reviews: dict[str, dict] = {}
_checks: dict[str, tuple[float, dict]] = {}

# Each upstream pins a different Torch generation. Resolve the matching CUDA wheel
# before installing its dependencies; constraints prevent a CPU wheel replacing it.
TORCH_PROFILES = {
    "stable_audio3": ("2.7.1", "cu126", 560),
    "heartmula": ("2.10.0", "cu128", 570),
    "yue2": ("2.10.0", "cu128", 570),
    "diffrhythm": ("2.6.0", "cu126", 560),
}
MODULES = {
    "heartmula": "heartlib",
    "stable_audio3": "stable_audio_3",
    "yue2": "yue2",
    "minimax3": "diffusers",
    "magenta_rt2": "magenta_rt",
    "diffrhythm": "phonemizer",
    "mega53": "bs_roformer",
    "sam-audio": "sam_audio",
}


def manifest(key: str) -> dict:
    folder = active(key)
    if folder:
        try:
            return json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
    return {}


def environment(key: str, *, offline: bool = False) -> dict[str, str]:
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    # Bound native CPU pools during checkpoint conversion and decoding. On large
    # Windows hosts the default pool can make small per-layer casts very slow.
    env.setdefault("OMP_NUM_THREADS", "4")
    env.setdefault("MKL_NUM_THREADS", "4")
    if offline:
        env.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")
    if key == "diffrhythm" and os.name == "nt":
        from audioqi.editor import projects

        roots = [
            projects.SETTINGS.data_dir / "tools/espeak/portable/eSpeak NG",
            Path(os.getenv("PROGRAMFILES", "C:/Program Files")) / "eSpeak NG",
            Path(os.getenv("PROGRAMFILES(X86)", "C:/Program Files (x86)")) / "eSpeak NG",
        ]
        library = next(
            (root / "libespeak-ng.dll" for root in roots if (root / "libespeak-ng.dll").is_file()),
            None,
        )
        if library:
            env["PHONEMIZER_ESPEAK_LIBRARY"] = str(library.resolve())
            env["ESPEAK_DATA_PATH"] = str(library.parent / "espeak-ng-data")
    return env


def review(key: str, variant: str | None = None, refresh_runtime: bool = False) -> dict:
    home(key)
    try:
        plan = {
            "id": key,
            "revision": latest(key),
            **model_catalog.checkpoint_review(key, variant, refresh=True),
            "created": time.monotonic(),
        }
    except ValueError as exc:
        raise EditorError(str(exc), 422) from exc
    except requests.RequestException as exc:
        raise EditorError(
            "The model source is unavailable. Retry the review when online.", 503
        ) from exc
    plan["refresh_runtime"] = refresh_runtime or not active(key)
    if key == "mega53":
        checkpoint = model_catalog.mega_review(plan["revision"])
        plan.update(checkpoints=[checkpoint], download_bytes=checkpoint["bytes"])
    plan["review_id"] = uuid.uuid4().hex
    with _LOCK:
        for token, item in list(_reviews.items()):
            if time.monotonic() - item["created"] > 1800:
                _reviews.pop(token, None)
        _reviews[plan["review_id"]] = plan
    return {k: v for k, v in plan.items() if k != "created"}


def _upstream_state(key: str, folder: Path | None, revision: str | None) -> dict:
    with _LOCK:
        cached = _checks.get(key)
    if cached and time.monotonic() - cached[0] < 300:
        return dict(cached[1])
    state = {"latest": None, "dependency_updates": [], "checkpoint_updates": [], "check_error": ""}
    try:
        state["latest"] = latest(key)
        installed = manifest(key)
        if key == "acestep_local" and not installed.get("checkpoints"):
            from audioqi.generation import setup

            installed["checkpoints"] = [
                {
                    "repo": "Serveurperso/ACE-Step-1.5-GGUF",
                    "revision": setup.MODEL_BASE.split("/resolve/")[1].split("/")[0],
                }
            ]
        for checkpoint in installed.get("checkpoints", []):
            upstream = (
                model_catalog.mega_review(state["latest"])
                if checkpoint.get("kind") == "registry"
                else model_catalog.hub_metadata(checkpoint["repo"], refresh=True)
            )
            if upstream.get("revision") and checkpoint.get("revision") != upstream["revision"]:
                state["checkpoint_updates"].append(upstream)
        if folder and key != "acestep_local":
            command = [
                str(executable(folder, "python")),
                "-m",
                "pip",
                "list",
                "--outdated",
                "--format=json",
                "--disable-pip-version-check",
            ]
            env = environment(key)
            if (folder / "wsl.json").is_file():
                from audioqi.generation import wsl_runtime

                command = wsl_runtime.command(folder, *command)
                env = wsl_runtime.process_environment(env)
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=45,
                check=True,
                env=env,
            )
            state["dependency_updates"] = json.loads(result.stdout)
    except (requests.RequestException, KeyError, ValueError, OSError, subprocess.SubprocessError):
        state["check_error"] = (
            "Some update checks are unavailable. Your installed version is unchanged."
        )
    with _LOCK:
        _checks[key] = (time.monotonic(), state)
    return dict(state)


def home(key: str) -> Path:
    if key not in REPOS:
        raise EditorError("Unknown local engine.", 404)
    return settings.root() / "runtimes" / key


def active(key: str) -> Path | None:
    marker = home(key) / "active"
    if marker.is_file():
        name = marker.read_text().strip()
        if re.fullmatch(r"build-[\w-]+", name):
            folder = marker.parent / name
            if (folder / "wsl.json").is_file() and (folder / "env/pyvenv.cfg").is_file():
                return folder
            if key == "acestep_local" and (folder / "revision").is_file():
                from audioqi.generation.engine import binary_path

                if binary_path(folder / "source"):
                    return folder
            if executable(folder, "python").is_file():
                return folder
    return None


def executable(folder: Path, name: str) -> Path:
    if os.name == "nt":
        return folder / "env" / "Scripts" / (name + ".exe")
    return folder / "env" / "bin" / name


def latest(key: str) -> str:
    response = requests.get(f"https://api.github.com/repos/{REPOS[key]}/commits/HEAD", timeout=5)
    response.raise_for_status()
    sha = response.json()["sha"]
    if not re.fullmatch("[0-9a-f]{40}", sha):
        raise ValueError("Invalid upstream revision.")
    return sha


def inventory(check: bool = False) -> list[dict]:
    rows = []
    for key, repo in REPOS.items():
        folder = active(key)
        revision = (
            (folder / "revision").read_text().strip()
            if folder and (folder / "revision").is_file()
            else None
        )
        if key == "acestep_local":
            from audioqi.generation import engine, setup

            base = settings.engine_dir()
            if base != settings.default_engine_dir() or not engine.binary_path(base):
                continue
            revision = revision or setup._git(["rev-parse", "HEAD"], base)
            if not revision:
                continue
        with _LOCK:
            message = _jobs.get(key, "")
        installed = manifest(key)
        rows.append(
            dict(
                id=key,
                repo=repo,
                revision=revision,
                latest=None,
                message=message,
                variant=installed.get("variant") or model_catalog.SOURCES[key]["default"],
                variants=model_catalog.SOURCES[key]["variants"],
                hardware=model_catalog.SOURCES[key]["hardware"],
                kind="stem" if key in ("mega53", "sam-audio") else "generator",
                **model_catalog.support(key),
                manifest=installed,
            )
        )
    if check:

        def inspect(row):
            if row["revision"]:
                row.update(_upstream_state(row["id"], active(row["id"]), row["revision"]))
            return row

        with ThreadPoolExecutor(max_workers=4) as pool:
            rows = list(pool.map(inspect, rows))
    return rows


def _install(key: str, requested: str | None, plan: dict | None = None) -> None:
    folder = None
    try:
        supported = model_catalog.support(key)
        if not supported["supported"]:
            raise RuntimeError(supported["reason"])
        if plan and any(
            c.get("error") or not c.get("revision") for c in plan.get("checkpoints", [])
        ):
            raise RuntimeError(
                "Checkpoint metadata or access is unavailable. Review the download "
                "again before setup."
            )
        sha = latest(key)
        if requested and requested != sha:
            raise RuntimeError("The upstream version changed. Check for updates again.")
        previous = manifest(key)
        pending_marker = home(key) / "pending"
        if plan and pending_marker.is_file():
            name = pending_marker.read_text().strip()
            if re.fullmatch(r"build-[\w-]+", name):
                candidate = home(key) / name
                try:
                    ready = json.loads(
                        (candidate / "environment-ready.json").read_text(encoding="utf-8")
                    )
                except (OSError, ValueError):
                    ready = {}
                if ready.get("revision") == sha and (
                    executable(candidate, "python").is_file()
                    or (
                        (candidate / "wsl.json").is_file()
                        and (candidate / "env/pyvenv.cfg").is_file()
                    )
                ):
                    _refresh_checkpoints(key, plan, candidate, ready)
                    pending_marker.unlink(missing_ok=True)
                    message = "Installed."
                    return
        if (
            plan
            and not plan.get("refresh_runtime", True)
            and previous.get("verified")
            and previous.get("revision") == sha
        ):
            _refresh_checkpoints(key, plan)
            message = "Installed."
            return
        root = home(key)
        root.mkdir(parents=True, exist_ok=True)
        if (
            plan
            and plan.get("download_bytes")
            and shutil.disk_usage(root).free < plan["download_bytes"] + 6 * 1024**3
        ):
            raise RuntimeError(
                "Not enough free disk space for the reviewed checkpoints and runtime dependencies."
            )
        folder = Path(tempfile.mkdtemp(prefix="build-", dir=root))
        source = folder / "source"
        python = str(executable(folder, "python"))

        def run(*args):
            original_args = args
            use_wsl = (folder / "wsl.json").is_file() and args[0] == python
            uv = shutil.which("uv")
            if use_wsl:
                from audioqi.generation import wsl_runtime

                args = tuple(wsl_runtime.command(folder, *args))
            elif uv and len(args) > 3 and args[1:4] == ("-m", "pip", "install"):
                args = (
                    uv,
                    "pip",
                    "install",
                    "--python",
                    args[0],
                    "--cache-dir",
                    str(settings.root() / "cache/uv"),
                    "--link-mode",
                    "hardlink",
                    *args[4:],
                )
            with (root / "install.log").open("ab") as log:
                options = dict(
                    cwd=folder,
                    stdout=log,
                    stderr=log,
                    stdin=subprocess.DEVNULL,
                    timeout=7200,
                    check=True,
                    env=(
                        wsl_runtime.process_environment(environment(key))
                        if use_wsl
                        else environment(key)
                    ),
                )
                try:
                    subprocess.run(args, **options)
                except subprocess.CalledProcessError:
                    if args == original_args:
                        raise
                    log.write(
                        b"\nFast package installation failed; retrying with pip and the same "
                        b"CUDA constraints.\n"
                    )
                    fallback = (
                        wsl_runtime.command(folder, *original_args, use_uv=False)
                        if use_wsl
                        else original_args
                    )
                    subprocess.run(fallback, **options)

        def capture(*args):
            env = environment(key)
            if (folder / "wsl.json").is_file() and args[0] == python:
                from audioqi.generation import wsl_runtime

                args = wsl_runtime.command(folder, *args)
                env = wsl_runtime.process_environment(env)
            result = subprocess.run(
                args,
                cwd=source,
                capture_output=True,
                text=True,
                timeout=120,
                check=True,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            return result.stdout.strip()

        if key != "acestep_local":
            if key == "magenta_rt2" and os.name == "nt":
                from audioqi.generation import wsl_runtime

                with (root / "install.log").open("ab") as log:
                    wsl_runtime.prepare(folder, log)
            else:
                run(sys.executable, "-m", "venv", str(folder / "env"))
        run("git", "init", str(source))
        run(
            "git",
            "-C",
            str(source),
            "remote",
            "add",
            "origin",
            f"https://github.com/{REPOS[key]}.git",
        )
        run(
            "git",
            "-C",
            str(source),
            "fetch",
            "--depth=1",
            "origin",
            sha,
        )
        run("git", "-C", str(source), "checkout", "--detach", "FETCH_HEAD")
        if key in ("magenta_rt2", "acestep_local"):
            run("git", "-C", str(source), "submodule", "update", "--init", "--recursive")
        extras = {"magenta_rt2": "[mlx]" if APPLE else "[jax]", "yue2": "[cuda]"}
        if key not in ("acestep_local", "magenta_rt2"):
            from audioqi import addons

            card = addons.gpu()
            version, channel, driver = TORCH_PROFILES.get(key, ("2.11.0", "cu130", 580))
            args = [f"torch=={version}", f"torchaudio=={version}"]
            if key in ("heartmula", "sam-audio"):
                args.append("torchvision")
            if card and card.get("vendor") == "nvidia":
                if int(str(card.get("driver", "0")).split(".")[0]) < driver:
                    raise RuntimeError(
                        f"This engine needs an NVIDIA driver at least {driver} for its "
                        f"{channel} wheels."
                    )
                args += ["--index-url", f"https://download.pytorch.org/whl/{channel}"]
            elif key in ("minimax3", "yue2"):
                raise RuntimeError("This engine requires an NVIDIA CUDA GPU.")
            run(python, "-m", "pip", "install", *args)
            frozen = capture(python, "-m", "pip", "freeze").splitlines()
            protected = [
                line
                for line in frozen
                if line.split("==")[0].lower() in ("torch", "torchaudio", "torchvision")
            ]
            (folder / "constraints.txt").write_text("\n".join(protected), encoding="utf-8")
        constraints = (
            ["-c", str(folder / "constraints.txt")]
            if (folder / "constraints.txt").is_file()
            else []
        )
        if key == "acestep_local":
            from audioqi.generation import setup

            setup._ensure_tools(lambda *args: None)
            setup._build(source, lambda *args: None, force=True)
        elif key == "diffrhythm":
            run(
                python, "-m", "pip", "install", *constraints, "-r", str(source / "requirements.txt")
            )
        else:
            run(python, "-m", "pip", "install", *constraints, str(source) + extras.get(key, ""))
        if key == "minimax3":
            run(
                python,
                "-m",
                "pip",
                "install",
                *constraints,
                "transformers",
                "accelerate",
                "soundfile",
            )
        if key == "stable_audio3":
            run(
                python,
                "-m",
                "pip",
                "install",
                *constraints,
                "sentencepiece",
                "protobuf",
                "tiktoken",
            )
        if key == "heartmula":
            run(python, "-m", "pip", "install", *constraints, "hf_xet")
        if key == "magenta_rt2" and not APPLE:
            run(python, "-m", "pip", "install", "jax[cuda13]")
        if key != "acestep_local":
            run(python, "-m", "pip", "check")
            run(
                python,
                "-c",
                "import importlib,sys; sys.path.insert(0,sys.argv[2]); "
                "importlib.import_module(sys.argv[1])",
                MODULES[key],
                str(source),
            )
            if key == "magenta_rt2" and not APPLE:
                run(
                    python,
                    "-c",
                    (
                        "import jax; devices=jax.devices(); print(devices); "
                        "assert any(d.platform=='gpu' for d in devices), 'JAX cannot use the "
                        "NVIDIA GPU'"
                    ),
                )
            if key not in ("magenta_rt2",) and card and card.get("vendor") == "nvidia":
                run(
                    python,
                    "-c",
                    (
                        "import torch; assert torch.cuda.is_available(), 'The installed "
                        "Torch cannot use CUDA'; "
                        "x=torch.ones(1,device='cuda'); print(torch.cuda.get_device_name(0))"
                    ),
                )
            if key == "diffrhythm":
                run(
                    python,
                    "-c",
                    (
                        "from phonemizer.backend import EspeakBackend; "
                        "assert EspeakBackend.is_available(), 'Install eSpeak NG and expose "
                        "its shared library to phonemizer'"
                    ),
                )
        previous = manifest(key)
        checkpoints = {item["repo"]: item for item in previous.get("checkpoints", [])}
        checkpoints.update({item["repo"]: item for item in (plan or {}).get("checkpoints", [])})
        variants = set(previous.get("installed_variants", []))
        if plan:
            variants.add(plan["variant"])
        installed = {
            "revision": sha,
            "variant": (plan or {}).get("variant") or previous.get("variant"),
            "installed_variants": sorted(variants),
            "checkpoints": list(checkpoints.values()),
            "verified": True,
        }
        if key != "acestep_local":
            installed["dependencies"] = json.loads(
                capture(python, "-m", "pip", "list", "--format=json")
            )
            reusable = {
                **installed,
                "installed_variants": previous.get("installed_variants", []),
                "checkpoints": previous.get("checkpoints", []),
                "variant": previous.get("variant"),
            }
            (folder / "environment-ready.json").write_text(json.dumps(reusable), encoding="utf-8")
        if plan and any(c.get("error") or not c.get("revision") for c in plan["checkpoints"]):
            raise RuntimeError(
                "Checkpoint metadata was unavailable. Review the download again "
                "before installing weights."
            )
        if plan:
            (folder / "download-plan.json").write_text(json.dumps(plan), encoding="utf-8")
            with _LOCK:
                _jobs[key] = "Downloading reviewed checkpoints…"
            run(
                sys.executable if key == "acestep_local" else python,
                "-I",
                "-X",
                "utf8",
                str(Path(__file__).with_name("model_setup.py").resolve()),
                str(folder),
                str(settings.root() / "checkpoints" / "hub"),
            )
        if key == "magenta_rt2" and (folder / "checkpoint-root.json").is_file():
            installed["checkpoint_root"] = json.loads(
                (folder / "checkpoint-root.json").read_text(encoding="utf-8")
            )["path"]
        elif key == "acestep_local" and plan:
            installed["checkpoint_root"] = str(folder / "checkpoints")
        (folder / "manifest.json").write_text(json.dumps(installed, indent=2), encoding="utf-8")
        (folder / "revision").write_text(sha)
        marker = root / "active.tmp"
        marker.write_text(folder.name)
        old_marker = (root / "active").read_text() if (root / "active").is_file() else None
        marker.replace(root / "active")
        try:
            if key in settings.DEFAULTS["providers"]:
                settings.update({"providers": {key: True}})
        except Exception:
            if old_marker is None:
                (root / "active").unlink(missing_ok=True)
            else:
                marker.write_text(old_marker)
                marker.replace(root / "active")
            raise
        folder = None
        with _LOCK:
            _checks.pop(key, None)
        message = "Installed."
    except Exception as exc:
        message = f"Setup failed. {exc} See {home(key) / 'install.log'}."
        if folder and (folder / "environment-ready.json").is_file():
            marker = home(key) / "pending.tmp"
            marker.write_text(folder.name)
            marker.replace(home(key) / "pending")
            folder = None
            message += " The verified environment is saved; retry resumes checkpoint setup."
    finally:
        if (
            folder
            and folder.resolve().is_relative_to(home(key).resolve())
            and folder.name.startswith("build-")
        ):
            shutil.rmtree(folder, ignore_errors=True)
        with _LOCK:
            _jobs[key] = message


def start(key: str, revision: str | None, review_id: str | None = None) -> dict:
    home(key)
    if revision is not None and not re.fullmatch("[0-9a-f]{40}", revision):
        raise EditorError("Invalid update revision.", 422)
    plan = None
    if review_id:
        with _LOCK:
            plan = _reviews.get(review_id)
        if not plan or plan["id"] != key or time.monotonic() - plan["created"] > 1800:
            raise EditorError("This download review expired. Review the model again.", 409)
        if revision != plan["revision"]:
            raise EditorError("The reviewed version does not match this request.", 422)
    supported = model_catalog.support(key)
    if not supported["supported"]:
        raise EditorError(supported["reason"], 409)
    with _LOCK:
        if _jobs.get(key) not in ("Installing…", "Downloading reviewed checkpoints…"):
            _jobs[key] = "Installing…"
            threading.Thread(target=_install, args=(key, revision, plan), daemon=True).start()
    return {"started": True}


def _refresh_checkpoints(
    key: str, plan: dict, candidate: Path | None = None, ready: dict | None = None
) -> None:
    """Stage new weights without copying a working multi-gigabyte Python environment."""
    from audioqi.editor import projects

    current = candidate or active(key)
    previous = ready or manifest(key)
    staged = Path(tempfile.mkdtemp(prefix="build-weights-", dir=home(key)))
    try:
        (staged / "download-plan.json").write_text(json.dumps(plan), encoding="utf-8")
        with _LOCK:
            _jobs[key] = "Downloading reviewed checkpoints…"
        with (home(key) / "install.log").open("ab") as log:
            command = [
                sys.executable if key == "acestep_local" else str(executable(current, "python")),
                "-I",
                "-X",
                "utf8",
                str(Path(__file__).with_name("model_setup.py").resolve()),
                str(staged),
                str(settings.root() / "checkpoints/hub"),
            ]
            env = environment(key)
            if (current / "wsl.json").is_file():
                from audioqi.generation import wsl_runtime

                command = wsl_runtime.command(current, *command)
                env = wsl_runtime.process_environment(env)
            subprocess.run(
                command,
                stdout=log,
                stderr=log,
                stdin=subprocess.DEVNULL,
                timeout=7200,
                check=True,
                env=env,
            )
        checkpoints = {item["repo"]: item for item in previous.get("checkpoints", [])}
        checkpoints.update({item["repo"]: item for item in plan.get("checkpoints", [])})
        updated = {
            **previous,
            "variant": plan["variant"],
            "checkpoints": list(checkpoints.values()),
            "installed_variants": sorted(
                set(previous.get("installed_variants", [])) | {plan["variant"]}
            ),
        }
        if key in ("heartmula", "mega53", "acestep_local"):
            updated["checkpoint_root"] = str(staged / "checkpoints")
        elif key == "magenta_rt2" and (staged / "checkpoint-root.json").is_file():
            updated["checkpoint_root"] = json.loads(
                (staged / "checkpoint-root.json").read_text(encoding="utf-8")
            )["path"]
        projects.write_json_atomic(current / "manifest.json", updated)
        try:
            if key in settings.DEFAULTS["providers"]:
                settings.update({"providers": {key: True}})
            if candidate:
                (current / "revision").write_text(plan["revision"])
                marker = home(key) / "active.tmp"
                marker.write_text(current.name)
                marker.replace(home(key) / "active")
        except Exception:
            projects.write_json_atomic(current / "manifest.json", previous)
            raise
        staged = None
        with _LOCK:
            _checks.pop(key, None)
    finally:
        if staged and staged.resolve().is_relative_to(home(key).resolve()):
            shutil.rmtree(staged, ignore_errors=True)
