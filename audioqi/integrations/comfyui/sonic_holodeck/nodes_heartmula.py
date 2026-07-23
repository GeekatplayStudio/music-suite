import os
import sys
import folder_paths
import torch
from pathlib import Path
import math
import numpy as np
import types

# Try to import from the FL_HeartMuLa node if available
try:
    # Add the custom nodes directory to sys.path to find sibling nodes
    custom_nodes_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    heartmula_path = os.path.join(custom_nodes_path, "ComfyUI_FL-HeartMuLa")

    if os.path.exists(heartmula_path):
        if heartmula_path not in sys.path:
            sys.path.insert(0, heartmula_path)

        # These imports assume the HeartMuLa structure
        from heartlib import HeartMuLaGenPipeline
        from heartlib.pipelines.music_generation import HeartMuLaGenConfig
        from heartlib.heartmula.modeling_heartmula import HeartMuLa
        from heartlib.heartcodec.modeling_heartcodec import HeartCodec
        from tokenizers import Tokenizer

        # We also need model_manager utils for VRAM detection if we want to be smart
        from fl_utils import model_manager
        HEARTMULA_AVAILABLE = True
    else:
        HEARTMULA_AVAILABLE = False
except Exception as e:
    print(f"Sonic-Holodeck: Failed to import HeartMuLa backend: {e}")
    HEARTMULA_AVAILABLE = False

