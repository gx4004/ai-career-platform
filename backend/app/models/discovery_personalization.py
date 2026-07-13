import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Closed sets shared by the model check constraints and the API schemas. Keeping
# them here as the single source of truth means a stray value can never be
# persisted, and telemetry/admin views only ever see low-cardinality classes.
REPORT_REASON_CATEGORIES = (
    "not_relevant",
    "expired",
    "duplicate",
    "wrong_location",
    "low_quality",
    "other",
)
SOURCE_FAMILIES = ("licensed", "employer_ats", "public_career_page", "user_provided")


class DiscoveryHiddenSource(Base):
    """Owner-scoped decision to keep a governed source out of the discovery feed."""

    __tablename__ = "discovery_hidden_sources"
    __table_args__ = (
        UniqueConstraint("user_id", "source_id", name="uq_discovery_hidden_source_owner"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_id: Mapped[str] = mapped_column(
        String, ForeignKey("discovery_sources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DiscoveryDismissedListing(Base):
    """Owner-scoped dismissal of a single discovered listing from the feed."""

    __tablename__ = "discovery_dismissed_listings"
    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", name="uq_discovery_dismissed_listing_owner"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    listing_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovered_listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )


class DiscoveryRecommendationReport(Base):
    """An error report a user filed against a recommendation, kept for admin review.

    The listing's product-owned facts (id, title, company, source family) are
    snapshotted at report time so the report survives listing expiry and the admin
    review never has to join back to the user's profile. No evidence, preference,
    or other profile content is stored here — only the product listing snapshot and
    the user's own free-text reason.
    """

    __tablename__ = "discovery_recommendation_reports"
    __table_args__ = (
        CheckConstraint(
            "reason_category IN "
            "('not_relevant', 'expired', 'duplicate', 'wrong_location', 'low_quality', 'other')",
            name="ck_discovery_report_reason_category",
        ),
        CheckConstraint(
            "source_family IN "
            "('licensed', 'employer_ats', 'public_career_page', 'user_provided')",
            name="ck_discovery_report_source_family",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    listing_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    listing_title: Mapped[str] = mapped_column(String(200), nullable=False)
    listing_company: Mapped[str] = mapped_column(String(200), nullable=False)
    source_family: Mapped[str] = mapped_column(String(40), nullable=False)
    reason_category: Mapped[str] = mapped_column(String(40), nullable=False)
    reason_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
