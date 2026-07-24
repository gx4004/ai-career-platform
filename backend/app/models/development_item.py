import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DevelopmentItem(Base):
    """A user's bounded development to-do derived from one classified gap (R17
    #199, D-112).

    Owner-scoped (a single per-user plan, like an Evidence Profile item — not
    campaign-scoped). ``gap_kind``, ``response_kind``, and ``source_finding_id``
    are snapshotted at creation so the item survives when the underlying gap
    classification is later reconciled away (its FK is set null, not cascaded):
    the user's commitment to work on a gap outlives the transient reviewer
    finding that surfaced it.
    """

    __tablename__ = "development_items"
    __table_args__ = (
        CheckConstraint(
            "gap_kind IN ('presentation_weakness', 'uncaptured_evidence', "
            "'evidence_not_yet_produced', 'missing_skill')",
            name="ck_development_items_gap_kind",
        ),
        CheckConstraint(
            "response_kind IN ('reword', 'capture_evidence', 'produce_evidence', "
            "'learn_skill')",
            name="ck_development_items_response_kind",
        ),
        CheckConstraint(
            "state IN ('planned', 'in_progress', 'completed')",
            name="ck_development_items_state",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    gap_classification_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("gap_classifications.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    gap_kind: Mapped[str] = mapped_column(String, nullable=False)
    response_kind: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[str] = mapped_column(
        String, nullable=False, default="planned", server_default="planned"
    )
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    source_finding_id: Mapped[str | None] = mapped_column(String, nullable=True)
    timeline: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user = relationship("User", back_populates="development_items")
