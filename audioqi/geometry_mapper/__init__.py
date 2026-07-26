"""Song Geometry Mapper audio analysis package."""

from .features import extract_frame_features
from .schema import REQUIRED_COLUMNS, validate_feature_schema

__all__ = ["REQUIRED_COLUMNS", "extract_frame_features", "validate_feature_schema"]
__version__ = "0.1.0"
