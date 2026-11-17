"""Song to MIDI: routing stems to transcribers, cleaning the notes, and the job.

The neural models are never loaded here: they are replaced by stand-ins, and the job test
runs on the always-available fallback engines.
"""

from __future__ import annotations

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
from audioqi import addons
from audioqi.editor import engines, jobs, plugins, projects, separation, transcribe
from audioqi.editor.projects import EditorError

SR = 44_100


def _note(t: float, p: int, v: float = 0.8, d: float = 0.3) -> dict[str, float]:
    return {"t": t, "d": d, "p": p, "v": v}


def _tone(pitch: int, seconds: float, level: float = 0.5) -> np.ndarray:
    t = np.arange(int(SR * seconds)) / SR
    wave = level * np.sin(2 * np.pi * 440.0 * 2 ** ((pitch - 69) / 12) * t)
    return np.stack([wave, wave], axis=1).astype(np.float32)


# --------------------------------------------------------------------------- cleaning notes


def test_tidy_bounds_sorts_and_drops_repeats() -> None:
    notes = [
        _note(2.0, 60),
        _note(0.5, 64, v=3.0, d=99.0),
        _note(0.51, 64),  # the same note reported twice by overlapping windows
        _note(-1.0, 60),
        _note(9.0, 60),  # after the audio ends
        _note(1.0, 200),
    ]
    tidy = transcribe._tidy(notes, seconds=4.0)
    assert [(note["t"], note["p"]) for note in tidy] == [(0.5, 64), (2.0, 60)]
    assert tidy[0]["v"] == 1.0 and tidy[0]["d"] == 3.5


def test_faint_overtones_of_a_louder_note_are_removed() -> None:
    notes = [
        _note(1.0, 48, v=0.9),
        _note(1.01, 60, v=0.3),  # the octave, faint: an overtone
        _note(1.0, 67, v=0.2),  # the twelfth, faint: an overtone
        _note(1.0, 64, v=0.85),  # as loud as the root: a real chord note two octaves+third up
        _note(1.0, 55, v=0.3),  # a fifth, not an overtone interval: kept
        _note(2.0, 60, v=0.3),  # the same pitch later, on its own: kept
    ]
    kept = {(note["t"], note["p"]) for note in transcribe.drop_overtones(notes)}
    assert kept == {(1.0, 48), (1.0, 64), (1.0, 55), (2.0, 60)}


def test_a_note_that_leaks_into_another_stem_stays_where_it_is_loudest() -> None:
    tracks: list[dict[str, Any]] = [
        {"name": "Piano", "notes": [_note(1.0, 60, v=0.9), _note(2.0, 64, v=0.2)]},
        {"name": "Guitar", "notes": [_note(1.03, 60, v=0.3), _note(2.0, 64, v=0.7)]},
        {"name": "Bass", "notes": [_note(1.0, 36, v=0.4)]},
    ]
    transcribe.drop_bleed(tracks)
    assert [(n["t"], n["p"]) for n in tracks[0]["notes"]] == [(1.0, 60)]
    assert [(n["t"], n["p"]) for n in tracks[1]["notes"]] == [(2.0, 64)]
    assert len(tracks[2]["notes"]) == 1


