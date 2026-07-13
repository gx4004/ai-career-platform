import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String
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
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    role: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
