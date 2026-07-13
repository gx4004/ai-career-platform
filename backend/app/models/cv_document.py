import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CvDocument(Base):
    __tablename__ = "cv_documents"
    __table_args__ = (
        UniqueConstraint("user_id", "source_import_id", name="uq_cv_documents_user_import"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    source_import_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    sections: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    quality_model_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tailoring_model_runs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user = relationship("User", back_populates="cv_documents")
    variants = relationship(
        "CvVariant",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="CvVariant.created_at",
    )


class CvVariant(Base):
    __tablename__ = "cv_variants"
    __table_args__ = (UniqueConstraint("document_id", "name", name="uq_cv_variants_document_name"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id: Mapped[str] = mapped_column(
        String, ForeignKey("cv_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    target_role: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tailoring_request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    sections: Mapped[list] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    document = relationship("CvDocument", back_populates="variants")
