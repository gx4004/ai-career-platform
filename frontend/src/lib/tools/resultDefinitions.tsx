import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileEdit,
  Hash,
  Info,
  Lightbulb,
  MessageSquare,
  Settings,
  Star,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { ScrollReveal, AnimatedNumber } from '#/components/ui/motion'
import { InterviewPracticeMode } from '#/components/tooling/InterviewPracticeMode'
import type { ToolRunDetail } from '#/lib/api/schemas'
import type { ToolDefinition, ToolId } from '#/lib/tools/registry'

type AnyObject = Record<string, unknown>

type ResumeResultPayload = {
  summary: {
    headline: string
    verdict: string
    confidence_note: string
  }
  topActions: Array<{
    title: string
    action: string
    priority: 'high' | 'medium' | 'low'
  }>
  overallScore: number
  scoreBreakdown: Array<{
    key: 'keywords' | 'impact' | 'structure' | 'clarity' | 'completeness'
    label: string
    score: number
  }>
  strengths: string[]
  issues: Array<{
    id: string
    severity: 'high' | 'medium' | 'low'
    category: 'keywords' | 'impact' | 'structure' | 'clarity' | 'completeness'
    title: string
    whyItMatters: string
    evidence: string
    fix: string
  }>
  evidence: {
    detectedSections: string[]
    detectedSkills: string[]
    matchedKeywords: string[]
    missingKeywords: string[]
    quantifiedBullets: number
  }
  roleFit: {
    targetRoleLabel: string
    fitScore: number
    rationale: string
  } | null
}

type JobMatchResultPayload = {
  summary: {
    headline: string
    verdict: string
    confidence_note: string
  }
  topActions: Array<{
    title: string
    action: string
    priority: 'high' | 'medium' | 'low'
  }>
  matchScore: number
  verdict: 'strong' | 'borderline' | 'stretch'
  requirements: Array<{
    requirement: string
    importance: 'must' | 'preferred'
    status: 'matched' | 'partial' | 'missing'
    resumeEvidence: string
    suggestedFix: string
  }>
  matchedKeywords: string[]
  missingKeywords: Array<{
    keyword: string
    contextual_guidance: string
    anti_stuffing_note: string
  }>
  tailoringActions: Array<{
    section: 'summary' | 'experience' | 'skills' | 'projects'
    keyword: string
    action: string
  }>
  interviewFocus: string[]
  recruiterSummary: string
}

type CoverLetterSectionPayload = {
  text: string
  whyThisParagraph: string
  requirementsUsed: string[]
  evidenceUsed: string[]
}

type CoverLetterResultPayload = {
  summary: {
    headline: string
    verdict: string
    confidence_note: string
  }
  topActions: Array<{
    title: string
    action: string
    priority: 'high' | 'medium' | 'low'
  }>
  generatedAt: string
  opening: CoverLetterSectionPayload
  bodyPoints: CoverLetterSectionPayload[]
  closing: CoverLetterSectionPayload
  fullText: string
  toneUsed: string
  customizationNotes: Array<{
    category: 'tone' | 'evidence' | 'keyword' | 'gap'
    note: string
    requirementsUsed: string[]
    source: 'resume' | 'resume-analysis' | 'job-match' | 'job-description'
  }>
}

type InterviewResultPayload = {
  summary: {
    headline: string
    verdict: string
    confidence_note: string
  }
  topActions: Array<{
    title: string
    action: string
    priority: 'high' | 'medium' | 'low'
  }>
  generatedAt: string
  questions: Array<{
    question: string
    answer: string
    keyPoints: string[]
    answerStructure: string[]
    followUpQuestions: string[]
    focusArea: string
    whyAsked: string
    practiceFirst: boolean
  }>
  focusAreas: Array<{
    title: string
    reason: string
    requirementsUsed: string[]
    practiceFirst: boolean
  }>
  weakSignals: Array<{
    title: string
    severity: 'high' | 'medium' | 'low'
    whyItMatters: string
    prepAction: string
    relatedRequirements: string[]
  }>
  interviewerNotes: string[]
}

type CareerResultPayload = {
  summary: {
    headline: string
    verdict: string
    confidence_note: string
  }
  topActions: Array<{
    title: string
    action: string
    priority: 'high' | 'medium' | 'low'
  }>
  recommendedDirection: {
    roleTitle: string
    fitScore: number
    transitionTimeline: string
    whyNow: string
    confidence: 'high' | 'medium' | 'low'
  }
  paths: Array<{
    roleTitle: string
    fitScore: number
    transitionTimeline: string
    rationale: string
    strengthsToLeverage: string[]
    gapsToClose: string[]
    riskLevel: 'low' | 'medium' | 'high'
  }>
  currentSkills: string[]
  targetSkills: string[]
  skillGaps: Array<{
    skill: string
    urgency: 'high' | 'medium' | 'low'
    whyItMatters: string
    howToBuild: string
  }>
  nextSteps: Array<{
    timeframe: string
    action: string
  }>
}

type PortfolioResultPayload = {
  summary: {
    headline: string
    verdict: string
    confidence_note: string
  }
  topActions: Array<{
    title: string
    action: string
    priority: 'high' | 'medium' | 'low'
  }>
  targetRole: string
  strategy: {
    headline: string
    focus: string
    proofGoal: string
  }
  projects: Array<{
    projectTitle: string
    description: string
    skills: string[]
    complexity: 'foundational' | 'intermediate' | 'advanced'
    whyThisProject: string
    deliverables: string[]
    hiringSignals: string[]
    estimatedTimeline: string
  }>
  recommendedStartProject: string
  sequencePlan: Array<{
    order: number
    projectTitle: string
    reason: string
  }>
  presentationTips: string[]
}

function toString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => toString(item).trim())
    .filter(Boolean)
}

function toObjectArray(value: unknown): AnyObject[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is AnyObject => Boolean(item) && typeof item === 'object',
  )
}

function scoreColor(score: number) {
  if (score >= 70) return '#22c55e'
  if (score >= 41) return '#f59e0b'
  return '#ef4444'
}

function statusTone(status: 'matched' | 'partial' | 'missing') {
  if (status === 'matched') return 'var(--success)'
  if (status === 'partial') return 'var(--warning)'
  return 'var(--destructive)'
}

function normalizeResumePayload(payload: AnyObject): ResumeResultPayload {
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as AnyObject
    : {}
  const evidence = payload.evidence && typeof payload.evidence === 'object'
    ? payload.evidence as AnyObject
    : {}

  return {
    summary: {
      headline: toString(summary.headline) || 'Resume analysis ready.',
      verdict: toString(summary.verdict) || 'Advisory review',
      confidence_note: toString(summary.confidence_note) || 'Directional heuristic only.',
    },
    topActions: toObjectArray(payload.top_actions).map((item) => ({
      title: toString(item.title) || 'Top action',
      action: toString(item.action) || 'Revise the resume to make this evidence clearer.',
      priority: (toString(item.priority) || 'medium') as 'high' | 'medium' | 'low',
    })),
    overallScore: toNumber(payload.overall_score),
    scoreBreakdown: toObjectArray(payload.score_breakdown).map((item) => ({
      key: (toString(item.key) || 'clarity') as ResumeResultPayload['scoreBreakdown'][number]['key'],
      label: toString(item.label) || 'Score',
      score: toNumber(item.score),
    })),
    strengths: toStringArray(payload.strengths),
    issues: toObjectArray(payload.issues).map((item, index) => ({
      id: toString(item.id) || `issue-${index + 1}`,
      severity: (toString(item.severity) || 'medium') as 'high' | 'medium' | 'low',
      category: (toString(item.category) || 'clarity') as ResumeResultPayload['issues'][number]['category'],
      title: toString(item.title) || 'Resume issue',
      whyItMatters: toString(item.why_it_matters) || 'This weakens the resume signal.',
      evidence: toString(item.evidence) || 'The current payload did not include supporting evidence.',
      fix: toString(item.fix) || 'Revise the resume so the evidence is easier to verify.',
    })),
    evidence: {
      detectedSections: toStringArray(evidence.detected_sections),
      detectedSkills: toStringArray(evidence.detected_skills),
      matchedKeywords: toStringArray(evidence.matched_keywords),
      missingKeywords: toStringArray(evidence.missing_keywords),
      quantifiedBullets: toNumber(evidence.quantified_bullets),
    },
    roleFit:
      payload.role_fit && typeof payload.role_fit === 'object'
        ? {
            targetRoleLabel:
              toString((payload.role_fit as AnyObject).target_role_label) || 'Target role',
            fitScore: toNumber((payload.role_fit as AnyObject).fit_score),
            rationale:
              toString((payload.role_fit as AnyObject).rationale) ||
              'No role-fit rationale was returned.',
          }
        : null,
  }
}

