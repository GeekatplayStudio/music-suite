"""Optional engines and models (audioqi.addons) and the finer stem splits."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

import apps.api.main as api_main
from audioqi import addons
from audioqi.editor import engines, jobs, projects, separation
from audioqi.editor.projects import EditorError, ParamError

SR = 48_000


# --------------------------------------------------------------------------- PyTorch choice


def test_cuda_build_follows_the_driver() -> None:
    assert addons.cuda_build("610.88") == "cu130"
    assert addons.cuda_build("580.10") == "cu130"
    assert addons.cuda_build("566.03") == "cu126"
    assert addons.cuda_build("531.00") is None
    assert addons.cuda_build(None) is None


def test_torch_plan_per_platform() -> None:
    nvidia = {"vendor": "nvidia", "name": "RTX", "driver": "610.88"}
    win = addons.torch_plan(nvidia, "win32")
    assert win["index"] == "https://download.pytorch.org/whl/cu130" and win["device"] == "cuda"
    old = addons.torch_plan({**nvidia, "driver": "500.1"}, "win32")
    assert old["index"] is None and old["device"] == "cpu" and "driver" in old["note"]
    assert addons.torch_plan(nvidia, "linux")["index"] is None  # PyPI's Linux builds carry CUDA.
    assert addons.torch_plan({"vendor": "apple"}, "darwin")["device"] == "mps"
    assert addons.torch_plan({}, "win32")["device"] == "cpu"


def test_torch_comes_only_from_the_cuda_index() -> None:
    """With PyPI also allowed, pip prefers PyPI's newer CPU-only build on Windows."""
    args = addons.torch_args({"index": "https://download.pytorch.org/whl/cu130"})
    assert args == ["torch", "torchaudio", "--index-url", "https://download.pytorch.org/whl/cu130"]
    assert "--extra-index-url" not in args
    assert addons.torch_args({"index": None}) == ["torch", "torchaudio"]


def test_every_install_pins_what_is_installed(tmp_path: Path) -> None:
    constraints = tmp_path / "c.txt"
    command = addons.pip_command(["demucs"], constraints)
    assert command[command.index("-c") + 1] == str(constraints)
    assert command[-1] == "demucs"


def test_progress_messages_from_pip() -> None:
    assert addons._describe("Collecting demucs>=4.0.1") == "Resolving demucs>=4.0.1"
    assert (
        addons._describe("Downloading torch-2.14.1+cu130-cp312-cp312-win_amd64.whl (2.6 GB)")
        == "Downloading torch (2.6 GB)"
    )
    assert addons._describe("Requirement already satisfied: numpy") is None


# --------------------------------------------------------------------------- routes


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "d"))
    monkeypatch.setattr(
        addons, "gpu", lambda: {"vendor": "nvidia", "name": "Test GPU", "driver": "610.1"}
    )
    with TestClient(api_main.app) as test_client:
        yield test_client


def test_overview_lists_packs_models_and_gpu(client: TestClient) -> None:
    body = client.get("/addons").json()
    assert body["gpu"]["name"] == "Test GPU"
    assert [pack["id"] for pack in body["packs"]] == ["stems"]
    assert {model["file"] for model in body["models"]} == addons.MODEL_FILES
    assert body["install"]["running"] is False


def test_changes_need_the_confirmation_header(client: TestClient, monkeypatch) -> None:
    started: list[Any] = []
    monkeypatch.setattr(
        addons, "start_install", lambda pack, models: started.append((pack, models)) or {}
    )
    assert client.post("/addons/packs/stems/install", json={}).status_code == 400
    assert client.delete("/addons/models").status_code == 400
    headers = {"X-Music-Suite-Action": "addons"}
    assert (
        client.post("/addons/packs/stems/install", json={"models": []}, headers=headers).status_code
        == 200
    )
    assert started == [("stems", [])]
    bad = client.post("/addons/packs/stems/install", json={"models": "all"}, headers=headers)
    assert bad.status_code == 422
    assert (
        client.post("/addons/packs/stems/install", json={"extra": 1}, headers=headers).status_code
        == 422
    )


def test_unknown_packs_and_models_are_refused(client: TestClient) -> None:
    headers = {"X-Music-Suite-Action": "addons"}
    assert client.post("/addons/packs/nope/install", json={}, headers=headers).status_code == 404
    assert client.post("/addons/models/evil.ckpt/download", headers=headers).status_code == 404
    with pytest.raises(EditorError):
        addons.install("stems", ["../../evil.ckpt"], lambda *_a: None)


