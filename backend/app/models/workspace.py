import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint(
            "status IS NULL OR status IN ('planning', 'preparing', 'applied', "
            "'interviewing', 'offer', 'accepted', 'rejected', 'withdrawn')",
            name="ck_workspaces_campaign_status",
        ),
        # At most one campaign per owner per adopted discovery listing (R14 #176):
        # NULL (manually-created campaigns) is exempt by standard SQL NULL semantics.
        UniqueConstraint(
            "user_id", "discovery_listing_id", name="uq_workspace_owner_discovery_listing"
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    # The discovery listing this campaign was adopted from (R14 #176), if any.
    # NULL for manually-created campaigns. Lets adopt_recommendation detect and
    # reuse an existing campaign instead of creating a duplicate for the same
    # (owner, listing) pair.
    discovery_listing_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    role: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminders_last_surfaced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_listing_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("campaign_listings.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    selected_cv_variant_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("cv_variants.id", ondelete="SET NULL"), nullable=True
    )
    selected_cover_letter_run_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("tool_runs.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    selected_interview_run_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("tool_runs.id", ondelete="SET NULL", use_alter=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user = relationship("User", back_populates="workspaces")
    tool_runs = relationship(
        "ToolRun",
        back_populates="workspace",
        foreign_keys="ToolRun.workspace_id",
        order_by="ToolRun.created_at.desc()",
    )
    campaign_events = relationship(
        "CampaignEvent",
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CampaignEvent.created_at.asc(), CampaignEvent.id.asc()",
    )
    campaign_tasks = relationship(
        "CampaignTask",
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CampaignTask.created_at.asc()",
    )
    campaign_notes = relationship(
        "CampaignNote",
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CampaignNote.created_at.asc()",
    )
    campaign_contacts = relationship(
        "CampaignContact",
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CampaignContact.created_at.asc()",
    )
    submission_snapshots = relationship(
        "CampaignSubmissionSnapshot",
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CampaignSubmissionSnapshot.created_at.asc()",
    )
    packet_approval_snapshots = relationship(
        "PacketApprovalSnapshot",
        back_populates="campaign",
        cascade="all, delete-orphan",
        # Keep the lifecycle correct in SQLite/test environments where database
        # cascades are disabled; PostgreSQL's ON DELETE CASCADE remains defense in
        # depth.
        passive_deletes=False,
        order_by="PacketApprovalSnapshot.created_at.asc()",
    )
    listings = relationship(
        "CampaignListing",
        back_populates="workspace",
        cascade="all, delete-orphan",
        foreign_keys="CampaignListing.workspace_id",
        order_by="CampaignListing.retrieved_at.asc()",
    )
    listing = relationship(
        "CampaignListing",
        foreign_keys=[current_listing_id],
        post_update=True,
    )
    selected_cv_variant = relationship("CvVariant", foreign_keys=[selected_cv_variant_id])
    selected_cover_letter_run = relationship("ToolRun", foreign_keys=[selected_cover_letter_run_id])
    selected_interview_run = relationship("ToolRun", foreign_keys=[selected_interview_run_id])
