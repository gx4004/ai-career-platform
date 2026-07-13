from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Mirrored by frontend/src/lib/api/packetSchemas.ts. A packet is a reference-only
# composition (D-093, ADR 0009): the *_id fields are foreign keys, never inlined
# content. ``match_rationale`` and ``unresolved_questions`` are the two derived,
# non-material structures the packet owns.

PacketStatus = Literal["prepared", "blocked"]
UnresolvedQuestionCategory = Literal[
    "missing_material",
    "work_authorization",
    "compensation",
    "relocation",
    "demographic_or_eligibility",
]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
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


# ── Owner-facing packet state ──


class ApplicationPacketItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    # References only — dereference these to reach material content (D-093).
    campaign_id: str
    listing_id: str | None
    cv_variant_id: str | None
    drafts_run_id: str | None
    status: PacketStatus
    match_rationale: PacketMatchRationale
    unresolved_questions: list[UnresolvedQuestion]
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
    reason: Literal["no_rules_defined", "ready"]
    prepared_count: int = Field(ge=0)
    skipped_existing_count: int = Field(ge=0)
    excluded_by_volume_cap: int = Field(ge=0)
    excluded_by_cost_ceiling: int = Field(ge=0)
    volume_cap: int = Field(ge=0)
    cost_ceiling_usd: float = Field(ge=0)
    estimated_packet_cost_usd: float = Field(ge=0)
    estimated_total_cost_usd: float = Field(ge=0)
    packets: list[ApplicationPacketItem]


# ── Export (owner's own data, machine-readable) ──


class ApplicationPacketsExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    packets: list[ApplicationPacketItem]
