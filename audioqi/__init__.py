"""Geekatplay Studio Music Suite analysis, mastering, and integrations."""

from audioqi import portable as _portable

__all__ = ["__version__"]

__version__ = "1.0.0"

# Before any library reads its cache location: keep downloads inside Music Suite's folder.
_portable.apply()
