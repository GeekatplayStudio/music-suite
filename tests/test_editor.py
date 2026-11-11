from __future__ import annotations

import itertools
import json
import shutil
import time
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

import apps.api.editor as editor_api
import apps.api.main as api_main
from audioqi.editor import analysis, engines, plugins, processing, projects, separation
from audioqi.io import metadata as metadata_module

SR = 48_000
BAD_IDS = ["not-a-uuid", "123", str(uuid4()).upper(), str(uuid4()).replace("-", ""), "..%2F.."]


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """API client on a temp data root, with only the always-available fallback engines."""
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "d"))
    monkeypatch.setenv(engines.FORCE_FALLBACK_ENV, "1")
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, fn: fn())
    plugins.reset_cache()
    with TestClient(api_main.app) as test_client:
        yield test_client
    plugins.reset_cache()


def _song(seconds: float = 6.0, *, channels: int = 2, bpm: float = 120.0) -> np.ndarray:
    """A minor chord, a bass note and a click on every beat; deterministic."""
    rng = np.random.default_rng(7)
    frames = int(SR * seconds)
    t = np.arange(frames) / SR
    chord = sum(np.sin(2 * np.pi * f * t) for f in (220.0, 261.63, 329.63, 440.0)) * 0.06
    bass = 0.12 * np.sin(2 * np.pi * 110.0 * t)
    clicks = np.zeros(frames)
    burst = rng.standard_normal(1200) * np.exp(-np.arange(1200) / 200.0) * 0.5
    for start in np.arange(0.0, seconds - 0.1, 60.0 / bpm):
        index = int(start * SR)
        clicks[index : index + 1200] += burst[: frames - index]
    mid = chord + bass + clicks
    if channels == 1:
        return mid.astype(np.float32)[:, None]
    side = 0.04 * np.sin(2 * np.pi * 660.0 * t)
    return np.stack([mid + side, mid - side], axis=1).astype(np.float32)


def _wav(path: Path, audio: np.ndarray, sr: int = SR) -> Path:
    sf.write(str(path), audio, sr, subtype="FLOAT")
    return path


def _project(client: TestClient, name: str = "Demo") -> str:
    response = client.post("/editor/projects", json={"name": name})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _upload(client: TestClient, pid: str, path: Path, name: str = "song.wav") -> dict[str, Any]:
    with path.open("rb") as handle:
        response = client.post(
            f"/editor/projects/{pid}/assets", files={"file": (name, handle, "audio/wav")}
        )
    assert response.status_code == 200, response.text
    return response.json()


def _setup(client: TestClient, tmp_path: Path, audio: np.ndarray | None = None):
    pid = _project(client)
    source = _song() if audio is None else audio
    asset = _upload(client, pid, _wav(tmp_path / "song.wav", source))
    return pid, asset, source


def _run(client: TestClient, pid: str, op: str, aid: str, params: dict[str, Any]):
    response = client.post(
        f"/editor/projects/{pid}/jobs", json={"op": op, "asset_id": aid, "params": params}
    )
    assert response.status_code == 200, response.text
    queued = response.json()
    assert queued["status"] == "queued" and queued["progress"] == 0.0
    assert queued["result_assets"] == [] and queued["error"] is None
    final = client.get(f"/editor/projects/{pid}/jobs/{queued['id']}")
    assert final.status_code == 200
    return final.json()


def _ok(client: TestClient, pid: str, op: str, aid: str, params: dict[str, Any]):
    job = _run(client, pid, op, aid, params)
    assert job["status"] == "completed", job["error"]
    assert job["progress"] == 100.0 and job["stage"] == "done" and job["op"] == op
    return job


def _audio(client: TestClient, pid: str, aid: str) -> np.ndarray:
    data, sr = sf.read(str(projects.editor_root() / pid / "assets" / f"{aid}.wav"), always_2d=True)
    assert sr == SR
    return data


# ----------------------------------------------------------------------------- projects


def test_capabilities_report_fallback_engines(client: TestClient) -> None:
    caps = client.get("/editor/capabilities").json()
    assert caps["separation"] == {
        "available": True,
        "engine": "basic-hpss",
        "engines": ["basic-hpss"],
        "stem_options": [2, 4],
        "detail": False,
        "accelerator": "none",
    }
    assert caps["stretch"] == {"engine": "librosa"}
    assert caps["pitch"] == {"engine": "librosa"}
    assert "spectral-gate" in caps["denoise"]["engines"]
    assert "noisereduce" not in caps["denoise"]["engines"]
    assert caps["beats"] == {"engine": "librosa"}
    assert caps["plugins"] == {"available": False, "formats": []}


