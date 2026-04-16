import json

from fastapi import APIRouter, Depends, Request
from app.limiter import limiter
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, get_optional_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tools import (
    InterviewPracticeFeedbackRequest,
    InterviewPracticeFeedbackResponse,
    InterviewRequest,
    InterviewResponse,
)
from app.services.interview_gen import evaluate_practice_answer, generate_interview_questions
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
    result = await evaluate_practice_answer(
        body.question, body.user_answer, body.model_answer
    )
    return InterviewPracticeFeedbackResponse(**result)
