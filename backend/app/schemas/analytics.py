from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.development import DevelopmentResponseKind, DevelopmentState
from app.schemas.evidence_profile import (
    ConfirmationState,
    EvidenceKind,
    EvidenceProvenance,
)
from app.schemas.gap_classification import GapKind
from app.schemas.telemetry import (
    AccessMode,
    ExportFormat,
    FailureCategory,
    SessionStatus,
    TelemetryEventName,
    TelemetryLevel,
    ToolId,
)

# ── R10 operational-event allowlist (issue #136, parent #135, D-053) ──
# The R10 scaling-trigger scorecard extends the same first-party operational
# path R6 already owns. These are backend-generated, low-cardinality dimensions
# emitted at authoritative backend boundaries (cache lookup, provider incident,
# job import). Like every other dimension in this file they are constrained to a
# closed Literal set, so `extra="forbid"` on the write seam rejects raw
# resume/JD/generated content, full URLs/hostnames, provider exception messages,
# cache keys, SQL parameters, email/IP, and stable user/run/workspace IDs.

# Backend-only R10 event names. Kept separate from the frontend telemetry
# taxonomy (`TelemetryEventName`) because no client may emit these — they are
# written only by the server at the boundary that observes the outcome.
R10EventName = Literal[
    "r10_cache_outcome",
    "r10_provider_incident",
    "r10_import_outcome",
    "r10_rate_limit_event",
    "r10_generation_phase",
    "r10_database_query",
]

# Cache lookup/write outcome at the shared tool-pipeline seam (ADR 0004). No
# cache key or payload ever crosses the boundary — only the outcome class.
CacheOutcome = Literal["hit", "miss", "write", "failure"]

# Provider incident category (D-055). One event is emitted per user-visible
# provider failure — internal retries are collapsed into a single incident, not
# counted separately — and only the category crosses the boundary, never the
# raw provider exception message.
ProviderIncidentCategory = Literal[
    "timeout",
    "quota",
    "unavailable",
    "permission",
    "malformed",
]

# Allowlisted job-import source family (D-059). The raw hostname/path/query is
# mapped locally to one of these bounded families and then discarded before any
# analytics row is written; `other` stays one bounded catch-all category.
ImportSourceFamily = Literal[
    "greenhouse",
    "lever",
    "workday",
    "ashby",
    "smartrecruiters",
    "other",
]

# Job-import attempt outcome. `success` = first-tier HTTP fetch, `fallback` =
# the bounded Playwright fallback produced the result, `failure` = neither tier
# yielded a usable posting and the user gets the paste fallback.
ImportOutcome = Literal["success", "fallback", "failure"]

# A rate-limit event retains only a stable route family and whether the limited
# identity was an authenticated account or a guest. Raw paths, IPs, account IDs,
# tokens, limiter keys, and exception details have no accepted field.
RateLimitRouteFamily = Literal[
    "auth",
    "tools",
    "imports",
    "history",
    "profile",
    "cv_studio",
    "campaigns",
    "discovery",
    "queue",
    "submission",
    "admin",
    "telemetry",
    "other",
]
RateLimitIdentityType = Literal["account", "guest"]
GenerationPhase = Literal["preparation", "generation", "persistence"]
DatabaseQueryFamily = Literal["history_list", "workspace_list", "admin_runs"]