def test_capabilities_shape_with_installed_engines(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(engines.FORCE_FALLBACK_ENV)
    caps = client.get("/editor/capabilities").json()
    assert caps["separation"]["engine"] == caps["separation"]["engines"][0]
    assert caps["separation"]["engines"][-1] == "basic-hpss"
    assert set(caps["separation"]["stem_options"]) <= {2, 4, 6}
    assert caps["stretch"]["engine"] in {"pedalboard-rubberband", "rubberband-cli", "librosa"}
    assert caps["beats"]["engine"] in {"beat_this", "librosa"}
    assert isinstance(caps["plugins"]["available"], bool)


def test_project_lifecycle(client: TestClient) -> None:
    assert client.get("/editor/projects").json() == []
    created = client.post("/editor/projects", json={"name": "  First  "}).json()
    assert created["name"] == "First" and created["state"] is None and created["assets"] == []
    assert set(created) == {"id", "name", "created_at", "updated_at", "state", "assets"}
    second = _project(client, "Second")

    listing = client.get("/editor/projects").json()
    assert [item["id"] for item in listing] == [second, created["id"]]
    assert set(listing[0]) == {"id", "name", "created_at", "updated_at"}

    pid = created["id"]
    state = {"tracks": [{"id": 1, "clips": []}], "zoom": 2.5}
    saved = client.post(f"/editor/projects/{pid}/state", json=state)
    assert saved.status_code == 200 and saved.json()["ok"] is True
    loaded = client.get(f"/editor/projects/{pid}").json()
    assert loaded["state"] == state and loaded["updated_at"] == saved.json()["updated_at"]

    renamed = client.post(f"/editor/projects/{pid}/rename", json={"name": "Renamed"})
    assert renamed.status_code == 200
    assert set(renamed.json()) == {"id", "name", "updated_at"}
    assert client.get(f"/editor/projects/{pid}").json()["name"] == "Renamed"

    assert client.delete(f"/editor/projects/{pid}").json() == {"deleted": True}
    assert client.get(f"/editor/projects/{pid}").status_code == 404
    assert client.delete(f"/editor/projects/{pid}").status_code == 404
    assert not (projects.editor_root() / pid).exists()
    assert (projects.editor_root() / second).is_dir()


@pytest.mark.parametrize("name", ["", "   ", "x" * 121, 5, None])
def test_project_name_is_validated(client: TestClient, name: Any) -> None:
    assert client.post("/editor/projects", json={"name": name}).status_code == 422
    pid = _project(client)
    assert client.post(f"/editor/projects/{pid}/rename", json={"name": name}).status_code == 422


def test_state_rejects_non_objects_bad_json_and_oversize(client: TestClient) -> None:
    pid = _project(client)
    url = f"/editor/projects/{pid}/state"
    assert client.post(url, json=[1, 2]).status_code == 422
    assert client.post(url, json="text").status_code == 422
    assert client.post(url, content=b"{not json").status_code == 422
    big = {"blob": "x" * (projects.MAX_STATE_BYTES + 10)}
    assert client.post(url, json=big).status_code == 413
    assert client.get(f"/editor/projects/{pid}").json()["state"] is None


@pytest.mark.parametrize("bad", BAD_IDS)
def test_non_canonical_ids_are_rejected(client: TestClient, bad: str) -> None:
    pid = _project(client)
    good = str(uuid4())
    calls = [
        ("get", f"/editor/projects/{bad}"),
        ("delete", f"/editor/projects/{bad}"),
        ("post", f"/editor/projects/{bad}/state"),
        ("post", f"/editor/projects/{bad}/rename"),
        ("post", f"/editor/projects/{bad}/assets"),
        ("post", f"/editor/projects/{bad}/jobs"),
        ("post", f"/editor/projects/{bad}/assets/from-run/{good}"),
        ("post", f"/editor/projects/{pid}/assets/from-run/{bad}"),
        ("get", f"/editor/projects/{pid}/assets/{bad}/audio"),
        ("get", f"/editor/projects/{bad}/assets/{good}/audio"),
        ("delete", f"/editor/projects/{pid}/assets/{bad}"),
        ("get", f"/editor/projects/{pid}/jobs/{bad}"),
        ("get", f"/editor/projects/{bad}/jobs/{good}"),
    ]
    for method, url in calls:
        kwargs: dict[str, Any] = {}
        if method == "post":
            kwargs = {"json": {"name": "x"}}
            if url.endswith("/assets"):
                kwargs = {"files": {"file": ("a.wav", b"RIFF", "audio/wav")}}
        response = getattr(client, method)(url, **kwargs)
        assert response.status_code == 404, (method, url, response.status_code)
    assert [item["id"] for item in client.get("/editor/projects").json()] == [pid]


def test_unknown_but_valid_ids_are_404(client: TestClient) -> None:
    pid, missing = _project(client), str(uuid4())
    assert client.get(f"/editor/projects/{missing}").status_code == 404
    assert client.get(f"/editor/projects/{pid}/assets/{missing}/audio").status_code == 404
    assert client.delete(f"/editor/projects/{pid}/assets/{missing}").status_code == 404
    assert client.get(f"/editor/projects/{pid}/jobs/{missing}").status_code == 404


# ----------------------------------------------------------------------------- assets


def test_upload_decodes_to_canonical_wav(client: TestClient, tmp_path: Path) -> None:
    pid = _project(client)
    source = _wav(tmp_path / "a.wav", _song(2.0)[::2].copy(), sr=24_000)
    asset = _upload(client, pid, source, "../../My attack.wav")
    assert set(asset) == {
        "id",
        "name",
        "duration_seconds",
        "sample_rate",
        "channels",
        "source",
        "parent_id",
        "label",
        "created_at",
    }
    assert asset["name"] == "My_attack" and asset["source"] == "upload"
    assert asset["sample_rate"] == SR and asset["channels"] == 2
    assert asset["parent_id"] is None and asset["label"] is None
    assert asset["duration_seconds"] == pytest.approx(2.0, abs=0.01)

    assets_dir = projects.editor_root() / pid / "assets"
    assert sorted(p.name for p in assets_dir.iterdir()) == sorted(
        [f"{asset['id']}.json", f"{asset['id']}.wav"]
    )
    info = sf.info(str(assets_dir / f"{asset['id']}.wav"))
    assert (info.samplerate, info.channels, info.subtype) == (SR, 2, "FLOAT")
    assert not list(tmp_path.rglob("attack*"))

    mono = _upload(client, pid, _wav(tmp_path / "m.wav", _song(1.0, channels=1)), "mono.wav")
    assert mono["channels"] == 1
    listed = client.get(f"/editor/projects/{pid}").json()["assets"]
    assert [item["id"] for item in listed] == [asset["id"], mono["id"]]


def test_upload_guards(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pid = _project(client)
    url = f"/editor/projects/{pid}/assets"

    def post(name: str, body: bytes) -> int:
        return client.post(url, files={"file": (name, body, "audio/wav")}).status_code

    assert post("payload.exe", b"MZ") == 415
    assert post("song.wav.sh", b"x") == 415
    assert post("empty.wav", b"") == 400
    assert post("garbage.wav", b"definitely not audio" * 50) == 415
    assert client.post(url).status_code == 422

    good = _wav(tmp_path / "ok.wav", _song(1.0)).read_bytes()
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, max_upload_bytes=64))
    assert post("big.wav", good) == 413
    monkeypatch.setattr(
        projects,
        "SETTINGS",
        replace(projects.SETTINGS, max_upload_bytes=10**9, max_audio_duration_seconds=0.5),
    )
    assert post("long.wav", good) == 413

    # A lying container header must not get past the cap either: check the decoded length.
    monkeypatch.setattr(
        metadata_module, "extract_metadata", lambda path: {"format": "wav", "codec": "pcm"}
    )
    assert post("long.wav", good) == 413
    assert client.get(f"/editor/projects/{pid}").json()["assets"] == []
    assert list((projects.editor_root() / pid / "assets").iterdir()) == []


def test_asset_audio_supports_range_and_delete(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(1.0))
    url = f"/editor/projects/{pid}/assets/{asset['id']}/audio"
    full = client.get(url)
    assert full.status_code == 200 and full.headers["content-type"] == "audio/wav"
    assert full.content[:4] == b"RIFF"
    assert full.headers.get("accept-ranges") == "bytes"
    part = client.get(url, headers={"Range": "bytes=100-199"})
    assert part.status_code == 206 and part.content == full.content[100:200]
    assert part.headers["content-range"] == f"bytes 100-199/{len(full.content)}"

    gone = client.delete(f"/editor/projects/{pid}/assets/{asset['id']}")
    assert gone.json() == {"deleted": True}
    assert client.get(url).status_code == 404
    assert client.get(f"/editor/projects/{pid}").json()["assets"] == []


def test_asset_from_run(client: TestClient, tmp_path: Path) -> None:
    pid = _project(client)
    run_id, outside_id, missing_id = str(uuid4()), str(uuid4()), str(uuid4())
    inside = projects.SETTINGS.data_dir / "uploads" / run_id / "take.wav"
    inside.parent.mkdir(parents=True)
    _wav(inside, _song(1.0, channels=1))
    outside = _wav(tmp_path / "outside.wav", _song(1.0))
    runs = {
        run_id: SimpleNamespace(
            input_path=str(inside), canonical_wav_path=None, filename="take.wav"
        ),
        outside_id: SimpleNamespace(
            input_path=str(outside), canonical_wav_path=None, filename="x.wav"
        ),
    }
    fake_db = SimpleNamespace(get=lambda _model, key: runs.get(key))
    api_main.app.dependency_overrides[editor_api.get_db] = lambda: fake_db
    try:
        response = client.post(f"/editor/projects/{pid}/assets/from-run/{run_id}")
        assert response.status_code == 200, response.text
        asset = response.json()
        assert asset["source"] == "run" and asset["name"] == "take" and asset["channels"] == 1
        url = f"/editor/projects/{pid}/assets/from-run"
        assert client.post(f"{url}/{missing_id}").status_code == 404
        # A run whose audio lies outside the data root is never read.
        assert client.post(f"{url}/{outside_id}").status_code == 404
    finally:
        api_main.app.dependency_overrides.pop(editor_api.get_db, None)
    assert inside.is_file()
    assert len(client.get(f"/editor/projects/{pid}").json()["assets"]) == 1


# ----------------------------------------------------------------------------- job validation


@pytest.mark.parametrize(
    ("op", "params"),
    [
        ("explode", {}),
        ("", {}),
        (None, {}),
        ("stretch", {}),
        ("stretch", {"rate": 0.1}),
        ("stretch", {"rate": 4.5}),
        ("stretch", {"rate": "2"}),
        ("stretch", {"rate": True}),
        ("stretch", {"rate": 2, "extra": 1}),
        ("stretch", [2]),
        ("pitch", {"semitones": 25}),
        ("pitch", {"semitones": -24.5}),
        ("separate", {"stems": 3}),
        ("separate", {"stems": 4, "model": "/etc/passwd"}),
        ("denoise", {"strength": 1.5}),
        ("denoise", {"strength": -0.1}),
        ("denoise", {"mode": "magic"}),
        ("denoise", {"noise_start": 1.0}),
        ("denoise", {"noise_start": 2.0, "noise_end": 1.0}),
        ("denoise", {"noise_start": -1.0, "noise_end": 1.0}),
        ("normalize", {"target_lufs": -3}),
        ("normalize", {"target_lufs": -40}),
        ("normalize", {"true_peak_dbfs": 0}),
        ("normalize", {"true_peak_dbfs": -10}),
        ("analyze", {"x": 1}),
        ("match", {}),
        ("match", {"target_bpm": 300}),
        ("match", {"target_bpm": 20}),
        ("match", {"target_key": "H sharp"}),
        ("match", {"target_bpm": 120, "match_tempo": "yes"}),
        ("match", {"target_bpm": 120, "match_tempo": False}),
        ("match", {"target_asset_id": "../../etc"}),
        ("match", {"match_loudness_lufs": 0}),
        ("plugin", {"plugin_id": "/Library/Audio/Plug-Ins/VST3/Evil.vst3"}),
        ("plugin", {"plugin_id": "../x"}),
        ("plugin", {"plugin_id": "a" * 20, "parameters": {"gain": "loud"}}),
        ("plugin", {"plugin_id": "a" * 20, "parameters": [1]}),
        ("plugin", {"plugin_id": "a" * 20, "path": "/tmp/x.vst3"}),
    ],
)
def test_job_requests_are_validated(client: TestClient, tmp_path: Path, op: Any, params: Any):
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    body = {"op": op, "asset_id": asset["id"], "params": params}
    response = client.post(f"/editor/projects/{pid}/jobs", json=body)
    assert response.status_code == 422, response.text
    assert list((projects.editor_root() / pid / "jobs").iterdir()) == []


