"""AI music generation: schema validation, settings, the writer, the guard and the job flow.

No real engine, Ollama or network is used: the provider and HTTP calls are faked.
"""

from __future__ import annotations

import base64
import io
import os
import stat
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
from audioqi.editor import projects
from audioqi.editor.projects import EditorError, ParamError
from audioqi.generation import (
    engine,
    records,
    resources,
    schema,
    secrets,
    service,
    settings,
    setup,
    writer,
)
from audioqi.generation.providers.acestep import AceStepProvider
from audioqi.generation.providers.base import Output

SR = 48_000


def _wav_bytes(seconds: float = 1.5, level: float = 0.9) -> bytes:
    t = np.arange(int(SR * seconds)) / SR
    tone = (level * np.sin(2 * np.pi * 220.0 * t)).astype(np.float32)
    buffer = io.BytesIO()
    sf.write(buffer, np.stack([tone, tone], axis=1), SR, format="WAV", subtype="PCM_24")
    return buffer.getvalue()


class FakeProvider:
    id = "acestep_local"
    name = "Fake"
    kind = "local"

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.real = AceStepProvider()

    def describe(self) -> dict[str, Any]:
        return self.real.describe()

    def status(self) -> dict[str, Any]:
        return {"ready": True, "message": "ok"}

    def generate(self, task: str, values: dict[str, Any], ctx: Any) -> list[Output]:
        self.calls.append(values)
        ctx.progress(50, "Generating audio.")
        if ctx.cancelled():
            raise EditorError("Generation was cancelled.", 409)
        count = int(values.get("variations", 1))
        return [Output(data=_wav_bytes(), meta={"bpm": 100, "seed": 5 + i}) for i in range(count)]


class FakeKeychain:
    """Stands in for the OS keychain so tests never read or write the real one."""

    def __init__(self) -> None:
        self.items: dict[tuple[str, str], str] = {}

    def get_password(self, service: str, account: str) -> str | None:
        return self.items.get((service, account))

    def set_password(self, service: str, account: str, value: str) -> None:
        self.items[(service, account)] = value

    def delete_password(self, service: str, account: str) -> None:
        self.items.pop((service, account), None)


@pytest.fixture(autouse=True)
def keychain(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeKeychain]:
    fake = FakeKeychain()
    monkeypatch.setattr(secrets, "_keyring", lambda: fake)
    for env in secrets.PROVIDERS.values():
        monkeypatch.delenv(env, raising=False)
    secrets.reset_cache()
    yield fake
    secrets.reset_cache()


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "d"))
    monkeypatch.delenv("MUSIC_SUITE_ACESTEP_DIR", raising=False)
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, fn: fn())
    monkeypatch.setattr(resources, "unload_ollama_models", lambda: [])
    monkeypatch.setattr(resources, "free_memory_percent", lambda: 70.0)
    with TestClient(api_main.app) as test_client:
        yield test_client


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeProvider:
    provider = FakeProvider()
    monkeypatch.setitem(service.PROVIDERS, provider.id, provider)
    return provider


def _start(client: TestClient, fields: dict[str, Any], **extra: Any) -> Any:
    project = client.post("/editor/projects", json={"name": "song"}).json()["id"]
    params = {
        "provider": "acestep_local",
        "task": "text2music",
        "title": "My Song",
        "fields": fields,
        **extra,
    }
    response = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "generate_song", "asset_id": None, "params": params},
    )
    return project, response


# --------------------------------------------------------------------------- schema


def _fields() -> list[dict[str, Any]]:
    return AceStepProvider().describe()["fields"]


def test_schema_keeps_valid_values_and_drops_unset_ones() -> None:
    cleaned = schema.validate(
        _fields(),
        "text2music",
        {"caption": "  warm   folk song ", "bpm": 96, "keyscale": "", "duration": None, "seed": -1},
    )
    assert cleaned == {"caption": "warm   folk song", "bpm": 96, "seed": -1}


@pytest.mark.parametrize(
    "values",
    [
        {"caption": "ok song", "bpm": 999},
        {"caption": "ok song", "bpm": 96.5},
        {"caption": "ok song", "bpm": True},
        {"caption": "ok song", "keyscale": "H minor"},
        {"caption": "ok song", "variations": 9},
        {"caption": "ok song", "seed": 2**33},
        {"caption": "ok song", "instrumental": "yes"},
        {"caption": "ok song", "made_up": 1},
        {"caption": "x" * 1501},
        {"caption": "ab"},
        {},
        {"caption": "ok song", "duration": float("nan")},
    ],
)
def test_schema_rejects_bad_values(values: dict[str, Any]) -> None:
    with pytest.raises(ParamError):
        schema.validate(_fields(), "text2music", values)


def test_lyrics_keep_line_breaks_but_lose_control_characters() -> None:
    cleaned = schema.validate(
        _fields(), "text2music", {"caption": "ok song", "lyrics": "[Verse]\nhello\x00\x07 there\n"}
    )
    assert cleaned["lyrics"] == "[Verse]\nhello there"


def test_every_engine_field_is_described() -> None:
    keys = {spec["key"] for spec in _fields()}
    assert {
        "caption",
        "lyrics",
        "bpm",
        "keyscale",
        "timesignature",
        "vocal_language",
        "duration",
        "seed",
        "variations",
        "inference_steps",
        "guidance_scale",
        "shift",
        "solver",
        "lm_temperature",
    } <= keys
    for spec in _fields():
        assert spec["type"] in schema.TYPES
        assert spec["label"] and spec["group"]


# --------------------------------------------------------------------------- settings


def test_settings_round_trip_and_reject_bad_values(client: TestClient) -> None:
    assert client.get("/generation/settings").json()["target_lufs"] == -14.0
    saved = client.post(
        "/generation/settings", json={"idle_minutes": 3, "providers": {"comfyui_musicgen": False}}
    )
    assert saved.status_code == 200
    body = client.get("/generation/settings").json()
    assert body["idle_minutes"] == 3
    assert body["providers"] == {
        "acestep_local": True,
        "comfyui_musicgen": False,
        "acestep_server": False,
        "yue2": False,
        "elevenlabs": False,
        "fal": False,
        "lyria": False,
    }
    for bad in (
        {"idle_minutes": 0},
        {"min_free_percent": 99},
        {"writer_model": "a b"},
        {"nope": 1},
        {"engine_dir": "relative/path"},
        {"providers": {"someone_else": True}},
        {"normalize": "yes"},
    ):
        assert client.post("/generation/settings", json=bad).status_code == 422, bad


@pytest.mark.skipif(os.name == "nt", reason="POSIX permissions")
def test_settings_file_is_private(client: TestClient) -> None:
    client.post("/generation/settings", json={"idle_minutes": 5})
    mode = stat.S_IMODE((settings.root() / "settings.json").stat().st_mode)
    assert mode == 0o600


def test_overview_reports_missing_engine_without_starting_anything(client: TestClient) -> None:
    body = client.get("/generation/providers").json()
    local = next(p for p in body["providers"] if p["id"] == "acestep_local")
    assert local["status"]["ready"] is False
    assert body["engine"] == {
        "built": False,
        "models": {"lm": [], "embedding": [], "dit": [], "vae": []},
        "missing_models": ["lm", "embedding", "dit", "vae"],
        "installed": False,
        "running": False,
        "editing_ready": False,
        "quality_ready": False,
    }
    assert {item["id"] for item in body["planned"]} == {"suno"}
    online = {p["id"]: p for p in body["providers"] if p["kind"] == "external"}
    assert set(online) == {"elevenlabs", "fal", "lyria"}
    assert all(not p["enabled"] and not p["status"]["ready"] for p in online.values())
    assert not engine.SUPERVISOR.running()


# --------------------------------------------------------------------------- jobs


def test_generate_song_imports_normalised_versions_and_records_history(
    client: TestClient, fake: FakeProvider
) -> None:
    project, response = _start(client, {"caption": "warm folk song", "variations": 2, "bpm": 100})
    assert response.status_code == 200, response.text
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert [asset["name"] for asset in job["result_assets"]] == [
        "My Song (version 1)",
        "My Song (version 2)",
    ]
    assert fake.calls == [{"caption": "warm folk song", "variations": 2, "bpm": 100}]
    # A loud tone is turned down to the loudness target, with its peak under -1 dBTP.
    audio = client.get(f"/editor/projects/{project}/assets/{job['result_assets'][0]['id']}/audio")
    samples, _ = sf.read(io.BytesIO(audio.content), dtype="float32")
    assert float(np.abs(samples).max()) <= 10 ** (-1 / 20) + 1e-3
    assert job["result"]["outputs"][0]["output_lufs"] == pytest.approx(-14.0, abs=0.2)
    history = client.get("/generation/history").json()
    assert history[0]["title"] == "My Song" and history[0]["project_id"] == project
    assert history[0]["asset_ids"] == [asset["id"] for asset in job["result_assets"]]
    assert client.delete(f"/generation/history/{history[0]['id']}").json() == {"deleted": True}
    assert client.get("/generation/history").json() == []
    assert client.delete("/generation/history/not-a-uuid").status_code == 404


def test_generate_song_validates_against_the_provider_schema(
    client: TestClient, fake: FakeProvider
) -> None:
    for fields in ({"caption": "ok song", "bpm": 999}, {"caption": "ok song", "extra": 1}, {}):
        _, response = _start(client, fields)
        assert response.status_code == 422, fields
    _, response = _start(client, {"caption": "ok song"}, surprise=True)
    assert response.status_code == 422
    assert fake.calls == []


def test_generate_song_respects_disabled_provider_and_unknown_provider(
    client: TestClient, fake: FakeProvider
) -> None:
    client.post("/generation/settings", json={"providers": {"acestep_local": False}})
    _, response = _start(client, {"caption": "ok song"})
    assert response.status_code == 403
    project = client.post("/editor/projects", json={"name": "x"}).json()["id"]
    response = client.post(
        f"/editor/projects/{project}/jobs",
        json={
            "op": "generate_song",
            "asset_id": None,
            "params": {"provider": "suno", "fields": {}},
        },
    )
    assert response.status_code == 404