# --- Memory Optimized Detokenize Patch ---
@torch.inference_mode()
def optimized_detokenize(
    self,
    codes,
    duration=29.76,
    num_steps=10,
    disable_progress=False,
    guidance_scale=1.25,
    device=None,
):
    print("Sonic: Using Memory Optimized Detokenize...")
    # Auto-detect device if not specified
    if device is None:
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"

    codes = codes.unsqueeze(0).to(device)

    # Pre-calculate parameters
    first_latent_length = 0
    first_latent_codes_length = 0
    min_samples = int(duration * 12.5)

    # Important: Flow Matching output size is roughly duration * 25
    # Decoder step matches this logic

    min_samples_audio = int(duration * self.sample_rate) # Used for final output cut

    hop_samples = min_samples // 93 * 80
    ovlp_samples = min_samples - hop_samples
    ovlp_frames = ovlp_samples * 2

    # Initial Latent Buffer
    first_latent = torch.randn(
        codes.shape[0], int(duration * 25), 256, device=device
    )  # B, T, 64

    codes_len = codes.shape[-1]  #
    target_len = int(
        (codes_len - first_latent_codes_length) / 12.5 * self.sample_rate
    )

    # code repeat logic (same as original)
    if codes_len < min_samples:
        while codes.shape[-1] < min_samples:
            codes = torch.cat([codes, codes], -1)
        codes = codes[:, :, 0:min_samples]
    codes_len = codes.shape[-1]

    if (codes_len - ovlp_frames) % hop_samples > 0:
        len_codes = (
            math.ceil((codes_len - ovlp_samples) / float(hop_samples)) * hop_samples
            + ovlp_samples
        )
        while codes.shape[-1] < len_codes:
            codes = torch.cat([codes, codes], -1)
        codes = codes[:, :, 0:len_codes]

    latent_length = int(duration * 25)

    # Audio Reconstruction Param
    # min_samples here refers to duration in seconds * sample_rate ?
    # Original: min_samples = int(duration * self.sample_rate) (re-defined later in original function)
    # We use 'min_samples_audio' to disambiguate from the 'min_samples' used for codes slicing

    # Original decode logic constants re-calculated for scalar model
    # min_samples = int(duration * self.sample_rate) # (Redefined in original line 150)
    decode_hop_samples = min_samples_audio // 93 * 80
    decode_ovlp_samples = min_samples_audio - decode_hop_samples

    output_audio = None

    # Context management
    last_generated_latent = None

    # Loop
    loop_steps = range(0, codes.shape[-1] - hop_samples + 1, hop_samples)

    for i, sinx in enumerate(loop_steps):
        codes_input = []
        codes_input.append(codes[:, :, sinx : sinx + min_samples])

        # --- 1. Flow Matching Generation ---
        current_latents = None

        if sinx == 0 or ovlp_frames == 0:
            incontext_length = first_latent_length
            current_latents = self.flow_matching.inference_codes(
                codes_input,
                first_latent,
                latent_length,
                incontext_length,
                guidance_scale=guidance_scale,
                num_steps=num_steps,
                disable_progress=disable_progress,
                scenario="other_seg",
            )
        else:
            # Requires latent from previous step
            # true_latent = latent_list[-1][:, -ovlp_frames:, :]
            true_latent = last_generated_latent[:, -ovlp_frames:, :]
            len_add_to_latent = latent_length - true_latent.shape[1]
            incontext_length = true_latent.shape[1]

            true_latent = torch.cat(
                [
                    true_latent,
                    torch.randn(
                        true_latent.shape[0],
                        len_add_to_latent,
                        true_latent.shape[-1],
                        device=device,
                    ),
                ],
                1,
            )
            current_latents = self.flow_matching.inference_codes(
                codes_input,
                true_latent,
                latent_length,
                incontext_length,
                guidance_scale=guidance_scale,
                num_steps=num_steps,
                disable_progress=disable_progress,
                scenario="other_seg",
            )

        # Store for next iteration context (Keep on GPU)
        last_generated_latent = current_latents

        # --- 2. Process for Decoding ---
        # "latent_list[0] = latent_list[0][:, first_latent_length:, :]"
        decode_latent = current_latents.float()
        if i == 0:
            decode_latent = decode_latent[:, first_latent_length:, :]

        # --- 3. Decode to Audio (Scalar Model) ---
        # Reshaping logic from original
        # bsz, t, f = decode_latent.shape
        latent_reshaped = decode_latent.reshape(
            decode_latent.shape[0], decode_latent.shape[1], 2, decode_latent.shape[2] // 2
        ).permute(0, 2, 1, 3)
        latent_reshaped = latent_reshaped.reshape(
            latent_reshaped.shape[0] * 2, latent_reshaped.shape[2], latent_reshaped.shape[3]
        )

        # Run Decoder
        cur_output = (
            self.scalar_model.decode(latent_reshaped.transpose(1, 2)).squeeze(0).squeeze(1)
        )  # 1 512 256

        # Move to CPU immediately to free VRAM
        cur_output = cur_output[:, 0:min_samples_audio].detach().cpu()
        if cur_output.dim() == 3:
            cur_output = cur_output[0]

        # --- 4. Accumulate Audio ---
        if output_audio is None:
            output_audio = cur_output
        else:
            if decode_ovlp_samples == 0:
                output_audio = torch.cat([output_audio, cur_output], -1)
            else:
                ov_win = torch.from_numpy(np.linspace(0, 1, decode_ovlp_samples)[None, :])
                ov_win = torch.cat([ov_win, 1 - ov_win], -1)

                # Blend overlap
                output_audio[:, -decode_ovlp_samples:] = (
                    output_audio[:, -decode_ovlp_samples:] * ov_win[:, -decode_ovlp_samples:]
                    + cur_output[:, 0:decode_ovlp_samples] * ov_win[:, 0:decode_ovlp_samples]
                )

                # Append new part
                output_audio = torch.cat([output_audio, cur_output[:, decode_ovlp_samples:]], -1)

        # Memory Cleanup
        del decode_latent
        del latent_reshaped
        del cur_output
        torch.cuda.empty_cache()

    output_audio = output_audio[:, 0:target_len]
    return output_audio

def get_subfolders(directory):
    if not os.path.exists(directory):
        return []
    return [d for d in os.listdir(directory) if os.path.isdir(os.path.join(directory, d))]

