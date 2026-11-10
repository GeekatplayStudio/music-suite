"""AI music generation: schema validation, settings, the writer, the guard and the job flow.

No real engine, Ollama or network is used: the provider and HTTP calls are faked.
"""

from __future__ import annotations

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
    }
    assert {item["id"] for item in body["planned"]} == {"suno"}
    online = {p["id"]: p for p in body["providers"] if p["kind"] == "external"}
    assert set(online) == {"elevenlabs", "fal"}
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
        setup, "start_background", lambda writer=False: started.append(writer) or setup.state()
    )
    assert client.post("/generation/setup", json={"writer": "yes"}).status_code == 422
    assert client.post("/generation/setup", json={"url": "http://x"}).status_code == 422
    assert client.post("/generation/setup", json={"writer": True}).status_code == 200
    assert started == [True]


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
    }
    assert job["result"]["outputs"][0]["song_id"] == "abc"
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
    assert sent[1]["json"] == {"composition_plan": plan, "model_id": "music_v2_5", "seed": 11}


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
