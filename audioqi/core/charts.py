from __future__ import annotations

from typing import Any

import numpy as np
import plotly.graph_objects as go


def build_waveform_figure(
    times: list[float],
    waveform: list[float],
    envelope_peak_dbfs: list[float],
    envelope_rms_dbfs: list[float],
    envelope_times: list[float],
) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=times,
            y=waveform,
            name="Waveform",
            line={"color": "#2a9d8f", "width": 1},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=envelope_times,
            y=envelope_peak_dbfs,
            name="Peak Envelope (dBFS)",
            line={"color": "#e76f51", "width": 1.5},
            yaxis="y2",
        )
    )
    fig.add_trace(
        go.Scatter(
            x=envelope_times,
            y=envelope_rms_dbfs,
            name="RMS Envelope (dBFS)",
            line={"color": "#264653", "width": 1.5},
            yaxis="y2",
        )
    )
    fig.update_layout(
        title="Waveform + Peak/RMS Envelope",
        xaxis_title="Time (s)",
        yaxis={"title": "Amplitude", "range": [-1.05, 1.05]},
        yaxis2={"title": "dBFS", "overlaying": "y", "side": "right"},
        template="plotly_white",
        margin={"l": 40, "r": 40, "t": 50, "b": 40},
    )
    return fig


def build_loudness_figure(
    momentary_times: list[float],
    momentary_values: list[float],
    short_times: list[float],
    short_values: list[float],
    integrated_lufs: float,
) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=momentary_times, y=momentary_values, name="Momentary LUFS"))
    fig.add_trace(go.Scatter(x=short_times, y=short_values, name="Short-term LUFS"))
    if integrated_lufs != float("-inf"):
        fig.add_hline(
            y=integrated_lufs,
            line_dash="dash",
            annotation_text=f"Integrated {integrated_lufs:.2f} LUFS",
        )
    fig.update_layout(
        title="Loudness Timeline",
        xaxis_title="Time (s)",
        yaxis_title="LUFS",
        template="plotly_white",
        margin={"l": 40, "r": 20, "t": 50, "b": 40},
    )
    return fig


def build_spectrum_figure(freq_hz: list[float], spectrum_db: list[float]) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=freq_hz, y=spectrum_db, mode="lines", name="Spectrum"))
    fig.update_layout(
        title="Average Spectrum",
        xaxis={"title": "Frequency (Hz)", "type": "log"},
        yaxis={"title": "Power (dB)"},
        template="plotly_white",
    )
    return fig


def build_stereo_figure(
    times: list[float],
    correlation: list[float],
    ms_ratio_db: list[float],
) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=times, y=correlation, name="Correlation"))
    fig.add_trace(go.Scatter(x=times, y=ms_ratio_db, name="M/S Ratio (dB)", yaxis="y2"))
    fig.add_hline(y=0.0, line_dash="dot")
    fig.update_layout(
        title="Stereo Correlation + M/S Ratio",
        xaxis_title="Time (s)",
        yaxis={"title": "Correlation", "range": [-1.0, 1.0]},
        yaxis2={"title": "M/S Ratio dB", "overlaying": "y", "side": "right"},
        template="plotly_white",
    )
    return fig


def build_correlation_meter(times: list[float], correlation: list[float]) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=times, y=correlation, mode="lines", name="Correlation Meter"))
    fig.add_hrect(y0=-1, y1=0, fillcolor="rgba(231,111,81,0.15)", line_width=0)
    fig.add_hrect(y0=0, y1=1, fillcolor="rgba(42,157,143,0.12)", line_width=0)
    fig.update_layout(
        title="Correlation Meter",
        xaxis_title="Time (s)",
        yaxis_title="Correlation",
        yaxis={"range": [-1.0, 1.0]},
        template="plotly_white",
    )
    return fig


def build_ms_view(
    times: list[float],
    ms_ratio_db: list[float],
    lr_balance_db: list[float],
) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=times, y=ms_ratio_db, mode="lines", name="M/S Ratio (dB)"))
    fig.add_trace(go.Scatter(x=times, y=lr_balance_db, mode="lines", name="L-R Balance (dB)"))
    fig.update_layout(
        title="Mid/Side + L/R Balance",
        xaxis_title="Time (s)",
        yaxis_title="dB",
        template="plotly_white",
    )
    return fig


def build_vectorscope(left: np.ndarray, right: np.ndarray) -> go.Figure:
    max_points = 12_000
    if left.size > max_points:
        step = max(1, left.size // max_points)
        left = left[::step]
        right = right[::step]
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=left.tolist(),
            y=right.tolist(),
            mode="markers",
            marker={"size": 2, "opacity": 0.28, "color": "#7dd3fc"},
            name="L/R",
        )
    )
    fig.update_layout(
        title="Vectorscope / Goniometer",
        xaxis={"title": "Left", "range": [-1, 1]},
        yaxis={"title": "Right", "range": [-1, 1], "scaleanchor": "x", "scaleratio": 1},
        template="plotly_white",
    )
    return fig


def build_spectrogram_heatmap(
    payload: dict[str, Any],
    title: str,
    z_title: str = "dB",
) -> go.Figure:
    fig = go.Figure(
        data=[
            go.Heatmap(
                z=payload["z"],
                x=payload["x"],
                y=payload["y"],
                colorscale="Turbo",
                colorbar={"title": z_title},
            )
        ]
    )
    fig.update_layout(
        title=title,
        xaxis_title=payload.get("x_title", "Time"),
        yaxis_title=payload.get("y_title", "Frequency"),
        template="plotly_white",
    )
    return fig