def test_job_request_asset_and_envelope_checks(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    url = f"/editor/projects/{pid}/jobs"
    body = {"op": "analyze", "asset_id": asset["id"], "params": {}}
    assert client.post(url, json={**body, "asset_id": "../../x"}).status_code == 422
    assert client.post(url, json={**body, "asset_id": str(uuid4())}).status_code == 404
    assert client.post(url, json={**body, "path": "/tmp"}).status_code == 422
    assert client.post(url, json=[body]).status_code == 422
    match = {"op": "match", "asset_id": asset["id"], "params": {"target_asset_id": str(uuid4())}}
    assert client.post(url, json=match).status_code == 404


def test_job_runs_on_the_worker_pool_and_reports_progress(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from audioqi.jobs import submit

    monkeypatch.setattr(editor_api, "submit", submit)
    pid, asset, _ = _setup(client, tmp_path, _song(1.0))
    body = {"op": "normalize", "asset_id": asset["id"], "params": {}}
    queued = client.post(f"/editor/projects/{pid}/jobs", json=body).json()
    assert queued["status"] == "queued" and queued["stage"] == "queued"
    assert set(queued) == {
        "id",
        "op",
        "asset_id",
        "status",
        "progress",
        "stage",
        "detail",
        "error",
        "result_assets",
        "result",
        "created_at",
        "updated_at",
    }
    deadline = time.time() + 60
    job = queued
    while time.time() < deadline and job["status"] in {"queued", "running"}:
        time.sleep(0.05)
        job = client.get(f"/editor/projects/{pid}/jobs/{queued['id']}").json()
    assert job["status"] == "completed", job
    assert job["asset_id"] == asset["id"] and len(job["result_assets"]) == 1


def test_interrupted_job_is_reported_failed(client: TestClient, tmp_path: Path, monkeypatch):
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, _fn: None)  # worker never runs
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    body = {"op": "analyze", "asset_id": asset["id"], "params": {}}
    queued = client.post(f"/editor/projects/{pid}/jobs", json=body).json()
    job = client.get(f"/editor/projects/{pid}/jobs/{queued['id']}").json()
    assert job["status"] == "failed" and "interrupted" in job["error"]


def test_failed_job_has_a_clean_error(client: TestClient, tmp_path: Path, monkeypatch) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(1.0))
    job = _run(client, pid, "denoise", asset["id"], {"noise_start": 5.0, "noise_end": 6.0})
    assert job["status"] == "failed" and job["stage"] == "failed"
    assert job["error"] == "The noise-print region lies outside the audio."
    assert job["result_assets"] == []

    def boom(*_args: Any, **_kwargs: Any) -> None:
        raise RuntimeError(f"secret trace at {tmp_path}/internal.py")

    monkeypatch.setattr(processing, "stretch_pitch", boom)
    job = _run(client, pid, "pitch", asset["id"], {"semitones": 2})
    assert job["status"] == "failed"
    assert job["error"] == "The pitch job failed unexpectedly (RuntimeError)."
    assert str(tmp_path) not in json.dumps(job)
    assert len(client.get(f"/editor/projects/{pid}").json()["assets"]) == 1


# ----------------------------------------------------------------------------- processing ops


@pytest.mark.parametrize("channels", [1, 2])
def test_separate_four_stems_are_aligned_and_sum_to_the_mix(
    client: TestClient, tmp_path: Path, channels: int
) -> None:
    pid, asset, source = _setup(client, tmp_path, _song(3.0, channels=channels))
    job = _ok(client, pid, "separate", asset["id"], {})
    assert job["result"] == {"engine": "basic-hpss"}
    stems = job["result_assets"]
    assert [item["label"] for item in stems] == ["vocals", "drums", "bass", "other"]
    total = np.zeros_like(source, dtype=np.float64)
    for item in stems:
        assert item["source"] == "stem" and item["parent_id"] == asset["id"]
        assert item["name"] == f"song ({item['label']})"
        assert item["sample_rate"] == SR and item["channels"] == channels
        data = _audio(client, pid, item["id"])
        assert data.shape == source.shape
        total += data
    assert np.max(np.abs(total - source)) < 1e-3
    by_label = {item["label"]: _audio(client, pid, item["id"]) for item in stems}
    rms = {label: float(np.sqrt(np.mean(data**2))) for label, data in by_label.items()}
    assert rms["bass"] > 0.03  # the 110 Hz note lands in the bass stem
    assert rms["drums"] > 0.005  # the clicks land in the drum stem


def test_separate_two_stems_and_six_stem_fallback_error(client: TestClient, tmp_path: Path):
    pid, asset, source = _setup(client, tmp_path, _song(2.0))
    job = _ok(client, pid, "separate", asset["id"], {"stems": 2})
    assert [item["label"] for item in job["result_assets"]] == ["vocals", "instrumental"]
    total = sum(_audio(client, pid, item["id"]) for item in job["result_assets"])
    assert total.shape == source.shape and np.max(np.abs(total - source)) < 1e-3

    failed = _run(client, pid, "separate", asset["id"], {"stems": 6})
    assert failed["status"] == "failed" and "6-stem" in failed["error"]


def test_chunked_processing_keeps_stems_summing_to_the_mix() -> None:
    audio = _song(5.0)
    stacked = processing.process_chunked(
        audio,
        SR,
        lambda chunk: separation._hpss_chunk(chunk, SR),
        chunk_seconds=2.0,
        overlap_seconds=0.5,
    )
    assert stacked.shape == (4, *audio.shape)
    assert np.max(np.abs(stacked.sum(axis=0) - audio)) < 1e-3


@pytest.mark.parametrize(("rate", "channels"), [(2.0, 2), (0.5, 1), (1.25, 2)])
def test_stretch_changes_length_not_pitch(
    client: TestClient, tmp_path: Path, rate: float, channels: int
) -> None:
    t = np.arange(SR * 2) / SR
    tone = np.repeat((0.3 * np.sin(2 * np.pi * 440.0 * t))[:, None], channels, axis=1)
    if channels == 2:
        tone[:, 1] *= 0.5
    pid, asset, source = _setup(client, tmp_path, tone.astype(np.float32))
    job = _ok(client, pid, "stretch", asset["id"], {"rate": rate})
    assert job["result"] == {"rate": rate, "engine": "librosa"}
    (created,) = job["result_assets"]
    assert created["source"] == "process" and created["parent_id"] == asset["id"]
    assert created["name"] == f"song ({rate:g}x)" and created["channels"] == channels
    out = _audio(client, pid, created["id"])
    assert out.shape == (round(source.shape[0] / rate), channels)
    assert created["duration_seconds"] == pytest.approx(2.0 / rate, abs=1e-3)
    assert _dominant_hz(out[:, 0]) == pytest.approx(440.0, abs=6.0)
    if channels == 2:  # stereo is processed per channel, not collapsed
        ratio = np.sqrt(np.mean(out[:, 1] ** 2)) / np.sqrt(np.mean(out[:, 0] ** 2))
        assert ratio == pytest.approx(0.5, abs=0.05)


def _dominant_hz(signal: np.ndarray) -> float:
    spectrum = np.abs(np.fft.rfft(signal * np.hanning(signal.shape[0])))
    return float(np.fft.rfftfreq(signal.shape[0], 1.0 / SR)[int(np.argmax(spectrum))])


