import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SubmissionSafetyControl(Base):
    """Singleton operational emergency control and incident-rehearsal proof."""

    __tablename__ = "submission_safety_controls"
    __table_args__ = (
        CheckConstraint("id = 'global'", name="ck_submission_safety_control_singleton"),
        CheckConstraint(
            "(incident_playbook_version IS NULL AND incident_rehearsed_at IS NULL "
            "AND incident_rehearsed_by IS NULL) OR "
            "(incident_playbook_version IS NOT NULL AND incident_rehearsed_at IS NOT NULL "
            "AND incident_rehearsed_by IS NOT NULL)",
            name="ck_submission_safety_rehearsal_complete",
        ),
    )

    id: Mapped[str] = mapped_column(String(16), primary_key=True, default="global")
    global_kill_switch: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    incident_playbook_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    incident_rehearsed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    incident_rehearsed_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class SubmissionSafetyPolicy(Base):
    """Reviewed per-source bounds; contains no packet, user, or submitted content."""

    __tablename__ = "submission_safety_policies"
    __table_args__ = (
        CheckConstraint(
            "user_rate_limit_per_minute BETWEEN 1 AND 60",
            name="ck_submission_safety_user_rate",
        ),
        CheckConstraint(
            "user_daily_volume_limit BETWEEN 1 AND 1000",
            name="ck_submission_safety_user_volume",
        ),
        CheckConstraint(
            "source_rate_limit_per_minute BETWEEN 1 AND 1000",
            name="ck_submission_safety_source_rate",
        ),
        CheckConstraint(
            "source_daily_volume_limit BETWEEN 1 AND 100000",
            name="ck_submission_safety_source_volume",
        ),
        CheckConstraint(
            "anomaly_user_attempts_per_hour BETWEEN 1 AND 1000",
            name="ck_submission_safety_anomaly_threshold",
        ),
        CheckConstraint(
            "anomaly_user_attempts_per_hour <= user_daily_volume_limit",
            name="ck_submission_safety_anomaly_before_daily_limit",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    discovery_source_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("discovery_sources.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    user_rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    user_daily_volume_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    source_rate_limit_per_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    source_daily_volume_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    anomaly_user_attempts_per_hour: Mapped[int] = mapped_column(Integer, nullable=False)
    configured_by: Mapped[str] = mapped_column(String(160), nullable=False)
    configured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
