from __future__ import annotations

import os
import time
from collections.abc import Callable
from contextlib import redirect_stderr, redirect_stdout
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from typing import Any

import jinja2
import plotly.graph_objects as go

ReportProgressCallback = Callable[[float, str, str], None]


def _is_spectrogram_chart(name: str) -> bool:
    lowered = name.lower()
    return "spectrogram" in lowered or lowered in {"cqt", "mel", "stft"}


def _downsample_heatmap_traces(
    fig: go.Figure,
    *,
    max_rows: int,
    max_cols: int,
) -> str | None:
    notes: list[str] = []
    for trace in fig.data:
        trace_type = str(getattr(trace, "type", ""))
        if trace_type != "heatmap":
            continue
        z = getattr(trace, "z", None)
        if not isinstance(z, (list, tuple)) or len(z) < 2:
            continue
        first_row = z[0]
        if not isinstance(first_row, (list, tuple)) or len(first_row) < 2:
            continue

        rows = len(z)
        cols = len(first_row)
        row_step = max(1, (rows + max_rows - 1) // max_rows)
        col_step = max(1, (cols + max_cols - 1) // max_cols)
        if row_step == 1 and col_step == 1:
            continue

        reduced_rows = z[::row_step]
        reduced_z = [row[::col_step] for row in reduced_rows]
        if not reduced_z or not reduced_z[0]:
            continue

        trace.z = reduced_z
        x = getattr(trace, "x", None)
        if isinstance(x, (list, tuple)) and len(x) == cols:
            trace.x = x[::col_step]
        y = getattr(trace, "y", None)
        if isinstance(y, (list, tuple)) and len(y) == rows:
            trace.y = y[::row_step]

        notes.append(f"{rows}x{cols}->{len(reduced_z)}x{len(reduced_z[0])}")

    if not notes:
        return None
    return "; ".join(notes)


def _prepare_static_figure(name: str, payload: dict[str, Any]) -> tuple[go.Figure, str | None]:
    fig = go.Figure(payload)
    if _is_spectrogram_chart(name):
        note = _downsample_heatmap_traces(fig, max_rows=512, max_cols=1800)
    else:
        note = _downsample_heatmap_traces(fig, max_rows=900, max_cols=2400)
    return fig, note


def generate_report_artifacts(
    run_dir: Path,
    metadata: dict[str, Any],
    metrics: dict[str, Any],
    charts: dict[str, dict[str, Any]],
    progress: ReportProgressCallback | None = None,
    max_seconds: float | None = None,
) -> dict[str, str]:
    def update(value: float, stage: str, detail: str) -> None:
        if progress:
            progress(value, stage, detail)

    started_at = time.monotonic()
    charts_dir = run_dir / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)

    image_paths: dict[str, str] = {}
    total_charts = max(1, len(charts))
    timed_out = False
    for idx, (name, payload) in enumerate(charts.items()):
        if max_seconds is not None and max_seconds > 0:
            elapsed = time.monotonic() - started_at
            if elapsed >= max_seconds:
                timed_out = True
                break
        chart_progress = 95.0 + 2.0 * ((idx + 1) / total_charts)
        update(
            chart_progress,
            "report_images",
            f"Rendering static chart assets ({idx + 1}/{total_charts}): {name}",
        )
        fig, reduction_note = _prepare_static_figure(name, payload)
        png = charts_dir / f"{name}.png"
        width, height, scale = (1800, 980, 2) if _is_spectrogram_chart(name) else (1600, 900, 2)
        detail = (
            f"Rendering static chart assets ({idx + 1}/{total_charts}): {name} [{reduction_note}]"
            if reduction_note
            else f"Rendering static chart assets ({idx + 1}/{total_charts}): {name}"
        )
        update(chart_progress, "report_images", detail)
        try:
            fig.write_image(str(png), width=width, height=height, scale=scale)
            image_paths[name] = str(png)
        except Exception:
            # Keep report generation resilient when static engines are missing.
            image_paths[name] = ""
    if timed_out:
        update(
            97.2,
            "report_images_timeout",
            "Static chart export hit time guard; continuing with available images.",
        )

    template_dir = Path(__file__).resolve().parent / "templates"
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(template_dir)), autoescape=True)
    template = env.get_template("report.html.j2")
    update(97.6, "report_html", "Rendering HTML report.")

    html = template.render(
        generated_at=datetime.now(UTC).isoformat(),
        metadata=metadata,
        metrics=metrics,
        charts=charts,
        image_paths=image_paths,
    )

    html_path = run_dir / "report.html"
    html_path.write_text(html, encoding="utf-8")

    pdf_path = run_dir / "report.pdf"
    skip_pdf = os.getenv("AUDIOQI_SKIP_PDF_EXPORT", "0").strip() in {
        "1",
        "true",
        "TRUE",
        "yes",
        "YES",
    }
    elapsed = time.monotonic() - started_at
    if max_seconds is not None and max_seconds > 0 and elapsed >= max_seconds:
        skip_pdf = True
        update(
            98.2,
            "report_pdf_skipped",
            "PDF export skipped because report generation exceeded time guard.",
        )
    if not skip_pdf:
        try:
            weasy_log = StringIO()
            with redirect_stdout(weasy_log), redirect_stderr(weasy_log):
                from weasyprint import HTML

            update(98.5, "report_pdf", "Rendering PDF report.")
            with redirect_stdout(weasy_log), redirect_stderr(weasy_log):
                HTML(string=html, base_url=str(run_dir)).write_pdf(str(pdf_path))
        except Exception:
            # Optional; HTML export remains available.
            update(
                98.3,
                "report_pdf_skipped",
                "PDF export unavailable in this environment; HTML report remains available.",
            )

    update(99.5, "report_finalize", "Report artifacts finalized.")
    return {"html": str(html_path), "pdf": str(pdf_path), "images": str(charts_dir)}
