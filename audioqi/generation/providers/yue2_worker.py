"""Run one YuE2 generation. Executed by YuE2's own Python, never imported by the suite.

Usage: ``python -I yue2_worker.py <request.json> <output_dir>``

The request file holds ``style``, ``lyrics``, ``cot``, ``seed``, ``device`` and
``model``. Everything YuE2 writes goes into ``output_dir``; the suite picks the
audio file out of it. This file deliberately imports nothing from the suite, so
it runs in an environment that has only YuE2 installed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: yue2_worker.py <request.json> <output_dir>", file=sys.stderr)
        return 2
    request = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    if request.get("revisions"):
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from offline_worker import configure

        configure(request)
    out = Path(argv[2])
    out.mkdir(parents=True, exist_ok=True)

    from yue2 import YuE2Pipeline

    kwargs: dict[str, object] = {
        "style": str(request["style"]),
        "lyrics": str(request["lyrics"]),
        "cot": str(request.get("cot") or "full"),
    }
    if request.get("abc"):
        if kwargs["cot"] == "off":
            raise ValueError("Enable a composition plan to use an ABC score.")
        kwargs["abc"] = str(request["abc"])
    if request.get("seed") is not None:
        kwargs["seed"] = int(request["seed"])
    if request.get("cfg_scale") is not None:
        kwargs["cfg_scale"] = request["cfg_scale"]
    model = str(request.get("model") or "m-a-p/YuE2-3B")
    device = str(request.get("device") or "cuda")
    options = {
        "device": device,
        **request.get("pipeline_options", {}),
        **request.get("load_options", {}),
    }
    if request.get("sampling_config"):
        from yue2.protocol import GenerationConfig

        options["generation_config"] = GenerationConfig.from_dict(
            json.loads(request["sampling_config"])
        )
    with YuE2Pipeline.from_pretrained(model, **options) as pipe:
        if request.get("task") == "plan":
            song = pipe.plan(**kwargs)
            song.save(str(out))
        else:
            song = pipe(**kwargs)
            song.save_artifacts(str(out))
    summary = {
        "truncated": bool(getattr(song, "truncated", False)),
        "model": model,
        "abc": getattr(song, "abc", None),
    }
    (out / "music_suite_summary.json").write_text(json.dumps(summary), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
