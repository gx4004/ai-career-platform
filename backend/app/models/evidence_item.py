import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EvidenceItem(Base):
    __tablename__ = "evidence_items"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('experience', 'achievement', 'skill', 'education', 'project', "
            "'certification', 'preference', 'interview-evidence')",
            name="ck_evidence_items_kind",
        ),
        CheckConstraint(
            "provenance IN ('imported', 'inferred', 'user-entered')",
            name="ck_evidence_items_provenance",
        ),
        CheckConstraint(
            "confirmation_state IN ('unconfirmed', 'confirmed', 'rejected')",
            name="ck_evidence_items_confirmation_state",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    provenance: Mapped[str] = mapped_column(String, nullable=False)
    confirmation_state: Mapped[str] = mapped_column(
        String, nullable=False, default="unconfirmed", server_default="unconfirmed"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user = relationship("User", back_populates="evidence_items")
