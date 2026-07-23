from __future__ import annotations

import time
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import apps.api.main as api_main
from audioqi.io.decode import ffmpeg_available
from tests.fixtures import write_synthetic_fixture


@pytest.fixture(autouse=True)
def _api_flow_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUDIOQI_SKIP_PDF_EXPORT", "1")
    monkeypatch.setattr(
        api_main,
        "SETTINGS",
        replace(api_main.SETTINGS, report_max_seconds=30),
    )
    import plotly.graph_objects as go
    monkeypatch.setattr(go.Figure, "write_image", lambda *args, **kwargs: None)
    class DummyFuture:
        def cancel(self): return False
        def done(self): return True
        def result(self): return None

    def sync_submit(run_id, fn):
        import threading
        t = threading.Thread(target=fn)
        t.start()
        t.join()
        return DummyFuture()

    monkeypatch.setattr(api_main, "submit", sync_submit)


def _hard_reset_test_state(client: TestClient) -> None:
    response = client.delete("/runs?hard_reset=true")
    assert response.status_code == 200


def test_upload_analyze_export_flow(tmp_path: Path) -> None:
    fixture = write_synthetic_fixture(tmp_path / "synthetic.wav")
    with TestClient(api_main.app) as client:
        _hard_reset_test_state(client)
        with fixture.open("rb") as f:
            upload_resp = client.post(
                "/runs/upload?hide_from_history=true",
                files={"file": ("synthetic.wav", f, "audio/wav")},
            )
        assert upload_resp.status_code == 200
        upload_payload = upload_resp.json()
        run_id = upload_payload["run"]["id"]
        assert upload_payload["run"].get("stage") in {"uploaded", "queued"}
        assert isinstance(upload_payload["run"].get("stage_detail"), str)

        analyze_resp = client.post(f"/runs/{run_id}/analyze")
        assert analyze_resp.status_code == 200

        deadline = time.time() + 120
        status = ""
        final_payload: dict[str, object] = {}
        while time.time() < deadline:
            run_resp = client.get(f"/runs/{run_id}")
            assert run_resp.status_code == 200
            payload = run_resp.json()
            status = payload["status"]
            if status in {"completed", "failed"}:
                final_payload = payload
                break
            time.sleep(0.2)
        assert status == "completed"
        assert final_payload.get("stage") in {"completed", "finalize", "report_finalize"}
        assert isinstance(final_payload.get("stage_detail"), str)
        chart_names_from_detail = final_payload.get("chart_names", [])
        assert isinstance(chart_names_from_detail, list)
        assert "waveform" in chart_names_from_detail
        assert "spectrogram_mel" in chart_names_from_detail

        charts_resp = client.get(f"/runs/{run_id}/charts")
        assert charts_resp.status_code == 200
        charts = charts_resp.json()
        assert "waveform" in charts
        assert "spectrogram_mel" in charts
        assert "spectrogram_cqt" in charts
        chart_names = sorted(charts.keys())
        assert len(chart_names) >= 8
        single_chart_resp = client.get(f"/runs/{run_id}/charts/spectrogram_mel")
        assert single_chart_resp.status_code == 200
        single_chart = single_chart_resp.json()
        assert isinstance(single_chart, dict)
        assert single_chart.get("data")
        waveform_chart_resp = client.get(f"/runs/{run_id}/charts/waveform")
        assert waveform_chart_resp.status_code == 200
        assert isinstance(waveform_chart_resp.json(), dict)
        cqt_trace = (charts.get("spectrogram_cqt", {}).get("data") or [{}])[0]
        cqt_freqs = cqt_trace.get("y") or []
        cqt_times = cqt_trace.get("x") or []
        assert cqt_freqs
        assert 10_000.0 < float(max(cqt_freqs)) < 12_500.0
        assert cqt_times
        assert float(max(cqt_times)) > 2.4

        markers = final_payload.get("markers") if isinstance(final_payload, dict) else []
        marker_types = {m.get("type") for m in markers if isinstance(m, dict)}
        assert "clipping" in marker_types
        assert marker_types.intersection({"true_peak_risk", "loudness_dip", "mono_incompatibility"})

        metrics_payload = final_payload.get("metrics") if isinstance(final_payload, dict) else {}
        recommendations = (
            metrics_payload.get("mastering_recommendations", [])
            if isinstance(metrics_payload, dict)
            else []
        )
        assert isinstance(recommendations, list)
        assert len(recommendations) > 0
        ai_advice = (
            metrics_payload.get("ai_mastering_advice", {})
            if isinstance(metrics_payload, dict)
            else {}
        )
        assert isinstance(ai_advice, dict)
        assert ai_advice.get("recommended_mode") in {"v1", "v2", "v3"}
        assert ai_advice.get("recommended_preset") in {"streaming", "club", "film", "voice"}
        assert ai_advice.get("recommended_backend") in {"internal", "auto", "ffmpeg", "pedalboard", "matchering"}
        assert isinstance(ai_advice.get("recommended_refine_passes"), int)
        assert isinstance(ai_advice.get("reasons"), list)

        json_export = client.get(f"/runs/{run_id}/export/json")
        assert json_export.status_code == 200
        json_metrics = json_export.json()
        assert "loudness" in json_metrics
        assert "mastering_recommendations" in json_metrics
        assert "ai_mastering_advice" in json_metrics

        html_export = client.get(f"/runs/{run_id}/export/html")
        assert html_export.status_code == 200

        # Verify AI advice endpoint
        ai_advice_resp = client.get(f"/runs/{run_id}/ai_advice")
        assert ai_advice_resp.status_code == 200
        ai_advice_payload = ai_advice_resp.json()
        assert "source" in ai_advice_payload
        assert "advice" in ai_advice_payload
        assert "summary" in ai_advice_payload["advice"]
        assert "eq_advice" in ai_advice_payload["advice"]
        assert "dynamics_advice" in ai_advice_payload["advice"]


