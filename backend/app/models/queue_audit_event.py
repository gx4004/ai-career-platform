import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class QueueAuditEvent(Base):
    """Append-only audit record of every Application Approval Queue action (D-098).

    Owner-scoped user data: joins the account-deletion cascade and the
    machine-readable export (D-099). Rows are written once and never updated or
    deleted individually by product code — the only removal path is the
    account-deletion cascade. ``details`` carries low-detail structured metadata
    (action-specific classes/ids), never raw draft text or stop answers.
    """

    __tablename__ = "queue_audit_events"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    # By-reference (D-093): a soft reference to the packet the action concerned,
    # if any. Not a hard FK so audit history survives packet lifecycle churn;
    # both are erased together by the account-deletion cascade.
    packet_id: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
