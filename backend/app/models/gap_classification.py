import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GapClassification(Base):
    """One advisory reviewer finding labeled as one of four honest gap kinds (R17
    #198, D-109).

    Owner-scoped and campaign-scoped. The ``(workspace_id, finding_id)`` pair is
    unique so re-classifying the same materials is idempotent: reviewer findings
    carry a deterministic id (uuid5 of category+message+locations), so identical
    materials produce identical rows. ``cited_trace`` records the finding's own
    trace plus the classification-decision markers, so every row can explain why
    it was labeled — no free-form judgment is stored.
    """

    __tablename__ = "gap_classifications"
    __table_args__ = (
        CheckConstraint(
            "gap_kind IN ('presentation_weakness', 'uncaptured_evidence', "
            "'evidence_not_yet_produced', 'missing_skill')",
            name="ck_gap_classifications_gap_kind",
        ),
        UniqueConstraint(
            "workspace_id", "finding_id", name="uq_gap_classifications_workspace_finding"
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    finding_id: Mapped[str] = mapped_column(String, nullable=False)
    source_category: Mapped[str] = mapped_column(String, nullable=False)
    gap_kind: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    locations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    cited_trace: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user = relationship("User", back_populates="gap_classifications")
