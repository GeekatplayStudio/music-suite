from __future__ import annotations

import base64
import io
import os
from typing import Any

import dash
import dash_bootstrap_components as dbc
import requests
from dash import Input, Output, State, dcc, html, no_update

API_URL = os.getenv("AUDIOQI_API_URL", "http://127.0.0.1:8008").rstrip("/")


def _api_get(path: str) -> dict[str, Any]:
    resp = requests.get(f"{API_URL}{path}", timeout=60)
    resp.raise_for_status()
    return resp.json()


def _api_post(path: str, **kwargs: Any) -> dict[str, Any]:
    resp = requests.post(f"{API_URL}{path}", timeout=60, **kwargs)
    resp.raise_for_status()
    return resp.json()


app = dash.Dash(
    __name__,
    external_stylesheets=[],
    title="Geekatplay Studio Music Suite",
)

app.layout = dbc.Container(
    [
        dcc.Store(id="run-id"),
        dcc.Store(id="charts-store"),
        dcc.Interval(id="poller", interval=2000, n_intervals=0, disabled=True),
        html.Div(
            [
                html.H1("Geekatplay Studio Music Suite", className="app-title"),
                html.P(
                    "Created by Vladimir Chopine — analysis and mastering for individual tracks.",
                    className="app-subtitle",
                ),
            ],
            className="hero",
        ),
        dbc.Row(
            [
                dbc.Col(
                    [
                        dbc.Card(
                            dbc.CardBody(
                                [
                                    html.H4("Input", className="card-title"),
                                    dcc.Upload(
                                        id="upload-audio",
                                        children=html.Div(
                                            ["Drop audio here or ", html.A("choose file")]
                                        ),
                                        className="upload-dropzone",
                                        multiple=False,
                                    ),
                                    html.Button(
                                        "Run Analysis",
                                        id="analyze-btn",
                                        n_clicks=0,
                                        className="analyze-btn",
                                    ),
                                    dcc.Checklist(
                                        id="gpu-toggle",
                                        options=[
                                            {
                                                "label": "Use GPU spectrogram backend (optional)",
                                                "value": "gpu",
                                            }
                                        ],
                                        value=[],
                                    ),
                                    html.Div(id="status-text", className="status-text"),
                                    dbc.Progress(
                                        id="progress",
                                        value=0,
                                        striped=True,
                                        animated=True,
                                        className="mt-2",
                                    ),
                                    html.Div(
                                        [
                                            html.A(
                                                "Export JSON",
                                                id="export-json",
                                                href="",
                                                target="_blank",
                                            ),
                                            html.Span(" | "),
                                            html.A(
                                                "Export HTML",
                                                id="export-html",
                                                href="",
                                                target="_blank",
                                            ),
                                            html.Span(" | "),
                                            html.A(
                                                "Export PDF",
                                                id="export-pdf",
                                                href="",
                                                target="_blank",
                                            ),
                                        ],
                                        className="exports",
                                    ),
                                ]
                            ),
                            className="panel-card",
                        ),
                        dbc.Card(
                            dbc.CardBody(
                                [
                                    html.H4("Playback + Markers", className="card-title"),
                                    html.Audio(
                                        id="audio-player",
                                        controls=True,
                                        src="",
                                        className="audio-player",
                                    ),
                                    dcc.Slider(
                                        id="timeline-slider",
                                        min=0,
                                        max=1,
                                        step=0.01,
                                        value=0,
                                    ),
                                    html.Div(id="marker-summary", className="marker-summary"),
                                ]
                            ),
                            className="panel-card",
                        ),
                    ],
                    lg=4,
                    sm=12,
                ),
                dbc.Col(
                    [
                        dbc.Card(
                            dbc.CardBody(
                                [
                                    html.H4("Overview", className="card-title"),
                                    html.Div(id="metrics-panel"),
                                    dcc.Graph(id="waveform-graph"),
                                    dcc.Graph(id="loudness-graph"),
                                ]
                            ),
                            className="panel-card",
                        ),
                        dbc.Card(
                            dbc.CardBody(
                                [
                                    html.H4("Spectrum + Stereo", className="card-title"),
                                    dcc.Graph(id="spectrum-graph"),
                                    dcc.Graph(id="stereo-graph"),
                                    dcc.Graph(id="correlation-graph"),
                                    dcc.Graph(id="ms-graph"),
                                    dcc.Graph(id="vectorscope-graph"),
                                ]
                            ),
                            className="panel-card",
                        ),
                        dbc.Card(
                            dbc.CardBody(
                                [
                                    html.H4("Spectrogram Suite", className="card-title"),
                                    dcc.Graph(id="spec-stft-linear"),
                                    dcc.Graph(id="spec-stft-log"),
                                    dcc.Graph(id="spec-mel"),
                                    dcc.Graph(id="spec-cqt"),
                                ]
                            ),
                            className="panel-card",
                        ),
                    ],
                    lg=8,
                    sm=12,
                ),
            ],
            className="g-3",
        ),
    ],
    fluid=True,
    className="app-shell",
)


