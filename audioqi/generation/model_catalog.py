"""Checkpoint and platform metadata. Queries never download weights or execute model code."""

from __future__ import annotations

import fnmatch
import platform
import threading
import time
import tomllib
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import requests

SOURCES: dict[str, dict[str, Any]] = {
    "acestep_local": {
        "variants": ["installed"],
        "default": "installed",
        "hardware": "CPU, Vulkan, CUDA or Apple Metal",
    },
    "heartmula": {
        "variants": ["3B"],
        "default": "3B",
        "hardware": "NVIDIA GPU; sequential model/codec loading reduces memory",
    },
    "stable_audio3": {
        "variants": [
            "medium",
            "small-music",
            "small-sfx",
            "medium-base",
            "small-music-base",
            "small-sfx-base",
        ],
        "default": "small-music",
        "hardware": "Small: CPU or GPU, 120 s. Medium: CUDA GPU, 380 s.",
    },
    "yue2": {
        "variants": ["3B"],
        "default": "3B",
        "hardware": "NVIDIA GPU, about 24 GB VRAM; low-memory mode available",
    },
    "minimax3": {
        "variants": ["music3"],
        "default": "music3",
        "hardware": "NVIDIA GPU, about 22 GB with CPU offload; layer offload for smaller GPUs",
    },
    "diffrhythm": {
        "variants": ["95", "285"],
        "default": "95",
        "hardware": "NVIDIA GPU recommended; eSpeak NG required",
    },
    "magenta_rt2": {
        "variants": ["mrt2_small", "mrt2_base"],
        "default": "mrt2_small",
        "hardware": (
            "Apple Silicon for live use; Linux NVIDIA/JAX for offline or experimental streaming"
        ),
    },
    "mega53": {
        "variants": ["mega53"],
        "default": "mega53",
        "hardware": "16 GB GPU memory recommended; 53 output tracks need substantial disk space",
    },
    "sam-audio": {
        "variants": ["small", "base", "large"],
        "default": "small",
        "hardware": "CUDA GPU recommended. Hugging Face checkpoint access required.",
    },
}
_CACHE: dict[str, tuple[float, dict]] = {}
_LOCK = threading.Lock()


def mega_review(revision: str) -> dict:
    url = (
        f"https://raw.githubusercontent.com/openmirlab/bs-roformer-infer/{revision}/"
        "src/bs_roformer/config/checkpoints.toml"
    )
    result = {
        "repo": "openmirlab/bs-roformer-infer",
        "kind": "registry",
        "url": url,
        "revision": revision,
        "bytes": None,
        "gated": False,
        "license": "See checkpoint publisher terms",
        "error": None,
    }
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        model = tomllib.loads(response.text)["models"][
            "roformer-model-bs-roformer-mvsep-mega-53-stems"
        ]
        result.update(
            bytes=sum(a["size"] for a in model["artifacts"]),
            artifacts=model["artifacts"],
            license=model.get("license"),
        )
    except (requests.RequestException, ValueError, KeyError, TypeError):
        result["error"] = "Checkpoint registry unavailable. Retry review when online."
    return result


def support(key: str, system: str | None = None) -> dict:
    system = system or platform.system()
    if key == "magenta_rt2" and system == "Windows":
        from audioqi.generation import wsl_runtime

        distro = wsl_runtime.distribution()
        if distro:
            return {
                "supported": True,
                "reason": (
                    f"Uses the existing {distro} WSL2 distribution for the NVIDIA GPU worker."
                ),
            }
        return {
            "supported": False,
            "reason": (
                "Magenta requires Apple Silicon or Linux with NVIDIA CUDA. "
                "Native Windows JAX has no NVIDIA GPU backend; run this engine in a "
                "Linux/WSL installation."
            ),
        }
    return {"supported": True, "reason": ""}


