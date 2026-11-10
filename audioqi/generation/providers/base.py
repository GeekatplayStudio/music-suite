"""What every generation provider implements."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class Output:
    """One generated piece of audio: raw file bytes, or an asset already imported."""

    data: bytes = b""
    suffix: str = ".wav"
    asset: dict[str, Any] | None = None
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class RunContext:
    project_id: str
    parent_id: str | None
    progress: Callable[[float, str], None]
    cancelled: Callable[[], bool]


class Provider(Protocol):
    id: str
    name: str
    kind: str  # "local" or "external"

    def describe(self) -> dict[str, Any]:
        """Tasks, groups and fields: everything the UI needs to build the form."""

    def status(self) -> dict[str, Any]:
        """``{"ready": bool, "message": str, ...}`` without starting anything heavy."""

    def generate(self, task: str, values: dict[str, Any], ctx: RunContext) -> list[Output]:
        """Run one validated request."""
