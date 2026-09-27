from __future__ import annotations

import inspect
import logging
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from time import perf_counter
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.services.evidence_injection import load_profile_for_injection
from app.services.input_sanitizer import sanitize_user_input
from app.services.observability import (
    log_tool_run_completed,
    log_tool_run_failed,
    log_tool_run_started,
)
from app.services.result_cache import compute_content_hash, get_cached_result, set_cached_result
from app.services.tool_runs import (
    build_tool_response,
    extract_linked_context_ids,
    persist_tool_run,
    require_valid_parent_run,
)

logger = logging.getLogger(__name__)

# Set by a service that swallowed an LLM failure and returned a heuristic-only
# result (spec decision #7). Request-scoped: each FastAPI request runs in its own
# copied context, and the pipeline clears it at the start of every run.
_result_degraded: ContextVar[bool] = ContextVar("tool_result_degraded", default=False)


def mark_result_degraded() -> None:
    """Flag the current run's result as a degraded fallback so it is not cached."""
    _result_degraded.set(True)


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
    persist_run: bool = True,
) -> dict[str, Any]:
    """Run one tool and durably classify every failure after run start.

    ``persist_run=False`` skips the ToolRun (and so the Workspace it would
    open); only for non-tool callers whose result lives elsewhere.
    """
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
            persist_run=persist_run,
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
    persist_run: bool = True,
) -> dict[str, Any]:
    """Shared pipeline: sanitize -> cache -> service -> fallback -> persist -> respond."""
    access_mode = "authenticated" if current_user else "guest_demo"
    linked_ids = linked_context_ids or []
    start = perf_counter()
    _result_degraded.set(False)

    log_tool_run_started(
        tool_name=tool_name,
        access_mode=access_mode,
        linked_context_count=len(linked_ids),
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

    # Evidence Profile injection (R11, D-063 / ADR 0005). The shared pipeline is
    # the only seam that reads the profile — no tool router gains its own access
    # path. Authenticated-only; guests keep inline inputs and tab-scoped carry
    # (D-064). A user with no confirmed/unconfirmed items yields an empty
    # payload, so tools behave exactly as with inline inputs until the user
    # confirms evidence.
    profile_version: str | None = None
    if current_user is not None:
        evidence_payload, profile_version = load_profile_for_injection(db, current_user.id)
        if not evidence_payload.is_empty() and _accepts_evidence_profile(service_fn):
            service_kwargs["evidence_profile"] = evidence_payload

    # Cache check — scope by user_id so authenticated users never see another user's
    # cached result (defense-in-depth: tools are deterministic from inputs, but mixing
    # cache scopes across accounts complicates audit and personalization later).
    cached = None
    content_hash = None
    if settings.RESULT_CACHE_ENABLED and not clean_feedback:
        hash_kwargs: dict[str, str] = {}
        if cache_extra_keys:
            hash_kwargs.update(cache_extra_keys)
        hash_kwargs["user_scope"] = current_user.id if current_user else "guest"
        # A per-router `cache_extra_keys={"model": settings.LLM_MODEL}` only
        # busts the cache on a model *string* change. It cannot by itself
        # distinguish providers that can share a model string (google vs.
        # vertex both default to "gemini-2.5-flash") or, since `anthropic`'s
        # own default model lives inside `ai_client.complete_structured` and
        # is invisible here, switching to `anthropic` with `LLM_MODEL` left at
        # its Vertex-shaped default. Keying on the provider directly closes
        # both gaps without every router having to know about it.
        hash_kwargs["llm_provider"] = settings.LLM_PROVIDER
        # The profile version joins the cache key so a profile edit invalidates
        # cached results (D-063, ADR 0005). Only present for authenticated users
        # while injection is enabled; guests and the disabled path are unaffected.
        if profile_version is not None:
            hash_kwargs["profile_version"] = profile_version
        content_hash = compute_content_hash(tool_name, clean_resume, clean_jd, **hash_kwargs)
        # The cache is a fail-open acceleration layer (ADR 0004): a lookup error
        # is a miss and a write error is ignored, never a failed run.
        try:
            cached = get_cached_result(content_hash)
        except Exception:  # noqa: BLE001
            logger.warning("Result cache lookup failed; serving as a cache miss", exc_info=True)

    if cached is not None:
        result = {**cached}
    else:
        result = await service_fn(**service_kwargs)
        # A heuristic-only fallback must not be cached, or one LLM outage would
        # keep serving the degraded answer for the whole TTL.
        if content_hash is not None and not _result_degraded.get():
            try:
                set_cached_result(content_hash, result)
            except Exception:  # noqa: BLE001
                logger.warning("Result cache write failed; result is not cached", exc_info=True)

    run = persist_tool_run(
        db,
        current_user=current_user if persist_run else None,
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
    if not persist_run and current_user is not None:
        # Unsaved by design, not a guest: nothing is locked.
        response["locked_actions"] = []
    completed_duration_ms = int((perf_counter() - start) * 1000)
    log_tool_run_completed(
        tool_name=tool_name,
        access_mode=access_mode,
        duration_ms=completed_duration_ms,
        saved=run is not None,
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
