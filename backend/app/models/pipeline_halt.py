import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PipelineHalt(Base):
    """A pipeline-wide preparation halt, keyed by scope (R15 #184, D-097).

    Operational (pipeline-wide) state — NOT owner-scoped user data. When a
    packet-quality or fabrication regression evaluation fails, one row exists for
    the ``packet-preparation`` scope and :func:`prepare_packets` refuses to prepare
    until it is cleared. A row absent for a scope means preparation is running
    (not halted). Because this is operational state, it is deliberately excluded
    from the account-deletion cascade and the owner data export (like the
    ``analytics_events`` operational store).
    """

    __tablename__ = "pipeline_halts"
    __table_args__ = (UniqueConstraint("scope", name="uq_pipeline_halt_scope"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # The pipeline this halt governs (currently only ``packet-preparation``). A
    # single row per scope: setting the halt upserts, clearing deletes the row.
    scope: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # Bounded regression category that triggered the halt (matches the allowlisted
    # ``PacketGateHaltReason`` telemetry dimension) — never free text.
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    halted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
