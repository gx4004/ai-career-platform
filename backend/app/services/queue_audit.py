"""Append-only audit log for Application Approval Queue actions (R15 #186, D-098).

The queue records every action as an immutable audit event. This module is the
single write seam: it exposes an append helper plus the export and
account-deletion-cascade helpers, and — deliberately — NO update or
delete-by-id path. The only way an individual row leaves the table is the
owner-scoped cascade below, invoked from `delete_all_user_data` (D-099).

`details` must carry only low-cardinality structured metadata (action classes,
outcome classes, entity ids) — never raw draft text or stop answers. That
sensitive content lives owner-scoped in its own tables and is exported/erased
there; the audit log references it, it does not copy it (D-093).
"""

from sqlalchemy.orm import Session

from app.models.queue_audit_event import QueueAuditEvent
from app.schemas.queue_audit import QueueAuditEventItem, QueueAuditExport


def record_queue_audit_event(
    db: Session,
    *,
    user_id: str,
    action: str,
    packet_id: str | None = None,
    details: dict | None = None,
    commit: bool = True,
) -> QueueAuditEvent:
    """Append one immutable audit row.

    Ordinary queue actions commit independently. A larger atomic state transition
    may pass ``commit=False`` so its decision, immutable artifact, and audit row
    either all persist or all roll back together; this remains the single audit
    write seam.
    """
    event = QueueAuditEvent(
        user_id=user_id,
        action=action,
        packet_id=packet_id,
        details=details or {},
    )
    db.add(event)
    if commit:
        db.commit()
        db.refresh(event)
    else:
        db.flush()
    return event


def list_queue_audit_events(db: Session, user_id: str) -> list[QueueAuditEvent]:
    return (
        db.query(QueueAuditEvent)
        .filter(QueueAuditEvent.user_id == user_id)
        .order_by(QueueAuditEvent.created_at.asc(), QueueAuditEvent.id)
        .all()
    )


def export_queue_audit_events(db: Session, user_id: str) -> QueueAuditExport:
    """The owner's own append-only queue audit history (D-099 export path)."""
    return QueueAuditExport(
        events=[
            QueueAuditEventItem.model_validate(row)
            for row in list_queue_audit_events(db, user_id)
        ]
    )


def delete_queue_audit_events(db: Session, user_id: str) -> int:
    """Owner-scoped hard delete for the account-deletion cascade (D-099).

    This is the ONLY deletion path for audit rows; product code never removes an
    individual event, preserving the append-only guarantee (D-098).
    """
    return (
        db.query(QueueAuditEvent)
        .filter(QueueAuditEvent.user_id == user_id)
        .delete(synchronize_session=False)
    )
