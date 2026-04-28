from __future__ import annotations

from collections.abc import Awaitable, Callable
from time import perf_counter
from typing import Any

from sqlalchemy.orm import Session

from app.models.user import User
from app.services.input_sanitizer import sanitize_user_input
from app.services.observability import (
    log_tool_run_completed,
    log_tool_run_failed,
    log_tool_run_started,
)
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

    log_tool_run_started(
        tool_name=tool_name,
        access_mode=access_mode,
        workspace_id=workspace_id,
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
        cached = get_cached_result(content_hash)

    if cached is not None:
        result = {**cached}
    else:
        try:
            result = await service_fn(**service_kwargs)
        except Exception as exc:
            log_tool_run_failed(
                tool_name=tool_name,
                access_mode=access_mode,
                duration_ms=int((perf_counter() - start) * 1000),
                workspace_id=workspace_id,
                failure_category=exc.__class__.__name__,
            )
            raise

        if content_hash is not None:
            set_cached_result(content_hash, result)

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

    log_tool_run_completed(
        tool_name=tool_name,
        access_mode=access_mode,
        duration_ms=int((perf_counter() - start) * 1000),
        saved=run is not None,
        history_id=run.id if run else None,
        workspace_id=workspace_id,
    )

    return response
