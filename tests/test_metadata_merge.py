from __future__ import annotations

import json
from pathlib import Path

from audioqi.io import metadata as metadata_io


def test_extract_metadata_merges_ffprobe_and_mutagen_tags(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "demo.mp3"
    source.write_bytes(b"stub")

    def fake_ffprobe(_: Path) -> dict[str, object]:
        return {
            "format": {
                "format_name": "mp3",
                "bit_rate": "320000",
                "duration": "12.3",
                "tags": {"artist": "FFprobe Artist", "album": "FFprobe Album"},
            },
            "streams": [
                {
                    "codec_type": "audio",
                    "codec_name": "mp3",
                    "sample_rate": "48000",
                    "channels": 2,
                    "tags": {"artist": "Stream Artist", "language": "eng"},
                }
            ],
        }

    def fake_mutagen(_: Path) -> dict[str, object]:
        return {
            "tags": {"artist": "Mutagen Artist", "title": "Mutagen Title"},
            "info": {"length": 12.3, "sample_rate": 48_000, "channels": 2, "bitrate": 320_000},
        }

    monkeypatch.setattr(metadata_io, "_ffprobe_payload", fake_ffprobe)
    monkeypatch.setattr(metadata_io, "_mutagen_payload", fake_mutagen)

    payload = metadata_io.extract_metadata(source)

    assert payload["tags"]["artist"] == "Mutagen Artist"
    assert payload["tags"]["album"] == "FFprobe Album"
    assert payload["tags"]["title"] == "Mutagen Title"
    assert payload["tags"]["stream.language"] == "eng"
    assert "stream.artist" not in payload["tags"]
    assert payload["display_tags"]["artist"] == "Mutagen Artist"
    assert payload["display_tags"]["album"] == "FFprobe Album"
    assert payload["display_tags"]["title"] == "Mutagen Title"


def test_extract_metadata_hides_bulky_prompt_and_workflow_tags(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "workflow.mp3"
    source.write_bytes(b"stub")

    prompt_blob = json.dumps({"prompt": "warm lofi", "steps": list(range(40))})
    workflow_blob = json.dumps({"nodes": [{"id": idx, "type": "demo"} for idx in range(25)]})

    def fake_ffprobe(_: Path) -> dict[str, object]:
        return {
            "format": {
                "format_name": "mp3",
                "tags": {
                    "encoder": "Lavf62.3.100",
                    "TXXX:prompt": prompt_blob,
                    "TXXX:workflow": workflow_blob,
                },
            },
            "streams": [{"codec_type": "audio", "codec_name": "mp3", "sample_rate": "48000", "channels": 2}],
        }

    monkeypatch.setattr(metadata_io, "_ffprobe_payload", fake_ffprobe)
    monkeypatch.setattr(metadata_io, "_mutagen_payload", lambda _: {"tags": {}, "info": {}})

    payload = metadata_io.extract_metadata(source)

    assert payload["tags"]["TXXX:prompt"] == prompt_blob
    assert payload["tags"]["TXXX:workflow"] == workflow_blob
    assert payload["display_tags"] == {}
    assert payload["suppressed_tag_count"] == 3
    assert payload["suppressed_tag_keys"] == ["TXXX:prompt", "TXXX:workflow", "encoder"]


def test_normalize_metadata_payload_enriches_legacy_metadata() -> None:
    payload = metadata_io.normalize_metadata_payload(
        {
            "filename": "legacy.mp3",
            "tags": {
                "artist": "Legacy Artist",
                "encoder": "Lavf62.3.100",
                "TXXX:workflow": json.dumps({"nodes": [{"id": 1}] * 30}),
            },
        }
    )

    assert payload["display_tags"] == {"artist": "Legacy Artist"}
    assert payload["suppressed_tag_count"] == 2
    assert payload["suppressed_tag_keys"] == ["TXXX:workflow", "encoder"]
