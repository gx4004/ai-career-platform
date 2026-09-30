import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


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


class DiscoveryDeepMatchLink(Base):
    """The Job Match run an owner started from one listing (its first run in the chain).

    Reopening the listing shows the newest run in that run's ``parent_run_id``
    chain, so regenerating from the result page is picked up without rewriting
    this row. Deleting the run deletes the link.
    """

    __tablename__ = "discovery_deep_match_links"
    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", name="uq_discovery_deep_match_owner_listing"),
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
    tool_run_id: Mapped[str] = mapped_column(
        String, ForeignKey("tool_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
