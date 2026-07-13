import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# The closed set of queue-rule dimensions a candidate listing must pass. Kept here
# as the single source of truth shared by the model check constraint and the API
# schemas so a stray dimension can never be persisted (mirrors the R14
# personalization pattern). Keyword dimensions match against the listing's
# product-owned text; ``quality_threshold`` matches against the deterministic
# recommendation score.
KEYWORD_RULE_TYPES = ("role", "location", "compensation", "work_authorization")
QUEUE_RULE_TYPES = (*KEYWORD_RULE_TYPES, "quality_threshold")


class QueueRule(Base):
    """One owner-scoped filter a job must pass before it can become a packet.

    Rules are the gate for the Application Approval Queue: with no rules defined,
    candidate filtering prepares nothing (R15 #180). Each dimension is unique per
    user so a rule is individually addressable, editable, and deletable.
    """

    __tablename__ = "queue_rules"
    __table_args__ = (
        UniqueConstraint("user_id", "rule_type", name="uq_queue_rule_owner_type"),
        CheckConstraint(
            "rule_type IN "
            "('role', 'location', 'compensation', 'work_authorization', 'quality_threshold')",
            name="ck_queue_rule_type",
        ),
        CheckConstraint(
            "min_score IS NULL OR (min_score >= 0 AND min_score <= 100)",
            name="ck_queue_rule_min_score_range",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_type: Mapped[str] = mapped_column(String(40), nullable=False)
    # Populated for the keyword dimensions; NULL for ``quality_threshold``.
    keywords: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # Populated for ``quality_threshold``; NULL for the keyword dimensions.
    min_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class QueueSettings(Base):
    """Owner-scoped volume cap and cost ceiling for the Application Approval Queue.

    One row per user. The volume cap bounds how many candidates can be prepared in
    a single run; the cost ceiling bounds the projected preparation spend. Both are
    enforced server-side during candidate filtering and surfaced to the user in the
    queue preview so the limits are always visible (R15 #180).
    """

    __tablename__ = "queue_settings"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_queue_settings_owner"),
        CheckConstraint(
            "max_packets_per_run > 0 AND max_packets_per_run <= 1000",
            name="ck_queue_settings_volume_cap",
        ),
        CheckConstraint(
            "cost_ceiling_usd > 0",
            name="ck_queue_settings_cost_ceiling",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    max_packets_per_run: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_ceiling_usd: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
