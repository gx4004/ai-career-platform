import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.discovery_source import DiscoverySource


class SubmissionSourceGovernance(Base):
    """Dark R16 source gate extending one governed R14 discovery source."""

    __tablename__ = "submission_source_governance"
    __table_args__ = (
        CheckConstraint(
            "legal_terms_status IN ('pending', 'accepted', 'failed')",
            name="ck_submission_source_legal_terms_status",
        ),
        CheckConstraint(
            "contract_status IN ('missing', 'verified', 'broken')",
            name="ck_submission_source_contract_status",
        ),
        CheckConstraint(
            "(legal_terms_status = 'pending' AND legal_terms_reviewed_at IS NULL "
            "AND legal_terms_reviewed_by IS NULL) OR "
            "(legal_terms_status IN ('accepted', 'failed') "
            "AND legal_terms_reviewed_at IS NOT NULL "
            "AND legal_terms_reviewed_by IS NOT NULL)",
            name="ck_submission_source_legal_terms_review",
        ),
        CheckConstraint(
            "(contract_status = 'missing' AND contract_version IS NULL "
            "AND contract_fields IS NULL AND contract_formats IS NULL "
            "AND contract_error_semantics IS NULL AND contract_reviewed_at IS NULL "
            "AND contract_reviewed_by IS NULL) OR "
            "(contract_status IN ('verified', 'broken') AND contract_version IS NOT NULL "
            "AND contract_fields IS NOT NULL AND contract_formats IS NOT NULL "
            "AND contract_error_semantics IS NOT NULL AND contract_reviewed_at IS NOT NULL "
            "AND contract_reviewed_by IS NOT NULL)",
            name="ck_submission_source_contract_record",
        ),
        CheckConstraint(
            "(promoted = false AND promoted_at IS NULL AND promoted_by IS NULL) OR "
            "(promoted = true AND promoted_at IS NOT NULL AND promoted_by IS NOT NULL "
            "AND legal_terms_status = 'accepted' AND contract_status = 'verified')",
            name="ck_submission_source_promotion_record",
        ),
    )

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    discovery_source_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovery_sources.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    legal_terms_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    legal_terms_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    legal_terms_reviewed_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    contract_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="missing", server_default="missing"
    )
    contract_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    contract_fields: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    contract_formats: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    contract_error_semantics: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    contract_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    contract_reviewed_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    promoted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    promoted_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    kill_switch: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
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

    discovery_source: Mapped["DiscoverySource"] = relationship(
        back_populates="submission_governance"
    )

    @property
    def submission_allowed(self) -> bool:
        source = self.discovery_source
        return (
            self.promoted
            and self.legal_terms_status == "accepted"
            and self.contract_status == "verified"
            and not self.kill_switch
            and source.terms_status == "accepted"
            and not source.kill_switch
        )
