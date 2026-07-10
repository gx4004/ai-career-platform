"""R8 admin dashboard Eval Runs endpoint (issue #124, parent #118, D-045).

Exercises the admin read endpoint at the HTTP boundary against a fixture
directory of *fake* report files (never a live eval run): an authorized admin
gets the latest report per tool read from disk, tools with no report file get an
explicit "no eval run yet" state (``has_report=False``), and
unauthorized/non-admin requests are rejected the same way every other admin
endpoint rejects them (prior art: ``get_current_admin`` on every route in
``app/routers/admin.py``).

The endpoint reads from disk only and never touches ``analytics_events`` (D-045);
the reports directory is pointed at a tmp fixture dir via the ``get_reports_dir``
dependency override so the real ``app/evals/reports/`` tree is untouched.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.auth.security import create_access_token, hash_password
from app.evals.run_eval import ALL_TOOLS, REPORT_SCHEMA_VERSION
from app.main import app
from app.models.user import User
from app.routers.admin import get_reports_dir

PREFIX = "/api/v1"


@pytest.fixture
def admin_headers(db):
    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("password123"),
        full_name="Admin User",
        is_admin=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"Authorization": f"Bearer {create_access_token(admin.id)}"}


def _write_report(reports_dir: Path, name: str, report: dict) -> None:
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / name).write_text(json.dumps(report, indent=2), encoding="utf-8")


def _calibration_report(tool: str, *, generated_at: str, miss_rate: float) -> dict:
    return {
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "tool": tool,
        "prompt_version": "resume-v3",
        "judge_prompt_version": None,
        "generated_at": generated_at,
        "mode": "deterministic",
        "fixtures_evaluated": 11,
        "calibration_miss_rate": miss_rate,
        "fabrication_candidate_count": None,
        "usefulness_score": None,
    }


def _generative_report(tool: str, *, generated_at: str) -> dict:
    return {
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "tool": tool,
        "prompt_version": "cover-v2",
        "judge_prompt_version": "judge-v1",
        "generated_at": generated_at,
        "mode": "live",
        "fixtures_evaluated": 8,
        "calibration_miss_rate": None,
        "fabrication_candidate_count": 3,
        "usefulness_score": 4.25,
    }


# --- Authorization boundary ------------------------------------------------


def test_eval_runs_requires_authentication(client):
    resp = client.get(f"{PREFIX}/admin/eval-runs")
    assert resp.status_code == 401


def test_eval_runs_rejects_non_admin(client, auth_headers):
    resp = client.get(f"{PREFIX}/admin/eval-runs", headers=auth_headers)
    assert resp.status_code == 403


# --- Shaped response reading fixture report files from disk -----------------


def test_eval_runs_returns_all_six_tools_in_tool_order(client, admin_headers, tmp_path):
    app.dependency_overrides[get_reports_dir] = lambda: tmp_path

    resp = client.get(f"{PREFIX}/admin/eval-runs", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert [t["tool_id"] for t in body["tools"]] == list(ALL_TOOLS)


def test_eval_runs_empty_state_when_no_report(client, admin_headers, tmp_path):
    # Empty (but existing) directory: every tool falls back to the explicit
    # "no eval run yet" state, not an error or blank.
    app.dependency_overrides[get_reports_dir] = lambda: tmp_path

    resp = client.get(f"{PREFIX}/admin/eval-runs", headers=admin_headers)
    assert resp.status_code == 200
    tools = resp.json()["tools"]
    assert all(t["has_report"] is False for t in tools)
    assert all(t["calibration_miss_rate"] is None for t in tools)


def test_eval_runs_surfaces_latest_report_per_tool(client, admin_headers, tmp_path):
    # Two reports for the same tool: the newer timestamp must win.
    _write_report(
        tmp_path,
        "resume-resume-v3-20260701T120000Z.json",
        _calibration_report("resume", generated_at="2026-07-01T12:00:00+00:00", miss_rate=0.18),
    )
    _write_report(
        tmp_path,
        "resume-resume-v3-20260709T120000Z.json",
        _calibration_report("resume", generated_at="2026-07-09T12:00:00+00:00", miss_rate=0.09),
    )
    _write_report(
        tmp_path,
        "cover-letter-cover-v2-20260709T120000Z.json",
        _generative_report("cover-letter", generated_at="2026-07-09T12:00:00+00:00"),
    )
    app.dependency_overrides[get_reports_dir] = lambda: tmp_path

    resp = client.get(f"{PREFIX}/admin/eval-runs", headers=admin_headers)
    assert resp.status_code == 200
    tools = {t["tool_id"]: t for t in resp.json()["tools"]}

    resume = tools["resume"]
    assert resume["has_report"] is True
    assert resume["generated_at"] == "2026-07-09T12:00:00+00:00"
    assert resume["calibration_miss_rate"] == 0.09
    assert resume["fabrication_candidate_count"] is None

    cover = tools["cover-letter"]
    assert cover["has_report"] is True
    assert cover["fabrication_candidate_count"] == 3
    assert cover["usefulness_score"] == 4.25
    assert cover["calibration_miss_rate"] is None

    # A tool with no file still appears, in the empty state.
    assert tools["job-match"]["has_report"] is False


def test_eval_runs_skips_malformed_report_file(client, admin_headers, tmp_path):
    # A corrupt artifact must be skipped, not crash the admin view.
    tmp_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "resume-broken.json").write_text("{ not json", encoding="utf-8")
    app.dependency_overrides[get_reports_dir] = lambda: tmp_path

    resp = client.get(f"{PREFIX}/admin/eval-runs", headers=admin_headers)
    assert resp.status_code == 200
    tools = {t["tool_id"]: t for t in resp.json()["tools"]}
    assert tools["resume"]["has_report"] is False