@app.callback(
    Output("run-id", "data"),
    Output("status-text", "children"),
    Output("audio-player", "src"),
    Output("poller", "disabled"),
    Input("upload-audio", "contents"),
    State("upload-audio", "filename"),
    prevent_initial_call=True,
)
def upload_audio(contents: str | None, filename: str | None) -> tuple[str | None, str, str, bool]:
    if not contents or not filename:
        return no_update, "No file selected.", "", True
    _, encoded = contents.split(",", 1)
    data = base64.b64decode(encoded)
    file_like = io.BytesIO(data)
    payload = _api_post("/runs/upload", files={"file": (filename, file_like)})
    run_id = payload["run"]["id"]
    return run_id, f"Uploaded {filename}. Ready to analyze.", f"{API_URL}/runs/{run_id}/audio", True


@app.callback(
    Output("status-text", "children", allow_duplicate=True),
    Output("poller", "disabled", allow_duplicate=True),
    Input("analyze-btn", "n_clicks"),
    State("run-id", "data"),
    State("gpu-toggle", "value"),
    prevent_initial_call=True,
)
def trigger_analysis(n_clicks: int, run_id: str | None, gpu_toggle: list[str]) -> tuple[str, bool]:
    if not n_clicks or not run_id:
        return "Upload a file first.", True
    use_gpu = "gpu" in (gpu_toggle or [])
    _api_post(f"/runs/{run_id}/analyze?use_gpu={'true' if use_gpu else 'false'}")
    return "Analysis queued.", False


@app.callback(
    Output("status-text", "children", allow_duplicate=True),
    Output("progress", "value"),
    Output("charts-store", "data"),
    Output("metrics-panel", "children"),
    Output("marker-summary", "children"),
    Output("timeline-slider", "max"),
    Output("timeline-slider", "value"),
    Output("export-json", "href"),
    Output("export-html", "href"),
    Output("export-pdf", "href"),
    Output("poller", "disabled", allow_duplicate=True),
    Input("poller", "n_intervals"),
    State("run-id", "data"),
    prevent_initial_call=True,
)
def poll_status(
    _: int,
    run_id: str | None,
) -> tuple[Any, ...]:
    if not run_id:
        return (
            "No run.",
            0,
            {},
            html.Div(),
            html.Div("No markers."),
            1,
            0,
            "",
            "",
            "",
            True,
        )
    run = _api_get(f"/runs/{run_id}")
    status = run["status"]
    progress = run["progress"]
    metrics = run.get("metrics") or {}
    duration = (metrics.get("technical") or {}).get("duration_seconds", 1)
    markers = metrics.get("markers", [])
    marker_lines = [
        html.Li(
            f"{m.get('type')} [{m.get('start_seconds'):.2f}s - {m.get('end_seconds'):.2f}s]"
        )
        for m in markers[:20]
    ]
    marker_summary = html.Ul(marker_lines) if marker_lines else html.P("No markers detected.")
    metrics_panel = _render_metrics(metrics)

    export_json = f"{API_URL}/runs/{run_id}/export/json"
    export_html = f"{API_URL}/runs/{run_id}/export/html"
    export_pdf = f"{API_URL}/runs/{run_id}/export/pdf"

    if status != "completed":
        if status == "failed":
            return (
                f"Failed: {run.get('error_message', 'unknown error')}",
                progress,
                no_update,
                metrics_panel,
                marker_summary,
                duration,
                0,
                export_json,
                export_html,
                export_pdf,
                True,
            )
        return (
            f"{status.capitalize()}... {progress:.1f}%",
            progress,
            no_update,
            metrics_panel,
            marker_summary,
            duration,
            0,
            export_json,
            export_html,
            export_pdf,
            False,
        )

    charts = _api_get(f"/runs/{run_id}/charts")
    return (
        "Analysis complete.",
        100,
        charts,
        metrics_panel,
        marker_summary,
        duration,
        0,
        export_json,
        export_html,
        export_pdf,
        True,
    )