def test_other_jobs_still_require_an_asset(client: TestClient) -> None:
    project = client.post("/editor/projects", json={"name": "x"}).json()["id"]
    response = client.post(
        f"/editor/projects/{project}/jobs", json={"op": "normalize", "asset_id": None}
    )
    assert response.status_code == 422


def test_low_memory_stops_generation_with_a_clear_message(
    client: TestClient, fake: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(resources, "free_memory_percent", lambda: 9.0)
    monkeypatch.setattr(resources.time, "sleep", lambda _s: None)
    ticks = iter(range(0, 10_000, 30))
    monkeypatch.setattr(resources.time, "monotonic", lambda: float(next(ticks)))
    project, response = _start(client, {"caption": "ok song"})
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "failed"
    assert "9% of memory is free" in job["error"]
    assert fake.calls == []
    assert not resources.GENERATION_LOCK.locked()


def test_cancel_marks_the_job_and_frees_the_generator(
    client: TestClient, fake: FakeProvider, monkeypatch
) -> None:
    project = client.post("/editor/projects", json={"name": "song"}).json()["id"]
    held: list[Any] = []
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, fn: held.append(fn))
    params = {"provider": "acestep_local", "fields": {"caption": "ok song"}}
    job_id = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "generate_song", "asset_id": None, "params": params},
    ).json()["id"]
    assert client.post(f"/editor/projects/{project}/jobs/{job_id}/cancel").status_code == 200
    held[0]()
    job = client.get(f"/editor/projects/{project}/jobs/{job_id}")
    assert "cancelled" in job.json()["error"].lower()
    assert not resources.GENERATION_LOCK.locked()
    assert client.post(f"/editor/projects/{project}/jobs/nope/cancel").status_code == 404


# --------------------------------------------------------------------------- writer


class _Reply:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload, self.status_code = payload, status_code

    def json(self) -> Any:
        return self._payload


def _ollama(monkeypatch: pytest.MonkeyPatch, answers: list[str]) -> list[dict[str, Any]]:
    sent: list[dict[str, Any]] = []
    monkeypatch.setattr(
        writer.requests, "get", lambda url, **_: _Reply({"models": [{"name": "gemma4:12b"}]})
    )

    def post(url: str, json: dict[str, Any], **_: Any) -> _Reply:
        sent.append(json)
        return _Reply({"response": answers.pop(0)})

    monkeypatch.setattr(writer.requests, "post", post)
    return sent


GOOD = (
    '{"title": "Tide", "caption": "Dreamy synth-pop with a soft female voice and warm pads.", '
    '"lyrics": "[Verse]\\nRoad and sea\\n\\n\\n\\n[Chorus]\\nHome", "bpm": 118.4, "key": "f# Minor", '
    '"time_signature": "4/4", "language": "EN", "duration": 150}'
)


def test_writer_returns_a_bounded_normalised_brief(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = _ollama(monkeypatch, [GOOD])
    body = client.post(
        "/generation/lyrics", json={"mode": "brief", "idea": "a night drive by the sea"}
    ).json()
    assert body["engine"] == "ollama:gemma4:12b"
    assert body["brief"] == {
        "title": "Tide",
        "caption": "Dreamy synth-pop with a soft female voice and warm pads.",
        "lyrics": "[Verse]\nRoad and sea\n\n[Chorus]\nHome",
        "bpm": 118,
        "keyscale": "F# minor",
        "timesignature": "4",
        "vocal_language": "en",
        "duration": 150.0,
    }
    # Loopback only, bounded output, and the user's idea is in the prompt.
    assert sent[0]["options"]["num_predict"] == writer.MAX_OUTPUT_TOKENS
    assert "a night drive by the sea" in sent[0]["prompt"]
    assert writer.OLLAMA.startswith("http://127.0.0.1:")


def test_writer_retries_once_then_reports_failure(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = _ollama(monkeypatch, ["not json", GOOD])
    assert (
        client.post(
            "/generation/lyrics", json={"mode": "lyrics", "idea": "add a bridge"}
        ).status_code
        == 200
    )
    assert len(sent) == 2 and "unusable" in sent[1]["prompt"]
    _ollama(monkeypatch, ['{"caption": ""}', "[]"])
    failed = client.post("/generation/lyrics", json={"mode": "lyrics", "idea": "add a bridge"})
    assert failed.status_code == 502
    assert not resources.GENERATION_LOCK.locked()


def test_writer_validates_its_request_and_waits_for_generation(
    client: TestClient, monkeypatch
) -> None:
    for bad in (
        {"mode": "poem", "idea": "abc"},
        {"idea": "x"},
        {"idea": "abc", "extra": 1},
        {"idea": 5},
    ):
        assert client.post("/generation/lyrics", json=bad).status_code == 422, bad
    _ollama(monkeypatch, [GOOD])
    with resources.GENERATION_LOCK:
        busy = client.post("/generation/lyrics", json={"idea": "a night drive"})
    assert busy.status_code == 409


def test_writer_without_ollama_explains_what_is_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def down(*_: Any, **__: Any) -> None:
        raise writer.requests.ConnectionError

    monkeypatch.setattr(writer.requests, "get", down)
    response = client.post("/generation/lyrics", json={"mode": "lyrics", "idea": "add a bridge"})
    assert response.status_code == 503 and "Ollama is not running" in response.json()["detail"]
    # A new song falls back to the engine's planner, which is not installed here.
    response = client.post("/generation/lyrics", json={"mode": "brief", "idea": "a night drive"})
    assert response.status_code == 503 and "not installed" in response.json()["detail"]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("G Major", "G major"),
        ("a minor", "A minor"),
        ("Bbm", "Bb minor"),
        ("Db major", "C# major"),
        ("EM", "E major"),
        ("C", "C major"),
        ("H minor", None),
        ("", None),
        (7, None),
    ],
)
def test_key_names_are_normalised(raw: Any, expected: str | None) -> None:
    assert writer._normal_key(raw) == expected


# --------------------------------------------------------------------------- engine and setup


def test_engine_refuses_to_start_when_not_installed(client: TestClient) -> None:
    with pytest.raises(EditorError) as caught, engine.SUPERVISOR.session():
        pass
    assert caught.value.status_code == 503
    assert not engine.SUPERVISOR.running()


@pytest.mark.skipif(os.name == "nt", reason="POSIX permissions")
def test_engine_refuses_a_binary_others_can_write(tmp_path: Path) -> None:
    binary = tmp_path / "ace-server"
    binary.write_text("#!/bin/sh\n")
    binary.chmod(0o777)
    with pytest.raises(EditorError):
        engine._safe_binary(binary)
    binary.chmod(0o755)
    engine._safe_binary(binary)
    link = tmp_path / "link"
    link.symlink_to(binary)
    with pytest.raises(EditorError):
        engine._safe_binary(link)


def test_engine_is_only_ever_bound_to_loopback() -> None:
    assert engine.HOST == "127.0.0.1"
    source = Path(engine.__file__).read_text(encoding="utf-8")
    assert "0.0.0.0" not in source


def test_models_are_grouped_like_the_engine_groups_them(client: TestClient) -> None:
    folder = settings.engine_dir() / "models"
    folder.mkdir(parents=True)
    for name in setup.MODELS:
        (folder / name).write_bytes(b"x")
    (folder / "notes.txt").write_text("ignored")
    assert engine.list_models() == {
        "lm": ["acestep-5Hz-lm-1.7B-Q8_0.gguf"],
        "embedding": ["Qwen3-Embedding-0.6B-Q8_0.gguf"],
        "dit": ["acestep-v15-turbo-Q8_0.gguf"],
        "vae": ["vae-BF16.gguf"],
    }
    status = engine.install_status()
    assert (
        status["missing_models"] == [] and status["built"] is False and status["installed"] is False
    )


def test_setup_sources_are_pinned() -> None:
    assert len(setup.ENGINE_COMMIT) == 40 and set(setup.ENGINE_COMMIT) <= set("0123456789abcdef")
    assert setup.ENGINE_REPO.startswith("https://github.com/")
    assert (
        setup.MODEL_BASE.startswith("https://huggingface.co/")
        and "/resolve/main/" not in setup.MODEL_BASE
    )
    for size, digest in setup.MODELS.values():
        assert size > 1_000_000 and len(digest) == 64


def test_setup_download_verifies_checksums_and_resumes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import hashlib

    payload = b"model-bytes" * 1000
    monkeypatch.setattr(
        setup, "MODELS", {"tiny.gguf": (len(payload), hashlib.sha256(payload).hexdigest())}
    )
    monkeypatch.setattr(setup, "DOWNLOAD_BYTES", len(payload))
    ranges: list[str | None] = []

    class Stream:
        def __init__(self, data: bytes, code: int) -> None:
            self.data, self.status_code = data, code

        def __enter__(self) -> Stream:
            return self

        def __exit__(self, *_: Any) -> None:
            return None

        def iter_content(self, _size: int) -> Iterator[bytes]:
            yield self.data

    def fake_get(url: str, headers: dict[str, str], **_: Any) -> Stream:
        ranges.append(headers.get("Range"))
        start = int(headers["Range"][6:-1]) if "Range" in headers else 0
        return Stream(payload[start:], 206 if start else 200)

    monkeypatch.setattr(setup.requests, "get", fake_get)
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "tiny.gguf.part").write_bytes(payload[:4000])
    setup._download_models(tmp_path, lambda *_: None)
    assert (tmp_path / "models" / "tiny.gguf").read_bytes() == payload
    assert ranges == ["bytes=4000-"]

    # A corrupt download is thrown away and never becomes a model file.
    (tmp_path / "models" / "tiny.gguf").unlink()
    monkeypatch.setattr(setup.requests, "get", lambda *_a, **_k: Stream(b"X" * len(payload), 200))
    monkeypatch.setattr(setup.time, "sleep", lambda _s: None)
    with pytest.raises(setup.SetupError):
        setup._download_models(tmp_path, lambda *_: None)
    assert not (tmp_path / "models" / "tiny.gguf").exists()


