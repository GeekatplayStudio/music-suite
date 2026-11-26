"""Executed in an optional model environment. No imports from Music Suite."""

import json
import runpy
import sys
from pathlib import Path


def main():
    work = Path(sys.argv[1])
    job = json.loads((work / "request.json").read_text(encoding="utf-8"))
    if job.get("revisions"):
        runpy.run_path(str(Path(__file__).parents[1] / "offline_worker.py"))["configure"](job)
    key, values, runtime = job["id"], job["fields"], Path(job["runtime"])
    src = runtime / "source"
    sys.path.insert(0, str(src))
    duration, caption = values["duration"], values["caption"]
    out = work / "output.wav"
    lyrics = work / "lyrics.txt"
    lyrics.write_text(values.get("lyrics", ""), encoding="utf-8")

    if key == "heartmula":
        import soundfile as sf
        import torchaudio

        def save_wave(path, waveform, sample_rate, **kwargs):
            sf.write(
                path,
                waveform.detach().float().cpu().numpy().T,
                sample_rate,
                format="WAV",
                subtype="FLOAT",
            )

        # Torch 2.9+ delegates save to an optional TorchCodec/FFmpeg DLL stack.
        # The workstation already imports lossless WAVs, so use its audio writer.
        torchaudio.save = save_wave
        if values.get("seed", -1) >= 0:
            import torch

            torch.manual_seed(values["seed"])
        tags = work / "tags.txt"
        tags.write_text(caption, encoding="utf-8")
        sys.argv = [
            "heartmula",
            "--model_path",
            job.get("checkpoint_root", str(runtime / "checkpoints")),
            "--lyrics",
            str(lyrics),
            "--tags",
            str(tags),
            "--save_path",
            str(out),
            "--max_audio_length_ms",
            str(duration * 1000),
            "--version",
            values.get("version", "3B"),
        ]
        for option in (
            "topk",
            "temperature",
            "cfg_scale",
            "mula_device",
            "codec_device",
            "mula_dtype",
            "codec_dtype",
            "lazy_load",
        ):
            sys.argv += ["--" + option, str(values[option])]
        runpy.run_path(str(src / "examples/run_music_generation.py"), run_name="__main__")
    elif key == "stable_audio3":
        import soundfile as sf
        from stable_audio_3.cli import main as render

        sys.argv = [
            "stable-audio",
            "--model",
            values["model"],
            "--prompt",
            caption,
            "--output",
            str(out),
            "--duration",
            str(duration),
            "--cfg-scale",
            str(values["cfg_scale"]),
            "--steps",
            str(values["steps"]),
            "--seed",
            str(values["seed"]),
        ]
        if values.get("negative_prompt"):
            sys.argv += ["--negative-prompt", values["negative_prompt"]]
        sys.argv.append("--chunked-decode" if values["chunked"] else "--no-chunked-decode")
        if values.get("device", "auto") != "auto":
            sys.argv += ["--device", values["device"]]
        if values.get("full_precision"):
            sys.argv.append("--no-half")
        sys.argv += ["--batch-size", str(values.get("batch_size", 1))]
        for name in values.get("loras", "").splitlines():
            name = name.strip()
            if not name:
                continue
            adapter_root = Path(job["adapters"]).resolve()
            adapter = (adapter_root / name).resolve()
            if (
                adapter.parent != adapter_root
                or not adapter.is_file()
                or adapter.suffix not in (".ckpt", ".safetensors")
            ):
                raise ValueError(
                    "Choose a checkpoint filename in the Stable Audio adapters folder."
                )
            sys.argv += ["--lora-ckpt-path", str(adapter)]
        if values.get("loras", "").strip():
            sys.argv += ["--lora-strength", str(values.get("lora_strength", 1.0))]
            if values.get("lora_index") is not None:
                sys.argv += ["--lora-index", str(values["lora_index"])]
        if job["task"] == "restyle":
            sys.argv += ["--init-audio", job["source"], "--init-noise-level", str(values["noise"])]
        if job["task"] in ("inpaint", "continue"):
            length = sf.info(job["source"]).duration
            start, end = (
                (length, duration)
                if job["task"] == "continue"
                else (values["start"], values["end"])
            )
            if not values.get("regions") and (
                not 0 <= start < end <= duration or (job["task"] == "inpaint" and end > length)
            ):
                raise ValueError(
                    "Choose a region inside the source or a continuation longer than the source."
                )
            sys.argv += ["--inpaint-audio", job["source"]]
            regions = json.loads(values["regions"]) if values.get("regions") else [[start, end]]
            for start, end in regions:
                if not 0 <= start < end <= duration or (job["task"] == "inpaint" and end > length):
                    raise ValueError(
                        "Choose inpaint regions inside the source and requested duration."
                    )
                sys.argv += ["--inpaint-start", str(start), "--inpaint-end", str(end)]
        render()
    elif key == "diffrhythm":
        import torch
        import torchaudio

        if values.get("seed", -1) >= 0:
            torch.manual_seed(values["seed"])
        script = src / "infer/infer.py"
        sys.path.insert(0, str(script.parent))
        sys.argv = [
            "infer",
            "--ref-prompt",
            caption,
            "--lrc-path",
            str(lyrics),
            "--audio-length",
            str(duration),
            "--output-dir",
            str(work),
            "--batch-infer-num",
            str(values["batch"]),
        ]
        if values["chunked"]:
            sys.argv.append("--chunked")
        if job["task"] == "reference":
            pos = sys.argv.index("--ref-prompt")
            sys.argv[pos : pos + 2] = ["--ref-audio-path", job["source"]]
        if job["task"] == "inpaint":
            sys.argv += [
                "--edit",
                "--ref-song",
                job["source"],
                "--edit-segments",
                values["edit_segments"],
            ]
        rendered = runpy.run_path(str(script), run_name="__main__")
        for index, candidate in enumerate(rendered.get("generated_songs", [])):
            torchaudio.save(str(work / f"output_{index + 1}.wav"), candidate, sample_rate=44100)
    elif key == "magenta_rt2":
        from magenta_rt import paths

        paths.set_magenta_home(job["checkpoint_root"])
        import soundfile as sf

        if job["apple"]:
            from magenta_rt import MagentaRT2Mlx as Constructor
        else:
            from magenta_rt import MagentaRT2Jax as Constructor
        from magenta_rt.audio import Waveform
        from magenta_rt.config import MUSICCOCA

        model = Constructor(
            size=values.get("model", "mrt2_small"),
            temperature=values["temperature"],
            top_k=values["top_k"],
            cfg_scales={
                "musiccoca": values["cfg_musiccoca"],
                "notes": values["cfg_notes"],
                "drums": values.get("cfg_drums", 1),
            },
        )
        style = caption
        if job["task"] == "reference":
            samples, rate = sf.read(job["source"], dtype="float32", always_2d=True)
            style = Waveform(samples, rate)
        embedding = model.embed_style(style, use_mapper=job["task"] != "reference")
        waveform, _ = model.generate(
            conditioning={MUSICCOCA.key: embedding}, frames=round(float(duration) * 25)
        )
        waveform.write(str(out))
    elif key == "minimax3":
        import soundfile as sf
        import torch
        from diffusers import ComponentsManager, ModularPipeline

        mode = values.get("offload", "auto-cpu")
        manager = ComponentsManager()
        if mode != "gpu":
            manager.enable_auto_cpu_offload(device="cuda")
        pipe = ModularPipeline.from_pretrained(
            "MiniMaxAI/MiniMax-Music3", components_manager=manager
        )
        pipe.load_components(dtype=getattr(torch, values.get("precision", "bfloat16")))
        if mode == "gpu":
            pipe.to("cuda")
        elif mode == "layer":
            from diffusers.hooks import apply_group_offloading

            apply_group_offloading(
                pipe.language_model,
                onload_device=torch.device("cuda"),
                offload_type="leaf_level",
                use_stream=True,
            )
        seed = values["seed"]
        generator = torch.Generator("cuda").manual_seed(seed) if seed >= 0 else None
        audio = pipe(
            prompt=caption,
            lyrics=values.get("lyrics", ""),
            audio_duration=float(duration),
            generator=generator,
            output="audios",
        )[0]
        if torch.is_tensor(audio):
            audio = audio.detach().float().cpu().numpy()
        sf.write(out, audio.T, pipe.sampling_rate)


if __name__ == "__main__":
    main()
