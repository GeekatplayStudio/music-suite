from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


def separate_audio(
    input_path: str | Path,
    output_dir: str | Path,
    stem: str = "vocals",
    model: str = "htdemucs",
) -> Path:
    """
    Separates audio into stems using Demucs and returns the path to the requested stem.

    Args:
        input_path: Path to the input audio file.
        output_dir: Directory where separated stems will be saved.
        stem: The specific stem to return (e.g., "vocals", "drums", "bass", "other").
              If "accompaniment" is requested, it tries to find "no_vocals".
        model: Demucs model name (default: "htdemucs").

    Returns:
        Path to the separated audio file for the requested stem.
    """
    input_path = Path(input_path).resolve()
    output_dir = Path(output_dir).resolve()
    track_name = input_path.stem
    model_dir = output_dir / model / track_name

    # Map "accompaniment" to "no_vocals" for 2-stem separation
    target_stem = "no_vocals" if stem == "accompaniment" else stem

    # Expected output file path
    output_file = model_dir / f"{target_stem}.wav"

    if output_file.exists():
        logger.info(f"Using cached separation for {stem}: {output_file}")
        return output_file

    logger.info(f"Separating audio with Demucs (model={model})... This may take a while.")

    cmd = [
        sys.executable,
        "-m",
        "demucs.separate",
        "-n",
        model,
        "-o",
        str(output_dir),
        str(input_path),
    ]

    # Optimization: If only 2 stems needed (vocals/accompaniment), use --two-stems
    if stem in ("vocals", "accompaniment", "no_vocals"):
        cmd.extend(["--two-stems", "vocals"])

    try:
        subprocess.check_call(cmd)
    except subprocess.CalledProcessError as e:
        logger.error(f"Demucs separation failed: {e}")
        raise RuntimeError(f"Failed to separate audio: {e}") from e

    if not output_file.exists():
        # Fallback: maybe the model produced different filenames?
        # List files in the output directory to help debug
        found = list(model_dir.glob("*.wav"))
        logger.warning(f"Expected stem {target_stem} not found. Found: {[f.name for f in found]}")

        # If we asked for 'other' but model is 2-stems, 'no_vocals' is likely what we want?
        if stem == "other" and (model_dir / "no_vocals.wav").exists():
            return model_dir / "no_vocals.wav"

        raise FileNotFoundError(f"Separated stem {target_stem} not found at {output_file}")

    return output_file
