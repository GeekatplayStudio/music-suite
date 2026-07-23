from __future__ import annotations

import numpy as np


def pytest_configure() -> None:
    np.random.seed(0)
