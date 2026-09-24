from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from time import perf_counter
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.feature_gates import outcome_enabled
from app.models.user import User
from app.services.analytics import safe_record_activation_event
from app.services.evidence_injection import load_profile_for_injection
from app.services.input_sanitizer import sanitize_user_input
from app.services.llm_cost import get_llm_cost, reset_llm_cost
from app.services.observability import (
    log_tool_run_completed,
    log_tool_run_failed,
    log_tool_run_started,
)
from app.services.provider_incident import get_provider_incident, reset_provider_incident
from app.services.result_cache import compute_content_hash, get_cached_result, set_cached_result
from app.services.tool_runs import (
    build_tool_response,
    extract_linked_context_ids,
    persist_tool_run,
    require_valid_parent_run,
)


async def run_tool_pipeline(
    *,
    tool_name: str,
    service_fn: Callable[..., Awaitable[dict[str, Any]]],
    service_kwargs: dict[str, Any],
    label_fn: Callable[[dict[str, Any]], str],
    resume_text: str,
    job_description: str | None = None,
    feedback: str | None = None,
    parent_run_id: str | None = None,
    workspace_id: str | None = None,
    linked_context_ids: list[str] | None = None,
    current_user: User | None = None,
    db: Session,
    cache_extra_keys: dict[str, str] | None = None,
    require_evidence_profile: bool = False,
) -> dict[str, Any]:
    """Run one tool and durably classify every failure after run start."""
    if current_user is not None:
        # Invalid or cross-owner revision lineage is request validation, not a
        # started tool run. Keep it outside the failure telemetry boundary.
        require_valid_parent_run(
            db,
            current_user=current_user,
            tool_name=tool_name,
            parent_run_id=parent_run_id,
        )

    started_at = perf_counter()
    try:
        return await _run_tool_pipeline_after_validation(
            tool_name=tool_name,
            service_fn=service_fn,
            service_kwargs=service_kwargs,
            label_fn=label_fn,
            resume_text=resume_text,
            job_description=job_description,
            feedback=feedback,
            parent_run_id=parent_run_id,
            workspace_id=workspace_id,
            linked_context_ids=linked_context_ids,
            current_user=current_user,
            db=db,
            cache_extra_keys=cache_extra_keys,
            require_evidence_profile=require_evidence_profile,
        )
    except Exception as exc:
        access_mode = "authenticated" if current_user else "guest_demo"
        failed_duration_ms = max(0, int((perf_counter() - started_at) * 1000))
        log_tool_run_failed(
            tool_name=tool_name,
            access_mode=access_mode,
            duration_ms=failed_duration_ms,
            failure_category=exc.__class__.__name__,
        )
        # Only the closed category is durable; exception class/message stays in
        # the structured operational log. Cost reflects any completed provider
        # call and remains absent for pre-provider failures.
        safe_record_activation_event(
            db,
            event_name="tool_run_failed",
            level="error",
            tool_id=tool_name,
            access_mode=access_mode,
            duration_ms=failed_duration_ms,
            cost_estimate=get_llm_cost(),
            failure_category="tool_request_failed",
        )
        incident_category = get_provider_incident()
        if incident_category is not None:
            safe_record_activation_event(
                db,
                event_name="r10_provider_incident",
                level="error",
                tool_id=tool_name,
                access_mode=access_mode,
                operational_dimension=incident_category,
            )
        raise


