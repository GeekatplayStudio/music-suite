"""Isolated optional stem inference. No imports from the Music Suite backend."""

import json
import math
import runpy
import sys
from pathlib import Path


def main():
    import numpy as np
    import soundfile as sf

    work = Path(sys.argv[1])
    job = json.loads((work / "request.json").read_text(encoding="utf-8"))
    runpy.run_path(str(Path(__file__).parents[1] / "generation/offline_worker.py"))["configure"](
        job
    )
    output = work / "stems"
    output.mkdir(exist_ok=True)
    if job["model"] == "mega53":
        from bs_roformer import ensure_model_assets
        from bs_roformer.inference import main as infer

        checkpoint, config = ensure_model_assets(
            "roformer-model-bs-roformer-mvsep-mega-53-stems", models_dir=job["weights"]
        )
        sys.argv = [
            "bs-roformer-infer",
            "--input_folder",
            str(work / "input"),
            "--store_dir",
            str(output),
            "--config_path",
            str(config),
            "--model_path",
            str(checkpoint),
        ]
        infer()
        return

    import torch
    from huggingface_hub import snapshot_download
    from sam_audio import SAMAudio, SAMAudioProcessor
    from scipy.signal import resample_poly

    repo = job.get("repo", "facebook/sam-audio-small")
    model_dir = snapshot_download(
        repo, revision=job.get("revision"), cache_dir=job["cache"], local_files_only=True
    )
    processor = SAMAudioProcessor.from_pretrained(model_dir)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    network = SAMAudio.from_pretrained(model_dir).eval().to(device)
    audio, rate = sf.read(work / "input/mix.wav", dtype="float32", always_2d=True)
    model_rate = int(processor.audio_sampling_rate)
    divisor = math.gcd(rate, model_rate)
    resampled = (
        resample_poly(audio, model_rate // divisor, rate // divisor, axis=0)
        if rate != model_rate
        else audio
    )
    target = np.zeros_like(resampled)
    counts = np.zeros((len(resampled), 1), dtype="float32")
    size, overlap = model_rate * 30, model_rate
    with torch.inference_mode():
        for start in range(0, len(resampled), size - overlap):
            end = min(start + size, len(resampled))
            weight = np.ones(end - start, dtype="float32")
            if start:
                weight[: min(overlap, len(weight))] = np.linspace(0, 1, min(overlap, len(weight)))
            if end < len(resampled):
                weight[-overlap:] = np.linspace(1, 0, overlap)
            for channel in range(audio.shape[1]):
                tensor = torch.from_numpy(resampled[start:end, channel].copy())[None]
                batch = processor(audios=[tensor], descriptions=[job["prompt"]]).to(device)
                torch.manual_seed(0)
                result = network.separate(batch, predict_spans=False, reranking_candidates=1)
                wave = result.target[0].detach().float().cpu().numpy().reshape(-1)
                if len(wave) < end - start or not np.isfinite(wave).all():
                    raise ValueError("SAM Audio returned an incomplete or invalid waveform.")
                target[start:end, channel] += wave[: end - start] * weight
            counts[start:end] += weight[:, None]
    target /= np.maximum(counts, 1e-8)
    if rate != model_rate:
        target = resample_poly(target, rate // divisor, model_rate // divisor, axis=0)
    target = target[: len(audio)]
    if len(target) != len(audio):
        target = np.pad(target, ((0, len(audio) - len(target)), (0, 0)))
    sf.write(output / "target.wav", target, rate, subtype="FLOAT")
    sf.write(output / "remainder.wav", audio - target, rate, subtype="FLOAT")


if __name__ == "__main__":
    main()
