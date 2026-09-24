from __future__ import annotations

import json
import logging
from typing import Any

from app.schemas.telemetry import TelemetryEventRequest

logger = logging.getLogger("app.observability")

# Derived from the ingestion schema, never hand-maintained: a field added there
# is loggable here automatically, and one removed stops being logged.
_TELEMETRY_FIELDS = frozenset(TelemetryEventRequest.model_fields)

_ACCESS_LOGGER_NAME = "uvicorn.access"
# Standard "no client recorded" placeholder in common/combined access-log format.
_REDACTED_CLIENT = "-"
# Keeps "this request carried a query string" visible without any of its content.
_REDACTED_QUERY = "?<redacted>"
# (client_addr, method, full_path, http_version, status)
_ACCESS_RECORD_ARITY = 5


class _AccessLogPrivacyFilter(logging.Filter):
    """Strip request-identifying data from uvicorn's per-response access record.

    uvicorn logs one record per response as
    ``'%s - "%s %s HTTP/%s" %d' % (client_addr, method, full_path, http_version,
    status)`` (``uvicorn/protocols/http/h11_impl.py`` and ``httptools_impl.py``).
    ``full_path`` comes from ``uvicorn.protocols.utils.get_path_with_query_string``,
    which appends the raw query string, and ``client_addr`` is the peer address.

    Both are user data on this API — the admin user search filters on
    ``?q=<email>`` (``app/routers/admin.py``) — and stdout is the one surface the
    Sentry scrubbing in ``app/main.py`` never sees. docs/threat-model.md §10.1
    lists email addresses and IP addresses among the values deliberately not
    logged, so uvicorn's default access line contradicts the documented posture.

    Rewriting ``record.args`` instead of swapping the formatter keeps this
    independent of whichever handler/formatter is installed (uvicorn's default
    ``AccessFormatter``, a ``--log-config`` override, or a plain handler), and it
    runs on the logger before any handler sees the record. Method, path, protocol
    version and status code survive untouched, so operational debugging still
    works; the log is never silenced.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if not isinstance(args, tuple) or len(args) != _ACCESS_RECORD_ARITY:
            # Not the access-record shape this filter understands. Pass it
            # through unchanged rather than dropping it — the goal is redaction,
            # not suppression.
            return True
        _client_addr, method, full_path, http_version, status = args
        record.args = (
            _REDACTED_CLIENT,
            method,
            _redact_query_string(full_path),
            http_version,
            status,
        )
        return True


def _redact_query_string(full_path: Any) -> Any:
    if not isinstance(full_path, str):
        return full_path
    path, separator, _query = full_path.partition("?")
    if not separator:
        return path
    return f"{path}{_REDACTED_QUERY}"


def _install_access_log_privacy_filter() -> None:
    access_logger = logging.getLogger(_ACCESS_LOGGER_NAME)
    if any(isinstance(item, _AccessLogPrivacyFilter) for item in access_logger.filters):
        return
    access_logger.addFilter(_AccessLogPrivacyFilter())


def configure_logging() -> None:
    # httpx's INFO request line contains the full query string. Discovery
    # parameters are bounded but still reveal job-search intent.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    # uvicorn builds `uvicorn.access` from its own dictConfig in `Config.__init__`,
    # which runs before `Config.load()` imports the ASGI app. `app.main` calls
    # configure_logging() at import time, so the filter is installed after that
    # dictConfig and survives it — and it holds for every entrypoint that imports
    # the app: start.sh, the Dockerfile CMD, `uvicorn --reload`, and embedded
    # servers. Neither start.sh nor the Dockerfile has to repeat it, which is why
    # they stay flag-free and identical in this respect.
    _install_access_log_privacy_filter()
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
