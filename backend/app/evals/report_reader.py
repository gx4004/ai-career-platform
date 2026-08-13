"""Read-only reader for the R8 versioned JSON eval reports (issue #124).

The CLI runner (:mod:`app.evals.run_eval`) writes one versioned report per tool
per run to ``app/evals/reports/`` as ``<tool>-<prompt_version>-<timestamp>.json``.
This module is the *reader* half: it surfaces the latest report per tool for the
read-only "Eval Runs" section of the R6 admin dashboard (parent spec #118, D-045).

Reports are dev-tooling artifacts on disk — this reader never touches the
``analytics_events`` table (D-045). It is deliberately tolerant: an unreadable,
malformed, or off-shape file is skipped rather than raising, so one bad artifact
can never take down the admin view.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.evals.run_eval import ALL_TOOLS, REPORT_SCHEMA_VERSION, REPORTS_DIR

__all__ = ["ALL_TOOLS", "REPORTS_DIR", "latest_reports_by_tool"]


class _EvalReportArtifact(BaseModel):
    """Strict trust boundary for generated on-disk eval artifacts."""

    model_config = ConfigDict(extra="forbid", strict=True)

    report_schema_version: Literal[REPORT_SCHEMA_VERSION]
    tool: str
    prompt_version: str = Field(min_length=1)
    judge_prompt_version: str | None
    generated_at: str
    mode: Literal["deterministic", "live"]
    fixtures_evaluated: int = Field(ge=0)
    calibration_miss_rate: float | None = Field(default=None, ge=0, le=1)
    fabrication_candidate_count: int | None = Field(default=None, ge=0)
    usefulness_score: float | None = Field(default=None, ge=1, le=5)

    @field_validator("tool")
    @classmethod
    def validate_tool(cls, value: str) -> str:
        if value not in ALL_TOOLS:
            raise ValueError("unknown eval tool")
        return value

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("generated_at must include a timezone")
        return value


def _generated_at(report: dict[str, object]) -> datetime:
    return datetime.fromisoformat(str(report["generated_at"]).replace("Z", "+00:00"))


def latest_reports_by_tool(reports_dir: Path | None = None) -> dict[str, dict]:
    """Return the newest report per tool from ``reports_dir``, keyed by tool id.

    Scans every ``*.json`` file in the directory, parses it, and keeps the one
    with the greatest ISO-8601 ``generated_at`` per ``tool``. ISO-8601 UTC
    timestamps sort correctly as strings, so no datetime parsing is needed.

    Args:
        reports_dir: Directory to read; defaults to :data:`REPORTS_DIR`.

    Returns:
        ``{tool_id: report_dict}`` for tools that have at least one valid report.
        Tools with no report are simply absent (the caller supplies the explicit
        "no eval run yet" state). An empty dict is returned when the directory
        does not exist yet.
    """
    directory = reports_dir if reports_dir is not None else REPORTS_DIR
    latest: dict[str, dict] = {}
    if not directory.is_dir():
        return latest

    for path in sorted(directory.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        try:
            report = _EvalReportArtifact.model_validate(data).model_dump()
        except ValidationError:
            continue
        tool = report["tool"]
        existing = latest.get(tool)
        if existing is None or _generated_at(report) > _generated_at(existing):
            latest[tool] = report
    return latest
