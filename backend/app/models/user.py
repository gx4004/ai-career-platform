import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    google_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # Audit line for the last admin-role change. The acting admin is a reference,
    # not a copied address, so deleting that admin's account leaves no personal data.
    role_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    role_changed_by_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    token_version: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, onupdate=lambda: datetime.now(UTC)
    )

    tool_runs = relationship("ToolRun", back_populates="user")
    workspaces = relationship("Workspace", back_populates="user")
    evidence_items = relationship(
        "EvidenceItem", back_populates="user", cascade="all, delete-orphan"
    )
    cv_documents = relationship(
        "CvDocument", back_populates="user", cascade="all, delete-orphan"
    )
    gap_classifications = relationship(
        "GapClassification", back_populates="user", cascade="all, delete-orphan"
    )
    development_items = relationship(
        "DevelopmentItem", back_populates="user", cascade="all, delete-orphan"
    )


# One account per address whatever its capitalisation, legacy rows included.
Index("uq_users_email_lower", func.lower(User.email), unique=True)
