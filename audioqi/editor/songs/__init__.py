"""Full-song generation (style + lyrics -> a finished track) without ComfyUI.

Four engines sit behind one request shape:

* ``acestep``    local ACE-Step 1.5 REST server on loopback (MIT weights, commercial use OK)
* ``yue2``       local YuE2 run in its own Python environment (CC BY-NC 4.0 weights)
* ``elevenlabs`` ElevenLabs Music API (cloud, opt-in by saving a key)
* ``fal``        fal.ai hosted models such as MiniMax Music and Lyria 3 Pro (cloud, opt-in)

Only prompt text and lyrics ever leave the machine, and only to a cloud engine the
user picked and configured a key for. Audio is never uploaded.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from audioqi.editor.projects import EditorError
from audioqi.editor.songs import acestep, cloud, keys
from audioqi.editor.songs import yue2_engine as yue2
from audioqi.editor.songs.common import SongRequest, import_song

ENGINE_IDS = ("acestep", "yue2", "elevenlabs", "fal")


def engines_status() -> dict[str, Any]:
    """Every engine with whether it can run right now. Never raises, never returns a key."""
    return {
        "engines": [
            acestep.status(),
            yue2.status(),
            cloud.elevenlabs_status(),
            cloud.fal_status(),
        ],
        "keys": keys.summary(),
    }


def generate(
    project_id: str,
    request: SongRequest,
    progress: Callable[[float, str], None],
) -> dict[str, Any]:
    """Run one song generation and import the result as a new project asset."""
    if request.engine == "acestep":
        produced = acestep.generate(request, progress)
    elif request.engine == "yue2":
        produced = yue2.generate(request, progress)
    elif request.engine == "elevenlabs":
        produced = cloud.elevenlabs_generate(request, progress)
    elif request.engine == "fal":
        produced = cloud.fal_generate(request, progress)
    else:  # Validation rejects this earlier; kept as a guard.
        raise EditorError("Unknown song engine.")
    progress(92.0, "Importing the song.")
    return import_song(project_id, request, produced)


__all__ = ["ENGINE_IDS", "SongRequest", "engines_status", "generate"]
