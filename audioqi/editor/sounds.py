"""Sound libraries of plugin instruments, browsable from the editor.

Surge XT's own patch menu does not take a pick when it is hosted by the plugin
worker, so the editor offers Surge XT's patches itself. A patch file (``.fxp``)
holds the same patch chunk that Surge XT saves as its plugin state; it is wrapped
in the VST3 state container that JUCE plugins use, and the result is a sound the
editor stores with the track and passes to the plugin like any saved sound.

Clients see patches by an opaque id only, never by path.
"""

from __future__ import annotations

import base64
import hashlib
import struct
import threading
import time
from pathlib import Path
from typing import Any

from audioqi.editor import instruments
from audioqi.editor.projects import EditorError, NotFoundError

#: Plugins whose patch files this module can read, by the name the scanner reports.
SURGE_NAMES = frozenset({"Surge XT"})
MAX_PATCH_BYTES = 8 * 1024 * 1024
MAX_SOUNDS = 20_000
_CACHE_SECONDS = 300.0
_LOCK = threading.Lock()
_cache: tuple[float, dict[str, dict[str, Any]]] | None = None

# JUCE's MemoryBlock text encoding: 6 bits per character, least significant first.
_JUCE_CHARS = ".ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+"
_STATE_HEAD = b'<?xml version="1.0" encoding="UTF-8"?>\n\n<VST3PluginState><IComponent>'
_STATE_TAIL = b"</IComponent></VST3PluginState>"
#: Written by JUCE after a plugin's own state: no private data, then its marker.
_JUCE_TRAILER = b"\x00" * 8 + b"JUCEPrivateData"


def juce_encode(data: bytes) -> str:
    """``MemoryBlock::toBase64Encoding``: ``<size>.<6-bit characters>``."""
    chars: list[str] = []
    # Every 3 bytes (24 bits, least significant first) make exactly 4 characters.
    for start in range(0, len(data), 3):
        group = int.from_bytes(data[start : start + 3], "little")
        chars += [_JUCE_CHARS[(group >> shift) & 0x3F] for shift in (0, 6, 12, 18)]
    return f"{len(data)}.{''.join(chars[: (len(data) * 8 + 5) // 6])}"


def juce_decode(text: str) -> bytes:
    size_text, _, body = text.partition(".")
    size = int(size_text)
    lookup = {char: index for index, char in enumerate(_JUCE_CHARS)}
    out = bytearray()
    for start in range(0, len(body), 4):
        group = 0
        for offset, char in enumerate(body[start : start + 4]):
            group |= lookup[char] << (6 * offset)
        out += group.to_bytes(3, "little")
    return bytes(out[:size])


def surge_state(patch: bytes) -> str:
    """Saved plugin state (base64) that makes Surge XT load ``patch`` (an ``.fxp`` file)."""
    if len(patch) < 64 or patch[:4] != b"CcnK" or patch[60:64] != b"sub3":
        raise EditorError("That is not a Surge XT patch.")
    (length,) = struct.unpack(">I", patch[56:60])
    chunk = patch[60 : 60 + length]
    if len(chunk) != length:
        raise EditorError("That Surge XT patch file is damaged.")
    xml = _STATE_HEAD + juce_encode(chunk + _JUCE_TRAILER).encode("ascii") + _STATE_TAIL
    # JUCE's binary XML: magic, the text's length, the text and a closing zero.
    return base64.b64encode(b"VC2!" + struct.pack("<I", len(xml)) + xml + b"\x00").decode("ascii")


def _surge_libraries() -> list[tuple[str, Path]]:
    item = instruments.CATALOG["surge-xt"]
    data = instruments.content_dir(item)
    libraries: list[tuple[str, Path]] = []
    if data is not None:
        libraries += [
            ("Factory", data / "patches_factory"),
            ("Third party", data / "patches_3rdparty"),
        ]
    libraries.append(("My patches", Path.home() / "Documents" / "Surge XT" / "Patches"))
    return libraries


def _scan() -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for library, root in _surge_libraries():
        try:
            files = sorted(root.rglob("*.fxp")) if root.is_dir() else []
        except OSError:
            continue
        for path in files:
            if len(found) >= MAX_SOUNDS:
                return found
            relative = path.relative_to(root)
            category = " / ".join(relative.parts[:-1]) or library
            sound_id = hashlib.sha256(f"surge:{library}:{relative.as_posix()}".encode()).hexdigest()
            found[sound_id[:16]] = {
                "id": sound_id[:16],
                "name": path.stem,
                "category": category,
                "library": library,
                "path": path,
            }
    return found


def _sounds(refresh: bool = False) -> dict[str, dict[str, Any]]:
    global _cache
    with _LOCK:
        if refresh or _cache is None or time.monotonic() - _cache[0] > _CACHE_SECONDS:
            _cache = (time.monotonic(), _scan())
        return _cache[1]


def reset_cache() -> None:
    global _cache
    with _LOCK:
        _cache = None


def list_sounds(plugin_name: str) -> list[dict[str, Any]]:
    """The sounds the editor can offer for this plugin; empty when it has no known library."""
    if plugin_name not in SURGE_NAMES:
        return []
    return [
        {key: item[key] for key in ("id", "name", "category", "library")}
        for item in _sounds().values()
    ]


def sound_state(plugin_name: str, sound_id: str) -> dict[str, str]:
    """``{"name", "state"}`` for one sound of this plugin's library."""
    if plugin_name not in SURGE_NAMES or not isinstance(sound_id, str):
        raise NotFoundError("Sound not found.")
    item = _sounds().get(sound_id) or _sounds(refresh=True).get(sound_id)
    if item is None:
        raise NotFoundError("Sound not found.")
    path: Path = item["path"]
    try:
        if path.stat().st_size > MAX_PATCH_BYTES:
            raise EditorError("That patch file is too large.")
        patch = path.read_bytes()
    except OSError as exc:
        raise EditorError("That patch file could not be read.") from exc
    return {"name": str(item["name"]), "state": surge_state(patch)}
