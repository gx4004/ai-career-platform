"""The browser telemetry `tool_id` taxonomy must not drift between the two sides.

The browser ingest contract (`TelemetryEventRequest`) validates against a narrow
enum and forbids unknown fields, so any divergence from the frontend union means
either events the browser sends and the backend rejects (422, silently — the
client never inspects the response), or an id the backend accepts that no browser
can legitimately produce.

Neither list is restated here: the backend side is derived from the schema with
`get_args`, and the frontend side is read out of the real TypeScript source.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import get_args

import pytest
from pydantic import ValidationError

from app.schemas.analytics import ActivationEventCreate, OperationalToolId
from app.schemas.telemetry import (
    BackendOnlyToolId,
    BrowserToolId,
    TelemetryEventRequest,
    ToolId,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
TELEMETRY_CLIENT = REPO_ROOT / "frontend" / "src" / "lib" / "telemetry" / "client.ts"
BROWSER_TOOL_IDS_PATTERN = re.compile(
    r"export const BROWSER_TOOL_IDS = \[(?P<members>.*?)\] as const",
    re.DOTALL,
)


def _literal_members(annotation) -> set[str]:
    """Flatten a Literal, or a Union of Literals, into its string members."""
    members: set[str] = set()
    for arg in get_args(annotation):
        if isinstance(arg, str):
            members.add(arg)
        else:
            members |= _literal_members(arg)
    return members


def _frontend_browser_tool_ids() -> tuple[str, ...]:
    source = TELEMETRY_CLIENT.read_text(encoding="utf-8")
    match = BROWSER_TOOL_IDS_PATTERN.search(source)
    assert match is not None, (
        f"BROWSER_TOOL_IDS not found in {TELEMETRY_CLIENT}. The browser telemetry "
        "contract must stay a readable `as const` list so this check cannot go vacuous."
    )
    return tuple(re.findall(r"'([^']+)'", match.group("members")))


def test_browser_tool_ids_agree_member_for_member_with_the_frontend():
    assert _frontend_browser_tool_ids() == get_args(BrowserToolId)


def test_the_frontend_only_reports_ids_the_pipeline_can_actually_run():
    # Guards the other direction: the parser above would happily return an empty
    # tuple against an equally empty backend enum.
    frontend_ids = _frontend_browser_tool_ids()

    assert len(frontend_ids) >= 6
    assert "resume" in frontend_ids


@pytest.mark.parametrize("tool_id", get_args(BackendOnlyToolId))
def test_browser_ingest_rejects_backend_only_tool_ids(tool_id):
    # `application-packet` is produced by app/services/application_packets.py,
    # never by a browser. Accepting it on the ingest route would let any client
    # fabricate packet activation rows.
    with pytest.raises(ValidationError):
        TelemetryEventRequest(event_name="tool_run_succeeded", tool_id=tool_id)


@pytest.mark.parametrize("tool_id", get_args(BrowserToolId))
def test_browser_ingest_accepts_every_browser_tool_id(tool_id):
    event = TelemetryEventRequest(event_name="tool_run_succeeded", tool_id=tool_id)

    assert event.tool_id == tool_id


def test_backend_only_ids_stay_inside_the_reporting_taxonomy():
    # Narrowing the ingest contract must not narrow admin/analytics reporting:
    # backend-emitted packet runs still need a bounded identifier.
    reporting_ids = get_args(ToolId)

    assert set(get_args(BrowserToolId)) <= set(reporting_ids)
    assert set(get_args(BackendOnlyToolId)) <= set(reporting_ids)
    # And the admin/analytics union still covers the whole reporting taxonomy.
    assert set(reporting_ids) <= _literal_members(OperationalToolId)


@pytest.mark.parametrize("tool_id", get_args(BackendOnlyToolId))
def test_backend_activation_events_still_accept_backend_only_tool_ids(tool_id):
    event = ActivationEventCreate(
        event_name="r10_generation_phase",
        tool_id=tool_id,
        access_mode="authenticated",
        duration_ms=1,
        operational_dimension="provider",
    )

    assert event.tool_id == tool_id
