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
from pathlib import Path

from app.evals.run_eval import ALL_TOOLS, REPORTS_DIR

__all__ = ["ALL_TOOLS", "REPORTS_DIR", "latest_reports_by_tool"]


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
        if not isinstance(data, dict):
            continue
        tool = data.get("tool")
        generated_at = data.get("generated_at")
        if not isinstance(tool, str) or not isinstance(generated_at, str):
            continue
        existing = latest.get(tool)
        if existing is None or generated_at > str(existing.get("generated_at", "")):
            latest[tool] = data
    return latest
