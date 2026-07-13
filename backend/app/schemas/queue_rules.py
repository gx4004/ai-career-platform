from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Mirrors app.models.queue_rule.QUEUE_RULE_TYPES. The keyword dimensions carry a
# keyword list; ``quality_threshold`` carries a minimum recommendation score.
KeywordRuleType = Literal["role", "location", "compensation", "work_authorization"]
QueueRuleType = Literal[
    "role", "location", "compensation", "work_authorization", "quality_threshold"
]
_KEYWORD_RULE_TYPES = frozenset(("role", "location", "compensation", "work_authorization"))


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


# ── Write payloads (owner-supplied) ──


class QueueRuleUpsert(BaseModel):
    """One filter a job must pass. Upserted per dimension (unique per owner)."""

    model_config = ConfigDict(extra="forbid")

    rule_type: QueueRuleType
    keywords: list[str] | None = Field(default=None)
    min_score: int | None = Field(default=None, ge=0, le=100)

    @field_validator("keywords")
    @classmethod
    def normalize_keywords(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned: list[str] = []
        for raw in value:
            token = raw.strip()
            if not token:
                continue
            if len(token) > 80:
                raise ValueError("each keyword must be at most 80 characters")
            if token.casefold() not in {existing.casefold() for existing in cleaned}:
                cleaned.append(token)
        return cleaned

    @model_validator(mode="after")
    def check_dimension_shape(self):
        if self.rule_type in _KEYWORD_RULE_TYPES:
            if not self.keywords:
                raise ValueError(f"{self.rule_type} rule requires at least one keyword")
            if len(self.keywords) > 20:
                raise ValueError("a rule may carry at most 20 keywords")
            if self.min_score is not None:
                raise ValueError(f"{self.rule_type} rule must not set min_score")
        else:  # quality_threshold
            if self.min_score is None:
                raise ValueError("quality_threshold rule requires min_score")
            if self.keywords:
                raise ValueError("quality_threshold rule must not set keywords")
        return self


class QueueSettingsUpsert(BaseModel):
    """Owner-supplied volume cap and cost ceiling for the queue."""

    model_config = ConfigDict(extra="forbid")

    max_packets_per_run: int = Field(ge=1, le=1000)
    cost_ceiling_usd: float = Field(gt=0, le=1_000_000)


# ── Owner-facing state ──


class QueueRuleItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: str
    rule_type: QueueRuleType
    keywords: list[str] | None
    min_score: int | None
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        return _as_utc(value)


class QueueRuleList(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[QueueRuleItem]


class QueueSettingsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_packets_per_run: int = Field(ge=1)
    cost_ceiling_usd: float = Field(gt=0)
    # The projected preparation cost per packet used by the cost-ceiling enforcer,
    # exposed so the limit and its unit are transparent to the user.
    estimated_packet_cost_usd: float = Field(ge=0)
    is_default: bool


# ── Candidate filtering preview (server-side enforcement made visible) ──


class QueueCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str
    title: str
    company: str
    score: int = Field(ge=0, le=100)
    estimated_cost_usd: float = Field(ge=0)


class QueuePreview(BaseModel):
    """The candidate listings that survive every rule, cap, and ceiling.

    ``prepares`` is False (and ``candidates`` empty) when no rules are defined —
    with no rules the queue prepares nothing (R15 #180). The cap/ceiling counters
    make the server-side enforcement visible to the user.
    """

    model_config = ConfigDict(extra="forbid")

    prepares: bool
    reason: Literal["no_rules_defined", "ready"]
    evaluated_count: int = Field(ge=0)
    passed_rules_count: int = Field(ge=0)
    prepared_count: int = Field(ge=0)
    excluded_by_volume_cap: int = Field(ge=0)
    excluded_by_cost_ceiling: int = Field(ge=0)
    volume_cap: int = Field(ge=0)
    cost_ceiling_usd: float = Field(ge=0)
    estimated_packet_cost_usd: float = Field(ge=0)
    estimated_total_cost_usd: float = Field(ge=0)
    candidates: list[QueueCandidate]


# ── Export (owner's own data, machine-readable) ──


class QueueRulesExport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rules: list[QueueRuleItem]
    settings: QueueSettingsResponse | None
