import os
import argparse
from pathlib import Path
from huggingface_hub import snapshot_download


def resolve_base_model_path(checkpoints_path: str | None, model_folder: str) -> Path:
    if checkpoints_path:
        return Path(checkpoints_path).expanduser().resolve() / model_folder

    env_checkpoints = os.environ.get("COMFYUI_CHECKPOINTS_DIR")
    if env_checkpoints:
        return Path(env_checkpoints).expanduser().resolve() / model_folder

    env_models = os.environ.get("COMFYUI_MODELS_DIR")
    if env_models:
        return Path(env_models).expanduser().resolve() / "checkpoints" / model_folder

    # Fallback to a local relative path from the current working directory
    return Path.cwd() / "models" / "checkpoints" / model_folder


def main() -> None:
    parser = argparse.ArgumentParser(description="Download HeartCodec into a HeartMuLa model folder.")
    parser.add_argument("--checkpoints-path", type=str, default=None, help="Path to ComfyUI checkpoints folder.")
    parser.add_argument("--model-folder", type=str, default="HeartMuLa-oss-3B", help="Model folder name under checkpoints.")
    parser.add_argument("--codec-repo", type=str, default="filliptm/HeartCodec-oss", help="Hugging Face repo ID for HeartCodec.")
    parser.add_argument("--codec-subdir", type=str, default="HeartCodec-oss", help="Subfolder name for the codec.")
    args = parser.parse_args()

    base_model_path = resolve_base_model_path(args.checkpoints_path, args.model_folder)
    codec_path = base_model_path / args.codec_subdir

    if not base_model_path.exists():
        print(f"Error: Base model folder not found at {base_model_path}")
        print("Tip: pass --checkpoints-path or set COMFYUI_CHECKPOINTS_DIR.")
        raise SystemExit(1)

    print(f"Downloading {args.codec_repo} to: {codec_path}")
    try:
        snapshot_download(repo_id=args.codec_repo, local_dir=str(codec_path))
        print("Download complete.")

        # Verify
        if (codec_path / "model.safetensors").exists():
            print("Success: model.safetensors found in codec folder.")
        else:
            print("Warning: model.safetensors missing from codec download?")
    except Exception as e:
        print(f"Download failed: {e}")


if __name__ == "__main__":
    main()
