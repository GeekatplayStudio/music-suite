"""Instrument plugins: MIDI rendering, the plugin window and the one-click installer.

No real plugin is ever loaded here: a stand-in object plays the plugin's part.
"""

from __future__ import annotations

import base64
import hashlib
import io
import itertools
import json
import stat
import struct
import tarfile
import threading
import time
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
from audioqi.editor import engines, instruments, plugin_worker, plugins, projects, sounds

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


@pytest.fixture(autouse=True)
def no_speakers(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never open the computer's audio output."""
    monkeypatch.setattr(plugin_worker, "_output_stream", lambda: None)


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

    Like Surge XT, a restored sound, or one picked in the window, takes effect on
    the next audio block, and that block is silent.
    """

    is_instrument = True

    def __init__(self) -> None:
        self._state = b"factory"
        self._pending: bytes | None = None
        self.held: dict[int, int] = {}  # pitch -> samples played so far
        self.parameters: dict[str, Any] = {}
        self.shown = False

    @property
    def raw_state(self) -> bytes:
        return self._state

    @raw_state.setter
    def raw_state(self, value: bytes) -> None:
        self._pending = bytes(value)

    def __call__(self, messages, duration, sample_rate, num_channels=2, buffer_size=0, reset=True):
        frames = int(duration * sample_rate)
        out = np.zeros((num_channels, frames), dtype=np.float32)
        if reset:
            self.held = {}
        if self._pending is not None:
            self._state, self._pending = self._pending, None
            return out
        level = 0.5 if self._state == b"loud" else 0.1
        # Notes stay held across blocks, like a real instrument.
        cuts = sorted({0, frames, *(min(frames, int(at * sample_rate)) for _, at in messages)})
        queue = sorted(messages, key=lambda e: e[1])
        for begin, end in itertools.pairwise(cuts):
            while queue and int(queue[0][1] * sample_rate) <= begin:
                message, _ = queue.pop(0)
                status, pitch = message[0] & 0xF0, message[1]
                if status == 0x90:
                    self.held[pitch] = 0
                elif status == 0x80 or (status == 0xB0 and pitch in (120, 123)):
                    for key in [pitch] if status == 0x80 else list(self.held):
                        self.held.pop(key, None)
            for pitch, played in self.held.items():
                t = (played + np.arange(end - begin)) / sample_rate
                freq = 440.0 * 2 ** ((pitch - 69) / 12)
                out[:, begin:end] += level * np.sin(2 * np.pi * freq * t)
                self.held[pitch] = played + end - begin
        while queue:  # Messages exactly at the end of the block.
            message, _ = queue.pop(0)
            if message[0] & 0xF0 == 0x80:
                self.held.pop(message[1], None)
        return out

    def show_editor(self, close_event=None) -> None:
        self.shown = True
        if getattr(self, "wait_for_close", False):
            # Like a real window: stays open until the app asks it to close.
            assert close_event is not None and close_event.wait(5)
        self.shown_with = self._state
        # Like Surge XT, a sound picked in the window loads on the next audio block.
        self._pending = b"tweaked in the window"


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
    plugins._windows["job-1"] = tmp_path
    try:
        timer = threading.Timer(0.3, lambda: plugins.close_plugin_window("job-1"))
        timer.start()
        outcome = plugin_worker.open_editor({"plugin": "x", "control_dir": str(tmp_path)})
        timer.join()
    finally:
        plugins._windows.pop("job-1", None)
    assert outcome["ok"] and base64.b64decode(outcome["state"]) == b"tweaked in the window"
    assert plugins.close_plugin_window("job-1") is False  # Nothing open any more.


def test_live_preview_loops_the_notes_in_blocks() -> None:
    preview = plugin_worker.LivePreview(
        [{"t": 0.0, "d": 0.5, "p": 60, "v": 1.0}, {"t": 0.75, "d": 0.5, "p": 64, "v": 1.0}], 1.0
    )
    assert preview.block(0.5) == []  # Silent until asked to play.
    preview.play()
    first = preview.block(0.5)
    assert [(m[0], m[1], t) for m, t in first] == [(0x90, 60, 0.0)]
    second = preview.block(0.75)  # Crosses the loop end at 0.5 s into this block.
    starts = [(m[0], m[1], round(t, 3)) for m, t in second if m[0] in (0x80, 0x90)]
    assert (0x80, 60, 0.0) in starts and (0x90, 64, 0.25) in starts
    assert (0x80, 64, 0.5) in starts  # Cut at the loop end...
    assert any(m[0] == 0xB0 and m[1] == 123 for m, _ in second)  # ...then all notes off,
    assert (0x90, 60, 0.5) in starts  # and the loop starts again.
    preview.stop()
    assert [m[1] for m, _ in preview.block(0.1)] == [123, 120]
    assert preview.block(0.1) == []


def test_the_window_plays_the_preview_through_the_speakers(tmp_path: Path, monkeypatch) -> None:
    class Speakers:
        sample_rate = 48000.0
        num_output_channels = 2

        def __init__(self) -> None:
            self.written: list[np.ndarray] = []

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def write(self, audio, rate):
            assert rate == self.sample_rate and audio.shape[0] == 2
            self.written.append(np.array(audio))
            time.sleep(audio.shape[1] / rate / 4)

    speakers = Speakers()
    monkeypatch.setattr(plugin_worker, "_output_stream", lambda: speakers)
    fake = FakeInstrument()
    fake.wait_for_close = True  # type: ignore[attr-defined]
    monkeypatch.setattr(plugin_worker, "_load", lambda _path: fake)

    def drive() -> None:
        time.sleep(0.2)
        (tmp_path / "play").touch()
        time.sleep(0.5)
        (tmp_path / "close").touch()

    threading.Thread(target=drive).start()
    request = {
        "plugin": "x",
        "control_dir": str(tmp_path),
        "notes": [{"t": 0.0, "d": 2.0, "p": 69, "v": 1.0}],
        "seconds": 2.0,
    }
    outcome = plugin_worker.open_editor(request)
    assert outcome["ok"] and outcome["preview"] == "speakers"
    heard = np.concatenate(speakers.written, axis=1)
    assert np.abs(heard[:, :2048]).max() == 0.0  # Silence before Play.
    assert np.abs(heard).max() > 0.05  # The note was heard after Play.
    assert not (tmp_path / "play").exists()  # The command was taken.


def test_preview_commands_reach_only_an_open_window(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(plugins, "window_command", lambda key, cmd: sent.append((key, cmd)) or True)
    seen: dict[str, Any] = {}

    def fake_window(plugin_id, state, key, notes, seconds, **options):
        seen.update(notes=notes, seconds=seconds)
        # While the window is "open", the job is running: send commands then.
        pid_ = seen["pid"]
        assert (
            client.post(
                f"/editor/projects/{pid_}/jobs/{key}/preview", json={"play": True}
            ).status_code
            == 200
        )
        assert (
            client.post(
                f"/editor/projects/{pid_}/jobs/{key}/preview", json={"play": "x"}
            ).status_code
            == 422
        )
        assert (
            client.post(
                f"/editor/projects/{pid_}/jobs/{key}/preview", json={"play": False}
            ).status_code
            == 200
        )
        return {"plugin": "Surge XT", "state": base64.b64encode(b"s").decode()}

    monkeypatch.setattr(plugins, "open_plugin_window", fake_window)
    pid = seen["pid"] = _project(client)
    job = _job(client, pid, "plugin_window", {"plugin_id": PLUGIN_ID, "notes": NOTES, "seconds": 2})
    assert job["status"] == "completed", job["error"]
    assert [cmd for _, cmd in sent] == ["play", "stop"] and seen["seconds"] == 2.0
    assert [n["p"] for n in seen["notes"]] == [60, 64]
    # Once the window has closed, commands are accepted but go nowhere.
    client.post(f"/editor/projects/{pid}/jobs/{job['id']}/preview", json={"play": True})
    assert len(sent) == 2


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
        plugins, "open_plugin_window", lambda *a, **k: {"plugin": "Surge XT", "state": saved}
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
        lambda *_args, **_kw: {"plugin": "Surge XT", "state": saved, "is_instrument": True},
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


# --------------------------------------------------------------------------- sound library


def _fxp(name: str, body: bytes = b"<patch/>") -> bytes:
    """A minimal Surge XT patch file: 60-byte header, then the sub3 chunk."""
    chunk = b"sub3" + struct.pack("<I", len(body)) + bytes(8) + body
    header = b"CcnK" + bytes(4) + b"FPCh" + bytes(8) + name.encode()[:28].ljust(36, b"\x00")
    header = header.ljust(56, b"\x00")
    return header + struct.pack(">I", len(chunk)) + chunk


def test_juce_text_encoding_round_trips() -> None:
    for data in (b"", b"a", b"ab", b"abc", bytes(range(256)) * 3):
        text = sounds.juce_encode(data)
        assert text.startswith(f"{len(data)}.") and sounds.juce_decode(text) == data
    # JUCE packs bits least significant first: 0x41 is 01|000001, so "A" (1) then "A" (1).
    assert sounds.juce_encode(b"\x41") == "1.AA"
    assert sounds.juce_encode(b"\xff") == "1.+C"  # 111111 (63) then 11 (3).


def test_a_patch_file_becomes_a_saved_sound() -> None:
    patch = _fxp("Bass")
    raw = base64.b64decode(sounds.surge_state(patch))
    assert raw[:4] == b"VC2!" and raw.endswith(b"\x00")
    (length,) = struct.unpack("<I", raw[4:8])
    xml = raw[8 : 8 + length]
    inner = xml.split(b"<IComponent>")[1].split(b"</IComponent>")[0].decode()
    component = sounds.juce_decode(inner)
    assert component == patch[60:] + b"\x00" * 8 + b"JUCEPrivateData"
    with pytest.raises(projects.EditorError):
        sounds.surge_state(b"not a patch" * 10)
    with pytest.raises(projects.EditorError, match="damaged"):
        sounds.surge_state(patch[:-3])


def test_the_sound_list_hides_paths(tmp_path: Path, monkeypatch) -> None:
    factory = tmp_path / "factory"
    (factory / "Basses").mkdir(parents=True)
    (factory / "Basses" / "Deep.fxp").write_bytes(_fxp("Deep"))
    (factory / "Pads").mkdir()
    (factory / "Pads" / "Warm.fxp").write_bytes(_fxp("Warm"))
    (factory / "Pads" / "notes.txt").write_text("not a patch")
    monkeypatch.setattr(sounds, "_surge_libraries", lambda: [("Factory", factory)])
    sounds.reset_cache()
    try:
        listed = sounds.list_sounds("Surge XT")
        assert sorted((s["category"], s["name"]) for s in listed) == [
            ("Basses", "Deep"),
            ("Pads", "Warm"),
        ]
        assert all(set(s) == {"id", "name", "category", "library"} for s in listed)
        assert str(tmp_path) not in json.dumps(listed)
        deep = next(s for s in listed if s["name"] == "Deep")
        built = sounds.sound_state("Surge XT", deep["id"])
        assert built["name"] == "Deep" and built["state"] == sounds.surge_state(_fxp("Deep"))
        assert sounds.list_sounds("Some Other Synth") == []
        with pytest.raises(projects.NotFoundError):
            sounds.sound_state("Surge XT", "0" * 16)
    finally:
        sounds.reset_cache()


def test_sound_routes(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "Keys").mkdir()
    (tmp_path / "Keys" / "Piano.fxp").write_bytes(_fxp("Piano"))
    monkeypatch.setattr(sounds, "_surge_libraries", lambda: [("Factory", tmp_path)])
    monkeypatch.setattr(
        plugins, "plugin_name", lambda pid: "Surge XT" if pid == PLUGIN_ID else None
    )
    sounds.reset_cache()
    try:
        listed = client.get(f"/editor/plugins/{PLUGIN_ID}/sounds").json()["sounds"]
        assert [s["name"] for s in listed] == ["Piano"]
        built = client.post(f"/editor/plugins/{PLUGIN_ID}/sounds/{listed[0]['id']}").json()
        assert built["name"] == "Piano" and base64.b64decode(built["state"])[:4] == b"VC2!"
        assert client.post(f"/editor/plugins/{PLUGIN_ID}/sounds/{'1' * 16}").status_code == 404
        assert client.get(f"/editor/plugins/{'c' * 20}/sounds").status_code == 404
    finally:
        sounds.reset_cache()


def test_listening_without_a_window_and_switching_sounds(tmp_path: Path, monkeypatch) -> None:
    fake = FakeInstrument()
    monkeypatch.setattr(plugin_worker, "_load", lambda _path: fake)
    shown: list[bool] = []
    monkeypatch.setattr(fake, "show_editor", lambda *_a: shown.append(True))

    def drive() -> None:
        time.sleep(0.3)
        (tmp_path / "load").write_text(base64.b64encode(b"loud").decode())
        time.sleep(0.5)
        (tmp_path / "close").touch()

    threading.Thread(target=drive).start()
    outcome = plugin_worker.open_editor(
        {"plugin": "x", "control_dir": str(tmp_path), "window": False, "play": True}
    )
    assert outcome["ok"] and not shown  # No window was opened.
    assert base64.b64decode(outcome["state"]) == b"loud"  # The sound switched mid-session.
    assert not (tmp_path / "load").exists()


def test_loading_a_sound_into_a_running_session(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(engines, "plugin_hosting_available", lambda: True)
    loaded: list[str] = []
    monkeypatch.setattr(plugins, "load_sound_in_window", lambda key, st: loaded.append(st) or True)
    sound = base64.b64encode(b"bass").decode()

    def fake_window(plugin_id, state, key, notes, seconds, **options):
        assert options == {"window": False, "play": True}
        url = f"/editor/projects/{seen['pid']}/jobs/{key}/load"
        assert client.post(url, json={"state": sound}).status_code == 200
        assert client.post(url, json={"state": "no!"}).status_code == 422
        assert client.post(url, json={}).status_code == 422
        return {"plugin": "Surge XT", "state": sound}

    seen: dict[str, str] = {}
    monkeypatch.setattr(plugins, "open_plugin_window", fake_window)
    pid = seen["pid"] = _project(client)
    params = {"plugin_id": PLUGIN_ID, "notes": NOTES, "window": False, "play": True}
    job = _job(client, pid, "plugin_window", params)
    assert job["status"] == "completed", job["error"]
    assert job["stage"] == "done" and loaded == [sound]


def test_load_sound_in_window_writes_the_whole_file_at_once(tmp_path: Path) -> None:
    assert plugins.load_sound_in_window("missing", "AAAA") is False
    plugins._windows["job-2"] = tmp_path
    try:
        assert plugins.load_sound_in_window("job-2", "QUJD") is True
        assert (tmp_path / "load").read_text() == "QUJD" and not (tmp_path / "load.part").exists()
    finally:
        plugins._windows.pop("job-2", None)


def test_command_line_lists_and_installs(monkeypatch, capsys) -> None:
    monkeypatch.setattr(instruments, "_installed_bundle", lambda _item: None)
    calls: list[str] = []

    def fake_install(instrument_id, report):
        calls.append(instrument_id)
        report(50.0, "Halfway.")
        report(100.0, "Done.")

    monkeypatch.setattr(instruments, "install", fake_install)
    assert instruments.main(["list"]) == 0
    assert "[ ] surge-xt: Surge XT" in capsys.readouterr().out
    assert instruments.main(["install", "surge-xt"]) == 0 and calls == ["surge-xt"]
    assert "100.0%" in capsys.readouterr().out

    def failing(_id, _report):
        raise instruments.InstallError("no disk space")

    monkeypatch.setattr(instruments, "install", failing)
    assert instruments.main(["install", "surge-xt"]) == 1
    assert "no disk space" in capsys.readouterr().err
    monkeypatch.setattr(instruments, "_installed_bundle", lambda _item: Path("/x"))
    assert instruments.main(["install", "surge-xt"]) == 0  # Already there: nothing to do.