def test_setup_command_line_skips_quietly_without_a_terminal(client: TestClient, capsys) -> None:
    assert setup.main(["--ask"]) == 0
    assert "Skipping" in capsys.readouterr().out
    assert setup.main(["--status"]) == 0
    assert capsys.readouterr().out.strip() == "missing"


def test_setup_route_rejects_unknown_fields(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    started: list[bool] = []
    monkeypatch.setattr(
        setup,
        "start_background",
        lambda writer=False, editing=False, quality=False: (
            started.append((writer, editing)) or setup.state()
        ),
    )
    assert client.post("/generation/setup", json={"writer": "yes"}).status_code == 422
    assert client.post("/generation/setup", json={"url": "http://x"}).status_code == 422
    assert client.post("/generation/setup", json={"writer": True}).status_code == 200
    assert client.post("/generation/setup", json={"editing": True}).status_code == 200
    assert started == [(True, False), (False, True)]


def test_history_is_capped(client: TestClient) -> None:
    for index in range(records.MAX_RECORDS + 5):
        records.add({"title": str(index)})
    items = records.list_records()
    assert len(items) == records.MAX_RECORDS and items[0]["title"] == str(records.MAX_RECORDS + 4)


# --------------------------------------------------------------------------- online services

from audioqi.generation.providers import cloud  # noqa: E402

KEY = "sk_test_0123456789abcdef"


def _headers() -> dict[str, str]:
    return {"X-Music-Suite-Action": "generation-key"}


def test_keys_are_write_only_and_switch_the_service_on_and_off(
    client: TestClient, keychain
) -> None:
    assert client.post("/generation/providers/elevenlabs/key", json={"key": KEY}).status_code == 400
    saved = client.post(
        "/generation/providers/elevenlabs/key", json={"key": f"Bearer {KEY}"}, headers=_headers()
    )
    assert saved.json() == {
        "configured": True,
        "source": "keychain",
        "env": "MUSIC_SUITE_ELEVENLABS_API_KEY",
    }
    assert keychain.items == {("Music Suite", "generation:elevenlabs"): KEY}
    overview = client.get("/generation/providers")
    assert KEY not in overview.text
    eleven = next(p for p in overview.json()["providers"] if p["id"] == "elevenlabs")
    assert eleven["enabled"] and eleven["status"]["ready"]
    # Nothing is written to disk while a keychain is available.
    assert not (projects.SETTINGS.data_dir / "secrets").exists()
    removed = client.delete("/generation/providers/elevenlabs/key", headers=_headers())
    assert removed.json()["configured"] is False and keychain.items == {}
    eleven = next(
        p
        for p in client.get("/generation/providers").json()["providers"]
        if p["id"] == "elevenlabs"
    )
    assert not eleven["enabled"]


@pytest.mark.parametrize(
    "body",
    [
        {"key": "short"},
        {"key": "has space in the key here"},
        {"key": 12345678901234567},
        {"key": KEY, "x": 1},
    ],
)
def test_bad_keys_are_rejected(client: TestClient, body: dict[str, Any]) -> None:
    assert (
        client.post("/generation/providers/fal/key", json=body, headers=_headers()).status_code
        == 422
    )


def test_keys_only_for_online_services(client: TestClient) -> None:
    response = client.post(
        "/generation/providers/acestep_local/key", json={"key": KEY}, headers=_headers()
    )
    assert response.status_code == 422


@pytest.mark.skipif(os.name == "nt", reason="POSIX permissions")
def test_without_a_keychain_keys_go_to_an_owner_only_file(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(secrets, "_keyring", lambda: None)
    secrets.reset_cache()
    saved = client.post(
        "/generation/providers/fal/key", json={"key": KEY}, headers=_headers()
    ).json()
    assert saved["source"] == "file"
    path = projects.SETTINGS.data_dir / "secrets" / "generation_keys.json"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    client.delete("/generation/providers/fal/key", headers=_headers())
    assert not path.exists()


def test_environment_key_wins(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MUSIC_SUITE_FAL_KEY", "env_key_0123456789abcd")
    assert secrets.summary("fal")["source"] == "environment"
    assert secrets.get("fal") == "env_key_0123456789abcd"


def test_online_services_need_a_key_and_to_be_switched_on(client: TestClient) -> None:
    _, response = _start(client, {"caption": "ok song"}, provider="elevenlabs")
    assert response.status_code == 403  # Off until a key is saved.


class _Resp:
    def __init__(
        self, status: int = 200, payload: Any = None, content: bytes = b"", headers=None
    ) -> None:
        self.status_code = status
        self._payload = payload
        self.content = content or (b"{}" if payload is not None else b"")
        self.headers = headers or {}

    def json(self) -> Any:
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    def iter_content(self, _size: int) -> Iterator[bytes]:
        yield self.content

    def close(self) -> None:
        return None


def test_elevenlabs_sends_text_only_and_imports_the_song(client: TestClient, monkeypatch) -> None:
    client.post("/generation/providers/elevenlabs/key", json={"key": KEY}, headers=_headers())
    sent: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> _Resp:
        sent.append({"url": url, **kwargs})
        return _Resp(content=_wav_bytes(), headers={"content-type": "audio/wav", "song-id": "abc"})

    monkeypatch.setattr(cloud.requests, "post", post)
    fields = {
        "caption": "warm folk",
        "lyrics": "[Verse]\nhello",
        "duration": 30,
        "bpm": 90,
        "keyscale": "A minor",
    }
    project, response = _start(client, fields, provider="elevenlabs")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    call = sent[0]
    assert call["url"] == "https://api.elevenlabs.io/v1/music"
    assert call["headers"]["xi-api-key"] == KEY and call["allow_redirects"] is False
    assert call["json"] == {
        "prompt": "warm folk, 90 BPM, in A minor\n\nLyrics:\n[Verse]\nhello",
        "music_length_ms": 30000,
        "model_id": "music_v2_5",
        "force_instrumental": False,
        "store_for_inpainting": True,
    }
    assert job["result"]["outputs"][0]["song_id"] == "abc"
    # The stored song is remembered, so editing this clip later needs no upload.
    from audioqi.generation import remote_songs

    assert remote_songs.get(project, job["result_assets"][0]["id"], "elevenlabs") == "abc"
    assert job["result"]["outputs"][0]["output_lufs"] == pytest.approx(-14.0, abs=0.2)


def test_elevenlabs_plan_mode_uses_the_seed(client: TestClient, monkeypatch) -> None:
    client.post("/generation/providers/elevenlabs/key", json={"key": KEY}, headers=_headers())
    sent: list[dict[str, Any]] = []
    plan = {
        "chunks": [{"text": "[Verse] hello", "duration_ms": 10000, "positive_styles": ["folk"]}]
    }

    def post(url: str, **kwargs: Any) -> _Resp:
        sent.append({"url": url, **kwargs})
        if url.endswith("/plan"):
            return _Resp(payload=plan)
        return _Resp(content=_wav_bytes(), headers={"content-type": "audio/wav"})

    monkeypatch.setattr(cloud.requests, "post", post)
    project, response = _start(
        client, {"caption": "warm folk", "use_plan": True, "seed": 11}, provider="elevenlabs"
    )
    assert (
        client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()["status"]
        == "completed"
    )
    assert [c["url"] for c in sent] == [
        "https://api.elevenlabs.io/v1/music/plan",
        "https://api.elevenlabs.io/v1/music",
    ]
    drafted = cloud.plan_to_api(cloud.plan_from_api(plan))
    assert sent[1]["json"] == {
        "composition_plan": drafted,
        "model_id": "music_v2_5",
        "store_for_inpainting": True,
        "seed": 11,
    }


@pytest.mark.parametrize(
    ("status", "words"), [(401, "rejected the API key"), (402, "no credit"), (429, "limiting")]
)
def test_service_refusals_are_explained(
    client: TestClient, monkeypatch, status: int, words: str
) -> None:
    client.post("/generation/providers/elevenlabs/key", json={"key": KEY}, headers=_headers())
    monkeypatch.setattr(cloud.requests, "post", lambda *_a, **_k: _Resp(status=status, payload={}))
    project, response = _start(client, {"caption": "warm folk"}, provider="elevenlabs")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "failed" and words in job["error"] and KEY not in job["error"]


def test_fal_queues_polls_and_downloads_only_from_its_hosts(
    client: TestClient, monkeypatch
) -> None:
    client.post("/generation/providers/fal/key", json={"key": KEY}, headers=_headers())
    monkeypatch.setattr(cloud.time, "sleep", lambda _s: None)
    calls: list[tuple[str, str]] = []
    ticket = {
        "status_url": "https://queue.fal.run/fal-ai/minimax-music/requests/1/status",
        "response_url": "https://queue.fal.run/fal-ai/minimax-music/requests/1",
    }
    states = iter([{"status": "IN_QUEUE"}, {"status": "COMPLETED"}])

    def post(url: str, **kwargs: Any) -> _Resp:
        calls.append(("POST", url))
        assert kwargs["headers"]["Authorization"] == f"Key {KEY}"
        assert (
            kwargs["json"]["is_instrumental"] is False
            and kwargs["json"]["lyrics"] == "[Verse]\nla la"
        )
        return _Resp(payload=ticket)

    def get(url: str, **kwargs: Any) -> _Resp:
        calls.append(("GET", url))
        if url.endswith("/status"):
            return _Resp(payload=next(states))
        if url == ticket["response_url"]:
            return _Resp(
                payload={
                    "audio": {
                        "url": "https://v3.fal.media/files/song.wav",
                        "content_type": "audio/wav",
                    }
                }
            )
        return _Resp(content=_wav_bytes(), headers={"content-type": "audio/wav"})

    monkeypatch.setattr(cloud.requests, "post", post)
    monkeypatch.setattr(cloud.requests, "get", get)
    project, response = _start(
        client, {"caption": "dream pop", "lyrics": "[Verse]\nla la"}, provider="fal"
    )
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert calls[0] == ("POST", "https://queue.fal.run/fal-ai/minimax-music/v2.6")
    assert calls[-1] == ("GET", "https://v3.fal.media/files/song.wav")


@pytest.mark.parametrize(
    "url",
    [
        "http://v3.fal.media/x.wav",
        "https://fal.media.evil.com/x.wav",
        "https://user:pw@v3.fal.media/x.wav",
        "https://v3.fal.media:8443/x.wav",
        "https://127.0.0.1/x.wav",
    ],
)
def test_downloads_outside_the_allowlist_are_refused(url: str) -> None:
    assert not cloud.host_allowed(url, cloud.FAL_MEDIA_HOSTS)


def test_redirects_off_the_allowlist_are_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    hops = iter(
        [
            _Resp(status=302, headers={"location": "https://cdn.fal.media/next.wav"}),
            _Resp(status=302, headers={"location": "https://attacker.example/steal"}),
        ]
    )
    monkeypatch.setattr(cloud.requests, "get", lambda *_a, **_k: next(hops))
    with pytest.raises(EditorError, match="unexpected address"):
        cloud.download("https://v3.fal.media/song.wav", cloud.FAL_MEDIA_HOSTS)


def test_fal_rejects_a_ticket_pointing_elsewhere(client: TestClient, monkeypatch) -> None:
    client.post("/generation/providers/fal/key", json={"key": KEY}, headers=_headers())
    bad = {"status_url": "https://evil.example/status", "response_url": "https://queue.fal.run/x"}
    monkeypatch.setattr(cloud.requests, "post", lambda *_a, **_k: _Resp(payload=bad))
    project, response = _start(client, {"caption": "dream pop"}, provider="fal")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "failed" and "unexpected address" in job["error"]


def test_lyria_gets_lyrics_inside_its_single_prompt() -> None:
    model, payload = cloud.FalProvider().payload(
        {"model": "fal-ai/lyria3/pro", "caption": "jazz trio", "lyrics": "[Verse]\nhi", "bpm": 100}
    )
    assert model == "fal-ai/lyria3/pro"
    assert payload == {"prompt": "jazz trio, 100 BPM\n\nLyrics:\n[Verse]\nhi"}


def test_online_services_are_not_memory_checked(client: TestClient, monkeypatch) -> None:
    client.post("/generation/providers/elevenlabs/key", json={"key": KEY}, headers=_headers())
    monkeypatch.setattr(resources, "free_memory_percent", lambda: 1.0)
    monkeypatch.setattr(
        cloud.requests,
        "post",
        lambda *_a, **_k: _Resp(content=_wav_bytes(), headers={"content-type": "audio/wav"}),
    )
    project, response = _start(client, {"caption": "warm folk"}, provider="elevenlabs")
    assert (
        client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()["status"]
        == "completed"
    )


# --------------------------------------------------------------------------- ported local engines

import json as _json  # noqa: E402
import sys  # noqa: E402

from audioqi.generation.providers import acestep_server, yue2_engine  # noqa: E402


def _flac_bytes() -> bytes:
    buffer = io.BytesIO()
    t = np.arange(SR) / SR
    tone = (0.4 * np.sin(2 * np.pi * 330 * t)).astype(np.float32)
    sf.write(buffer, np.stack([tone, tone], axis=1), SR, format="FLAC")
    return buffer.getvalue()


class _FakeServer:
    """Stands in for ACE-Step's own REST server and records what it was sent."""

    def __init__(self, file: str = "/v1/audio?path=%2Ftmp%2Fx.flac", files: int = 1) -> None:
        self.sent: list[tuple[str, str, Any]] = []
        self.polls = 0
        self.file, self.files = file, files

    def get(self, url: str, **kwargs: Any) -> _Resp:
        self.sent.append(("GET", url, kwargs.get("params")))
        assert kwargs.get("allow_redirects") is False
        if url.endswith("/health"):
            return _Resp(payload={"data": {"status": "ok"}})
        if url.endswith("/v1/models"):
            return _Resp(
                payload={"data": {"models": [{"name": "acestep-v15-turbo"}, {"name": "../evil"}]}}
            )
        return _Resp(content=_flac_bytes(), headers={"content-type": "audio/flac"})

    def post(self, url: str, json: Any = None, **kwargs: Any) -> _Resp:
        self.sent.append(("POST", url, json))
        if url.endswith("/release_task"):
            return _Resp(payload={"code": 200, "data": {"task_id": "t1"}})
        self.polls += 1
        if self.polls < 2:
            return _Resp(payload={"code": 200, "data": [{"task_id": "t1", "status": 0}]})
        result = [
            {
                "file": self.file,
                "metas": {"bpm": 96, "keyscale": "A minor"},
                "seed_value": str(42 + i),
            }
            for i in range(self.files)
        ]
        return _Resp(
            payload={
                "code": 200,
                "data": [{"task_id": "t1", "status": 1, "result": _json.dumps(result)}],
            }
        )


def _fake_requests(**overrides: Any) -> Any:
    """A stand-in ``requests`` module for one provider, so other modules keep the real one."""
    import types

    import requests as real

    return types.SimpleNamespace(
        RequestException=real.RequestException, ConnectionError=real.ConnectionError, **overrides
    )


def _use_server(monkeypatch: pytest.MonkeyPatch, server: _FakeServer) -> None:
    monkeypatch.setattr(
        acestep_server, "requests", _fake_requests(get=server.get, post=server.post)
    )
    monkeypatch.setattr(acestep_server.time, "sleep", lambda _s: None)
    monkeypatch.delenv(acestep_server.URL_ENV, raising=False)


def test_acestep_server_is_off_by_default_and_never_probed(client: TestClient, monkeypatch) -> None:
    def refuse(*_a: Any, **_k: Any) -> None:
        raise AssertionError("a switched-off provider must not touch the network")

    monkeypatch.setattr(acestep_server, "requests", _fake_requests(get=refuse, post=refuse))
    body = client.get("/generation/providers").json()
    server = next(p for p in body["providers"] if p["id"] == "acestep_server")
    assert server["enabled"] is False and server["status"]["ready"] is False


def test_acestep_server_generates_versions_and_maps_every_field(
    client: TestClient, monkeypatch
) -> None:
    server = _FakeServer(files=2)
    _use_server(monkeypatch, server)
    client.post("/generation/settings", json={"providers": {"acestep_server": True}})
    listed = next(
        p
        for p in client.get("/generation/providers").json()["providers"]
        if p["id"] == "acestep_server"
    )
    assert listed["status"]["ready"] is True
    model_field = next(f for f in listed["schema"]["fields"] if f["key"] == "model")
    assert [o["value"] for o in model_field["options"]] == [
        "acestep-v15-turbo"
    ]  # path-like names dropped
    fields = {
        "caption": "warm folk",
        "lyrics": "[Verse]\nhello",
        "duration": 30,
        "bpm": 96,
        "keyscale": "A minor",
        "timesignature": "3",
        "vocal_language": "en",
        "variations": 2,
        "seed": 9,
        "inference_steps": 8,
        "infer_method": "sde",
        "model": "acestep-v15-turbo",
        "thinking": False,
    }
    project, response = _start(client, fields, provider="acestep_server")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert len(job["result_assets"]) == 2
    release = next(body for method, url, body in server.sent if url.endswith("/release_task"))
    assert release == {
        "prompt": "warm folk",
        "lyrics": "[Verse]\nhello",
        "audio_format": "flac",
        "batch_size": 2,
        "thinking": False,
        "use_cot_caption": False,
        "audio_duration": 30.0,
        "bpm": 96,
        "key_scale": "A minor",
        "time_signature": "3",
        "vocal_language": "en",
        "inference_steps": 8,
        "infer_method": "sde",
        "model": "acestep-v15-turbo",
        "use_random_seed": False,
        "seed": 9,
    }
    assert all(url.startswith("http://127.0.0.1:8001/") for _m, url, _b in server.sent)


def test_acestep_server_instrumental_tag(client: TestClient) -> None:
    body = acestep_server.AceStepServerProvider().payload(
        {"caption": "drone", "instrumental": True}
    )
    assert body["lyrics"] == "[Instrumental]"


def test_acestep_server_never_follows_an_absolute_download_url(
    client: TestClient, monkeypatch
) -> None:
    _use_server(monkeypatch, _FakeServer(file="http://evil.example/x.flac"))
    client.post("/generation/settings", json={"providers": {"acestep_server": True}})
    project, response = _start(client, {"caption": "warm folk"}, provider="acestep_server")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "failed" and "outside its download route" in job["error"]


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com:8001",
        "https://127.0.0.1:8001",
        "http://user:pw@127.0.0.1:8001",
        "http://127.0.0.1:8001/?x=1",
    ],
)
def test_acestep_server_address_must_be_loopback(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setenv(acestep_server.URL_ENV, url)
    with pytest.raises(EditorError):
        acestep_server.base_url()


ConnectionError_ = __import__("requests").ConnectionError


def test_acestep_server_offline_is_explained(client: TestClient, monkeypatch) -> None:
    def down(*_a: Any, **_k: Any) -> None:
        raise ConnectionError_

    monkeypatch.setattr(acestep_server, "requests", _fake_requests(get=down, post=down))
    client.post("/generation/settings", json={"providers": {"acestep_server": True}})
    status = acestep_server.AceStepServerProvider().status()
    assert status["ready"] is False and "uv run acestep-api" in status["message"]


def test_yue2_needs_switching_on_setup_and_the_licence(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv(yue2_engine.PYTHON_ENV, raising=False)
    _, response = _start(
        client, {"caption": "emo rock", "accept_noncommercial": True}, provider="yue2"
    )
    assert response.status_code == 403  # Off by default.
    client.post("/generation/settings", json={"providers": {"yue2": True}})
    _, refused = _start(client, {"caption": "emo rock"}, provider="yue2")
    assert refused.status_code == 422 and "Please confirm" in refused.json()["detail"]
    assert "commercially" in refused.json()["detail"]
    _, unticked = _start(
        client, {"caption": "emo rock", "accept_noncommercial": False}, provider="yue2"
    )
    assert unticked.status_code == 422
    project, response = _start(
        client, {"caption": "emo rock", "accept_noncommercial": True}, provider="yue2"
    )
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "failed" and yue2_engine.PYTHON_ENV in job["error"]


FAKE_YUE2 = """
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
"""


@pytest.mark.skipif(sys.platform == "win32", reason="uses a POSIX shell wrapper")
def test_yue2_runs_in_its_own_process(client: TestClient, tmp_path: Path, monkeypatch) -> None:
    fake_pkg = tmp_path / "fakeyue"
    (fake_pkg / "yue2").mkdir(parents=True)
    (fake_pkg / "yue2" / "__init__.py").write_text(FAKE_YUE2)
    wrapper = tmp_path / "python"
    # Stands in for YuE2's interpreter: drops -I so the fake package is importable.
    wrapper.write_text(f'#!/bin/sh\nshift\nPYTHONPATH="{fake_pkg}" exec "{sys.executable}" "$@"\n')
    wrapper.chmod(0o755)
    monkeypatch.setenv(yue2_engine.PYTHON_ENV, str(wrapper))
    monkeypatch.setattr(yue2_engine, "_probe", {"at": 0.0, "python": None, "ok": False})
    monkeypatch.setattr(yue2_engine.time, "sleep", lambda _s: None)
    client.post("/generation/settings", json={"providers": {"yue2": True}})
    assert yue2_engine.YuE2Provider().status()["ready"] is True
    fields = {
        "caption": "emo rock",
        "lyrics": "[Verse]\nStatic on the radio",
        "seed": 7,
        "accept_noncommercial": True,
    }
    project, response = _start(client, fields, provider="yue2")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    (created,) = job["result_assets"]
    assert abs(created["duration_seconds"] - 1.0) < 0.01
    assert "BY-NC" in job["result"]["outputs"][0]["license"]


def test_yue2_worker_request_folds_the_settings_into_the_style() -> None:
    body = yue2_engine.YuE2Provider().worker_request(
        {"caption": "emo rock", "bpm": 140, "keyscale": "E minor", "instrumental": True, "seed": -1}
    )
    assert body["style"] == "emo rock, 140 BPM, in E minor, instrumental, no vocals"
    assert body["lyrics"] == "[Instrumental]" and body["seed"] is None


# --------------------------------------------------------------------------- AI edits (phase G2)

from audioqi.generation.providers import acestep as acestep_provider  # noqa: E402

TURBO = "acestep-v15-turbo-Q8_0.gguf"
BASE = "acestep-v15-base-Q8_0.gguf"


@pytest.fixture
def models(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    dits = [TURBO]
    monkeypatch.setattr(
        engine,
        "list_models",
        lambda *_a: {"lm": ["lm.gguf"], "embedding": ["e.gguf"], "dit": dits, "vae": ["v.gguf"]},
    )
    return dits


def _edit(task: str, values: dict[str, Any], seconds: float = 60.0) -> dict[str, Any]:
    return acestep_provider.AceStepProvider().edit_request(task, values, seconds)


def test_text2music_always_names_the_turbo_model(models: list[str]) -> None:
    models.insert(0, BASE)  # Alphabetically first: the engine would otherwise pick it.
    body = acestep_provider.AceStepProvider()._request({"caption": "folk"})
    assert body["synth_model"] == TURBO


def test_edit_requests_map_to_engine_tasks(models: list[str]) -> None:
    repaint = _edit(
        "repaint", {"caption": "folk", "region_start": 10.0, "region_end": 20.0, "seed": 4}
    )
    assert repaint == {
        "task_type": "repaint",
        "caption": "folk",
        "lyrics": "[Instrumental]",
        "synth_batch_size": 1,
        "output_format": "wav24",
        "synth_model": TURBO,
        "seed": 4,
        "repainting_start": 10.0,
        "repainting_end": 20.0,
    }
    end = _edit("extend", {"caption": "folk", "extend_seconds": 30, "extend_at": "end"})
    assert (end["task_type"], end["repainting_start"], end["repainting_end"]) == (
        "repaint",
        60.0,
        90.0,
    )
    start = _edit("extend", {"caption": "folk", "extend_seconds": 15, "extend_at": "start"})
    assert (start["repainting_start"], start["repainting_end"]) == (-15.0, 0.0)
    cover = _edit(
        "cover", {"caption": "lofi", "strength": 0.3, "faithful": True, "lyrics": "[Verse]\nhi"}
    )
    assert cover["task_type"] == "cover-nofsq" and cover["audio_cover_strength"] == 0.3
    assert cover["lyrics"] == "[Verse]\nhi"
    assert _edit("cover", {"caption": "lofi"})["task_type"] == "cover"


def test_region_and_length_limits(models: list[str]) -> None:
    with pytest.raises(ParamError, match="at least one second"):
        _edit("repaint", {"caption": "folk", "region_start": 10.0, "region_end": 10.5})
    # A region past the end is clipped to the audio.
    assert (
        _edit("repaint", {"caption": "x", "region_start": 50, "region_end": 80})["repainting_end"]
        == 60.0
    )
    with pytest.raises(ParamError, match="600"):
        _edit("extend", {"caption": "folk", "extend_seconds": 60}, seconds=580.0)


def test_instrument_tasks_need_the_base_model(models: list[str]) -> None:
    with pytest.raises(EditorError) as caught:
        _edit("extract", {"track": "vocals"})
    assert caught.value.status_code == 409
    models.append(BASE)
    extract = _edit("extract", {"track": "vocals"})
    assert (
        extract["task_type"] == "extract"
        and extract["synth_model"] == BASE
        and extract["track"] == "vocals"
    )
    lego = _edit(
        "add_layer", {"caption": "funk", "track": "bass", "region_start": 4.0, "region_end": 12.0}
    )
    assert lego["task_type"] == "lego" and (lego["repainting_start"], lego["repainting_end"]) == (
        4.0,
        12.0,
    )
    assert "repainting_start" not in _edit("add_layer", {"caption": "funk", "track": "bass"})
    assert _edit("complete", {"caption": "band", "track": "vocals"})["task_type"] == "complete"


def test_edit_tasks_are_described_with_availability(models: list[str]) -> None:
    tasks = {t["id"]: t for t in acestep_provider.AceStepProvider().describe()["tasks"]}
    assert set(tasks) == {
        "text2music",
        "repaint",
        "extend",
        "cover",
        "extract",
        "add_layer",
        "complete",
    }
    assert tasks["repaint"]["source"] and "available" not in tasks["repaint"]
    assert tasks["extract"]["available"] is False and "editing model" in tasks["extract"]["reason"]
    models.append(BASE)
    tasks = {t["id"]: t for t in acestep_provider.AceStepProvider().describe()["tasks"]}
    assert "available" not in tasks["extract"]


def test_schema_requires_fields_per_task(models: list[str]) -> None:
    fields = acestep_provider.AceStepProvider().describe()["fields"]
    with pytest.raises(ParamError, match="Section start"):
        schema.validate(fields, "repaint", {"caption": "folk"})
    with pytest.raises(ParamError, match="Instrument"):
        schema.validate(fields, "extract", {})
    assert schema.validate(fields, "extract", {"track": "drums"}) == {"track": "drums"}
    with pytest.raises(ParamError, match="does not apply"):
        schema.validate(fields, "text2music", {"caption": "folk", "track": "drums"})
    with pytest.raises(ParamError, match="Style description"):
        schema.validate(fields, "cover", {"strength": 0.5})


def _source(seconds: float = 6.0) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    tone = 0.3 * np.sin(2 * np.pi * 220.0 * t) * (1.0 + 0.3 * np.sin(2 * np.pi * 0.5 * t))
    return np.stack([tone, tone * 0.9], axis=1).astype(np.float32)


def test_repaint_result_is_put_back_at_the_source_level() -> None:
    source = _source()
    result = source.copy()
    result[2 * SR : 4 * SR] = 0.05  # The regenerated part.
    result *= 1.4  # The engine's own rescaling.
    body = {"repainting_start": 2.0, "repainting_end": 4.0}
    matched, info = acestep_provider._match_level("repaint", body, source, SR, result, SR)
    assert np.allclose(matched[: 2 * SR], source[: 2 * SR], atol=1e-5)
    assert np.allclose(matched[4 * SR :], source[4 * SR :], atol=1e-5)
    assert info["level_match_db"] == pytest.approx(-2.92, abs=0.02)


def test_extend_before_the_start_is_matched_on_the_original_part() -> None:
    source = _source()
    result = np.concatenate([np.full((SR, 2), 0.02, np.float32), source]) * 0.5
    body = {"repainting_start": -1.0, "repainting_end": 0.0}
    matched, _ = acestep_provider._match_level("extend", body, source, SR, result, SR)
    assert np.allclose(matched[SR:], source, atol=1e-5)


def test_new_audio_is_brought_to_the_source_loudness() -> None:
    source = _source()
    result = _source() * 0.2
    matched, info = acestep_provider._match_level("cover", {}, source, SR, result, SR)
    assert info["output_lufs"] == pytest.approx(info["matched_lufs"], abs=0.3)


def _multipart(*clips: np.ndarray) -> _Resp:
    boundary = "ace-batch-boundary"
    body = b""
    for clip in clips:
        buffer = io.BytesIO()
        sf.write(buffer, clip, SR, format="WAV", subtype="PCM_24")
        body += (
            f"--{boundary}\r\nContent-Type: audio/wav\r\n\r\n".encode()
            + buffer.getvalue()
            + b"\r\n"
        )
        body += (
            f"--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\nlatents\r\n".encode()
        )
    body += f"--{boundary}--\r\n".encode()
    return _Resp(content=body, headers={"Content-Type": f"multipart/mixed; boundary={boundary}"})


def test_an_edit_job_sends_the_clip_and_keeps_its_level(
    client: TestClient, monkeypatch, models
) -> None:
    import contextlib

    project = client.post("/editor/projects", json={"name": "song"}).json()["id"]
    buffer = io.BytesIO()
    source = _source()
    sf.write(buffer, source, SR, format="WAV", subtype="FLOAT")
    asset = client.post(
        f"/editor/projects/{project}/assets",
        files={"file": ("song.wav", buffer.getvalue(), "audio/wav")},
    ).json()
    sent: dict[str, Any] = {}

    def fake_job(self, base, path, body, ctx, low, high, expected, detail, files=None):  # noqa: ANN001
        sent.update(path=path, body=body, files=sorted(files or {}))
        staged, rate = sf.read(str(files["audio"]), dtype="float32")
        sent["subtype"] = sf.info(str(files["audio"])).subtype
        out = staged.copy()
        out[2 * SR : 4 * SR] *= 0.1
        return _multipart(out * 1.25, out * 1.25)

    monkeypatch.setattr(acestep_provider.AceStepProvider, "_job", fake_job)
    monkeypatch.setattr(
        engine.SUPERVISOR, "session", lambda: contextlib.nullcontext("http://127.0.0.1:1")
    )
    params = {
        "provider": "acestep_local",
        "task": "repaint",
        "title": "song (regenerated)",
        "fields": {"caption": "folk", "region_start": 2.0, "region_end": 4.0, "variations": 2},
    }
    no_clip = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "generate_song", "asset_id": None, "params": params},
    )
    assert no_clip.status_code == 422 and "Select a clip" in no_clip.json()["detail"]
    job_id = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "generate_song", "asset_id": asset["id"], "params": params},
    ).json()["id"]
    job = client.get(f"/editor/projects/{project}/jobs/{job_id}").json()
    assert job["status"] == "completed", job["error"]
    assert sent["path"] == "/synth" and sent["files"] == ["audio"] and sent["subtype"] == "PCM_24"
    assert sent["body"]["task_type"] == "repaint" and sent["body"]["synth_batch_size"] == 2
    assert [a["name"] for a in job["result_assets"]] == [
        "song (regenerated) (version 1)",
        "song (regenerated) (version 2)",
    ]
    assert job["result"]["outputs"][0]["task"] == "repaint"
    out = client.get(f"/editor/projects/{project}/assets/{job['result_assets'][0]['id']}/audio")
    edited, _ = sf.read(io.BytesIO(out.content), dtype="float32")
    # Untouched audio is back at the source level (within 24-bit rounding), not 1.25 times louder.
    assert np.allclose(edited[: 2 * SR], source[: 2 * SR], atol=1e-4)


