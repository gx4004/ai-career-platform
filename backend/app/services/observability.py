from __future__ import annotations

import json
import logging
from typing import Any

from app.schemas.telemetry import TelemetryEventRequest

logger = logging.getLogger("app.observability")

# Derived from the ingestion schema, never hand-maintained: a field added there
# is loggable here automatically, and one removed stops being logged.
_TELEMETRY_FIELDS = frozenset(TelemetryEventRequest.model_fields)


def configure_logging() -> None:
    # httpx's INFO request line contains the full query string. Discovery
    # parameters are bounded but still reveal job-search intent.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    root_logger = logging.getLogger()
    if root_logger.handlers:
        return
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
    )


def log_tool_run_started(
    *,
    tool_name: str,
    access_mode: str,
    linked_context_count: int,
) -> None:
    _log(
        "tool_run_started",
        tool_name=tool_name,
        access_mode=access_mode,
        linked_context_count=linked_context_count,
    )


def log_tool_run_completed(
    *,
    tool_name: str,
    access_mode: str,
    duration_ms: int,
    saved: bool,
) -> None:
    _log(
        "tool_run_completed",
        tool_name=tool_name,
        access_mode=access_mode,
        duration_ms=duration_ms,
        saved=saved,
    )


def log_tool_run_failed(
    *,
    tool_name: str,
    access_mode: str,
    duration_ms: int,
    failure_category: str,
) -> None:
    _log(
        "tool_run_failed",
        level="error",
        tool_name=tool_name,
        access_mode=access_mode,
        duration_ms=duration_ms,
        failure_category=failure_category,
    )


def log_frontend_telemetry(payload: dict[str, Any]) -> None:
    """Log an allowlisted frontend telemetry event.

    The ingestion route already validates against ``TelemetryEventRequest``,
    which forbids extra fields — but that made this seam safe only by caller
    discipline, and it splats whatever dict it is handed straight into a log
    line. A second caller, or a route refactor that skipped validation, would
    silently write user content to stdout.

    So the allowlist is re-applied here, derived from the same schema rather
    than a second hand-maintained list. Unknown fields are dropped rather than
    raising: telemetry must never break a user action, and dropping fails
    closed. The offending *names* are logged so the mistake stays discoverable —
    field names are developer-authored, unlike their values.
    """
    unexpected = sorted(set(payload) - _TELEMETRY_FIELDS)
    if unexpected:
        _log("frontend_telemetry_fields_dropped", level="error", fields=",".join(unexpected))
    _log(
        "frontend_telemetry",
        **{key: value for key, value in payload.items() if key in _TELEMETRY_FIELDS},
    )


def log_user_account_deleted(
    *,
    user_id: str,
    runs_deleted: int,
    workspaces_deleted: int,
    evidence_items_deleted: int,
    cv_documents_deleted: int,
    cv_variants_deleted: int,
    user_record_deleted: bool,
    development_items_deleted: int = 0,
) -> None:
    """RODO/GDPR audit trail for the right-to-erasure path.

    The user_id ends up in the log even though the row is gone — that's the
    whole point of an audit line: regulators need a record that the request
    was honoured. The cascade counts (runs, workspaces, evidence items) let the
    request be reconstructed without persisting any user content (resume, JD,
    evidence text, name, email) (D-031).
    """
    _log(
        "user_account_deleted",
        user_id=user_id,
        runs_deleted=runs_deleted,
        workspaces_deleted=workspaces_deleted,
        evidence_items_deleted=evidence_items_deleted,
        cv_documents_deleted=cv_documents_deleted,
        cv_variants_deleted=cv_variants_deleted,
        development_items_deleted=development_items_deleted,
        user_record_deleted=user_record_deleted,
    )


def _log(event: str, level: str = "info", **fields: Any) -> None:
    sanitized = {key: value for key, value in fields.items() if value is not None}
    message = json.dumps({"event": event, **sanitized}, default=str, sort_keys=True)
    if level == "error":
        logger.error(message)
        return
    logger.info(message)