@app.callback(
    Output("waveform-graph", "figure"),
    Output("loudness-graph", "figure"),
    Output("spectrum-graph", "figure"),
    Output("stereo-graph", "figure"),
    Output("correlation-graph", "figure"),
    Output("ms-graph", "figure"),
    Output("vectorscope-graph", "figure"),
    Output("spec-stft-linear", "figure"),
    Output("spec-stft-log", "figure"),
    Output("spec-mel", "figure"),
    Output("spec-cqt", "figure"),
    Input("charts-store", "data"),
    Input("timeline-slider", "value"),
)
def update_graphs(charts: dict[str, Any] | None, scrub_time: float) -> tuple[Any, ...]:
    if not charts:
        blank = {"data": [], "layout": {"template": "plotly_white"}}
        return (blank, blank, blank, blank, blank, blank, blank, blank, blank, blank, blank)

    waveform = charts.get("waveform", {"data": [], "layout": {}})
    layout = waveform.setdefault("layout", {})
    shapes = list(layout.get("shapes", []))
    shapes.append(
        {
            "type": "line",
            "x0": scrub_time,
            "x1": scrub_time,
            "y0": -1.05,
            "y1": 1.05,
            "line": {"color": "#bc4b51", "width": 2, "dash": "dot"},
        }
    )
    layout["shapes"] = shapes

    return (
        waveform,
        charts.get("loudness", {"data": [], "layout": {}}),
        charts.get("spectrum", {"data": [], "layout": {}}),
        charts.get("stereo", {"data": [], "layout": {}}),
        charts.get("correlation_meter", {"data": [], "layout": {}}),
        charts.get("ms_view", {"data": [], "layout": {}}),
        charts.get("vectorscope", {"data": [], "layout": {}}),
        charts.get("spectrogram_stft_linear", {"data": [], "layout": {}}),
        charts.get("spectrogram_stft_log", {"data": [], "layout": {}}),
        charts.get("spectrogram_mel", {"data": [], "layout": {}}),
        charts.get("spectrogram_cqt", {"data": [], "layout": {}}),
    )


def _render_metrics(metrics: dict[str, Any]) -> html.Div:
    if not metrics:
        return html.Div("No metrics yet.")
    loud = metrics.get("loudness", {})
    dyn = metrics.get("dynamics", {})
    tech = metrics.get("technical", {})
    warnings = metrics.get("warnings", [])
    return html.Div(
        [
            html.Ul(
                [
                    html.Li(f"Duration: {tech.get('duration_seconds', 0):.2f} s"),
                    html.Li(f"Sample rate: {tech.get('sample_rate')} Hz"),
                    html.Li(f"Integrated loudness: {loud.get('integrated_lufs', 0):.2f} LUFS"),
                    html.Li(f"True peak: {dyn.get('true_peak_dbfs', 0):.2f} dBFS"),
                    html.Li(f"Crest factor: {dyn.get('crest_factor_db', 0):.2f} dB"),
                    html.Li(f"Noise floor: {metrics.get('noise_floor_dbfs', 0):.2f} dBFS"),
                ]
            ),
            html.H6("Warnings"),
            html.Ul([html.Li(w) for w in warnings]) if warnings else html.P("None"),
        ]
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8050, debug=True)
