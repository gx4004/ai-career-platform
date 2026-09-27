import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Hard ceiling on how many applications one "prepare for me" click may prepare.
# It is the only spend bound: each prepared application is one model call.
MAX_PREPARE_PER_RUN = 10


class ApplicationPreferences(Base):
    """What "prepare applications for me" looks for. One row per owner."""

    __tablename__ = "application_preferences"
    __table_args__ = (
        CheckConstraint(
            f"max_per_run >= 1 AND max_per_run <= {MAX_PREPARE_PER_RUN}",
            name="ck_application_preferences_max_per_run",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    keywords: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    locations: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    remote: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_per_run: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
