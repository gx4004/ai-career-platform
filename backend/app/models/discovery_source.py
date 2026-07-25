import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.submission_source import SubmissionSourceGovernance


class DiscoverySource(Base):
    """Governance record required before any discovery ingestion is allowed."""

    __tablename__ = "discovery_sources"
    __table_args__ = (
        CheckConstraint(
            "source_family IN ('licensed', 'employer_ats', 'public_career_page', 'user_provided')",
            name="ck_discovery_sources_family",
        ),
        CheckConstraint(
            "terms_status IN ('pending', 'accepted', 'failed')",
            name="ck_discovery_sources_terms_status",
        ),
        CheckConstraint(
            "allowed_behavior IN ('api', 'feed', 'ats_integration', 'public_page', "
            "'user_url', 'paste')",
            name="ck_discovery_sources_allowed_behavior",
        ),
        CheckConstraint(
            "robots_policy IS NULL OR robots_policy IN ('required', 'not_applicable')",
            name="ck_discovery_sources_robots_policy",
        ),
        CheckConstraint(
            "rate_limit_per_minute > 0 AND rate_limit_per_minute <= 10000",
            name="ck_discovery_sources_rate_limit",
        ),
        CheckConstraint(
            "retention_days > 0 AND retention_days <= 3650",
            name="ck_discovery_sources_retention_days",
        ),
        CheckConstraint(
            "rate_window_count >= 0",
            name="ck_discovery_sources_rate_window_count",
        ),
        CheckConstraint(
            "(terms_status = 'pending' AND terms_reviewed_at IS NULL AND "
            "terms_reviewed_by IS NULL) OR (terms_status IN ('accepted', 'failed') AND "
            "terms_reviewed_at IS NOT NULL AND terms_reviewed_by IS NOT NULL)",
            name="ck_discovery_sources_terms_review_record",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    source_family: Mapped[str] = mapped_column(String(40), nullable=False)
    owner: Mapped[str] = mapped_column(String(160), nullable=False)
    terms_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    terms_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    terms_reviewed_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    allowed_behavior: Mapped[str] = mapped_column(String(40), nullable=False)
    endpoint_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    allowed_query_parameters: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    robots_policy: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_window_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rate_window_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    attribution_rule: Mapped[str] = mapped_column(Text, nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
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
    submission_governance: Mapped["SubmissionSourceGovernance | None"] = relationship(
        back_populates="discovery_source",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )

    @property
    def ingestion_allowed(self) -> bool:
        return self.terms_status == "accepted" and not self.kill_switch
