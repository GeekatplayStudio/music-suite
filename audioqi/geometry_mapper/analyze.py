from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .features import (
    KNN_DEFAULT_COLUMNS,
    build_knn_edges,
    build_temporal_edges,
    extract_frame_features,
)
from .normalize import NORMALIZATION_CHOICES, normalize_dataframe, smooth_dataframe
from .schema import column_min_max, validate_feature_schema

try:
    from .separate import separate_audio

    HAS_DEMUCS = True
except ImportError:
    HAS_DEMUCS = False

EXCLUDED_COLUMNS = ("t_seconds", "frame_index")
EDGE_MODES = ("none", "temporal", "knn")
SEPARATION_TARGETS = ("vocals", "accompaniment", "drums", "bass", "other", "all")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Song Geometry Mapper analyzer")
    parser.add_argument("--input", required=True, help="Input audio path (wav/mp3/flac)")
    parser.add_argument("--outdir", required=True, help="Output directory")
    parser.add_argument("--sr", type=int, default=48_000, help="Target sample rate")
    parser.add_argument("--n_fft", type=int, default=2_048, help="STFT FFT window size")
    parser.add_argument("--hop", type=int, default=512, help="Hop size")
    parser.add_argument(
        "--smooth",
        type=int,
        default=1,
        help="Moving average window size (1 disables smoothing)",
    )
    parser.add_argument(
        "--norm",
        default="none",
        choices=sorted(NORMALIZATION_CHOICES),
        help="Normalization method",
    )
    parser.add_argument(
        "--edge-mode",
        default="none",
        choices=EDGE_MODES,
        help="Optional edge export mode",
    )
    parser.add_argument(
        "--knn-n",
        type=int,
        default=3,
        help="Neighbor count for --edge-mode knn",
    )
    parser.add_argument(
        "--knn-columns",
        nargs="+",
        default=list(KNN_DEFAULT_COLUMNS),
        help="Descriptor columns used for kNN edges",
    )
    if HAS_DEMUCS:
        parser.add_argument(
            "--separate",
            default=None,
            nargs="+",
            choices=SEPARATION_TARGETS,
            help=(
                "Separate and analyze specific stems (requires demucs). "
                "Use 'all' for all 4 stems."
            ),
        )
    return parser.parse_args(argv)


