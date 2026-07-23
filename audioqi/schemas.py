from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RunSummary(BaseModel):
    id: str
    filename: str
    status: str
    progress: float
    stage: str | None = None
    stage_detail: str | None = None
    stage_updated_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime


class RunDetail(RunSummary):
    metadata: dict[str, Any] | None = None
    metrics: dict[str, Any] | None = None
    chart_names: list[str] = Field(default_factory=list)
    markers: list[dict[str, Any]] = Field(default_factory=list)
    conversions: dict[str, Any] | None = None
    mastering: dict[str, Any] | None = None


class UploadResponse(BaseModel):
    run: RunSummary
    metadata: dict[str, Any]
