import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PacketStopAnswer(Base):
    """The user's typed answer to one mandatory-stop question on a packet (R15 #182).

    Stored *by value*, not by reference. D-093 forbids a packet from copying content
    that already lives in a referenced entity (CV / cover letter / listing); a stop
    answer is different — it is novel content the user types in response to a
    mandatory stop, so there is no source entity to reference. Persisting it directly,
    owner-scoped, is therefore consistent with D-093 (there is nothing to point at).

    It is the ONLY thing that can resolve a stop question (ADR 0009 / D-095): the
    system never drafts these fields, so the outstanding-question set shrinks only as
    the owner supplies answers here. The text is owner-scoped sensitive content and is
    excluded from telemetry entirely (D-099); it rides only the account-scoped export
    and the deletion cascade.
    """

    __tablename__ = "packet_stop_answers"
    __table_args__ = (
        # One answer per stop field per packet — re-answering updates in place.
        UniqueConstraint("packet_id", "field", name="uq_packet_stop_answer_field"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    packet_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("application_packets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The stop field being answered (a stop-category name) plus its category, so the
    # approval guard can pair answers to outstanding questions without re-classifying.
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    # The user's own words. Never drafted, never telemetered (D-099).
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    packet = relationship("ApplicationPacket", foreign_keys=[packet_id])
