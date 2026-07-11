from __future__ import annotations

from collections.abc import Awaitable, Callable
from time import perf_counter
from typing import Any

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.analytics import safe_record_activation_event
from app.services.input_sanitizer import sanitize_user_input
from app.services.llm_cost import get_llm_cost, reset_llm_cost
from app.services.observability import (
    log_tool_run_completed,
    log_tool_run_failed,
    log_tool_run_started,
)
from app.services.provider_incident import get_provider_incident, reset_provider_incident
from app.services.result_cache import compute_content_hash, get_cached_result, set_cached_result
from app.services.tool_runs import build_tool_response, extract_linked_context_ids, persist_tool_run


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

    # Cache check — scope by user_id so authenticated users never see another user's
    # cached result (defense-in-depth: tools are deterministic from inputs, but mixing
    # cache scopes across accounts complicates audit and personalization later).
    cached = None
    content_hash = None
    if not clean_feedback:
        hash_kwargs: dict[str, str] = {}
        if cache_extra_keys:
            hash_kwargs.update(cache_extra_keys)
        hash_kwargs["user_scope"] = current_user.id if current_user else "guest"
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

    if cached is not None:
        result = {**cached}
    else:
        try:
            result = await service_fn(**service_kwargs)
        except Exception as exc:
            failed_duration_ms = int((perf_counter() - start) * 1000)
            log_tool_run_failed(
                tool_name=tool_name,
                access_mode=access_mode,
                duration_ms=failed_duration_ms,
                failure_category=exc.__class__.__name__,
            )
            # The exception class name is high-cardinality and not allowlisted,
            # so it stays in the stdout log only; the durable event records the
            # allowlisted `tool_request_failed` category (D-037). Cost is
            # whatever provider calls consumed before the failure — None if it
            # failed before reaching the provider (issue #106).
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
            # R10 provider-incident evidence (#136, D-055): if the failure came
            # from a categorised provider error, record exactly one incident for
            # this user-visible failure — the LLM client's internal retries have
            # already been collapsed into a single category by the contextvar.
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

        if content_hash is not None:
            try:
                set_cached_result(content_hash, result)
            except Exception:  # noqa: BLE001 — cache write is best-effort
                _record_cache_outcome(db, "failure")
            else:
                _record_cache_outcome(db, "write")

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

    return response


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
