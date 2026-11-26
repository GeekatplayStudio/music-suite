"""Local model acceptance boundaries without downloading weights in the test suite."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from audioqi.editor import projects
from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation import live, local_runtimes, model_catalog, schema
from audioqi.generation.providers.local_music import NAMES, LocalMusicProvider, preserve_source


@pytest.mark.parametrize("key", list(NAMES))
def test_model_defaults_validate_for_generation(key):
    description = LocalMusicProvider(key).describe()
    values = {
        f["key"]: f["default"]
        for f in description["fields"]
        if "default" in f and "text2music" in f.get("tasks", ["text2music"])
    }
    values["caption"] = "Acoustic folk"
    schema.validate(description["fields"], "text2music", values)


def test_region_edit_preserves_original_samples_and_duration(tmp_path):
    rate = 8000
    source = np.random.default_rng(2).uniform(-0.5, 0.5, (rate * 4, 2)).astype("float32")
    src, output = tmp_path / "source.wav", tmp_path / "output.wav"
    sf.write(src, source, rate, subtype="FLOAT")
    sf.write(output, np.full((rate * 5, 2), 0.1, "float32"), rate, subtype="FLOAT")
    meta = preserve_source(output, src, "inpaint", {"start": 1, "end": 2})
    actual, actual_rate = sf.read(output, dtype="float32", always_2d=True)
    assert actual_rate == rate and actual.shape == source.shape
    assert np.array_equal(actual[:rate], source[:rate])
    assert np.array_equal(actual[2 * rate :], source[2 * rate :])
    assert np.all(actual[rate : 2 * rate] == np.float32(0.1))
    assert meta["source_seconds"] == 4


def test_multiple_regions_preserve_the_audio_between_them(tmp_path):
    src, output = tmp_path / "source.wav", tmp_path / "output.wav"
    sf.write(src, np.zeros((4000, 2), "float32"), 1000, subtype="FLOAT")
    sf.write(output, np.ones((4000, 2), "float32") * 0.25, 1000, subtype="FLOAT")
    preserve_source(output, src, "inpaint", {"regions": "[[0.5,1],[2,3]]"})
    actual, _ = sf.read(output, dtype="float32")
    assert not actual[1000:2000].any()
    assert np.all(actual[500:1000] == 0.25)
    assert np.all(actual[2000:3000] == 0.25)


def test_continuation_restores_source_and_reports_visible_tail(tmp_path):
    src, output = tmp_path / "source.wav", tmp_path / "output.wav"
    source = np.linspace(-0.2, 0.2, 2000, dtype="float32")[:, None]
    sf.write(src, source, 1000, subtype="FLOAT")
    sf.write(output, np.full((3000, 1), 0.1, "float32"), 1000, subtype="FLOAT")
    meta = preserve_source(output, src, "continue", {})
    actual, _ = sf.read(output, dtype="float32", always_2d=True)
    assert np.array_equal(actual[:2000], source)
    assert meta["extended_seconds"] == 1 and meta["extend_at"] == "end"


def test_continuation_with_no_tail_is_rejected(tmp_path):
    src, output = tmp_path / "source.wav", tmp_path / "output.wav"
    for p in (src, output):
        sf.write(p, np.zeros((1000, 2)), 1000)
    with pytest.raises(EditorError, match="no continuation"):
        preserve_source(output, src, "continue", {})


@pytest.mark.parametrize(
    "fields",
    [
        {"model": "small-music", "duration": 121},
        {"loras": "../other.ckpt"},
        {"loras": "one.ckpt", "lora_index": 1},
        {"regions": "[[1,999]]"},
    ],
)
def test_invalid_model_combinations_are_rejected_before_inference(fields):
    with pytest.raises(ParamError):
        LocalMusicProvider("stable_audio3").validate_params("inpaint", fields)


def test_missing_download_access_starts_no_install(monkeypatch, tmp_path):
    monkeypatch.setattr(local_runtimes.settings, "root", lambda: tmp_path)
    calls = []
    monkeypatch.setattr(local_runtimes.subprocess, "run", lambda *a, **k: calls.append(a))
    local_runtimes._install(
        "sam-audio", None, {"checkpoints": [{"error": "Access denied", "revision": None}]}
    )
    assert not calls
    assert "access is unavailable" in local_runtimes._jobs["sam-audio"]
    assert local_runtimes.active("sam-audio") is None


def test_first_load_inventory_does_not_fetch_uninstalled_models(monkeypatch, tmp_path):
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path))
    monkeypatch.setattr(
        local_runtimes, "latest", lambda key: pytest.fail("uninstalled model must not be checked")
    )
    rows = local_runtimes.inventory(check=True)
    assert any(row["id"] == "mega53" for row in rows)
    assert all(not row["revision"] for row in rows)


def test_windows_magenta_is_restricted_before_install(monkeypatch):
    from audioqi.generation import wsl_runtime

    monkeypatch.setattr(wsl_runtime, "distribution", lambda: None)
    assert model_catalog.support("magenta_rt2", "Windows")["supported"] is False
    monkeypatch.setattr(model_catalog.platform, "system", lambda: "Windows")
    with pytest.raises(EditorError, match="Native Windows"):
        local_runtimes.start("magenta_rt2", None)


def test_forged_review_token_cannot_start_install():
    with pytest.raises(EditorError, match="expired"):
        local_runtimes.start("stable_audio3", "a" * 40, "not-a-review-token")


@pytest.mark.parametrize(
    "payload",
    [
        {"caption": "x", "notes": [128]},
        {"caption": "x", "notes": [True]},
        {"caption": "x", "frames": 10000},
        {"caption": "x", "frames": 1.5},
        {"caption": "x", "midi": "yes"},
        {"caption": "x", "temperature": float("nan")},
        {"caption": "x", "untrusted_path": "C:/anything"},
    ],
)
def test_live_controls_reject_invalid_or_unbounded_input(payload):
    with pytest.raises(ParamError):
        live.controls(payload)


def test_live_controls_deduplicate_notes_and_keep_integer_frame_count():
    values = live.controls({"caption": "folk", "notes": [60, 60, 64], "frames": 10.0})
    assert values["notes"] == [60, 64]
    assert type(values["frames"]) is int


def test_model_review_contains_pinned_source_size_access_and_terms(monkeypatch):
    monkeypatch.setattr(local_runtimes, "latest", lambda key: "a" * 40)
    monkeypatch.setattr(
        model_catalog,
        "hub_metadata",
        lambda repo, **k: {
            "repo": repo,
            "revision": "b" * 40,
            "bytes": 1000,
            "gated": True,
            "license": "model-terms",
            "error": None,
        },
    )
    result = local_runtimes.review("stable_audio3", "small-music")
    assert result["revision"] == "a" * 40 and result["download_bytes"] == 1000
    assert result["checkpoints"][0]["revision"] == "b" * 40
    assert result["review_id"] in local_runtimes._reviews


def test_windows_magenta_can_use_an_existing_wsl_gpu_distribution(monkeypatch):
    from audioqi.generation import wsl_runtime

    monkeypatch.setattr(wsl_runtime, "distribution", lambda: "Ubuntu")
    assert model_catalog.support("magenta_rt2", "Windows")["supported"]


def test_wsl_command_keeps_paths_and_arguments_separate(tmp_path):
    import json

    from audioqi.generation import wsl_runtime

    (tmp_path / "wsl.json").write_text(json.dumps({"distribution": "Ubuntu", "uv": "/tools/uv"}))
    command = wsl_runtime.command(
        tmp_path,
        str(tmp_path / "env/Scripts/python.exe"),
        "-I",
        "-X",
        "utf8",
        "D:/Project with spaces/worker.py",
        "D:/Project with spaces/job",
        offline=True,
    )
    assert command[:4] == ["wsl.exe", "--distribution", "Ubuntu", "--exec"]
    assert "/mnt/d/Project with spaces/worker.py" in command
    assert "/mnt/d/Project with spaces/job" in command
    assert "HF_HUB_OFFLINE=1" in command
    assert all("HF_TOKEN=" not in part for part in command)


def test_live_lifecycle_serializes_accelerator_and_saves_audio(monkeypatch, tmp_path):
    import io
    import json
    import threading

    from audioqi.generation import resources
    from audioqi.generation.engine import SUPERVISOR

    monkeypatch.setattr(
        projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "data")
    )
    monkeypatch.setattr(live, "status", lambda: {"supported": True, "models": ["mrt2_small"]})
    monkeypatch.setattr(local_runtimes, "active", lambda key: tmp_path)
    monkeypatch.setattr(local_runtimes, "manifest", lambda key: {"checkpoint_root": "test"})
    monkeypatch.setattr(resources, "ensure_memory", lambda *a, **k: None)
    monkeypatch.setattr(SUPERVISOR, "stop", lambda: None)
    lock = threading.Lock()
    monkeypatch.setattr(resources, "GENERATION_LOCK", lock)

    class Pipe:
        def __init__(self, work):
            self.work = work

        def write(self, text):
            command = json.loads(text)
            index = command["index"]
            sf.write(
                self.work / f"chunk-{index}.wav",
                np.zeros((19200, 2), "float32"),
                48000,
                subtype="FLOAT",
            )
            (self.work / f"result-{index}.json").write_text('{"ok":true}')

        def flush(self):
            pass

    class Process:
        def __init__(self, args, **kwargs):
            self.stdin = Pipe(Path(args[-1]))
            self.returncode = None

        def poll(self):
            return self.returncode

        def kill(self):
            self.returncode = -9

        def wait(self, **kwargs):
            return self.returncode

    monkeypatch.setattr(live.subprocess, "Popen", Process)
    project = projects.create_project("live test")
    session = live.start({"project_id": project["id"], "model": "mrt2_small"})
    assert lock.locked()
    data = live.chunk(session["id"], {"caption": "folk", "notes": [60], "midi": True})
    assert sf.info(io.BytesIO(data)).duration == 0.4
    # Restoring Popen lets the real canonical audio importer use FFmpeg.
    monkeypatch.undo()
    # Keep project and lock configuration until the take has been imported.
    monkeypatch.setattr(
        projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "data")
    )
    monkeypatch.setattr(resources, "GENERATION_LOCK", lock)
    monkeypatch.setattr(local_runtimes, "active", lambda key: tmp_path)
    result = live.stop(session["id"], save=True)
    assert result["asset"]["duration_seconds"] == pytest.approx(0.4)
    assert not lock.locked()
    assert session["id"] not in live._SESSIONS


def test_magenta_worker_keeps_midi_onsets_and_state(monkeypatch, tmp_path):
    import io
    import json
    import runpy
    import sys
    import types

    from audioqi.generation.providers import magenta_live_worker

    calls = []

    class Key:
        def __init__(self, key):
            self.key = key

    class Model:
        def __init__(self, **kwargs):
            pass

        def embed_style(self, caption, **kwargs):
            return np.ones(3)

        def generate(self, *, conditioning, frames, state, **kwargs):
            calls.append((conditioning.copy(), frames, state))
            return types.SimpleNamespace(
                samples=np.zeros((1920 * frames, 2)), sample_rate=48000
            ), len(calls)

    package = types.ModuleType("magenta_rt")
    package.MagentaRT2Jax = Model
    package.paths = types.SimpleNamespace(set_magenta_home=lambda path: None)
    audio = types.ModuleType("magenta_rt.audio")
    audio.Waveform = object
    config = types.ModuleType("magenta_rt.config")
    config.MUSICCOCA = Key("style")
    config.DRUM_PIANOROLL = Key("drums")
    config.PIANOROLL_WITH_ONSETS = Key("notes")
    for name, module in [
        ("magenta_rt", package),
        ("magenta_rt.audio", audio),
        ("magenta_rt.config", config),
    ]:
        monkeypatch.setitem(sys.modules, name, module)
    monkeypatch.setattr(runpy, "run_path", lambda path: {"configure": lambda job: None})
    (tmp_path / "setup.json").write_text(
        json.dumps({"apple": False, "model": "mrt2_small", "checkpoint_root": "test"})
    )
    values = live.controls({"caption": "folk", "notes": [60, 64], "midi": True, "frames": 2})
    commands = [{**values, "index": 0}, {**values, "notes": [64], "index": 1}]
    monkeypatch.setattr(sys, "argv", ["worker", str(tmp_path)])
    monkeypatch.setattr(sys, "stdin", io.StringIO("".join(json.dumps(c) + "\n" for c in commands)))
    magenta_live_worker.main()
    assert calls[0][0]["notes"][60] == 2
    assert calls[1][0]["notes"][60] == 1
    assert calls[2][0]["notes"][60] == 0
    assert calls[2][0]["notes"][64] == 1
    assert [call[2] for call in calls] == [None, 1, 2, 3]
    assert sf.info(tmp_path / "chunk-1.wav").duration == pytest.approx(0.08)


def test_terminate_removes_redirector_and_descendant(tmp_path):
    import json
    import subprocess
    import sys
    import time

    import psutil

    from audioqi.generation.worker_process import terminate

    script = tmp_path / "parent.py"
    child_file = tmp_path / "child.json"
    script.write_text(
        "import subprocess,sys,time,json; from pathlib import Path; "
        "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
        "Path(sys.argv[1]).write_text(json.dumps(child.pid)); time.sleep(60)"
    )
    parent = subprocess.Popen(
        [sys.executable, str(script), str(child_file)], start_new_session=sys.platform != "win32"
    )
    child = None
    try:
        deadline = time.monotonic() + 15
        while not child_file.is_file() and time.monotonic() < deadline:
            time.sleep(0.05)
        child = psutil.Process(json.loads(child_file.read_text()))
        terminate(parent)
        assert parent.poll() is not None
        child.wait(timeout=5)
        assert not child.is_running()
    finally:
        if parent.poll() is None:
            terminate(parent)
        if child and child.is_running():
            child.kill()
