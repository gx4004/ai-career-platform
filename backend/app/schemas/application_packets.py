from datetime import UTC, datetime
from typing import Literal

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
)

from app.services.stop_classifier import StopCategory

# Mirrored by frontend/src/lib/api/packetSchemas.ts. A packet is a reference-only
# composition (D-093, ADR 0009): the *_id fields are foreign keys, never inlined
# content. ``match_rationale`` and ``unresolved_questions`` are the two derived,
# non-material structures the packet owns.

PacketStatus = Literal["prepared", "blocked"]
# The trust-chain gate outcome (R15 #184, D-097). Only ``passed`` is queue-eligible.
PacketGateState = Literal["pending", "passed", "blocked"]
# The owner's review decision on the packet (R15 #183). ``accepted`` is guarded by the
# approval predicate (D-095): a packet with any unresolved question is not approvable.
PacketDecision = Literal["pending", "accepted", "skipped", "rejected"]
# One authoritative category set: the exhaustive stop categories owned by the
# server-side classifier (D-095, #182), plus ``missing_material`` for the non-stop
# "no CV variant selected" question. The classifier's ``StopCategory`` is imported
# rather than re-listed, so the schema contract and the classifier never drift.
UnresolvedQuestionCategory = StopCategory | Literal["missing_material"]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


_HTTP_URL_ADAPTER = TypeAdapter(AnyHttpUrl)


def safe_https_destination(value: str | None) -> str | None:
    """Mirror the frontend handoff contract: HTTPS origin, never URL credentials."""
    if value is None:
        return None
    try:
        parsed = _HTTP_URL_ADAPTER.validate_python(value)
    except ValidationError as exc:
        raise ValueError("destination_url must be a valid HTTPS URL") from exc
    if parsed.scheme != "https" or not parsed.host or parsed.username or parsed.password:
        raise ValueError("destination_url must be an HTTPS URL without credentials")
    return value


# ── Deterministic match rationale ──


class PacketMatchSignal(BaseModel):
    """One deterministic signal behind the match, mirrored from the ranker.

    Traceable to concrete inputs: the ``matched_keywords`` that fired and the
    confirmed ``evidence_item_ids`` that produced them, each with its own
    component ``score`` (R14 recommendation rationale).
    """

    model_config = ConfigDict(extra="forbid")

    kind: Literal["confirmed_evidence", "preference"]
    label: str
    matched_keywords: list[str]
    evidence_item_ids: list[str]
    score: int = Field(ge=0, le=100)


class PacketMatchedRule(BaseModel):
    """A user queue rule the listing passed — the deterministic gate signal."""

    model_config = ConfigDict(extra="forbid")

    rule_type: Literal[
        "role", "location", "compensation", "work_authorization", "quality_threshold"
    ]
    matched_keywords: list[str] = Field(default_factory=list)
    min_score: int | None = Field(default=None, ge=0, le=100)


class PacketMatchRationale(BaseModel):
    """Why this listing became a packet — sourced only from deterministic signals.

    No free LLM prose: ``composite_score`` and ``signals`` come from the R14
    ranker, ``matched_rules`` from the R15 queue rules the listing passed.
    """

    model_config = ConfigDict(extra="forbid")

    composite_score: int = Field(ge=0, le=100)
    signals: list[PacketMatchSignal]
    matched_rules: list[PacketMatchedRule]


class UnresolvedQuestion(BaseModel):
    """A question only explicit user input can resolve; blocks approval (ADR 0009).

    Computed and attached explicitly — never silently dropped. The exhaustive
    mandatory-stop classification is #182; this ticket populates what it can
    determine and provides the durable attachment structure.
    """

    model_config = ConfigDict(extra="forbid")

    field: str
    category: UnresolvedQuestionCategory
    question: str