def test_unavailable_tasks_are_refused_before_queueing(client: TestClient, models) -> None:
    project = client.post("/editor/projects", json={"name": "song"}).json()["id"]
    buffer = io.BytesIO()
    sf.write(buffer, _source(), SR, format="WAV")
    asset = client.post(
        f"/editor/projects/{project}/assets",
        files={"file": ("song.wav", buffer.getvalue(), "audio/wav")},
    ).json()
    params = {"provider": "acestep_local", "task": "extract", "fields": {"track": "vocals"}}
    response = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "generate_song", "asset_id": asset["id"], "params": params},
    )
    assert response.status_code == 409 and "editing model" in response.json()["detail"]


def test_editing_model_is_pinned_and_checked() -> None:
    ((name, (size, digest)),) = setup.EDIT_MODELS.items()
    assert "-base" in name and size > 1_000_000_000 and len(digest) == 64


def test_a_single_part_starts_below_the_mix() -> None:
    source = _source()
    _, info = acestep_provider._match_level("extract", {}, source, SR, _source() * 0.2, SR)
    mix = acestep_provider.processing.integrated_lufs(source, SR)
    assert info["matched_lufs"] == pytest.approx(mix - acestep_provider.PART_BELOW_MIX_LU, abs=0.01)


class _Tty:
    def isatty(self) -> bool:
        return True


