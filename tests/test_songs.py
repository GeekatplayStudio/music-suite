"""Full-song generation: validation, local engines, cloud engines and key handling.

No real engine is contacted: each test stands in for the one HTTP API or process
the engine module talks to, and checks exactly what the suite sends and accepts.
"""

from __future__ import annotations

import io
import json
import os
import stat
import sys
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import requests
import soundfile as sf
from fastapi.testclient import TestClient

import apps.api.editor as editor_api
import apps.api.main as api_main
from audioqi.editor import engines, plugins, projects
from audioqi.editor.songs import acestep, cloud, keys
from audioqi.editor.songs import yue2_engine as yue2

SR = 48_000
KEY_HEADER = {"X-Music-Suite-Action": "save-key"}


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "d"))
    monkeypatch.setenv(engines.FORCE_FALLBACK_ENV, "1")
    for env in (*keys.PROVIDERS.values(), yue2.PYTHON_ENV, acestep.URL_ENV, acestep.KEY_ENV):
        monkeypatch.delenv(env, raising=False)
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, fn: fn())
    monkeypatch.setattr(acestep.time, "sleep", lambda _s: None)
    monkeypatch.setattr(cloud.time, "sleep", lambda _s: None)
    plugins.reset_cache()
    with TestClient(api_main.app) as test_client:
        yield test_client
    plugins.reset_cache()


def _flac(seconds: float = 1.5) -> bytes:
    t = np.arange(int(SR * seconds)) / SR
    tone = (0.2 * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32)
    buffer = io.BytesIO()
    sf.write(buffer, np.stack([tone, tone], axis=1), SR, format="FLAC")
    return buffer.getvalue()


def _project(client: TestClient) -> str:
    response = client.post("/editor/projects", json={"name": "Songs"})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _song_job(client: TestClient, pid: str, params: dict[str, Any]) -> dict[str, Any]:
    response = client.post(
        f"/editor/projects/{pid}/jobs", json={"op": "song", "asset_id": None, "params": params}
    )
    assert response.status_code == 200, response.text
    return client.get(f"/editor/projects/{pid}/jobs/{response.json()['id']}").json()


class FakeResponse:
    def __init__(
        self,
        status: int = 200,
        payload: Any = None,
        content: bytes = b"",
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status
        self._payload = payload
        self.content = content if content else (json.dumps(payload).encode() if payload else b"")
        self.headers = headers or {}

    def json(self) -> Any:
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    def iter_content(self, size: int) -> Iterator[bytes]:
        for start in range(0, len(self.content), size):
            yield self.content[start : start + size]

    def close(self) -> None:
        pass


class FakeHttp:
    """Replaces ``requests`` inside one module; routes by (method, url prefix)."""

    RequestException = requests.RequestException
    ConnectionError = requests.ConnectionError

    def __init__(self, routes: dict[tuple[str, str], Any]) -> None:
        self.routes = routes
        self.calls: list[dict[str, Any]] = []

    def _answer(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"method": method, "url": url, **kwargs})
        for (verb, prefix), answer in self.routes.items():
            if verb == method and url.startswith(prefix):
                return answer(url, kwargs) if callable(answer) else answer
        raise requests.ConnectionError(f"no route for {method} {url}")

    def get(self, url: str, **kwargs: Any) -> FakeResponse:
        return self._answer("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> FakeResponse:
        return self._answer("POST", url, **kwargs)


# --------------------------------------------------------------------------- validation


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"style": "hi"},
        {"style": "synthwave anthem", "engine": "suno"},
        {"style": "synthwave anthem", "seconds": 5},
        {"style": "synthwave anthem", "seconds": 601},
        {"style": "synthwave anthem", "key": "H major"},
        {"style": "synthwave anthem", "language": "English!"},
        {"style": "synthwave anthem", "model": "../../etc"},
        {"style": "synthwave anthem", "lyrics": "x" * 3501},
        {"style": "synthwave anthem", "engine": "yue2"},
        {"style": "synthwave anthem", "url": "http://x"},
    ],
)
def test_song_requests_are_validated(client: TestClient, params: dict[str, Any]) -> None:
    pid = _project(client)
    body = {"op": "song", "asset_id": None, "params": params}
    assert client.post(f"/editor/projects/{pid}/jobs", json=body).status_code == 422


