"""The user manual in every language keeps the same section anchors as the English one.

The app links to manual sections by anchor (the "?" buttons open /help#<anchor>), and the Help
page shows the manual in the interface language. Each heading in every edition is therefore
preceded by an `<a id="..."></a>` line, and every translation must have exactly the English
anchors in the same order.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

DOCS = Path(__file__).resolve().parents[1] / "docs"
ANCHOR = re.compile(r'^<a id="([\w-]+)"></a>\s*$')
HEADING = re.compile(r"^#{1,4}\s")


def _anchors(path: Path) -> list[str]:
    """The anchors in order, checking each heading (outside code blocks) has one just before it."""
    anchors: list[str] = []
    previous = ""
    fenced = False
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if line.startswith("```"):
            fenced = not fenced
        if not fenced and HEADING.match(line):
            found = ANCHOR.match(previous)
            assert found, f"{path.name}:{number}: heading without an <a id> line before it: {line!r}"
            anchors.append(found.group(1))
        if line.strip():
            previous = line
    return anchors


TRANSLATIONS = sorted(DOCS.glob("USER_MANUAL.*.md"))


def test_english_manual_has_an_anchor_for_every_heading() -> None:
    anchors = _anchors(DOCS / "USER_MANUAL.md")
    assert len(anchors) > 50
    assert "getting-started" in anchors


@pytest.mark.parametrize("path", TRANSLATIONS, ids=[path.name for path in TRANSLATIONS])
def test_translated_manual_has_the_english_anchors(path: Path) -> None:
    assert _anchors(path) == _anchors(DOCS / "USER_MANUAL.md")