# R14 source-registry events never carry a source key/name. The family and
# governance transition are the only bounded dimensions that cross telemetry.
DiscoverySourceFamily = Literal["licensed", "employer_ats", "public_career_page", "user_provided"]
DiscoveryRegistryOutcome = Literal[
    "registered",
    "terms_updated",
    "governance_updated",
    "kill_switch_enabled",
    "kill_switch_disabled",
]
DiscoveryFetchOutcome = Literal["blocked"]
# R14 #177 per-source health flow outcomes. Only the outcome class rides on the
# event; the source family rides on `operational_dimension`. No listing content,
# listing id, full URL, or user data is ever attached.
DiscoveryIngestOutcome = Literal["ingested", "deduplicated"]
DiscoveryExpiryOutcome = Literal["expired"]
# R14 #175 personalization outcome classes. Only the outcome class rides on the
# event; the source family (when known) rides on `operational_dimension`. No
# listing content, listing id, run id, or reporter identity is ever attached.
DiscoveryPersonalizationOutcome = Literal[
    "source_hidden",
    "source_unhidden",
    "recommendation_dismissed",
    "recommendation_undismissed",
    "recommendation_reported",
]
# R14 #176 adoption outcome class. Only the outcome class rides on the event; the
# adopted listing's source family rides on `operational_dimension`. No listing
# content, listing id, campaign id, or run id is ever attached.
DiscoveryAdoptionOutcome = Literal["adopted"]
# R16 #189 submission-source governance reuses the source-family dimension and
# exposes only the promotion/kill transition. No source key, contract fields,
# reviewer identity, endpoint, or legal-review content enters telemetry.
SubmissionSourceGovernanceOutcome = Literal[
    "promoted",
    "demoted",
    "kill_switch_enabled",
    "kill_switch_disabled",
    "compatible",
    "broken",
]
SubmissionSafetyOutcome = Literal[
    "anomaly_detected",
    "kill_switch_enabled",
    "kill_switch_disabled",
    "rehearsal_recorded",
]
SubmissionQualityOutcome = Literal[
    "confirmed",
    "response_received",
    "packet_edited",
    "duplicate_prevented",
    "complaint_reported",
]

# R15 #184 packet-queue trust-chain gate. Backend-generated at the preparation
# seam. Only the bounded gate outcome class rides on `operational_outcome`; for a
# pipeline halt the bounded regression reason rides on `operational_dimension`. No
# packet content, listing text/id, campaign id, run id, finding text, or user
# identifier is ever attached — `extra="forbid"` rejects any such field (D-097).
#   - `running` — a preparation run started the gate.
#   - `passed`  — a packet cleared the reviewer with zero unresolved fabrication
#                 findings (the only queue-eligible outcome).
#   - `blocked` — a packet carried an unresolved fabrication finding and is not queued.
#   - `halted`  — preparation halted pipeline-wide on a failing regression eval.
#   - `cleared` — a prior pipeline-wide halt was cleared and preparation resumes.
PacketGateOutcome = Literal["running", "passed", "blocked", "halted", "cleared"]
# The bounded regression category that triggers/annotates a pipeline halt.
PacketGateHaltReason = Literal["fabrication_regression", "packet_quality_regression"]

# The two reused generic operational columns. `operational_dimension` holds the
# primary category/family for an event (provider incident category or import
# source family); `operational_outcome` holds the outcome class (cache outcome
# or import outcome). Which axis a value belongs to is unambiguous from
# `event_name`, so aggregation never has to disambiguate a bare string.
OperationalDimension = (
    ProviderIncidentCategory
    | ImportSourceFamily
    | RateLimitRouteFamily
    | GenerationPhase
    | DatabaseQueryFamily
    | DiscoverySourceFamily
    | PacketGateHaltReason
)
OperationalOutcome = (
    CacheOutcome
    | ImportOutcome
    | DiscoveryRegistryOutcome
    | DiscoveryFetchOutcome
    | DiscoveryIngestOutcome
    | DiscoveryExpiryOutcome
    | DiscoveryPersonalizationOutcome
    | DiscoveryAdoptionOutcome
    | SubmissionSourceGovernanceOutcome
    | SubmissionSafetyOutcome
    | SubmissionQualityOutcome
    | PacketGateOutcome
    | RateLimitIdentityType
)

