import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.discovery_source import DiscoverySource
    from app.models.packet_approval_snapshot import PacketApprovalSnapshot
    from app.models.user import User


class SubmissionRecord(Base):
    """Immutable proof of one accepted packet-and-source submission."""

    __tablename__ = "submission_records"
    __table_args__ = (
        UniqueConstraint(
            "packet_approval_snapshot_id",
            "discovery_source_id",
            name="uq_submission_record_snapshot_source",
        ),
        UniqueConstraint("idempotency_key", name="uq_submission_record_idempotency_key"),
    )

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
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
    # A grant is deliberately deleted on revocation. Preserve only the opaque id
    # used at dispatch, without a foreign key that would erase the outward-act proof.
    authorization_grant_id: Mapped[str] = mapped_column(String, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    snapshot_content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    contract_version: Mapped[str] = mapped_column(String(100), nullable=False)
    contract_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    submitted_fields_json: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_fields_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    source_confirmation_id: Mapped[str] = mapped_column(String(200), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    user: Mapped["User"] = relationship()
    packet_approval_snapshot: Mapped["PacketApprovalSnapshot"] = relationship(
        back_populates="submission_records"
    )
    discovery_source: Mapped["DiscoverySource"] = relationship()


class SubmissionDispatchClaim(Base):
    """Durable serialization row for one snapshot/source idempotency key."""

    __tablename__ = "submission_dispatch_claims"

    idempotency_key: Mapped[str] = mapped_column(String(80), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    packet_approval_snapshot_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("packet_approval_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )
    discovery_source_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovery_sources.id", ondelete="CASCADE"),
        nullable=False,
    )
    authorization_grant_id: Mapped[str] = mapped_column(String, nullable=False)
    snapshot_content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    contract_version: Mapped[str] = mapped_column(String(100), nullable=False)
    contract_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    submitted_fields_json: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_fields_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    accepted_source_codes_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    packet_approval_snapshot: Mapped["PacketApprovalSnapshot"] = relationship(
        back_populates="submission_dispatch_claims"
    )