def repositories(key: str, variant: str) -> list[str]:
    if variant not in SOURCES[key]["variants"]:
        raise ValueError("Unknown checkpoint selection.")
    if key == "acestep_local":
        return ["Serveurperso/ACE-Step-1.5-GGUF"]
    if key == "heartmula":
        return [
            "HeartMuLa/HeartMuLaGen",
            "HeartMuLa/HeartMuLa-oss-3B-happy-new-year",
            "HeartMuLa/HeartCodec-oss-20260123",
        ]
    if key == "stable_audio3":
        return [f"stabilityai/stable-audio-3-{variant}"]
    if key == "yue2":
        return ["m-a-p/YuE2-3B", "m-a-p/YuE2-Vae"]
    if key == "minimax3":
        return ["MiniMaxAI/MiniMax-Music3"]
    if key == "diffrhythm":
        return [
            "ASLP-lab/DiffRhythm-1_2" + ("-full" if variant == "285" else ""),
            "ASLP-lab/DiffRhythm-vae",
            "OpenMuQ/MuQ-MuLan-large",
            "OpenMuQ/MuQ-large-msd-iter",
            "xlm-roberta-base",
        ]
    if key == "magenta_rt2":
        return ["google/magenta-realtime-2"]
    if key == "sam-audio":
        return [f"facebook/sam-audio-{variant}"]
    return []  # Mega's registry resolves its checksum-verified assets.


def hub_metadata(repo: str, *, refresh: bool = False) -> dict:
    with _LOCK:
        cached = _CACHE.get(repo)
    if cached and not refresh and time.monotonic() - cached[0] < 21600:
        return dict(cached[1])
    headers = {}
    try:
        from huggingface_hub import get_token

        token = get_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
    except ImportError:
        pass
    result = {
        "repo": repo,
        "url": f"https://huggingface.co/{repo}",
        "revision": None,
        "bytes": None,
        "gated": False,
        "license": None,
        "error": None,
    }
    try:
        response = requests.get(
            f"https://huggingface.co/api/models/{repo}",
            params={"blobs": "true"},
            headers=headers,
            timeout=10,
        )
        response.raise_for_status()
        body = response.json()
        files = body.get("siblings", [])
        result.update(
            revision=body.get("sha"),
            gated=bool(body.get("gated")),
            license=(body.get("cardData") or {}).get("license"),
            bytes=sum(int(f.get("size") or 0) for f in files) if files else None,
            files=[{"name": f["rfilename"], "bytes": int(f.get("size") or 0)} for f in files],
        )
        if result["gated"] and files:
            candidate = next(
                (f["rfilename"] for f in files if f["rfilename"].endswith("config.json")),
                files[0]["rfilename"],
            )
            access = requests.head(
                f"https://huggingface.co/{repo}/resolve/{body['sha']}/{candidate}",
                headers=headers,
                timeout=10,
                allow_redirects=False,
            )
            if access.status_code in (401, 403):
                result["error"] = (
                    "Checkpoint access denied. Accept the publisher terms and sign in "
                    "locally, then review again."
                )
    except (requests.RequestException, ValueError, TypeError):
        result["error"] = (
            "Metadata unavailable. Retry the review when online; checkpoint access may be required."
        )
    with _LOCK:
        _CACHE[repo] = (time.monotonic(), result)
    return dict(result)


def checkpoint_review(key: str, variant: str | None = None, *, refresh: bool = False) -> dict:
    item = SOURCES[key]
    variant = variant or item["default"]
    repos = repositories(key, variant)
    with ThreadPoolExecutor(max_workers=4) as pool:
        models = list(pool.map(lambda repo: hub_metadata(repo, refresh=refresh), repos))
    patterns = None
    if key == "acestep_local":
        from audioqi.generation import engine, setup

        patterns = sorted(
            set(setup.MODELS) | {name for names in engine.list_models().values() for name in names}
        )
    elif key == "magenta_rt2":
        patterns = ["resources/**", f"checkpoints/{variant}.safetensors", "LICENSE", "README.md"]
    elif key == "minimax3":
        patterns = [
            "modular_model_index.json",
            "condition_encoder/**",
            "language_model/**",
            "rvq_depth_decoder/**",
            "scheduler/**",
            "tokenizer/**",
            "transformer/**",
            "vocoder/**",
            "LICENSE",
            "README.md",
        ]
    if patterns:
        for model in models:
            model["patterns"] = patterns
            if model.get("files"):
                model["bytes"] = sum(
                    item["bytes"]
                    for item in model["files"]
                    if any(fnmatch.fnmatchcase(item["name"], pattern) for pattern in patterns)
                )
    for model in models:
        model.pop("files", None)
    sizes = [m["bytes"] for m in models]
    return {
        "variant": variant,
        "variants": item["variants"],
        "hardware": item["hardware"],
        **support(key),
        "checkpoints": models,
        "download_bytes": sum(sizes) if sizes and all(n is not None for n in sizes) else None,
        "note": (
            "Dependencies add disk space. Checkpoint terms and access "
            "are set by each linked publisher. No update is applied "
            "automatically."
        ),
    }
