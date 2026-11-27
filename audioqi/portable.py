"""Keep Music Suite inside its own folder.

Libraries keep downloads and caches in the user's profile by default (``~/.cache/torch``,
``~/.cache/huggingface``, ``~/.matplotlib``). Music Suite is meant to be portable, like
ComfyUI Portable: everything it adds lives in its folder, so deleting the folder removes it.
This points those caches into the data folder (``data/cache``) before any library reads them.

Two exceptions keep existing installs working without re-downloading gigabytes: a cache that
already holds models in the default place (from an earlier Music Suite or another program) is
left where it is, and anything the user set explicitly is never overridden.
"""

from __future__ import annotations

import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]


def data_dir() -> Path:
    """The same folder as ``audioqi.config``: ``AUDIOQI_DATA_DIR`` or ``<suite>/data``."""
    return Path(os.getenv("AUDIOQI_DATA_DIR", _ROOT / "data")).resolve()


def _has_content(path: Path) -> bool:
    try:
        return path.is_dir() and any(path.iterdir())
    except OSError:
        return False


def cache_env(home: Path | None = None) -> dict[str, str]:
    """The cache variables to set, given the user's home folder (for tests)."""
    home = home or Path.home()
    cache = data_dir() / "cache"
    wanted: dict[str, str] = {
        "MPLCONFIGDIR": str(cache / "matplotlib"),
        "XDG_CACHE_HOME": str(cache),
    }
    # Demucs downloads through PyTorch's hub; MuScriptor and others through Hugging Face.
    if not _has_content(home / ".cache" / "torch" / "hub"):
        wanted["TORCH_HOME"] = str(cache / "torch")
    if not _has_content(home / ".cache" / "huggingface" / "hub"):
        # The cache only: HF_HOME would also move the user's Hugging Face login token.
        wanted["HF_HUB_CACHE"] = str(cache / "huggingface" / "hub")
    if "XDG_CACHE_HOME" in os.environ or _has_content(home / ".cache" / "torch") or _has_content(
        home / ".cache" / "huggingface"
    ):
        # XDG_CACHE_HOME is the parent of both defaults on some systems; moving it would move
        # them too, so it is only set when neither already holds anything.
        wanted.pop("XDG_CACHE_HOME", None)
    return {key: value for key, value in wanted.items() if key not in os.environ}


def apply() -> dict[str, str]:
    """Set the cache variables for this process and the programs it starts."""
    values = cache_env()
    os.environ.update(values)
    return values
