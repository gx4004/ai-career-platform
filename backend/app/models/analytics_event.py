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
    # Backend-computed operational metrics (nullable — frontend events omit them).
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_estimate: Mapped[float | None] = mapped_column(Numeric(12, 6), nullable=True)
    # R10 operational-event dimensions (issue #136, D-053). Two reused, closed-set
    # low-cardinality columns feeding the scaling-trigger scorecard: the primary
    # category/family (provider incident category or import source family) and the
    # outcome class (cache outcome or import outcome). Null for every R6 event;
    # the `ActivationEventCreate` allowlist keeps both to Literal values only.
    operational_dimension: Mapped[str | None] = mapped_column(
        String, nullable=True, index=True
    )
    operational_outcome: Mapped[str | None] = mapped_column(String, nullable=True)
    # R11 profile-adoption dimensions (issue #150, D-067). Three reused, closed-set
    # low-cardinality columns feeding the profile-adoption view: the typed item
    # kind, the provenance class, and the resulting confirmation state of a
    # transition (null on deletion). Null for every non-profile event; the
    # `ActivationEventCreate` allowlist keeps all three to Literal values only, so
    # no evidence text, employer/institution name, or content id can land here.
    evidence_kind: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    evidence_provenance: Mapped[str | None] = mapped_column(String, nullable=True)
    confirmation_transition: Mapped[str | None] = mapped_column(
        String, nullable=True, index=True
    )
    # R17 development-loop adoption dimensions (#202, D-114). All four are
    # closed enums at the write seam; no gap message, note, recommendation
    # content, stable item identifier, or user identifier has a storage column.
    development_gap_kind: Mapped[str | None] = mapped_column(
        String, nullable=True, index=True
    )
    development_response_kind: Mapped[str | None] = mapped_column(
        String, nullable=True, index=True
    )
    development_state_from: Mapped[str | None] = mapped_column(String, nullable=True)
    development_state_to: Mapped[str | None] = mapped_column(String, nullable=True)
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
