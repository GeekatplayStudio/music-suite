"""Music Suite keeps its downloads and caches inside its own folder (audioqi/portable.py)."""

from __future__ import annotations

from pathlib import Path

import pytest

from audioqi import portable

_KEYS = ("TORCH_HOME", "HF_HUB_CACHE", "MPLCONFIGDIR", "XDG_CACHE_HOME", "HF_HOME")


@pytest.fixture
def clean_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    for key in _KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("AUDIOQI_DATA_DIR", str(tmp_path / "data"))
    return tmp_path


def test_caches_go_inside_the_data_folder(clean_env: Path) -> None:
    values = portable.cache_env(home=clean_env / "home")
    cache = (clean_env / "data" / "cache").resolve()
    assert values["TORCH_HOME"] == str(cache / "torch")
    assert values["HF_HUB_CACHE"] == str(cache / "huggingface" / "hub")
    assert values["MPLCONFIGDIR"] == str(cache / "matplotlib")
    # HF_HOME would also move the user's Hugging Face login, so it is never set.
    assert "HF_HOME" not in values


def test_models_already_in_the_default_place_are_not_downloaded_again(clean_env: Path) -> None:
    home = clean_env / "home"
    (home / ".cache" / "torch" / "hub" / "checkpoints").mkdir(parents=True)
    (home / ".cache" / "huggingface" / "hub" / "models--x").mkdir(parents=True)
    values = portable.cache_env(home=home)
    assert "TORCH_HOME" not in values and "HF_HUB_CACHE" not in values
    assert "XDG_CACHE_HOME" not in values  # It would move both defaults.


def test_what_the_user_set_is_kept(clean_env: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TORCH_HOME", "D:/my-torch")
    assert "TORCH_HOME" not in portable.cache_env(home=clean_env / "home")
