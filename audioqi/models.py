from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from audioqi.db import Base

AnalysisStatus = Literal["uploaded", "queued", "running", "completed", "failed"]


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="uploaded")
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    input_path: Mapped[str] = mapped_column(Text, nullable=False)
    run_dir: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_wav_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    charts_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_html_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
