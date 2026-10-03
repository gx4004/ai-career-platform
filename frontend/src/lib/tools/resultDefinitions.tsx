import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, Download, Zap } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { AutoGrowTextarea } from '#/components/tooling/AutoGrowTextarea'
import { InterviewPracticeMode } from '#/components/tooling/InterviewPracticeMode'
import {
  Badge,
  Field,
  MiniBar,
  ResultSection,
  SeverityBadge,
  TokenList,
} from '#/components/tooling/ResultParts'
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

/** Shorten a role label (the backend can echo a whole JD line) to one readable line. */
export function truncateLabel(text: string, max = 60) {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}

/** "Target role: <role>", or just "Target role" when the backend sent only a placeholder. */
export function roleFitLabel(label: string) {
  const trimmed = label.trim()
  if (!trimmed || /^(the )?target role$/i.test(trimmed)) return 'Target role'
  return `Target role: ${truncateLabel(trimmed)}`
}

export function formatLetterDate(iso: string | null | undefined, now: Date = new Date()) {
  const parsed = iso ? new Date(iso) : null
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : now
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Distinct requirements addressed across opening, body points and closing. */
export function uniqueRequirementCount(result: {
  opening: { requirementsUsed: string[] }
  bodyPoints: Array<{ requirementsUsed: string[] }>
  closing: { requirementsUsed: string[] }
}) {
  const seen = new Set<string>()
  for (const section of [result.opening, ...result.bodyPoints, result.closing]) {
    for (const req of section.requirementsUsed) {
      const key = req.trim().toLowerCase()
      if (key) seen.add(key)
    }
  }
  return seen.size
}

/**
 * The letter is editable on the result page. Edits live only in the browser, so
 * hero Copy / Download read the edited text from here, keyed by run id, and fall
 * back to the generated letter when nothing was edited.
 */
const editedLetters = new Map<string, string>()

function coverLetterTextFor(payload: AnyObject, item?: ToolRunDetail) {
  return (item && editedLetters.get(item.id)) || coverLetterCopyText(payload)
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

/* ── Shared: fix-first list ── */

export type TopAction = { title: string; action: string; priority: string }

/** Numbered list of the highest-value actions, each with a severity text badge. */
export function FixFirstList({ actions }: { actions: TopAction[] }) {
  const items = actions.slice(0, 3)
  if (items.length === 0) return null

  return (
    <ResultSection title="Fix first">
      <ol className="rlist rlist--numbered">
        {items.map((a, i) => (
          <li key={`${a.title}-${i}`} className="rlist__item">
            <div className="rlist__row">
              <span className="rlist__title">{a.title}</span>
              <SeverityBadge level={a.priority} />
            </div>
            <p className="rlist__text">{a.action}</p>
          </li>
        ))}
      </ol>
    </ResultSection>
  )
}

function RoleFitLevel({ score }: { score: number }) {
  if (score >= 70) return <Badge tone="success">High match</Badge>
  if (score >= 40) return <Badge tone="warning">Moderate</Badge>
  return <Badge tone="danger">Low match</Badge>
}

/* ── Resume ── */

function ResumeResultView({ payload }: { payload: AnyObject }) {
  const result = normalizeResumePayload(payload)
  const { evidence } = result
  const hasKeywords = evidence.matchedKeywords.length > 0 || evidence.missingKeywords.length > 0
  const hasFeedback = result.strengths.length > 0 || result.issues.length > 0

  return (
    <>
      {result.scoreBreakdown.length > 0 && (
        <ResultSection title="Score breakdown">
          <table className="rtable rtable--bars">
            <thead className="sr-only">
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Score</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {result.scoreBreakdown.map((item) => (
                <tr key={item.key}>
                  <th scope="row">{item.label}</th>
                  <td className="rtable__bar">
                    <MiniBar value={item.score} />
                  </td>
                  <td className="rtable__num">{item.score}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResultSection>
      )}

      {hasFeedback && (
        <ResultSection title="Detailed feedback">
          {result.strengths.length > 0 && (
            <>
              <h3 className="rs-sub">Major strengths</h3>
              <ul className="rlist rlist--bullets">
                {result.strengths.slice(0, 4).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {result.issues.length > 0 && (
            <>
              <h3 className="rs-sub">Refinement areas</h3>
              <ol className="rlist rlist--numbered">
                {result.issues.map((issue) => (
                  <li key={issue.id} className="rlist__item">
                    <div className="rlist__row">
                      <span className="rlist__title">{issue.title}</span>
                      <SeverityBadge level={issue.severity} />
                    </div>
                    <dl className="rfields">
                      <Field label="Why it matters">{issue.whyItMatters}</Field>
                      <Field label="Fix">{issue.fix}</Field>
                    </dl>
                  </li>
                ))}
              </ol>
            </>
          )}
        </ResultSection>
      )}

      {hasKeywords && (
        <ResultSection
          title="Keyword optimization"
          meta={
            <>
              {evidence.matchedKeywords.length} matched
              {evidence.missingKeywords.length > 0 ? ` · ${evidence.missingKeywords.length} missing` : ''}
            </>
          }
        >
          <TokenList items={evidence.matchedKeywords} label="Matched" />
          <TokenList items={evidence.missingKeywords} tone="warning" label="Missing" />
        </ResultSection>
      )}

      {result.roleFit && (
        <ResultSection title="Role fit" meta={<RoleFitLevel score={result.roleFit.fitScore} />}>
          <div className="rfit">
            <span className="rfit__label" title={result.roleFit.targetRoleLabel}>
              {roleFitLabel(result.roleFit.targetRoleLabel)}
            </span>
            <MiniBar value={result.roleFit.fitScore} />
            <span className="rfit__value">{result.roleFit.fitScore}%</span>
          </div>
          {result.roleFit.rationale && <p className="rs-text">{result.roleFit.rationale}</p>}
        </ResultSection>
      )}
    </>
  )
}

/* ── Job match ── */

function requirementStatusBadge(status: 'matched' | 'partial' | 'missing') {
  if (status === 'matched') return <Badge tone="success">Matched</Badge>
  if (status === 'partial') return <Badge tone="warning">Partial</Badge>
  return <Badge tone="danger">Missing</Badge>
}

function JobMatchView({ payload }: { payload: AnyObject }) {
  const result = normalizeJobMatchPayload(payload)
  const met = result.requirements.filter((r) => r.status === 'matched').length

  return (
    <>
      {result.requirements.length > 0 && (
        <ResultSection title="Detailed requirements" meta={`${met} of ${result.requirements.length} met`}>
          <table className="rtable rtable--requirements">
            <thead>
              <tr>
                <th scope="col">Requirement</th>
                <th scope="col">Status</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {result.requirements.map((item, index) => (
                <tr key={`${item.requirement}-${index}`}>
                  <th scope="row">
                    <span className="rtable__name">{item.requirement}</span>
                    {item.importance !== 'must' ? <span className="rtable__sub">Preferred</span> : null}
                  </th>
                  <td>{requirementStatusBadge(item.status)}</td>
                  <td>
                    {item.resumeEvidence && item.status === 'matched' && (
                      <p className="rtable__note">
                        {item.resumeEvidence}
                      </p>
                    )}
                    {item.suggestedFix && item.status !== 'matched' && (
                      <p className="rtable__note">
                        {item.suggestedFix}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResultSection>
      )}

      {result.tailoringActions.length > 0 && (
        <ResultSection title="Tailoring actions">
          <ol className="rlist rlist--numbered">
            {result.tailoringActions.map((a, i) => (
              <li key={`${a.keyword}-${i}`} className="rlist__item">
                <div className="rlist__row">
                  <span className="rlist__title">{a.keyword}</span>
                </div>
                <p className="rlist__text">{a.action}</p>
              </li>
            ))}
          </ol>
        </ResultSection>
      )}

      {(result.matchedKeywords.length > 0 || result.missingKeywords.length > 0) && (
        <ResultSection
          title="Keyword breakdown"
          meta={
            <>
              {result.matchedKeywords.length} matched
              {result.missingKeywords.length > 0 ? ` · ${result.missingKeywords.length} missing` : ''}
            </>
          }
        >
          <TokenList items={result.matchedKeywords} label="Matched" />
          <TokenList items={result.missingKeywords.map((k) => k.keyword)} tone="warning" label="Missing" />
        </ResultSection>
      )}

      {result.recruiterSummary && (
        <ResultSection title="Recruiter summary" meta="How they see you">
          <p className="rs-text">{result.recruiterSummary}</p>
        </ResultSection>
      )}

      {result.interviewFocus.length > 0 && (
        <ResultSection title="Interview prep">
          <ul className="rlist rlist--bullets">
            {result.interviewFocus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </ResultSection>
      )}
    </>
  )
}

/* ── Cover letter ── */

const COVER_NOTE_LABELS: Record<string, string> = {
  tone: 'Tone',
  evidence: 'Evidence',
  keyword: 'Keyword',
  gap: 'Gap',
}

function CoverLetterView({ payload, item }: { payload: AnyObject; item?: ToolRunDetail }) {
  const result = normalizeCoverLetterPayload(payload)
  const [openingText, setOpeningText] = useState(result.opening.text)
  const [bodyTexts, setBodyTexts] = useState(result.bodyPoints.map((p) => p.text))
  const [closingText, setClosingText] = useState(result.closing.text)
  const [copied, setCopied] = useState(false)

  const compiledText = useMemo(
    () => composeCoverLetterText({ opening: openingText, bodyPoints: bodyTexts, closing: closingText }),
    [bodyTexts, closingText, openingText],
  )

  useEffect(() => {
    if (!item) return
    editedLetters.set(item.id, compiledText)
    return () => {
      editedLetters.delete(item.id)
    }
  }, [item, compiledText])

  const bodyAnnotationLabels = ['Evidence loop', 'Culture fit', 'Value close']
  const annotationLabels = [
    'Hook strategy',
    ...result.bodyPoints.map((_b, idx) => bodyAnnotationLabels[idx] ?? 'Evidence loop'),
    'Closing',
  ]

  async function handleCopy() {
    await navigator.clipboard.writeText(compiledText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  function handleDownload() {
    const blob = new Blob([compiledText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cover-letter.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <ResultSection
        title="Letter"
        meta="Editable. Copy and download use your edits."
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              <Copy /> {copied ? 'Copied' : 'Copy full text'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
              <Download /> Download TXT
            </Button>
          </>
        }
      >
        <div className="rletter">
          <div className="rletter__date">{formatLetterDate(result.generatedAt)}</div>
          <div className="rletter__para">
            <span className="rletter__label" aria-hidden="true">{annotationLabels[0]}</span>
            <AutoGrowTextarea
              className="rletter__textarea"
              aria-label="Opening paragraph"
              value={openingText}
              onChange={(e) => setOpeningText(e.target.value)}
            />
          </div>
          {result.bodyPoints.map((_p, index) => (
            <div key={`body-${index}`} className="rletter__para">
              <span className="rletter__label" aria-hidden="true">{annotationLabels[index + 1]}</span>
              <AutoGrowTextarea
                className="rletter__textarea"
                aria-label={`Body paragraph ${index + 1}`}
                value={bodyTexts[index] || ''}
                onChange={(e) => setBodyTexts((c) => c.map((t, i) => (i === index ? e.target.value : t)))}
              />
            </div>
          ))}
          <div className="rletter__para">
            <span className="rletter__label" aria-hidden="true">{annotationLabels[annotationLabels.length - 1]}</span>
            <AutoGrowTextarea
              className="rletter__textarea"
              aria-label="Closing paragraph"
              value={closingText}
              onChange={(e) => setClosingText(e.target.value)}
            />
            <p className="rletter__sign">
              Sincerely,
              <br />
              [Your name]
            </p>
          </div>
        </div>
      </ResultSection>

      {result.customizationNotes.length > 0 && (
        <ResultSection title="Customization notes">
          <ul className="rlist rlist--plain">
            {result.customizationNotes.map((n, i) => (
              <li key={`${n.note}-${i}`} className="rlist__item rlist__item--inline">
                <Badge>{COVER_NOTE_LABELS[n.category] ?? n.category}</Badge>
                <span>{n.note}</span>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {result.opening.whyThisParagraph && (
        <ResultSection title="Letter strategy">
          <p className="rs-text">{result.opening.whyThisParagraph}</p>
        </ResultSection>
      )}
    </>
  )
}

/* ── Interview ── */

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

  return (
    <>
      <ResultSection
        title="Question breakdown"
        meta={`${result.questions.length} questions`}
        actions={
          <>
            <div className="rseg" role="group" aria-label="Question order">
              <button
                type="button"
                className={`rseg__btn${!showWeakestFirst ? ' rseg__btn--active' : ''}`}
                aria-pressed={!showWeakestFirst}
                onClick={() => setShowWeakestFirst(false)}
              >
                All
              </button>
              <button
                type="button"
                className={`rseg__btn${showWeakestFirst ? ' rseg__btn--active' : ''}`}
                aria-pressed={showWeakestFirst}
                onClick={() => setShowWeakestFirst(true)}
              >
                Weakest
              </button>
            </div>
            <Button type="button" variant="outline" size="sm" title="Rehearse weak responses" onClick={() => setPracticeMode(true)}>
              <Zap /> Practice mode
            </Button>
          </>
        }
      >
        <ol className="rlist rlist--numbered">
          {visibleQuestions.map((q, index) => (
            <li key={`${index}-${q.question}`} className="rlist__item">
              <div className="rlist__row">
                <span className="rlist__title">{q.question}</span>
                <Badge>{q.focusArea}</Badge>
                {q.practiceFirst && <Badge tone="warning">Practice first</Badge>}
              </div>
              {q.practiceFirst ? (
                <>
                  <p className="rlist__text">
                    <strong>Focus area:</strong> {q.whyAsked}
                  </p>
                  {q.answer ? (
                    <details className="rdetails">
                      <summary>Show sample answer</summary>
                      <p className="rlist__text">{q.answer}</p>
                    </details>
                  ) : null}
                </>
              ) : q.answer ? (
                <p className="rlist__text">{q.answer}</p>
              ) : null}
              {q.keyPoints.length > 0 && (
                <ul className="rlist rlist--bullets rlist--tight">
                  {q.keyPoints.slice(0, 3).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </ResultSection>

      {result.focusAreas.length > 0 && (
        <ResultSection title="Focus areas">
          <ul className="rlist rlist--plain">
            {result.focusAreas.map((area) => (
              <li key={area.title} className="rlist__item">
                <div className="rlist__row">
                  <span className="rlist__title">{area.title}</span>
                  {area.practiceFirst && <Badge tone="warning">Practice first</Badge>}
                </div>
                <p className="rlist__text">{area.reason}</p>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {result.weakSignals.length > 0 && (
        <ResultSection title="Weak signals">
          <ul className="rlist rlist--plain">
            {result.weakSignals.map((w) => (
              <li key={w.title} className="rlist__item">
                <div className="rlist__row">
                  <span className="rlist__title">{w.title}</span>
                  <SeverityBadge level={w.severity} />
                </div>
                <p className="rlist__text">{w.prepAction}</p>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {result.interviewerNotes.length > 0 && (
        <ResultSection title="Interviewer notes">
          <ul className="rlist rlist--bullets">
            {result.interviewerNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </ResultSection>
      )}
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

/* ── Career ── */

function CareerView({ payload }: { payload: AnyObject }) {
  const result = normalizeCareerPayload(payload)
  const recommendedRole = result.recommendedDirection.roleTitle.toLowerCase()
  const altPaths = result.paths.filter((p) => p.roleTitle.toLowerCase() !== recommendedRole)
  // _normalize_paths sorts by fit_score, so paths[0] is the highest-fit
  // option — not necessarily the LLM's recommended direction. Source the
  // strengths from the path that matches the headline, falling back to
  // paths[0] only when no match exists.
  const recommendedPath =
    result.paths.find((p) => p.roleTitle.toLowerCase() === recommendedRole) ?? result.paths[0]
  const strengths = recommendedPath?.strengthsToLeverage.slice(0, 3) ?? []
  const tip =
    result.recommendedDirection.confidence === 'high'
      ? 'Your profile strongly matches this direction. Focus on closing the remaining skill gaps to maximize your timeline.'
      : result.recommendedDirection.confidence === 'medium'
        ? 'The fit is solid but needs sharper proof. Pick the highest-urgency gap and build one concrete example before applying.'
        : 'Document your cross-team wins and build visible proof points to strengthen your candidacy.'

  return (
    <>
      <ResultSection title="Recommended path" meta={result.recommendedDirection.transitionTimeline}>
        <p className="rs-lead">{result.recommendedDirection.roleTitle}</p>
        <h3 className="rs-sub">Why this is your ideal next step</h3>
        <p className="rs-text">{result.recommendedDirection.whyNow}</p>
        {strengths.length > 0 && (
          <ul className="rlist rlist--bullets">
            {strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        {result.targetSkills.length > 0 && (
          <>
            <h3 className="rs-sub">Skills to develop next</h3>
            <TokenList items={result.targetSkills} tone="accent" />
          </>
        )}
        {result.currentSkills.length > 0 && (
          <>
            <h3 className="rs-sub">Skills you already bring</h3>
            <TokenList items={result.currentSkills} />
          </>
        )}
      </ResultSection>

      {result.nextSteps.length > 0 && (
        <ResultSection title={`The ${result.nextSteps.length}-step roadmap`}>
          <ol className="rlist rlist--numbered">
            {result.nextSteps.map((step, i) => (
              <li key={`${step.timeframe}-${i}`} className="rlist__item">
                <div className="rlist__row">
                  <span className="rlist__title">{step.timeframe}</span>
                </div>
                <p className="rlist__text">{step.action}</p>
              </li>
            ))}
          </ol>
        </ResultSection>
      )}

      {result.skillGaps.length > 0 && (
        <ResultSection title="Critical skill gaps" meta={`${result.skillGaps.length} gaps`}>
          <ul className="rlist rlist--plain">
            {result.skillGaps.map((g) => (
              <li key={g.skill} className="rlist__item">
                <div className="rlist__row">
                  <span className="rlist__title">{g.skill}</span>
                  <SeverityBadge level={g.urgency} />
                </div>
                <dl className="rfields">
                  <Field label="Why it matters">{g.whyItMatters}</Field>
                  <Field label="How to build">{g.howToBuild}</Field>
                </dl>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {altPaths.length > 0 && (
        <ResultSection title="Alternative paths">
          <table className="rtable rtable--paths">
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Fit</th>
                <th scope="col">Timeline</th>
                <th scope="col">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {altPaths.map((p) => (
                <tr key={p.roleTitle}>
                  <th scope="row">
                    <span className="rtable__name">{p.roleTitle}</span>
                  </th>
                  <td className="rtable__fit">
                    <span className="rtable__num">{p.fitScore}%</span>
                    <MiniBar value={p.fitScore} />
                  </td>
                  <td>{p.transitionTimeline}</td>
                  <td>{p.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResultSection>
      )}

      <ResultSection title="Note">
        <p className="rs-text">{tip}</p>
      </ResultSection>
    </>
  )
}

/* ── Portfolio ── */

function PortfolioView({ payload }: { payload: AnyObject }) {
  const result = normalizePortfolioPayload(payload)
  const isStartProject = (title: string) =>
    title.toLowerCase() === result.recommendedStartProject.toLowerCase()

  // _normalize_projects and _normalize_sequence_plan are independent, so the
  // LLM's intentional ordering lives in sequence_plan, not in the projects
  // array. Drive the view from sequence_plan when present so the reason
  // copy and slot order both reach the user; fall back to the raw project
  // order only when the planner produced no sequence.
  const projectsByTitle = new Map(
    result.projects.map((project) => [project.projectTitle.toLowerCase(), project] as const),
  )
  const orderedSteps = result.sequencePlan.length > 0
    ? result.sequencePlan
        .map((step) => ({ step, project: projectsByTitle.get(step.projectTitle.toLowerCase()) }))
        .filter((entry): entry is { step: typeof entry.step; project: NonNullable<typeof entry.project> } => entry.project !== undefined)
    : result.projects.map((project, index) => ({
        step: { order: index + 1, projectTitle: project.projectTitle, reason: '' },
        project,
      }))

  // Collect all unique deliverables across projects
  const allDeliverables = result.projects.flatMap((p) => p.deliverables).filter((d, i, arr) => arr.indexOf(d) === i).slice(0, 5)

  return (
    <>
      <ResultSection title="Strategy">
        <p className="rs-lead">{result.strategy.headline}</p>
        <p className="rs-text">{result.strategy.focus}</p>
      </ResultSection>

      <ResultSection title="The build sequence" meta={`${orderedSteps.length} projects`}>
        <ol className="rlist rlist--numbered">
          {orderedSteps.map(({ step, project }) => {
            const isStart = isStartProject(project.projectTitle)
            return (
              <li key={project.projectTitle} className="rlist__item" value={step.order || undefined}>
                <div className="rlist__row">
                  <span className="rlist__title">{project.projectTitle}</span>
                  {isStart && <Badge tone="accent">Start here</Badge>}
                  <span className="rlist__meta">
                    {project.complexity}
                    {project.estimatedTimeline ? ` · ${project.estimatedTimeline}` : ''}
                  </span>
                </div>
                <p className="rlist__text">{project.description}</p>
                <dl className="rfields">
                  {step.reason && <Field label="Why this slot">{step.reason}</Field>}
                  <Field label="Why this project">{project.whyThisProject}</Field>
                </dl>
                {project.skills.length > 0 && <TokenList items={project.skills.slice(0, 4)} />}
                {project.hiringSignals.length > 0 && (
                  <>
                    <h3 className="rs-sub">What this proves to hiring teams</h3>
                    <ul className="rlist rlist--bullets rlist--tight">
                      {project.hiringSignals.slice(0, 3).map((signal) => (
                        <li key={signal}>{signal}</li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            )
          })}
        </ol>
      </ResultSection>

      {result.presentationTips.length > 0 && (
        <ResultSection title="Presentation tips">
          <ol className="rlist rlist--numbered">
            {result.presentationTips.map((tip) => (
              <li key={tip} className="rlist__item">
                <p className="rlist__text">{tip}</p>
              </li>
            ))}
          </ol>
        </ResultSection>
      )}

      {allDeliverables.length > 0 && (
        <ResultSection title="Key deliverables">
          <ul className="rlist rlist--bullets">
            {allDeliverables.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </ResultSection>
      )}
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
/** What the report header shows above the content: one score and a few facts. */
export type ResultSummary = {
  score?: { value: number; label: string; unit: '/100' | '%' }
  facts: Array<{ label: string; value: string }>
  note?: string
}

export type ResultDefinition = {
  copyText: (payload: AnyObject, item: ToolRunDetail) => string
  download?: (payload: AnyObject, item: ToolRunDetail) => {
    filename: string
    content: string
  } | null
  render: (payload: AnyObject, item: ToolRunDetail, tool: ToolDefinition) => ReactNode
  summary: (payload: AnyObject) => ResultSummary
  topActions: (payload: AnyObject) => TopAction[]
}

function fact(label: string, value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value).trim()
  return text ? [{ label, value: text }] : []
}

export const resultDefinitions: Record<ToolId, ResultDefinition> = {
  resume: {
    copyText: (payload) => resumeCopyText(payload),
    summary: (payload) => {
      const r = normalizeResumePayload(payload)
      return {
        score: { value: r.overallScore, label: 'Resume score', unit: '/100' },
        facts: [
          ...fact('Verdict', r.summary.verdict),
          ...(r.roleFit ? fact('Role fit', `${r.roleFit.fitScore}%`) : []),
          ...fact('Issues', r.issues.length || ''),
        ],
        note: r.summary.confidence_note,
      }
    },
    topActions: (payload) => normalizeResumePayload(payload).topActions,
    render: (payload) => <ResumeResultView payload={payload} />,
  },
  'job-match': {
    copyText: (payload) => jobMatchCopyText(payload),
    summary: (payload) => {
      const r = normalizeJobMatchPayload(payload)
      const met = r.requirements.filter((req) => req.status === 'matched').length
      return {
        score: { value: r.matchScore, label: 'Match score', unit: '/100' },
        facts: [
          ...fact('Verdict', r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1)),
          ...(r.requirements.length > 0 ? fact('Requirements met', `${met}/${r.requirements.length}`) : []),
          ...fact('Keywords matched', r.matchedKeywords.length),
          ...fact('Missing', r.missingKeywords.length),
        ],
        note: r.summary.confidence_note,
      }
    },
    topActions: (payload) => normalizeJobMatchPayload(payload).topActions,
    render: (payload) => <JobMatchView payload={payload} />,
  },
  'cover-letter': {
    copyText: (payload, item) => coverLetterTextFor(payload, item),
    download: (payload, item) => ({
      filename: `${item.label || 'cover-letter'}.txt`,
      content: coverLetterTextFor(payload, item),
    }),
    summary: (payload) => {
      const r = normalizeCoverLetterPayload(payload)
      const wordCount = r.fullText.split(/\s+/).filter(Boolean).length
      const reqCount = uniqueRequirementCount(r)
      return {
        facts: [
          ...fact('Tone', r.toneUsed),
          ...fact('Length', `${wordCount} words`),
          ...(reqCount > 0 ? fact('Tailored for', `${reqCount} requirements`) : []),
        ],
        note: r.summary.confidence_note,
      }
    },
    topActions: (payload) => normalizeCoverLetterPayload(payload).topActions,
    render: (payload, item) => <CoverLetterView payload={payload} item={item} />,
  },
  interview: {
    copyText: (payload) => interviewCopyText(payload),
    summary: (payload) => {
      const r = normalizeInterviewPayload(payload)
      const practiceCount = r.questions.filter((q) => q.practiceFirst).length
      return {
        facts: [
          ...fact('Questions', r.questions.length),
          ...fact('Focus areas', r.focusAreas.length),
          ...(practiceCount > 0 ? fact('Practice first', practiceCount) : []),
          ...(r.weakSignals.length > 0 ? fact('Weak signals', r.weakSignals.length) : []),
        ],
        note: r.summary.confidence_note,
      }
    },
    topActions: (payload) => normalizeInterviewPayload(payload).topActions,
    render: (payload) => <InterviewView payload={payload} />,
  },
  career: {
    copyText: (payload) => careerCopyText(payload),
    summary: (payload) => {
      const r = normalizeCareerPayload(payload)
      return {
        score: { value: r.recommendedDirection.fitScore, label: 'Fit score', unit: '%' },
        facts: [
          ...fact('Timeline', r.recommendedDirection.transitionTimeline),
          ...(r.skillGaps.length > 0 ? fact('Skill gaps', `${r.skillGaps.length} to close`) : []),
        ],
        note: r.summary.confidence_note,
      }
    },
    topActions: (payload) => normalizeCareerPayload(payload).topActions,
    render: (payload) => <CareerView payload={payload} />,
  },
  portfolio: {
    copyText: (payload) => portfolioCopyText(payload),
    summary: (payload) => {
      const r = normalizePortfolioPayload(payload)
      return {
        facts: [
          ...fact('Projects', `${r.projects.length} in sequence`),
          ...fact('Target role', r.targetRole),
          ...(r.sequencePlan.length > 0 ? fact('Start with', r.recommendedStartProject) : []),
        ],
        note: r.summary.confidence_note,
      }
    },
    topActions: (payload) => normalizePortfolioPayload(payload).topActions,
    render: (payload) => <PortfolioView payload={payload} />,
  },
}