def analyze_to_outputs(
    input_path: str | Path,
    outdir: str | Path,
    *,
    sr: int = 48_000,
    n_fft: int = 2_048,
    hop: int = 512,
    smooth: int = 1,
    norm: str = "none",
    edge_mode: str = "none",
    knn_n: int = 3,
    knn_columns: list[str] | None = None,
    separate: str | None = None,
    # separation parameters
) -> dict[str, Path | None]:
    output_dir = Path(outdir)
    output_dir.mkdir(parents=True, exist_ok=True)

    analysis_input = Path(input_path)
    stem_info = None

    if separate and HAS_DEMUCS:
        print(f"Demucs separation requested for stem: {separate}...")
        try:
            # Stems are stored in a dedicated folder to keep output organized
            stems_dir = output_dir / "stems"
            stems_dir.mkdir(parents=True, exist_ok=True)

            # This call will block until separation is complete
            separated_file = separate_audio(input_path, stems_dir, stem=separate, model="htdemucs")
            analysis_input = separated_file
            stem_info = separate
            print(f"Analyzing separated stem: {separated_file}")

        except Exception as e:
            print(f"Warning: Separation failed ({e}). Falling back to original audio.")

    # Keep the pipeline deterministic for repeatable visual geometry exports.
    features, audio_meta = extract_frame_features(
        analysis_input, sr=sr, n_fft=n_fft, hop_length=hop
    )
    features = smooth_dataframe(features, window=smooth, exclude=EXCLUDED_COLUMNS)
    features = normalize_dataframe(features, method=norm, exclude=EXCLUDED_COLUMNS)
    validate_feature_schema(features)

    feature_csv_path = output_dir / "features.csv"
    feature_json_path = output_dir / "features.json"
    metadata_path = output_dir / "metadata.json"

    features.to_csv(feature_csv_path, index=False)
    feature_json_path.write_text(
        json.dumps(features.to_dict(orient="records"), indent=2),
        encoding="utf-8",
    )

    edges_path: Path | None = None
    edges_count = 0
    if edge_mode == "temporal":
        # Temporal edges preserve sequence flow in downstream visualizers.
        edges = build_temporal_edges(features["frame_index"].astype(int).to_numpy())
        edges_path = output_dir / "edges.csv"
        edges.to_csv(edges_path, index=False)
        edges_count = len(edges)
    elif edge_mode == "knn":
        # kNN edges emphasize descriptor similarity rather than strict time order.
        chosen_columns = knn_columns or list(KNN_DEFAULT_COLUMNS)
        edges = build_knn_edges(features, columns=chosen_columns, neighbors=knn_n)
        edges_path = output_dir / "edges.csv"
        edges.to_csv(edges_path, index=False)
        edges_count = len(edges)

    # Metadata is used by render layers (web/TouchDesigner) for ranges and settings recall.
    metadata: dict[str, Any] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "input_audio": str(Path(input_path).resolve()),
        "settings": {
            "sr": sr,
            "n_fft": n_fft,
            "hop": hop,
            "smooth": smooth,
            "norm": norm,
            "exclude_from_norm_and_smooth": list(EXCLUDED_COLUMNS),
            "edge_mode": edge_mode,
            "knn_n": knn_n,
            "knn_columns": knn_columns or list(KNN_DEFAULT_COLUMNS),
            "separated_stem": stem_info,
        },
        "audio": audio_meta,
        "columns": column_min_max(features),
        "rows": len(features),
        "edges": {
            "count": edges_count,
            "path": str(edges_path) if edges_path else None,
        },
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    return {
        "features_csv": feature_csv_path,
        "features_json": feature_json_path,
        "metadata_json": metadata_path,
        "edges_csv": edges_path,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    # Handle optional separate argument if demucs is installed
    separate_arg = getattr(args, "separate", None)

    # If no separation requested, run once (standard behavior)
    if not separate_arg:
        output_paths = analyze_to_outputs(
            args.input,
            args.outdir,
            sr=args.sr,
            n_fft=args.n_fft,
            hop=args.hop,
            smooth=args.smooth,
            norm=args.norm,
            edge_mode=args.edge_mode,
            knn_n=args.knn_n,
            knn_columns=args.knn_columns,
            separate=None,
        )
        print(f"Wrote {output_paths['features_csv']}")
        return 0

    # If separation is requested, we process multiple runs
    # 1. First, always analyze the full mix (the "addition not replacement" requirement)
    print("--- Analyzing Full Mix ---")
    base_out = analyze_to_outputs(
        args.input,
        args.outdir,
        sr=args.sr,
        n_fft=args.n_fft,
        hop=args.hop,
        smooth=args.smooth,
        norm=args.norm,
        edge_mode=args.edge_mode,
        knn_n=args.knn_n,
        knn_columns=args.knn_columns,
        separate=None,
    )
    print(f"Full mix analysis complete: {base_out['features_csv']}")

    # Determine which stems to process
    targets = ["vocals", "drums", "bass", "other"] if "all" in separate_arg else separate_arg

    for stem in targets:
        print(f"\n--- Analyzing Stem: {stem} ---")
        # For stems, we write to a subdirectory to avoid overwriting the main features.csv
        # or confusing the web app which expects specific filenames.
        stem_outdir = Path(args.outdir) / stem
        stem_outdir.mkdir(parents=True, exist_ok=True)

        stem_out = analyze_to_outputs(
            args.input,
            stem_outdir,
            sr=args.sr,
            n_fft=args.n_fft,
            hop=args.hop,
            smooth=args.smooth,
            norm=args.norm,
            edge_mode=args.edge_mode,
            knn_n=args.knn_n,
            knn_columns=args.knn_columns,
            separate=stem,
        )
        print(f"Stem '{stem}' analysis complete: {stem_out['features_csv']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
