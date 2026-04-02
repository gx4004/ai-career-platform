import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Copy,
  Download,
} from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { FadeUp, ScrollReveal, AnimatedNumber } from '#/components/ui/motion'
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

function priorityTone(priority: 'high' | 'medium' | 'low') {
  if (priority === 'high') return 'var(--destructive)'
  if (priority === 'medium') return 'var(--warning)'
  return 'var(--success)'
}

function statusTone(status: 'matched' | 'partial' | 'missing') {
  if (status === 'matched') return 'var(--success)'
  if (status === 'partial') return 'var(--warning)'
  return 'var(--destructive)'
}

function riskTone(level: 'low' | 'medium' | 'high') {
  if (level === 'high') return 'var(--destructive)'
  if (level === 'medium') return 'var(--warning)'
  return 'var(--success)'
}

function complexityTone(level: 'foundational' | 'intermediate' | 'advanced') {
  if (level === 'advanced') return 'var(--destructive)'
  if (level === 'intermediate') return 'var(--warning)'
  return 'var(--success)'
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
    recruiterSummary: toString(payload.recruiter_summary) || 'No recruiter summary was returned.',
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
      answer: toString(item.answer) || 'No sample answer was returned.',
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
}: {
  score: number
  size?: number
  variant?: 'hero' | 'breakdown'
}) {
  const r = (size / 2) - 6
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const grad = scoreGradient(score)
  const uid = `sg-${size}-${score}`

  return (
    <div
      className={`result-hero__score${variant === 'breakdown' ? ' result-hero__score--breakdown' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={grad.start} />
            <stop offset="100%" stopColor={grad.end} />
          </linearGradient>
          <filter id={`${uid}-glow`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" opacity={0.06} strokeWidth="5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`url(#${uid})`}
          strokeWidth="5.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          filter={`url(#${uid}-glow)`}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className={`result-hero__score-content${variant === 'breakdown' ? ' result-hero__score-content--breakdown' : ''}`}>
        <AnimatedNumber value={score} className="result-hero__score-num" />
      </div>
    </div>
  )
}

function ResumeResultView({ payload }: { payload: AnyObject }) {
  const result = normalizeResumePayload(payload)

  return (
    <>
      {/* Score breakdown — radial gauges */}
      <FadeUp delay={0.05}>
      <div className="rs">
        <h3 className="result-heading">Score Breakdown</h3>
        <div className="section-card-grid--responsive-5 stagger-entrance">
          {result.scoreBreakdown.map((item) => (
            <div key={item.key} className="score-gauge">
              <ScoreCircleSvg score={item.score} size={104} variant="breakdown" />
              <span className="score-gauge__label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      </FadeUp>

      {/* Strengths / Gaps — card-based */}
      <FadeUp delay={0.15}>
      <div className="rs">
        <div className="section-card-grid section-card-grid--2">
          <div className="section-card section-card--success-left">
            <h3 className="result-label" style={{ color: 'var(--success)' }}>Strengths</h3>
            <div className="section-card-grid" style={{ gap: '0.375rem' }}>
              {result.strengths.slice(0, 4).map((s) => (
                <div key={s} className="strength-item">
                  <span className="strength-item__icon">&#10003;</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
          {result.issues.length > 0 ? (
            <div className="section-card section-card--warning-left">
              <h3 className="result-label" style={{ color: 'var(--warning)' }}>Gaps</h3>
              <div className="section-card-grid" style={{ gap: '0.375rem' }}>
                {result.issues.slice(0, 3).map((i) => (
                  <div key={i.id} className="gap-item">
                    <span className="gap-item__icon" style={{ color: priorityTone(i.severity) }}>&#9888;</span>
                    <span>{i.title}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </FadeUp>

      {/* Fix first — numbered step cards */}
      <ScrollReveal>
      <div className="rs">
        <h3 className="result-heading">Fix First</h3>
        <div className="section-card-grid stagger-entrance">
          {result.topActions.slice(0, 3).map((a, i) => (
            <div
              key={`${a.title}-${i}`}
              className="step-card"
              style={{ '--step-color': priorityTone(a.priority) } as React.CSSProperties}
            >
              <div className="step-card__num">{i + 1}</div>
              <div className="step-card__body">
                <div className="step-card__title">{a.title}</div>
                <div className="step-card__desc">{a.action}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      </ScrollReveal>

      {/* Keywords (only when job comparison data exists) */}
      {(result.evidence.matchedKeywords.length > 0 || result.evidence.missingKeywords.length > 0) ? (
        <ScrollReveal>
        <div className="rs">
          <h3 className="result-heading">Keywords</h3>
          <div className="chip-wrap">
            {result.evidence.matchedKeywords.map((k) => (
              <span key={k} className="chip chip--positive"><span className="chip__dot" /> {k}</span>
            ))}
            {result.evidence.missingKeywords.map((k) => (
              <span key={k} className="chip chip--outline-warning"><span className="chip__dot" /> {k}</span>
            ))}
          </div>
        </div>
        </ScrollReveal>
      ) : null}

      {/* What we found in your resume */}
      <ScrollReveal>
      <div className="rs">
        <h3 className="result-heading">What we found in your resume</h3>
        <div className="section-card-grid section-card-grid--2">
          {result.evidence.detectedSections.length > 0 ? (
            <div className="section-card">
              <h4 className="result-label">Detected sections</h4>
              <div className="chip-wrap">
                {result.evidence.detectedSections.map((s) => (
                  <span key={s} className="chip chip--neutral">{s}</span>
                ))}
              </div>
            </div>
          ) : null}
          {result.evidence.detectedSkills.length > 0 ? (
            <div className="section-card">
              <h4 className="result-label">Skills identified</h4>
              <div className="chip-wrap">
                {result.evidence.detectedSkills.map((s) => (
                  <span key={s} className="chip chip--positive">{s}</span>
                ))}
              </div>
              {result.evidence.quantifiedBullets > 0 ? (
                <p className="rs__meta" style={{ marginTop: '0.625rem' }}>
                  {result.evidence.quantifiedBullets} quantified achievement{result.evidence.quantifiedBullets !== 1 ? 's' : ''} found
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      </ScrollReveal>

      {/* Issues — styled cards */}
      {result.issues.length > 0 ? (
        <ScrollReveal>
        <div className="rs">
          <h3 className="result-heading">Issues ({result.issues.length})</h3>
          <Accordion type="single" collapsible className="issue-card-list">
            {result.issues.map((issue) => (
              <AccordionItem key={issue.id} value={issue.id} className="issue-card">
                <AccordionTrigger className="issue-card__trigger">
                  <span className="issue-card__header">
                    <span className="issue-card__severity" style={{ background: priorityTone(issue.severity) }} />
                    <span className="issue-card__title">{issue.title}</span>
                    <span className="chip chip--neutral" style={{ fontSize: '0.6875rem' }}>{issue.category}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="issue-card__body">
                    <p className="rs__body">{issue.whyItMatters}</p>
                    <div className="issue-card__fix">
                      <strong>Fix:</strong> {issue.fix}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
        </ScrollReveal>
      ) : null}

      {/* Role fit */}
      {result.roleFit ? (
        <ScrollReveal>
        <div className="rs">
          <div className="section-card section-card--accent-left" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <ScoreCircleSvg score={result.roleFit.fitScore} size={64} />
            <div>
              <h3 className="result-heading" style={{ margin: 0 }}>Role Fit: {result.roleFit.targetRoleLabel}</h3>
              <p className="rs__meta" style={{ marginTop: '0.25rem' }}>{result.roleFit.rationale}</p>
            </div>
          </div>
        </div>
        </ScrollReveal>
      ) : null}
    </>
  )
}

function JobMatchView({ payload }: { payload: AnyObject }) {
  const result = normalizeJobMatchPayload(payload)

  return (
    <>
      {/* Requirements — card grid */}
      <div className="rs">
        <h3 className="result-heading">Requirements</h3>
        <div className="section-card-grid stagger-entrance">
          {result.requirements.map((item, index) => (
            <div key={`${item.requirement}-${index}`} className="req-card">
              <div className="req-card__status">
                <span className="req-card__dot" style={{ background: statusTone(item.status) }} />
                <span className="req-card__status-label" style={{ color: statusTone(item.status) }}>
                  {item.status}
                </span>
              </div>
              <div className="req-card__name">{item.requirement}</div>
              <div className="req-card__footer">
                <span className="chip chip--neutral" style={{ fontSize: '0.6875rem' }}>
                  {item.importance}
                </span>
              </div>
              {item.resumeEvidence ? (
                <p className="req-card__evidence">{item.resumeEvidence}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Keywords + Tailoring */}
      <div className="rs rs--2col">
        <div>
          <h3 className="result-label">Keyword coverage</h3>
          <div className="chip-wrap">
            {result.matchedKeywords.map((k) => (
              <span key={k} className="chip chip--positive"><span className="chip__dot" /> {k}</span>
            ))}
          </div>
          {result.missingKeywords.length > 0 ? (
            <div style={{ marginTop: '0.75rem' }}>
              <h3 className="result-label" style={{ color: 'var(--warning)' }}>Missing keywords</h3>
              <div className="section-card-grid">
                {result.missingKeywords.map((k) => (
                  <div key={k.keyword} className="section-card section-card--warning-left">
                    <div className="step-card__title">{k.keyword}</div>
                    {k.contextual_guidance ? (
                      <p className="step-card__desc" style={{ marginTop: '0.25rem' }}>{k.contextual_guidance}</p>
                    ) : null}
                    {k.anti_stuffing_note ? (
                      <p className="rs__meta" style={{ marginTop: '0.25rem', fontStyle: 'italic' }}>{k.anti_stuffing_note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div>
          {result.tailoringActions.length > 0 ? (
            <>
              <h3 className="result-label">Tailoring actions</h3>
              <div className="section-card-grid">
                {result.tailoringActions.slice(0, 3).map((a, i) => (
                  <div
                    key={`${a.keyword}-${i}`}
                    className="step-card"
                    style={{ '--step-color': 'var(--accent)' } as React.CSSProperties}
                  >
                    <div className="step-card__num step-card__num--badge">{a.section}</div>
                    <div className="step-card__body">
                      <div className="step-card__title">{a.keyword}</div>
                      <div className="step-card__desc">{a.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Recruiter summary — premium card (always visible) */}
      <div className="rs">
        <div className="section-card section-card--accent-left">
          <h3 className="result-heading" style={{ margin: '0 0 0.5rem' }}>Recruiter Summary</h3>
          <p className="rs__body">{result.recruiterSummary}</p>
        </div>
      </div>

      {/* Interview focus */}
      {result.interviewFocus.length > 0 ? (
        <div className="rs">
          <h3 className="result-label">Interview focus</h3>
          <div className="chip-wrap">
            {result.interviewFocus.map((f) => (
              <span key={f} className="chip chip--neutral"><span className="chip__dot" /> {f}</span>
            ))}
          </div>
        </div>
      ) : null}
    </>
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

  async function handleCopy() { await navigator.clipboard.writeText(compiledText) }
  function handleDownload() {
    const blob = new Blob([compiledText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'cover-letter.txt'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="rs rs--cover">
      {/* Left: Letter preview */}
      <div>
        <div className="cover-letter-header">
          <h3 className="result-heading">Letter preview</h3>
          <div className="cover-letter-actions">
            <Button variant="outline" size="sm" onClick={handleCopy}><Copy size={13} /> Copy</Button>
            <Button variant="outline" size="sm" onClick={handleDownload}><Download size={13} /></Button>
          </div>
        </div>
        <div className="document-preview document-preview--premium">{compiledText || result.fullText}</div>
      </div>

      {/* Right: Editor + Notes */}
      <div>
        <h3 className="result-heading">Edit</h3>
        <div className="section-card-grid">
          <div className="section-card">
            <span className="result-label">Opening</span>
            <Textarea rows={4} value={openingText} onChange={(e) => setOpeningText(e.target.value)} />
          </div>
          {result.bodyPoints.map((_item, index) => (
            <div key={`body-${index}`} className="section-card">
              <span className="result-label">Body {index + 1}</span>
              <Textarea rows={5} value={bodyTexts[index] || ''} onChange={(e) => setBodyTexts((c) => c.map((t, i) => i === index ? e.target.value : t))} />
            </div>
          ))}
          <div className="section-card">
            <span className="result-label">Closing</span>
            <Textarea rows={3} value={closingText} onChange={(e) => setClosingText(e.target.value)} />
          </div>
        </div>

        {result.customizationNotes.length > 0 ? (
          <div className="cover-letter-notes">
            <h3 className="result-label">Customization notes</h3>
            {result.customizationNotes.map((n, i) => (
              <p key={`${n.note}-${i}`} className="rs__meta cover-letter-note">
                <span className="chip chip--neutral cover-letter-note__tag">{n.category}</span>
                {n.note}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function InterviewView({ payload }: { payload: AnyObject }) {
  const result = normalizeInterviewPayload(payload)
  const [practiceGapsFirst, setPracticeGapsFirst] = useState(false)
  const [practiceMode, setPracticeMode] = useState(false)

  const visibleQuestions = useMemo(() => {
    if (!practiceGapsFirst) return result.questions
    return [...result.questions.filter((q) => q.practiceFirst), ...result.questions.filter((q) => !q.practiceFirst)]
  }, [practiceGapsFirst, result.questions])

  if (practiceMode) {
    return (
      <InterviewPracticeMode
        questions={result.questions.map((q) => ({
          question: q.question,
          answerStructure: q.answerStructure,
          focusArea: q.focusArea,
        }))}
        onExit={() => setPracticeMode(false)}
      />
    )
  }

  return (
    <>
      {/* Practice mode CTA */}
      <div className="rs" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="outline" size="sm" onClick={() => setPracticeMode(true)}>
          Start Practice Mode
        </Button>
      </div>

      {/* Focus areas + Weak signals */}
      <div className="rs rs--2col">
        <div>
          <h3 className="result-heading">Focus areas</h3>
          <div className="section-card-grid stagger-entrance">
            {result.focusAreas.map((a) => (
              <div key={a.title} className="section-card">
                <div className="step-card__title">{a.title}</div>
                <div className="step-card__desc">{a.reason}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="result-heading" style={{ color: 'var(--warning)' }}>Weak signals</h3>
          <div className="section-card-grid stagger-entrance">
            {result.weakSignals.map((w) => (
              <div
                key={w.title}
                className="step-card"
                style={{ '--step-color': priorityTone(w.severity) } as React.CSSProperties}
              >
                <div className="step-card__num">
                  <span className="issue-card__severity" style={{ background: priorityTone(w.severity), width: 6, height: 6 }} />
                </div>
                <div className="step-card__body">
                  <div className="step-card__title">{w.title}</div>
                  <div className="step-card__desc">{w.prepAction}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="rs">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h3 className="result-heading" style={{ margin: 0 }}>Questions ({visibleQuestions.length})</h3>
          <Button variant="outline" size="sm" onClick={() => setPracticeGapsFirst((c) => !c)}>
            {practiceGapsFirst ? 'All' : 'Gaps first'}
          </Button>
        </div>
        <Accordion type="single" collapsible className="issue-card-list">
          {visibleQuestions.map((item, index) => (
            <AccordionItem key={`${index}-${item.question}`} value={`qa-${index}`} className="issue-card">
              <AccordionTrigger className="issue-card__trigger">
                <span className="issue-card__header">
                  <span className="step-card__num" style={{
                    width: '1.5rem', height: '1.5rem',
                    background: item.practiceFirst ? 'color-mix(in srgb, var(--warning) 12%, transparent)' : 'color-mix(in srgb, var(--text-body) 5%, transparent)',
                    color: item.practiceFirst ? 'var(--warning)' : 'var(--text-muted)',
                  }}>{index + 1}</span>
                  <span className="issue-card__title">{item.question}</span>
                  <span className="chip chip--neutral" style={{ fontSize: '0.6875rem' }}>{item.focusArea}</span>
                  {item.practiceFirst ? <span className="chip chip--warning" style={{ fontSize: '0.6875rem' }}>Gap</span> : null}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="issue-card__body">
                  <p className="rs__meta" style={{ marginBottom: '0.375rem' }}><strong>Why:</strong> {item.whyAsked}</p>
                  <p className="rs__body">{item.answer}</p>
                  {item.keyPoints.length > 0 ? (
                    <div className="issue-card__fix" style={{ marginTop: '0.375rem' }}>
                      {item.keyPoints.map((p) => (
                        <div key={p} className="strength-item" style={{ fontSize: '0.8125rem' }}>
                          <span className="strength-item__icon">&#10003;</span> {p}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Interviewer notes */}
      {result.interviewerNotes.length > 0 ? (
        <div className="rs">
          <div className="section-card section-card--accent-left">
            <h3 className="result-label">Interviewer notes</h3>
            {result.interviewerNotes.map((n) => (
              <div key={n} className="strength-item" style={{ fontSize: '0.8125rem', marginBottom: '0.125rem' }}>
                <span className="strength-item__icon">&#10003;</span> {n}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
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

function CareerView({ payload }: { payload: AnyObject }) {
  const result = normalizeCareerPayload(payload)

  return (
    <>
      {/* Recommendation */}
      <div className="rs rs--elevated">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
          <h3 className="result-heading" style={{ margin: 0 }}>{result.recommendedDirection.roleTitle}</h3>
          <span className="result-display" style={{ fontSize: '1.5rem', color: scoreColor(result.recommendedDirection.fitScore) }}>{result.recommendedDirection.fitScore}%</span>
        </div>
        <p className="rs__body" style={{ marginBottom: '0.5rem' }}>{result.recommendedDirection.whyNow}</p>
        <div className="chip-wrap">
          <span className="chip chip--neutral">{result.recommendedDirection.transitionTimeline}</span>
          <span className="chip chip--neutral">{result.recommendedDirection.confidence} confidence</span>
        </div>
      </div>

      {/* Path comparison cards */}
      <div className="rs">
        <h3 className="result-heading">Path comparison</h3>
        <div className="path-grid">
          {result.paths.map((p) => {
            const isBest = p.fitScore === Math.max(...result.paths.map(pp => pp.fitScore))
            return (
              <div key={p.roleTitle} className={`path-card${isBest ? ' path-card--best' : ''}`}>
                {isBest ? <div className="path-card__badge">Recommended</div> : null}
                <div className="path-card__header">
                  <span className="path-card__title">{p.roleTitle}</span>
                  <span className="path-card__score" style={{ color: scoreColor(p.fitScore) }}>{p.fitScore}%</span>
                </div>
                <div className="path-card__meta">
                  <span className="chip chip--neutral" style={{ fontSize: '0.6875rem' }}>{p.transitionTimeline}</span>
                  <span className="chip" style={{
                    fontSize: '0.6875rem',
                    background: `color-mix(in srgb, ${riskTone(p.riskLevel)} 10%, transparent)`,
                    color: riskTone(p.riskLevel),
                  }}>{p.riskLevel} risk</span>
                </div>
                {p.strengthsToLeverage.length > 0 ? (
                  <div style={{ marginBottom: '0.375rem' }}>
                    <div className="path-card__detail-label" style={{ color: 'var(--success)' }}>Strengths</div>
                    <div className="path-card__list">
                      {p.strengthsToLeverage.slice(0, 3).map(s => (
                        <div key={s} className="path-card__list-item">
                          <span style={{ color: 'var(--success)' }}>&#10003;</span> {s}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {p.gapsToClose.length > 0 ? (
                  <div>
                    <div className="path-card__detail-label" style={{ color: 'var(--warning)' }}>Gaps</div>
                    <div className="path-card__list">
                      {p.gapsToClose.slice(0, 3).map(g => (
                        <div key={g} className="path-card__list-item">
                          <span style={{ color: 'var(--warning)' }}>&#9679;</span> {g}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Skills */}
      <div className="rs rs--2col">
        <div>
          <h3 className="result-label" style={{ color: 'var(--success)' }}>Current skills</h3>
          <div className="chip-wrap">
            {result.currentSkills.map((s) => <span key={s} className="chip chip--positive"><span className="chip__dot" /> {s}</span>)}
          </div>
        </div>
        <div>
          <h3 className="result-label" style={{ color: 'var(--warning)' }}>Target skills</h3>
          <div className="chip-wrap">
            {result.targetSkills.map((s) => <span key={s} className="chip chip--outline-warning"><span className="chip__dot" /> {s}</span>)}
          </div>
        </div>
      </div>

      {/* Skill gaps */}
      {result.skillGaps.length > 0 ? (
        <div className="rs">
          <h3 className="result-heading">Skill gaps ({result.skillGaps.length})</h3>
          <Accordion type="single" collapsible className="issue-card-list">
            {result.skillGaps.map((g) => (
              <AccordionItem key={g.skill} value={g.skill} className="issue-card">
                <AccordionTrigger className="issue-card__trigger">
                  <span className="issue-card__header">
                    <span className="issue-card__severity" style={{ background: priorityTone(g.urgency) }} />
                    <span className="issue-card__title">{g.skill}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="issue-card__body">
                    <p className="rs__body">{g.whyItMatters}</p>
                    {g.howToBuild ? (
                      <div className="issue-card__fix">
                        <strong>How:</strong> {g.howToBuild}
                      </div>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : null}

      {/* Roadmap (vertical timeline) */}
      {result.nextSteps.length > 0 ? (
        <div className="rs">
          <h3 className="result-heading">Roadmap</h3>
          <div className="roadmap-v">
            {result.nextSteps.map((step, i) => (
              <div key={`${step.timeframe}-${i}`} className="roadmap-v__step">
                <div className="roadmap-v__dot">
                  <span className="roadmap-v__dot-num">{i + 1}</span>
                </div>
                <div className="roadmap-v__timeframe">{step.timeframe}</div>
                <div className="roadmap-v__action">{step.action}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

function PortfolioView({ payload }: { payload: AnyObject }) {
  const result = normalizePortfolioPayload(payload)
  const projectsByTitle = Object.fromEntries(
    result.projects.map((p) => [p.projectTitle.toLowerCase(), p]),
  ) as Record<string, PortfolioResultPayload['projects'][number]>

  return (
    <>
      {/* Strategy + Roadmap */}
      <div className="rs">
        <div className="section-card section-card--accent-left">
          <h3 className="result-heading" style={{ margin: '0 0 0.25rem' }}>Strategy</h3>
          <p className="rs__body" style={{ marginBottom: '0.25rem' }}><strong>{result.strategy.headline}</strong></p>
          <p className="rs__meta">{result.strategy.focus}</p>
        </div>
        {result.sequencePlan.length > 0 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <h3 className="result-label">Project roadmap</h3>
            <div className="roadmap-v">
              {result.sequencePlan.map((step) => {
                const project = projectsByTitle[step.projectTitle.toLowerCase()]
                return (
                  <div key={`${step.order}-${step.projectTitle}`} className="roadmap-v__step">
                    <div className="roadmap-v__dot">
                      <span className="roadmap-v__dot-num">{step.order}</span>
                    </div>
                    <div className="roadmap-v__timeframe">{step.projectTitle}</div>
                    <div className="roadmap-v__action">{step.reason}</div>
                    {project ? (
                      <div className="roadmap-v__detail">{project.complexity} &middot; {project.estimatedTimeline}</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Projects */}
      <div className="rs">
        <h3 className="result-heading">Projects ({result.projects.length})</h3>
        <Accordion type="single" collapsible className="issue-card-list">
          {result.projects.map((project) => (
            <AccordionItem key={project.projectTitle} value={project.projectTitle} className="issue-card">
              <AccordionTrigger className="issue-card__trigger">
                <span className="issue-card__header">
                  <span className="issue-card__title">{project.projectTitle}</span>
                  <span className="chip" style={{
                    fontSize: '0.6875rem',
                    background: `color-mix(in srgb, ${complexityTone(project.complexity)} 10%, transparent)`,
                    color: complexityTone(project.complexity),
                  }}>{project.complexity}</span>
                  <span className="chip chip--neutral" style={{ fontSize: '0.6875rem' }}>{project.estimatedTimeline}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="issue-card__body">
                  <p className="rs__body">{project.description}</p>
                  <p className="rs__meta" style={{ marginTop: '0.25rem' }}><strong>Why:</strong> {project.whyThisProject}</p>
                  <div className="chip-wrap" style={{ marginTop: '0.375rem' }}>
                    {project.skills.slice(0, 4).map((s) => <span key={s} className="chip chip--positive" style={{ fontSize: '0.6875rem' }}>{s}</span>)}
                    {project.skills.length > 4 ? <span className="chip chip--neutral" style={{ fontSize: '0.6875rem' }}>+{project.skills.length - 4}</span> : null}
                  </div>
                  {project.deliverables.length > 0 ? (
                    <div className="issue-card__fix" style={{ marginTop: '0.375rem' }}>
                      {project.deliverables.map((d) => (
                        <div key={d} className="strength-item" style={{ fontSize: '0.8125rem' }}>
                          <span className="strength-item__icon">&#10003;</span> {d}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Presentation tips */}
      {result.presentationTips.length > 0 ? (
        <div className="rs">
          <h3 className="result-label">Presentation tips</h3>
          <div className="section-card-grid stagger-entrance">
            {result.presentationTips.map((tip, i) => (
              <div
                key={tip}
                className="step-card"
                style={{ '--step-color': 'var(--accent)' } as React.CSSProperties}
              >
                <div className="step-card__num">{i + 1}</div>
                <div className="step-card__body">
                  <div className="step-card__desc">{tip}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
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
}

export const resultDefinitions: Record<ToolId, ResultDefinition> = {
  resume: {
    copyText: (payload) => resumeCopyText(payload),
    heroMetric: (payload) => {
      const r = normalizeResumePayload(payload)
      return <ScoreCircleSvg score={r.overallScore} />
    },
    insightStrip: (payload) => {
      const r = normalizeResumePayload(payload)
      return r.scoreBreakdown.slice(0, 4).map((item) => ({
        label: item.label,
        value: String(item.score),
        color: scoreColor(item.score),
      }))
    },
    render: (payload) => <ResumeResultView payload={payload} />,
  },
  'job-match': {
    copyText: (payload) => jobMatchCopyText(payload),
    heroMetric: (payload) => {
      const r = normalizeJobMatchPayload(payload)
      return <ScoreCircleSvg score={r.matchScore} />
    },
    insightStrip: (payload) => {
      const r = normalizeJobMatchPayload(payload)
      const met = r.requirements.filter((req) => req.status === 'matched').length
      return [
        { label: 'Match', value: `${r.matchScore}%`, color: scoreColor(r.matchScore) },
        { label: 'Requirements met', value: `${met}/${r.requirements.length}` },
        { label: 'Keywords', value: `${r.matchedKeywords.length}/${r.matchedKeywords.length + r.missingKeywords.length}` },
        { label: 'Verdict', value: r.verdict },
      ]
    },
    render: (payload) => <JobMatchView payload={payload} />,
  },
  'cover-letter': {
    copyText: (payload) => coverLetterCopyText(payload),
    download: (payload, item) => ({
      filename: `${item.label || 'cover-letter'}.txt`,
      content: coverLetterCopyText(payload),
    }),
    insightStrip: (payload) => {
      const r = normalizeCoverLetterPayload(payload)
      const wordCount = r.fullText.split(/\s+/).filter(Boolean).length
      return [
        { label: 'Words', value: String(wordCount) },
        { label: 'Paragraphs', value: String(1 + r.bodyPoints.length + 1) },
        { label: 'Tone', value: r.toneUsed },
        { label: 'Custom points', value: String(r.customizationNotes.length) },
      ]
    },
    render: (payload) => <CoverLetterView payload={payload} />,
  },
  interview: {
    copyText: (payload) => interviewCopyText(payload),
    insightStrip: (payload) => {
      const r = normalizeInterviewPayload(payload)
      const practiceFirst = r.questions.filter((q) => q.practiceFirst).length
      return [
        { label: 'Questions', value: String(r.questions.length) },
        { label: 'Focus areas', value: String(r.focusAreas.length) },
        { label: 'Weak signals', value: String(r.weakSignals.length), color: r.weakSignals.length > 0 ? 'var(--warning)' : undefined },
        { label: 'Practice first', value: String(practiceFirst) },
      ]
    },
    render: (payload) => <InterviewView payload={payload} />,
  },
  career: {
    copyText: (payload) => careerCopyText(payload),
    heroMetric: (payload) => {
      const r = normalizeCareerPayload(payload)
      return <ScoreCircleSvg score={r.recommendedDirection.fitScore} />
    },
    insightStrip: (payload) => {
      const r = normalizeCareerPayload(payload)
      return [
        { label: 'Fit', value: `${r.recommendedDirection.fitScore}%`, color: scoreColor(r.recommendedDirection.fitScore) },
        { label: 'Timeline', value: r.recommendedDirection.transitionTimeline },
        { label: 'Skill gaps', value: String(r.skillGaps.length) },
        { label: 'Confidence', value: r.recommendedDirection.confidence },
      ]
    },
    render: (payload) => <CareerView payload={payload} />,
  },
  portfolio: {
    copyText: (payload) => portfolioCopyText(payload),
    insightStrip: (payload) => {
      const r = normalizePortfolioPayload(payload)
      return [
        { label: 'Projects', value: String(r.projects.length) },
        { label: 'Start with', value: r.recommendedStartProject.split(' ').slice(0, 3).join(' ') },
        { label: 'Target', value: r.targetRole.split(' ').slice(0, 3).join(' ') },
        { label: 'Steps', value: String(r.sequencePlan.length) },
      ]
    },
    render: (payload) => <PortfolioView payload={payload} />,
  },
}
