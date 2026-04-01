import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Copy,
  Download,
} from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
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


function ScoreCircleSvg({ score, size = 88 }: { score: number; size?: number }) {
  const r = (size / 2) - 6
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)
  return (
    <div className="result-hero__score" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div className="result-hero__score-num">{score}</div>
      </div>
    </div>
  )
}

function ResumeResultView({ payload }: { payload: AnyObject }) {
  const result = normalizeResumePayload(payload)

  return (
    <>
      {/* Score breakdown + Strengths/Gaps side by side */}
      <div className="rs rs--2col">
        <div>
          <h3 className="rs__heading">Score breakdown</h3>
          <div className="bar-stack">
            {result.scoreBreakdown.map((item) => (
              <div key={item.key} className="bar-metric">
                <span className="bar-metric__label">{item.label}</span>
                <div className="bar-metric__track">
                  <div className="bar-metric__fill" style={{ width: `${item.score}%`, background: scoreColor(item.score) }} />
                </div>
                <span className="bar-metric__value" style={{ color: scoreColor(item.score) }}>{item.score}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="rs__heading" style={{ color: 'var(--success)' }}>Strengths</h3>
          <div style={{ display: 'grid', gap: '0.25rem', marginBottom: '0.75rem' }}>
            {result.strengths.slice(0, 4).map((s) => (
              <div key={s} className="rs__body" style={{ display: 'flex', gap: '0.375rem' }}>
                <span style={{ color: 'var(--success)' }}>&#10003;</span> {s}
              </div>
            ))}
          </div>
          {result.issues.length > 0 ? (
            <>
              <h3 className="rs__heading" style={{ color: 'var(--warning)', marginTop: '0.5rem' }}>Gaps</h3>
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {result.issues.slice(0, 3).map((i) => (
                  <div key={i.id} className="rs__body" style={{ display: 'flex', gap: '0.375rem' }}>
                    <span style={{ color: priorityTone(i.severity) }}>&#9679;</span> {i.title}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Fix first */}
      <div className="rs">
        <h3 className="rs__heading">Fix first</h3>
        {result.topActions.slice(0, 3).map((a, i) => (
          <div key={`${a.title}-${i}`} style={{ display: 'flex', gap: '0.5rem', padding: '0.375rem 0' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: priorityTone(a.priority), flexShrink: 0, marginTop: 6 }} />
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-strong)' }}>{a.title}</div>
              <div className="rs__meta">{a.action}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Keywords + Evidence inline */}
      <div className="rs rs--2col">
        <div>
          <h3 className="rs__sub">Keywords</h3>
          <div className="chip-flow">
            {result.evidence.matchedKeywords.map((k) => <span key={k} className="chip-sm chip-sm--positive">{k}</span>)}
            {result.evidence.missingKeywords.map((k) => <span key={k} className="chip-sm chip-sm--warning">{k}</span>)}
          </div>
        </div>
        <div>
          <h3 className="rs__sub">Evidence</h3>
          <div style={{ display: 'grid', gap: '0.125rem' }}>
            <div className="rs__meta" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Sections</span><strong>{result.evidence.detectedSections.length}</strong></div>
            <div className="rs__meta" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Skills</span><strong>{result.evidence.detectedSkills.length}</strong></div>
            <div className="rs__meta" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Quantified</span><strong>{result.evidence.quantifiedBullets}</strong></div>
          </div>
        </div>
      </div>

      {/* Issues (expandable) */}
      {result.issues.length > 0 ? (
        <div className="rs">
          <h3 className="rs__heading">Issues ({result.issues.length})</h3>
          <Accordion type="single" collapsible>
            {result.issues.map((issue) => (
              <AccordionItem key={issue.id} value={issue.id}>
                <AccordionTrigger>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', textAlign: 'left' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: priorityTone(issue.severity), flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8125rem' }}>{issue.title}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="rs__body" style={{ paddingTop: '0.25rem' }}>
                    <p>{issue.whyItMatters}</p>
                    <p className="rs__meta" style={{ marginTop: '0.25rem' }}><strong>Fix:</strong> {issue.fix}</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : null}

      {/* Role fit */}
      {result.roleFit ? (
        <div className="rs">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: scoreColor(result.roleFit.fitScore) }}>{result.roleFit.fitScore}%</span>
            <span className="rs__meta">fit for {result.roleFit.targetRoleLabel}</span>
          </div>
          <p className="rs__meta" style={{ marginTop: '0.125rem' }}>{result.roleFit.rationale}</p>
        </div>
      ) : null}
    </>
  )
}

function JobMatchView({ payload }: { payload: AnyObject }) {
  const result = normalizeJobMatchPayload(payload)

  return (
    <>
      {/* Requirements */}
      <div className="rs">
        <h3 className="rs__heading">Requirements</h3>
        <div className="req-list">
          {result.requirements.map((item, index) => (
            <div key={`${item.requirement}-${index}`} className="req-row">
              <span className="req-row__dot" style={{ background: statusTone(item.status) }} />
              <span className="req-row__name">{item.requirement}</span>
              <span className="req-row__badge" style={{
                background: item.importance === 'must' ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                color: item.importance === 'must' ? 'var(--accent)' : 'var(--text-muted)',
              }}>{item.importance}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Keywords + Tailoring */}
      <div className="rs rs--2col">
        <div>
          <h3 className="rs__sub">Keyword coverage</h3>
          <div className="chip-flow">
            {result.matchedKeywords.map((k) => <span key={k} className="chip-sm chip-sm--positive">{k}</span>)}
          </div>
          {result.missingKeywords.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <h3 className="rs__sub" style={{ color: 'var(--warning)' }}>Missing keywords</h3>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {result.missingKeywords.map((k) => (
                  <div key={k.keyword} className="keyword-card">
                    <div className="keyword-card-name">{k.keyword}</div>
                    {k.contextual_guidance && (
                      <p className="keyword-guidance">{k.contextual_guidance}</p>
                    )}
                    {k.anti_stuffing_note && (
                      <p className="keyword-warning">{k.anti_stuffing_note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          {result.tailoringActions.length > 0 ? (
            <>
              <h3 className="rs__sub">Tailoring actions</h3>
              {result.tailoringActions.slice(0, 3).map((a, i) => (
                <div key={`${a.keyword}-${i}`} className="rs__body" style={{ marginBottom: '0.25rem' }}>
                  <strong>{a.section}:</strong> {a.action}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {/* Recruiter summary (collapsed) */}
      <div className="rs">
        <Accordion type="single" collapsible>
          <AccordionItem value="recruiter">
            <AccordionTrigger>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Recruiter summary</span>
            </AccordionTrigger>
            <AccordionContent>
              <p className="rs__body" style={{ paddingTop: '0.25rem' }}>{result.recruiterSummary}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Interview focus */}
      {result.interviewFocus.length > 0 ? (
        <div className="rs">
          <h3 className="rs__sub">Interview focus</h3>
          <div className="chip-flow">
            {result.interviewFocus.map((f) => <span key={f} className="chip-sm chip-sm--neutral">{f}</span>)}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 className="rs__heading" style={{ margin: 0 }}>Letter preview</h3>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <Button variant="outline" size="sm" onClick={handleCopy}><Copy size={13} /> Copy</Button>
            <Button variant="outline" size="sm" onClick={handleDownload}><Download size={13} /></Button>
          </div>
        </div>
        <div className="document-preview">{compiledText || result.fullText}</div>
      </div>

      {/* Right: Editor + Notes */}
      <div>
        <h3 className="rs__heading">Edit</h3>
        <div style={{ display: 'grid', gap: '0.625rem' }}>
          <div>
            <span className="rs__sub">Opening</span>
            <Textarea rows={4} value={openingText} onChange={(e) => setOpeningText(e.target.value)} />
          </div>
          {result.bodyPoints.map((_item, index) => (
            <div key={`body-${index}`}>
              <span className="rs__sub">Body {index + 1}</span>
              <Textarea rows={5} value={bodyTexts[index] || ''} onChange={(e) => setBodyTexts((c) => c.map((t, i) => i === index ? e.target.value : t))} />
            </div>
          ))}
          <div>
            <span className="rs__sub">Closing</span>
            <Textarea rows={3} value={closingText} onChange={(e) => setClosingText(e.target.value)} />
          </div>
        </div>

        {result.customizationNotes.length > 0 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <h3 className="rs__sub">Customization notes</h3>
            {result.customizationNotes.map((n, i) => (
              <p key={`${n.note}-${i}`} className="rs__meta" style={{ marginBottom: '0.25rem' }}>
                <span className="chip-sm chip-sm--neutral" style={{ marginRight: '0.25rem' }}>{n.category}</span>
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
      {/* Practice mode toggle */}
      <div className="rs" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="outline" size="sm" onClick={() => setPracticeMode(true)}>
          Start Practice Mode
        </Button>
      </div>

      {/* Focus areas + Weak signals */}
      <div className="rs rs--2col">
        <div>
          <h3 className="rs__heading">Focus areas</h3>
          <div style={{ display: 'grid', gap: '0.375rem' }}>
            {result.focusAreas.map((a) => (
              <div key={a.title}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-strong)' }}>{a.title}</div>
                <div className="rs__meta">{a.reason}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="rs__heading" style={{ color: 'var(--warning)' }}>Weak signals</h3>
          <div style={{ display: 'grid', gap: '0.375rem' }}>
            {result.weakSignals.map((w) => (
              <div key={w.title}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-strong)' }}>
                  <span style={{ color: priorityTone(w.severity) }}>&#9679; </span>{w.title}
                </div>
                <div className="rs__meta">{w.prepAction}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="rs">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h3 className="rs__heading" style={{ margin: 0 }}>Questions ({visibleQuestions.length})</h3>
          <Button variant="outline" size="sm" onClick={() => setPracticeGapsFirst((c) => !c)}>
            {practiceGapsFirst ? 'All' : 'Gaps first'}
          </Button>
        </div>
        <Accordion type="single" collapsible>
          {visibleQuestions.map((item, index) => (
            <AccordionItem key={`${index}-${item.question}`} value={`qa-${index}`}>
              <AccordionTrigger>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <span style={{
                    width: '1.5rem', height: '1.5rem', borderRadius: '50%',
                    background: item.practiceFirst ? 'color-mix(in srgb, var(--warning) 12%, transparent)' : 'color-mix(in srgb, var(--foreground) 5%, transparent)',
                    color: item.practiceFirst ? 'var(--warning)' : 'var(--text-muted)',
                    display: 'grid', placeItems: 'center',
                    fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0,
                  }}>{index + 1}</span>
                  <span style={{ fontWeight: 600, flex: 1 }}>{item.question}</span>
                  <span className="chip-sm chip-sm--neutral">{item.focusArea}</span>
                  {item.practiceFirst ? <span className="chip-sm chip-sm--warning">Gap</span> : null}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div style={{ paddingTop: '0.25rem' }}>
                  <p className="rs__meta" style={{ marginBottom: '0.375rem' }}><strong>Why:</strong> {item.whyAsked}</p>
                  <p className="rs__body">{item.answer}</p>
                  {item.keyPoints.length > 0 ? (
                    <div style={{ marginTop: '0.375rem' }}>
                      {item.keyPoints.map((p) => (
                        <div key={p} className="rs__meta" style={{ display: 'flex', gap: '0.25rem' }}>
                          <span style={{ color: 'var(--success)' }}>&#10003;</span> {p}
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
          <h3 className="rs__sub">Interviewer notes</h3>
          {result.interviewerNotes.map((n) => (
            <div key={n} className="rs__meta" style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.125rem' }}>
              <span style={{ color: 'var(--success)' }}>&#10003;</span> {n}
            </div>
          ))}
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
          <h3 className="rs__heading" style={{ margin: 0 }}>{result.recommendedDirection.roleTitle}</h3>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: scoreColor(result.recommendedDirection.fitScore) }}>{result.recommendedDirection.fitScore}%</span>
        </div>
        <p className="rs__body" style={{ marginBottom: '0.5rem' }}>{result.recommendedDirection.whyNow}</p>
        <div className="chip-flow">
          <span className="chip-sm chip-sm--neutral">{result.recommendedDirection.transitionTimeline}</span>
          <span className="chip-sm chip-sm--neutral">{result.recommendedDirection.confidence} confidence</span>
        </div>
      </div>

      {/* Path comparison cards */}
      <div className="rs">
        <h3 className="rs__heading">Path comparison</h3>
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
                  <span className="chip-sm chip-sm--neutral">{p.transitionTimeline}</span>
                  <span className="chip-sm" style={{
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
          <h3 className="rs__sub" style={{ color: 'var(--success)' }}>Current skills</h3>
          <div className="chip-flow">
            {result.currentSkills.map((s) => <span key={s} className="chip-sm chip-sm--positive">{s}</span>)}
          </div>
        </div>
        <div>
          <h3 className="rs__sub" style={{ color: 'var(--warning)' }}>Target skills</h3>
          <div className="chip-flow">
            {result.targetSkills.map((s) => <span key={s} className="chip-sm chip-sm--warning">{s}</span>)}
          </div>
        </div>
      </div>

      {/* Skill gaps */}
      {result.skillGaps.length > 0 ? (
        <div className="rs">
          <h3 className="rs__heading">Skill gaps ({result.skillGaps.length})</h3>
          <Accordion type="single" collapsible>
            {result.skillGaps.map((g) => (
              <AccordionItem key={g.skill} value={g.skill}>
                <AccordionTrigger>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', textAlign: 'left', fontSize: '0.8125rem' }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: priorityTone(g.urgency), flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{g.skill}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="rs__body" style={{ paddingTop: '0.125rem' }}>{g.whyItMatters}</p>
                  {g.howToBuild ? <p className="rs__meta" style={{ marginTop: '0.125rem' }}><strong>How:</strong> {g.howToBuild}</p> : null}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : null}

      {/* Roadmap (vertical timeline) */}
      {result.nextSteps.length > 0 ? (
        <div className="rs">
          <h3 className="rs__heading">Roadmap</h3>
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
        <h3 className="rs__heading">Strategy</h3>
        <p className="rs__body" style={{ marginBottom: '0.25rem' }}><strong>{result.strategy.headline}</strong></p>
        <p className="rs__meta">{result.strategy.focus}</p>
        {result.sequencePlan.length > 0 ? (
          <div style={{ marginTop: '0.75rem' }}>
            <h3 className="rs__sub">Project roadmap</h3>
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
        <h3 className="rs__heading">Projects ({result.projects.length})</h3>
        <Accordion type="single" collapsible>
          {result.projects.map((project) => (
            <AccordionItem key={project.projectTitle} value={project.projectTitle}>
              <AccordionTrigger>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <span style={{ fontWeight: 600 }}>{project.projectTitle}</span>
                  <span className="chip-sm" style={{
                    background: `color-mix(in srgb, ${complexityTone(project.complexity)} 10%, transparent)`,
                    color: complexityTone(project.complexity),
                  }}>{project.complexity}</span>
                  <span className="chip-sm chip-sm--neutral">{project.estimatedTimeline}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div style={{ paddingTop: '0.25rem' }}>
                  <p className="rs__body">{project.description}</p>
                  <p className="rs__meta" style={{ marginTop: '0.25rem' }}><strong>Why:</strong> {project.whyThisProject}</p>
                  <div className="chip-flow" style={{ marginTop: '0.375rem' }}>
                    {project.skills.slice(0, 4).map((s) => <span key={s} className="chip-sm chip-sm--positive">{s}</span>)}
                    {project.skills.length > 4 ? <span className="chip-sm chip-sm--neutral">+{project.skills.length - 4}</span> : null}
                  </div>
                  {project.deliverables.length > 0 ? (
                    <div style={{ marginTop: '0.375rem' }}>
                      {project.deliverables.map((d) => (
                        <div key={d} className="rs__meta" style={{ display: 'flex', gap: '0.25rem' }}>
                          <span style={{ color: 'var(--success)' }}>&#10003;</span> {d}
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
          <h3 className="rs__sub">Presentation tips</h3>
          {result.presentationTips.map((tip, i) => (
            <div key={tip} className="rs__meta" style={{ marginBottom: '0.125rem' }}>
              <strong>{i + 1}.</strong> {tip}
            </div>
          ))}
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
