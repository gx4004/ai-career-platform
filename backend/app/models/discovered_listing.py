import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DiscoveredListing(Base):
    """Product-owned canonical listing, separate from user campaign content."""

    __tablename__ = "discovered_listings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    attributions = relationship(
        "DiscoveredListingAttribution",
        back_populates="listing",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DiscoveredListingAttribution(Base):
    __tablename__ = "discovered_listing_attributions"
    __table_args__ = (
        UniqueConstraint(
            "source_id",
            "source_listing_key",
            name="uq_discovered_listing_attribution_source_key",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    listing_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovered_listings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovery_sources.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    source_listing_key: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    listing = relationship("DiscoveredListing", back_populates="attributions")
    source = relationship("DiscoverySource")