@pytest.fixture
def installed_engine(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """An engine that counts as installed, so only the editing model is in question."""
    calls: list[str] = []
    monkeypatch.setattr(engine, "install_status", lambda: {"installed": True})
    monkeypatch.setattr(setup, "_git", lambda *_a: setup.ENGINE_COMMIT)
    monkeypatch.setattr(setup, "editing_ready", lambda: False)
    monkeypatch.setattr(setup, "install_editing", lambda _report: calls.append("editing"))
    return calls


def test_installer_offers_the_editing_model_once(installed_engine, monkeypatch, capsys) -> None:
    monkeypatch.setattr(setup.sys, "stdin", _Tty())
    monkeypatch.setattr("builtins.input", lambda _prompt: "n")
    assert setup.main(["--ask"]) == 0
    assert installed_engine == [] and settings.load()["editing_declined"] is True
    # Asked once: a later install does not ask again.
    monkeypatch.setattr("builtins.input", lambda _prompt: pytest.fail("asked twice"))
    assert setup.main(["--ask"]) == 0


def test_installer_fetches_the_editing_model_on_yes(installed_engine, monkeypatch) -> None:
    monkeypatch.setattr(setup.sys, "stdin", _Tty())
    monkeypatch.setattr("builtins.input", lambda _prompt: "")
    assert setup.main(["--ask"]) == 0
    assert installed_engine == ["editing"]
    assert setup.main(["--yes"]) == 0  # --yes includes it without asking.
    assert installed_engine == ["editing", "editing"]


# --------------------------------------------------------------------------- phase G3: plans, edits, cost


def _eleven_on(client: TestClient) -> None:
    client.post("/generation/providers/elevenlabs/key", json={"key": KEY}, headers=_headers())


PLAN = [
    {
        "name": "Intro",
        "seconds": 8,
        "styles": ["dream pop", "female vocal", "shimmering synths"],
        "adherence": "high",
    },
    {
        "name": "Verse",
        "lyrics": "Neon on the water\nSalt upon my skin",
        "seconds": 20,
        "styles": ["soft drums"],
        "avoid": ["distortion"],
        "adherence": "medium",
    },
]


def test_a_song_plan_is_validated_and_sent_as_chunks(client: TestClient, monkeypatch) -> None:
    _eleven_on(client)
    sent: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> _Resp:
        sent.append({"url": url, **kwargs})
        return _Resp(content=_wav_bytes(), headers={"content-type": "audio/wav", "song-id": "s1"})

    monkeypatch.setattr(cloud.requests, "post", post)
    project, response = _start(
        client, {"caption": "dream pop", "plan": PLAN, "seed": 3}, provider="elevenlabs"
    )
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert sent[0]["json"] == {
        "composition_plan": {
            "chunks": [
                {
                    "text": "[Intro]",
                    "duration_ms": 8000,
                    "positive_styles": ["dream pop", "female vocal", "shimmering synths"],
                    "negative_styles": [],
                    "context_adherence": "high",
                },
                {
                    "text": "[Verse]\nNeon on the water\nSalt upon my skin",
                    "duration_ms": 20000,
                    "positive_styles": ["soft drums"],
                    "negative_styles": ["distortion"],
                    "context_adherence": "medium",
                },
            ]
        },
        "model_id": "music_v2_5",
        "seed": 3,
        "store_for_inpainting": True,
    }


@pytest.mark.parametrize(
    "plan",
    [
        [],
        [{"name": "", "seconds": 10, "styles": ["x"]}],
        [{"name": "A", "seconds": 2, "styles": ["x"]}],
        [{"name": "A", "seconds": 121, "styles": ["x"]}],
        [{"name": "A", "seconds": 10}],  # the first section sets the genre
        [{"name": "A", "seconds": 10, "styles": ["x"], "adherence": "max"}],
        [{"name": "A", "seconds": 10, "styles": ["x"], "lyrics": "\n".join(["la"] * 31)}],
        [{"name": "A", "seconds": 10, "styles": ["x"], "surprise": 1}],
        [{"name": "A", "seconds": 120, "styles": ["x"]}] * 6,  # 12 minutes
        [{"name": "A", "seconds": 10, "styles": ["x"]}] * 31,
    ],
)
def test_bad_plans_are_rejected(client: TestClient, plan: list[dict[str, Any]]) -> None:
    _eleven_on(client)
    _, response = _start(client, {"caption": "dream pop", "plan": plan}, provider="elevenlabs")
    assert response.status_code == 422


def test_plans_need_a_plan_capable_model(client: TestClient, monkeypatch) -> None:
    _eleven_on(client)
    monkeypatch.setattr(cloud.requests, "post", lambda *_a, **_k: pytest.fail("must not be sent"))
    project, response = _start(
        client, {"caption": "x y z", "plan": PLAN, "model_id": "music_v1"}, provider="elevenlabs"
    )
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "failed" and "Music 2" in job["error"]


def test_plan_drafting_returns_editable_sections(client: TestClient, monkeypatch) -> None:
    _eleven_on(client)
    reply = {
        "chunks": [
            {
                "text": "[Chorus]\nHold on",
                "duration_ms": 12000,
                "positive_styles": ["pop"],
                "negative_styles": [],
                "context_adherence": "low",
            }
        ]
    }
    seen: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> _Resp:
        seen.append({"url": url, **kwargs})
        return _Resp(payload=reply)

    monkeypatch.setattr(cloud.requests, "post", post)
    body = client.post(
        "/generation/providers/elevenlabs/plan",
        json={"fields": {"caption": "upbeat pop", "duration": 60}},
    )
    assert body.status_code == 200, body.text
    assert body.json()["plan"] == [
        {
            "name": "Chorus",
            "lyrics": "Hold on",
            "seconds": 12.0,
            "styles": ["pop"],
            "avoid": [],
            "adherence": "low",
        }
    ]
    assert seen[0]["url"] == "https://api.elevenlabs.io/v1/music/plan"
    assert seen[0]["json"]["music_length_ms"] == 60000
    assert (
        client.post("/generation/providers/acestep_local/plan", json={"fields": {}}).status_code
        == 422
    )


def test_old_style_plans_are_converted_too() -> None:
    sections = cloud.plan_from_api(
        {
            "positive_global_styles": ["rock"],
            "sections": [
                {
                    "section_name": "Verse",
                    "lines": ["a", "b"],
                    "duration_ms": 9000,
                    "positive_local_styles": ["loud"],
                }
            ],
        }
    )
    assert sections == [
        {
            "name": "Verse",
            "lyrics": "a\nb",
            "seconds": 9.0,
            "styles": ["rock", "loud"],
            "avoid": [],
            "adherence": "high",
        }
    ]


def test_inpaint_plans_keep_the_song_around_the_new_section() -> None:
    chunks, region = cloud.inpaint_plan(
        "repaint", {"caption": "folk, warm", "region_start": 40.0, "region_end": 60.0}, 300.0, "S"
    )
    assert region == (40.0, 60.0)
    kinds = ["ref" if "song_id" in c else "gen" for c in chunks]
    assert kinds == ["ref", "gen", "ref", "ref"]
    assert chunks[0]["range"] == {"start_ms": 0, "end_ms": 40000}
    assert chunks[1]["duration_ms"] == 20000 and chunks[1]["positive_styles"] == ["folk", "warm"]
    assert chunks[1]["text"] == "[Instrumental]"
    # The 240 s after the section is split into pieces of at most 120 s.
    assert [c["range"] for c in chunks[2:]] == [
        {"start_ms": 60000, "end_ms": 180000},
        {"start_ms": 180000, "end_ms": 300000},
    ]


def test_inpaint_absorbs_slivers_and_checks_length() -> None:
    chunks, region = cloud.inpaint_plan(
        "repaint", {"caption": "x", "region_start": 1.0, "region_end": 28.5}, 30.0, "S"
    )
    assert region == (0.0, 30.0) and len(chunks) == 1  # Less than 3 s would remain on each side.
    with pytest.raises(ParamError, match="3 to 120"):
        cloud.inpaint_plan(
            "repaint", {"caption": "x", "region_start": 10.0, "region_end": 140.0}, 300.0, "S"
        )
    follow, _ = cloud.inpaint_plan(
        "repaint",
        {
            "caption": "x",
            "region_start": 10.0,
            "region_end": 60.0,
            "follow_original": True,
            "lyrics": "la la",
        },
        90.0,
        "S",
    )
    gen = next(c for c in follow if "text" in c)
    assert gen["conditioning_ref"] == {
        "song_id": "S",
        "range": {"start_ms": 10000, "end_ms": 40000},
    }
    assert gen["condition_strength"] == "high" and gen["text"] == "[Verse]\nla la"


def test_extend_plans_add_a_section_at_either_end() -> None:
    chunks, region = cloud.inpaint_plan(
        "extend", {"caption": "x", "extend_seconds": 20, "extend_at": "start"}, 30.0, "S"
    )
    assert (
        region == (-20.0, 0.0)
        and "text" in chunks[0]
        and chunks[1]["range"] == {"start_ms": 0, "end_ms": 30000}
    )
    chunks, region = cloud.inpaint_plan("extend", {"caption": "x", "extend_seconds": 20}, 30.0, "S")
    assert region == (30.0, 50.0) and "text" in chunks[-1]


def _clip(client: TestClient, seconds: float = 6.0) -> tuple[str, dict[str, Any]]:
    project = client.post("/editor/projects", json={"name": "song"}).json()["id"]
    buffer = io.BytesIO()
    sf.write(buffer, _source(seconds), SR, format="WAV", subtype="FLOAT")
    asset = client.post(
        f"/editor/projects/{project}/assets",
        files={"file": ("song.wav", buffer.getvalue(), "audio/wav")},
    ).json()
    return project, asset


def _edit_job(
    client: TestClient,
    project: str,
    asset: dict[str, Any],
    fields: dict[str, Any],
    task: str = "repaint",
) -> dict[str, Any]:
    params = {
        "provider": "elevenlabs",
        "task": task,
        "title": "song (regenerated)",
        "fields": fields,
    }
    response = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "generate_song", "asset_id": asset["id"], "params": params},
    )
    assert response.status_code == 200, response.text
    return client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()