async def _run_tool_pipeline_after_validation(
    *,
    tool_name: str,
    service_fn: Callable[..., Awaitable[dict[str, Any]]],
    service_kwargs: dict[str, Any],
    label_fn: Callable[[dict[str, Any]], str],
    resume_text: str,
    job_description: str | None = None,
    feedback: str | None = None,
    parent_run_id: str | None = None,
    workspace_id: str | None = None,
    linked_context_ids: list[str] | None = None,
    current_user: User | None = None,
    db: Session,
    cache_extra_keys: dict[str, str] | None = None,
    require_evidence_profile: bool = False,
) -> dict[str, Any]:
    """Shared pipeline: sanitize -> cache -> service -> fallback -> persist -> respond."""
    access_mode = "authenticated" if current_user else "guest_demo"
    linked_ids = linked_context_ids or []
    start = perf_counter()
    # Clear any prior request's LLM cost so this run's estimate only reflects
    # the provider calls it makes; stays None if none are reached (issue #106).
    reset_llm_cost()
    # Clear any prior request's provider-incident category so a failure in this
    # run is attributed to this run only (R10 #136, D-055).
    reset_provider_incident()

    log_tool_run_started(
        tool_name=tool_name,
        access_mode=access_mode,
        linked_context_count=len(linked_ids),
    )
    # Backend-only metrics are written unconditionally — no client/cookie is
    # involved, so the frontend consent gate does not apply (D-038). Only
    # allowlisted dimensions cross the seam; linked_context_count stays in the
    # stdout log above and is deliberately not persisted (not in the D-037
    # allowlist).
    safe_record_activation_event(
        db,
        event_name="tool_run_started",
        tool_id=tool_name,
        access_mode=access_mode,
    )

    # Sanitize
    sanitize_start = perf_counter()
    clean_resume = sanitize_user_input(resume_text)
    clean_jd = sanitize_user_input(job_description) if job_description else None
    clean_feedback = sanitize_user_input(feedback) if feedback else None

    # Update service_kwargs with sanitized values
    if "resume_text" in service_kwargs:
        service_kwargs["resume_text"] = clean_resume
    if "job_description" in service_kwargs:
        service_kwargs["job_description"] = clean_jd
    if "feedback" in service_kwargs:
        service_kwargs["feedback"] = clean_feedback

    _record_generation_phase(
        db,
        tool_name=tool_name,
        access_mode=access_mode,
        phase="sanitize",
        started_at=sanitize_start,
    )

    # Evidence Profile injection (R11, D-063 / ADR 0005). The shared pipeline is
    # the only seam that reads the profile — no tool router gains its own access
    # path. Authenticated-only; guests keep inline inputs and tab-scoped carry
    # (D-064). Gated by a settings flag so injection can be disabled to restore
    # today's inline-input behavior with no data loss (ADR 0005). A user with no
    # confirmed/unconfirmed items yields an empty payload, so tools behave
    # exactly as today until the user confirms evidence.
    cache_start = perf_counter()
    profile_version: str | None = None
    if (
        settings.EVIDENCE_PROFILE_INJECTION_ENABLED or require_evidence_profile
    ) and outcome_enabled("r11") and current_user is not None:
        evidence_payload, profile_version = load_profile_for_injection(db, current_user.id)
        if not evidence_payload.is_empty() and _accepts_evidence_profile(service_fn):
            service_kwargs["evidence_profile"] = evidence_payload

    # Cache check — scope by user_id so authenticated users never see another user's
    # cached result (defense-in-depth: tools are deterministic from inputs, but mixing
    # cache scopes across accounts complicates audit and personalization later).
    cached = None
    content_hash = None
    # A disabled cache is not a cache miss. Skip both the lookup/write seams and
    # their R10 outcome events so the scaling scorecard sees only real cache
    # evidence. The phase timing remains present to keep pipeline observability
    # structurally consistent across configurations.
    if settings.RESULT_CACHE_ENABLED and not clean_feedback:
        hash_kwargs: dict[str, str] = {}
        if cache_extra_keys:
            hash_kwargs.update(cache_extra_keys)
        hash_kwargs["user_scope"] = current_user.id if current_user else "guest"
        # The profile version joins the cache key so a profile edit invalidates
        # cached results (D-063, ADR 0005). Only present for authenticated users
        # while injection is enabled; guests and the disabled path are unaffected.
        if profile_version is not None:
            hash_kwargs["profile_version"] = profile_version
        content_hash = compute_content_hash(tool_name, clean_resume, clean_jd, **hash_kwargs)
        # Cache lookup stays fail-open (ADR 0004): a lookup error must degrade to
        # a normal miss, never break the run. The R10 scorecard records the
        # outcome class only — the content hash is never persisted (#136, D-054).
        try:
            cached = get_cached_result(content_hash)
        except Exception:  # noqa: BLE001 — cache is a disposable acceleration layer
            cached = None
            _record_cache_outcome(db, "failure")
        else:
            _record_cache_outcome(db, "hit" if cached is not None else "miss")

    _record_generation_phase(
        db,
        tool_name=tool_name,
        access_mode=access_mode,
        phase="cache",
        started_at=cache_start,
    )

    if cached is not None:
        result = {**cached}
    else:
        provider_start = perf_counter()
        try:
            result = await service_fn(**service_kwargs)
        except Exception:
            _record_generation_phase(
                db,
                tool_name=tool_name,
                access_mode=access_mode,
                phase="provider",
                started_at=provider_start,
            )
            raise

        _record_generation_phase(
            db,
            tool_name=tool_name,
            access_mode=access_mode,
            phase="provider",
            started_at=provider_start,
        )

        # Spec decision #7 lets Resume Analyzer and Job Match swallow a provider
        # failure and return a heuristic-only result, so a real outage reaches
        # this success path rather than the failure path below. The accumulator
        # is cleared by the LLM client whenever a retry eventually succeeds, so a
        # category surviving here means exactly one thing: this run completed on
        # a degraded answer.
        degraded_category = get_provider_incident()
        if degraded_category is not None:
            # The D-055/#138 trigger counts user-visible incidents. A silently
            # degraded scoring run is the most user-visible outcome there is.
            safe_record_activation_event(
                db,
                event_name="r10_provider_incident",
                level="error",
                tool_id=tool_name,
                access_mode=access_mode,
                operational_dimension=degraded_category,
            )

        if content_hash is not None and degraded_category is None:
            try:
                set_cached_result(content_hash, result)
            except Exception:  # noqa: BLE001 — cache write is best-effort
                _record_cache_outcome(db, "failure")
            else:
                _record_cache_outcome(db, "write")

    persistence_start = perf_counter()
    run = persist_tool_run(
        db,
        current_user=current_user,
        tool_name=tool_name,
        label=label_fn(result),
        result=result,
        linked_context_ids=extract_linked_context_ids(*linked_ids),
        workspace_id=workspace_id,
        parent_run_id=parent_run_id,
        feedback_text=clean_feedback,
    )

    _record_generation_phase(
        db,
        tool_name=tool_name,
        access_mode=access_mode,
        phase="persist",
        started_at=persistence_start,
    )

    finalize_start = perf_counter()
    response = build_tool_response(
        result,
        tool_name=tool_name,
        history_id=run.id if run else None,
        access_mode=access_mode,
    )
    completed_duration_ms = int((perf_counter() - start) * 1000)
    log_tool_run_completed(
        tool_name=tool_name,
        access_mode=access_mode,
        duration_ms=completed_duration_ms,
        saved=run is not None,
    )
    safe_record_activation_event(
        db,
        event_name="tool_run_completed",
        tool_id=tool_name,
        access_mode=access_mode,
        duration_ms=completed_duration_ms,
        cost_estimate=get_llm_cost(),
        saved=run is not None,
    )
    _record_generation_phase(
        db,
        tool_name=tool_name,
        access_mode=access_mode,
        phase="finalize",
        started_at=finalize_start,
    )

    return response