def test_a_single_line_keeps_the_loudest_of_notes_that_start_together(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    found = [_note(1.0, 45, v=0.9), _note(1.02, 57, v=0.4), _note(1.5, 47, v=0.5)]
    monkeypatch.setattr(transcribe, "poly_notes", lambda _audio, _sr: found)
    line = transcribe.single_line(_tone(45, 0.5), SR)
    assert [note["p"] for note in line] == [45, 47]


# --------------------------------------------------------------------------- engines


def test_each_part_gets_the_best_installed_engine_and_falls_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    installed = {"transkun", "basic_pitch"}
    monkeypatch.setattr(engines, "has_module", lambda name: name in installed)
    monkeypatch.setattr(transcribe, "piano_notes", lambda _a, _s: [_note(0.0, 60)])
    monkeypatch.setattr(transcribe, "poly_notes", lambda _a, _s: [_note(0.0, 62)])
    monkeypatch.setattr(transcribe, "single_line", lambda _a, _s: [_note(0.0, 40)])
    audio = _tone(60, 0.5)
    assert transcribe.transcribe_pitched(audio, SR, "piano")[1] == "transkun"
    assert transcribe.transcribe_pitched(audio, SR, "poly") == ([_note(0.0, 62)], "basic-pitch")
    assert transcribe.transcribe_pitched(audio, SR, "mono") == ([_note(0.0, 40)], "basic-pitch")

    def broken(_audio: np.ndarray, _sr: int) -> list[dict[str, float]]:
        raise RuntimeError("model crashed")

    # A failing model hands the part to the next engine instead of failing the job.
    monkeypatch.setattr(transcribe, "piano_notes", broken)
    assert transcribe.transcribe_pitched(audio, SR, "piano") == ([_note(0.0, 62)], "basic-pitch")

    installed.clear()
    assert transcribe.engines_available()["piano"] == "pyin"
    notes, engine = transcribe.transcribe_pitched(_tone(57, 1.0), SR, "mono")
    assert engine == "pyin" and {note["p"] for note in notes} == {57}


def test_drum_hits_are_found_in_frequency_bands() -> None:
    rng = np.random.default_rng(3)
    audio = np.zeros(SR * 4, dtype=np.float32)
    t = np.arange(int(SR * 0.25)) / SR
    kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-t * 30)) * t) * np.exp(-t * 14)
    hat = np.diff(rng.standard_normal(t.size + 1)) * np.exp(-t * 60) * 0.5
    kicks, hats = [0.5, 1.5, 2.5, 3.5], [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]
    for at in kicks:
        audio[int(at * SR) : int(at * SR) + t.size] += kick.astype(np.float32) * 0.6
    for at in hats:
        audio[int(at * SR) : int(at * SR) + t.size] += hat.astype(np.float32) * 0.4
    notes, engine = transcribe.drum_notes(np.stack([audio, audio], axis=1), SR, None)
    assert engine == "frequency bands"

    def near(pitch: int, expected: list[float]) -> bool:
        times = [note["t"] for note in notes if note["p"] == pitch]
        return len(times) == len(expected) and all(
            min(abs(at - want) for at in times) < 0.04 for want in expected
        )

    assert near(36, kicks), [n for n in notes if n["p"] == 36]
    assert near(42, hats), [n for n in notes if n["p"] == 42]
    assert transcribe.drum_notes(np.zeros((SR, 2), dtype=np.float32), SR, None)[0] == []