def test_editing_a_foreign_clip_needs_upload_consent(client: TestClient, monkeypatch) -> None:
    _eleven_on(client)
    monkeypatch.setattr(
        cloud.requests, "post", lambda *_a, **_k: pytest.fail("nothing may be sent")
    )
    project, asset = _clip(client)
    job = _edit_job(
        client, project, asset, {"caption": "folk", "region_start": 0.0, "region_end": 3.0}
    )
    assert job["status"] == "failed" and "Allow uploading" in job["error"]


def test_an_elevenlabs_edit_uploads_once_and_keeps_the_level(
    client: TestClient, monkeypatch
) -> None:
    _eleven_on(client)
    project, asset = _clip(client, seconds=12.0)
    calls: list[dict[str, Any]] = []
    source = _source(12.0)

    def post(url: str, **kwargs: Any) -> _Resp:
        calls.append({"url": url, **kwargs})
        if url.endswith("/upload"):
            assert kwargs["files"]["file"][0] == "clip.mp3"
            return _Resp(payload={"song_id": "up-1"})
        result = source.copy()
        result[3 * SR : 9 * SR] = 0.02
        buffer = io.BytesIO()
        sf.write(buffer, result * 0.7, SR, format="WAV", subtype="FLOAT")
        return _Resp(
            content=buffer.getvalue(), headers={"content-type": "audio/wav", "song-id": "new-1"}
        )

    monkeypatch.setattr(cloud.requests, "post", post)
    fields = {"caption": "folk", "region_start": 3.0, "region_end": 9.0, "allow_upload": True}
    job = _edit_job(client, project, asset, fields)
    assert job["status"] == "completed", job["error"]
    assert [c["url"].rsplit("/", 1)[-1] for c in calls] == ["upload", "music"]
    plan = calls[1]["json"]["composition_plan"]["chunks"]
    assert plan[0] == {"song_id": "up-1", "range": {"start_ms": 0, "end_ms": 3000}}
    assert calls[1]["params"] == {"output_format": "mp3_48000_192"}
    out = client.get(f"/editor/projects/{project}/assets/{job['result_assets'][0]['id']}/audio")
    edited, _ = sf.read(io.BytesIO(out.content), dtype="float32")
    assert np.allclose(edited[: 3 * SR], source[: 3 * SR], atol=1e-4)
    assert job["result"]["outputs"][0]["uploaded"] is True
    # The second edit of the same clip reuses the upload.
    calls.clear()
    assert _edit_job(client, project, asset, fields)["status"] == "completed"
    assert [c["url"].rsplit("/", 1)[-1] for c in calls] == ["music"]


