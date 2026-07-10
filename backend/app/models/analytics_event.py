import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AnalyticsEvent(Base):
    """Durable store for R6 activation events (D-037).

    Purpose-built product-metrics table, scoped strictly to low-cardinality
    allowlisted dimensions — event name, tool id, access mode, timestamps,
    duration, cost estimate, plus the same allowlisted frontend-telemetry
    dimensions (failure category, export format, session status, etc.). It
    never holds resume text, job-description text, generated content, email,
    or any other free-text/PII field. The single shared write seam
    (`record_activation_event`) enforces that allowlist via `extra="forbid"`
    before any row reaches this table. Rows are pruned on a rolling 180-day
    window (retention wiring lives in a sibling R6 slice).
    """

    __tablename__ = "analytics_events"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    event_name: Mapped[str] = mapped_column(String, nullable=False, index=True)
    level: Mapped[str] = mapped_column(String, nullable=False, default="info")
    tool_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    access_mode: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    saved: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    failure_category: Mapped[str | None] = mapped_column(String, nullable=True)
    export_format: Mapped[str | None] = mapped_column(String, nullable=True)
    has_feedback: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    session_status: Mapped[str | None] = mapped_column(String, nullable=True)
    unlock_method: Mapped[str | None] = mapped_column(String, nullable=True)
    # Backend-computed operational metrics (nullable — frontend events omit them).
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_estimate: Mapped[float | None] = mapped_column(Numeric(12, 6), nullable=True)
    # occurred_at: event-reported time (may be null); created_at: server ingest
    # time, indexed to drive the 180-day retention prune.
    occurred_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
