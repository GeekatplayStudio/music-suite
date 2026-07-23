from __future__ import annotations

from audioqi.storage import sanitize_filename


def test_sanitize_filename_strips_path_traversal() -> None:
    assert sanitize_filename("..\\..\\evil.mp3") == "evil.mp3"
    assert sanitize_filename("../../evil.mp3") == "evil.mp3"


def test_sanitize_filename_normalizes_special_chars() -> None:
    assert sanitize_filename("mix master (v1).wav") == "mix_master_v1_.wav"


def test_sanitize_filename_fallback_for_empty() -> None:
    assert sanitize_filename("") == "upload.bin"
    assert sanitize_filename("   ") == "upload.bin"
