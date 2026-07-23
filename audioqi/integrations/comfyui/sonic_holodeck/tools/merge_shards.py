import torch
from safetensors.torch import load_file, save_file
import json
import glob
import os
import argparse

def merge_safetensors(input_folder=".", output_filename="HeartMuLa_3B_Merged.safetensors"):
    tensors = {}

    # 1. Find all safetensor shards (model-0000X-of-0000X.safetensors)
    # The user provided glob pattern: "model-*-of-*.safetensors"
    # We should search in the input folder.
    pattern = os.path.join(input_folder, "model-*-of-*.safetensors")
    shards = sorted(glob.glob(pattern))

    if not shards:
        print(f"No shards found in {input_folder}! Make sure you are in the correct folder.")
        return

    print(f"Found {len(shards)} shards in {input_folder}. Merging...")

    # 2. Load each shard and add to the main dictionary
    for shard in shards:
        print(f"Loading {os.path.basename(shard)}...")
        # load_file loads directly to CPU memory
        shard_data = load_file(shard, device="cpu")
        tensors.update(shard_data)

    # 3. Save as one file
    print(f"Saving to {output_filename}...")
    save_file(tensors, output_filename)
    print("Done! You can now move the merged file to your models folder.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Merge sharded safetensors files.")
    parser.add_argument("--folder", type=str, default=".", help="Folder containing the shards")
    parser.add_argument("--output", type=str, default="HeartMuLa_3B_Merged.safetensors", help="Output filename")

    args = parser.parse_args()
    merge_safetensors(args.folder, args.output)
