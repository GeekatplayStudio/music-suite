"""A Music Suite colour scheme for Surge XT, as one of Surge's own skins.

Surge XT draws its whole interface from a *skin*: a folder with ``skin.xml`` (named
colours) and SVG artwork. This module makes a "Music Suite" skin on the user's computer
by recolouring Surge's factory dark skin: every control, display and graph stays exactly
where Surge puts it; only the colours move to the suite's slate and cyan.

The skin is generated from the copy of Surge XT that is installed, so none of Surge's
artwork (GPL-3) is stored in this repository.

It also sets two of Surge's own preferences, only where the user has not chosen yet:
the skin as the default, and Surge's on-screen keyboard shown in the plugin window, so
a sound can be played with the mouse or the computer keyboard right there.
"""

from __future__ import annotations

import colorsys
import os
import re
import shutil
import sys
from pathlib import Path
from xml.sax.saxutils import quoteattr

from audioqi.editor import instruments

SKIN_NAME = "Music Suite"
SKIN_DIR = f"{SKIN_NAME}.surge-skin"
BASE_SKIN = "dark-mode.surge-skin"
#: Bump to regenerate skins made by an earlier version of this module.
VERSION = 2
_STAMP = "music-suite-skin-version.txt"

# Surge's enums: ud_string = 1, ud_int = 2; skin root USER = 2. Surge stores a skin's
# name with a trailing path separator ("dark-mode.surge-skin\\" on Windows); without it
# the default is ignored.
_DEFAULTS = (
    ("defaultSkin", SKIN_DIR + os.sep, 1),
    ("defaultSkinRootType", "2", 2),
    ("showVirtualKeyboardPlugin", "1", 2),
)

_SLATE_HUE = 222 / 360
_CYAN_HUE = 188 / 360
_HEX = re.compile(r"#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F\w])")


def recolour(red: int, green: int, blue: int) -> tuple[int, int, int]:
    """One colour moved into the suite's scheme: greys to slate, blues to cyan."""
    hue, light, sat = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)
    if sat < 0.16:
        # Neutral: tint towards slate, a touch stronger in the dark panels than in text.
        tint = 0.36 if light < 0.35 else 0.24 if light < 0.75 else 0.16
        if light < 0.5:
            light *= 0.78  # Panels as deep as the suite's own (slate-900, not slate-700).
        light = 0.035 + light * 0.965  # Pure black becomes the suite's near-black navy.
        hue, sat = _SLATE_HUE, tint
    elif 190 / 360 <= hue <= 265 / 360:
        # Surge's blues (selection, modulation) become the suite's cyan.
        hue, sat = _CYAN_HUE, max(sat, 0.80)
        light = min(0.62, light * 1.08)
    else:
        return red, green, blue  # Orange accents, reds and greens keep their meaning.
    out = colorsys.hls_to_rgb(hue, light, sat)
    return tuple(round(max(0.0, min(1.0, channel)) * 255) for channel in out)  # type: ignore[return-value]


def recolour_text(text: str) -> str:
    """Every hex colour in a skin.xml or SVG file, recoloured. References are left alone."""

    def swap(match: re.Match[str]) -> str:
        before = text[max(0, match.start() - 6) : match.start()]
        if before.endswith(("url(", 'href="', "href='")):
            return match.group(0)  # An SVG reference such as url(#a1b2c3), not a colour.
        digits = match.group(1)
        if len(digits) == 3:
            digits = "".join(ch * 2 for ch in digits)
        rgb = recolour(int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16))
        return "#" + "".join(f"{value:02X}" for value in rgb) + digits[6:]

    return _HEX.sub(swap, text)


def user_dir() -> Path:
    """Surge XT's user area (its own default location)."""
    return Path.home() / "Documents" / "Surge XT"


def factory_skin() -> Path | None:
    item = instruments.CATALOG.get("surge-xt")
    content = instruments.content_dir(item) if item else None
    candidates = [content / "skins" / BASE_SKIN] if content else []
    if sys.platform == "darwin":
        candidates.append(Path("/Library/Application Support/Surge XT/skins") / BASE_SKIN)
    if sys.platform == "win32":
        candidates.append(Path(r"C:\ProgramData\Surge XT\skins") / BASE_SKIN)
    return next((path for path in candidates if (path / "skin.xml").is_file()), None)


def build_skin(source: Path, target: Path) -> int:
    """Write the recoloured skin to ``target``; returns how many files it holds."""
    if target.exists():
        shutil.rmtree(target)
    count = 0
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        out = target / path.relative_to(source)
        out.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix.lower() in (".xml", ".svg"):
            text = recolour_text(path.read_text(encoding="utf-8", errors="replace"))
            if path.name == "skin.xml":
                text = re.sub(
                    r'(<surge-skin\b[^>]*?\bname=)"[^"]*"', rf'\1"{SKIN_NAME}"', text, count=1
                )
            out.write_text(text, encoding="utf-8")
        else:
            shutil.copy2(path, out)
        count += 1
    (target / _STAMP).write_text(str(VERSION), encoding="utf-8")
    return count


def set_defaults(path: Path) -> list[str]:
    """Add the suite's preferences to Surge's defaults file, keeping every choice already there."""
    existing = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""
    if "</defaults>" not in existing:
        existing = (
            '<?xml version = "1.0" encoding = "UTF-8" ?>\n'
            "<!-- User Defaults for Surge XT Synthesizer -->\n"
            '<defaults version="1">\n</defaults>\n'
        )
    added = []
    lines = ""
    for key, value, kind in _DEFAULTS:
        if f'key="{key}"' in existing:
            continue  # The user (or Surge) already set this one.
        lines += f'  <default key="{key}" value={quoteattr(value)} type="{kind}"/>\n'
        added.append(key)
    if added:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(existing.replace("</defaults>", lines + "</defaults>", 1), encoding="utf-8")
    return added


def ensure() -> dict[str, object]:
    """Make sure the skin exists and is Surge's default look. Safe to call every time."""
    source = factory_skin()
    if source is None:
        return {"ok": False, "reason": "Surge XT's factory skins were not found."}
    target = user_dir() / "Skins" / SKIN_DIR
    stamp = target / _STAMP
    fresh = stamp.is_file() and stamp.read_text(encoding="utf-8").strip() == str(VERSION)
    try:
        files = 0 if fresh else build_skin(source, target)
        added = set_defaults(user_dir() / "SurgeXTUserDefaults.xml")
    except OSError as exc:
        return {"ok": False, "reason": f"The skin could not be written ({exc.strerror})."}
    return {"ok": True, "skin": str(target), "built": not fresh, "files": files, "defaults": added}


if __name__ == "__main__":
    print(ensure())
