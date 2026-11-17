"""The arranger: notes written from music theory, and its path through the job system.

No model, Ollama or network is used: the one optional HTTP call is faked.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import apps.api.editor as editor_api
import apps.api.main as api_main
from audioqi.editor import projects
from audioqi.generation import arranger, resources, schema, settings
from audioqi.generation.providers import arranger as provider_module
from audioqi.generation.providers.arranger import ArrangerProvider

DRUM_NOTES = {36, 38, 39, 42, 45, 46, 47, 49, 50, 51}
WALKING = {name for name, style in arranger.STYLES.items() if style.bass == "walking"}
KEYS = ("C major", "A minor", "F# major", "Eb minor", "B major", "Bb major")


def _track(result: dict[str, Any], role: str) -> dict[str, Any]:
    return next(track for track in result["tracks"] if track["role"] == role)


# --------------------------------------------------------------------------- the music


@pytest.mark.parametrize("style", sorted(arranger.STYLES))
def test_every_style_writes_all_six_parts_within_bounds(style: str) -> None:
    result = arranger.arrange(style=style, bars=24, seed=4)
    assert [track["role"] for track in result["tracks"]] == list(arranger.PARTS)
    for track in result["tracks"]:
        assert track["notes"], track["name"]
        assert 0 <= track["program"] <= 127
        for note in track["notes"]:
            assert 0 <= note["p"] <= 127
            assert 0.05 <= note["v"] <= 1.0
            assert note["d"] > 0
            assert 0 <= note["t"] <= result["seconds"] + 0.01
    drums = _track(result, "drums")
    assert drums["drums"] is True
    assert {note["p"] for note in drums["notes"]} <= DRUM_NOTES


@pytest.mark.parametrize("style", sorted(arranger.STYLES))
@pytest.mark.parametrize("key", KEYS)
def test_pitched_parts_stay_in_the_key(style: str, key: str) -> None:
    result = arranger.arrange(style=style, key=key, bars=32, seed=11)
    tonic, mode = arranger.parse_key(key)
    allowed = {(tonic + step) % 12 for step in arranger.SCALES[mode]}
    assert result["key"] == key
    for track in result["tracks"]:
        if track["drums"] or (track["role"] == "bass" and style in WALKING):
            continue
        outside = {note["p"] % 12 for note in track["notes"]} - allowed
        assert not outside, f"{track['name']} leaves {key}: {sorted(outside)}"


@pytest.mark.parametrize("style", sorted(WALKING))
def test_a_walking_bass_leaves_the_key_only_on_the_last_beat_of_a_chord(style: str) -> None:
    result = arranger.arrange(style=style, key="C major", bars=16, seed=3, bpm=120)
    allowed = set(arranger.SCALES["major"])
    chord_seconds = 2.0 / arranger.STYLES[style].chords_per_bar
    for note in _track(result, "bass")["notes"]:
        if note["p"] % 12 in allowed:
            continue
        # A chromatic approach note is the final quarter note before the next chord.
        into_chord = note["t"] % chord_seconds
        assert into_chord == pytest.approx(chord_seconds - 0.5, abs=0.01), note


def test_the_same_seed_gives_the_same_notes_and_another_seed_does_not() -> None:
    first = arranger.arrange(style="pop", bars=32, seed=1)
    assert first == arranger.arrange(style="pop", bars=32, seed=1)
    assert first != arranger.arrange(style="pop", bars=32, seed=2)


@pytest.mark.parametrize(
    ("beats", "unit", "bar_seconds", "pulses", "subdivision"),
    [
        (4, 4, 2.0, 4, 2),
        (3, 4, 1.5, 3, 2),
        (6, 8, 1.5, 2, 3),
        (12, 8, 3.0, 4, 3),
        (7, 8, 1.75, 7, 2),
    ],
)
def test_bars_last_what_the_time_signature_says(
    beats: int, unit: int, bar_seconds: float, pulses: int, subdivision: int
) -> None:
    result = arranger.arrange(bars=8, beats_per_bar=beats, beat_unit=unit, bpm=120, seed=2)
    assert result["seconds"] / result["bars"] == pytest.approx(bar_seconds)
    metre = arranger.Metre(beats, unit)
    assert (metre.pulses, metre.subdivision) == (pulses, subdivision)
    assert (result["beats_per_bar"], result["beat_unit"]) == (beats, unit)


@pytest.mark.parametrize("bars", [8, 16, 32, 48, 64, 96])
def test_the_form_fills_the_length_asked_for_and_keeps_its_ending(bars: int) -> None:
    result = arranger.arrange(style="pop", form="verse-chorus", bars=bars, seed=3)
    names = [section["name"] for section in result["sections"]]
    assert result["bars"] == bars
    assert names[0] == "Intro" and names[-1] == "Outro"
    assert result["sections"][0]["start"] == 0
    assert result["sections"][-1]["end"] == pytest.approx(result["seconds"])
    for before, after in zip(result["sections"], result["sections"][1:], strict=False):
        assert before["end"] == pytest.approx(after["start"])


def test_a_repeated_section_reuses_its_chords_and_varies_its_tune() -> None:
    result = arranger.arrange(style="pop", bars=64, seed=9)
    choruses = [section for section in result["sections"] if section["name"] == "Chorus"]
    assert len(choruses) >= 2

    def inside(role: str, section: dict[str, Any]) -> list[tuple[float, int]]:
        return sorted(
            (round(note["t"] - section["start"], 2), note["p"])
            for note in _track(result, role)["notes"]
            # Times are rounded to a tenth of a millisecond, so keep clear of the boundary.
            if section["start"] - 0.005 <= note["t"] < section["end"] - 0.005
        )

    # The pad holds the harmony: the same chords in the same voicing each time round.
    assert inside("pad", choruses[0]) == inside("pad", choruses[1])
    first, second = inside("melody", choruses[0]), inside("melody", choruses[1])
    assert set(first) & set(second), "the second chorus shares nothing with the first"


def test_only_the_parts_asked_for_are_written() -> None:
    result = arranger.arrange(style="rock", bars=16, seed=1, parts={"drums", "bass"})
    assert [track["role"] for track in result["tracks"]] == ["drums", "bass"]


def test_chords_are_voiced_to_move_as_little_as_possible() -> None:
    c_major = [48, 52, 55]
    f_major = [53, 57, 60]
    voiced = arranger.voice_chord(f_major, c_major, 45, 84)
    assert sorted(pitch % 12 for pitch in voiced) == [0, 5, 9]
    # C stays put and the other two voices move by step: C-F-A, not a leap to root position.
    assert voiced == [48, 53, 57]


def test_unknown_choices_fall_back_instead_of_failing() -> None:
    result = arranger.arrange(style="polka", key="H sharp", form="rondo", bars=8)
    assert result["key"] == "C major"
    assert result["tracks"]
    assert arranger.canonical_key(" a MINOR ") == "A minor"
    assert arranger.canonical_key("nonsense") is None


# --------------------------------------------------------------------------- the provider


def test_the_provider_describes_valid_controls() -> None:
    described = ArrangerProvider().describe()
    assert described["output"] == "notes"
    assert described["tasks"] == [
        {"id": "arrange", "label": "Write an arrangement", "source": False}
    ]
    for spec in described["fields"]:
        assert spec["type"] in schema.TYPES
        assert spec["group"] in described["groups"]
    defaults = {spec["key"]: spec["default"] for spec in described["fields"] if "default" in spec}
    cleaned = schema.validate(described["fields"], "arrange", defaults)
    assert cleaned["style"] == "pop" and cleaned["bars"] == 32 and cleaned["part_drums"] is True
    assert ArrangerProvider().status()["ready"] is True


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "d"))
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, fn: fn())

    def no_memory_check(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("the arranger loads no model, so memory must not be checked")

    monkeypatch.setattr(resources, "ensure_memory", no_memory_check)

    def no_network(*_args: Any, **_kwargs: Any) -> None:
        raise AssertionError("no idea was given, so nothing may be contacted")

    monkeypatch.setattr(provider_module.requests, "post", no_network)
    with TestClient(api_main.app) as test_client:
        yield test_client


def _arrange(client: TestClient, fields: dict[str, Any]) -> tuple[str, Any]:
    project = client.post("/editor/projects", json={"name": "song"}).json()["id"]
    response = client.post(
        f"/editor/projects/{project}/jobs",
        json={
            "op": "generate_song",
            "asset_id": None,
            "params": {
                "provider": "arranger",
                "task": "arrange",
                "title": "Sketch",
                "fields": fields,
            },
        },
    )
    return project, response


def test_a_job_returns_notes_for_the_editor_and_imports_no_audio(client: TestClient) -> None:
    fields = {"style": "funk", "key": "E minor", "bars": 16, "seed": 42, "part_arp": False}
    project, response = _arrange(client, fields)
    assert response.status_code == 200, response.text
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert job["result_assets"] == []
    result = job["result"]
    assert [track["role"] for track in result["tracks"]] == [
        "drums",
        "bass",
        "chords",
        "melody",
        "pad",
    ]
    assert result["arrangement"]["key"] == "E minor"
    assert result["arrangement"]["seed"] == 42
    assert result["arrangement"]["bars"] == 16
    assert "tracks" not in result["arrangement"]
    # The same request is the same music, so a result can be reproduced from its record.
    expected = arranger.arrange(
        style="funk",
        key="E minor",
        bars=16,
        seed=42,
        parts={"drums", "bass", "chords", "melody", "pad"},
    )
    assert result["tracks"] == expected["tracks"]
    history = client.get("/generation/history").json()
    assert history[0]["provider"] == "arranger" and history[0]["asset_ids"] == []
    assert history[0]["fields"]["seed"] == 42


def test_an_unset_seed_is_chosen_and_reported(client: TestClient) -> None:
    project, response = _arrange(client, {"bars": 8})
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert 0 <= job["result"]["arrangement"]["seed"] < 2**32


@pytest.mark.parametrize(
    "fields",
    [{"style": "polka"}, {"bars": 2}, {"bars": 5000}, {"beat_unit": "16"}, {"surprise": 1}],
)
def test_requests_are_checked_against_the_schema(
    client: TestClient, fields: dict[str, Any]
) -> None:
    _, response = _arrange(client, fields)
    assert response.status_code == 422, fields


def test_a_switched_off_arranger_is_refused(client: TestClient) -> None:
    settings.update({"providers": {"arranger": False}})
    _, response = _arrange(client, {"bars": 8})
    assert response.status_code == 403


# --------------------------------------------------------------------------- the idea


class _Answer:
    def __init__(self, body: Any, status: int = 200) -> None:
        self.status_code = status
        self._body = body

    def json(self) -> Any:
        return {"response": self._body}


def test_an_idea_is_only_trusted_as_far_as_the_lists_allow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[dict[str, Any]] = []

    def post(url: str, json: dict[str, Any], timeout: float) -> _Answer:
        sent.append({"url": url, **json})
        return _Answer('{"style": "jazz", "key": "f# MINOR", "bpm": 9000, "form": "sonata"}')

    monkeypatch.setattr(provider_module.requests, "post", post)
    chosen = provider_module.plan_from_idea("smoky late-night trio", "gemma4:12b")
    # A known style and key are taken; an impossible tempo and an unknown form are dropped.
    assert chosen == {"style": "jazz", "key": "F# minor"}
    assert sent[0]["url"].startswith("http://127.0.0.1:")
    assert "smoky late-night trio" in sent[0]["prompt"]


@pytest.mark.parametrize("body", ["not json", "[1, 2]", '{"style": 7}', ""])
def test_a_useless_answer_changes_nothing(monkeypatch: pytest.MonkeyPatch, body: str) -> None:
    monkeypatch.setattr(provider_module.requests, "post", lambda *_a, **_k: _Answer(body))
    assert provider_module.plan_from_idea("anything", "model") == {}


def test_what_the_user_set_beats_the_idea_and_no_ollama_is_not_an_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        provider_module.requests,
        "post",
        lambda *_a, **_k: _Answer(
            '{"style": "metal", "key": "D minor", "bpm": 160, "form": "short"}'
        ),
    )
    project, response = _arrange(client, {"idea": "heavy and fast", "style": "ballad", "bars": 8})
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    plan = job["result"]["arrangement"]
    # Style and form have defaults in the form, so they are the user's; key and tempo were unset.
    assert (plan["style"], plan["key"], plan["bpm"]) == ("ballad", "D minor", 160.0)
    assert plan["from_idea"] is True

    def refused(*_args: Any, **_kwargs: Any) -> None:
        raise provider_module.requests.ConnectionError("no Ollama here")

    monkeypatch.setattr(provider_module.requests, "post", refused)
    project, response = _arrange(client, {"idea": "heavy and fast", "bars": 8})
    job = client.get(f"/editor/projects/{project}/jobs/{response.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert job["result"]["arrangement"]["from_idea"] is False
