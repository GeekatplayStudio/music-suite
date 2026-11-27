from __future__ import annotations

import os

import numpy as np

# Tests never start a real Ollama, even on a computer that has one installed.
os.environ["MUSIC_SUITE_OLLAMA_AUTOSTART"] = "0"


def pytest_configure() -> None:
    np.random.seed(0)
