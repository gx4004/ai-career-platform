import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.discovery_source import DiscoverySource
    from app.models.packet_approval_snapshot import PacketApprovalSnapshot
    from app.models.user import User


class SubmissionStopEvent(Base):
    """Immutable owner-visible proof that automation returned control."""

    __tablename__ = "submission_stop_events"
    __table_args__ = (
        UniqueConstraint(
            "packet_approval_snapshot_id",
            "discovery_source_id",
            name="uq_submission_stop_event_snapshot_source",
        ),
        UniqueConstraint("idempotency_key", name="uq_submission_stop_event_idempotency_key"),
        CheckConstraint(
            "reason IN ('challenge', 'authentication_required', 'uncertainty', "
            "'compatibility_mismatch', 'source_validation_rejected')",
            name="ck_submission_stop_event_reason",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    packet_approval_snapshot_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("packet_approval_snapshots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    discovery_source_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovery_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    authorization_grant_id: Mapped[str] = mapped_column(String, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    contract_version: Mapped[str] = mapped_column(String(100), nullable=False)
    contract_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    source_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    user: Mapped["User"] = relationship()
    packet_approval_snapshot: Mapped["PacketApprovalSnapshot"] = relationship(
        back_populates="submission_stop_events"
    )
    discovery_source: Mapped["DiscoverySource"] = relationship()