def test_cost_estimates(client: TestClient) -> None:
    _eleven_on(client)
    client.post("/generation/providers/fal/key", json={"key": KEY}, headers=_headers())
    params = {
        "provider": "elevenlabs",
        "task": "text2music",
        "fields": {"caption": "folk", "duration": 120},
    }
    body = client.post("/generation/estimate", json={"params": params}).json()["estimate"]
    assert body["usd"] == 0.3 and "2.0 min" in body["summary"]
    params["fields"] = {"caption": "folk", "plan": PLAN}
    assert (
        client.post("/generation/estimate", json={"params": params}).json()["estimate"]["usd"]
        == 0.07
    )
    project, asset = _clip(client, seconds=60.0)
    edit = {
        "provider": "elevenlabs",
        "task": "extend",
        "fields": {"caption": "folk", "extend_seconds": 30},
    }
    body = client.post(
        "/generation/estimate",
        json={"params": edit, "project_id": project, "asset_id": asset["id"]},
    ).json()
    assert (
        body["estimate"]["usd"] == 0.38 and "uploading" in body["estimate"]["summary"]
    )  # 90 s + 60 s upload
    fal = {
        "provider": "fal",
        "task": "text2music",
        "fields": {"caption": "pop", "model": "fal-ai/lyria3/pro"},
    }
    assert (
        client.post("/generation/estimate", json={"params": fal}).json()["estimate"]["usd"] == 0.08
    )
    local = {"provider": "acestep_local", "task": "text2music", "fields": {"caption": "pop"}}
    assert client.post("/generation/estimate", json={"params": local}).json() == {"estimate": None}
    assert (
        client.post(
            "/generation/estimate", json={"params": params, "project_id": "nope"}
        ).status_code
        == 422
    )


# --------------------------------------------------------------------------- phase G4: albums

from audioqi.generation import albums  # noqa: E402


