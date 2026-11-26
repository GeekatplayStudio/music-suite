"""Stateful Magenta streaming worker; commands arrive on stdin, results use atomic files."""

import json
import runpy
import sys
from pathlib import Path


def main():
    import numpy as np
    import soundfile as sf

    work = Path(sys.argv[1])
    setup = json.loads((work / "setup.json").read_text(encoding="utf-8"))
    runpy.run_path(str(Path(__file__).parents[1] / "offline_worker.py"))["configure"](setup)
    if setup["apple"]:
        from magenta_rt import MagentaRT2Mlx as Model
    else:
        from magenta_rt import MagentaRT2Jax as Model
    from magenta_rt import paths
    from magenta_rt.audio import Waveform
    from magenta_rt.config import DRUM_PIANOROLL, MUSICCOCA, PIANOROLL_WITH_ONSETS

    paths.set_magenta_home(setup["checkpoint_root"])

    model = Model(size=setup["model"])
    reference = None
    if setup.get("source"):
        data, rate = sf.read(setup["source"], dtype="float32", always_2d=True)
        reference = model.embed_style(Waveform(data, rate))
    state, held, caption, embedding = None, set(), None, None
    for line in sys.stdin:
        request = json.loads(line)
        index = request["index"]
        result = {}
        try:
            if request["caption"] != caption:
                caption = request["caption"]
                embedding = model.embed_style(caption, use_mapper=True)
            weight = request["reference_weight"]
            style = (
                embedding if reference is None else embedding * (1 - weight) + reference * weight
            )
            notes = set(request["notes"])
            conditioning = {MUSICCOCA.key: style}
            if request["midi"]:
                conditioning[PIANOROLL_WITH_ONSETS.key] = [
                    2 if n in notes - held else 1 if n in notes else 0 for n in range(128)
                ]
                conditioning[DRUM_PIANOROLL.key] = [request["drums"]]
            options = dict(
                temperature=request["temperature"],
                top_k=request["top_k"],
                cfg_scales={
                    "musiccoca": request["guidance"],
                    "notes": request["note_guidance"],
                    "drums": request["drum_guidance"],
                },
            )
            first, state = model.generate(
                conditioning=conditioning, frames=1, state=state, **options
            )
            pieces = [first.samples]
            if request["frames"] > 1:
                if request["midi"]:
                    conditioning[PIANOROLL_WITH_ONSETS.key] = [
                        1 if n in notes else 0 for n in range(128)
                    ]
                rest, state = model.generate(
                    conditioning=conditioning, frames=request["frames"] - 1, state=state, **options
                )
                pieces.append(rest.samples)
            held = notes
            sf.write(
                work / f"chunk-{index}.wav",
                np.concatenate(pieces),
                first.sample_rate,
                subtype="FLOAT",
            )
            result = {"ok": True}
        except Exception as exc:
            result = {"ok": False, "error": str(exc)[:500]}
        temporary = work / f"result-{index}.tmp"
        temporary.write_text(json.dumps(result), encoding="utf-8")
        temporary.replace(work / f"result-{index}.json")


if __name__ == "__main__":
    main()