class PacketSubmissionStopNotice(BaseModel):
    """Display-ready terminal handoff attached to an owner queue packet."""

    model_config = ConfigDict(extra="forbid")

    stop_event_id: str
    reason: Literal[
        "challenge",
        "authentication_required",
        "uncertainty",
        "compatibility_mismatch",
        "source_validation_rejected",
    ]
    explanation: str
    destination_url: str
    instructions: str
    stopped_at: datetime

    @field_validator("destination_url")
    @classmethod
    def validate_destination_url(cls, value: str) -> str:
        validated = safe_https_destination(value)
        if validated is None:
            raise ValueError("destination_url is required")
        return validated

    @field_validator("stopped_at")
    @classmethod
    def normalize_stopped_at(cls, value: datetime) -> datetime:
        return _as_utc(value)


# ── Owner-facing packet state ──


class ApplicationPacketItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    # References only — dereference these to reach material content (D-093).
    campaign_id: str
    listing_id: str | None
    listing_attribution_id: str | None = None
    cv_variant_id: str | None
    drafts_run_id: str | None
    # The reviewer pass whose findings the packet surfaces by-reference (D-093).
    review_run_id: str | None = None
    status: PacketStatus
    # Trust-chain gate outcome (D-097). ``passed`` is the only queue-eligible state.
    gate_state: PacketGateState = "pending"
    # The owner's review decision (R15 #183). ``pending`` until acted on; ``accepted``
    # is only reachable when the packet is approvable (D-095).
    decision: PacketDecision = "pending"
    match_rationale: PacketMatchRationale
    unresolved_questions: list[UnresolvedQuestion]
    submission_stop: PacketSubmissionStopNotice | None = None
    estimated_cost_usd: float = Field(ge=0)
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        return _as_utc(value)

    @field_validator("estimated_cost_usd", mode="before")
    @classmethod
    def coerce_cost(cls, value: object) -> float:
        return round(float(value), 4)  # type: ignore[arg-type]


class ApplicationPacketList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ApplicationPacketItem]


class PacketPreparationResult(BaseModel):
    """The outcome of one preparation run — cap/ceiling enforcement made visible.

    ``prepares`` is False with ``reason="no_rules_defined"`` when the owner has no
    rules (D-094: no rules, no queue). Counters mirror the queue preview so the
    server-side caps and ceiling are transparent.
    """

    model_config = ConfigDict(extra="forbid")

    prepares: bool
    reason: Literal["no_rules_defined", "ready", "halted"]
    prepared_count: int = Field(ge=0)
    skipped_existing_count: int = Field(ge=0)
    excluded_by_volume_cap: int = Field(ge=0)
    excluded_by_cost_ceiling: int = Field(ge=0)
    volume_cap: int = Field(ge=0)
    cost_ceiling_usd: float = Field(ge=0)
    estimated_packet_cost_usd: float = Field(ge=0)
    estimated_total_cost_usd: float = Field(ge=0)
    packets: list[ApplicationPacketItem]


# ── Queue review controls (R15 #183) ──


class QueueReviewState(BaseModel):
    """Whether preparation is currently halted, and why (R15 #183).

    ``paused`` is the owner-initiated global pause toggle — while set, preparation
    refuses immediately (ADR 0009). ``preparation_halted`` reflects a pipeline-wide
    regression halt (#184). Either one makes :func:`prepare_packets` refuse; the UI
    surfaces the pause toggle from ``paused`` and can distinguish a regression halt.
    """

    model_config = ConfigDict(extra="forbid")

    paused: bool
    preparation_halted: bool


# ── Stop answers (owner-scoped; the only way to resolve a stop, D-095) ──


class StopAnswerRequest(BaseModel):
    """The owner's typed answer to one mandatory-stop question on a packet.

    ``field`` names the outstanding stop question (a stop-category name); ``answer``
    is the user's own words. Only stop categories are answerable here — a non-stop
    ``missing_material`` question is resolved by selecting a CV, not by an answer.
    """

    model_config = ConfigDict(extra="forbid")

    field: str = Field(min_length=1, max_length=64)
    answer: str = Field(min_length=1, max_length=4000)


class StopAnswerResult(BaseModel):
    """Outcome of storing a stop answer: what remains and whether approval is unlocked."""

    model_config = ConfigDict(extra="forbid")

    packet_id: str
    resolved_field: str
    remaining_unresolved: int = Field(ge=0)
    approvable: bool
    unresolved_questions: list[UnresolvedQuestion]