def test_clear_run_history_removes_completed_runs(tmp_path: Path) -> None:
    fixture = write_synthetic_fixture(tmp_path / "synthetic.wav")
    with TestClient(api_main.app) as client:
        _hard_reset_test_state(client)
        baseline_clear = client.delete("/runs")
        assert baseline_clear.status_code == 200

        with fixture.open("rb") as f:
            upload_resp = client.post(
                "/runs/upload", files={"file": ("synthetic.wav", f, "audio/wav")}
            )
        assert upload_resp.status_code == 200
        run_id = upload_resp.json()["run"]["id"]

        runs_before = client.get("/runs")
        assert runs_before.status_code == 200
        assert any(row["id"] == run_id for row in runs_before.json())

        clear_resp = client.delete("/runs")
        assert clear_resp.status_code == 200
        payload = clear_resp.json()
        assert payload["deleted"] >= 1
        assert payload["skipped_active"] >= 0

        runs_after = client.get("/runs")
        assert runs_after.status_code == 200
        assert all(row["id"] != run_id for row in runs_after.json())


def test_hidden_upload_not_listed_in_run_history(tmp_path: Path) -> None:
    fixture = write_synthetic_fixture(tmp_path / "synthetic.wav")
    with TestClient(api_main.app) as client:
        _hard_reset_test_state(client)
        with fixture.open("rb") as f:
            upload_resp = client.post(
                "/runs/upload?hide_from_history=true",
                files={"file": ("synthetic.wav", f, "audio/wav")},
            )
        assert upload_resp.status_code == 200
        run_id = upload_resp.json()["run"]["id"]

        runs_default = client.get("/runs")
        assert runs_default.status_code == 200
        assert all(row["id"] != run_id for row in runs_default.json())

        runs_including_hidden = client.get("/runs?include_hidden=true")
        assert runs_including_hidden.status_code == 200
        assert any(row["id"] == run_id for row in runs_including_hidden.json())

        hidden_detail = client.get(f"/runs/{run_id}")
        assert hidden_detail.status_code == 200


def test_conversion_flow_and_downloads(tmp_path: Path) -> None:
    if not ffmpeg_available():
        pytest.skip("ffmpeg not available for conversion test.")

    fixture = write_synthetic_fixture(tmp_path / "synthetic.wav")
    with TestClient(api_main.app) as client:
        _hard_reset_test_state(client)
        with fixture.open("rb") as f:
            upload_resp = client.post(
                "/runs/upload?hide_from_history=true",
                files={"file": ("synthetic.wav", f, "audio/wav")},
            )
        assert upload_resp.status_code == 200
        run_id = upload_resp.json()["run"]["id"]

        convert_resp = client.post(f"/runs/{run_id}/convert?formats=mp3,wav,flac")
        assert convert_resp.status_code == 200

        deadline = time.time() + 60
        conversion_status = ""
        while time.time() < deadline:
            detail = client.get(f"/runs/{run_id}")
            assert detail.status_code == 200
            payload = detail.json()
            conversions = payload.get("conversions", {})
            conversion_status = conversions.get("status", "")
            if conversion_status in {"completed", "failed"}:
                break
            time.sleep(0.2)

        assert conversion_status == "completed"
        conversions = client.get(f"/runs/{run_id}/conversions")
        assert conversions.status_code == 200
        files = conversions.json().get("manifest", {}).get("files", [])
        found_formats = {item.get("format") for item in files}
        assert {"mp3", "wav", "flac"}.issubset(found_formats)

        mp3_download = client.get(f"/runs/{run_id}/conversions/mp3/download")
        assert mp3_download.status_code == 200
        assert len(mp3_download.content) > 0


