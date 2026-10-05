import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.security import get_optional_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.prompts.interview import INTERVIEW_PROMPT_VERSION
from app.schemas.tools import (
    InterviewPracticeFeedbackRequest,
    InterviewPracticeFeedbackResponse,
    InterviewRequest,
    InterviewResponse,
)
from app.services.input_sanitizer import sanitize_user_input
from app.services.interview_gen import evaluate_practice_answer, generate_interview_questions
from app.services.llm_budget import reserve_anonymous_model_call
from app.services.tool_pipeline import run_tool_pipeline

router = APIRouter()


@router.post("/questions", response_model=InterviewResponse)
@limiter.limit("10/minute")
async def questions(
    request: Request,
    body: InterviewRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    workspace_id = body.workspace_context.workspace_id if body.workspace_context else None
    linked_context_ids = [
        body.resume_analysis.history_id if body.resume_analysis else None,
        body.job_match.history_id if body.job_match else None,
        *(body.workspace_context.linked_history_ids if body.workspace_context else []),
    ]

    resume_analysis_dict = (
        body.resume_analysis.model_dump(exclude_none=True) if body.resume_analysis else None
    )
    job_match_dict = (
        body.job_match.model_dump(exclude_none=True) if body.job_match else None
    )

    response = await run_tool_pipeline(
        tool_name="interview",
        service_fn=generate_interview_questions,
        service_kwargs={
            "resume_text": body.resume_text,
            "job_description": body.job_description,
            "num_questions": body.num_questions,
            "resume_analysis": resume_analysis_dict,
            "job_match": job_match_dict,
            # tool_pipeline only injects sanitized feedback when the key is
            # present in service_kwargs; without this entry, regen-with-feedback
            # silently dropped user feedback before reaching the prompt.
            "feedback": body.feedback,
        },
        label_fn=lambda r: f"Interview Prep ({len(r['questions'])} questions)",
        resume_text=body.resume_text,
        job_description=body.job_description,
        feedback=body.feedback,
        parent_run_id=body.parent_run_id,
        workspace_id=workspace_id,
        linked_context_ids=linked_context_ids,
        current_user=current_user,
        db=db,
        cache_extra_keys={
            "prompt_version": INTERVIEW_PROMPT_VERSION,
            "model": settings.LLM_MODEL,
            "num_questions": str(body.num_questions) if body.num_questions is not None else "",
            "resume_analysis": json.dumps(resume_analysis_dict, sort_keys=True) if resume_analysis_dict else "",
            "job_match": json.dumps(job_match_dict, sort_keys=True) if job_match_dict else "",
        },
    )
    return InterviewResponse(**response)


@router.post("/practice-feedback", response_model=InterviewPracticeFeedbackResponse)
@limiter.limit("10/minute")
async def practice_feedback(
    request: Request,
    body: InterviewPracticeFeedbackRequest,
    current_user: User | None = Depends(get_optional_current_user),
):
    # This route calls the model directly, so it applies the pipeline's sanitisation itself.
    question = sanitize_user_input(body.question)
    if not question:
        raise HTTPException(status_code=422, detail="question is required")
    user_answer = sanitize_user_input(body.user_answer)
    model_answer = sanitize_user_input(body.model_answer) if body.model_answer else None
    if current_user is None:
        # Guest model calls count toward the daily circuit breaker, like the
        # pipeline's own guest runs; this route calls the model directly.
        reserve_anonymous_model_call()
    result = await evaluate_practice_answer(question, user_answer, model_answer or None)
    return InterviewPracticeFeedbackResponse(**result)