def test_song_jobs_take_no_source_asset(client: TestClient) -> None:
    pid = _project(client)
    body = {"op": "song", "asset_id": projects.new_id(), "params": {"style": "lofi beat"}}
    response = client.post(f"/editor/projects/{pid}/jobs", json=body)
    assert response.status_code == 422 and "must be null" in response.json()["detail"]
    # Ops that process audio still require one.
    body = {"op": "normalize", "asset_id": None, "params": {}}
    assert client.post(f"/editor/projects/{pid}/jobs", json=body).status_code == 422


# --------------------------------------------------------------------------- ACE-Step


def _fake_acestep(audio: bytes, *, file: str = "/v1/audio?path=%2Ftmp%2Fapi_audio%2Fx.flac"):
    task = "task-1"
    polls = {"n": 0}

    def query(_url: str, _kw: dict[str, Any]) -> FakeResponse:
        polls["n"] += 1
        if polls["n"] < 2:
            return FakeResponse(payload={"code": 200, "data": [{"task_id": task, "status": 0}]})
        result = [
            {
                "file": file,
                "status": 1,
                "metas": {"bpm": 96, "keyscale": "A minor"},
                "dit_model": "acestep-v15-turbo",
                "seed_value": "42",
            }
        ]
        item = {"task_id": task, "status": 1, "result": json.dumps(result)}
        return FakeResponse(payload={"code": 200, "data": [item], "error": None})

    base = acestep.DEFAULT_URL
    return FakeHttp(
        {
            ("GET", f"{base}/health"): FakeResponse(payload={"data": {"status": "ok"}}),
            ("GET", f"{base}/v1/models"): FakeResponse(
                payload={
                    "data": {
                        "models": [{"name": "acestep-v15-turbo"}, {"name": "acestep-v15-xl-turbo"}],
                        "default_model": "acestep-v15-turbo",
                    }
                }
            ),
            ("POST", f"{base}/release_task"): FakeResponse(
                payload={"code": 200, "data": {"task_id": task, "status": "queued"}}
            ),
            ("POST", f"{base}/query_result"): query,
            ("GET", f"{base}/v1/audio"): FakeResponse(
                content=audio, headers={"content-type": "audio/flac"}
            ),
        }
    )