if HEARTMULA_AVAILABLE:
    class CustomHeartMuLaGenPipeline(HeartMuLaGenPipeline):
        """
        A custom subclass that relaxes the rigid folder structure requirements of the original pipeline.
        It searches for components (Codec, Model) in standard subfolders OR the root folder.
        """
        @classmethod
        def from_pretrained(
            cls,
            pretrained_path: str,
            device: torch.device,
            dtype: torch.dtype,
            version: str,
            bnb_config = None,
        ):
            print(f"Sonic: Custom Pipeline Loading from {pretrained_path}...")
            missing_components = []

            # --- Helper: Check Config content to identify component ---
            def check_config_type(path, expected_arch_keywords):
                cfg_path = os.path.join(path, "config.json")
                if not os.path.exists(cfg_path):
                    return False
                try:
                    with open(cfg_path, 'r', encoding='utf-8') as f:
                        content = f.read().lower()
                        # Simple substring check
                        return any(k.lower() in content for k in expected_arch_keywords)
                except:
                    return False

            # --- 1. Find HeartCodec ---
            heartcodec_path = None
            codec_candidates = [
                os.path.join(pretrained_path, "HeartCodec-oss"),
                os.path.join(pretrained_path, "HeartCodec"),
                os.path.join(pretrained_path, "codec"),
                pretrained_path # Maybe it's flattened?
            ]

            for path in codec_candidates:
                if os.path.exists(path):
                    # Check if it looks like a Codec (not the Transformer)
                    # HeartCodec usually has "compression" or specific arch in config
                    # But if we can't be sure, we prioritize explicit folders "HeartCodec..."
                    is_root = (path == pretrained_path)

                    if is_root:
                        # If looking at root, be VERY strict.
                        # Only accept if config says "codec" or "compression" inside to avoid loading Transformer
                        if check_config_type(path, ["HeartCodec", "Encodec", "CompressionModel"]):
                            pass # Good
                        else:
                             continue # Skip root if it doesn't look like Codec

                    try:
                        print(f"Sonic: Attempting to load HeartCodec from {path}")
                        device_str = str(device) if isinstance(device, torch.device) else device
                        heartcodec = HeartCodec.from_pretrained(path, device_map=device_str)

                        # --- Apply Memory Optimization Patch ---
                        # Patching the detokenize method of the instance's class won't work easily if we want instance-specific,
                        # but patching the instance method works.
                        # heartcodec.detokenize = types.MethodType(optimized_detokenize, heartcodec)
                        # Actually, better to patch the class method of THIS object only? No, types.MethodType binds it.
                        print("Sonic: Applying memory optimization to HeartCodec...")
                        heartcodec.detokenize = types.MethodType(optimized_detokenize, heartcodec)

                        heartcodec_path = path
                        print("Sonic: HeartCodec loaded successfully.")
                        break
                    except Exception as e:
                        print(f"Sonic: Failed to load Codec from candidate {path}: {e}")

            if heartcodec_path is None:
                missing_components.append(f"HeartCodec (Expected folder 'HeartCodec' or 'HeartCodec-oss' in {pretrained_path})")


            # --- 2. Find HeartMuLa (Transformer) ---
            heartmula_path = None
            model_candidates = [
                os.path.join(pretrained_path, f"HeartMuLa-oss-{version}"),
                os.path.join(pretrained_path, "HeartMuLa"),
                os.path.join(pretrained_path, "model"),
                pretrained_path # Flattened
            ]

            heartmula = None
            for path in model_candidates:
                if os.path.exists(path):
                    try:
                        print(f"Sonic: Attempting to load HeartMuLa Transformer from {path}")
                        heartmula = HeartMuLa.from_pretrained(
                            path, dtype=dtype, quantization_config=bnb_config
                        )
                        heartmula_path = path
                        print("Sonic: HeartMuLa Transformer loaded successfully.")
                        break
                    except Exception as e:
                        print(f"Sonic: Failed to load Transformer from candidate {path}: {e}")

            if heartmula is None:
                 missing_components.append(f"HeartMuLa Transformer (Expected folder 'HeartMuLa...' or model files within {pretrained_path})")

            # --- 3. Find Tokenizer ---
            tokenizer_candidates = []
            if heartmula_path: tokenizer_candidates.append(os.path.join(heartmula_path, "tokenizer.json"))
            if pretrained_path not in tokenizer_candidates: tokenizer_candidates.append(os.path.join(pretrained_path, "tokenizer.json"))

            tokenizer = None
            for path in tokenizer_candidates:
                if os.path.isfile(path):
                    try:
                        tokenizer = Tokenizer.from_file(path)
                        print(f"Sonic: Loaded tokenizer from {path}")
                        break
                    except:
                        pass

            if tokenizer is None:
                 missing_components.append(f"tokenizer.json (Missing in {pretrained_path})")

            # --- 4. Find Gen Config ---
            config_candidates = []
            if heartmula_path: config_candidates.append(os.path.join(heartmula_path, "gen_config.json"))
            if pretrained_path not in config_candidates: config_candidates.append(os.path.join(pretrained_path, "gen_config.json"))

            gen_config = None
            for path in config_candidates:
                if os.path.isfile(path):
                    try:
                        gen_config = HeartMuLaGenConfig.from_file(path)
                        print(f"Sonic: Loaded Gen Config from {path}")
                        break
                    except:
                        pass

            if gen_config is None:
                 missing_components.append(f"gen_config.json (Missing in {pretrained_path})")

            # --- Final Verification ---
            if missing_components:
                error_msg = f"Critical components missing for model '{os.path.basename(pretrained_path)}':\n" + "\n".join([f"- {m}" for m in missing_components])
                raise FileNotFoundError(error_msg)

            return cls(heartmula, heartcodec, None, tokenizer, gen_config, device, dtype)


