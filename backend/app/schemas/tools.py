from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


# --- Requests ---

class ResumeAnalyzeRequest(BaseModel):
    resume_text: str
    job_description: str | None = None
    workspace_context: "WorkspaceContextInput | None" = None


class JobMatchRequest(BaseModel):
    resume_text: str
    job_description: str
    workspace_context: "WorkspaceContextInput | None" = None


class CoverLetterRequest(BaseModel):
    resume_text: str
    job_description: str
    tone: str | None = None
    resume_analysis: ResumeAnalysisHandoff | None = None
    job_match: JobMatchHandoff | None = None
    workspace_context: "WorkspaceContextInput | None" = None


class InterviewRequest(BaseModel):
    resume_text: str
    job_description: str
    num_questions: int | None = Field(None, ge=1, le=20)
    resume_analysis: ResumeAnalysisHandoff | None = None
    job_match: JobMatchHandoff | None = None
    workspace_context: "WorkspaceContextInput | None" = None


class CareerRequest(BaseModel):
    resume_text: str
    target_role: str | None = None
    workspace_context: "WorkspaceContextInput | None" = None


class PortfolioRequest(BaseModel):
    resume_text: str
    target_role: str
    workspace_context: "WorkspaceContextInput | None" = None


class ImportJobUrlRequest(BaseModel):
    url: HttpUrl


class WorkspaceContextInput(BaseModel):
    workspace_id: str | None = None
    linked_history_ids: list[str] = Field(default_factory=list)


# --- Responses ---

class ResultSummary(BaseModel):
    headline: str
    verdict: str
    confidence_note: str


class TopAction(BaseModel):
    title: str
    action: str
    priority: Literal["high", "medium", "low"]


class ExportableSection(BaseModel):
    id: str
    title: str
    body: str | None = None
    items: list[str] = Field(default_factory=list)


class EditableBlock(BaseModel):
    id: str
    label: str
    content: str
    placeholder: str | None = None


class SharedResultEnvelope(BaseModel):
    history_id: str | None = None
    schema_version: str
    summary: ResultSummary
    top_actions: list[TopAction]
    generated_at: str
    download_title: str
    exportable_sections: list[ExportableSection] = Field(default_factory=list)
    editable_blocks: list[EditableBlock] = Field(default_factory=list)
    access_mode: Literal["authenticated", "guest_demo"] = "authenticated"
    saved: bool = True
    locked_actions: list[Literal["save", "favorite", "continue", "history"]] = Field(
        default_factory=list
    )


class ScoreBreakdownItem(BaseModel):
    key: Literal["keywords", "impact", "structure", "clarity", "completeness"]
    label: str
    score: int


class ResumeIssue(BaseModel):
    id: str
    severity: Literal["high", "medium", "low"]
    category: Literal["keywords", "impact", "structure", "clarity", "completeness"]
    title: str
    why_it_matters: str
    evidence: str
    fix: str


class ResumeEvidence(BaseModel):
    detected_sections: list[str]
    detected_skills: list[str]
    matched_keywords: list[str]
    missing_keywords: list[str]
    quantified_bullets: int


class ResumeRoleFit(BaseModel):
    target_role_label: str
    fit_score: int
    rationale: str


class ResumeAnalyzeResponse(SharedResultEnvelope):
    overall_score: int
    score_breakdown: list[ScoreBreakdownItem]
    strengths: list[str]
    issues: list[ResumeIssue]
    evidence: ResumeEvidence
    role_fit: ResumeRoleFit | None = None


class JobRequirement(BaseModel):
    requirement: str
    importance: Literal["must", "preferred"]
    status: Literal["matched", "partial", "missing"]
    resume_evidence: str
    suggested_fix: str


class TailoringAction(BaseModel):
    section: Literal["summary", "experience", "skills", "projects"]
    keyword: str
    action: str


class ResumeAnalysisHandoff(BaseModel):
    history_id: str | None = None
    summary: ResultSummary | None = None
    top_actions: list[TopAction] = []
    strengths: list[str] = []
    issues: list[ResumeIssue] = []
    evidence: ResumeEvidence | None = None
    role_fit: ResumeRoleFit | None = None