def test_pitch_shifts_frequency_and_keeps_duration(client: TestClient, tmp_path: Path) -> None:
    t = np.arange(SR * 2) / SR
    tone = np.stack([0.3 * np.sin(2 * np.pi * 440.0 * t)] * 2, axis=1).astype(np.float32)
    pid, asset, source = _setup(client, tmp_path, tone)
    job = _ok(client, pid, "pitch", asset["id"], {"semitones": 12})
    assert job["result"] == {"semitones": 12.0, "engine": "librosa"}
    (created,) = job["result_assets"]
    assert created["name"] == "song (+12 st)"
    out = _audio(client, pid, created["id"])
    assert out.shape == source.shape
    assert _dominant_hz(out[:, 0]) == pytest.approx(880.0, abs=10.0)

    down = _ok(client, pid, "pitch", asset["id"], {"semitones": -2.5})
    assert down["result_assets"][0]["name"] == "song (-2.5 st)"


def _noisy_tone() -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(3)
    frames = SR * 3
    t = np.arange(frames) / SR
    tone = 0.3 * np.sin(2 * np.pi * 440.0 * t)
    tone[:SR] = 0.0  # first second is noise only
    noise = 0.02 * rng.standard_normal((frames, 2))
    return (tone[:, None] + noise).astype(np.float32), noise


def _rms(data: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(data))))


@pytest.mark.parametrize(
    ("params", "used_print"),
    [
        ({"mode": "spectral", "strength": 1.0, "noise_start": 0.1, "noise_end": 0.9}, True),
        ({"mode": "spectral", "strength": 1.0}, False),
        ({}, False),
    ],
)
def test_denoise_spectral_gate(
    client: TestClient, tmp_path: Path, params: dict[str, Any], used_print: bool
) -> None:
    noisy, _ = _noisy_tone()
    pid, asset, source = _setup(client, tmp_path, noisy)
    job = _ok(client, pid, "denoise", asset["id"], params)
    assert job["result"] == {"engine": "spectral-gate", "used_noise_print": used_print}
    (created,) = job["result_assets"]
    assert created["name"] == "song (denoised)"
    out = _audio(client, pid, created["id"])
    assert out.shape == source.shape
    quiet_before, quiet_after = _rms(source[2000 : SR - 2000]), _rms(out[2000 : SR - 2000])
    assert quiet_after < quiet_before * (0.4 if used_print else 0.8)
    assert _rms(out[SR + 4000 :]) > 0.15  # the tone survives


