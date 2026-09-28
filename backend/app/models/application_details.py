import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ApplicationDetails(Base):
    """What the owner types once for every application form. One row per owner.

    Contact details plus standing answers to the questions only the owner may
    answer (work authorization, sponsorship, notice, salary, relocation).
    Autopilot fills forms from these and never guesses them from CV text (#374).
    """

    __tablename__ = "application_details"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    linkedin: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    website: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    location: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    work_authorization: Mapped[str] = mapped_column(Text, nullable=False, default="")
    visa_sponsorship: Mapped[str] = mapped_column(Text, nullable=False, default="")
    notice_period: Mapped[str] = mapped_column(Text, nullable=False, default="")
    salary_expectation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    relocation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
