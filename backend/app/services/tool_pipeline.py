from __future__ import annotations

import asyncio
import inspect
import json
import logging
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from time import perf_counter
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.user import User
from app.services.evidence_injection import load_profile_for_injection
from app.services.input_sanitizer import sanitize_user_input
from app.services.llm_budget import reserve_anonymous_model_call
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

# What the AI layer raises once a call has really failed (ai_client._with_retry re-raises the last one).
_MODEL_FAILURES = (RuntimeError, TimeoutError, json.JSONDecodeError)
AI_UNAVAILABLE_DETAIL = "The AI service is unavailable right now. Please try again in a moment."

logger = logging.getLogger(__name__)

# Set by a service that swallowed an LLM failure and returned a heuristic-only
# result (spec decision #7). Request-scoped: each FastAPI request runs in its own
# copied context, and the pipeline clears it at the start of every run.
_result_degraded: ContextVar[bool] = ContextVar("tool_result_degraded", default=False)


def mark_result_degraded() -> None:
    """Flag the current run's result as a degraded fallback so it is not cached."""
    _result_degraded.set(True)


# The six user-facing tools take a resume of at least 50 characters (and three of
# them a job description of at least 20) at the schema layer, but that counts raw
# characters: whitespace, punctuation and stripped injection text count too.
# Only those six tools reject input with nothing meaningful left once sanitized;
# other callers (the application reviewer, CV tailoring) deliberately run on thin
# or empty text and report it themselves.
_USER_FACING_TOOLS = frozenset(
    {"resume", "job-match", "cover-letter", "interview", "career", "portfolio"}
)
_JD_REQUIRED_TOOLS = frozenset({"job-match", "cover-letter", "interview"})
# Meaningful = enough letters/digits AND enough distinct ones, so a few repeated
# words ("pirate. pirate. ...") left behind by stripping injection text, or a wall
# of punctuation, never passes just by being long. Distinct characters rather than
# distinct words keeps unspaced scripts working.
_MIN_RESUME_ALNUM = 20
_MIN_RESUME_DISTINCT = 10
_MIN_JD_ALNUM = 8
_MIN_JD_DISTINCT = 5


def _is_meaningful(text: str, *, min_alnum: int, min_distinct: int) -> bool:
    alnum = [c.lower() for c in text if c.isalnum()]
    return len(alnum) >= min_alnum and len(set(alnum)) >= min_distinct