def test_denoise_strength_zero_is_a_copy(client: TestClient, tmp_path: Path) -> None:
    noisy, _ = _noisy_tone()
    pid, asset, source = _setup(client, tmp_path, noisy)
    job = _ok(client, pid, "denoise", asset["id"], {"strength": 0, "mode": "spectral"})
    out = _audio(client, pid, job["result_assets"][0]["id"])
    assert np.allclose(out, source, atol=1e-6)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_denoise_fft_mode_uses_ffmpeg(client: TestClient, tmp_path: Path) -> None:
    noisy, _ = _noisy_tone()
    pid, asset, source = _setup(client, tmp_path, noisy)
    params = {"mode": "fft", "strength": 1.0, "noise_start": 0.1, "noise_end": 0.9}
    job = _ok(client, pid, "denoise", asset["id"], params)
    assert job["result"] == {"engine": "ffmpeg-afftdn", "used_noise_print": True}
    out = _audio(client, pid, job["result_assets"][0]["id"])
    assert out.shape == source.shape
    assert _rms(out[SR // 2 : SR - 2000]) < _rms(source[SR // 2 : SR - 2000]) * 0.7
    assert not any(projects.scratch_dir().iterdir())


def test_normalize_hits_target_and_respects_true_peak(client: TestClient, tmp_path: Path):
    pid, asset, source = _setup(client, tmp_path, _song(3.0))
    job = _ok(client, pid, "normalize", asset["id"], {"target_lufs": -20})
    result = job["result"]
    assert set(result) == {"input_lufs", "output_lufs", "gain_db"}
    assert result["output_lufs"] == pytest.approx(-20.0, abs=0.01)
    assert result["gain_db"] == pytest.approx(-20.0 - result["input_lufs"], abs=0.02)
    out = _audio(client, pid, job["result_assets"][0]["id"])
    assert out.shape == source.shape
    assert processing.integrated_lufs(out, SR) == pytest.approx(-20.0, abs=0.1)

    # Asking for more loudness than the ceiling allows reduces the gain instead.
    loud = _ok(
        client, pid, "normalize", asset["id"], {"target_lufs": -6, "true_peak_dbfs": -3}
    )
    assert loud["result"]["output_lufs"] < -6.5
    out = _audio(client, pid, loud["result_assets"][0]["id"])
    assert processing.true_peak_dbfs(out.astype(np.float32), SR) <= -3.0 + 0.05


def test_normalize_fails_cleanly_on_silence(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, np.zeros((SR, 2), dtype=np.float32))
    job = _run(client, pid, "normalize", asset["id"], {})
    assert job["status"] == "failed" and "Loudness could not be measured" in job["error"]


def test_analyze_detects_tempo_and_key_and_caches(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(8.0))
    job = _ok(client, pid, "analyze", asset["id"], {})
    result = job["result"]
    assert job["result_assets"] == []
    assert set(result) == {
        "bpm",
        "bpm_confidence",
        "beats",
        "downbeats",
        "first_downbeat",
        "key",
        "scale",
        "key_label",
        "key_confidence",
        "lufs",
        "duration_seconds",
        "engine",
    }
    assert result["bpm"] == pytest.approx(120.0, abs=3.0)
    assert 0.0 < result["bpm_confidence"] <= 1.0
    assert len(result["beats"]) >= 10 and result["beats"] == sorted(result["beats"])
    assert set(result["downbeats"]) <= set(result["beats"])
    assert result["first_downbeat"] == result["downbeats"][0]
    assert result["key_label"] == "A minor"
    assert (result["key"], result["scale"]) == ("A", "minor")
    assert 0.0 < result["key_confidence"] <= 1.0
    assert result["lufs"] < 0 and result["duration_seconds"] == pytest.approx(8.0, abs=0.01)
    assert result["engine"] == {"beats": "librosa", "key": "krumhansl-schmuckler"}
    cached = projects.editor_root() / pid / "analysis" / f"{asset['id']}.json"
    assert json.loads(cached.read_text(encoding="utf-8")) == result

    client.delete(f"/editor/projects/{pid}/assets/{asset['id']}")
    assert not cached.exists()


def test_analyze_silence_returns_nulls(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, np.zeros((SR, 1), dtype=np.float32))
    result = _ok(client, pid, "analyze", asset["id"], {})["result"]
    assert result["bpm"] is None and result["key"] is None and result["key_label"] is None
    assert result["beats"] == [] and result["first_downbeat"] is None and result["lufs"] is None


def test_match_to_explicit_tempo_and_relative_key(client: TestClient, tmp_path: Path) -> None:
    pid, asset, source = _setup(client, tmp_path, _song(8.0))
    params = {"target_bpm": 100, "target_key": "c major", "match_loudness_lufs": -24}
    job = _ok(client, pid, "match", asset["id"], params)
    result = job["result"]
    src_bpm = result["source"]["bpm"]
    assert result["rate"] == pytest.approx(100.0 / src_bpm, abs=1e-4)
    assert result["semitones"] == 0.0 and "relative keys" in result["key_note"]
    assert result["engine"] == "librosa"
    assert result["analysis"]["bpm"] == pytest.approx(100.0, abs=4.0)
    assert result["analysis"]["lufs"] == pytest.approx(-24.0, abs=0.3)
    (created,) = job["result_assets"]
    assert created["name"] == "song (100 BPM, C major, -24 LUFS)"
    out = _audio(client, pid, created["id"])
    assert out.shape[0] == round(source.shape[0] / (100.0 / src_bpm))
    analysis_dir = projects.editor_root() / pid / "analysis"
    assert (analysis_dir / f"{asset['id']}.json").is_file()
    assert (analysis_dir / f"{created['id']}.json").is_file()


def test_match_to_another_asset(client: TestClient, tmp_path: Path) -> None:
    pid, asset, source = _setup(client, tmp_path, _song(8.0))
    semitone = 2.0 ** (1.0 / 12.0)
    t = np.arange(SR * 8) / SR
    target_audio = _song(8.0, bpm=96.0)
    # Same progression three semitones up: C minor instead of A minor.
    shifted = sum(
        np.sin(2 * np.pi * f * semitone**3 * t) for f in (220.0, 261.63, 329.63, 440.0, 110.0)
    )
    target_audio = (target_audio * 0.2 + 0.08 * shifted[:, None]).astype(np.float32)
    target = _upload(client, pid, _wav(tmp_path / "t.wav", target_audio), "target.wav")
    wanted = _ok(client, pid, "analyze", target["id"], {})["result"]

    job = _ok(
        client, pid, "match", asset["id"], {"target_asset_id": target["id"], "match_key": False}
    )
    result = job["result"]
    assert result["semitones"] == 0.0 and result["key_note"] is None
    expected = analysis.tempo_rate(result["source"]["bpm"], wanted["bpm"])
    assert result["rate"] == pytest.approx(expected, abs=1e-4)
    out = _audio(client, pid, job["result_assets"][0]["id"])
    assert out.shape == (round(source.shape[0] / expected), 2)

    keyed = _ok(
        client, pid, "match", asset["id"], {"target_asset_id": target["id"], "match_tempo": False}
    )
    src_key = analysis.parse_key(keyed["result"]["source"]["key_label"])
    dst_key = analysis.parse_key(wanted["key_label"])
    assert src_key is not None and dst_key is not None
    assert keyed["result"]["rate"] == 1.0
    assert keyed["result"]["semitones"] == analysis.key_shift(src_key, dst_key)[0]
    assert -6 <= keyed["result"]["semitones"] <= 6


def test_match_fails_cleanly_without_a_detectable_tempo(client: TestClient, tmp_path: Path):
    pid, asset, _ = _setup(client, tmp_path, np.zeros((SR * 2, 2), dtype=np.float32))
    job = _run(client, pid, "match", asset["id"], {"target_bpm": 120})
    assert job["status"] == "failed" and "source tempo" in job["error"]


def test_match_refuses_extreme_tempo_changes(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(2.0))
    cached = projects.editor_root() / pid / "analysis" / f"{asset['id']}.json"
    cached.write_text(json.dumps({"bpm": 40.0, "key": None, "key_label": None}), "utf-8")
    job = _run(client, pid, "match", asset["id"], {"target_bpm": 240})
    assert job["status"] == "failed"
    assert job["error"].startswith("Tempo change too large: 40 to 240 BPM")
    assert len(client.get(f"/editor/projects/{pid}").json()["assets"]) == 1


def test_tempo_rate_is_half_and_double_time_aware() -> None:
    assert analysis.tempo_rate(120.0, 126.0) == pytest.approx(1.05)
    assert analysis.tempo_rate(70.0, 140.0) == pytest.approx(1.0)
    assert analysis.tempo_rate(170.0, 88.0) == pytest.approx(176.0 / 170.0)
    assert analysis.tempo_rate(80.0, 170.0) == pytest.approx(170.0 / 160.0)
    assert analysis.tempo_rate(40.0, 240.0) == pytest.approx(3.0)
    for src in (60.0, 61.0, 97.0, 133.0, 200.0):
        for dst in (60.0, 75.0, 128.0, 200.0):
            assert 0.5 <= analysis.tempo_rate(src, dst) <= 2.0


def test_key_shift_uses_smallest_interval_and_relative_keys() -> None:
    def shift(src: str, dst: str) -> int:
        a, b = analysis.parse_key(src), analysis.parse_key(dst)
        assert a is not None and b is not None
        return analysis.key_shift(a, b)[0]

    assert shift("A minor", "C major") == 0
    assert shift("C major", "A minor") == 0
    assert shift("A minor", "A minor") == 0
    assert shift("C major", "D major") == 2
    assert shift("C major", "B major") == -1
    assert shift("C major", "G major") == -5
    assert shift("C major", "F# major") == -6
    assert shift("A minor", "D major") == 2  # to B minor, relative of D major
    assert shift("Bb minor", "A# minor") == 0
    assert shift("Am", "Em") == -5
    for src in range(12):
        for dst in range(12):
            for scales in (("major", "major"), ("minor", "major"), ("major", "minor")):
                value, note = analysis.key_shift((src, scales[0]), (dst, scales[1]))
                assert -6 <= value <= 6 and note
    assert analysis.parse_key("A minor") == (9, "minor")
    assert analysis.parse_key("Eb") == (3, "major")
    assert analysis.parse_key("H minor") is None
    assert analysis.parse_key("../etc") is None


# ----------------------------------------------------------------------------- plugins


def test_plugins_unavailable_without_pedalboard(client: TestClient, tmp_path: Path) -> None:
    assert client.get("/editor/plugins").json() == {"available": False, "plugins": []}
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    job = _run(client, pid, "plugin", asset["id"], {"plugin_id": "0" * 20})
    assert job["status"] == "failed"
    assert job["error"].startswith("Plugin hosting unavailable")


def test_plugins_are_listed_by_filename_without_loading(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    folder = tmp_path / "VST3"
    (folder / "Shiny Reverb.vst3").mkdir(parents=True)
    (folder / "notes.txt").write_text("not a plugin", encoding="utf-8")
    components = tmp_path / "Components"
    (components / "Crusher.component").mkdir(parents=True)
    monkeypatch.setattr(
        plugins,
        "plugin_dirs",
        lambda: [
            (folder, "*.vst3", "vst3"),
            (components, "*.component", "au"),
            (tmp_path / "missing", "*.vst3", "vst3"),
        ],
    )
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    payload = client.get("/editor/plugins").json()
    assert payload["available"] is True
    assert [(p["name"], p["format"]) for p in payload["plugins"]] == [
        ("Crusher", "au"),
        ("Shiny Reverb", "vst3"),
    ]
    for item in payload["plugins"]:
        assert set(item) == {"id", "name", "format", "parameters"}
        assert plugins.PLUGIN_ID_RE.match(item["id"]) and item["parameters"] == []
    assert str(tmp_path) not in json.dumps(payload)

    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    unknown = _run(client, pid, "plugin", asset["id"], {"plugin_id": "f" * 20})
    assert unknown["status"] == "failed" and unknown["error"].startswith("Unknown plugin")


def test_broken_plugin_fails_in_the_worker_not_the_api(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("pedalboard")
    monkeypatch.delenv(engines.FORCE_FALLBACK_ENV)
    if not engines.plugin_hosting_available():
        pytest.skip("plugin hosting is not supported on this platform")
    folder = tmp_path / "VST3"
    (folder / "Broken.vst3").mkdir(parents=True)
    monkeypatch.setattr(plugins, "plugin_dirs", lambda: [(folder, "*.vst3", "vst3")])
    plugin_id = client.get("/editor/plugins").json()["plugins"][0]["id"]
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    job = _run(client, pid, "plugin", asset["id"], {"plugin_id": plugin_id, "parameters": {}})
    assert job["status"] == "failed"
    assert job["error"] == "Plugin 'Broken' failed: the plugin could not be loaded."
    assert str(tmp_path) not in json.dumps(job)
    assert client.get("/health").status_code == 200


# --- Export encoding -------------------------------------------------------------------


@pytest.mark.parametrize(("fmt", "media_type"), [("mp3", "audio/mpeg"), ("flac", "audio/flac")])
def test_export_encodes_wav(client: TestClient, tmp_path: Path, fmt: str, media_type: str) -> None:
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg is not installed")
    source = tmp_path / "mix.wav"
    sf.write(str(source), _song(2.0), SR, subtype="PCM_24")
    with source.open("rb") as handle:
        files = {"file": ("mix.wav", handle, "audio/wav")}
        response = client.post(f"/editor/export/{fmt}", files=files)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == media_type
    encoded = tmp_path / f"out.{fmt}"
    encoded.write_bytes(response.content)
    info = sf.info(str(encoded))
    assert info.samplerate == SR
    assert info.channels == 2
    assert abs(info.frames / info.samplerate - 2.0) < 0.1
    # Nothing is left behind once the response has been sent.
    leftovers = list((projects.editor_root() / "_exports").iterdir())
    assert leftovers == []


def test_export_rejects_bad_requests(client: TestClient, tmp_path: Path) -> None:
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg is not installed")
    wav = tmp_path / "mix.wav"
    sf.write(str(wav), _song(1.0), SR, subtype="PCM_16")
    with wav.open("rb") as handle:
        files = {"file": ("mix.wav", handle, "audio/wav")}
        unknown = client.post("/editor/export/ogg", files=files)
    assert unknown.status_code == 404

    junk = client.post(
        "/editor/export/mp3", files={"file": ("mix.wav", b"not audio at all", "audio/wav")}
    )
    assert junk.status_code == 415

    flac = tmp_path / "mix.flac"
    sf.write(str(flac), _song(1.0), SR, format="FLAC")
    with flac.open("rb") as handle:
        files = {"file": ("mix.wav", handle, "audio/wav")}
        not_wav = client.post("/editor/export/mp3", files=files)
    assert not_wav.status_code == 415
    assert list((projects.editor_root() / "_exports").iterdir()) == []
    assert client.get("/editor/projects").json() == []


# --- Restoration -----------------------------------------------------------------------


def _tone(seconds: float = 3.0, freq: float = 440.0, level: float = 0.3) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    mono = level * np.sin(2 * np.pi * freq * t)
    return np.stack([mono, mono], axis=1).astype(np.float32)


def _band(audio: np.ndarray, low: float, high: float) -> float:
    spectrum = np.abs(np.fft.rfft(audio[:, 0] * np.hanning(audio.shape[0])))
    freqs = np.fft.rfftfreq(audio.shape[0], 1.0 / SR)
    return float(np.sqrt(np.sum(spectrum[(freqs >= low) & (freqs <= high)] ** 2)))


def test_declick_removes_impulses_and_keeps_the_music(client: TestClient, tmp_path: Path) -> None:
    clean = _tone()
    clicked = clean.copy()
    positions = np.arange(5000, clean.shape[0] - 5000, 9001)
    clicked[positions] += 0.6
    pid, asset, _ = _setup(client, tmp_path, clicked)
    job = _ok(client, pid, "declick", asset["id"], {})
    assert job["result"]["repaired"] >= len(positions)
    out = _audio(client, pid, job["result_assets"][0]["id"])
    assert out.shape == clean.shape
    assert np.max(np.abs(out - clean)) < 0.05
    assert job["result_assets"][0]["name"] == "song (declicked)"


def test_declick_leaves_clean_audio_alone(client: TestClient, tmp_path: Path) -> None:
    pid, asset, source = _setup(client, tmp_path, _song(3.0))
    job = _ok(client, pid, "declick", asset["id"], {"sensitivity": 0.5})
    out = _audio(client, pid, job["result_assets"][0]["id"])
    assert _rms(out - source) < 0.02 * _rms(source)


@pytest.mark.parametrize("mains", [50, 60])
def test_dehum_detects_and_removes_mains_hum(client: TestClient, tmp_path: Path, mains: int):
    music = _tone(4.0, 440.0)
    t = np.arange(music.shape[0]) / SR
    hum = sum(0.1 / k * np.sin(2 * np.pi * mains * k * t) for k in (1, 2, 3))
    noisy = music + hum[:, None].astype(np.float32)
    pid, asset, _ = _setup(client, tmp_path, noisy)
    job = _ok(client, pid, "dehum", asset["id"], {})
    assert job["result"] == {"frequency": float(mains)}
    out = _audio(client, pid, job["result_assets"][0]["id"])
    middle = slice(SR // 2, -SR // 2)
    hum_before = _band(noisy[middle], mains - 2, mains + 2)
    assert _band(out[middle], mains - 2, mains + 2) < 0.05 * hum_before
    assert _band(out[middle], 430, 450) > 0.95 * _band(noisy[middle], 430, 450)


def test_declip_rebuilds_flattened_peaks(client: TestClient, tmp_path: Path) -> None:
    clean = _tone(2.0, 220.0, 0.9)
    clipped = np.clip(clean, -0.6, 0.6)
    pid, asset, _ = _setup(client, tmp_path, clipped)
    job = _ok(client, pid, "declip", asset["id"], {})
    assert job["result"]["clipped_samples"] > 1000 and job["result"]["repaired_regions"] > 100
    out = _audio(client, pid, job["result_assets"][0]["id"]).astype(np.float64)
    out /= 10 ** (job["result"]["gain_db"] / 20.0)
    middle = slice(2000, -2000)
    # The repair is closer to the original sine than the clipped version was.
    assert _rms(out[middle] - clean[middle]) < 0.5 * _rms(clipped[middle] - clean[middle])
    assert np.max(np.abs(out)) > 0.7


def test_declip_on_unclipped_audio_changes_nothing(client: TestClient, tmp_path: Path) -> None:
    pid, asset, source = _setup(client, tmp_path, _song(2.0))
    job = _ok(client, pid, "declip", asset["id"], {})
    assert job["result"]["repaired_regions"] == 0
    assert np.allclose(_audio(client, pid, job["result_assets"][0]["id"]), source, atol=1e-6)


def test_dereverb_shortens_a_decaying_tail(client: TestClient, tmp_path: Path) -> None:
    rng = np.random.default_rng(3)
    frames = SR * 3
    dry = np.zeros(frames)
    dry[SR // 2 : SR // 2 + 4000] = rng.standard_normal(4000) * 0.4
    impulse = rng.standard_normal(SR) * np.exp(-np.arange(SR) / (0.25 * SR)) * 0.05
    impulse[0] = 1.0
    wet = np.convolve(dry, impulse)[:frames]
    audio = np.stack([wet, wet], axis=1).astype(np.float32)
    pid, asset, _ = _setup(client, tmp_path, audio)
    job = _ok(client, pid, "dereverb", asset["id"], {"strength": 0.8})
    out = _audio(client, pid, job["result_assets"][0]["id"])
    burst = slice(SR // 2, SR // 2 + 4000)
    tail = slice(SR // 2 + 12000, SR // 2 + 40000)
    assert _rms(out[tail]) < 0.6 * _rms(audio[tail])
    assert _rms(out[burst]) > 0.7 * _rms(audio[burst])
    untouched = _ok(client, pid, "dereverb", asset["id"], {"strength": 0})
    assert np.allclose(_audio(client, pid, untouched["result_assets"][0]["id"]), audio, atol=1e-6)


@pytest.mark.parametrize("mode", ["attenuate", "heal"])
def test_spectral_repair_only_touches_the_selection(client: TestClient, tmp_path: Path, mode: str):
    base = _tone(4.0, 440.0, 0.2)
    t = np.arange(base.shape[0]) / SR
    intruder = 0.2 * np.sin(2 * np.pi * 3000.0 * t) * ((t > 1.5) & (t < 2.5))
    audio = base + intruder[:, None].astype(np.float32)
    pid, asset, _ = _setup(client, tmp_path, audio)
    params = {"start": 1.4, "end": 2.6, "freq_low": 2500, "freq_high": 3500, "mode": mode}
    job = _ok(client, pid, "spectral_repair", asset["id"], params)
    out = _audio(client, pid, job["result_assets"][0]["id"])
    inside = slice(int(1.6 * SR), int(2.4 * SR))
    assert _band(out[inside], 2900, 3100) < 0.1 * _band(audio[inside], 2900, 3100)
    assert _band(out[inside], 430, 450) > 0.97 * _band(audio[inside], 430, 450)
    # Audio well away from the selection is identical.
    assert np.allclose(out[:SR], audio[:SR], atol=1e-4)
    assert np.allclose(out[-SR:], audio[-SR:], atol=1e-4)


@pytest.mark.parametrize(
    ("op", "params"),
    [
        ("declick", {"sensitivity": 2}),
        ("dehum", {"frequency": 55}),
        ("dehum", {"harmonics": 40}),
        ("declip", {"threshold": 0.1}),
        ("dereverb", {"strength": -1}),
        ("spectral_repair", {"start": 1, "end": 2}),
        ("spectral_repair", {"start": 2, "end": 1, "freq_low": 10, "freq_high": 20}),
        ("spectral_repair", {"start": 1, "end": 2, "freq_low": 30, "freq_high": 20}),
        ("spectral_repair", {"start": 1, "end": 2, "freq_low": 10, "freq_high": 20, "mode": "x"}),
    ],
)
def test_restoration_requests_are_validated(client: TestClient, tmp_path: Path, op, params):
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    body = {"op": op, "asset_id": asset["id"], "params": params}
    assert client.post(f"/editor/projects/{pid}/jobs", json=body).status_code == 422


def test_plugin_description_rejects_bad_ids(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    assert client.get("/editor/plugins/not-an-id").status_code == 404
    assert client.get("/editor/plugins/" + "a" * 20).status_code == 404


# --- Warp, quantise, peaks -------------------------------------------------------------


def _clicks(times: list[float], seconds: float) -> np.ndarray:
    audio = np.zeros((int(SR * seconds), 2), dtype=np.float32)
    rng = np.random.default_rng(5)
    burst = (rng.standard_normal(600) * np.exp(-np.arange(600) / 80.0) * 0.6).astype(np.float32)
    for at in times:
        index = int(at * SR)
        audio[index : index + 600] += burst[:, None]
    audio += 0.05 * np.sin(2 * np.pi * 220 * np.arange(audio.shape[0]) / SR)[:, None]
    return audio.astype(np.float32)


def _click_near(audio: np.ndarray, expected: float, window: float = 0.2) -> float:
    """Time of the loudest sample within ``window`` seconds of ``expected``."""
    first = max(0, int((expected - window) * SR))
    region = np.abs(audio[first : int((expected + window) * SR), 0])
    assert region.max() > 0.1, f"no click near {expected:g}s"
    return (first + int(region.argmax())) / SR


def test_warp_moves_marked_moments_to_their_targets(client: TestClient, tmp_path: Path) -> None:
    pid, asset, source = _setup(client, tmp_path, _clicks([0.5, 1.0, 2.0, 3.0], 4.0))
    markers = [[0.9, 0.9], [1.9, 2.4], [2.9, 3.15]]
    job = _ok(client, pid, "warp", asset["id"], {"markers": markers})
    out = _audio(client, pid, job["result_assets"][0]["id"])
    assert abs(out.shape[0] / SR - 4.25) < 0.01
    assert job["result"]["anchors"][-1] == [4.0, 4.25]
    # Each click lands where the piecewise map sends it.
    for wanted in (0.5, 0.9 + 0.1 * 1.5, 2.4 + 0.1 * 0.75, 3.15 + 0.1):
        assert abs(_click_near(out, wanted) - wanted) < 0.03
    # Audio before the first moved marker is untouched.
    assert np.allclose(out[: int(0.85 * SR)], source[: int(0.85 * SR)], atol=1e-6)


@pytest.mark.parametrize(
    "markers",
    [
        [],
        "x",
        [[1.0]],
        [[2.0, 2.0], [1.0, 1.5]],
        [[1.0, 1.0], [1.05, 1.5]],
        [[1.0, 9.0]],
        [[1.0, 0.1]],
        [[1.0, "2"]],
    ],
)
def test_warp_requests_are_validated(client: TestClient, tmp_path: Path, markers: Any) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    body = {"op": "warp", "asset_id": asset["id"], "params": {"markers": markers}}
    assert client.post(f"/editor/projects/{pid}/jobs", json=body).status_code == 422


def test_quantize_pulls_drifting_beats_onto_the_grid(client: TestClient, tmp_path: Path) -> None:
    # A performance near 120 BPM whose beats wander by up to 80 ms.
    rng = np.random.default_rng(11)
    played = [0.5 + i * 0.5 + (0 if i == 0 else float(rng.uniform(-0.08, 0.08))) for i in range(14)]
    pid, asset, _ = _setup(client, tmp_path, _clicks(played, 8.0))
    job = _ok(client, pid, "quantize", asset["id"], {"bpm": 120})
    out = _audio(client, pid, job["result_assets"][0]["id"])
    grid = [played[0] + i * 0.5 for i in range(len(played))]
    after = [abs(_click_near(out, wanted) - wanted) for wanted in grid]
    before = [abs(t - wanted) for t, wanted in zip(played, grid, strict=True)]
    # The fallback beat tracker resolves about 23 ms, which bounds the result.
    assert max(after) < 0.04 < max(before)
    assert np.mean(after) < 0.5 * np.mean(before)
    assert job["result"]["bpm"] == 120


def test_quantize_fails_cleanly_without_beats(client: TestClient, tmp_path: Path) -> None:
    silence = np.zeros((SR * 2, 2), dtype=np.float32)
    pid, asset, _ = _setup(client, tmp_path, silence)
    job = _run(client, pid, "quantize", asset["id"], {"bpm": 120})
    assert job["status"] == "failed" and "beats" in job["error"]


def test_peaks_summarise_the_waveform_and_are_removed_with_the_asset(
    client: TestClient, tmp_path: Path
) -> None:
    pid, asset, source = _setup(client, tmp_path, _song(1.0))
    response = client.get(f"/editor/projects/{pid}/assets/{asset['id']}/peaks")
    assert response.status_code == 200
    header = np.frombuffer(response.content[:16], dtype="<u4")
    buckets = int(header[3])
    assert list(header[:3]) == [0x4B50534D, SR, source.shape[0]] and buckets == SR // 128
    body = np.frombuffer(response.content[16:], dtype=np.int8)
    low, high = body[:buckets] / 127.0, body[buckets:] / 127.0
    grouped = np.clip(source[: buckets * 128], -1.0, 1.0).reshape(buckets, -1)
    assert np.all(high >= grouped.max(axis=1) - 1e-6) and np.all(low <= grouped.min(axis=1) + 1e-6)
    assert np.max(high - grouped.max(axis=1)) < 0.02
    cached = projects.editor_root() / pid / "assets" / f"{asset['id']}.peaks"
    assert cached.is_file()
    assert client.delete(f"/editor/projects/{pid}/assets/{asset['id']}").status_code == 200
    assert not cached.exists()
    assert client.get(f"/editor/projects/{pid}/assets/not-a-uuid/peaks").status_code == 404


def test_processed_names_collect_steps_in_one_bracket(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(1.0))
    first = _ok(client, pid, "declick", asset["id"], {})["result_assets"][0]
    second = _ok(client, pid, "dehum", first["id"], {})["result_assets"][0]
    assert (first["name"], second["name"]) == ("song (declicked)", "song (declicked, dehummed)")


def test_plugin_audition_renders_only_the_requested_excerpt(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    fake = lambda audio, sr, pid, values: (audio * 0.5, "Fake")  # noqa: E731
    monkeypatch.setattr(plugins, "apply_plugin", fake)
    pid, asset, source = _setup(client, tmp_path, _song(4.0))
    params = {"plugin_id": "a" * 20, "parameters": {}, "preview_start": 1.0, "preview_seconds": 2}
    job = _ok(client, pid, "plugin", asset["id"], params)
    assert job["result"]["preview"] is True
    (created,) = job["result_assets"]
    assert created["name"] == "song (Fake, preview)"
    out = _audio(client, pid, created["id"])
    assert out.shape[0] == 2 * SR
    assert np.allclose(out, source[SR : 3 * SR] * 0.5, atol=1e-6)
    too_long = {**params, "preview_seconds": 120}
    body = {"op": "plugin", "asset_id": asset["id"], "params": too_long}
    assert client.post(f"/editor/projects/{pid}/jobs", json=body).status_code == 422


# --- Composition -----------------------------------------------------------------------


def _melody(pitches: list[int], note_seconds: float = 0.5) -> np.ndarray:
    parts = []
    for pitch in pitches:
        t = np.arange(int(SR * note_seconds)) / SR
        freq = 440.0 * 2 ** ((pitch - 69) / 12)
        envelope = np.minimum(1.0, t * 80) * np.minimum(1.0, (note_seconds - t) * 20)
        tone = sum(np.sin(2 * np.pi * freq * k * t) / k for k in (1, 2, 3))
        parts.append(0.25 * envelope * tone)
        parts.append(np.zeros(int(SR * 0.1)))
    mono = np.concatenate(parts)
    return np.stack([mono, mono], axis=1).astype(np.float32)


def test_to_midi_transcribes_a_melody(client: TestClient, tmp_path: Path) -> None:
    pitches = [60, 64, 67, 72, 67, 62]
    pid, asset, _ = _setup(client, tmp_path, _melody(pitches))
    job = _ok(client, pid, "to_midi", asset["id"], {})
    assert job["result_assets"] == [] and job["result"]["engine"] == "pyin"
    notes = job["result"]["notes"]
    assert [note["p"] for note in notes] == pitches
    for index, note in enumerate(notes):
        assert abs(note["t"] - index * 0.6) < 0.04
        assert abs(note["d"] - 0.5) < 0.08
        assert 0 < note["v"] <= 1


def test_to_midi_fails_cleanly_on_silence(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, np.zeros((SR * 2, 2), dtype=np.float32))
    job = _run(client, pid, "to_midi", asset["id"], {})
    assert job["status"] == "failed" and "notes" in job["error"]


def _section(chord: list[float], seconds: float, bright: bool, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    t = np.arange(int(SR * seconds)) / SR
    harmonics = (1, 2, 3, 4, 5, 6) if bright else (1,)
    mono = sum(np.sin(2 * np.pi * f * k * t) / k for f in chord for k in harmonics) * 0.08
    beat = np.zeros_like(t)
    burst = rng.standard_normal(1500) * np.exp(-np.arange(1500) / 250.0) * 0.3
    for start in np.arange(0, seconds - 0.1, 0.5):
        index = int(start * SR)
        beat[index : index + 1500] += burst[: len(t) - index]
    return mono + beat


def test_structure_finds_sections_and_labels_repeats_alike(client: TestClient, tmp_path: Path):
    verse = [220.0, 261.63, 329.63]
    chorus = [174.61, 220.0, 349.23, 523.25]
    parts = [_section(verse if i % 2 == 0 else chorus, 16.0, i % 2 == 1, i + 1) for i in range(4)]
    mono = np.concatenate(parts)
    pid, asset, _ = _setup(client, tmp_path, np.stack([mono, mono], axis=1).astype(np.float32))
    job = _ok(client, pid, "structure", asset["id"], {})
    sections = job["result"]["sections"]
    assert sections[0]["start"] == 0.0 and abs(sections[-1]["end"] - 64.0) < 0.01
    for a, b in itertools.pairwise(sections):
        assert a["end"] == b["start"]
    # Every real change of section is found to within a second and a half.
    starts = [section["start"] for section in sections]
    for boundary in (16.0, 32.0, 48.0):
        assert min(abs(start - boundary) for start in starts) < 1.5

    def label_at(time: float) -> str:
        return next(s["label"] for s in sections if s["start"] <= time < s["end"])

    assert label_at(8) == label_at(40) and label_at(24) == label_at(56)
    assert label_at(8) != label_at(24)


def test_structure_rejects_short_audio(client: TestClient, tmp_path: Path) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(3.0))
    job = _run(client, pid, "structure", asset["id"], {})
    assert job["status"] == "failed" and "short" in job["error"]


def test_structure_on_a_shorter_song_still_finds_every_change(client: TestClient, tmp_path: Path):
    verse = [220.0, 261.63, 329.63]
    chorus = [174.61, 220.0, 349.23, 523.25]
    parts = [_section(verse if i % 2 == 0 else chorus, 12.0, i % 2 == 1, i + 1) for i in range(4)]
    mono = np.concatenate(parts)
    pid, asset, _ = _setup(client, tmp_path, np.stack([mono, mono], axis=1).astype(np.float32))
    sections = _ok(client, pid, "structure", asset["id"], {})["result"]["sections"]
    assert [section["label"] for section in sections] == ["A", "B", "A", "B"]
    for section, boundary in zip(sections[1:], (12.0, 24.0, 36.0), strict=True):
        assert abs(section["start"] - boundary) < 1.5


# --- Generation through ComfyUI --------------------------------------------------------


class _FakeResponse:
    def __init__(self, status: int = 200, payload: Any = None, content: bytes = b"") -> None:
        self.status_code = status
        self._payload = payload
        self.content = content

    def json(self) -> Any:
        return self._payload


def _fake_comfy(monkeypatch: pytest.MonkeyPatch, audio_bytes: bytes, *, node: bool = True):
    """Stand in for a local ComfyUI: answers the handful of routes the editor uses."""
    from audioqi.editor import generation

    seen: dict[str, Any] = {"polls": 0}
    models = ["facebook/musicgen-small", "facebook/musicgen-stereo-medium"]

    def fake_get(path: str, timeout: float, **params: Any) -> _FakeResponse:
        if path == "/system_stats":
            return _FakeResponse(payload={"system": {}})
        if path.startswith("/object_info/"):
            described = {"input": {"required": {"model_name": [models, {}]}}}
            return _FakeResponse(payload={generation.SYNTH_NODE: described} if node else {})
        if path.startswith("/history/"):
            seen["polls"] += 1
            if seen["polls"] < 2:
                return _FakeResponse(payload={})
            item = {"filename": "editor_00001_.flac", "subfolder": "music_suite", "type": "output"}
            return _FakeResponse(payload={"abc": {"outputs": {"2": {"audio": [item]}}}})
        if path == "/view":
            seen["view"] = params
            return _FakeResponse(content=audio_bytes)
        return _FakeResponse(status=404)

    def fake_post(path: str, payload: dict[str, Any], timeout: float) -> _FakeResponse:
        seen["graph"] = payload["prompt"]
        return _FakeResponse(payload={"prompt_id": "abc"})

    monkeypatch.setattr(generation, "_get", fake_get)
    monkeypatch.setattr(generation, "_post", fake_post)
    monkeypatch.setattr(generation.time, "sleep", lambda _seconds: None)
    return seen


def test_generate_runs_the_workflow_and_imports_the_result(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "gen.flac"
    sf.write(str(generated), _song(2.0), SR, format="FLAC")
    seen = _fake_comfy(monkeypatch, generated.read_bytes())
    status = client.get("/editor/generation").json()
    assert status["available"] and status["node_installed"] and len(status["models"]) == 2

    pid, asset, _ = _setup(client, tmp_path, _song(1.0))
    params = {"prompt": "  warm   bass line\n", "seconds": 8, "bpm": 100, "model": "nope"}
    job = _ok(client, pid, "generate", asset["id"], params)
    (created,) = job["result_assets"]
    assert created["name"] == "warm bass line (generated)" and created["sample_rate"] == SR
    assert abs(created["duration_seconds"] - 2.0) < 0.01
    inputs = seen["graph"]["1"]["inputs"]
    assert (inputs["prompt"], inputs["bpm"], inputs["duration"]) == ("warm bass line", 100, 8)
    # A model the server does not offer falls back to one it does.
    assert inputs["model_name"] == "facebook/musicgen-small" == job["result"]["model"]
    assert seen["graph"]["2"] == {
        "class_type": "SaveAudio",
        "inputs": {"audio": ["1", 0], "filename_prefix": "music_suite/editor"},
    }
    assert seen["view"]["filename"] == "editor_00001_.flac"


def test_generate_fails_cleanly_without_comfyui_or_its_nodes(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from audioqi.editor import generation

    def refuse(*_args: Any, **_kwargs: Any) -> Any:
        raise generation.requests.ConnectionError("refused")

    monkeypatch.setattr(generation, "_get", refuse)
    assert client.get("/editor/generation").json() == {
        "available": False,
        "node_installed": False,
        "models": [],
    }
    pid, asset, _ = _setup(client, tmp_path, _song(1.0))
    job = _run(client, pid, "generate", asset["id"], {"prompt": "drums"})
    assert job["status"] == "failed" and "ComfyUI is not running" in job["error"]

    _fake_comfy(monkeypatch, b"", node=False)
    job = _run(client, pid, "generate", asset["id"], {"prompt": "drums"})
    assert job["status"] == "failed" and "not installed" in job["error"]


@pytest.mark.parametrize(
    "params",
    [{}, {"prompt": "x"}, {"prompt": "ok then", "seconds": 999}, {"prompt": "ok then", "url": "x"}],
)
def test_generate_requests_are_validated(client: TestClient, tmp_path: Path, params: Any) -> None:
    pid, asset, _ = _setup(client, tmp_path, _song(0.5))
    body = {"op": "generate", "asset_id": asset["id"], "params": params}
    assert client.post(f"/editor/projects/{pid}/jobs", json=body).status_code == 422


def test_comfyui_address_must_be_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    from audioqi.editor import generation

    monkeypatch.setenv("MUSIC_SUITE_COMFYUI_URL", "http://example.com:8188")
    with pytest.raises(projects.EditorError):
        generation.base_url()
    monkeypatch.setenv("MUSIC_SUITE_COMFYUI_URL", "http://localhost:9000/")
    assert generation.base_url() == "http://localhost:9000"