def _accepts_evidence_profile(fn: Callable[..., Any]) -> bool:
    """True when a service function declares an explicit `evidence_profile` param.

    Keeps the injection precise: only tools wired to consume the profile receive
    it, and services with an unrelated signature are never handed the kwarg.
    """
    try:
        return "evidence_profile" in inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False


def _record_cache_outcome(db: Session, outcome: str) -> None:
    """Emit one allowlisted `r10_cache_outcome` event (outcome class only).

    R10 multi-instance/cache evidence (#136, ADR 0004). Best-effort like every
    other instrumentation call here — `safe_record_activation_event` swallows
    operational failures — and carries no cache key or payload, only the
    hit/miss/write/failure class.
    """
    safe_record_activation_event(
        db,
        event_name="r10_cache_outcome",
        operational_outcome=outcome,
    )


def _record_generation_phase(
    db: Session,
    *,
    tool_name: str,
    access_mode: str,
    phase: str,
    started_at: float,
) -> None:
    """Persist timing from a real shared-pipeline boundary, never fake progress."""
    safe_record_activation_event(
        db,
        event_name="r10_generation_phase",
        tool_id=tool_name,
        access_mode=access_mode,
        operational_dimension=phase,
        duration_ms=max(0, int((perf_counter() - started_at) * 1000)),
    )