def test_acestep_generates_a_song_and_imports_it(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    http = _fake_acestep(_flac())
    monkeypatch.setattr(acestep, "requests", http)
    listed = {e["id"]: e for e in client.get("/editor/songs").json()["engines"]}
    assert listed["acestep"]["available"] and listed["acestep"]["commercial"]
    assert listed["acestep"]["models"] == ["acestep-v15-turbo", "acestep-v15-xl-turbo"]

    pid = _project(client)
    lyrics = "[verse]\nNeon rain on the window\n[chorus]\nWe run tonight"
    job = _song_job(
        client,
        pid,
        {
            "style": "  dark   synthwave,\nfemale vocal ",
            "lyrics": lyrics,
            "seconds": 95,
            "bpm": 96,
            "key": "A minor",
            "seed": 42,
            "model": "acestep-v15-xl-turbo",
        },
    )
    assert job["status"] == "completed", job["error"]
    (created,) = job["result_assets"]
    assert created["name"] == "Neon rain on the window (acestep)"
    assert abs(created["duration_seconds"] - 1.5) < 0.01 and created["sample_rate"] == SR
    assert job["result"]["engine"] == "acestep" and job["result"]["key"] == "A minor"

    sent = next(c for c in http.calls if c["url"].endswith("/release_task"))["json"]
    assert sent["prompt"] == "dark synthwave, female vocal, 96 BPM, in A minor"
    assert sent["lyrics"] == lyrics and sent["audio_duration"] == 95.0
    assert sent["audio_format"] == "flac" and sent["batch_size"] == 1
    assert (sent["use_random_seed"], sent["seed"]) == (False, 42)
    assert sent["model"] == "acestep-v15-xl-turbo" and sent["key_scale"] == "A minor"


def test_acestep_instrumental_uses_the_instrumental_tag(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    http = _fake_acestep(_flac())
    monkeypatch.setattr(acestep, "requests", http)
    pid = _project(client)
    params = {"style": "ambient piano", "lyrics": "ignored words", "instrumental": True}
    job = _song_job(client, pid, params)
    assert job["status"] == "completed", job["error"]
    sent = next(c for c in http.calls if c["url"].endswith("/release_task"))["json"]
    assert sent["lyrics"] == "[Instrumental]" and "instrumental, no vocals" in sent["prompt"]


def test_acestep_never_follows_an_absolute_download_url(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    http = _fake_acestep(_flac(), file="http://evil.example/x.flac")
    monkeypatch.setattr(acestep, "requests", http)
    job = _song_job(client, _project(client), {"style": "punk rock"})
    assert job["status"] == "failed" and "downloadable" in job["error"]
    assert not any("evil" in c["url"] for c in http.calls)


def test_acestep_offline_and_loopback_only(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(acestep, "requests", FakeHttp({}))
    status = {e["id"]: e for e in client.get("/editor/songs").json()["engines"]}["acestep"]
    assert status["available"] is False and "acestep-api" in status["hint"]
    job = _song_job(client, _project(client), {"style": "folk ballad"})
    assert job["status"] == "failed" and "not running" in job["error"]

    monkeypatch.setenv(acestep.URL_ENV, "http://192.168.1.4:8001")
    with pytest.raises(projects.EditorError):
        acestep.base_url()
    monkeypatch.setenv(acestep.URL_ENV, "http://localhost:9001/")
    assert acestep.base_url() == "http://localhost:9001"


# --------------------------------------------------------------------------- keys


def test_cloud_keys_are_write_only_and_need_the_action_header(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "sk_live_0123456789abcdef"
    url = "/editor/songs/keys/elevenlabs"
    assert client.post(url, json={"key": secret}).status_code == 400
    unknown = client.post("/editor/songs/keys/nope", json={"key": secret}, headers=KEY_HEADER)
    assert unknown.status_code == 422
    assert client.post(url, json={"key": "short"}, headers=KEY_HEADER).status_code == 422
    saved = client.post(url, json={"key": f"Bearer {secret}"}, headers=KEY_HEADER)
    assert saved.status_code == 200
    assert saved.json()["elevenlabs"] == {
        "configured": True,
        "source": "saved",
        "env": "MUSIC_SUITE_ELEVENLABS_API_KEY",
    }
    listing = client.get("/editor/songs").text
    assert secret not in listing and secret not in saved.text
    assert keys.get("elevenlabs") == secret

    stored = projects.SETTINGS.data_dir / "secrets" / "song_keys.json"
    if os.name == "posix":
        assert stat.S_IMODE(stored.stat().st_mode) == 0o600

    monkeypatch.setenv("MUSIC_SUITE_ELEVENLABS_API_KEY", "env_key_0123456789abcdef")
    assert keys.get("elevenlabs") == "env_key_0123456789abcdef"
    assert keys.summary()["elevenlabs"]["source"] == "environment"
    monkeypatch.delenv("MUSIC_SUITE_ELEVENLABS_API_KEY")

    assert client.delete(url).status_code == 400
    removed = client.delete(url, headers=KEY_HEADER).json()
    assert removed["elevenlabs"]["configured"] is False and keys.get("elevenlabs") is None


# --------------------------------------------------------------------------- ElevenLabs


def test_elevenlabs_sends_text_only_and_imports_the_audio(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    pid = _project(client)
    job = _song_job(client, pid, {"style": "indie pop", "engine": "elevenlabs"})
    assert job["status"] == "failed" and "API key" in job["error"]

    client.post(
        "/editor/songs/keys/elevenlabs", json={"key": "xi_0123456789abcdef"}, headers=KEY_HEADER
    )
    http = FakeHttp(
        {
            ("POST", cloud.ELEVENLABS_URL): FakeResponse(
                content=_flac(), headers={"content-type": "audio/flac", "song-id": "s1"}
            )
        }
    )
    monkeypatch.setattr(cloud, "requests", http)
    job = _song_job(
        client,
        pid,
        {
            "style": "indie pop, male vocal",
            "lyrics": "[chorus]\nSummer keeps calling",
            "engine": "elevenlabs",
            "seconds": 30,
        },
    )
    assert job["status"] == "completed", job["error"]
    assert job["result"]["song_id"] == "s1" and job["result"]["model"] == "music_v2_5"
    (call,) = http.calls
    assert call["headers"]["xi-api-key"] == "xi_0123456789abcdef"
    assert call["allow_redirects"] is False
    assert set(call["json"]) == {"prompt", "music_length_ms", "model_id", "force_instrumental"}
    assert call["json"]["music_length_ms"] == 30_000
    assert "Lyrics:\n[chorus]\nSummer keeps calling" in call["json"]["prompt"]


def test_elevenlabs_bad_key_is_reported_plainly(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.post(
        "/editor/songs/keys/elevenlabs", json={"key": "xi_0123456789abcdef"}, headers=KEY_HEADER
    )
    http = FakeHttp({("POST", cloud.ELEVENLABS_URL): FakeResponse(status=401, payload={})})
    monkeypatch.setattr(cloud, "requests", http)
    job = _song_job(client, _project(client), {"style": "jazz", "engine": "elevenlabs"})
    assert job["status"] == "failed" and "rejected the API key" in job["error"]


# --------------------------------------------------------------------------- fal.ai


FAL_STATUS = "https://queue.fal.run/fal-ai/minimax-music/requests/r1/status"


def _fal_routes(audio_url: str, status_url: str = FAL_STATUS):
    response_url = "https://queue.fal.run/fal-ai/minimax-music/requests/r1"
    polls = {"n": 0}

    def status(_url: str, _kw: dict[str, Any]) -> FakeResponse:
        polls["n"] += 1
        return FakeResponse(payload={"status": "IN_PROGRESS" if polls["n"] < 2 else "COMPLETED"})

    return {
        ("POST", "https://queue.fal.run/fal-ai/"): FakeResponse(
            payload={"request_id": "r1", "status_url": status_url, "response_url": response_url}
        ),
        ("GET", status_url): status,
        ("GET", response_url): FakeResponse(
            payload={
                "audio": {"url": audio_url, "file_name": "song.wav", "content_type": "audio/wav"}
            }
        ),
        ("GET", audio_url): FakeResponse(content=_flac(), headers={"content-type": "audio/flac"}),
    }


def test_fal_minimax_flow(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    client.post("/editor/songs/keys/fal", json={"key": "fal_0123456789abcdef"}, headers=KEY_HEADER)
    http = FakeHttp(_fal_routes("https://v3.fal.media/files/x/song.wav"))
    monkeypatch.setattr(cloud, "requests", http)
    job = _song_job(
        client,
        _project(client),
        {"style": "k-pop dance", "lyrics": "[verse]\nLights up", "engine": "fal"},
    )
    assert job["status"] == "completed", job["error"]
    submit = http.calls[0]
    assert submit["url"] == "https://queue.fal.run/fal-ai/minimax-music/v2.6"
    assert submit["headers"]["Authorization"] == "Key fal_0123456789abcdef"
    assert submit["json"]["lyrics"] == "[verse]\nLights up"
    assert submit["json"]["is_instrumental"] is False


def test_fal_lyria_puts_lyrics_in_the_prompt() -> None:
    request = cloud.SongRequest(
        engine="fal",
        style="cinematic pop",
        lyrics="[chorus]\nHold the light",
        model="fal-ai/lyria3/pro",
    )
    model, payload = cloud.fal_payload(request)
    assert model == "fal-ai/lyria3/pro" and set(payload) == {"prompt"}
    assert payload["prompt"].endswith("Lyrics:\n[chorus]\nHold the light")


@pytest.mark.parametrize(
    ("audio_url", "status_url"),
    [
        ("https://evil.example/song.wav", "https://queue.fal.run/fal-ai/x/requests/r1/status"),
        ("http://v3.fal.media/song.wav", "https://queue.fal.run/fal-ai/x/requests/r1/status"),
        ("https://v3.fal.media/song.wav", "https://attacker.example/status"),
    ],
)
def test_fal_only_talks_to_fal_hosts(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, audio_url: str, status_url: str
) -> None:
    client.post("/editor/songs/keys/fal", json={"key": "fal_0123456789abcdef"}, headers=KEY_HEADER)
    http = FakeHttp(_fal_routes(audio_url, status_url))
    monkeypatch.setattr(cloud, "requests", http)
    job = _song_job(client, _project(client), {"style": "trap beat", "engine": "fal"})
    assert job["status"] == "failed" and "unexpected address" in job["error"]
    forbidden = ("https://evil", "http://", "https://attacker")
    assert not any(c["url"].startswith(forbidden) for c in http.calls)


# --------------------------------------------------------------------------- YuE2


def test_yue2_needs_setup_and_a_licence_acknowledgement(client: TestClient) -> None:
    status = {e["id"]: e for e in client.get("/editor/songs").json()["engines"]}["yue2"]
    assert status["available"] is False and status["commercial"] is False
    pid = _project(client)
    body = {"op": "song", "asset_id": None, "params": {"style": "rock", "engine": "yue2"}}
    refused = client.post(f"/editor/projects/{pid}/jobs", json=body)
    assert refused.status_code == 422 and "non-commercial" in refused.json()["detail"]
    job = _song_job(client, pid, {"style": "rock", "engine": "yue2", "accept_noncommercial": True})
    assert job["status"] == "failed" and yue2.PYTHON_ENV in job["error"]


FAKE_YUE2 = '''
import json
from pathlib import Path
import numpy as np
import soundfile as sf

class _Song:
    truncated = False
    def save_artifacts(self, out):
        t = np.arange(48000) / 48000
        tone = (0.2 * np.sin(2 * np.pi * 330 * t)).astype("float32")
        sf.write(str(Path(out) / "audio.flac"), np.stack([tone, tone], 1), 48000)
        (Path(out) / "seen.json").write_text(json.dumps(self.kwargs))

class YuE2Pipeline:
    @classmethod
    def from_pretrained(cls, model, device):
        return cls()
    def __enter__(self):
        return self
    def __exit__(self, *exc):
        return False
    def __call__(self, **kwargs):
        song = _Song()
        song.kwargs = kwargs
        return song
'''


@pytest.mark.skipif(sys.platform == "win32", reason="uses a POSIX shell wrapper")
def test_yue2_runs_in_its_own_process(
    client: TestClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_pkg = tmp_path / "fakeyue"
    (fake_pkg / "yue2").mkdir(parents=True)
    (fake_pkg / "yue2" / "__init__.py").write_text(FAKE_YUE2)
    wrapper = tmp_path / "python"
    # Stands in for YuE2's interpreter: drops -I so the fake package is importable.
    wrapper.write_text(
        f'#!/bin/sh\nshift\nPYTHONPATH="{fake_pkg}" exec "{sys.executable}" "$@"\n'
    )
    wrapper.chmod(0o755)
    monkeypatch.setenv(yue2.PYTHON_ENV, str(wrapper))
    monkeypatch.setattr(yue2, "_probe", {"at": 0.0, "python": None, "ok": False})
    monkeypatch.setattr(yue2.time, "sleep", lambda _s: None)

    status = {e["id"]: e for e in client.get("/editor/songs").json()["engines"]}["yue2"]
    assert status["available"] is True
    job = _song_job(
        client,
        _project(client),
        {
            "style": "emo rock",
            "lyrics": "[verse]\nStatic on the radio",
            "engine": "yue2",
            "seed": 7,
            "accept_noncommercial": True,
        },
    )
    assert job["status"] == "completed", job["error"]
    (created,) = job["result_assets"]
    assert created["name"] == "Static on the radio (yue2)"
    assert abs(created["duration_seconds"] - 1.0) < 0.01
    assert "non-commercial" in job["result"]["license"] or "BY-NC" in job["result"]["license"]