def test_deleting_models_frees_their_folder(client: TestClient) -> None:
    folder = addons.models_dir()
    folder.mkdir(parents=True)
    (folder / "htdemucs_ft.yaml").write_bytes(b"x" * 1000)
    reply = client.delete("/addons/models", headers={"X-Music-Suite-Action": "addons"})
    assert reply.json() == {"freed_bytes": 1000}
    assert not folder.exists()


def test_install_runs_torch_then_the_pack_then_models(monkeypatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(addons, "has_module", lambda name: name == "audio_separator")
    monkeypatch.setattr(
        addons, "torch_plan", lambda: {"index": "https://x/cu130", "build": "cu130"}
    )
    monkeypatch.setattr(addons, "_freeze", lambda: ["numpy==2.5.3"])
    monkeypatch.setattr(addons, "_stream", lambda command, *_a: calls.append(command))
    addons.install("stems", ["htdemucs_6s.yaml"], lambda *_a: None)
    assert calls[0][-4:] == ["torch", "torchaudio", "--index-url", "https://x/cu130"]
    assert calls[1][-3:] == list(addons.PACKS["stems"].packages)
    assert calls[2][-1] == "htdemucs_6s.yaml" and calls[2][1] == "-c"


# --------------------------------------------------------------------------- finer splits


def _tone(seconds: float = 3.0) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    tone = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    return np.stack([tone, tone], axis=1)


@pytest.fixture
def fake_models(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """audio-separator stand-in: each model returns quarter-level copies under its stem names."""
    used: list[str] = []
    names = {
        "htdemucs_6s.yaml": ["vocals", "drums", "bass", "guitar", "piano", "other"],
        "htdemucs_ft.yaml": ["vocals", "drums", "bass", "other"],
        separation.DRUMSEP_MODEL: ["kick", "snare", "toms", "hh", "ride", "crash"],
        separation.KARAOKE_MODEL: ["vocals", "instrumental"],
    }

    def run(audio: np.ndarray, sr: int, model: str, _progress: Any) -> Any:
        used.append(model)
        # A different rate and one channel, so conforming back to the input is exercised.
        mono = audio.mean(axis=1, keepdims=True)[::2]
        return {name: mono * 0.25 for name in names[model]}, sr // 2

    monkeypatch.setattr(separation, "_run_separator", run)
    monkeypatch.setattr(engines, "separation_engines", lambda: ["audio-separator", "basic-hpss"])
    return used


def test_full_split_is_twelve_named_stems(fake_models: list[str]) -> None:
    audio = _tone()
    stems, engine = separation.separate(audio, SR, 6, drum_kit_pass=True, lead_backing_pass=True)
    assert list(stems) == [
        separation.LEAD,
        separation.BACKING,
        "kick",
        "snare",
        "toms",
        "hi-hat",
        "ride",
        "crash",
        "bass",
        "guitar",
        "piano",
        "other",
    ]
    assert all(stem.shape == audio.shape for stem in stems.values())
    assert engine == "audio-separator + DrumSep + Karaoke"
    assert fake_models == ["htdemucs_6s.yaml", separation.DRUMSEP_MODEL, separation.KARAOKE_MODEL]


def test_a_stem_can_be_split_on_its_own(fake_models: list[str]) -> None:
    drums, _ = separation.separate(_tone(), SR, part="drums")
    assert list(drums) == ["kick", "snare", "toms", "hi-hat", "ride", "crash"]
    vocals, _ = separation.separate(_tone(), SR, part="vocals")
    assert list(vocals) == [separation.LEAD, separation.BACKING]
    assert fake_models == [separation.DRUMSEP_MODEL, separation.KARAOKE_MODEL]


def test_finer_splits_need_the_pack(monkeypatch) -> None:
    monkeypatch.setattr(engines, "separation_engines", lambda: ["basic-hpss"])
    with pytest.raises(EditorError, match="Models & engines"):
        separation.separate(_tone(), SR, 4, drum_kit_pass=True)
    with pytest.raises(EditorError, match="Models & engines"):
        separation.separate(_tone(), SR, part="vocals")


def test_drum_pieces_need_a_drum_stem(fake_models: list[str]) -> None:
    with pytest.raises(EditorError, match="4- or 6-stem"):
        separation.separate(_tone(), SR, 2, drum_kit_pass=True)


def test_separate_job_parameters() -> None:
    clean = jobs._v_separate({"stems": 6, "drum_kit": True, "lead_backing": True})
    assert clean == {"stems": 6, "drum_kit": True, "lead_backing": True, "part": "mix"}
    assert jobs._v_separate({})["part"] == "mix"
    assert jobs._v_separate({"part": "drums"})["part"] == "drums"
    for bad in ({"part": "guitar"}, {"stems": 2, "drum_kit": True}, {"stems": 5}, {"unknown": 1}):
        with pytest.raises(ParamError):
            jobs._v_separate(bad)
