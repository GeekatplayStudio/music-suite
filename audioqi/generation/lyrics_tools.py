"""Syllables and rhymes in song lyrics, by rule (no language model).

Used by the AI Song Studio's lyrics check and to verify the line alternatives a language
model suggests: a model is fluent but unreliable at rhyme and metre, particularly outside
English, so every suggestion is measured here before it is shown.

How each language is handled:

* Russian, Ukrainian: syllables are exact (one per vowel letter). Stress is not written, so
  a rhyme is judged from the end of the word: the last vowel and what follows, plus, for a
  word ending in a vowel, the consonant before it and the vowel before that.
* Spanish: syllables follow the diphthong and hiatus rules, and the stressed vowel is
  found from the accent marks and the stress rules, so rhymes are exact.
* English: the Carnegie Mellon pronouncing dictionary (downloaded once into the data
  folder) gives syllables and the stressed vowel; words it does not know, or no
  dictionary at all, fall back to spelling.
* German, French and others: syllables from vowel groups and rhymes from the last vowel
  group, with French silent endings removed. Approximate.
"""

# Cyrillic and typographic letters here are deliberate, not look-alikes.
# ruff: noqa: RUF001, RUF003

from __future__ import annotations

import hashlib
import re
import threading
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from audioqi import portable

# The Carnegie Mellon University pronouncing dictionary (BSD licence), pinned.
CMU_URL = (
    "https://raw.githubusercontent.com/cmusphinx/cmudict/"
    "74790861f652b15e4ac49015a90074ad62a27690/cmudict.dict"
)
CMU_SHA256 = "81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22"
CMU_BYTES = 3_618_488

MAX_LINES = 400
LANGUAGES = ("en", "ru", "uk", "es", "de", "fr")

_TAG = re.compile(r"^\s*\[([^\]]*)\]\s*$")
_WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*", re.UNICODE)

_VOWELS = {
    "ru": set("аеёиоуыэюя"),
    "uk": set("аеєиіїоуюя"),
    "es": set("aeiouáéíóúü"),
    "de": set("aeiouyäöü"),
    "fr": set("aeiouyàâäéèêëîïôöùûüÿœæ"),
    "en": set("aeiouy"),
}
_SPANISH_STRONG = set("aeoáéó")
_SPANISH_ACCENTED = set("áéíóú")
_DEVOICE = str.maketrans({"б": "п", "в": "ф", "г": "к", "д": "т", "ж": "ш", "з": "с"})
_REDUCE = str.maketrans({"о": "а", "я": "е"})


# --------------------------------------------------------------------------- dictionary

_cmu: dict[str, list[str]] | None = None
_cmu_lock = threading.Lock()
_cmu_failed = False


def cmu_path() -> Path:
    return portable.data_dir() / "cache" / "lyrics" / "cmudict.dict"


def _load_cmu(download: bool = True) -> dict[str, list[str]] | None:
    """The pronouncing dictionary, downloaded on first use; None when unavailable."""
    global _cmu, _cmu_failed
    if _cmu is not None or _cmu_failed:
        return _cmu
    with _cmu_lock:
        if _cmu is not None or _cmu_failed:
            return _cmu
        path = cmu_path()
        try:
            if not path.is_file() and download:
                response = requests.get(CMU_URL, timeout=30)
                response.raise_for_status()
                data = response.content
                if len(data) != CMU_BYTES or hashlib.sha256(data).hexdigest() != CMU_SHA256:
                    raise ValueError("the pronouncing dictionary did not match its fingerprint")
                path.parent.mkdir(parents=True, exist_ok=True)
                partial = path.with_suffix(".part")
                partial.write_bytes(data)
                partial.replace(path)
            if not path.is_file():
                _cmu_failed = True
                return None
            words: dict[str, list[str]] = {}
            for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
                head, _, phones = line.partition(" ")
                if not phones or "(" in head:
                    continue  # Alternative pronunciations: the first is enough here.
                words[head] = phones.split("#", 1)[0].split()
            _cmu = words
        except (OSError, ValueError, requests.RequestException):
            _cmu_failed = True
    return _cmu