class JobMatchHandoff(BaseModel):
    history_id: str | None = None
    summary: ResultSummary | None = None
    top_actions: list[TopAction] = []
    match_score: int | None = None
    verdict: Literal["strong", "borderline", "stretch"] | None = None
    requirements: list[JobRequirement] = []
    matched_keywords: list[str] = []
    missing_keywords: list[str] = []
    tailoring_actions: list[TailoringAction] = []
    interview_focus: list[str] = []
    recruiter_summary: str | None = None


class JobMatchResponse(SharedResultEnvelope):
    match_score: int
    verdict: Literal["strong", "borderline", "stretch"]
    requirements: list[JobRequirement]
    matched_keywords: list[str]
    missing_keywords: list[str]
    tailoring_actions: list[TailoringAction]
    interview_focus: list[str]
    recruiter_summary: str


class CoverLetterSection(BaseModel):
    text: str
    why_this_paragraph: str
    requirements_used: list[str]
    evidence_used: list[str] = []


class CoverLetterCustomizationNote(BaseModel):
    category: Literal["tone", "evidence", "keyword", "gap"]
    note: str
    requirements_used: list[str] = []
    source: Literal["resume", "resume-analysis", "job-match", "job-description"]


class CoverLetterResponse(SharedResultEnvelope):
    opening: CoverLetterSection
    body_points: list[CoverLetterSection]
    closing: CoverLetterSection
    full_text: str
    tone_used: str
    customization_notes: list[CoverLetterCustomizationNote]


class InterviewQuestion(BaseModel):
    question: str
    answer: str
    key_points: list[str]
    answer_structure: list[str]
    follow_up_questions: list[str]
    focus_area: str
    why_asked: str
    practice_first: bool = False


class InterviewFocusArea(BaseModel):
    title: str
    reason: str
    requirements_used: list[str]
    practice_first: bool = False


class WeakSignal(BaseModel):
    title: str
    severity: Literal["high", "medium", "low"]
    why_it_matters: str
    prep_action: str
    related_requirements: list[str]


class InterviewResponse(SharedResultEnvelope):
    questions: list[InterviewQuestion]
    focus_areas: list[InterviewFocusArea]
    weak_signals_to_prepare: list[WeakSignal]
    interviewer_notes: list[str]


class CareerRecommendedDirection(BaseModel):
    role_title: str
    fit_score: int
    transition_timeline: str
    why_now: str
    confidence: Literal["high", "medium", "low"]

class CareerPath(BaseModel):
    role_title: str
    fit_score: int
    transition_timeline: str
    rationale: str
    strengths_to_leverage: list[str]
    gaps_to_close: list[str]
    risk_level: Literal["low", "medium", "high"]


class CareerSkillGap(BaseModel):
    skill: str
    urgency: Literal["high", "medium", "low"]
    why_it_matters: str
    how_to_build: str


class CareerNextStep(BaseModel):
    timeframe: str
    action: str


class CareerResponse(SharedResultEnvelope):
    recommended_direction: CareerRecommendedDirection
    paths: list[CareerPath]
    current_skills: list[str]
    target_skills: list[str]
    skill_gaps: list[CareerSkillGap]
    next_steps: list[CareerNextStep]


class PortfolioStrategy(BaseModel):
    headline: str
    focus: str
    proof_goal: str


class PortfolioProject(BaseModel):
    project_title: str
    description: str
    skills: list[str]
    complexity: Literal["foundational", "intermediate", "advanced"]
    why_this_project: str
    deliverables: list[str]
    hiring_signals: list[str]
    estimated_timeline: str


class PortfolioSequenceStep(BaseModel):
    order: int
    project_title: str
    reason: str


class PortfolioResponse(SharedResultEnvelope):
    target_role: str
    portfolio_strategy: PortfolioStrategy
    projects: list[PortfolioProject]
    recommended_start_project: str
    sequence_plan: list[PortfolioSequenceStep]
    presentation_tips: list[str]


class ParsedCvResponse(BaseModel):
    filename: str
    extracted_text: str
    chars_count: int | None = None
    warnings: list[str] = []


class ImportedJobResponse(BaseModel):
    job_title: str | None = None
    company_name: str | None = None
    job_description: str
    source_url: str | None = None