class SonicHeartMuLaLoader:
    """
    Custom Header loader for HeartMuLa that allows browsing specific folders.
    Derived from FL_HeartMuLa_ModelLoader but with path flexibility.
    """

    @classmethod
    def INPUT_TYPES(cls):
        # Find all folders in 'checkpoints'
        checkpoint_paths = folder_paths.get_folder_paths("checkpoints")
        available_models = ["Auto-Download (3B)"]

        for root_path in checkpoint_paths:
            subfolders = get_subfolders(root_path)
            for folder in subfolders:
                # Naive check: Does it look like a model folder?
                # Maybe check for config.json inside?
                if os.path.exists(os.path.join(root_path, folder, "config.json")) or \
                   os.path.exists(os.path.join(root_path, folder, "model_index.json")):
                    available_models.append(folder)

        return {
            "required": {
                "model_selection": (available_models, {"default": "Auto-Download (3B)"}),
                "memory_mode": (["auto", "normal", "low", "ultra"], {"default": "auto"}),
                "precision": (["auto", "fp32", "fp16", "bf16"], {"default": "auto"}),
                "use_4bit": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("HEARTMULA_MODEL",)
    RETURN_NAMES = ("model",)
    FUNCTION = "load_custom_heartmula"
    CATEGORY = "Geekatplay Studio/HeartMuLa"

    def load_custom_heartmula(self, model_selection, memory_mode="auto", precision="auto", use_4bit=False):
        if not HEARTMULA_AVAILABLE:
            raise ImportError("ComfyUI_FL-HeartMuLa node is missing. Please run install scripts.")

        # Determine path
        if model_selection == "Auto-Download (3B)":
            # Fallback to standard manager logic which handles download
            print("Sonic: Using Standard HeartMuLa Manager load...")
            info = model_manager.load_model(
                variant="3B",
                precision=precision,
                use_4bit=use_4bit,
                force_reload=False
            )
            return (info,)

        # Custom Path Logic
        print(f"Sonic: Loading Custom HeartMuLa Path: {model_selection}")

        # Find the full path
        found_path = None
        checkpoint_paths = folder_paths.get_folder_paths("checkpoints")
        for root_path in checkpoint_paths:
            candidate = os.path.join(root_path, model_selection)
            if os.path.exists(candidate):
                found_path = candidate
                break

        if not found_path:
             raise FileNotFoundError(f"Could not find model folder '{model_selection}' in checkpoints.")

        # Determine device/dtype manualy since we bypass manager
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        dtype = torch.float16
        if precision == "fp32" or device.type == "cpu":
             dtype = torch.float32
        elif precision == "bf16":
             dtype = torch.bfloat16

        # handle 4bit config
        bnb_config = None
        if use_4bit and device.type == "cuda":
            try:
                from transformers import BitsAndBytesConfig
                bnb_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=dtype,
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_quant_type="nf4",
                )
            except ImportError:
                print("Sonic: bitsandbytes not found, 4-bit disabled.")

        # Load Pipeline
        try:
            print(f"Sonic: Initializing pipeline from {found_path}...")

            # Use our custom pipeline class that handles flexible paths
            pipeline = CustomHeartMuLaGenPipeline.from_pretrained(
                pretrained_path=found_path,
                device=device,
                dtype=dtype,
                version="3B", # Assumption for architecture
                bnb_config=bnb_config
            )

            # Construct model info dict compatible with generic HeartMuLa nodes
            model_info = {
                "pipeline": pipeline,
                "version": "custom",
                "device": device,
                "dtype": dtype,
                "sample_rate": 48000, # Hardcoded 48k for HeartMuLa
                "max_duration_ms": 240000,
                "use_4bit": use_4bit,
                "memory_mode": memory_mode
            }

            return (model_info,)

        except Exception as e:
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Failed to load HeartMuLa model from {found_path}: {e}")