# --------------------------------------------------------------------------- language


def detect_language(text: str) -> str:
    """A guess from the letters: Cyrillic is Russian or Ukrainian, accents tell the rest."""
    lower = text.lower()
    cyrillic = sum(1 for ch in lower if "Ѐ" <= ch <= "ӿ")
    latin = sum(1 for ch in lower if "a" <= ch <= "z")
    if cyrillic > latin:
        return "uk" if re.search(r"[іїєґ]", lower) else "ru"
    if re.search(r"[ñ¿¡]|ción\b|\b(el|los|que|para|corazón)\b", lower):
        return "es"
    if re.search(r"[äöüß]|\b(und|ich|nicht|das|ist)\b", lower):
        return "de"
    if re.search(r"[çœàèùâêîôû]|\b(et|je|tu|les|des|une|dans|pas)\b", lower):
        return "fr"
    return "en"


def normal_language(language: str | None, text: str) -> str:
    code = (language or "").strip().lower()[:2]
    return code if code in LANGUAGES else detect_language(text)


def _strip(text: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")


def words_of(line: str) -> list[str]:
    return [match.group(0).lower().replace("’", "'") for match in _WORD.finditer(line)]


# --------------------------------------------------------------------------- syllables


def _vowel_groups(word: str, vowels: set[str]) -> list[tuple[int, int]]:
    groups: list[tuple[int, int]] = []
    start = None
    for index, ch in enumerate(word):
        if ch in vowels:
            if start is None:
                start = index
        elif start is not None:
            groups.append((start, index))
            start = None
    if start is not None:
        groups.append((start, len(word)))
    return groups


def _spanish_nuclei(word: str) -> list[int]:
    """Indexes of the vowels that start a syllable (diphthongs merge, hiatus splits)."""
    nuclei: list[int] = []
    previous = ""
    for index, ch in enumerate(word):
        if ch not in _VOWELS["es"]:
            previous = ""
            continue
        if previous:
            both_strong = previous in _SPANISH_STRONG and ch in _SPANISH_STRONG
            accented_weak = previous in "íú" or ch in "íú"
            if not both_strong and not accented_weak:
                previous = ch
                continue  # A diphthong: same syllable.
        nuclei.append(index)
        previous = ch
    return nuclei


def _french_core(word: str) -> str:
    """The sounded part of a French word: silent endings removed (approximate)."""
    core = word.replace("œu", "eu").replace("œ", "e")
    if len(core) > 3 and core.endswith("es"):
        core = core[:-2]
    elif len(core) > 3 and core.endswith("e"):
        core = core[:-1]
    if len(core) > 2 and core[-1] in "sxtdzp":
        core = core[:-1]
    return core


def word_syllables(word: str, language: str) -> int:
    if language in ("ru", "uk"):
        return max(1, sum(1 for ch in word if ch in _VOWELS[language])) if word else 0
    if language == "en":
        cmu = _load_cmu()
        phones = cmu.get(word) if cmu else None
        if phones:
            return max(1, sum(1 for phone in phones if phone[-1].isdigit()))
        core = word[:-1] if word.endswith("e") and not word.endswith(("le", "ee")) and len(word) > 3 else word
        return max(1, len(_vowel_groups(core, _VOWELS["en"])))
    if language == "es":
        return max(1, len(_spanish_nuclei(word)))
    if language == "fr":
        return max(1, len(_vowel_groups(_french_core(word), _VOWELS["fr"])))
    return max(1, len(_vowel_groups(word, _VOWELS.get(language, _VOWELS["de"]))))


def line_syllables(line: str, language: str) -> int:
    return sum(word_syllables(word, language) for word in words_of(line))


# --------------------------------------------------------------------------- rhyme


@dataclass(frozen=True)
class Ending:
    """What decides whether a word rhymes, per language."""

    language: str
    tail: str  # The rhyming part: from the (stressed or last) vowel to the end.
    onset: str = ""  # Cyrillic open endings: the consonant before the last vowel.
    before: str = ""  # Cyrillic open endings: the vowel before that.
    open: bool = False
    word: str = ""


def _cyrillic_ending(word: str, language: str) -> Ending:
    vowels = _VOWELS[language]
    norm = word.replace("ё", "о").replace("э", "е").replace("ъ", "")
    positions = [index for index, ch in enumerate(norm) if ch in vowels]
    if not positions:
        return Ending(language, norm.translate(_DEVOICE), word=word)
    last = positions[-1]
    tail = norm[last:]
    if len(tail) > 1:
        tail = tail[:-1] + tail[-1:].translate(_DEVOICE)  # Final consonants are devoiced.
        return Ending(language, tail, word=word)
    onset = norm[last - 1] if last > 0 and norm[last - 1] not in vowels else ""
    if onset == "ь" and last > 1:
        onset = norm[last - 2 : last]
    # Unstressed о and а, е and я sound alike ("глаза" / "гроза"), so they compare as one.
    before = norm[positions[-2]].translate(_REDUCE) if len(positions) > 1 else ""
    return Ending(language, tail, onset=onset, before=before, open=True, word=word)


def _spanish_ending(word: str) -> Ending:
    nuclei = _spanish_nuclei(word)
    if not nuclei:
        return Ending("es", word, word=word)
    stressed = next((i for i in range(len(word)) if word[i] in _SPANISH_ACCENTED), None)
    if stressed is not None:
        start = stressed
    elif word[-1] in _VOWELS["es"] or word[-1] in "ns":
        start = nuclei[-2] if len(nuclei) > 1 else nuclei[-1]
    else:
        start = nuclei[-1]
    tail = _strip(word[start:])
    # A diphthong's glide before the stressed vowel is not part of the rhyme ("tierra",
    # "guerra" rhyme on "erra").
    if len(tail) > 1 and tail[0] in "iuy" and tail[1] in "aeiou" and word[start] not in "íú":
        tail = tail[1:]
    return Ending("es", tail, word=word)


def _english_ending(word: str) -> Ending:
    cmu = _load_cmu()
    phones = cmu.get(word) if cmu else None
    if phones:
        stressed = [i for i, phone in enumerate(phones) if phone.endswith(("1", "2"))]
        vowels = [i for i, phone in enumerate(phones) if phone[-1].isdigit()]
        start = stressed[-1] if stressed else (vowels[-1] if vowels else 0)
        return Ending("en", " ".join(phone.rstrip("012") for phone in phones[start:]), word=word)
    core = word[:-1] if word.endswith("e") and len(word) > 3 else word
    groups = _vowel_groups(core, _VOWELS["en"])
    return Ending("en", "~" + (core[groups[-1][0] :] if groups else core), word=word)


def ending(word: str, language: str) -> Ending:
    word = word.lower()
    if language in ("ru", "uk"):
        return _cyrillic_ending(word, language)
    if language == "es":
        return _spanish_ending(word)
    if language == "en":
        return _english_ending(word)
    core = _french_core(word) if language == "fr" else word
    vowels = _VOWELS.get(language, _VOWELS["de"])
    groups = _vowel_groups(core, vowels)
    return Ending(language, _strip(core[groups[-1][0] :]) if groups else core, word=word)


def ending_letters(word: str, language: str) -> str:
    """The letters a rhyming word should end with, to tell a language model plainly.

    Models follow "end in «-ни»" far better than "rhyme with «огни»" in Russian and
    Ukrainian (tried with gemma4:12b: no rhymes at all, then 5 of 8).
    """
    found = ending(word, language)
    return (found.onset + found.tail) if found.open else found.tail


def rhymes(a: Ending, b: Ending) -> bool:
    """True when two line endings rhyme. The same word twice is not a rhyme."""
    if not a.tail or not b.tail or a.word == b.word or a.tail != b.tail:
        return False
    if a.open and b.open:
        # Ending in a vowel, stress unknown: the consonant before it must match, and the
        # vowel before that too unless one word has only one syllable ("дни" / "огни").
        if a.onset != b.onset:
            return False
        if a.before and b.before and a.before != b.before:
            return False
    return True


# --------------------------------------------------------------------------- the check


def _letter(index: int) -> str:
    return chr(ord("A") + index) if index < 26 else f"Z{index - 25}"


def analyse(lyrics: str, language: str | None = None) -> dict[str, Any]:
    """Every sung line with its syllables and rhyme letter (per section, like AABB / ABAB).

    Tag lines ([Verse]) start a new section and are not counted. Lines that rhyme with no
    other line in their section get no letter.
    """
    if not isinstance(lyrics, str):
        raise ValueError("Lyrics must be text.")
    lang = normal_language(language, lyrics)
    lines: list[dict[str, Any]] = []
    section = ""
    section_index = 0
    for number, raw in enumerate(lyrics.splitlines()[:MAX_LINES]):
        tag = _TAG.match(raw)
        if tag:
            section = tag.group(1).strip()
            section_index += 1
            continue
        words = words_of(raw)
        if not words:
            continue
        lines.append(
            {
                "line": number,
                "text": raw.strip(),
                "section": section,
                "section_index": section_index,
                "syllables": line_syllables(raw, lang),
                "end_word": words[-1],
                "rhyme": None,
                "_ending": ending(words[-1], lang),
            }
        )
    # Rhyme letters, section by section.
    for current in sorted({entry["section_index"] for entry in lines}):
        members = [entry for entry in lines if entry["section_index"] == current]
        groups: list[list[dict[str, Any]]] = []
        for entry in members:
            for group in groups:
                if any(rhymes(entry["_ending"], other["_ending"]) for other in group):
                    group.append(entry)
                    break
            else:
                groups.append([entry])
        letters = 0
        for group in groups:
            if len(group) < 2:
                continue
            for entry in group:
                entry["rhyme"] = _letter(letters)
            letters += 1
    for entry in lines:
        entry.pop("_ending")
    return {"language": lang, "lines": lines, "dictionary": lang != "en" or _cmu is not None}


def rhyme_partner(analysis: dict[str, Any], line: int) -> int | None:
    """The line a given line should rhyme with, in the same section: one sharing its rhyme
    letter; else the nearest earlier line that has no rhyme yet; else the line one before it
    (second line of a couplet) or two before it (ABAB)."""
    entries = analysis["lines"]
    me = next((entry for entry in entries if entry["line"] == line), None)
    if me is None:
        return None
    same = [e for e in entries if e["section_index"] == me["section_index"] and e["line"] != line]
    if me["rhyme"]:
        partners = [e for e in same if e["rhyme"] == me["rhyme"]]
        if partners:
            return min(partners, key=lambda e: abs(e["line"] - line))["line"]
    earlier = [e for e in same if e["line"] < line]
    unpaired = [e for e in earlier if not e["rhyme"]]
    if unpaired:
        return unpaired[-1]["line"]  # The nearest earlier line still waiting for its rhyme.
    if len(earlier) % 2 == 1:
        return earlier[-1]["line"]  # Second line of a couplet.
    return earlier[-2]["line"] if len(earlier) >= 2 else None


def score_candidate(text: str, language: str, syllables: int | None, rhyme_word: str | None) -> dict[str, Any]:
    """How a suggested line measures up: its syllables, and whether it rhymes."""
    words = words_of(text)
    count = line_syllables(text, language)
    rhyme_ok = None
    if rhyme_word and words:
        rhyme_ok = rhymes(ending(words[-1], language), ending(rhyme_word, language))
    fits = syllables is None or abs(count - syllables) <= 1
    return {"text": text.strip(), "syllables": count, "rhymes": rhyme_ok, "fits": fits}