def test_mastering_modes_v1_v2_v3(tmp_path: Path) -> None:
    fixture = write_synthetic_fixture(tmp_path / "synthetic.wav")
    with TestClient(api_main.app) as client:
        _hard_reset_test_state(client)
        with fixture.open("rb") as f:
            upload_resp = client.post(
                "/runs/upload?hide_from_history=true",
                files={"file": ("synthetic.wav", f, "audio/wav")},
            )
        assert upload_resp.status_code == 200
        run_id = upload_resp.json()["run"]["id"]

        mode_to_expected = {
            "v1": "master_v1",
            "v2": "master_v2_best",
            "v3": "master_v3",
        }

        for mode, expected_output in mode_to_expected.items():
            master_resp = client.post(
                f"/runs/{run_id}/master?mode={mode}&preset=streaming&normalization_profile=youtube&target_lufs=-14&true_peak_dbfs=-1&optimizer_variants=2"
            )
            assert master_resp.status_code == 200

            deadline = time.time() + 120
            master_status = ""
            while time.time() < deadline:
                payload = client.get(f"/runs/{run_id}/mastering")
                assert payload.status_code == 200
                status_payload = payload.json()
                master_status = status_payload.get("status", "")
                assert "stage" in status_payload
                assert "detail" in status_payload
                if master_status in {"completed", "failed"}:
                    break
                time.sleep(0.2)

            assert master_status == "completed"
            payload = client.get(f"/runs/{run_id}/mastering")
            assert payload.status_code == 200
            manifest = payload.json().get("manifest", {})
            outputs = manifest.get("outputs", [])
            output_ids = {item.get("id") for item in outputs}
            assert expected_output in output_ids
            assert isinstance(manifest.get("request_settings"), dict)
            assert isinstance(manifest.get("applied_settings"), dict)
            assert manifest.get("request_settings", {}).get("normalization_profile") in {
                "youtube",
                "off",
            }
            assert manifest.get("applied_settings", {}).get("normalization_profile") in {
                "youtube",
                "off",
            }
            assert isinstance(manifest.get("backend"), dict)
            adaptation = manifest.get("adaptation")
            assert isinstance(adaptation, dict)
            assert isinstance(adaptation.get("adjustment_count"), int)
            assert isinstance(adaptation.get("adjustments"), list)
            assert isinstance(adaptation.get("source_marker_counts"), dict)
            assert isinstance(manifest.get("refinement"), dict)
            assert isinstance(manifest.get("pro_features"), dict)
            self_check = manifest.get("self_check")
            assert isinstance(self_check, dict)
            assert self_check.get("best_output_id") in output_ids
            assert isinstance(self_check.get("score_before"), int)
            assert isinstance(self_check.get("score_after"), int)
            assert isinstance(self_check.get("remaining"), list)
            assert isinstance(self_check.get("compliance_mastered"), dict)
            assert isinstance(self_check.get("post_check_repair"), dict)
            selected_output = next(
                (item for item in outputs if item.get("id") == expected_output), None
            )
            assert isinstance(selected_output, dict)
            assert isinstance(selected_output.get("sha256"), str)
            assert abs(float(selected_output.get("duration_seconds", 0.0)) - 3.0) < 0.08

            dl_resp = client.get(f"/runs/{run_id}/mastering/{expected_output}/download")
            assert dl_resp.status_code == 200
            assert len(dl_resp.content) > 0


def test_mastering_backend_and_reference_validation(tmp_path: Path) -> None:
    fixture = write_synthetic_fixture(tmp_path / "synthetic.wav")
    with TestClient(api_main.app) as client:
        _hard_reset_test_state(client)
        with fixture.open("rb") as f:
            first_upload = client.post(
                "/runs/upload?hide_from_history=true",
                files={"file": ("synthetic.wav", f, "audio/wav")},
            )
        assert first_upload.status_code == 200
        run_id = first_upload.json()["run"]["id"]

        invalid_reference = client.post(
            f"/runs/{run_id}/master?mode=v1&preset=streaming&backend=matchering&reference_run_id=missing-run-id"
        )
        assert invalid_reference.status_code == 404

        with fixture.open("rb") as f:
            second_upload = client.post(
                "/runs/upload?hide_from_history=true",
                files={"file": ("synthetic_2.wav", f, "audio/wav")},
            )
        assert second_upload.status_code == 200
        reference_id = second_upload.json()["run"]["id"]

        master_resp = client.post(
            f"/runs/{run_id}/master?mode=v1&preset=streaming&backend=auto&reference_run_id={reference_id}&max_refine_passes=2"
        )
        assert master_resp.status_code == 200

        deadline = time.time() + 120
        status_payload: dict[str, object] = {}
        while time.time() < deadline:
            payload = client.get(f"/runs/{run_id}/mastering")
            assert payload.status_code == 200
            status_payload = payload.json()
            if status_payload.get("status") in {"completed", "failed"}:
                break
            time.sleep(0.2)

        assert status_payload.get("status") == "completed"
        manifest = status_payload.get("manifest", {})
        assert isinstance(manifest.get("backend"), dict)
        backend_payload = manifest.get("backend", {})
        assert backend_payload.get("requested") in {"auto", "matchering"}
        assert backend_payload.get("selected") in {
            "internal",
            "pedalboard",
            "matchering",
        }