def _clean_inputs(
    tool_name: str,
    resume_text: str,
    job_description: str | None,
    feedback: str | None,
) -> tuple[str, str | None, str | None]:
    """Sanitize user text and reject input with nothing meaningful left to score."""
    clean_resume = sanitize_user_input(resume_text)
    clean_jd = sanitize_user_input(job_description) if job_description else None
    clean_feedback = sanitize_user_input(feedback) if feedback else None

    if tool_name in _USER_FACING_TOOLS:
        if not clean_resume:
            raise HTTPException(status_code=422, detail="Add your resume text, or upload a PDF or DOCX.")
        if not _is_meaningful(
            clean_resume, min_alnum=_MIN_RESUME_ALNUM, min_distinct=_MIN_RESUME_DISTINCT
        ):
            raise HTTPException(
                status_code=422,
                detail="This resume has too little readable text. Paste it as plain text, or upload a PDF or DOCX.",
            )
        if tool_name in _JD_REQUIRED_TOOLS and job_description:
            if not clean_jd:
                raise HTTPException(status_code=422, detail="Add the job description.")
            if not _is_meaningful(clean_jd, min_alnum=_MIN_JD_ALNUM, min_distinct=_MIN_JD_DISTINCT):
                raise HTTPException(
                    status_code=422,
                    detail="This job description has too little readable text. Paste the posting as plain text.",
                )
    # Optional job description that cleaned to nothing: treat as not provided.
    return clean_resume, clean_jd or None, clean_feedback or None


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
        await run_in_threadpool(
            require_valid_parent_run,
            db,
            current_user=current_user,
            tool_name=tool_name,
            parent_run_id=parent_run_id,
        )
    # Likewise unusable input (nothing meaningful once sanitized) is a 422, not a run.
    clean_resume, clean_jd, clean_feedback = _clean_inputs(
        tool_name, resume_text, job_description, feedback
    )

    started_at = perf_counter()
    try:
        return await _run_tool_pipeline_after_validation(
            tool_name=tool_name,
            service_fn=service_fn,
            service_kwargs=service_kwargs,
            label_fn=label_fn,
            resume_text=clean_resume,
            job_description=clean_jd,
            feedback=clean_feedback,
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
        if not isinstance(exc, HTTPException) and isinstance(exc, _MODEL_FAILURES):
            # The model call gave up (retries spent, timed out, unreadable output). Generative tools have
            # no heuristic to fall back on, so say so with a 503 instead of an unexplained 500.
            raise HTTPException(status_code=503, detail=AI_UNAVAILABLE_DETAIL) from exc
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

    # Inputs arrive already sanitized and validated by run_tool_pipeline.
    clean_resume, clean_jd, clean_feedback = resume_text, job_description, feedback

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
    user_scope = "guest"
    if current_user is not None:
        user_scope = current_user.id
        # Blocking DB read, off the event loop. It also ends the read
        # transaction (and the auth lookup before it) so the pooled connection
        # is not pinned for the whole model call.
        evidence_payload, profile_version = await run_in_threadpool(
            _load_profile_and_release_connection, db, user_scope
        )
        if not evidence_payload.is_empty() and _accepts_evidence_profile(service_fn):
            service_kwargs["evidence_profile"] = evidence_payload

    # Cache check — scope by user_id so authenticated users never see another user's
    # cached result (defense-in-depth: tools are deterministic from inputs, but mixing
    # cache scopes across accounts complicates audit and personalization later).
    #
    # Feedback and Re-generate (a parent run) both ask for a fresh generation,
    # so neither reads or writes the cache.
    cached = None
    content_hash = None
    # A guest has no run lineage to re-generate from, so a parent id is ignored
    # (not honoured as a cache bypass) for them.
    regenerating = current_user is not None and bool(parent_run_id)
    if settings.RESULT_CACHE_ENABLED and not clean_feedback and not regenerating:
        hash_kwargs: dict[str, str] = {}
        if cache_extra_keys:
            hash_kwargs.update(cache_extra_keys)
        hash_kwargs["user_scope"] = user_scope
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
        result = await _generate_once(
            content_hash=content_hash,
            service_fn=service_fn,
            service_kwargs=service_kwargs,
            anonymous=current_user is None,
        )

    run_id = await run_in_threadpool(
        _persist_run,
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
        history_id=run_id,
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
        saved=run_id is not None,
    )

    return response


def _load_profile_and_release_connection(db: Session, user_id: str):
    """Read the Evidence Profile, then give the connection back to the pool.

    The auth lookup and this read leave a transaction open that would otherwise
    pin one pooled connection for the whole (seconds-long) model call. A session
    with unflushed changes is left alone: ending its transaction would discard
    them.
    """
    payload = load_profile_for_injection(db, user_id)
    if not (db.new or db.dirty or db.deleted):
        db.rollback()
    return payload


def _persist_run(db: Session, **kwargs: Any) -> str | None:
    run = persist_tool_run(db, **kwargs)
    return run.id if run else None


class _LeaderAborted(Exception):
    """The request that was generating this result was cancelled; waiters retry."""


# content hash -> the future of the generation currently running for it.
_inflight: dict[str, asyncio.Future[dict[str, Any]]] = {}


async def _generate_once(
    *,
    content_hash: str | None,
    service_fn: Callable[..., Awaitable[dict[str, Any]]],
    service_kwargs: dict[str, Any],
    anonymous: bool,
) -> dict[str, Any]:
    """Run the service, sharing one model call between identical in-flight requests.

    Single-flight is keyed on the cache key, so a double-click (or two tabs) is
    one provider call and one bill. Requests that bypass the cache (Re-generate,
    feedback) have no key and always generate.
    """
    if content_hash is None:
        return await _call_service(service_fn, service_kwargs, anonymous)

    while True:
        pending = _inflight.get(content_hash)
        if pending is None:
            break
        try:
            return {**(await asyncio.shield(pending))}
        except _LeaderAborted:
            continue

    future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
    _inflight[content_hash] = future
    try:
        result = await _call_service(service_fn, service_kwargs, anonymous)
        # A heuristic-only fallback must not be cached, or one LLM outage would
        # keep serving the degraded answer for the whole TTL.
        if not _result_degraded.get():
            try:
                set_cached_result(content_hash, result)
            except Exception:  # noqa: BLE001
                logger.warning("Result cache write failed; result is not cached", exc_info=True)
        future.set_result(result)
        return result
    except BaseException as exc:
        future.set_exception(_LeaderAborted() if isinstance(exc, asyncio.CancelledError) else exc)
        future.exception()  # mark retrieved: there may be no waiter to raise it
        raise
    finally:
        if _inflight.get(content_hash) is future:
            del _inflight[content_hash]


async def _call_service(
    service_fn: Callable[..., Awaitable[dict[str, Any]]],
    service_kwargs: dict[str, Any],
    anonymous: bool,
) -> dict[str, Any]:
    if anonymous:
        reserve_anonymous_model_call()
    return await service_fn(**service_kwargs)


def _accepts_evidence_profile(fn: Callable[..., Any]) -> bool:
    """True when a service function declares an explicit `evidence_profile` param.

    Keeps the injection precise: only tools wired to consume the profile receive
    it, and services with an unrelated signature are never handed the kwarg.
    """
    try:
        return "evidence_profile" in inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False
