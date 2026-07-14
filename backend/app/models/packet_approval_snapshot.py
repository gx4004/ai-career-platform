import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PacketApprovalSnapshot(Base):
    """An immutable, by-value freeze of what an owner approved (R15 #185, D-096).

    A packet is a reference-only composition (D-093): it points at its CV variant,
    drafts run, and listing, so it always reflects their *current* content. Approval
    is the one moment where copying is correct (D-096): the owner is committing to a
    specific application, and that commitment must not silently change if the CV
    variant is re-tailored, the drafts are regenerated, or the listing is refreshed
    afterwards. This row therefore stores ``content_json`` — a self-contained copy of
    the resolved materials at the instant of approval — plus its ``content_sha256``
    for integrity.

    The row is written exactly once, at approval, and is never updated: there is no
    update service and no update/delete-by-id endpoint. The only way a row leaves the
    table is the owner-scoped account-deletion cascade (D-099). ``role_key`` is the
    normalized ``company|role`` identity used to block duplicate applications to the
    same role (D-098) — a low-cardinality derived key, never material content.
    """

    __tablename__ = "packet_approval_snapshots"
    __table_args__ = (
        # One frozen approval per packet — approval is a single, terminal commitment.
        UniqueConstraint("packet_id", name="uq_packet_approval_snapshot_packet"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The approved packet. CASCADE so erasing the packet erases its frozen approval.
    packet_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("application_packets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The campaign the approval belongs to (R13 workspaces-become-campaigns).
    campaign_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Soft reference to the canonical listing the packet targeted, for provenance.
    listing_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Normalized ``company|role`` identity; blocks duplicate approvals for one role.
    role_key: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    # The official destination the owner opens themselves to submit (ADR 0009). The
    # product never submits; this is only the URL to hand off to.
    destination_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    # The by-value freeze of the resolved materials at approval (D-096).
    content_json: Mapped[str] = mapped_column(Text, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    packet = relationship("ApplicationPacket", foreign_keys=[packet_id])
