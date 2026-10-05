import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Zap } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Cluster,
  Disclosure,
  EmptyState,
  FitStamp,
  KeyValue,
  List,
  MetaRow,
  NumberDisc,
  Panel,
  PanelBody,
  Row,
  RowBody,
  RowMeta,
  RowSubtitle,
  RowTitle,
  ScoreBar,
  Section,
  Segmented,
  Stack,
  Sticker,
  Table,
  Textarea,
} from '#/components/kit'
import type { TableColumn, Tone } from '#/components/kit'
import { InterviewPracticeMode } from '#/components/tooling/InterviewPracticeMode'
import {
  CheckDisc,
  Lines,
  Prose,
  ReportSection,
  ResultList,
  SeverityBadge,
  editedLetterText,
  readLetterDraft,
  setEditedLetterText,
  useLetterAutosave,
  useReportPracticing,
  useResultReveal,
  verdictTone,
} from '#/components/tooling/ResultParts'
import type { LetterSaveState } from '#/components/tooling/ResultParts'
import { useBreakpoint } from '#/hooks/use-breakpoint'
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

/** "1 question", "2 questions". */
export function countOf(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`
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

/** "Target role: <role>", or just "Target role" when the backend sent only a placeholder. */
export function roleFitLabel(label: string) {
  const trimmed = label.trim()
  if (!trimmed || /^(the )?target role$/i.test(trimmed)) return 'Target role'
  return `Target role: ${trimmed}`
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

function coverLetterTextFor(payload: AnyObject, item?: ToolRunDetail) {
  return editedLetterText(item?.id) || coverLetterCopyText(payload)
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

/* ── Shared: fix-first stickers ── */

export type TopAction = { title: string; action: string; priority: string }

/**
 * The few highest-value actions as lemon stickers: the first two are stickers (equal height, slightly
 * tilted, they slap on after the score seal), a third is a plain row under them. Severity is text.
 */
export function FixFirstList({ actions }: { actions: TopAction[] }) {
  const items = actions.slice(0, 3)
  const reveal = useResultReveal()
  const phone = useBreakpoint() === 'mobile'
  if (items.length === 0) return null
  const stickers = items.slice(0, 2)
  const rest = items.slice(2)
  const tilts = [-2, 1.6]

  return (
    <ReportSection title="Fix first" count={items.length} countTone="lemon">
      <Stack gap={4}>
        <ol className="result-fixes" aria-label="Fix first" data-count={stickers.length}>
          {stickers.map((a, i) => (
            <Sticker
              key={`${a.title}-${i}`}
              as="li"
              tone="lemon"
              tilt={phone ? 0 : tilts[i]}
              reveal={reveal ? 'slap' : 'none'}
              revealOrder={(i + 1) as 1 | 2}
              className="result-fix"
            >
              <div className="result-fix__top">
                <NumberDisc n={i + 1} />
                <SeverityBadge level={a.priority} onSticker />
              </div>
              <h3 className="result-fix__title">{a.title}</h3>
              <p className="result-fix__body">{a.action}</p>
            </Sticker>
          ))}
        </ol>
        {rest.length > 0 ? (
          <List aria-label="More to fix" numbered style={{ counterReset: `kit-row ${stickers.length}` }}>
            {rest.map((a, i) => (
              <Row key={`${a.title}-${i}`}>
                <RowBody>
                  <RowTitle>{a.title}</RowTitle>
                  <RowSubtitle>{a.action}</RowSubtitle>
                </RowBody>
                <RowMeta>
                  <SeverityBadge level={a.priority} />
                </RowMeta>
              </Row>
            ))}
          </List>
        ) : null}
      </Stack>
    </ReportSection>
  )
}

function RoleFitLevel({ score }: { score: number }) {
  if (score >= 70) return <Badge tone="success">High match</Badge>
  if (score >= 40) return <Badge tone="warning">Moderate</Badge>
  return <Badge tone="danger">Low match</Badge>
}

/** "Why it matters / Fix" pairs under a row's title. */
function WhyFix({ items }: { items: Array<{ label: string; value: string }> }) {
  return <KeyValue className="result-why" divided={false} labelWidth="7rem" items={items} />
}

/** The two lowest dimensions (ties by list order): what the breakdown highlights. Needs three or more to mean anything. */
export function lowestTwo<T extends { score: number }>(rows: T[]): Set<T> {
  if (rows.length < 3) return new Set()
  const ranked = rows.map((row, index) => ({ row, index })).sort((a, b) => a.row.score - b.row.score || a.index - b.index)
  return new Set(ranked.slice(0, 2).map((entry) => entry.row))
}

/** "Structure is your strongest area at 82. Completeness is the lowest at 74, with ..." read from the numbers, never written. */
export function breakdownInsight(rows: Array<{ label: string; score: number }>): string {
  if (rows.length < 2) return ''
  const byScore = rows.map((row, index) => ({ row, index })).sort((a, b) => a.row.score - b.row.score || a.index - b.index).map((e) => e.row)
  const lowest = byScore[0]
  const strongest = [...byScore].reverse().reduce((best, row) => (row.score > best.score ? row : best), byScore[byScore.length - 1])
  if (strongest.score === lowest.score) return `Every area scores ${lowest.score}.`
  const next = byScore[1]
  const tail =
    next && next !== strongest
      ? next.score - lowest.score <= 5
        ? `, with ${next.label.toLowerCase()} close behind at ${next.score}`
        : `, then ${next.label.toLowerCase()} at ${next.score}`
      : ''
  return `${strongest.label} is your strongest area at ${strongest.score}. ${lowest.label} is the lowest at ${lowest.score}${tail}.`
}

/** Matched and missing terms as two labelled lines. */
function KeywordFacts({ matched, missing }: { matched: string[]; missing: string[] }) {
  const items = [
    ...(matched.length > 0 ? [{ label: `Matched (${matched.length})`, value: matched.join(', ') }] : []),
    ...(missing.length > 0 ? [{ label: `Missing (${missing.length})`, value: missing.join(', ') }] : []),
  ]
  return <KeyValue items={items} />
}

/* ── Resume ── */

function ResumeResultView({ payload }: { payload: AnyObject }) {
  const result = normalizeResumePayload(payload)
  const { evidence } = result
  const hasKeywords = evidence.matchedKeywords.length > 0 || evidence.missingKeywords.length > 0
  const highlighted = lowestTwo(result.scoreBreakdown)
  const insight = breakdownInsight(result.scoreBreakdown)

  return (
    <>
      {result.scoreBreakdown.length > 0 && (
        <ReportSection title="Score breakdown">
          <div className="result-break">
            <Panel>
              <PanelBody>
                <Stack gap={4}>
                  <Stack gap={6} role="group" aria-label="Score breakdown">
                    {result.scoreBreakdown.map((item) => (
                      <ScoreBar
                        key={item.key}
                        layout="inline"
                        label={item.label}
                        value={item.score}
                        valueLabel={String(item.score)}
                        tone={highlighted.has(item) ? 'accent' : 'ink'}
                      />
                    ))}
                  </Stack>
                  {highlighted.size > 0 ? (
                    <p className="result-legend" aria-label="Legend">
                      <span className="result-legend__item" data-tone="accent">
                        Lowest two
                      </span>
                      <span className="result-legend__item" data-tone="ink">
                        Everything else
                      </span>
                    </p>
                  ) : null}
                </Stack>
              </PanelBody>
            </Panel>
            {insight ? (
              <Section headingLevel={3} title="Where the points are" className="result-break__note">
                <p className="result-lead-note">{insight}</p>
              </Section>
            ) : null}
          </div>
        </ReportSection>
      )}

      {result.strengths.length > 0 && (
        <ReportSection title="Major strengths" count={Math.min(result.strengths.length, 4)} countTone="mint">
          <ResultList
            label="Major strengths"
            items={result.strengths.slice(0, 4).map((s) => ({ key: s, title: s, leading: <CheckDisc />, titleSize: 'lg' as const }))}
          />
        </ReportSection>
      )}

      {result.issues.length > 0 && (
        <ReportSection title="Refinement areas" count={result.issues.length}>
          <List numbered aria-label="Refinement areas">
            {result.issues.map((issue) => (
              <Row key={issue.id}>
                <RowBody>
                  <div className="result-refine">
                    <div className="result-refine__head">
                      <h3 className="result-refine__title">{issue.title}</h3>
                      <SeverityBadge level={issue.severity} />
                    </div>
                    <div className="result-refine__why">
                      <span className="result-refine__label">Why it matters</span>
                      <p>{issue.whyItMatters}</p>
                    </div>
                    <Panel tone="lemon" className="result-refine__fix">
                      <PanelBody>
                        <span className="result-refine__label">Fix</span>
                        <p>{issue.fix}</p>
                      </PanelBody>
                    </Panel>
                  </div>
                </RowBody>
              </Row>
            ))}
          </List>
        </ReportSection>
      )}

      {hasKeywords && (
        <ReportSection title="Keyword optimization">
          <KeywordFacts matched={evidence.matchedKeywords} missing={evidence.missingKeywords} />
        </ReportSection>
      )}

      {result.roleFit && (
        <ReportSection title="Role fit" actions={<RoleFitLevel score={result.roleFit.fitScore} />}>
          <Stack gap={3}>
            <ScoreBar
              layout="inline"
              label={roleFitLabel(result.roleFit.targetRoleLabel)}
              value={result.roleFit.fitScore}
              valueLabel={`${result.roleFit.fitScore}%`}
            />
            {result.roleFit.rationale && <Prose>{result.roleFit.rationale}</Prose>}
          </Stack>
        </ReportSection>
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

type RequirementRow = JobMatchResultPayload['requirements'][number] & { rowId: string }

const REQUIREMENT_COLUMNS: Array<TableColumn<RequirementRow>> = [
  {
    id: 'requirement',
    header: 'Requirement',
    primary: true,
    width: '30%',
    cell: (item) => (
      <>
        {item.requirement}
        {item.importance !== 'must' ? (
          <>
            {' '}
            <Badge size="sm">Preferred</Badge>
          </>
        ) : null}
      </>
    ),
  },
  { id: 'status', header: 'Status', hideHeader: true, width: '7rem', stackLabel: false, cell: (item) => requirementStatusBadge(item.status) },
  {
    id: 'detail',
    header: 'Detail',
    stackLabel: false,
    cell: (item) => (item.status === 'matched' ? item.resumeEvidence : item.suggestedFix),
  },
]

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function JobMatchView({ payload }: { payload: AnyObject }) {
  const result = normalizeJobMatchPayload(payload)
  // Must-haves first, then the preferred ones, each group in the order the analysis gave them.
  const requirementRows: RequirementRow[] = result.requirements
    .map((req, index) => ({ ...req, rowId: `${index}-${req.requirement}` }))
    .sort((a, b) => Number(b.importance === 'must') - Number(a.importance === 'must'))

  // What Fix first (the page's list of the top three actions) already says is not said again below it.
  const fixFirst = result.topActions.slice(0, 3)
  const tailoringActions = result.tailoringActions.filter(
    (a) => !fixFirst.some((top) => sameText(top.action, a.action)),
  )
  const gaps = result.requirements.filter((req) => req.status !== 'matched').map((req) => req.requirement)
  const interviewFocus = result.interviewFocus.filter((focus) => !gaps.some((gap) => sameText(gap, focus)))

  return (
    <>
      {requirementRows.length > 0 && (
        <ReportSection title="Detailed requirements">
          <Table
            caption="Requirements"
            columns={REQUIREMENT_COLUMNS}
            rows={requirementRows}
            getRowId={(item) => item.rowId}
          />
        </ReportSection>
      )}

      {tailoringActions.length > 0 && (
        <ReportSection title="Tailoring actions">
          <ResultList
            numbered
            label="Tailoring actions"
            items={tailoringActions.map((a, i) => ({ key: `${a.keyword}-${i}`, title: a.keyword, detail: a.action }))}
          />
        </ReportSection>
      )}

      {(result.matchedKeywords.length > 0 || result.missingKeywords.length > 0) && (
        <ReportSection title="Keyword breakdown">
          <Stack gap={4}>
            {result.matchedKeywords.length > 0 ? (
              <KeyValue items={[{ label: `Matched (${result.matchedKeywords.length})`, value: result.matchedKeywords.join(', ') }]} />
            ) : null}
            {result.missingKeywords.length > 0 ? (
              <Section headingLevel={3} size="sm" title={`Missing (${result.missingKeywords.length})`}>
                <List aria-label="Missing keywords">
                  {result.missingKeywords.map((k, i) => (
                    <Row key={`${k.keyword}-${i}`}>
                      <RowBody>
                        {k.contextual_guidance || k.anti_stuffing_note ? (
                          <Disclosure variant="inline" title={k.keyword}>
                            <Stack gap={2}>
                              {k.contextual_guidance ? <Prose>{k.contextual_guidance}</Prose> : null}
                              {k.anti_stuffing_note ? (
                                <p className="result-note">
                                  <strong>Only if true.</strong> {k.anti_stuffing_note}
                                </p>
                              ) : null}
                            </Stack>
                          </Disclosure>
                        ) : (
                          <RowTitle>{k.keyword}</RowTitle>
                        )}
                      </RowBody>
                    </Row>
                  ))}
                </List>
              </Section>
            ) : null}
          </Stack>
        </ReportSection>
      )}

      {result.recruiterSummary && (
        <ReportSection title="Recruiter summary" description="How they see you">
          <Panel>
            <PanelBody>
              <p className="result-lead-note">{result.recruiterSummary}</p>
            </PanelBody>
          </Panel>
        </ReportSection>
      )}

      {interviewFocus.length > 0 && (
        <ReportSection title="Interview prep">
          <ResultList label="Interview prep" items={interviewFocus.map((f) => ({ key: f, title: f }))} />
        </ReportSection>
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

const SAVE_LABELS: Record<LetterSaveState, { text: string; tone: 'mint' | 'stone' | 'lilac' | 'rose' } | null> = {
  idle: null,
  saving: { text: 'Saving...', tone: 'stone' },
  saved: { text: 'Saved', tone: 'mint' },
  'saved-local': { text: 'Saved in this tab', tone: 'lilac' },
  error: { text: "Couldn't save. Kept in this tab", tone: 'rose' },
}

/** One numbered part of the letter: its text on the sheet, and in the margin why the paragraph is there. */
function LetterSection({
  n,
  name,
  label,
  value,
  onChange,
  why,
  requirements,
  children,
}: {
  n: number
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  why: string
  requirements: string[]
  children?: ReactNode
}) {
  return (
    <div className="result-sheet__section">
      <div className="result-sheet__main">
        <Sticker as="span" size="sm" tone="lemon" className="result-sheet__tag">
          <NumberDisc n={n} size="sm" /> {name}
        </Sticker>
        <Textarea autosize rows={1} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="result-sheet__text" />
        {children}
      </div>
      <Panel tone="lilac" as="aside" className="result-sheet__why" aria-label={`Why the ${name.toLowerCase()} is there`}>
        <PanelBody>
          <span className="result-refine__label">Why this paragraph</span>
          <p>{why}</p>
          {requirements.length > 0 ? (
            <ul className="result-sheet__reqs" role="list" aria-label="Requirements it answers">
              {requirements.map((req) => (
                <li key={req}>
                  <Badge tone="white" size="sm">
                    {req}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  )
}

function CoverLetterView({ payload, item }: { payload: AnyObject; item?: ToolRunDetail }) {
  const result = normalizeCoverLetterPayload(payload)
  const runId = item?.id
  // An edit saved in this tab (or by the server, which then sends it back in the payload) wins over the generated text.
  const [seed] = useState(() => {
    const draft = runId ? readLetterDraft(runId) : null
    return draft && draft.body.length === result.bodyPoints.length ? draft : null
  })
  const [openingText, setOpeningText] = useState(seed?.opening ?? result.opening.text)
  const [bodyTexts, setBodyTexts] = useState(seed?.body ?? result.bodyPoints.map((p) => p.text))
  const [closingText, setClosingText] = useState(seed?.closing ?? result.closing.text)
  const [edited, setEdited] = useState(false)

  const compiledText = useMemo(
    () => composeCoverLetterText({ opening: openingText, bodyPoints: bodyTexts, closing: closingText }),
    [bodyTexts, closingText, openingText],
  )

  useEffect(() => {
    if (!runId) return
    setEditedLetterText(runId, compiledText)
    return () => setEditedLetterText(runId, null)
  }, [runId, compiledText])

  const saveState = useLetterAutosave(runId, { opening: openingText, body: bodyTexts, closing: closingText }, edited, Boolean(item?.saved))
  const saveLabel = SAVE_LABELS[saveState]
  const lastBody = result.bodyPoints.length
  // The PDF is rendered from the stored letter, so it only carries edits once the server has them.
  const letterSubtitle =
    saveState === 'saved'
      ? 'Edit any paragraph. Copy, Download and PDF use your edits.'
      : saveState === 'saved-local' || saveState === 'error'
        ? 'Edit any paragraph. Copy and Download use your edits; the PDF still has the original letter.'
        : 'Edit any paragraph. Copy and Download use your edits.'

  return (
    <>
      <ReportSection
        title="Letter"
        description={letterSubtitle}
        actions={
          saveLabel ? (
            <span role="status" aria-live="polite">
              <Badge tone={saveLabel.tone} dot>
                {saveLabel.text}
              </Badge>
            </span>
          ) : undefined
        }
      >
        <Panel className="result-sheet">
          <PanelBody>
            <div className="result-sheet__page">
              <p className="result-sheet__date">{formatLetterDate(result.generatedAt)}</p>
              <LetterSection
                n={1}
                name="Opening"
                label="Opening paragraph"
                value={openingText}
                onChange={(v) => {
                  setEdited(true)
                  setOpeningText(v)
                }}
                why={result.opening.whyThisParagraph}
                requirements={result.opening.requirementsUsed}
              />
              {result.bodyPoints.map((point, index) => (
                <LetterSection
                  key={`body-${index}`}
                  n={index + 2}
                  name={lastBody > 1 ? `Body ${index + 1}` : 'Body'}
                  label={`Body paragraph ${index + 1}`}
                  value={bodyTexts[index] || ''}
                  onChange={(v) => {
                    setEdited(true)
                    setBodyTexts((c) => c.map((t, i) => (i === index ? v : t)))
                  }}
                  why={point.whyThisParagraph}
                  requirements={point.requirementsUsed}
                />
              ))}
              <LetterSection
                n={lastBody + 2}
                name="Closing"
                label="Closing paragraph"
                value={closingText}
                onChange={(v) => {
                  setEdited(true)
                  setClosingText(v)
                }}
                why={result.closing.whyThisParagraph}
                requirements={result.closing.requirementsUsed}
              >
                <p className="result-sheet__sign">
                  Sincerely,
                  <br />
                  [Your name]
                </p>
              </LetterSection>
            </div>
          </PanelBody>
        </Panel>
      </ReportSection>

      {result.customizationNotes.length > 0 && (
        <ReportSection title="Customization notes">
          <ResultList
            label="Customization notes"
            items={result.customizationNotes.map((n, i) => ({
              key: `${n.note}-${i}`,
              title: n.note,
              meta: <Badge>{COVER_NOTE_LABELS[n.category] ?? n.category}</Badge>,
            }))}
          />
        </ReportSection>
      )}
    </>
  )
}

/* ── Interview ── */

function InterviewView({ payload, runId }: { payload: AnyObject; runId?: string }) {
  const result = normalizeInterviewPayload(payload)
  const [showWeakestFirst, setShowWeakestFirst] = useState(false)
  const [practiceMode, setPracticeMode] = useState(false)
  const practiceButtonRef = useRef<HTMLButtonElement | null>(null)
  const returnToPractice = useRef(false)
  useReportPracticing(practiceMode)

  // Leaving practice brings the "Practice mode" button back: put focus on it again.
  useEffect(() => {
    if (!practiceMode && returnToPractice.current) {
      returnToPractice.current = false
      practiceButtonRef.current?.focus()
    }
  }, [practiceMode])

  const visibleQuestions = useMemo(() => {
    if (!showWeakestFirst) return result.questions
    return [...result.questions.filter((q) => q.practiceFirst), ...result.questions.filter((q) => !q.practiceFirst)]
  }, [showWeakestFirst, result.questions])

  // A badge every row carries says nothing: the rail already counts them.
  const allQuestionsPracticeFirst = result.questions.length > 0 && result.questions.every((q) => q.practiceFirst)
  const allFocusAreasPracticeFirst = result.focusAreas.length > 0 && result.focusAreas.every((a) => a.practiceFirst)
  const severityVaries = new Set(result.weakSignals.map((w) => w.severity)).size > 1

  if (practiceMode) {
    return (
      <InterviewPracticeMode
        runId={runId}
        questions={result.questions.map((q) => ({
          question: q.question,
          answerStructure: q.answerStructure,
          focusArea: q.focusArea,
          answer: q.answer,
          keyPoints: q.keyPoints,
        }))}
        onExit={() => {
          returnToPractice.current = true
          setPracticeMode(false)
        }}
      />
    )
  }

  return (
    <>
      <ReportSection
        title="Question breakdown"
        count={countOf(result.questions.length, 'question')}
        actions={
          <>
            <Segmented
              size="sm"
              aria-label="Question order"
              value={showWeakestFirst ? 'weakest' : 'all'}
              onValueChange={(value) => setShowWeakestFirst(value === 'weakest')}
              options={[
                { value: 'all', label: 'All' },
                { value: 'weakest', label: 'Weakest' },
              ]}
            />
            <Button
              ref={practiceButtonRef}
              type="button"
              variant="secondary"
              size="sm"
              disabled={result.questions.length === 0}
              onClick={() => setPracticeMode(true)}
            >
              <Zap aria-hidden="true" />
              Practice mode
            </Button>
          </>
        }
      >
        {visibleQuestions.length === 0 ? (
          <EmptyState title="No questions in this run" />
        ) : (
          <ResultList
            numbered
            label="Questions"
            items={visibleQuestions.map((q, index) => ({
              key: `${index}-${q.question}`,
              title: q.question,
              detail: (
                <Cluster gap={1}>
                  <Badge>{q.focusArea}</Badge>
                  {q.practiceFirst && !allQuestionsPracticeFirst ? <Badge tone="warning">Practice first</Badge> : null}
                </Cluster>
              ),
              body: <QuestionDetails question={q} />,
            }))}
          />
        )}
      </ReportSection>

      {result.focusAreas.length > 0 && (
        <ReportSection title="Focus areas">
          <ResultList
            label="Focus areas"
            items={result.focusAreas.map((area) => ({
              key: area.title,
              title: area.title,
              detail: area.reason,
              meta: area.practiceFirst && !allFocusAreasPracticeFirst ? <Badge tone="warning">Practice first</Badge> : undefined,
            }))}
          />
        </ReportSection>
      )}

      {result.weakSignals.length > 0 && (
        <ReportSection title="Weak signals">
          <ResultList
            label="Weak signals"
            items={result.weakSignals.map((w) => ({
              key: w.title,
              title: w.title,
              detail: w.prepAction,
              meta: severityVaries ? <SeverityBadge level={w.severity} /> : undefined,
            }))}
          />
        </ReportSection>
      )}

      {result.interviewerNotes.length > 0 && (
        <ReportSection title="Interviewer notes">
          <ResultList label="Interviewer notes" items={result.interviewerNotes.map((n) => ({ key: n, title: n }))} />
        </ReportSection>
      )}
    </>
  )
}

/** Why a question is asked, the sample answer with its structure and likely follow-ups, and the talking points. */
function QuestionDetails({ question: q }: { question: InterviewResultPayload['questions'][number] }) {
  const hasAnswerBlock = Boolean(q.answer) || q.answerStructure.length > 0 || q.followUpQuestions.length > 0
  const items = [
    ...(q.practiceFirst ? [{ label: 'Focus area', value: q.whyAsked }] : []),
    ...(hasAnswerBlock
      ? [
          {
            label: 'Sample answer',
            value: (
              <Disclosure variant="inline" title="Show sample answer">
                <Stack gap={3}>
                  {q.answer ? <Prose>{q.answer}</Prose> : null}
                  {q.answerStructure.length > 0 ? (
                    <KeyValue divided={false} labelWidth="7rem" items={[{ label: 'Structure', value: <Lines items={q.answerStructure} /> }]} />
                  ) : null}
                  {q.followUpQuestions.length > 0 ? (
                    <KeyValue divided={false} labelWidth="7rem" items={[{ label: 'Follow-ups', value: <Lines items={q.followUpQuestions.slice(0, 3)} /> }]} />
                  ) : null}
                </Stack>
              </Disclosure>
            ),
          },
        ]
      : []),
    ...(q.keyPoints.length > 0 ? [{ label: 'Key points', value: <Lines items={q.keyPoints.slice(0, 3)} /> }] : []),
  ]
  if (items.length === 0) return null
  return <KeyValue className="result-why" divided={false} labelWidth="7rem" items={items} />
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

type PathRow = CareerResultPayload['paths'][number] & { rowId: string }

const RISK_TONE: Record<'low' | 'medium' | 'high', Tone> = { low: 'mint', medium: 'lemon', high: 'rose' }

const PATH_COLUMNS: Array<TableColumn<PathRow>> = [
  { id: 'role', header: 'Role', primary: true, width: '14rem', cell: (p) => p.roleTitle },
  {
    id: 'fit',
    header: 'Fit',
    width: '9rem',
    cell: (p) => (
      <ScoreBar aria-label={`${p.roleTitle} fit`} layout="inline" size="sm" value={p.fitScore} valueLabel={`${p.fitScore}%`} />
    ),
  },
  { id: 'timeline', header: 'Timeline', width: '8rem', cell: (p) => p.transitionTimeline },
  {
    id: 'risk',
    header: 'Risk',
    width: '6rem',
    cell: (p) => <Badge tone={RISK_TONE[p.riskLevel] ?? 'stone'}>{p.riskLevel.charAt(0).toUpperCase() + p.riskLevel.slice(1)}</Badge>,
  },
  { id: 'rationale', header: 'Rationale', cell: (p) => p.rationale },
]

function CareerView({ payload }: { payload: AnyObject }) {
  const result = normalizeCareerPayload(payload)
  const recommendedRole = result.recommendedDirection.roleTitle.toLowerCase()
  const altPaths: PathRow[] = result.paths
    .filter((p) => p.roleTitle.toLowerCase() !== recommendedRole)
    .map((p, index) => ({ ...p, rowId: `${index}-${p.roleTitle}` }))
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
      <ReportSection title="Recommended path">
        <Panel>
          <PanelBody>
            <Stack gap={4}>
              <div className="result-direction">
                <FitStamp value={result.recommendedDirection.fitScore} />
                <div>
                  <h3 className="result-direction__title">{result.recommendedDirection.roleTitle}</h3>
                  <MetaRow>
                    {result.recommendedDirection.transitionTimeline}
                    {`${result.recommendedDirection.confidence} confidence`}
                  </MetaRow>
                </div>
              </div>
              <KeyValue
                labelWidth="11rem"
                items={[
                  { label: 'Why this is your ideal next step', value: result.recommendedDirection.whyNow },
                  ...(strengths.length > 0 ? [{ label: 'Strengths to leverage', value: <Lines items={strengths} /> }] : []),
                  ...(result.targetSkills.length > 0
                    ? [{ label: 'Skills to develop next', value: <Lines items={result.targetSkills} /> }]
                    : []),
                  ...(result.currentSkills.length > 0
                    ? [{ label: 'Skills you already bring', value: <Lines items={result.currentSkills} /> }]
                    : []),
                ]}
              />
            </Stack>
          </PanelBody>
        </Panel>
      </ReportSection>

      {result.nextSteps.length > 0 && (
        <ReportSection title={`The ${result.nextSteps.length}-step roadmap`}>
          <ResultList
            numbered
            label="Roadmap"
            items={result.nextSteps.map((step, i) => ({ key: `${step.timeframe}-${i}`, title: step.timeframe, detail: step.action }))}
          />
        </ReportSection>
      )}

      {result.skillGaps.length > 0 && (
        <ReportSection title="Critical skill gaps" count={result.skillGaps.length}>
          <ResultList
            label="Critical skill gaps"
            items={result.skillGaps.map((g) => ({
              key: g.skill,
              title: g.skill,
              meta: <SeverityBadge level={g.urgency} />,
              body: (
                <WhyFix
                  items={[
                    { label: 'Why it matters', value: g.whyItMatters },
                    { label: 'How to build', value: g.howToBuild },
                  ]}
                />
              ),
            }))}
          />
        </ReportSection>
      )}

      {altPaths.length > 0 && (
        <ReportSection title="Alternative paths">
          <Table caption="Alternative career paths" columns={PATH_COLUMNS} rows={altPaths} getRowId={(p) => p.rowId} />
        </ReportSection>
      )}

      <ReportSection title="Note">
        <Prose>{tip}</Prose>
      </ReportSection>
    </>
  )
}

/* ── Portfolio ── */

const COMPLEXITY_TONE: Record<string, Tone> = { foundational: 'mint', intermediate: 'lemon', advanced: 'lilac' }
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function PortfolioView({ payload }: { payload: AnyObject }) {
  const result = normalizePortfolioPayload(payload)
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

  // "Start here" follows the plan's own recommended start so the path never contradicts the summary;
  // the first step is only the fallback when the recommendation names no step.
  const recommendedIndex = orderedSteps.findIndex(
    ({ project }) => project.projectTitle.toLowerCase() === result.recommendedStartProject.toLowerCase(),
  )
  const startIndex = recommendedIndex >= 0 ? recommendedIndex : 0

  // Collect all unique deliverables across projects
  const allDeliverables = result.projects.flatMap((p) => p.deliverables).filter((d, i, arr) => arr.indexOf(d) === i).slice(0, 5)

  return (
    <>
      <ReportSection title="Strategy">
        <Stack gap={3}>
          <Prose strong>{result.strategy.headline}</Prose>
          <Prose>{result.strategy.focus}</Prose>
        </Stack>
      </ReportSection>

      <ReportSection title="The build sequence" count={countOf(orderedSteps.length, 'project')}>
        {orderedSteps.length === 0 ? (
          <EmptyState title="No projects in this run" />
        ) : (
          <ol className="result-path" aria-label="Build sequence">
            {orderedSteps.map(({ step, project }, index) => (
              <li key={project.projectTitle} className="result-path__step">
                <NumberDisc n={index + 1} size="lg" tone={index === startIndex ? 'lemon' : 'white'} />
                <Card as="div">
                  <Stack gap={3}>
                    <div className="result-path__head">
                      <h3 className="result-path__title">{project.projectTitle}</h3>
                      <Cluster gap={2}>
                        {index === startIndex ? <Badge tone="accent">Start here</Badge> : null}
                        <Badge tone={COMPLEXITY_TONE[project.complexity] ?? 'stone'}>{capitalize(project.complexity)}</Badge>
                      </Cluster>
                    </div>
                    <MetaRow>{project.estimatedTimeline}</MetaRow>
                    <Prose>{project.description}</Prose>
                    <KeyValue
                      className="result-why"
                      divided={false}
                      labelWidth="7rem"
                      items={[
                        ...(step.reason ? [{ label: 'Why this slot', value: step.reason }] : []),
                        { label: 'Why this project', value: project.whyThisProject },
                        ...(project.skills.length > 0 ? [{ label: 'Skills', value: project.skills.slice(0, 4).join(', ') }] : []),
                      ]}
                    />
                    {project.hiringSignals.length > 0 ? (
                      <div>
                        <span className="result-refine__label">Proves to hiring teams</span>
                        <ul className="result-chips" role="list">
                          {project.hiringSignals.slice(0, 3).map((signal) => (
                            <li key={signal}>
                              <Badge tone="aqua" size="sm">
                                {signal}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </Stack>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </ReportSection>

      {result.presentationTips.length > 0 && (
        <ReportSection title="Presentation tips">
          <ResultList
            numbered
            label="Presentation tips"
            items={result.presentationTips.map((tip) => ({ key: tip, title: tip }))}
          />
        </ReportSection>
      )}

      {allDeliverables.length > 0 && (
        <ReportSection title="Key deliverables">
          <ResultList label="Key deliverables" items={allDeliverables.map((d) => ({ key: d, title: d }))} />
        </ReportSection>
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
  /** The verdict sticker under the seal; its colour says good, borderline or weak. */
  verdict?: { label: string; tone: Tone }
  /** The white sticker beside it: "2 issues". */
  count?: { value: number; noun: string }
  /** A ratio worth a bar under the score ("Requirements met 3 of 6"). */
  bars?: Array<{ label: string; value: number; max: number; valueLabel: string }>
  facts: Array<{ label: string; value: string }>
  note?: string
}

export type ResultDefinition = {
  copyText: (payload: AnyObject, item: ToolRunDetail) => string
  /** The file to save in a format, built from what is on the page (the cover letter exports your edits). */
  download?: (payload: AnyObject, item: ToolRunDetail, format?: 'txt' | 'md') => {
    filename: string
    content: string
  } | null
  render: (payload: AnyObject, item: ToolRunDetail, tool: ToolDefinition) => ReactNode
  summary: (payload: AnyObject) => ResultSummary
  topActions: (payload: AnyObject) => TopAction[]
}

/** A file name from a run label: no path characters, no trailing dots. */
function sanitizeBaseName(label: string) {
  const cleaned = label.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '')
  return cleaned || 'cover-letter'
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
        verdict: { label: r.summary.verdict, tone: verdictTone(r.summary.verdict, r.overallScore) },
        count: { value: r.issues.length, noun: 'issue' },
        facts: [
          ...fact('Verdict', r.summary.verdict),
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
        verdict: { label: r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1), tone: verdictTone(r.verdict, r.matchScore) },
        count: { value: r.requirements.filter((req) => req.status !== 'matched').length, noun: 'gap' },
        bars:
          r.requirements.length > 0
            ? [{ label: 'Requirements met', value: met, max: r.requirements.length, valueLabel: `${met} of ${r.requirements.length}` }]
            : [],
        facts: [
          ...fact('Verdict', r.verdict.charAt(0).toUpperCase() + r.verdict.slice(1)),
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
    download: (payload, item, format = 'txt') => {
      const text = coverLetterTextFor(payload, item)
      const base = sanitizeBaseName(item.label || 'cover-letter')
      return format === 'md'
        ? { filename: `${base}.md`, content: `# Cover letter\n\n${text}\n` }
        : { filename: `${base}.txt`, content: text }
    },
    summary: (payload) => {
      const r = normalizeCoverLetterPayload(payload)
      const wordCount = r.fullText.split(/\s+/).filter(Boolean).length
      const reqCount = uniqueRequirementCount(r)
      return {
        facts: [
          ...fact('Tone', r.toneUsed),
          ...fact('Length', countOf(wordCount, 'word')),
          ...(reqCount > 0 ? fact('Tailored for', countOf(reqCount, 'requirement')) : []),
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
    render: (payload, item) => <InterviewView payload={payload} runId={item?.id} />,
  },
  career: {
    copyText: (payload) => careerCopyText(payload),
    summary: (payload) => {
      const r = normalizeCareerPayload(payload)
      return {
        score: { value: r.recommendedDirection.fitScore, label: 'Fit score', unit: '%' },
        verdict: {
          label: r.summary.verdict,
          tone: ({ high: 'mint', medium: 'lemon', low: 'rose' } as const)[r.recommendedDirection.confidence] ?? 'white',
        },
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