@pytest.fixture
def album_env(
    client: TestClient, fake: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> list[float]:
    """Albums run in the test's own thread, and waiting is instant."""
    waits: list[float] = []
    monkeypatch.setattr(albums, "start_runner", lambda: None)
    monkeypatch.setattr(albums, "sleep", waits.append)
    return waits


def _album(client: TestClient, **extra: Any) -> Any:
    body = {
        "title": "Night Drives",
        "provider": "acestep_local",
        "concept": "A synth-pop album about driving at night",
        "fields": {"caption": "synth-pop, airy vocal", "duration": 60},
        "tracks": [
            {"idea": "leaving the city"},
            {"idea": "coastal road"},
            {"title": "Dawn", "idea": "sunrise"},
        ],
        **extra,
    }
    return client.post("/generation/albums", json=body)


def test_an_album_generates_every_track_into_one_project(
    client: TestClient, album_env, fake: FakeProvider
) -> None:
    created = _album(client)
    assert created.status_code == 200, created.text
    album = created.json()
    assert album["status"] == "queued" and album["total"] == 3 and album["done"] == 0
    assert [t["title"] for t in album["tracks"]] == ["leaving the city", "coastal road", "Dawn"]
    albums.run_pending()
    finished = client.get(f"/generation/albums/{album['id']}").json()
    assert finished["status"] == "done" and finished["done"] == 3
    assert all(len(t["asset_ids"]) == 1 for t in finished["tracks"])
    # Without the writer, each idea is added to the album's style.
    assert [call["caption"] for call in fake.calls] == [
        "synth-pop, airy vocal, leaving the city",
        "synth-pop, airy vocal, coastal road",
        "synth-pop, airy vocal, sunrise",
    ]
    project = client.get(f"/editor/projects/{finished['project_id']}").json()
    assert len(project["assets"]) == 3
    assert len(client.get("/generation/history").json()) == 3
    assert client.get("/generation/albums").json()[0]["id"] == album["id"]


def test_the_writer_fills_each_track_but_user_settings_win(
    client: TestClient, album_env, fake, monkeypatch
) -> None:
    ideas: list[str] = []

    def write(payload: dict[str, Any]) -> dict[str, Any]:
        ideas.append(payload["idea"])
        return {
            "brief": {
                "title": "x",
                "caption": "written style",
                "lyrics": "[Verse]\nla",
                "bpm": 120,
                "duration": 150.0,
            },
            "engine": "ollama",
        }

    monkeypatch.setattr(albums.writer, "write", write)
    album = _album(client, write_lyrics=True, fields={"duration": 90}).json()
    albums.run_pending()
    assert client.get(f"/generation/albums/{album['id']}").json()["status"] == "done"
    assert fake.calls[0] == {
        "caption": "written style",
        "lyrics": "[Verse]\nla",
        "bpm": 120,
        "duration": 90,
    }
    assert "Track 2 of 3: coastal road" in ideas[1] and "Night Drives" in ideas[1]


def test_an_album_waits_for_memory_instead_of_failing(
    client: TestClient, album_env, fake, monkeypatch
) -> None:
    readings = iter([5.0] * 30 + [80.0] * 1000)
    monkeypatch.setattr(resources, "free_memory_percent", lambda: next(readings))
    ticks = iter(range(0, 10**7, 30))
    monkeypatch.setattr(resources.time, "monotonic", lambda: float(next(ticks)))
    monkeypatch.setattr(resources.time, "sleep", lambda _s: None)
    album = _album(client, tracks=[{"idea": "one"}]).json()
    albums.run_pending()
    finished = client.get(f"/generation/albums/{album['id']}").json()
    assert finished["status"] == "done", finished["tracks"][0]
    assert album_env  # It waited at least once.


def test_a_failed_track_does_not_stop_the_album(
    client: TestClient, album_env, fake, monkeypatch
) -> None:
    original = fake.generate

    def flaky(task: str, values: dict[str, Any], ctx: Any) -> list[Output]:
        if "coastal" in values["caption"]:
            raise EditorError("The engine could not generate this request.", 502)
        return original(task, values, ctx)

    monkeypatch.setattr(fake, "generate", flaky)
    album = _album(client).json()
    albums.run_pending()
    finished = client.get(f"/generation/albums/{album['id']}").json()
    assert finished["status"] == "partial"
    assert [t["status"] for t in finished["tracks"]] == ["done", "failed", "done"]
    assert "could not generate" in finished["tracks"][1]["error"]


def test_albums_can_be_cancelled_resumed_placed_and_removed(
    client: TestClient, album_env, monkeypatch
) -> None:
    album = _album(client).json()
    assert client.delete(f"/generation/albums/{album['id']}").status_code == 409  # Still active.
    # A restart in the middle of track 1:
    record = albums._load(album["id"])
    record["status"] = "running"
    record["tracks"][0]["status"] = "generating"
    albums._save(record)
    started: list[bool] = []
    monkeypatch.setattr(albums, "start_runner", lambda: started.append(True))
    albums.resume_on_startup()
    resumed = client.get(f"/generation/albums/{album['id']}").json()
    assert started and resumed["status"] == "queued" and resumed["tracks"][0]["status"] == "queued"
    cancelled = client.post(f"/generation/albums/{album['id']}/cancel").json()
    assert cancelled["status"] == "cancelled" and {t["status"] for t in cancelled["tracks"]} == {
        "cancelled"
    }
    assert (
        client.post(f"/generation/albums/{album['id']}/placed", json={"indexes": [1]}).json()[
            "tracks"
        ][0]["placed"]
        is False
    )
    assert client.delete(f"/generation/albums/{album['id']}").json() == {"deleted": True}
    assert client.get(f"/generation/albums/{album['id']}").status_code == 404
    assert client.get("/generation/albums/not-a-uuid").status_code == 404


@pytest.mark.parametrize(
    "change",
    [
        {"tracks": []},
        {"tracks": [{"idea": "x"}] * 21},
        {"tracks": [{"idea": "x", "surprise": 1}]},
        {"title": ""},
        {"provider": "suno"},
        {"fields": {"caption": "ok song", "bpm": 999}},
        {"write_lyrics": "yes"},
        {"surprise": True},
    ],
)
def test_bad_albums_are_refused(client: TestClient, album_env, change: dict[str, Any]) -> None:
    assert _album(client, **change).status_code in (404, 422)


def test_a_switched_off_provider_cannot_take_an_album(client: TestClient, album_env) -> None:
    assert _album(client, provider="elevenlabs").status_code == 403


def test_the_quality_model_is_pinned() -> None:
    ((name, (size, digest)),) = setup.QUALITY_MODELS.items()
    assert "xl-turbo" in name and size > 5_000_000_000 and len(digest) == 64


# --------------------------------------------------------------------------- phase G4: Lyria

from audioqi.generation.providers import lyria  # noqa: E402


def test_lyria_folds_everything_into_one_prompt() -> None:
    body = lyria.LyriaProvider().payload(
        {
            "caption": "jazz trio",
            "bpm": 96,
            "keyscale": "F major",
            "duration": 150,
            "lyrics": "[Verse]\nhi",
            "wav": True,
        }
    )
    assert body == {
        "model": "lyria-3.5",
        "input": "jazz trio\n\nTempo and key: 96 BPM, in F major.\n\nLength: about 150 seconds.\n\nLyrics:\n[Verse]\nhi",
        "response_format": {"type": "audio"},
    }
    clip = lyria.LyriaProvider().payload(
        {"caption": "drone", "instrumental": True, "model": "lyria-3-clip-preview", "duration": 90}
    )
    assert clip == {
        "model": "lyria-3-clip-preview",
        "input": "drone\n\nInstrumental only, no vocals.",
    }


def test_lyria_audio_is_found_in_the_documented_response_shape() -> None:
    wav = _wav_bytes()
    body = {
        "id": "abc",
        "steps": [
            {"type": "thought", "content": [{"type": "text", "text": "planning"}]},
            {
                "type": "model_output",
                "content": [
                    {"type": "text", "text": "[Verse] la la"},
                    {"type": "audio", "data": base64.b64encode(wav).decode()},
                ],
            },
        ],
    }
    audio, text = lyria.find_audio(body)
    assert audio == wav and "[Verse] la la" in text
    with pytest.raises(EditorError, match="no audio"):
        lyria.find_audio(
            {
                "steps": [
                    {
                        "type": "model_output",
                        "content": [{"type": "audio", "data": "!!not base64!!"}],
                    }
                ]
            }
        )


def test_lyria_generates_with_the_users_key(client: TestClient, monkeypatch) -> None:
    client.post("/generation/providers/lyria/key", json={"key": KEY}, headers=_headers())
    wav = _wav_bytes()
    reply = {
        "steps": [
            {
                "type": "model_output",
                "content": [{"type": "audio", "data": base64.b64encode(wav).decode()}],
            }
        ]
    }
    sent: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> _Resp:
        sent.append({"url": url, **kwargs})
        return _Resp(
            content=_json.dumps(reply).encode(), headers={"content-type": "application/json"}
        )

    monkeypatch.setattr(lyria.requests, "post", post)
    project, response = _start(client, {"caption": "jazz trio"}, provider="lyria")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert sent[0]["url"] == "https://generativelanguage.googleapis.com/v1beta/interactions"
    assert (
        sent[0]["headers"]["x-goog-api-key"] == KEY
        and sent[0]["headers"]["Api-Revision"] == "2026-05-20"
    )
    assert sent[0]["allow_redirects"] is False
    assert job["result"]["outputs"][0]["watermark"] == "SynthID"
    estimate = client.post(
        "/generation/estimate",
        json={"params": {"provider": "lyria", "task": "text2music", "fields": {"caption": "jazz"}}},
    )
    assert estimate.json()["estimate"]["usd"] == 0.08


def test_google_errors_are_explained_without_the_key(client: TestClient, monkeypatch) -> None:
    client.post("/generation/providers/lyria/key", json={"key": KEY}, headers=_headers())
    monkeypatch.setattr(
        lyria.requests,
        "post",
        lambda *_a, **_k: _Resp(
            status=400, payload={"error": {"message": "Prompt blocked by safety filters"}}
        ),
    )
    project, response = _start(client, {"caption": "jazz trio"}, provider="lyria")
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert (
        job["status"] == "failed" and "safety filters" in job["error"] and KEY not in job["error"]
    )


XL = "acestep-v15-xl-turbo-Q8_0.gguf"


def test_new_songs_use_the_quality_model_when_downloaded(
    client: TestClient, models: list[str]
) -> None:
    provider = acestep_provider.AceStepProvider()
    assert provider._request({"caption": "folk"})["synth_model"] == TURBO  # Not downloaded yet.
    models.append(XL)
    assert provider._request({"caption": "folk"})["synth_model"] == XL
    client.post("/generation/settings", json={"use_quality_model": False})
    assert provider._request({"caption": "folk"})["synth_model"] == TURBO
    # Edits keep the standard model.
    assert _edit("cover", {"caption": "lofi"})["synth_model"] == TURBO
    assert client.post("/generation/setup", json={"quality": "yes"}).status_code == 422