function normalizeJobMatchPayload(payload: AnyObject): JobMatchResultPayload {
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as AnyObject
    : {}

  return {
    summary: {
      headline: toString(summary.headline) || 'Job match review ready.',
      verdict: toString(summary.verdict) || 'borderline',
      confidence_note: toString(summary.confidence_note) || 'Directional heuristic only.',
    },
    topActions: toObjectArray(payload.top_actions).map((item) => ({
      title: toString(item.title) || 'Top action',
      action: toString(item.action) || 'Tailor the resume to the highest-priority requirement.',
      priority: (toString(item.priority) || 'medium') as 'high' | 'medium' | 'low',
    })),
    matchScore: toNumber(payload.match_score),
    verdict: (toString(payload.verdict) || 'borderline') as JobMatchResultPayload['verdict'],
    requirements: toObjectArray(payload.requirements).map((item) => ({
      requirement: toString(item.requirement) || 'Role requirement',
      importance: (toString(item.importance) || 'preferred') as 'must' | 'preferred',
      status: (toString(item.status) || 'missing') as 'matched' | 'partial' | 'missing',
      resumeEvidence:
        toString(item.resume_evidence) || 'Specific supporting evidence was not returned.',
      suggestedFix:
        toString(item.suggested_fix) || 'Add a clearer example tied to this requirement.',
    })),
    matchedKeywords: toStringArray(payload.matched_keywords),
    missingKeywords: (() => {
      const raw = payload.missing_keywords
      if (!Array.isArray(raw)) return []
      return raw.map((item) => {
        if (typeof item === 'string') {
          return {
            keyword: item,
            contextual_guidance: '',
            anti_stuffing_note: '',
          }
        }
        if (item && typeof item === 'object') {
          const obj = item as AnyObject
          return {
            keyword: toString(obj.keyword) || toString(obj as unknown) || '',
            contextual_guidance: toString(obj.contextual_guidance) || '',
            anti_stuffing_note: toString(obj.anti_stuffing_note) || '',
          }
        }
        return { keyword: '', contextual_guidance: '', anti_stuffing_note: '' }
      }).filter((k) => k.keyword)
    })(),
    tailoringActions: toObjectArray(payload.tailoring_actions).map((item) => ({
      section: (toString(item.section) || 'experience') as 'summary' | 'experience' | 'skills' | 'projects',
      keyword: toString(item.keyword) || 'keyword',
      action: toString(item.action) || 'Add a more specific proof point for this keyword.',
    })),
    interviewFocus: toStringArray(payload.interview_focus),
    // No literal-default fallback — when the backend has no real signal it
    // returns ''. JobMatchView reads this via `hasRightContent` and hides
    // the recruiter card instead of rendering a "No recruiter summary was
    // returned." placeholder on the demo page.
    recruiterSummary: toString(payload.recruiter_summary),
  }
}

function normalizeCoverLetterSection(
  rawValue: unknown,
  fallbackText: string,
): CoverLetterSectionPayload {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue as AnyObject : {}

  return {
    text: toString(raw.text) || fallbackText,
    whyThisParagraph:
      toString(raw.why_this_paragraph) ||
      'This paragraph exists to reinforce fit for the role.',
    requirementsUsed: toStringArray(raw.requirements_used),
    evidenceUsed: toStringArray(raw.evidence_used),
  }
}

function composeCoverLetterText(parts: {
  opening: string
  bodyPoints: string[]
  closing: string
}) {
  return [parts.opening, ...parts.bodyPoints, parts.closing]
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n\n')
}

function normalizeCoverLetterPayload(payload: AnyObject): CoverLetterResultPayload {
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as AnyObject
    : {}
  const opening = normalizeCoverLetterSection(
    payload.opening,
    'Dear Hiring Manager,\n\nThis opening should connect your strongest fit to the role.',
  )
  const rawBodyPoints = toObjectArray(payload.body_points)
  const bodyPoints = rawBodyPoints.map((item, index) =>
    normalizeCoverLetterSection(item, `Body paragraph ${index + 1}`),
  )
  const closing = normalizeCoverLetterSection(
    payload.closing,
    'Thank you for your consideration.',
  )
  const fullText =
    toString(payload.full_text) ||
    composeCoverLetterText({
      opening: opening.text,
      bodyPoints: bodyPoints.map((item) => item.text),
      closing: closing.text,
    })

  return {
    summary: {
      headline: toString(summary.headline) || 'Targeted cover letter draft ready.',
      verdict: toString(summary.verdict) || 'Application-ready draft',
      confidence_note:
        toString(summary.confidence_note) || 'Advisory draft based on your resume and role context.',
    },
    topActions: toObjectArray(payload.top_actions).map((item) => ({
      title: toString(item.title) || 'Top action',
      action: toString(item.action) || 'Strengthen the most important paragraph with clearer evidence.',
      priority: (toString(item.priority) || 'medium') as 'high' | 'medium' | 'low',
    })),
    generatedAt: toString(payload.generated_at),
    opening,
    bodyPoints,
    closing,
    fullText,
    toneUsed: toString(payload.tone_used) || 'Professional',
    customizationNotes: toObjectArray(payload.customization_notes).map((item) => ({
      category: (toString(item.category) || 'evidence') as 'tone' | 'evidence' | 'keyword' | 'gap',
      note: toString(item.note) || 'No customization note was returned.',
      requirementsUsed: toStringArray(item.requirements_used),
      source: (toString(item.source) || 'job-match') as 'resume' | 'resume-analysis' | 'job-match' | 'job-description',
    })),
  }
}

function normalizeInterviewPayload(payload: AnyObject): InterviewResultPayload {
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as AnyObject
    : {}

  return {
    summary: {
      headline: toString(summary.headline) || 'Interview prep plan ready.',
      verdict: toString(summary.verdict) || 'Gap-first practice plan',
      confidence_note:
        toString(summary.confidence_note) || 'Advisory practice plan based on resume and role context.',
    },
    topActions: toObjectArray(payload.top_actions).map((item) => ({
      title: toString(item.title) || 'Top action',
      action: toString(item.action) || 'Practice your weakest signals before the interview.',
      priority: (toString(item.priority) || 'medium') as 'high' | 'medium' | 'low',
    })),
    generatedAt: toString(payload.generated_at),
    questions: toObjectArray(payload.questions).map((item, index) => ({
      question: toString(item.question) || `Question ${index + 1}`,
      answer: toString(item.answer),
      keyPoints: toStringArray(item.key_points),
      answerStructure: toStringArray(item.answer_structure),
      followUpQuestions: toStringArray(item.follow_up_questions),
      focusArea: toString(item.focus_area) || 'Core fit',
      whyAsked: toString(item.why_asked) || 'This checks whether you can make your fit feel concrete.',
      practiceFirst: Boolean(item.practice_first),
    })),
    focusAreas: toObjectArray(payload.focus_areas).map((item, index) => ({
      title: toString(item.title) || `Focus area ${index + 1}`,
      reason: toString(item.reason) || 'This is a major theme for the role.',
      requirementsUsed: toStringArray(item.requirements_used),
      practiceFirst: Boolean(item.practice_first),
    })),
    weakSignals: toObjectArray(payload.weak_signals_to_prepare).map((item, index) => ({
      title: toString(item.title) || `Weak signal ${index + 1}`,
      severity: (toString(item.severity) || 'medium') as 'high' | 'medium' | 'low',
      whyItMatters: toString(item.why_it_matters) || 'This may be a credibility gap if it comes up.',
      prepAction: toString(item.prep_action) || 'Prepare a specific example before the interview.',
      relatedRequirements: toStringArray(item.related_requirements),
    })),
    interviewerNotes: toStringArray(payload.interviewer_notes),
  }
}

/* ── Shared helpers ── */


function scoreGradient(score: number) {
  if (score >= 70) return { start: '#16a34a', end: '#4ade80' }
  if (score >= 41) return { start: '#d97706', end: '#fbbf24' }
  return { start: '#dc2626', end: '#f87171' }
}

