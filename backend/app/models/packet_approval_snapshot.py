import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PacketApprovalSnapshot(Base):
    """Write-once, by-value record of the exact packet an owner approved.

    Application packets normally reference mutable materials. Approval is the one
    boundary where those materials are copied so later listing, CV, draft, or
    rationale edits cannot change the owner's decision (D-096). Product code has no
    update or individual-delete path for this row. Account erasure and deletion of
    the owning campaign are its only removal paths.
    """

    __tablename__ = "packet_approval_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "packet_id",
            name="uq_packet_approval_snapshot_packet",
        ),
        UniqueConstraint(
            "user_id",
            "role_key",
            name="uq_packet_approval_snapshot_owner_role",
        ),
    )

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    packet_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("application_packets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    campaign_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Soft provenance reference: R14 retention may remove the canonical listing,
    # while an approval snapshot must remain reconstructable for the owner.
    listing_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Normalized company + role identity used for owner-scoped duplicate prevention.
    role_key: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    # Official manual destination only. No submission path consumes this in R15.
    destination_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    content_json: Mapped[str] = mapped_column(Text, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    packet = relationship("ApplicationPacket", foreign_keys=[packet_id])
    campaign = relationship(
        "Workspace",
        foreign_keys=[campaign_id],
        back_populates="packet_approval_snapshots",
    )
    submission_records = relationship(
        "SubmissionRecord",
        back_populates="packet_approval_snapshot",
        cascade="all, delete-orphan",
        passive_deletes=False,
    )
    submission_dispatch_claims = relationship(
        "SubmissionDispatchClaim",
        back_populates="packet_approval_snapshot",
        cascade="all, delete-orphan",
        passive_deletes=False,
    )
