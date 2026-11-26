"""Download only reviewed checkpoint revisions, in the selected isolated environment."""

import json
import os
import shutil
import sys
from pathlib import Path


def main():
    if os.name == "nt":
        # Older Hub clients can cache a false-positive symlink probe on Windows.
        # Hard links for our layout remain available without Developer Mode.
        try:
            import huggingface_hub.file_download as downloads

            downloads.are_symlinks_supported = lambda *args, **kwargs: False
        except ImportError:
            pass
    folder, cache = Path(sys.argv[1]), sys.argv[2]
    plan = json.loads((folder / "download-plan.json").read_text(encoding="utf-8"))
    for model in plan["checkpoints"]:
        if model.get("kind") == "registry":
            continue
        from huggingface_hub import snapshot_download

        snapshot = Path(
            snapshot_download(
                model["repo"],
                revision=model["revision"],
                cache_dir=cache,
                allow_patterns=model.get("patterns"),
            )
        )
        refs = snapshot.parent.parent / "refs"
        refs.mkdir(exist_ok=True)
        (refs / "main").write_text(model["revision"], encoding="utf-8")
        if plan["id"] == "acestep_local":
            target = folder / "checkpoints"
            target.mkdir(exist_ok=True)
            for checkpoint in snapshot.glob("*.gguf"):
                destination = target / checkpoint.name
                try:
                    os.link(checkpoint.resolve(), destination)
                except OSError:
                    shutil.copy2(checkpoint, destination)
        if plan["id"] == "magenta_rt2":
            (folder / "checkpoint-root.json").write_text(
                json.dumps({"path": str(snapshot)}), encoding="utf-8"
            )
        if plan["id"] == "heartmula":
            target = folder / "checkpoints"
            if "HeartMuLa-oss" in model["repo"]:
                target /= "HeartMuLa-oss-3B"
            elif "HeartCodec" in model["repo"]:
                target /= "HeartCodec-oss"

            def link_or_copy(src, dst):
                try:
                    os.link(str(Path(src).resolve()), dst)
                except OSError:
                    shutil.copy2(src, dst)

            shutil.copytree(snapshot, target, dirs_exist_ok=True, copy_function=link_or_copy)
    if plan["id"] == "mega53":
        from bs_roformer import ensure_model_assets

        ensure_model_assets(
            "roformer-model-bs-roformer-mvsep-mega-53-stems", models_dir=str(folder / "checkpoints")
        )


if __name__ == "__main__":
    main()
