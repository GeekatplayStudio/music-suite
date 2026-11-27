"""Syllables, rhymes and the lyrics helpers of the AI Song Studio (no network, no model)."""

# ruff: noqa: RUF001

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from audioqi.generation import lyrics_tools as lt
from audioqi.generation import writer

# A few words of the pronouncing dictionary, so English needs no download in tests.
_CMU = {
    "fire": ["F", "AY1", "ER0"],
    "choir": ["K", "W", "AY1", "ER0"],
    "through": ["TH", "R", "UW1"],
    "blue": ["B", "L", "UW1"],
    "love": ["L", "AH1", "V"],
    "move": ["M", "UW1", "V"],
    "street": ["S", "T", "R", "IY1", "T"],
    "feet": ["F", "IY1", "T"],
    "every": ["EH1", "V", "ER0", "IY0"],
}


@pytest.fixture(autouse=True)
def small_dictionary(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(lt, "_cmu", dict(_CMU))
    monkeypatch.setattr(lt, "_cmu_failed", False)


@pytest.mark.parametrize(
    ("language", "a", "b", "expected"),
    [
        ("ru", "дорога", "тревога", True),
        ("ru", "дорога", "книга", False),
        ("ru", "любовь", "кровь", True),
        ("ru", "огни", "дни", True),
        ("ru", "огни", "они", True),
        ("ru", "глаза", "гроза", True),
        ("ru", "ночь", "прочь", True),
        ("ru", "мостовой", "огни", False),
        ("uk", "ніч", "річ", True),
        ("es", "corazón", "canción", True),
        ("es", "tierra", "guerra", True),
        ("es", "vida", "herida", True),
        ("es", "noche", "luna", False),
        ("en", "fire", "choir", True),
        ("en", "through", "blue", True),
        ("en", "love", "move", False),
        ("de", "Herz", "Schmerz", True),
        ("de", "Nacht", "Macht", True),
        ("fr", "amour", "toujours", True),
        ("fr", "cœur", "bonheur", True),
        ("fr", "nuit", "pluie", True),
    ],
)
def test_rhymes(language: str, a: str, b: str, expected: bool) -> None:
    assert lt.rhymes(lt.ending(a, language), lt.ending(b, language)) is expected


def test_the_same_word_twice_is_not_a_rhyme() -> None:
    assert not lt.rhymes(lt.ending("огни", "ru"), lt.ending("огни", "ru"))


@pytest.mark.parametrize(
    ("language", "line", "syllables"),
    [
        ("ru", "Я иду по пустой мостовой", 9),
        ("uk", "Я іду по нічній вулиці", 9),
        ("es", "Mi corazón late por ti", 8),
        ("en", "every street", 4),
        ("de", "Ich gehe durch die leere Nacht", 8),
    ],
)
def test_syllables(language: str, line: str, syllables: int) -> None:
    assert lt.line_syllables(line, language) == syllables


def test_language_is_guessed_from_the_letters() -> None:
    assert lt.detect_language("Я иду по пустой мостовой") == "ru"
    assert lt.detect_language("Я іду по нічній вулиці") == "uk"
    assert lt.detect_language("Mi corazón late por ti, canción") == "es"
    assert lt.detect_language("Ich gehe durch die Nacht und") == "de"
    assert lt.detect_language("I walk along the empty street") == "en"


RU = (
    "[Verse]\nЯ иду по пустой мостовой\nГде-то светят ночные огни\n"
    "И шагаю я вновь за тобой\nСквозь холодные долгие дни\n"
    "[Chorus]\nЭто наша любовь\nЭто наша дорога\nКак горячая кровь\nНе боясь ни тревоги"
)


def test_analysis_marks_the_rhyme_scheme_per_section() -> None:
    result = lt.analyse(RU)
    assert result["language"] == "ru"
    verse = [entry["rhyme"] for entry in result["lines"] if entry["section"] == "Verse"]
    assert verse == ["A", "B", "A", "B"]  # ABAB.
    chorus = [entry["rhyme"] for entry in result["lines"] if entry["section"] == "Chorus"]
    assert chorus == ["A", None, "A", None]  # дорога / тревоги do not rhyme.
    assert [entry["syllables"] for entry in result["lines"][:4]] == [9, 9, 9, 9]
    assert result["lines"][0]["line"] == 1  # Numbers are lines of the text, tags included.


def test_rhyme_partner_follows_the_scheme() -> None:
    analysis = lt.analyse(RU)
    assert lt.rhyme_partner(analysis, 4) == 2  # дни rhymes with огни.
    assert lt.rhyme_partner(analysis, 9) == 7  # No rhyme yet: two lines up (ABAB).


def test_line_suggestions_are_measured_before_they_are_shown(monkeypatch: pytest.MonkeyPatch) -> None:
    prompts: list[str] = []

    def fake_model(_model: str, prompt: str, _schema: Any, _temperature: float = 0.9) -> Any:
        prompts.append(prompt)
        return {
            "lines": [
                "Сквозь туманные серые дни",  # 9 syllables, rhymes with огни.
                "Где в тумане тают тени",  # Does not rhyme.
                "Сквозь холодные долгие дни",  # The original: dropped.
                "Где стихают полночные дни",
                "Где застыли забытые дни",
            ]
        }

    monkeypatch.setattr(writer, "_writer_model", lambda: "test-model")
    monkeypatch.setattr(writer, "_ollama_json", fake_model)
    out = writer.suggest_line({"lyrics": RU, "line": 4, "language": "ru"})
    assert out["rhyme_word"] == "огни" and out["syllables"] == 9
    texts = [item["text"] for item in out["suggestions"]]
    assert "Сквозь холодные долгие дни" not in texts
    assert out["suggestions"][0]["rhymes"] is True and out["suggestions"][-1]["rhymes"] is False
    # Russian: the model is told the ending letters, which it follows far better.
    assert '"-ни"' in prompts[0]


def test_line_suggestions_can_skip_the_rhyme(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(writer, "_writer_model", lambda: "test-model")
    monkeypatch.setattr(writer, "_ollama_json", lambda *_a, **_k: {"lines": ["Где в тумане тают тени"]})
    out = writer.suggest_line({"lyrics": RU, "line": 4, "rhyme_with": None})
    assert out["rhyme_word"] is None and out["suggestions"][0]["rhymes"] is None


def test_line_suggestions_reject_bad_requests() -> None:
    with pytest.raises(writer.ParamError):
        writer.suggest_line({"lyrics": RU, "line": 0})  # A tag line has no words.
    with pytest.raises(writer.ParamError):
        writer.suggest_line({"lyrics": RU, "line": 99})


def test_the_style_is_improved_by_the_lyrics_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(writer, "status", lambda: {"available": True, "model_installed": True, "model": "m"})
    monkeypatch.setattr(
        writer, "_ollama_json", lambda *_a, **_k: {"caption": "A melancholic indie-folk ballad with acoustic guitar."}
    )
    out = writer.improve_caption({"caption": "грустная песня, гитара"})
    assert out["caption"].startswith("A melancholic") and out["engine"] == "ollama:m"


def test_lyrics_routes() -> None:
    client = TestClient(app)
    checked = client.post("/generation/lyrics/check", json={"lyrics": RU})
    assert checked.status_code == 200 and checked.json()["language"] == "ru"
    assert client.post("/generation/lyrics/check", json={"lyrics": 5}).status_code == 422
