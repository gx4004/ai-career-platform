import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# A packet is either fully composed or visibly blocked by an unresolved question.
# ``blocked`` is the ADR 0009 posture — an unresolved question blocks approval; the
# exhaustive mandatory-stop classification is #182, this ticket only computes and
# attaches what it can determine.
PACKET_STATUSES = ("prepared", "blocked")

# The trust-chain gate outcome for the packet (R15 #184, D-097). ``pending`` before
# the Application Quality Reviewer has run; ``passed`` when the reviewer completed
# with zero unresolved fabrication findings (the ONLY state that is queue-eligible);
# ``blocked`` when the reviewer surfaced an unresolved fabrication finding — such a
# packet is never queued. Distinct from ``status`` (which tracks unresolved
# mandatory-stop questions blocking approval, D-095).
PACKET_GATE_STATES = ("pending", "passed", "blocked")

# The owner's review decision on the packet (R15 #183, the queue review surface).
# ``pending`` is the initial, still-reviewable state; ``accepted`` is the guarded
# transition (only permitted when the packet is approvable — every unresolved question
# answered, D-095/ADR 0009); ``skipped`` and ``rejected`` are the two owner dismissals.
# ``edit`` is NOT a decision — it reopens the packet's referenced materials under the
# existing diff/confirmation rules (D-073) and returns the decision to ``pending``.
# Distinct from ``status`` (preparedness) and ``gate_state`` (trust-chain outcome).
# The sole accepted transition freezes the immutable approval snapshot and returns
# the user-driven destination handoff atomically (#185).
PACKET_DECISIONS = ("pending", "accepted", "skipped", "rejected")


class ApplicationPacket(Base):
    """A reference-only composition prepared for one candidate listing (R15 #181).

    A packet is NOT a copy of any material content (D-093, ADR 0009). It stores
    foreign keys to the entities it composes — the campaign (``Workspace``), the
    canonical discovered listing, the selected CV variant, and the generated
    drafts (a ``ToolRun`` produced through the shared pipeline) — plus two derived,
    non-content structures the packet owns: the deterministic ``match_rationale``
    and the explicit ``unresolved_questions`` list. Dereferencing the FKs is the
    only way to reach material content, so the packet can never drift from, or
    outlive a copy of, the entities it references.
    """

    __tablename__ = "application_packets"
    __table_args__ = (
        # One packet per candidate listing per owner: re-preparing is idempotent
        # and never spawns duplicate campaigns or drafts for the same listing.
        UniqueConstraint("user_id", "listing_id", name="uq_packet_owner_listing"),
        CheckConstraint(
            "status IN ('prepared', 'blocked')",
            name="ck_application_packet_status",
        ),
        CheckConstraint(
            "gate_state IN ('pending', 'passed', 'blocked')",
            name="ck_application_packet_gate_state",
        ),
        CheckConstraint(
            "decision IN ('pending', 'accepted', 'skipped', 'rejected')",
            name="ck_application_packet_decision",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The campaign the packet belongs to (R13 workspaces-become-campaigns). Deleting
    # the campaign removes its packets — a packet without a campaign is meaningless.
    campaign_id: Mapped[str] = mapped_column(
        String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The canonical, product-owned discovered listing the packet targets. Nullable
    # + SET NULL so a listing purge never orphans or deletes the owner's packet; the
    # service always populates it at creation.
    listing_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("discovered_listings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The tailored CV variant (R12 CV Studio) the packet references. Its diffs were
    # already accepted under D-073 when the variant was created; the packet only
    # references it. NULL surfaces as an unresolved question rather than a copy.
    cv_variant_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("cv_variants.id", ondelete="SET NULL"), nullable=True
    )
    # The generated drafts (optional cover letter + screening-answer drafts) live in
    # this ToolRun's ``result_payload``, produced through the shared pipeline. The
    # packet references the run; it never copies the draft text.
    drafts_run_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("tool_runs.id", ondelete="SET NULL"), nullable=True
    )
    # Derived, non-material structures the packet owns (D-093 lists these as part of
    # the packet, not as copies of CV/cover/listing content).
    # The Application Quality Reviewer pass (R13, #168) run against this packet's
    # projected materials. Findings live in that ToolRun's ``result_payload`` — the
    # packet surfaces them BY REFERENCE (D-093), never copying finding text. Nullable
    # + SET NULL so purging the run never orphans the packet.
    review_run_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("tool_runs.id", ondelete="SET NULL"), nullable=True
    )
    match_rationale: Mapped[dict] = mapped_column(JSON, nullable=False)
    unresolved_questions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="prepared")
    # Trust-chain gate outcome (D-097). Only ``passed`` is queue-eligible; a packet
    # with an unresolved fabrication finding stays ``blocked`` and never queues.
    gate_state: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # The owner's review decision (R15 #183). ``pending`` until the owner acts on the
    # queue review surface; accept is guarded and snapshot-backed (D-095/D-096).
    decision: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    estimated_cost_usd: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    campaign = relationship("Workspace", foreign_keys=[campaign_id])
    listing = relationship("DiscoveredListing", foreign_keys=[listing_id])
    cv_variant = relationship("CvVariant", foreign_keys=[cv_variant_id])
    drafts_run = relationship("ToolRun", foreign_keys=[drafts_run_id])
    review_run = relationship("ToolRun", foreign_keys=[review_run_id])