# ── R11 profile-adoption allowlist (issue #150, parent #143, D-067) ──
# The Evidence Profile extends the SAME first-party analytics path — no new
# vendor. Profile events are backend-generated at the profile service seam where
# items are created or transition state, and carry only these three closed-set,
# low-cardinality dimensions plus bounded aggregate counts (never evidence text,
# employer/institution names, or stable content identifiers, D-067):
#   - `evidence_kind`  — the typed item kind (reused `EvidenceKind`, 8 values)
#   - `evidence_provenance` — provenance class (imported/inferred/user-entered)
#   - `confirmation_transition` — the resulting confirmation state of a
#     create/edit/confirm/reject transition (null on deletion)
# Because `ActivationEventCreate` sets `extra="forbid"`, any attempt to attach an
# item's `content`, `statement`, employer, or free text is rejected before a row
# is written — exactly like every other dimension in this file.
ProfileEventName = Literal[
    "profile_item_created",
    "profile_item_updated",
    "profile_item_confirmed",
    "profile_item_rejected",
    "profile_item_deleted",
]

StudioEventName = Literal[
    "studio_document_created",
    "studio_document_updated",
    "studio_document_deleted",
    "studio_documents_deleted",
    "studio_data_exported",
    "studio_quality_checked",
    "studio_tailoring_generated",
]

DiscoveryEventName = Literal[
    "discovery_source_registry_changed",
    "discovery_source_fetch_outcome",
    "discovery_source_ingest_outcome",
    "discovery_source_expiry",
    "discovery_source_kill_switch",
    "discovery_personalization_changed",
    "discovery_recommendation_adopted",
]

SubmissionSourceGovernanceEventName = Literal[
    "submission_source_promotion_changed",
    "submission_source_kill_switch",
    "submission_contract_checked",
]
_SUBMISSION_SOURCE_EVENT_OUTCOMES = {
    "submission_source_promotion_changed": frozenset({"promoted", "demoted"}),
    "submission_source_kill_switch": frozenset({"kill_switch_enabled", "kill_switch_disabled"}),
    "submission_contract_checked": frozenset({"compatible", "broken"}),
}
_SUBMISSION_SOURCE_EXCLUSIVE_OUTCOMES = frozenset(
    {"promoted", "demoted", "compatible", "broken"}
)

SubmissionSafetyEventName = Literal[
    "submission_safety_anomaly",
    "submission_global_kill_switch",
    "submission_incident_rehearsal",
]
_SUBMISSION_SAFETY_EVENT_OUTCOMES = {
    "submission_safety_anomaly": frozenset({"anomaly_detected"}),
    "submission_global_kill_switch": frozenset({"kill_switch_enabled", "kill_switch_disabled"}),
    "submission_incident_rehearsal": frozenset({"rehearsal_recorded"}),
}
_SUBMISSION_SAFETY_EXCLUSIVE_OUTCOMES = frozenset({"anomaly_detected", "rehearsal_recorded"})

SubmissionQualityEventName = Literal["submission_quality_outcome"]
_SUBMISSION_QUALITY_OUTCOMES = frozenset(
    {
        "confirmed",
        "response_received",
        "packet_edited",
        "duplicate_prevented",
        "complaint_reported",
    }
)

# R15 #184 packet-queue trust-chain gate events (D-097). Backend-only, emitted at
# the preparation seam; both carry only bounded operational dimensions.
#   - `packet_queue_gate`       — per-packet + per-run gate outcome
#     (running/passed/blocked).
#   - `packet_preparation_halt` — pipeline-wide halt/clear on a regression eval.
PacketGateEventName = Literal["packet_queue_gate", "packet_preparation_halt"]

# R17 #202 development-loop lifecycle events. Backend-generated at the bounded
# development-item write seams; the only allowed dimensions are the four gap
# kinds, four honest response kinds, and three states (D-114).
DevelopmentLoopEventName = Literal[
    "development_item_created",
    "development_item_state_changed",
    "development_item_deleted",
]
_DEVELOPMENT_LOOP_EVENT_NAMES = frozenset(
    {
        "development_item_created",
        "development_item_state_changed",
        "development_item_deleted",
    }
)

