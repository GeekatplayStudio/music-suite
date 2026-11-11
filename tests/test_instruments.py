"""Instrument plugins: MIDI rendering, the plugin window and the one-click installer.

No real plugin is ever loaded here: a stand-in object plays the plugin's part.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import stat
import tarfile
import threading
import zipfile
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

import apps.api.editor as editor_api
import apps.api.main as api_main
from audioqi.editor import engines, instruments, plugin_worker, plugins, projects

SR = 48_000
PLUGIN_ID = "b" * 20


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "d"))
    monkeypatch.setenv(engines.FORCE_FALLBACK_ENV, "1")
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, fn: fn())
    plugins.reset_cache()
    with TestClient(api_main.app) as test_client:
        yield test_client
    plugins.reset_cache()


def _project(client: TestClient) -> str:
    response = client.post("/editor/projects", json={"name": "Synths"})
    assert response.status_code == 200
    return str(response.json()["id"])


def _job(client: TestClient, pid: str, op: str, params: dict[str, Any]) -> dict[str, Any]:
    body = {"op": op, "asset_id": None, "params": params}
    response = client.post(f"/editor/projects/{pid}/jobs", json=body)
    assert response.status_code == 200, response.text
    return client.get(f"/editor/projects/{pid}/jobs/{response.json()['id']}").json()


# --------------------------------------------------------------------------- the worker


class FakeInstrument:
    """Behaves like a Pedalboard instrument: a sine per held note.

    Like Surge XT, a restored sound takes effect on the next audio block, and that
    block is silent.
    """

    is_instrument = True

    def __init__(self) -> None:
        self._state = b"factory"
        self._pending: bytes | None = None
        self.parameters: dict[str, Any] = {}
        self.shown = False

    @property
    def raw_state(self) -> bytes:
        return self._state

    @raw_state.setter
    def raw_state(self, value: bytes) -> None:
        self._pending = bytes(value)

    def __call__(self, messages, duration, sample_rate, num_channels=2, reset=True):
        frames = int(duration * sample_rate)
        out = np.zeros((num_channels, frames), dtype=np.float32)
        if self._pending is not None:
            self._state, self._pending = self._pending, None
            return out
        held: dict[int, float] = {}
        level = 0.5 if self._state == b"loud" else 0.1
        for message, at in messages:
            status, pitch = message[0] & 0xF0, message[1]
            if status == 0x90:
                held[pitch] = at
            elif status == 0x80 and pitch in held:
                start, end = int(held.pop(pitch) * sample_rate), int(at * sample_rate)
                t = np.arange(end - start) / sample_rate
                freq = 440.0 * 2 ** ((pitch - 69) / 12)
                out[:, start:end] += level * np.sin(2 * np.pi * freq * t)
        return out

    def show_editor(self, close_event=None) -> None:
        self.shown = True
        if getattr(self, "wait_for_close", False):
            # Like a real window: stays open until the app asks it to close.
            assert close_event is not None and close_event.wait(5)
        self.shown_with = self._state
        self._state = b"tweaked in the window"


def test_midi_events_put_note_offs_before_note_ons_at_the_same_time() -> None:
    notes = [{"t": 0.5, "d": 0.5, "p": 60, "v": 1.0}, {"t": 0.0, "d": 0.5, "p": 60, "v": 0.5}]
    events = plugin_worker.midi_events(notes)
    assert [(m[0], m[1], m[2], t) for m, t in events] == [
        (0x90, 60, 64, 0.0),
        (0x80, 60, 0, 0.5),
        (0x90, 60, 127, 0.5),
        (0x80, 60, 0, 1.0),
    ]


def test_worker_renders_notes_through_an_instrument(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(plugin_worker, "_load", lambda _path: FakeInstrument())
    request = {
        "mode": "instrument",
        "plugin": "x",
        "notes": [{"t": 0.25, "d": 0.5, "p": 69, "v": 0.8}],
        "seconds": 1.0,
        "sample_rate": SR,
        "state": base64.b64encode(b"loud").decode(),
    }
    path = tmp_path / "request.json"
    path.write_text(json.dumps(request))
    dst = tmp_path / "out.wav"
    outcome = plugin_worker.run(path, tmp_path / "unused.wav", dst)
    assert outcome == {"ok": True, "is_instrument": True}
    audio, sr = sf.read(str(dst), always_2d=True)
    assert sr == SR and audio.shape == (SR, 2)
    assert np.abs(audio[: SR // 4 - 10]).max() == 0.0
    note = audio[SR // 4 : 3 * SR // 4, 0]
    assert 0.45 < np.abs(note).max() <= 0.5  # The saved "loud" sound was restored.
    spectrum = np.abs(np.fft.rfft(note))
    assert abs(np.argmax(spectrum) * SR / len(note) - 440.0) < 3.0


def test_worker_refuses_effects_and_damaged_sounds(tmp_path: Path, monkeypatch) -> None:
    effect = FakeInstrument()
    effect.is_instrument = False  # type: ignore[misc]
    monkeypatch.setattr(plugin_worker, "_load", lambda _path: effect)
    request = {"plugin": "x", "notes": [], "seconds": 1.0}
    assert plugin_worker.render_instrument(request, tmp_path / "o.wav")["error"] == (
        "it is an audio effect, not an instrument"
    )
    monkeypatch.setattr(plugin_worker, "_load", lambda _path: FakeInstrument())
    damaged = {**request, "state": "not base64!"}
    assert plugin_worker.render_instrument(damaged, tmp_path / "o.wav")["error"] == (
        "the saved sound is damaged"
    )


def test_worker_window_mode_returns_the_sound_set_in_the_window(monkeypatch) -> None:
    fake = FakeInstrument()
    monkeypatch.setattr(plugin_worker, "_load", lambda _path: fake)
    outcome = plugin_worker.open_editor({"plugin": "x", "state": base64.b64encode(b"a").decode()})
    assert fake.shown and outcome["ok"] and outcome["is_instrument"]
    assert fake.shown_with == b"a"  # The window opened on the saved sound, not the default.
    assert base64.b64decode(outcome["state"]) == b"tweaked in the window"


def test_the_app_can_close_the_window_and_keep_the_sound(tmp_path: Path, monkeypatch) -> None:
    fake = FakeInstrument()
    fake.wait_for_close = True  # type: ignore[attr-defined]
    monkeypatch.setattr(plugin_worker, "_load", lambda _path: fake)
    close_file = tmp_path / "close"
    plugins._windows["job-1"] = close_file
    try:
        timer = threading.Timer(0.3, lambda: plugins.close_plugin_window("job-1"))
        timer.start()
        outcome = plugin_worker.open_editor({"plugin": "x", "close_file": str(close_file)})
        timer.join()
    finally:
        plugins._windows.pop("job-1", None)
    assert outcome["ok"] and base64.b64decode(outcome["state"]) == b"tweaked in the window"
    assert plugins.close_plugin_window("job-1") is False  # Nothing open any more.


def test_close_window_is_only_for_plugin_window_jobs(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    monkeypatch.setattr(plugins, "render_instrument", lambda *a: (np.zeros((SR, 2)), "Surge XT"))
    pid = _project(client)
    job = _job(
        client, pid, "render_instrument", {"plugin_id": PLUGIN_ID, "notes": NOTES, "seconds": 1}
    )
    response = client.post(f"/editor/projects/{pid}/jobs/{job['id']}/close-window")
    assert response.status_code == 422
    saved = base64.b64encode(b"s").decode()
    monkeypatch.setattr(
        plugins, "open_plugin_window", lambda *a: {"plugin": "Surge XT", "state": saved}
    )
    window = _job(client, pid, "plugin_window", {"plugin_id": PLUGIN_ID})
    response = client.post(f"/editor/projects/{pid}/jobs/{window['id']}/close-window")
    assert response.status_code == 200 and response.json()["status"] == "completed"


def test_worker_process_reports_an_unloadable_plugin(tmp_path: Path, client) -> None:
    item = {"id": PLUGIN_ID, "name": "Missing", "format": "vst3", "path": tmp_path / "no.vst3"}
    with pytest.raises(projects.EditorError, match="could not be loaded"):
        plugins._run_worker(
            item, {"mode": "instrument", "notes": [], "seconds": 1}, 60, audio_out=True
        )


# --------------------------------------------------------------------------- jobs


NOTES = [{"t": 0.0, "d": 0.5, "p": 60, "v": 0.9}, {"t": 0.5, "d": 0.5, "p": 64}]


def test_render_instrument_job_creates_an_audio_asset(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    seen: dict[str, Any] = {}

    def fake_render(plugin_id, notes, seconds, sample_rate, state):
        seen.update(plugin_id=plugin_id, notes=notes, seconds=seconds, state=state)
        audio = np.full((int(seconds * sample_rate), 2), 0.1, dtype=np.float32)
        return audio, "Surge XT"

    monkeypatch.setattr(plugins, "render_instrument", fake_render)
    pid = _project(client)
    late = {"t": 30.0, "d": 1.0, "p": 70}
    params = {
        "plugin_id": PLUGIN_ID,
        "notes": [*NOTES, late],
        "seconds": 2.0,
        "name": "Bass clip",
        "state": base64.b64encode(b"patch").decode(),
    }
    job = _job(client, pid, "render_instrument", params)
    assert job["status"] == "completed", job["error"]
    (created,) = job["result_assets"]
    assert created["name"] == "Bass clip (Surge XT)" and created["duration_seconds"] == 2.0
    assert job["result"] == {"plugin": "Surge XT", "engine": "pedalboard", "silent": False}
    assert seen["notes"][1]["v"] == 0.8 and len(seen["notes"]) == 2  # Late note dropped.
    assert seen["state"] == params["state"]


@pytest.mark.parametrize(
    "change",
    [
        {"notes": []},
        {"notes": [{"t": 0, "d": 1, "p": 128}]},
        {"notes": [{"t": 0, "d": 1, "p": 60.5}]},
        {"notes": [{"t": 0, "d": 1, "p": 60, "x": 1}]},
        {"notes": [{"t": 5, "d": 1, "p": 60}], "seconds": 1},
        {"seconds": 0},
        {"state": "abc"},
        {"state": "ab$="},
        {"plugin_id": "../../etc"},
        {"sample_rate": 12345},
        {"name": ""},
        {"path": "/tmp/x.vst3"},
    ],
)
def test_render_instrument_requests_are_validated(client: TestClient, change) -> None:
    pid = _project(client)
    params = {"plugin_id": PLUGIN_ID, "notes": NOTES, "seconds": 2.0, **change}
    body = {"op": "render_instrument", "asset_id": None, "params": params}
    assert client.post(f"/editor/projects/{pid}/jobs", json=body).status_code == 422


def test_plugin_window_job_returns_the_saved_sound(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    saved = base64.b64encode(b"new sound").decode()
    monkeypatch.setattr(
        plugins,
        "open_plugin_window",
        lambda plugin_id, state, key: {"plugin": "Surge XT", "state": saved, "is_instrument": True},
    )
    job = _job(client, _project(client), "plugin_window", {"plugin_id": PLUGIN_ID})
    assert job["status"] == "completed" and job["result_assets"] == []
    assert job["result"]["state"] == saved and job["result"]["is_instrument"] is True


def test_instrument_jobs_fail_cleanly_without_plugin_hosting(client: TestClient, monkeypatch):
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: False)
    job = _job(
        client,
        _project(client),
        "render_instrument",
        {
            "plugin_id": PLUGIN_ID,
            "notes": NOTES,
            "seconds": 1.0,
        },
    )
    assert job["status"] == "failed" and "Pedalboard" in job["error"]


def test_describe_checks_whether_a_plugin_is_an_instrument(client, monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    item = {"id": PLUGIN_ID, "name": "Surge XT", "format": "vst3", "path": tmp_path}
    monkeypatch.setattr(plugins, "_plugins", lambda refresh=False: {PLUGIN_ID: item})
    plugins._parameters[PLUGIN_ID] = []
    plugins._instruments[PLUGIN_ID] = True
    response = client.get(f"/editor/plugins/{PLUGIN_ID}")
    assert response.status_code == 400 and "instrument" in response.json()["detail"]
    response = client.get(f"/editor/plugins/{PLUGIN_ID}?instrument=true")
    assert response.status_code == 200 and response.json()["is_instrument"] is True
    listed = client.get("/editor/plugins").json()["plugins"]
    assert listed[0]["is_instrument"] is True


# --------------------------------------------------------------------------- installer


def _zip(path: Path, entries: dict[str, bytes], *, link: str | None = None) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        for name, data in entries.items():
            info = zipfile.ZipInfo(name)
            info.external_attr = (stat.S_IFREG | 0o755) << 16
            zf.writestr(info, data)
        if link:
            info = zipfile.ZipInfo(link)
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            zf.writestr(info, "/etc/passwd")
    return path


def _tar(path: Path, entries: dict[str, bytes]) -> Path:
    with tarfile.open(path, "w:gz") as tf:
        for name, data in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return path


def test_bundle_extraction_takes_only_the_plugin(tmp_path: Path) -> None:
    archive = _zip(
        tmp_path / "p.zip",
        {
            "Surge XT.vst3/Contents/MacOS/Surge XT": b"binary",
            "Surge XT.vst3/Contents/Info.plist": b"plist",
            "Surge XT.app/Contents/MacOS/Surge XT": b"app",
            "../evil": b"x",
        },
    )
    out = instruments._extract_bundle(archive, "Surge XT.vst3", tmp_path / "out")
    files = sorted(
        p.relative_to(tmp_path / "out").as_posix() for p in out.rglob("*") if p.is_file()
    )
    assert files == ["Surge XT.vst3/Contents/Info.plist", "Surge XT.vst3/Contents/MacOS/Surge XT"]
    assert not (tmp_path / "evil").exists()
    linked = _zip(tmp_path / "l.zip", {"Surge XT.vst3/a": b"a"}, link="Surge XT.vst3/b")
    with pytest.raises(instruments.InstallError, match="link"):
        instruments._extract_bundle(linked, "Surge XT.vst3", tmp_path / "out2")


def test_content_extraction_rejects_paths_outside_the_target(tmp_path: Path) -> None:
    archive = _tar(
        tmp_path / "c.tar.gz",
        {
            "./Surge Synth Team/SurgeXTData/patches_factory/Bass/One.fxp": b"patch",
            "./README.txt": b"readme",
            "../SurgeXTData/escape": b"x",
        },
    )
    out = instruments._extract_content(archive, "SurgeXTData", tmp_path / "c")
    assert (out / "patches_factory" / "Bass" / "One.fxp").read_bytes() == b"patch"
    assert sorted(p.name for p in (tmp_path / "c").rglob("*") if p.is_file()) == ["One.fxp"]
    assert not (tmp_path / "SurgeXTData").exists()


def _spec(path: Path) -> instruments.Download:
    data = path.read_bytes()
    return instruments.Download(path.as_uri(), len(data), hashlib.sha256(data).hexdigest())


def test_install_checks_every_download_and_places_the_files(tmp_path: Path, monkeypatch) -> None:
    plugin = _zip(tmp_path / "p.zip", {"Surge XT.vst3/Contents/Info.plist": b"plist"})
    content = _tar(tmp_path / "c.tar.gz", {"./T/SurgeXTData/wavetables/a.wav": b"wave"})
    platform = instruments.sys.platform
    item = replace(
        instruments.CATALOG["surge-xt"], plugin={platform: _spec(plugin)}, content=_spec(content)
    )
    monkeypatch.setitem(instruments.CATALOG, "surge-xt", item)
    vst3, data = tmp_path / "VST3", tmp_path / "Application Support" / "Surge XT"
    monkeypatch.setattr(instruments, "user_vst3_dir", lambda: vst3)
    monkeypatch.setattr(instruments, "content_dir", lambda _item: data)
    monkeypatch.setattr(plugins, "plugin_dirs", lambda: [(vst3, "*.vst3", "vst3")])
    monkeypatch.setattr(instruments, "UNPACK_BYTES", 0)

    def fake_fetch(spec, dest, report, span):
        dest.write_bytes(Path(spec.url.removeprefix("file://")).read_bytes())
        if hashlib.sha256(dest.read_bytes()).hexdigest() != spec.sha256:
            raise instruments.InstallError("mismatch")
        report(span[1], "ok")

    monkeypatch.setattr(instruments, "_fetch", fake_fetch)
    steps: list[float] = []
    instruments.install("surge-xt", lambda percent, _detail: steps.append(percent))
    assert (vst3 / "Surge XT.vst3" / "Contents" / "Info.plist").read_bytes() == b"plist"
    assert (data / "wavetables" / "a.wav").read_bytes() == b"wave"
    assert steps == sorted(steps) and steps[-1] == 100.0
    assert [p.name for p in vst3.iterdir()] == ["Surge XT.vst3"]  # Staging was cleaned up.
    assert instruments.list_instruments()[0]["installed"] is True


def test_fetch_rejects_a_file_that_does_not_match(tmp_path: Path, monkeypatch) -> None:
    class Response:
        status_code = 200

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def iter_content(self, _size):
            yield b"tampered"

    monkeypatch.setattr(instruments.requests, "get", lambda *a, **k: Response())
    monkeypatch.setattr(instruments.time, "sleep", lambda _s: None)
    spec = instruments.Download("https://example.invalid/x", 8, "0" * 64)
    with pytest.raises(instruments.InstallError, match="did not match"):
        instruments._fetch(spec, tmp_path / "x", lambda *_: None, (0.0, 1.0))
    assert not (tmp_path / "x").exists()


def test_instrument_routes(client: TestClient, monkeypatch) -> None:
    listed = client.get("/editor/instruments").json()
    assert [item["id"] for item in listed] == ["surge-xt"]
    assert listed[0]["license"] == "GPL-3.0" and listed[0]["running"] is False
    assert client.post("/editor/instruments/nope/install").status_code == 404
    started: list[str] = []
    monkeypatch.setattr(
        instruments, "start_background", lambda iid: started.append(iid) or {"id": iid}
    )
    assert client.post("/editor/instruments/surge-xt/install").status_code == 200
    assert started == ["surge-xt"]


def test_pinned_downloads_are_complete() -> None:
    for item in instruments.CATALOG.values():
        specs = [*item.plugin.values(), *([item.content] if item.content else [])]
        for spec in specs:
            assert spec.url.startswith("https://github.com/surge-synthesizer/releases-xt/")
            assert spec.size > 1_000_000 and len(spec.sha256) == 64