class StopAnswerExportItem(BaseModel):
    """One stored stop answer in the owner's own data export (D-099 export path)."""

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    packet_id: str
    field: str
    category: str
    answer: str
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def normalize_ts(cls, value: datetime) -> datetime:
        return _as_utc(value)


class PacketStopAnswersExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stop_answers: list[StopAnswerExportItem]


# ── Immutable approval snapshot + manual destination handoff (R15 #185) ──


class FrozenListingAttribution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source_id: str
    source_listing_key: str
    source_url: str
    retrieved_at: datetime


class FrozenManualHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str | None
    attribution_id: str
    source_id: str
    source_listing_key: str
    source_url: str
    retrieved_at: datetime


class FrozenPacketListing(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    content_sha256: str
    title: str
    company: str
    description: str
    attributions: list[FrozenListingAttribution]


class FrozenPacketCvVariant(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    document_id: str
    name: str
    target_role: str | None
    sections: list[dict]


class FrozenStopAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str
    category: str
    answer: str


class PacketApprovalSnapshotContent(BaseModel):
    """Strictly versioned by-value content frozen at the approval boundary."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["packet-approval/v1"]
    packet_id: str
    campaign_id: str
    listing_id: str | None
    frozen_at: datetime
    match_rationale: PacketMatchRationale
    unresolved_questions: list[UnresolvedQuestion]
    # Early packet-approval/v1 rows predate the explicit field but could only be
    # created after the same server gate passed; absence therefore means empty.
    unsupported_claims: list[dict] = Field(default_factory=list)
    resolved_stop_answers: list[FrozenStopAnswer]
    listing: FrozenPacketListing | None
    manual_handoff: FrozenManualHandoff | None
    cv_variant: FrozenPacketCvVariant | None
    drafts: dict | None


class PacketApprovalSnapshotResponse(BaseModel):
    """The exact by-value packet content frozen at owner approval (D-096)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    packet_id: str
    campaign_id: str
    listing_id: str | None
    role_key: str
    destination_url: str | None
    content: dict
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize_created_at(cls, value: datetime) -> datetime:
        return _as_utc(value)

    @field_validator("destination_url")
    @classmethod
    def validate_destination_url(cls, value: str | None) -> str | None:
        return safe_https_destination(value)

    @field_validator("content", mode="before")
    @classmethod
    def validate_content(cls, value: object) -> dict:
        PacketApprovalSnapshotContent.model_validate(value)
        if not isinstance(value, dict):
            raise ValueError("content must be an object")
        # Validation must not reserialize the signed bytes (for example +00:00 to
        # Z); callers receive the exact JSON object whose canonical hash is stored.
        return value


class PacketSubmissionHandoff(BaseModel):
    """The official page the owner opens; the product performs no submission."""

    model_config = ConfigDict(extra="forbid")

    destination_url: str | None
    instructions: str

    @field_validator("destination_url")
    @classmethod
    def validate_destination_url(cls, value: str | None) -> str | None:
        return safe_https_destination(value)


class PacketApprovalPreview(BaseModel):
    """Exact current materials the owner must inspect before approval."""

    model_config = ConfigDict(extra="forbid")

    content: dict
    destination_url: str | None
    material_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("content", mode="before")
    @classmethod
    def validate_content(cls, value: object) -> dict:
        PacketApprovalSnapshotContent.model_validate(value)
        if not isinstance(value, dict):
            raise ValueError("content must be an object")
        return value

    @field_validator("destination_url")
    @classmethod
    def validate_destination_url(cls, value: str | None) -> str | None:
        return safe_https_destination(value)


class PacketApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_material_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class PacketApprovalResult(BaseModel):
    """Guarded approval result: decision, immutable snapshot, and manual handoff."""

    model_config = ConfigDict(extra="forbid")

    packet: ApplicationPacketItem
    snapshot: PacketApprovalSnapshotResponse
    handoff: PacketSubmissionHandoff


class PacketApprovalSnapshotsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    snapshots: list[PacketApprovalSnapshotResponse]


# ── Export (owner's own data, machine-readable) ──


class ApplicationPacketsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    packets: list[ApplicationPacketItem]