function ScoreCircleSvg({
  score,
  size = 88,
  variant = 'hero',
  ariaLabel,
}: {
  score: number
  size?: number
  variant?: 'hero' | 'breakdown'
  ariaLabel?: string
}) {
  const isLarge = size >= 140
  const sw = isLarge ? 12 : 5
  const swActive = isLarge ? 12 : 5.5
  const r = (size / 2) - (isLarge ? 12 : 6)
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const grad = scoreGradient(score)
  const uid = `sg-${size}-${score}`

  return (
    <div
      className={`result-hero__score${variant === 'breakdown' ? ' result-hero__score--breakdown' : ''}${isLarge ? ' result-hero__score--large' : ''}`}
      style={{ width: size, height: size }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={grad.start} />
            <stop offset="100%" stopColor={grad.end} />
          </linearGradient>
          <filter id={`${uid}-glow`}>
            <feGaussianBlur stdDeviation={isLarge ? 5 : 3} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" opacity={isLarge ? 0.1 : 0.06} strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`url(#${uid})`}
          strokeWidth={swActive}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          filter={`url(#${uid}-glow)`}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className={`result-hero__score-content${variant === 'breakdown' ? ' result-hero__score-content--breakdown' : ''}`}>
        <AnimatedNumber value={score} className="result-hero__score-num" />
        {isLarge && <span className="result-hero__score-sub">/ 100</span>}
      </div>
    </div>
  )
}

const FIX_FIRST_ICONS = [FileEdit, Hash, TrendingUp] as const
const FIX_FIRST_CARD_STYLES = [
  { bg: '#fef3c7', text: '#b45309' },  // amber
  { bg: '#fee2e2', text: '#dc2626' },  // rose
  { bg: '#dbeafe', text: '#2563eb' },  // blue
] as const
const FIX_FIRST_LABELS: Record<string, string> = {
  high: 'High priority',
  medium: 'Urgent fix',
  low: 'Actionable',
}

function FixFirstStrip({ actions, showFooter = true }: { actions: Array<{ title: string; action: string; priority: string }>; showFooter?: boolean }) {
  const items = actions.slice(0, 3)
  if (items.length === 0) return null

  return (
    <div className="fix-first-strip stagger-entrance">
      {items.map((a, i) => {
        const Icon = FIX_FIRST_ICONS[i] || FileEdit
        const style = FIX_FIRST_CARD_STYLES[i] || FIX_FIRST_CARD_STYLES[0]
        return (
          <div key={`${a.title}-${i}`} className="fix-first-card">
            <div className="fix-first-card__icon" style={{ background: style.bg }}>
              <Icon size={18} style={{ color: style.text }} />
            </div>
            <div className="fix-first-card__content">
              <div className="fix-first-card__title">{a.title}</div>
              <div className="fix-first-card__desc">{a.action}</div>
              {showFooter && (
                <div className="fix-first-card__footer">
                  <span className="fix-first-card__priority" style={{ color: style.text }}>
                    {FIX_FIRST_LABELS[a.priority] || a.priority}
                  </span>
                  <ArrowRight size={16} style={{ color: 'var(--text-soft)' }} />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ResumeHeroExtra({ payload }: { payload: AnyObject }) {
  const result = normalizeResumePayload(payload)
  if (result.scoreBreakdown.length === 0) return null

  return (
    <div className="hero-breakdown-grid" style={{ position: 'relative' }}>
      {result.scoreBreakdown.map((item) => (
        <div key={item.key} className="hero-breakdown-item">
          <span className="hero-breakdown-label">{item.label}</span>
          <span className="hero-breakdown-value">{item.score}%</span>
          <div className="hero-breakdown-bar">
            <div
              className="hero-breakdown-fill"
              style={{
                width: `${item.score}%`,
                background: scoreColor(item.score),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ResumeResultView({ payload }: { payload: AnyObject }) {
  const result = normalizeResumePayload(payload)
  const { evidence } = result
  const hasKeywords = evidence.matchedKeywords.length > 0 || evidence.missingKeywords.length > 0
  const hasRightColumn = Boolean(result.roleFit)
  const matchLevel = result.roleFit
    ? result.roleFit.fitScore >= 70 ? 'High match' : result.roleFit.fitScore >= 40 ? 'Moderate' : 'Low match'
    : null

  return (
    <div className={hasRightColumn ? 'resume-body-grid' : 'resume-body-single'} style={{ padding: 'var(--rs-pad-y) var(--rs-pad-x)' }}>
      {/* ── Left column ── */}
      <div className="resume-body-left">
        {/* Detailed Feedback card */}
        <ScrollReveal>
        <div className="feedback-card">
          <div className="feedback-card__header">
            <span className="feedback-card__header-title">Detailed feedback</span>
          </div>
          <div className="feedback-card__body">
            {/* Strengths */}
            {result.strengths.length > 0 && (
              <div>
                <div className="feedback-eyebrow feedback-eyebrow--success">Major strengths</div>
                {result.strengths.slice(0, 4).map((s) => (
                  <div key={s} className="feedback-strength">
                    <CheckCircle2 size={20} fill="var(--success)" stroke="white" strokeWidth={2} className="feedback-strength__icon" />
                    <div>
                      <div className="feedback-strength__title">{s}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Issues */}
            {result.issues.length > 0 && (
              <div className="feedback-issues">
                <div className="feedback-eyebrow feedback-eyebrow--danger">Refinement areas</div>
                {result.issues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`feedback-issue${issue.severity === 'medium' ? ' feedback-issue--medium' : issue.severity === 'low' ? ' feedback-issue--low' : ''}`}
                  >
                    <div className="feedback-issue__title">{issue.title}</div>
                    <div className="feedback-issue__grid">
                      <div className="feedback-issue__box">
                        <span className="feedback-issue__box-label">Why it matters</span>
                        <p className="feedback-issue__box-text">{issue.whyItMatters}</p>
                      </div>
                      <div className="feedback-issue__box">
                        <span className="feedback-issue__box-label">Fix</span>
                        <p className="feedback-issue__box-text">{issue.fix}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </ScrollReveal>

        {/* Keyword Optimization card */}
        {hasKeywords && (
          <ScrollReveal>
          <div className="keyword-card">
            <div className="keyword-card__header">
              <span className="keyword-card__title">Keyword optimization</span>
              <div className="keyword-card__badges">
                {evidence.matchedKeywords.length > 0 && (
                  <span className="keyword-card__badge keyword-card__badge--matched">
                    {evidence.matchedKeywords.length} matched
                  </span>
                )}
                {evidence.missingKeywords.length > 0 && (
                  <span className="keyword-card__badge keyword-card__badge--missing">
                    {evidence.missingKeywords.length} missing
                  </span>
                )}
              </div>
            </div>
            <div className="chip-wrap" style={{ gap: '0.5rem' }}>
              {evidence.matchedKeywords.map((k) => (
                <span key={k} className="keyword-chip--accent">{k}</span>
              ))}
            </div>
            {evidence.missingKeywords.length > 0 && (
              <div className="keyword-missing-box">
                <div className="keyword-missing-label">Add these to rank higher</div>
                <div className="chip-wrap" style={{ gap: '0.5rem' }}>
                  {evidence.missingKeywords.map((k) => (
                    <span key={k} className="keyword-chip--missing">+ {k}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          </ScrollReveal>
        )}
      </div>

      {/* ── Right column (only when content exists) ── */}
      {hasRightColumn && (
      <div className="resume-body-right">
        {result.roleFit && (
          <ScrollReveal>
          <div className="rolefit-card">
            <div className="rolefit-card__header">
              <span className="rolefit-card__title">Role fit</span>
              {matchLevel && <span className="rolefit-card__badge">{matchLevel}</span>}
            </div>
            <div className="rolefit-bar">
              <div className="rolefit-bar__header">
                <span className="rolefit-bar__label">{result.roleFit.targetRoleLabel}</span>
                <span className="rolefit-bar__value">{result.roleFit.fitScore}%</span>
              </div>
              <div className="rolefit-bar__track">
                <div
                  className="rolefit-bar__fill"
                  style={{
                    width: `${result.roleFit.fitScore}%`,
                    background: result.roleFit.fitScore >= 70 ? 'var(--accent)' : result.roleFit.fitScore >= 40 ? 'var(--warning)' : 'var(--destructive)',
                  }}
                />
              </div>
            </div>
            {result.roleFit.rationale && (
              <p className="rs__meta" style={{ marginTop: '1rem' }}>{result.roleFit.rationale}</p>
            )}
          </div>
          </ScrollReveal>
        )}
      </div>
      )}
    </div>
  )
}

function JobMatchHeroExtra({ payload }: { payload: AnyObject }) {
  const result = normalizeJobMatchPayload(payload)
  const met = result.requirements.filter((r) => r.status === 'matched').length
  const totalReqs = result.requirements.length

  return (
    <div className="hero-stat-strip">
      {totalReqs > 0 && (
        <>
          <div className="hero-stat-strip__item">
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
            <span>{met}/{totalReqs} requirements met</span>
          </div>
          <div className="hero-stat-strip__divider" />
        </>
      )}
      <div className="hero-stat-strip__item">
        <Hash size={16} style={{ color: '#22c55e' }} />
        <span>{result.matchedKeywords.length} keywords matched</span>
      </div>
      <div className="hero-stat-strip__divider" />
      <div className="hero-stat-strip__item">
        <TrendingUp size={16} style={{ color: '#ef4444' }} />
        <span>{result.missingKeywords.length} missing</span>
      </div>
    </div>
  )
}

function JobMatchView({ payload }: { payload: AnyObject }) {
  const result = normalizeJobMatchPayload(payload)
  const hasRightContent = result.recruiterSummary || result.interviewFocus.length > 0

  return (
    <div className={hasRightContent ? 'resume-body-grid' : 'resume-body-single'} style={{ padding: 'var(--rs-pad-y) var(--rs-pad-x)' }}>
      {/* ── Left column ── */}
      <div className="resume-body-left">
        {/* Requirements card */}
        {result.requirements.length > 0 && (
        <ScrollReveal>
        <div className="feedback-card">
          <div className="feedback-card__header">
            <span className="feedback-card__header-title">Detailed requirements</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {result.requirements.filter((r) => r.status === 'matched').length} of {result.requirements.length} met
            </span>
          </div>
          <div className="feedback-card__body" style={{ padding: 0 }}>
            {result.requirements.map((item, index) => (
              <div
                key={`${item.requirement}-${index}`}
                style={{
                  padding: '1.25rem 1.5rem',
                  borderBottom: index < result.requirements.length - 1 ? '1px solid var(--divider)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{
                    width: '0.625rem', height: '0.625rem', borderRadius: '50%', flexShrink: 0,
                    background: statusTone(item.status),
                  }} />
                  <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-strong)', fontSize: '0.9375rem' }}>
                    {item.requirement}
                  </span>
                  <span className="chip chip--neutral" style={{ fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {item.importance}
                  </span>
                </div>
                {item.resumeEvidence && item.status === 'matched' && (
                  <div style={{
                    marginTop: '0.75rem', marginLeft: '1.375rem',
                    background: 'var(--surface-subtle)', borderRadius: 'var(--radius-md)',
                    padding: '0.75rem', border: '1px solid var(--divider)',
                  }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                      Resume evidence
                    </span>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-body)', lineHeight: 1.5 }}>{item.resumeEvidence}</p>
                  </div>
                )}
                {item.suggestedFix && item.status !== 'matched' && (
                  <div style={{
                    marginTop: '0.75rem', marginLeft: '1.375rem',
                    borderLeft: `2px solid ${statusTone(item.status)}`, paddingLeft: '1rem',
                  }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusTone(item.status), display: 'block', marginBottom: '0.25rem' }}>
                      Suggested fix
                    </span>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-body)', lineHeight: 1.5 }}>{item.suggestedFix}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        </ScrollReveal>
        )}

        {/* Tailoring Actions */}
        {result.tailoringActions.length > 0 && (
          <ScrollReveal>
          <div className="feedback-card">
            <div className="feedback-card__header">
              <span className="feedback-card__header-title">Tailoring actions</span>
            </div>
            <div className="feedback-card__body">
              {result.tailoringActions.map((a, i) => (
                <div
                  key={`${a.keyword}-${i}`}
                  className="step-card"
                  style={{ '--step-color': 'var(--accent)' } as React.CSSProperties}
                >
                  <div className="step-card__num">{i + 1}</div>
                  <div className="step-card__body">
                    <div className="step-card__title">{a.keyword} <span className="chip chip--neutral" style={{ fontSize: '0.625rem', marginLeft: '0.375rem' }}>{a.section}</span></div>
                    <div className="step-card__desc">{a.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          </ScrollReveal>
        )}

        {/* Keywords */}
        {(result.matchedKeywords.length > 0 || result.missingKeywords.length > 0) && (
          <ScrollReveal>
          <div className="keyword-card">
            <div className="keyword-card__header">
              <span className="keyword-card__title">Keyword breakdown</span>
              <div className="keyword-card__badges">
                {result.matchedKeywords.length > 0 && (
                  <span className="keyword-card__badge keyword-card__badge--matched">
                    {result.matchedKeywords.length} matched
                  </span>
                )}
                {result.missingKeywords.length > 0 && (
                  <span className="keyword-card__badge keyword-card__badge--missing">
                    {result.missingKeywords.length} missing
                  </span>
                )}
              </div>
            </div>
            <div className="chip-wrap" style={{ gap: '0.5rem' }}>
              {result.matchedKeywords.map((k) => (
                <span key={k} className="keyword-chip--accent">{k}</span>
              ))}
            </div>
            {result.missingKeywords.length > 0 && (
              <div className="keyword-missing-box">
                <div className="keyword-missing-label">Add these to rank higher</div>
                <div className="chip-wrap" style={{ gap: '0.5rem' }}>
                  {result.missingKeywords.map((k) => (
                    <span key={k.keyword} className="keyword-chip--missing">+ {k.keyword}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          </ScrollReveal>
        )}
      </div>

      {/* ── Right column ── */}
      {hasRightContent && (
      <div className="resume-body-right">
        {result.recruiterSummary && (
          <ScrollReveal>
          <div className="jm-recruiter-card">
            <div className="jm-recruiter-card__header">
              <span className="jm-recruiter-card__title">Recruiter summary</span>
              <span className="jm-recruiter-card__badge">How they see you</span>
            </div>
            <p className="jm-recruiter-card__body">{result.recruiterSummary}</p>
          </div>
          </ScrollReveal>
        )}
        {result.interviewFocus.length > 0 && (
          <ScrollReveal>
          <div className="jm-interview-card">
            <div className="jm-interview-card__header">Interview prep</div>
            <div className="jm-interview-card__items">
              {result.interviewFocus.map((f) => (
                <div key={f} className="jm-interview-card__item">
                  <ArrowRight size={14} className="jm-interview-card__item-icon" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
          </ScrollReveal>
        )}
      </div>
      )}
    </div>
  )
}

function CoverLetterHeroExtra({ payload }: { payload: AnyObject }) {
  const result = normalizeCoverLetterPayload(payload)
  const wordCount = result.fullText.split(/\s+/).filter(Boolean).length
  const reqCount = result.customizationNotes.length

  return (
    <div className="hero-stat-strip">
      <div className="hero-stat-strip__item">
        <span className="hero-stat-strip__label">Tone</span>
        <span className="hero-stat-strip__value">{result.toneUsed}</span>
      </div>
      <div className="hero-stat-strip__divider" />
      <div className="hero-stat-strip__item">
        <span className="hero-stat-strip__label">Length</span>
        <span className="hero-stat-strip__value">{wordCount} words</span>
      </div>
      {reqCount > 0 && (
        <>
          <div className="hero-stat-strip__divider" />
          <div className="hero-stat-strip__item">
            <span className="hero-stat-strip__label">Tailored for</span>
            <span className="hero-stat-strip__value">{reqCount} requirements</span>
          </div>
        </>
      )}
    </div>
  )
}

function CoverLetterView({ payload }: { payload: AnyObject }) {
  const result = normalizeCoverLetterPayload(payload)
  const [openingText, setOpeningText] = useState(result.opening.text)
  const [bodyTexts, setBodyTexts] = useState(result.bodyPoints.map((item) => item.text))
  const [closingText, setClosingText] = useState(result.closing.text)

  const compiledText = useMemo(
    () => composeCoverLetterText({ opening: openingText, bodyPoints: bodyTexts, closing: closingText }),
    [bodyTexts, closingText, openingText],
  )

  const bodyAnnotationLabels = ['Evidence loop', 'Culture fit', 'Value close']
  const annotationLabels = [
    'Hook strategy',
    ...result.bodyPoints.map((_b, idx) => bodyAnnotationLabels[idx] ?? 'Evidence loop'),
    'Closing',
  ]

  async function handleCopy() { await navigator.clipboard.writeText(compiledText) }
  function handleDownload() {
    const blob = new Blob([compiledText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'cover-letter.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="cl-body-grid">
      {/* Left: Document card */}
      <ScrollReveal>
      <div className="cl-document">
        <div className="cl-document__annotations">
          {[result.opening, ...result.bodyPoints, result.closing].map((_section, i) => (
            <span key={i} className="cl-document__annotation-label">
              {annotationLabels[i] ?? `Para ${i + 1}`}
            </span>
          ))}
        </div>
        <div className="cl-document__inner">
          <div className="cl-document__header">
            <div className="cl-document__date">{result.generatedAt || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          <div className="cl-document__paragraphs">
            <div className="cl-document__para-wrapper">
              <textarea
                className="cl-document__textarea"
                rows={3}
                value={openingText}
                onChange={(e) => setOpeningText(e.target.value)}
              />
            </div>
            {result.bodyPoints.map((_item, index) => (
              <div key={`body-${index}`} className="cl-document__para-wrapper">
                <textarea
                  className="cl-document__textarea"
                  rows={5}
                  value={bodyTexts[index] || ''}
                  onChange={(e) => setBodyTexts((c) => c.map((t, i) => i === index ? e.target.value : t))}
                />
              </div>
            ))}
          </div>
          <div className="cl-document__signoff">
            <textarea
              className="cl-document__textarea"
              rows={2}
              value={closingText}
              onChange={(e) => setClosingText(e.target.value)}
            />
            <p className="cl-document__signature-hint">Sincerely,<br />[Your name]</p>
          </div>
        </div>
      </div>
      </ScrollReveal>

      {/* Right: Sidebar */}
      <div className="cl-sidebar">
        {/* Customization notes */}
        {result.customizationNotes.length > 0 && (
          <div className="cl-notes-card">
            <div className="cl-notes-card__header">
              <Settings size={16} className="cl-notes-card__icon" />
              <span className="cl-notes-card__title">Customization notes</span>
            </div>
            <div className="cl-notes-card__list">
              {result.customizationNotes.map((n, i) => {
                const CatIcon =
                  n.category === 'tone' ? MessageSquare :
                  n.category === 'evidence' ? Star :
                  n.category === 'keyword' ? Hash :
                  n.category === 'gap' ? AlertCircle :
                  CheckCircle2
                return (
                  <div key={`${n.note}-${i}`} className="cl-notes-card__item">
                    <CatIcon size={15} className="cl-notes-card__check" />
                    <span>{n.note}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Action card */}
        <div className="cl-action-card">
          <div className="cl-action-card__title">Ready to apply?</div>
          <div className="cl-action-card__desc">Download your finalized document or copy the text directly into your application.</div>
          <div className="cl-action-card__buttons">
            <button className="cl-action-card__btn cl-action-card__btn--primary" onClick={handleCopy}>
              <Copy size={15} /> Copy full text
            </button>
            <button className="cl-action-card__btn cl-action-card__btn--secondary" onClick={handleDownload}>
              <Download size={15} /> Download TXT
            </button>
          </div>
        </div>

        {/* Letter strategy */}
        {result.opening.whyThisParagraph && (
          <div className="cl-strategy">
            <div className="cl-strategy__eyebrow">
              <Lightbulb size={12} />
              <span>Letter strategy</span>
            </div>
            <p className="cl-strategy__text">{result.opening.whyThisParagraph}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InterviewHeroExtra({ payload }: { payload: AnyObject }) {
  const result = normalizeInterviewPayload(payload)
  const practiceCount = result.questions.filter((q) => q.practiceFirst).length
  return (
    <div className="iv-hero-strip">
      <div className="iv-hero-stat">
        <span className="iv-hero-stat__label">Questions</span>
        <span className="iv-hero-stat__value iv-hero-stat__value--accent">{result.questions.length}</span>
      </div>
      <div className="iv-hero-stat">
        <span className="iv-hero-stat__label">Focus areas</span>
        <span className="iv-hero-stat__value">{result.focusAreas.length}</span>
      </div>
      {practiceCount > 0 && (
        <div className="iv-hero-stat">
          <span className="iv-hero-stat__label">Practice first</span>
          <span className="iv-hero-stat__value iv-hero-stat__value--warning">{practiceCount}</span>
        </div>
      )}
      {result.weakSignals.length > 0 && (
        <div className="iv-hero-stat">
          <span className="iv-hero-stat__label">Weak signals</span>
          <span className="iv-hero-stat__value iv-hero-stat__value--warning">{result.weakSignals.length}</span>
        </div>
      )}
    </div>
  )
}

function InterviewView({ payload }: { payload: AnyObject }) {
  const result = normalizeInterviewPayload(payload)
  const [showWeakestFirst, setShowWeakestFirst] = useState(false)
  const [practiceMode, setPracticeMode] = useState(false)

  const visibleQuestions = useMemo(() => {
    if (!showWeakestFirst) return result.questions
    return [...result.questions.filter((q) => q.practiceFirst), ...result.questions.filter((q) => !q.practiceFirst)]
  }, [showWeakestFirst, result.questions])

  if (practiceMode) {
    return (
      <InterviewPracticeMode
        questions={result.questions.map((q) => ({
          question: q.question,
          answerStructure: q.answerStructure,
          focusArea: q.focusArea,
          answer: q.answer,
          keyPoints: q.keyPoints,
        }))}
        onExit={() => setPracticeMode(false)}
      />
    )
  }

  function categoryColor(area: string) {
    const lower = area.toLowerCase()
    if (lower.includes('behav') || lower.includes('star')) return 'iv-qcard__category--behavioral'
    if (lower.includes('tech') || lower.includes('system') || lower.includes('design')) return 'iv-qcard__category--technical'
    if (lower.includes('lead') || lower.includes('growth') || lower.includes('manag')) return 'iv-qcard__category--leadership'
    return 'iv-qcard__category--default'
  }

  return (
    <div className="iv-body-grid">
      {/* Left: Question cards */}
      <ScrollReveal>
      <div className="iv-questions">
        <div className="iv-questions__header">
          <h2 className="iv-questions__title">
            <CheckCircle2 size={18} className="iv-questions__title-icon" />
            Question breakdown
          </h2>
          <div className="iv-questions__filters">
            <button
              className={`iv-questions__filter-btn${!showWeakestFirst ? ' iv-questions__filter-btn--active' : ''}`}
              onClick={() => setShowWeakestFirst(false)}
            >All</button>
            <button
              className={`iv-questions__filter-btn${showWeakestFirst ? ' iv-questions__filter-btn--active' : ''}`}
              onClick={() => setShowWeakestFirst(true)}
            >Weakest</button>
          </div>
        </div>

        {visibleQuestions.map((item, index) => (
          <div key={`${index}-${item.question}`} className={`iv-qcard${item.practiceFirst ? ' iv-qcard--practice' : ''}`}>
            <div className="iv-qcard__inner">
              <div className="iv-qcard__top">
                <div className="iv-qcard__meta">
                  <span className={`iv-qcard__category ${categoryColor(item.focusArea)}`}>
                    {item.focusArea}
                  </span>
                  <h3 className="iv-qcard__question">&ldquo;{item.question}&rdquo;</h3>
                </div>
                <div className="iv-qcard__score">
                  {item.practiceFirst ? (
                    <>
                      <div className="iv-qcard__score-icon iv-qcard__score-icon--warn">
                        <Info size={14} />
                      </div>
                    </>
                  ) : (
                    <div className="iv-qcard__score-icon iv-qcard__score-icon--good">
                      <CheckCircle2 size={14} />
                    </div>
                  )}
                </div>
              </div>

              {/* Answer or suggestion box */}
              {item.practiceFirst ? (
                <>
                  <div className="iv-qcard__suggestion">
                    <Lightbulb size={16} className="iv-qcard__suggestion-icon" />
                    <div className="iv-qcard__suggestion-text">
                      <strong>Focus area:</strong> {item.whyAsked}
                    </div>
                  </div>
                  {item.answer ? (
                    <details className="iv-qcard__sample">
                      <summary className="iv-qcard__sample-toggle">Show sample answer</summary>
                      <p className="iv-qcard__answer-text iv-qcard__answer-text--muted">{item.answer}</p>
                    </details>
                  ) : null}
                </>
              ) : item.answer ? (
                <div className="iv-qcard__answer">
                  <p className="iv-qcard__answer-text">{item.answer}</p>
                </div>
              ) : null}

              {/* Key points as chips */}
              {item.keyPoints.length > 0 && (
                <div className="iv-qcard__chips">
                  {item.keyPoints.slice(0, 3).map((p) => (
                    <span key={p} className={`iv-qcard__chip${item.practiceFirst ? ' iv-qcard__chip--warn' : ''}`}>
                      <CheckCircle2 size={12} /> {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      </ScrollReveal>

      {/* Right: Sidebar */}
      <div className="iv-sidebar">
        {/* Competency Map */}
        {result.focusAreas.length > 0 && (
          <div className="iv-competency-card">
            <div className="iv-competency-card__dark">
              <div className="iv-competency-card__title">Focus areas</div>
              <div className="iv-competency-card__bars">
                {result.focusAreas.map((area, i) => {
                  const barClass = area.practiceFirst ? 'iv-competency-bar__fill--warn' : i === 0 ? 'iv-competency-bar__fill--good' : 'iv-competency-bar__fill--ok'
                  return (
                    <div key={area.title} className="iv-competency-bar">
                      <div className="iv-competency-bar__header">
                        <span className="iv-competency-bar__label">{area.title}</span>
                      </div>
                      <div className="iv-competency-bar__track">
                        <div
                          className={`iv-competency-bar__fill ${barClass}`}
                          style={{ width: area.practiceFirst ? '45%' : `${85 - i * 8}%` }}
                        />
                      </div>
                      <p style={{ fontSize: '0.6875rem', color: '#c7d4e1', lineHeight: 1.5, marginTop: '0.25rem' }}>
                        {area.reason}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Weak signals */}
        {result.weakSignals.length > 0 && (
          <div className="iv-weak-signals-card">
            <div className="iv-weak-signals-card__title">Weak signals</div>
            <div className="iv-weak-signals-card__list">
              {result.weakSignals.map((w) => (
                <div key={w.title} className={`iv-weak-signal iv-weak-signal--${w.severity}`}>
                  <div className="iv-weak-signal__header">
                    <span className="iv-weak-signal__title">{w.title}</span>
                    <span className={`iv-weak-signal__badge iv-weak-signal__badge--${w.severity}`}>
                      {w.severity}
                    </span>
                  </div>
                  <p className="iv-weak-signal__action">{w.prepAction}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next actions */}
        <div className="iv-next-actions">
          <div className="iv-next-actions__title">Next actions</div>
          <div className="iv-next-action" onClick={() => setPracticeMode(true)}>
            <div className="iv-next-action__icon"><Zap size={16} /></div>
            <div className="iv-next-action__body">
              <div className="iv-next-action__name">Practice mode</div>
              <div className="iv-next-action__desc">Rehearse weak responses</div>
            </div>
            <ChevronRight size={14} className="iv-next-action__arrow" />
          </div>
        </div>

        {/* Interviewer notes */}
        {result.interviewerNotes.length > 0 && (
          <div className="iv-notes-card">
            <div className="iv-notes-card__title">Interviewer notes</div>
            {result.interviewerNotes.map((n) => (
              <div key={n} className="iv-notes-card__item">
                <CheckCircle2 size={14} className="iv-notes-card__check" />
                <span>{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function normalizeCareerPayload(payload: AnyObject): CareerResultPayload {
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as AnyObject
    : {}
  const recommendedDirection = payload.recommended_direction && typeof payload.recommended_direction === 'object'
    ? payload.recommended_direction as AnyObject
    : {}

  const fallbackPaths = toObjectArray(payload.paths).map((item, index) => ({
    roleTitle: toString(item.role_title || `Path ${index + 1}`),
    fitScore: toNumber(item.fit_score),
    transitionTimeline: toString(item.transition_timeline || 'Timeline not specified'),
    rationale: toString(item.rationale || 'This path can build on adjacent strengths with a focused gap-closure plan.'),
    strengthsToLeverage: toStringArray(item.strengths_to_leverage),
    gapsToClose: toStringArray(item.gaps_to_close),
    riskLevel: (toString(item.risk_level) || 'medium') as 'low' | 'medium' | 'high',
  }))

  const defaultRecommendedPath = fallbackPaths[0] ?? {
    roleTitle: 'No direction returned',
    fitScore: 0,
    transitionTimeline: 'Timeline not specified',
    rationale: 'Run the planner again for a clearer recommendation.',
    strengthsToLeverage: [],
    gapsToClose: [],
    riskLevel: 'medium' as const,
  }

  return {
    summary: {
      headline: toString(summary.headline) || 'The planner identified a strongest next direction.',
      verdict: toString(summary.verdict) || 'Best next move identified',
      confidence_note: toString(summary.confidence_note) || 'Advisory planning guidance only.',
    },
    topActions: toObjectArray(payload.top_actions).map((item) => ({
      title: toString(item.title) || 'Top action',
      action: toString(item.action) || 'Take the next strongest planning step.',
      priority: (toString(item.priority) || 'medium') as 'high' | 'medium' | 'low',
    })),
    recommendedDirection: {
      roleTitle: toString(recommendedDirection.role_title) || defaultRecommendedPath.roleTitle,
      fitScore: toNumber(recommendedDirection.fit_score) || defaultRecommendedPath.fitScore,
      transitionTimeline: toString(recommendedDirection.transition_timeline) || defaultRecommendedPath.transitionTimeline,
      whyNow: toString(recommendedDirection.why_now) || defaultRecommendedPath.rationale,
      confidence: (toString(recommendedDirection.confidence) || 'medium') as 'high' | 'medium' | 'low',
    },
    paths: fallbackPaths,
    currentSkills: toStringArray(payload.current_skills),
    targetSkills: toStringArray(payload.target_skills),
    skillGaps: toObjectArray(payload.skill_gaps).map((item) => ({
      skill: toString(item.skill) || 'Unspecified skill',
      urgency: (toString(item.urgency) || 'medium') as 'high' | 'medium' | 'low',
      whyItMatters: toString(item.why_it_matters) || 'This skill gap is reducing confidence in the transition plan.',
      howToBuild: toString(item.how_to_build) || 'Build one concrete proof point that shows this capability in action.',
    })),
    nextSteps: toObjectArray(payload.next_steps).map((item) => ({
      timeframe: toString(item.timeframe) || 'Next step',
      action: toString(item.action) || 'Take the next planning action.',
    })),
  }
}

function normalizePortfolioPayload(payload: AnyObject): PortfolioResultPayload {
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as AnyObject
    : {}
  const strategy = payload.portfolio_strategy && typeof payload.portfolio_strategy === 'object'
    ? payload.portfolio_strategy as AnyObject
    : {}

  const projects = toObjectArray(payload.projects).map((item, index) => ({
    projectTitle: toString(item.project_title || `Project ${index + 1}`),
    description: toString(item.description) || 'No project description was returned.',
    skills: toStringArray(item.skills),
    complexity: (toString(item.complexity) || 'intermediate') as 'foundational' | 'intermediate' | 'advanced',
    whyThisProject: toString(item.why_this_project) || 'This project creates direct proof for the role.',
    deliverables: toStringArray(item.deliverables),
    hiringSignals: toStringArray(item.hiring_signals),
    estimatedTimeline: toString(item.estimated_timeline) || '2-4 weeks',
  }))

  return {
    summary: {
      headline: toString(summary.headline) || 'The roadmap identifies the strongest first proof project.',
      verdict: toString(summary.verdict) || 'Proof roadmap ready',
      confidence_note: toString(summary.confidence_note) || 'Advisory portfolio guidance only.',
    },
    topActions: toObjectArray(payload.top_actions).map((item) => ({
      title: toString(item.title) || 'Top action',
      action: toString(item.action) || 'Build the strongest proof project next.',
      priority: (toString(item.priority) || 'medium') as 'high' | 'medium' | 'low',
    })),
    targetRole: toString(payload.target_role) || 'Target role',
    strategy: {
      headline: toString(strategy.headline) || 'Build a compact proof set for the target role.',
      focus: toString(strategy.focus) || 'Prioritize a small set of role-shaped projects over a wide collection of generic ideas.',
      proofGoal: toString(strategy.proof_goal) || 'Make the work easy for a hiring team to interpret quickly.',
    },
    projects,
    recommendedStartProject: toString(payload.recommended_start_project) || projects[0]?.projectTitle || 'No recommended project returned',
    sequencePlan: toObjectArray(payload.sequence_plan).map((item, index) => ({
      order: toNumber(item.order) || index + 1,
      projectTitle: toString(item.project_title) || projects[index]?.projectTitle || `Project ${index + 1}`,
      reason: toString(item.reason) || 'This slot keeps the roadmap realistic and cumulative.',
    })),
    presentationTips: toStringArray(payload.presentation_tips),
  }
}

function CareerHeroExtra({ payload }: { payload: AnyObject }) {
  const result = normalizeCareerPayload(payload)
  const score = result.recommendedDirection.fitScore
  const gapCount = result.skillGaps.length
  const timeline = result.recommendedDirection.transitionTimeline

  return (
    <div className="hero-stat-strip">
      <div className="hero-stat-strip__item">
        <span className="hero-stat-strip__label">Fit score</span>
        <span className="hero-stat-strip__value">{score}%</span>
      </div>
      {timeline && (
        <>
          <div className="hero-stat-strip__divider" />
          <div className="hero-stat-strip__item">
            <span className="hero-stat-strip__label">Timeline</span>
            <span className="hero-stat-strip__value">{timeline}</span>
          </div>
        </>
      )}
      {gapCount > 0 && (
        <>
          <div className="hero-stat-strip__divider" />
          <div className="hero-stat-strip__item">
            <span className="hero-stat-strip__label">Skill gaps</span>
            <span className="hero-stat-strip__value">{gapCount} to close</span>
          </div>
        </>
      )}
    </div>
  )
}

function CareerView({ payload }: { payload: AnyObject }) {
  const result = normalizeCareerPayload(payload)
  const altPaths = result.paths.filter((p) => p.roleTitle !== result.recommendedDirection.roleTitle)

  return (
    <div className="cp-body-grid">
      {/* Left: Main content */}
      <ScrollReveal>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Primary recommended path */}
        <div className="cp-primary-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <div className="cp-primary-card__badge">Recommended path</div>
              <div className="cp-primary-card__title">{result.recommendedDirection.roleTitle}</div>
            </div>
            <span className="cp-primary-card__timeline">{result.recommendedDirection.transitionTimeline}</span>
          </div>

          <div className="cp-primary-card__body">
            <div>
              <div className="cp-primary-card__why-title">Why this is your ideal next step</div>
              <p className="cp-primary-card__why-text">{result.recommendedDirection.whyNow}</p>
              <div className="cp-primary-card__benefits">
                {result.paths[0]?.strengthsToLeverage.slice(0, 3).map((s) => (
                  <div key={s} className="cp-primary-card__benefit">
                    <TrendingUp size={14} className="cp-primary-card__benefit-icon" />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {(result.targetSkills.length > 0 || result.currentSkills.length > 0) && (
            <div className="cp-skills-block">
              {result.targetSkills.length > 0 && (
                <div className="cp-skills-row">
                  <div className="cp-skills-row__label">Skills to develop next</div>
                  <div className="cp-skills-row__chips">
                    {result.targetSkills.map((skill) => (
                      <span key={skill} className="cp-skill-chip cp-skill-chip--target">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
              {result.currentSkills.length > 0 && (
                <div className="cp-skills-row cp-skills-row--secondary">
                  <div className="cp-skills-row__label">Skills you already bring</div>
                  <div className="cp-skills-row__chips">
                    {result.currentSkills.map((skill) => (
                      <span key={skill} className="cp-skill-chip cp-skill-chip--current">{skill}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Numbered roadmap */}
          {result.nextSteps.length > 0 && (
            <div className="cp-roadmap">
              <div className="cp-roadmap__title">The {result.nextSteps.length}-step roadmap</div>
              <div className="cp-roadmap__steps">
                {result.nextSteps.map((step, i) => (
                  <div key={`${step.timeframe}-${i}`} className="cp-roadmap__step">
                    <div className={`cp-roadmap__num ${i < 2 ? 'cp-roadmap__num--filled' : 'cp-roadmap__num--outline'}`}>{i + 1}</div>
                    <div className="cp-roadmap__step-body">
                      <div className="cp-roadmap__step-title">{step.timeframe}</div>
                      <div className="cp-roadmap__step-desc">{step.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Skill gaps table */}
        {result.skillGaps.length > 0 && (
          <div className="cp-gaps-card">
            <div className="cp-gaps-card__header">
              <span className="cp-gaps-card__title">Critical skill gaps</span>
              <span className="cp-gaps-card__count">{result.skillGaps.length} gaps</span>
            </div>
            {result.skillGaps.map((g) => (
              <div key={g.skill} className="cp-gap-row">
                <div className={`cp-gap-row__dot cp-gap-row__dot--${g.urgency}`} />
                <div className="cp-gap-row__body">
                  <div className="cp-gap-row__skill">{g.skill}</div>
                  <div className="cp-gap-row__desc">{g.whyItMatters}</div>
                </div>
                <div className="cp-gap-row__action">
                  {g.howToBuild.split(' ').slice(0, 2).join(' ')}
                  <ArrowRight size={12} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </ScrollReveal>

      {/* Right: Sidebar */}
      <div className="cp-sidebar">
        {/* Alternative paths */}
        {altPaths.length > 0 && (
          <div className="cp-alt-paths">
            <div className="cp-alt-paths__title">Alternative paths</div>
            {altPaths.map((p, idx) => (
              <div key={p.roleTitle} className="cp-alt-card">
                <div className="cp-alt-card__header">
                  <span className="cp-alt-card__rank">#{idx + 1} alt</span>
                  <span className="cp-alt-card__score" style={{ color: scoreColor(p.fitScore) }}>{p.fitScore}%</span>
                </div>
                <div className="cp-alt-card__name">{p.roleTitle}</div>
                <div className="cp-alt-card__score-bar">
                  <div className="cp-alt-card__score-fill" style={{ width: `${p.fitScore}%`, background: scoreColor(p.fitScore) }} />
                </div>
                <p className="cp-alt-card__desc">{p.rationale}</p>
                <div className="cp-alt-card__footer">
                  <span className="cp-alt-card__timeline">{p.transitionTimeline}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pro tip */}
        <div className="cp-tip-card">
          <div className="cp-tip-card__eyebrow">
            <Lightbulb size={12} />
            <span>Pro tip</span>
          </div>
          <p className="cp-tip-card__text">
            {result.recommendedDirection.confidence === 'high'
              ? 'Your profile strongly matches this direction. Focus on closing the remaining skill gaps to maximize your timeline.'
              : 'Document your cross-team wins and build visible proof points to strengthen your candidacy.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function PortfolioHeroExtra({ payload }: { payload: AnyObject }) {
  const result = normalizePortfolioPayload(payload)
  const projectCount = result.projects.length
  const hasSequence = result.sequencePlan.length > 0

  return (
    <div className="hero-stat-strip">
      <div className="hero-stat-strip__item">
        <span className="hero-stat-strip__label">Projects</span>
        <span className="hero-stat-strip__value">{projectCount} in sequence</span>
      </div>
      {result.targetRole && (
        <>
          <div className="hero-stat-strip__divider" />
          <div className="hero-stat-strip__item">
            <span className="hero-stat-strip__label">Target role</span>
            <span className="hero-stat-strip__value">{result.targetRole}</span>
          </div>
        </>
      )}
      {hasSequence && (
        <>
          <div className="hero-stat-strip__divider" />
          <div className="hero-stat-strip__item">
            <span className="hero-stat-strip__label">Start with</span>
            <span className="hero-stat-strip__value">{result.recommendedStartProject.split(' ').slice(0, 3).join(' ')}{result.recommendedStartProject.split(' ').length > 3 ? '…' : ''}</span>
          </div>
        </>
      )}
    </div>
  )
}

function PortfolioView({ payload }: { payload: AnyObject }) {
  const result = normalizePortfolioPayload(payload)
  const isStartProject = (title: string) =>
    title.toLowerCase() === result.recommendedStartProject.toLowerCase()

  // Collect all unique deliverables across projects
  const allDeliverables = result.projects.flatMap((p) => p.deliverables).filter((d, i, arr) => arr.indexOf(d) === i).slice(0, 5)

  return (
    <div className="pf-body-grid">
      {/* Left: Build sequence */}
      <ScrollReveal>
      <div className="pf-sequence">
        <h3 className="pf-sequence__title">
          <Hash size={18} className="pf-sequence__title-icon" />
          The build sequence
        </h3>
        <div className="pf-sequence__items">
          {result.projects.map((project, i) => {
            const isStart = isStartProject(project.projectTitle)
            return (
              <div key={project.projectTitle} className="pf-sequence-item">
                <div className={`pf-sequence-item__num ${isStart ? 'pf-sequence-item__num--start' : 'pf-sequence-item__num--default'}`}>
                  {i + 1}
                </div>
                <div className="pf-project-card">
                  <div className="pf-project-card__top">
                    <div>
                      <div className="pf-project-card__title-row">
                        {isStart && <span className="pf-project-card__start-badge">Start here</span>}
                        <span className="pf-project-card__title">{project.projectTitle}</span>
                      </div>
                      <p className="pf-project-card__desc">{project.description}</p>
                    </div>
                    <div className="pf-project-card__complexity">
                      <div className="pf-project-card__complexity-label">Complexity</div>
                      <div className="pf-project-card__complexity-value">{project.complexity}</div>
                    </div>
                  </div>

                  <div className="pf-project-card__why" style={{ borderLeftColor: isStart ? 'var(--accent)' : i === 1 ? '#16a34a' : '#d97706' }}>
                    <div className="pf-project-card__why-title">Why this project</div>
                    <p className="pf-project-card__why-text">{project.whyThisProject}</p>
                  </div>

                  {project.skills.length > 0 && (
                    <div className="pf-project-card__skills">
                      {project.skills.slice(0, 4).map((s) => (
                        <span key={s} className="pf-skill-chip">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </ScrollReveal>

      {/* Right: Sidebar */}
      <div className="pf-sidebar">
        {/* Presentation tips */}
        {result.presentationTips.length > 0 && (
          <div className="pf-tips-card">
            <div className="pf-tips-card__title">
              <Lightbulb size={16} className="pf-tips-card__title-icon" />
              Presentation tips
            </div>
            <div className="pf-tips-card__list">
              {result.presentationTips.map((tip, i) => (
                <div key={tip} className="pf-tips-card__item">
                  <div className="pf-tips-card__item-label">Tip {i + 1}</div>
                  <p className="pf-tips-card__item-text">{tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deliverables checklist */}
        {allDeliverables.length > 0 && (
          <div className="pf-deliverables-card">
            <div className="pf-deliverables-card__title">Key deliverables</div>
            <div className="pf-deliverables-card__list">
              {allDeliverables.map((d) => (
                <div key={d} className="pf-deliverables-card__item">
                  <CheckCircle2 size={14} className="pf-deliverables-card__check" />
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strategy card */}
        <div className="pf-strategy-card">
          <div className="pf-strategy-card__header">
            <Target size={15} className="pf-strategy-card__icon" />
            <span className="pf-strategy-card__title">Strategy</span>
          </div>
          <p className="pf-strategy-card__headline">{result.strategy.headline}</p>
          <p className="pf-strategy-card__focus">{result.strategy.focus}</p>
        </div>
      </div>
    </div>
  )
}

function resumeCopyText(payload: AnyObject) {
  const result = normalizeResumePayload(payload)
  const lines = [
    `Resume score: ${result.overallScore}/100`,
    `Verdict: ${result.summary.verdict}`,
    result.summary.headline,
    '',
    'Top actions:',
    ...result.topActions.slice(0, 3).map((action) => `- ${action.title}: ${action.action}`),
    '',
    'Strong signals:',
    ...result.strengths.map((item) => `- ${item}`),
  ]
  return lines.join('\n')
}

function jobMatchCopyText(payload: AnyObject) {
  const result = normalizeJobMatchPayload(payload)
  const lines = [
    `Match score: ${result.matchScore}%`,
    `Verdict: ${result.verdict}`,
    result.summary.headline,
    '',
    'Top actions:',
    ...result.topActions.slice(0, 3).map((action) => `- ${action.title}: ${action.action}`),
    '',
    `Missing keywords: ${result.missingKeywords.map((k) => k.keyword).join(', ') || 'None'}`,
    '',
    result.recruiterSummary,
  ]
  return lines.join('\n')
}

function coverLetterCopyText(payload: AnyObject) {
  const result = normalizeCoverLetterPayload(payload)
  return composeCoverLetterText({
    opening: result.opening.text,
    bodyPoints: result.bodyPoints.map((item) => item.text),
    closing: result.closing.text,
  }) || result.fullText
}

function interviewCopyText(payload: AnyObject) {
  const result = normalizeInterviewPayload(payload)
  const lines = [
    result.summary.headline,
    '',
    'Top actions:',
    ...result.topActions.slice(0, 3).map((item) => `- ${item.title}: ${item.action}`),
    '',
    'Questions:',
    ...result.questions.map((item) => `- ${item.question}`),
    '',
    'Weak signals:',
    ...result.weakSignals.map((item) => `- ${item.title}: ${item.prepAction}`),
  ]
  return lines.join('\n')
}

function careerCopyText(payload: AnyObject) {
  const result = normalizeCareerPayload(payload)
  const lines = [
    `Recommended direction: ${result.recommendedDirection.roleTitle} (${result.recommendedDirection.fitScore}% fit)`,
    `Transition timeline: ${result.recommendedDirection.transitionTimeline}`,
    result.summary.headline,
    '',
    'Why now:',
    result.recommendedDirection.whyNow,
    '',
    'Top actions:',
    ...result.topActions.slice(0, 3).map((item) => `- ${item.title}: ${item.action}`),
    '',
    'Alternative paths:',
    ...result.paths.map((item) => `- ${item.roleTitle} (${item.fitScore}% fit, ${item.riskLevel} risk)`),
  ]
  return lines.join('\n')
}

function portfolioCopyText(payload: AnyObject) {
  const result = normalizePortfolioPayload(payload)
  const lines = [
    `Target role: ${result.targetRole}`,
    `Start with: ${result.recommendedStartProject}`,
    result.summary.headline,
    '',
    'Strategy:',
    result.strategy.headline,
    result.strategy.focus,
    '',
    'Top actions:',
    ...result.topActions.slice(0, 3).map((item) => `- ${item.title}: ${item.action}`),
    '',
    'Project roadmap:',
    ...result.sequencePlan.map((item) => `- Step ${item.order}: ${item.projectTitle} - ${item.reason}`),
  ]
  return lines.join('\n')
}

export type ResultDefinition = {
  copyText: (payload: AnyObject, item: ToolRunDetail) => string
  download?: (payload: AnyObject, item: ToolRunDetail) => {
    filename: string
    content: string
  } | null
  render: (payload: AnyObject, item: ToolRunDetail, tool: ToolDefinition) => ReactNode
  heroMetric?: (payload: AnyObject) => ReactNode
  insightStrip?: (payload: AnyObject) => { label: string; value: string; color?: string }[]
  heroVariant?: 'dark' | 'default'
  heroExtra?: (payload: AnyObject) => ReactNode
  /** Content rendered between hero and main content card (e.g. Fix First strip) */
  midSection?: (payload: AnyObject) => ReactNode
}

export const resultDefinitions: Record<ToolId, ResultDefinition> = {
  resume: {
    copyText: (payload) => resumeCopyText(payload),
    heroVariant: 'dark',
    heroMetric: (payload) => {
      const r = normalizeResumePayload(payload)
      return (
        <ScoreCircleSvg
          score={r.overallScore}
          size={192}
          ariaLabel={`Resume score: ${r.overallScore} out of 100`}
        />
      )
    },
    heroExtra: (payload) => <ResumeHeroExtra payload={payload} />,
    midSection: (payload) => <FixFirstStrip actions={normalizeResumePayload(payload).topActions} />,
    render: (payload) => <ResumeResultView payload={payload} />,
  },
  'job-match': {
    copyText: (payload) => jobMatchCopyText(payload),
    heroVariant: 'dark',
    heroMetric: (payload) => {
      const r = normalizeJobMatchPayload(payload)
      return (
        <ScoreCircleSvg
          score={r.matchScore}
          size={192}
          ariaLabel={`Job match score: ${r.matchScore} out of 100`}
        />
      )
    },
    heroExtra: (payload) => <JobMatchHeroExtra payload={payload} />,
    midSection: (payload) => <FixFirstStrip actions={normalizeJobMatchPayload(payload).topActions} showFooter={false} />,
    render: (payload) => <JobMatchView payload={payload} />,
  },
  'cover-letter': {
    copyText: (payload) => coverLetterCopyText(payload),
    download: (payload, item) => ({
      filename: `${item.label || 'cover-letter'}.txt`,
      content: coverLetterCopyText(payload),
    }),
    heroExtra: (payload) => <CoverLetterHeroExtra payload={payload} />,
    midSection: (payload) => <FixFirstStrip actions={normalizeCoverLetterPayload(payload).topActions} />,
    render: (payload) => <CoverLetterView payload={payload} />,
  },
  interview: {
    copyText: (payload) => interviewCopyText(payload),
    heroVariant: 'dark',
    heroExtra: (payload) => <InterviewHeroExtra payload={payload} />,
    midSection: (payload) => <FixFirstStrip actions={normalizeInterviewPayload(payload).topActions} />,
    render: (payload) => <InterviewView payload={payload} />,
  },
  career: {
    copyText: (payload) => careerCopyText(payload),
    heroVariant: 'dark',
    heroExtra: (payload) => <CareerHeroExtra payload={payload} />,
    midSection: (payload) => <FixFirstStrip actions={normalizeCareerPayload(payload).topActions} />,
    render: (payload) => <CareerView payload={payload} />,
  },
  portfolio: {
    copyText: (payload) => portfolioCopyText(payload),
    heroExtra: (payload) => <PortfolioHeroExtra payload={payload} />,
    midSection: (payload) => <FixFirstStrip actions={normalizePortfolioPayload(payload).topActions} />,
    render: (payload) => <PortfolioView payload={payload} />,
  },
}
