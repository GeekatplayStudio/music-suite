import os
import sys
import shutil

def get_comfy_root():
    # .../ComfyUI/custom_nodes/Sonic-Holodeck/download_models.py
    base = os.path.dirname(os.path.abspath(__file__))
    # Up 2 levels to ComfyUI user folder, usually custom_nodes is in ComfyUI root or ComfyUI/
    # If base is custom_nodes/Sonic-Holodeck
    # dirname(base) is custom_nodes
    # dirname(dirname(base)) is ComfyUI root
    return os.path.dirname(os.path.dirname(base))

def download_models():
    print("Sonic-Holodeck: Checking model dependencies...")
    try:
        from huggingface_hub import hf_hub_download, snapshot_download
    except ImportError:
        print("Installing huggingface_hub...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "huggingface_hub"])
        from huggingface_hub import hf_hub_download, snapshot_download

    comfy_root = get_comfy_root()
    checkpoints_dir = os.path.join(comfy_root, "models", "checkpoints")

    # ---------------------------------------------------------
    # HeartMuLa Fix / Download Logic
    # ---------------------------------------------------------
    heartmula_folder = os.path.join(checkpoints_dir, "HeartMuLa-oss-3B")
    os.makedirs(heartmula_folder, exist_ok=True)

    print(f"\n--- Ensuring HeartMuLa-oss-3B Completeness in {heartmula_folder} ---")

    # 1. Ensure Tokenizer & Gen Config (From HeartMuLaGen repo)
    print("Checking Tokenizer & Config...")
    gen_repo_id = "HeartMuLa/HeartMuLaGen"
    try:
        for filename in ["tokenizer.json", "gen_config.json"]:
            dest_path = os.path.join(heartmula_folder, filename)
            if not os.path.exists(dest_path):
                print(f"Downloading {filename} from {gen_repo_id}...")
                cached_file = hf_hub_download(repo_id=gen_repo_id, filename=filename)
                shutil.copy2(cached_file, dest_path)
                print(f"Installed {filename}")
            else:
                print(f"Found {filename}")
    except Exception as e:
        print(f"Failed to setup config/tokenizer: {e}")

    # 2. Ensure Codec (From HeartCodec-oss-20260123 repo)
    print("\nChecking HeartCodec...")
    codec_dest_folder = os.path.join(heartmula_folder, "HeartCodec")
    os.makedirs(codec_dest_folder, exist_ok=True)

    codec_repo_id = "HeartMuLa/HeartCodec-oss-20260123"
    # Basic check - if config exists, assume okay?
    if not os.path.exists(os.path.join(codec_dest_folder, "config.json")) or \
       not os.path.exists(os.path.join(codec_dest_folder, "model-00001-of-00002.safetensors")):
       # Note: The codec is sharded, so check for first shard or model.safetensors
        print(f"Downloading HeartCodec from {codec_repo_id}...")
        try:
            # Download directly to destination to avoid symlink issues on Windows
            # and ignore symlink warnings
            os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
            snapshot_download(
                repo_id=codec_repo_id,
                local_dir=codec_dest_folder,
                local_dir_use_symlinks=False, # IMPORTANT for Windows
                allow_patterns=["*.json", "*.safetensors"]
            )
            print("HeartCodec installed successfully.")
        except Exception as e:
            print(f"Failed to download HeartCodec: {e}")
    else:
        print("HeartCodec found.")

    # 3. Ensure Main Model (HeartMuLa-oss-3B)
    # The user likely has this, but if not, download it?
    # It's huge (15GB), so maybe just warn if missing.
    print("\nChecking Main Transformer Model...")
    main_repo_id = "HeartMuLa/HeartMuLa-oss-3B"
    existing_safetensors = [f for f in os.listdir(heartmula_folder) if f.endswith(".safetensors")]
    if not existing_safetensors:
         print(f"WARNING: No .safetensors found in {heartmula_folder}.")
         print(f"You should download the model files from {main_repo_id} manually or let ComfyUI Manage it if supported.")
         print("Attempting to download main model config at least...")
         try:
             cached_file = hf_hub_download(repo_id=main_repo_id, filename="config.json")
             shutil.copy2(cached_file, os.path.join(heartmula_folder, "config.json"))
         except: pass
    else:
         print(f"Main model files present: {len(existing_safetensors)} safetensors found.")

    print("\n--- HeartMuLa Setup Complete ---\n")

    # ---------------------------------------------------------
    # Legacy Sonic Defaults
    # ---------------------------------------------------------
    legacy_repo = "facebook/musicgen-stereo-large"
    # ... (rest of old logic hidden or removed if not needed? keeping simplified for now)

if __name__ == "__main__":
    download_models()
