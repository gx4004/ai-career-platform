from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

# Closed set of queue actions recorded in the append-only audit log (D-098).
# Extend deliberately as new queue actions ship (accept/edit/skip/reject/pause
# land with the review surface #183 and approval handoff #185).
QueueAuditAction = Literal[
    "rule_upserted",
    "rule_deleted",
    "settings_updated",
    "packet_prepared",
    "packet_reprepared",
    "packet_gate_evaluated",
    "stop_answer_recorded",
    "packet_accepted",
    "packet_edited",
    "packet_skipped",
    "packet_rejected",
    "queue_paused",
    "queue_resumed",
]


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class QueueAuditEventItem(BaseModel):
    """One append-only queue audit record in the owner's own data export (D-099)."""

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    action: QueueAuditAction
    packet_id: str | None
    details: dict
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize_ts(cls, value: datetime) -> datetime:
        return _as_utc(value)


class QueueAuditExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[QueueAuditEventItem]