# Activation-event names accepted by the durable write seam. This is the union
# of every event name already firing today: the frontend-telemetry taxonomy
# (`TelemetryEventName`) plus the backend-only tool-run outcome event, which the
# server logs as `tool_run_completed` (the frontend's client-observed twin is
# `tool_run_succeeded`), plus the backend-only R10 operational events (#136) and
# the backend-only R11 profile-adoption events (#150).
ActivationEventName = (
    TelemetryEventName
    | Literal["tool_run_completed"]
    | R10EventName
    | ProfileEventName
    | StudioEventName
    | DiscoveryEventName
    | SubmissionSourceGovernanceEventName
    | SubmissionSafetyEventName
    | SubmissionQualityEventName
    | PacketGateEventName
    | DevelopmentLoopEventName
)


class ActivationEventCreate(BaseModel):
    """Allowlist gate for the single activation-event write seam (D-037).

    Mirrors the frontend telemetry ingestion discipline: `extra="forbid"` so any
    disallowed or free-text field (resume/JD/generated content, email, stack
    traces, raw log lines) is rejected exactly the way the ingestion endpoint
    already rejects unknown fields. Adds the two backend-computed operational
    metrics — `duration_ms` and `cost_estimate` — which no client reports, and
    the two low-cardinality R10 operational dimensions (`operational_dimension`,
    `operational_outcome`) that carry scaling-trigger evidence (#136, D-053).
    """

    model_config = ConfigDict(extra="forbid")

    event_name: ActivationEventName
    level: TelemetryLevel = "info"
    tool_id: ToolId | None = None
    access_mode: AccessMode | None = None
    saved: bool | None = None
    failure_category: FailureCategory | None = None
    export_format: ExportFormat | None = None
    has_feedback: bool | None = None
    session_status: SessionStatus | None = None
    duration_ms: int | None = None
    cost_estimate: Decimal | None = None
    operational_dimension: OperationalDimension | None = None
    operational_outcome: OperationalOutcome | None = None
    # R11 profile-adoption dimensions (#150, D-067). Null for every non-profile
    # event; each constrained to a closed Literal set so no evidence content can
    # ever ride along.
    evidence_kind: EvidenceKind | None = None
    evidence_provenance: EvidenceProvenance | None = None
    confirmation_transition: ConfirmationState | None = None
    # R17 loop-adoption dimensions (#202, D-114). The model has no field for
    # gap descriptions, notes, recommendation content, user IDs, or item IDs;
    # `extra="forbid"` rejects any attempt to attach them.
    development_gap_kind: GapKind | None = None
    development_response_kind: DevelopmentResponseKind | None = None
    development_state_from: DevelopmentState | None = None
    development_state_to: DevelopmentState | None = None
    occurred_at: datetime | None = None

    @model_validator(mode="after")
    def validate_rate_limit_event_shape(self):
        route_families = {
            "auth", "tools", "imports", "history", "profile", "cv_studio",
            "campaigns", "discovery", "queue", "submission", "admin",
            "telemetry", "other",
        }
        if self.event_name != "r10_rate_limit_event":
            if self.operational_outcome in {"account", "guest"}:
                raise ValueError("rate-limit dimensions are valid only for rate-limit events")
            return self
        if (
            self.operational_dimension not in route_families
            or self.operational_outcome not in {"account", "guest"}
        ):
            raise ValueError("rate-limit events require route family and identity type")
        unrelated_values = (
            self.tool_id,
            self.access_mode,
            self.saved,
            self.failure_category,
            self.export_format,
            self.has_feedback,
            self.session_status,
            self.duration_ms,
            self.cost_estimate,
            self.evidence_kind,
            self.evidence_provenance,
            self.confirmation_transition,
            self.development_gap_kind,
            self.development_response_kind,
            self.development_state_from,
            self.development_state_to,
            self.occurred_at,
        )
        if any(value is not None for value in unrelated_values) or self.level != "info":
            raise ValueError("rate-limit events accept only route family and identity type")
        return self

    @model_validator(mode="after")
    def validate_generation_phase_shape(self):
        phases = {"preparation", "generation", "persistence"}
        if self.event_name != "r10_generation_phase":
            return self
        if (
            self.operational_dimension not in phases
            or self.operational_outcome is not None
            or self.tool_id is None
            or self.access_mode is None
            or self.duration_ms is None
        ):
            raise ValueError("generation phases require phase, tool, access mode, and duration")
        unrelated_values = (
            self.saved,
            self.failure_category,
            self.export_format,
            self.has_feedback,
            self.session_status,
            self.cost_estimate,
            self.evidence_kind,
            self.evidence_provenance,
            self.confirmation_transition,
            self.development_gap_kind,
            self.development_response_kind,
            self.development_state_from,
            self.development_state_to,
            self.occurred_at,
        )
        if any(value is not None for value in unrelated_values) or self.level != "info":
            raise ValueError("generation phases accept only bounded phase timing fields")
        return self

    @model_validator(mode="after")
    def validate_database_query_shape(self):
        query_families = {"history_list", "workspace_list", "admin_runs"}
        if self.event_name != "r10_database_query":
            return self
        if (
            self.operational_dimension not in query_families
            or self.operational_outcome is not None
            or self.duration_ms is None
        ):
            raise ValueError("database query events require family and duration")
        unrelated_values = (
            self.tool_id,
            self.access_mode,
            self.saved,
            self.failure_category,
            self.export_format,
            self.has_feedback,
            self.session_status,
            self.cost_estimate,
            self.evidence_kind,
            self.evidence_provenance,
            self.confirmation_transition,
            self.development_gap_kind,
            self.development_response_kind,
            self.development_state_from,
            self.development_state_to,
            self.occurred_at,
        )
        if any(value is not None for value in unrelated_values) or self.level != "info":
            raise ValueError("database query events accept only family and duration")
        return self

    @model_validator(mode="after")
    def validate_development_event_shape(self):
        """Keep R17 dimensions on authoritative, well-formed R17 events only."""
        development_values = (
            self.development_gap_kind,
            self.development_response_kind,
            self.development_state_from,
            self.development_state_to,
        )
        if self.event_name not in _DEVELOPMENT_LOOP_EVENT_NAMES:
            if any(value is not None for value in development_values):
                raise ValueError(
                    "development dimensions are valid only for development-loop events"
                )
            return self

        unrelated_values = (
            self.tool_id,
            self.access_mode,
            self.saved,
            self.failure_category,
            self.export_format,
            self.has_feedback,
            self.session_status,
            self.duration_ms,
            self.cost_estimate,
            self.operational_dimension,
            self.operational_outcome,
            self.evidence_kind,
            self.evidence_provenance,
            self.confirmation_transition,
            self.occurred_at,
        )
        if any(value is not None for value in unrelated_values) or self.level != "info":
            raise ValueError(
                "development-loop events accept only gap, response, and state dimensions"
            )
        if self.development_gap_kind is None or self.development_response_kind is None:
            raise ValueError("development-loop events require gap and response dimensions")

        if self.event_name == "development_item_created":
            if self.development_state_from is not None or self.development_state_to != "planned":
                raise ValueError("development_item_created requires only state_to=planned")
        elif self.event_name == "development_item_state_changed":
            if (
                self.development_state_from is None
                or self.development_state_to is None
                or self.development_state_from == self.development_state_to
            ):
                raise ValueError("development_item_state_changed requires distinct from/to states")
        elif self.development_state_from is None or self.development_state_to is not None:
            raise ValueError("development_item_deleted requires only the prior state")
        return self

    @model_validator(mode="after")
    def validate_submission_source_event_shape(self):
        """Bind #189 promotion/kill outcomes to their authoritative event names."""
        allowed_outcomes = _SUBMISSION_SOURCE_EVENT_OUTCOMES.get(self.event_name)
        if allowed_outcomes is None:
            # Kill-switch outcomes predate R16 and are intentionally shared with
            # the R14 source-kill event; promotion outcomes are R16-exclusive.
            if self.operational_outcome in _SUBMISSION_SOURCE_EXCLUSIVE_OUTCOMES:
                raise ValueError(
                    "submission-source outcomes are valid only for submission-source events"
                )
            return self
        if (
            self.operational_dimension
            not in {"licensed", "employer_ats", "public_career_page", "user_provided"}
            or self.operational_outcome not in allowed_outcomes
        ):
            raise ValueError(
                "submission-source events require a source family and matching outcome"
            )
        unrelated_values = (
            self.tool_id,
            self.access_mode,
            self.saved,
            self.failure_category,
            self.export_format,
            self.has_feedback,
            self.session_status,
            self.duration_ms,
            self.cost_estimate,
            self.evidence_kind,
            self.evidence_provenance,
            self.confirmation_transition,
            self.development_gap_kind,
            self.development_response_kind,
            self.development_state_from,
            self.development_state_to,
            self.occurred_at,
        )
        if any(value is not None for value in unrelated_values) or self.level != "info":
            raise ValueError("submission-source events accept only source family and outcome")
        return self

    @model_validator(mode="after")
    def validate_submission_safety_event_shape(self):
        allowed_outcomes = _SUBMISSION_SAFETY_EVENT_OUTCOMES.get(self.event_name)
        if allowed_outcomes is None:
            if self.operational_outcome in _SUBMISSION_SAFETY_EXCLUSIVE_OUTCOMES:
                raise ValueError("submission-safety outcomes are valid only for safety events")
            return self
        if self.operational_outcome not in allowed_outcomes:
            raise ValueError("submission-safety event has the wrong outcome")
        if self.event_name == "submission_safety_anomaly":
            if (
                self.operational_dimension
                not in {
                    "licensed",
                    "employer_ats",
                    "public_career_page",
                    "user_provided",
                }
                or self.level != "error"
            ):
                raise ValueError("anomaly events require source family and error level")
        elif self.operational_dimension is not None or self.level != "info":
            raise ValueError("global safety events accept only their bounded outcome")
        unrelated_values = (
            self.tool_id,
            self.access_mode,
            self.saved,
            self.failure_category,
            self.export_format,
            self.has_feedback,
            self.session_status,
            self.duration_ms,
            self.cost_estimate,
            self.evidence_kind,
            self.evidence_provenance,
            self.confirmation_transition,
            self.development_gap_kind,
            self.development_response_kind,
            self.development_state_from,
            self.development_state_to,
            self.occurred_at,
        )
        if any(value is not None for value in unrelated_values):
            raise ValueError("submission-safety events accept no content dimensions")
        return self

    @model_validator(mode="after")
    def validate_submission_quality_event_shape(self):
        if self.event_name != "submission_quality_outcome":
            if self.operational_outcome in _SUBMISSION_QUALITY_OUTCOMES:
                raise ValueError(
                    "submission-quality outcomes are valid only for quality events"
                )
            return self
        if (
            self.operational_dimension
            not in {"licensed", "employer_ats", "public_career_page", "user_provided"}
            or self.operational_outcome not in _SUBMISSION_QUALITY_OUTCOMES
        ):
            raise ValueError(
                "submission-quality events require a source family and quality outcome"
            )
        unrelated_values = (
            self.tool_id,
            self.access_mode,
            self.saved,
            self.failure_category,
            self.export_format,
            self.has_feedback,
            self.session_status,
            self.duration_ms,
            self.cost_estimate,
            self.evidence_kind,
            self.evidence_provenance,
            self.confirmation_transition,
            self.development_gap_kind,
            self.development_response_kind,
            self.development_state_from,
            self.development_state_to,
            self.occurred_at,
        )
        if any(value is not None for value in unrelated_values) or self.level != "info":
            raise ValueError("submission-quality events accept only family and outcome")
        return self