def test_kit_pieces_map_to_general_midi_drums_and_bleed_is_ignored() -> None:
    t = np.arange(int(SR * 0.2)) / SR
    hit = (np.sin(2 * np.pi * 180 * t) * np.exp(-t * 25)).astype(np.float32)
    loud = np.zeros(SR * 2, dtype=np.float32)
    quiet = np.zeros(SR * 2, dtype=np.float32)
    loud[SR // 2 : SR // 2 + t.size] += hit * 0.8
    quiet[SR : SR + t.size] += hit * 0.01  # far below the kit's loudest hit: bleed
    kit = {"snare": loud[:, None].repeat(2, axis=1), "toms": quiet[:, None].repeat(2, axis=1)}
    notes, engine = transcribe.drum_notes(loud[:, None], SR, kit)
    assert engine == "kit pieces"
    assert [note["p"] for note in notes] == [38]
    assert notes[0]["t"] == pytest.approx(0.5, abs=0.03)


# --------------------------------------------------------------------------- the whole song


def _fake_song(monkeypatch: pytest.MonkeyPatch, stems: dict[str, np.ndarray]) -> list[str]:
    asked: list[str] = []
    monkeypatch.setattr(engines, "stem_options", lambda: [2, 4, 6])
    monkeypatch.setattr(separation, "detail_available", lambda: True)

    def separate(_audio: Any, _sr: int, count: int, _report: Any, **options: Any) -> Any:
        assert count == 6 and options == {"drum_kit_pass": True}
        return stems, "fake separator"

    def pitched(_audio: np.ndarray, _sr: int, kind: str) -> Any:
        asked.append(kind)
        pitch = {"piano": 60, "poly": 64, "mono": 45}[kind]
        return [_note(0.5, pitch), _note(1.0, pitch + 60)], f"fake-{kind}"

    monkeypatch.setattr(separation, "separate", separate)
    monkeypatch.setattr(transcribe, "transcribe_pitched", pitched)
    monkeypatch.setattr(transcribe, "drum_notes", lambda *_a: ([_note(0.5, 36)], "kit pieces"))
    return asked


def test_a_song_becomes_one_track_per_instrument(monkeypatch: pytest.MonkeyPatch) -> None:
    loud, silent = _tone(60, 2.0), _tone(60, 2.0, level=0.0005)
    stems = {
        "vocals": loud,
        "bass": loud,
        "guitar": silent,  # nothing but bleed: left out, not transcribed
        "piano": loud,
        "other": loud,
        "kick": loud,
        "snare": loud,
    }
    asked = _fake_song(monkeypatch, stems)
    seen: list[float] = []
    result = transcribe.song_to_midi(_tone(60, 2.0), SR, seen.append)
    assert [(t["name"], t["program"], t["drums"]) for t in result["tracks"]] == [
        ("Vocals", 52, False),
        ("Bass", 33, False),
        ("Piano", 0, False),
        ("Other instruments", 48, False),
        ("Drums", 0, True),
    ]
    assert asked == ["mono", "mono", "piano", "poly"]
    assert result["skipped"] == ["Guitar"]
    assert result["engines"] == {
        "Vocals": "fake-mono",
        "Bass": "fake-mono",
        "Piano": "fake-piano",
        "Other instruments": "fake-poly",
        "Drums": "kit pieces",
    }
    # Notes outside what a voice or a bass can produce are dropped; the piano keeps both.
    by_name = {t["name"]: [n["p"] for n in t["notes"]] for t in result["tracks"]}
    assert by_name["Bass"] == [45] and by_name["Vocals"] == [45] and by_name["Piano"] == [60, 120]
    assert result["note_count"] == sum(len(t["notes"]) for t in result["tracks"])
    assert seen[0] <= seen[-1] == 1.0


def test_silence_and_songs_without_notes_are_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(EditorError, match="silent"):
        transcribe.song_to_midi(np.zeros((SR, 2), dtype=np.float32), SR)
    _fake_song(monkeypatch, {"other": _tone(60, 1.0)})
    monkeypatch.setattr(transcribe, "transcribe_pitched", lambda *_a: ([], "fake"))
    with pytest.raises(EditorError, match="No notes"):
        transcribe.song_to_midi(_tone(60, 1.0), SR)


# --------------------------------------------------------------------------- the job and the pack


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(projects, "SETTINGS", replace(projects.SETTINGS, data_dir=tmp_path / "d"))
    monkeypatch.setenv(engines.FORCE_FALLBACK_ENV, "1")
    monkeypatch.setattr(editor_api, "submit", lambda _job_id, fn: fn())
    plugins.reset_cache()
    with TestClient(api_main.app) as test_client:
        yield test_client
    plugins.reset_cache()


def test_the_job_runs_on_the_fallback_engines_and_returns_tracks(
    client: TestClient, tmp_path: Path
) -> None:
    # A bass note, a higher held note and a click on each beat.
    seconds, audio = 6.0, _tone(45, 6.0, 0.4) + _tone(69, 6.0, 0.25)
    for beat in np.arange(0.0, seconds, 0.5):
        at = int(beat * SR)
        audio[at : at + 200] += 0.5
    path = tmp_path / "song.wav"
    sf.write(str(path), audio, SR, subtype="FLOAT")
    project = client.post("/editor/projects", json={"name": "Demo"}).json()["id"]
    with path.open("rb") as handle:
        asset = client.post(
            f"/editor/projects/{project}/assets", files={"file": ("song.wav", handle, "audio/wav")}
        ).json()
    started = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "song_to_midi", "asset_id": asset["id"], "params": {}},
    )
    assert started.status_code == 200, started.text
    job = client.get(f"/editor/projects/{project}/jobs/{started.json()['id']}").json()
    assert job["status"] == "completed", job["error"]
    assert job["result_assets"] == []
    tracks = job["result"]["tracks"]
    assert tracks and job["result"]["note_count"] == sum(len(t["notes"]) for t in tracks)
    for track in tracks:
        assert {"name", "role", "program", "drums", "notes"} <= set(track)
        for note in track["notes"]:
            assert 0 <= note["p"] <= 127 and 0 <= note["t"] < seconds and note["d"] > 0
    assert set(job["result"]["engines"].values()) <= {"pyin", "frequency bands"}
    assert client.get("/editor/capabilities").json()["song_to_midi"]["piano"] == "pyin"
    bad = client.post(
        f"/editor/projects/{project}/jobs",
        json={"op": "song_to_midi", "asset_id": asset["id"], "params": {"surprise": 1}},
    )
    assert bad.status_code == 422
    assert "song_to_midi" in jobs.OPS


def test_the_notes_pack_installs_basic_pitch_without_its_pins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(addons, "has_module", lambda _name: True)
    monkeypatch.setattr(addons, "_freeze", lambda: ["numpy==2.5.3"])
    monkeypatch.setattr(addons, "_stream", lambda command, *_a, **_k: calls.append(command))
    monkeypatch.setattr(
        addons, "download_model", lambda *_a, **_k: pytest.fail("this pack downloads no models")
    )
    addons.install("notes", None, lambda *_a: None)
    assert calls[0][-1] == "transkun>=2.0.1" and "--no-deps" not in calls[0]
    assert calls[1][-2:] == ["--no-deps", "basic-pitch==0.4.0"]
    # Both are still held to what is already installed.
    assert all("-c" in command for command in calls)
