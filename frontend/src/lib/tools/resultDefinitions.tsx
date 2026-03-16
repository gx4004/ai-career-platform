import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Copy,
  Download,
  FileText,
  ListChecks,
  MessagesSquare,
  Sparkles,
  Target,
} from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import type { ToolRunDetail } from '#/lib/api/schemas'
import { readEditableBlocks } from '#/lib/tools/exports'
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
  missingKeywords: string[]
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
  if (score >= 80) return 'var(--success)'
  if (score >= 60) return 'var(--warning)'
  return 'var(--destructive)'
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
    missingKeywords: toStringArray(payload.missing_keywords),
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

function EditableBlocksPanel({
  title,
  blocks,
}: {
  title: string
  blocks: ReturnType<typeof readEditableBlocks>
}) {
  const [values, setValues] = useState(blocks.map((block) => block.content))

  if (blocks.length === 0) return null

  return (
    <div className="result-section">
      <h3 className="section-title mb-4">{title}</h3>
      <div className="application-editor-grid">
        {blocks.map((block, index) => (
          <div key={block.id} className="application-section-card result-section">
            <p className="eyebrow mb-3">{block.label}</p>
            <Textarea
              rows={7}
              value={values[index] || ''}
              placeholder={block.placeholder || undefined}
              onChange={(event) =>
                setValues((current) =>
                  current.map((item, currentIndex) =>
                    currentIndex === index ? event.target.value : item,
                  ),
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function TopActionsGrid({
  actions,
}: {
  actions: Array<{ title: string; action: string; priority: 'high' | 'medium' | 'low' }>
}) {
  return (
    <div className="quality-actions-grid">
      {actions.length > 0 ? (
        actions.map((action, index) => (
          <div key={`${action.title}-${index}`} className="metric-card quality-action-card p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Fix first #{index + 1}</p>
              <Badge
                variant="outline"
                style={{ borderColor: priorityTone(action.priority), color: priorityTone(action.priority) }}
              >
                {action.priority}
              </Badge>
            </div>
            <h3 className="section-title mt-3 mb-2">{action.title}</h3>
            <p className="muted-copy">{action.action}</p>
          </div>
        ))
      ) : (
        <div className="metric-card p-5">
          <h3 className="section-title mb-2">No top actions returned</h3>
          <p className="muted-copy">Run the tool again if you want a more detailed action plan.</p>
        </div>
      )}
    </div>
  )
}

function ResumeResultView({ payload }: { payload: AnyObject }) {
  const result = normalizeResumePayload(payload)
  const editableBlocks = readEditableBlocks(payload)

  return (
    <div className="quality-result-stack">
      <div className="quality-hero-grid">
        <div className="result-section quality-score-panel">
          <div className="quality-score-wrap">
            <div
              className="score-gauge"
              style={{
                ['--score-color' as string]: scoreColor(result.overallScore),
                ['--score-value' as string]: result.overallScore,
              }}
            >
              {result.overallScore}
            </div>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <Sparkles size={13} />
                  Resume quality
                </Badge>
                <Badge
                  variant="outline"
                  style={{ borderColor: scoreColor(result.overallScore), color: scoreColor(result.overallScore) }}
                >
                  {result.summary.verdict}
                </Badge>
              </div>
              <div className="grid gap-2">
                <h3 className="section-title">{result.summary.headline}</h3>
                <p className="muted-copy">{result.summary.confidence_note}</p>
              </div>
            </div>
          </div>
        </div>

        {result.roleFit ? (
          <div className="result-section quality-role-fit">
            <div className="flex items-center gap-2">
              <Target size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
              <p className="eyebrow">Target role fit</p>
            </div>
            <div className="quality-role-fit-score">
              <strong>{result.roleFit.fitScore}%</strong>
              <span>{result.roleFit.targetRoleLabel}</span>
            </div>
            <p className="muted-copy">{result.roleFit.rationale}</p>
          </div>
        ) : null}
      </div>

      <div className="result-section">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
          <h3 className="section-title">Top 3 fixes</h3>
        </div>
        <TopActionsGrid actions={result.topActions.slice(0, 3)} />
      </div>

      <div className="result-section">
        <h3 className="section-title mb-4">Score breakdown</h3>
        <div className="quality-breakdown-grid">
          {result.scoreBreakdown.map((item) => (
            <div key={item.key} className="metric-card quality-breakdown-card p-5">
              <p className="eyebrow mb-2">{item.label}</p>
              <div className="flex items-end justify-between gap-4">
                <strong style={{ color: scoreColor(item.score), fontSize: '2rem', lineHeight: 1 }}>
                  {item.score}
                </strong>
                <div className="quality-breakdown-bar" aria-hidden="true">
                  <span style={{ width: `${item.score}%`, background: scoreColor(item.score) }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="quality-evidence-grid">
        <div className="result-section">
          <h3 className="section-title mb-4">What already reads well</h3>
          <div className="result-list">
            {result.strengths.length > 0 ? (
              result.strengths.map((item) => (
                <div key={item} className="result-list-item">
                  <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: 2 }} />
                  <span>{item}</span>
                </div>
              ))
            ) : (
              <p className="muted-copy">No strengths were returned.</p>
            )}
          </div>
        </div>

        <div className="result-section">
          <h3 className="section-title mb-4">Evidence detected</h3>
          <div className="grid gap-4">
            <div>
              <p className="eyebrow mb-2">Sections</p>
              <div className="chip-grid">
                {(result.evidence.detectedSections.length > 0
                  ? result.evidence.detectedSections
                  : ['No clear sections detected']).map((item) => (
                  <Badge key={item} variant="outline">{item}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-2">Skills</p>
              <div className="chip-grid">
                {(result.evidence.detectedSkills.length > 0
                  ? result.evidence.detectedSkills
                  : ['No skills detected']).map((item) => (
                  <Badge key={item} variant="outline">{item}</Badge>
                ))}
              </div>
            </div>
            <div className="quality-chip-columns">
              <div>
                <p className="eyebrow mb-2">Matched keywords</p>
                <div className="chip-grid">
                  {(result.evidence.matchedKeywords.length > 0
                    ? result.evidence.matchedKeywords
                    : ['No matched keywords']).map((item) => (
                    <Badge
                      key={item}
                      variant="outline"
                      style={{ borderColor: 'rgba(34, 197, 94, 0.35)' }}
                    >
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow mb-2">Missing keywords</p>
                <div className="chip-grid">
                  {(result.evidence.missingKeywords.length > 0
                    ? result.evidence.missingKeywords
                    : ['No missing keywords']).map((item) => (
                    <Badge
                      key={item}
                      variant="outline"
                      style={{ borderColor: 'rgba(245, 158, 11, 0.35)' }}
                    >
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="quality-stat-card">
              <p className="eyebrow">Quantified bullets</p>
              <strong>{result.evidence.quantifiedBullets}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="result-section">
        <h3 className="section-title mb-4">Issues to fix next</h3>
        <div className="quality-issues-grid">
          {result.issues.length > 0 ? (
            result.issues.map((issue) => (
              <div key={issue.id} className="metric-card quality-issue-card p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge
                    variant="outline"
                    style={{ borderColor: priorityTone(issue.severity), color: priorityTone(issue.severity) }}
                  >
                    {issue.severity}
                  </Badge>
                  <Badge variant="outline">{issue.category}</Badge>
                </div>
                <h3 className="section-title mb-2">{issue.title}</h3>
                <p className="muted-copy mb-3">{issue.whyItMatters}</p>
                <div className="grid gap-3">
                  <div className="quality-note-block">
                    <p className="eyebrow mb-1">Evidence</p>
                    <p>{issue.evidence}</p>
                  </div>
                  <div className="quality-note-block">
                    <p className="eyebrow mb-1">Suggested rewrite direction</p>
                    <p>{issue.fix}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="muted-copy">No issues were returned.</p>
          )}
        </div>
      </div>

      <EditableBlocksPanel
        title="Section rewrite mode"
        blocks={editableBlocks}
      />
    </div>
  )
}

function JobMatchView({ payload }: { payload: AnyObject }) {
  const result = normalizeJobMatchPayload(payload)
  const checklist = result.requirements.filter((item) => item.status !== 'matched').slice(0, 4)

  return (
    <div className="quality-result-stack">
      <div className="quality-hero-grid">
        <div className="result-section quality-score-panel">
          <div className="quality-score-wrap">
            <div
              className="score-gauge"
              style={{
                ['--score-color' as string]: scoreColor(result.matchScore),
                ['--score-value' as string]: result.matchScore,
              }}
            >
              {result.matchScore}%
            </div>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  <Target size={13} />
                  Job match
                </Badge>
                <Badge
                  variant="outline"
                  style={{ borderColor: scoreColor(result.matchScore), color: scoreColor(result.matchScore) }}
                >
                  {result.verdict}
                </Badge>
              </div>
              <div className="grid gap-2">
                <h3 className="section-title">{result.summary.headline}</h3>
                <p className="muted-copy">{result.summary.confidence_note}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="result-section quality-role-fit">
          <p className="eyebrow mb-2">Recruiter summary</p>
          <p>{result.recruiterSummary}</p>
        </div>
      </div>

      <div className="result-section">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
          <h3 className="section-title">Top actions before you apply</h3>
        </div>
        <TopActionsGrid actions={result.topActions.slice(0, 3)} />
      </div>

      <div className="result-section">
        <h3 className="section-title mb-4">Requirement matrix</h3>
        <div className="quality-issues-grid">
          {result.requirements.length > 0 ? (
            result.requirements.map((item, index) => (
              <div key={`${item.requirement}-${index}`} className="metric-card quality-requirement-card p-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline">{item.importance}</Badge>
                  <Badge
                    variant="outline"
                    style={{ borderColor: statusTone(item.status), color: statusTone(item.status) }}
                  >
                    {item.status}
                  </Badge>
                </div>
                <h3 className="section-title mb-2">{item.requirement}</h3>
                <div className="grid gap-3">
                  <div className="quality-note-block">
                    <p className="eyebrow mb-1">Resume evidence</p>
                    <p>{item.resumeEvidence}</p>
                  </div>
                  <div className="quality-note-block">
                    <p className="eyebrow mb-1">Suggested fix</p>
                    <p>{item.suggestedFix}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="muted-copy">No requirements were returned.</p>
          )}
        </div>
      </div>

      <div className="quality-evidence-grid">
        <div className="result-section">
          <h3 className="section-title mb-4">Keyword coverage</h3>
          <div className="grid gap-4">
            <div>
              <p className="eyebrow mb-2">Matched keywords</p>
              <div className="chip-grid">
                {(result.matchedKeywords.length > 0 ? result.matchedKeywords : ['No matched keywords']).map((item) => (
                  <Badge
                    key={item}
                    variant="outline"
                    style={{ borderColor: 'rgba(34, 197, 94, 0.35)' }}
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-2">Missing keywords</p>
              <div className="chip-grid">
                {(result.missingKeywords.length > 0 ? result.missingKeywords : ['No missing keywords']).map((item) => (
                  <Badge
                    key={item}
                    variant="outline"
                    style={{ borderColor: 'rgba(245, 158, 11, 0.35)' }}
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="result-section">
          <h3 className="section-title mb-4">Before-you-apply checklist</h3>
          <div className="result-list">
            {checklist.length > 0 ? (
              checklist.map((item) => (
                <div key={item.requirement} className="result-list-item">
                  <AlertTriangle size={16} style={{ color: statusTone(item.status), marginTop: 2 }} />
                  <span>
                    <strong>{item.requirement}:</strong> {item.suggestedFix}
                  </span>
                </div>
              ))
            ) : (
              <div className="result-list-item">
                <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: 2 }} />
                <span>The current requirement set reads as fully matched.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="quality-evidence-grid">
        <div className="result-section">
          <h3 className="section-title mb-4">Tailoring actions</h3>
          <div className="result-list">
            {result.tailoringActions.length > 0 ? (
              result.tailoringActions.map((item, index) => (
                <div key={`${item.keyword}-${index}`} className="result-list-item">
                  <CircleDot size={16} style={{ color: 'var(--tool-accent, var(--accent))', marginTop: 2 }} />
                  <span>
                    <strong>{item.section}:</strong> {item.action}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted-copy">No tailoring actions were returned.</p>
            )}
          </div>
        </div>

        <div className="result-section">
          <h3 className="section-title mb-4">Interview handoff</h3>
          <div className="result-list">
            {result.interviewFocus.length > 0 ? (
              result.interviewFocus.map((item) => (
                <div key={item} className="result-list-item">
                  <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: 2 }} />
                  <span>{item}</span>
                </div>
              ))
            ) : (
              <p className="muted-copy">No interview focus topics were returned.</p>
            )}
          </div>
        </div>
      </div>

      <div className="application-handoff-grid">
        <div className="result-section application-handoff-card">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Cover letter handoff</h3>
          </div>
          <div className="grid gap-3">
            <div>
              <p className="eyebrow mb-2">Missing keywords to seed</p>
              <div className="chip-grid">
                {(result.missingKeywords.length > 0 ? result.missingKeywords : ['No missing keywords']).map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="result-list">
              {(result.tailoringActions.length > 0
                ? result.tailoringActions
                : [{ section: 'experience', keyword: 'fit', action: 'No tailoring actions were returned.' }]).map((item, index) => (
                <div key={`${item.keyword}-${index}`} className="result-list-item">
                  <CircleDot size={16} style={{ color: 'var(--tool-accent, var(--accent))', marginTop: 2 }} />
                  <span>
                    <strong>{item.section}:</strong> {item.action}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="result-section application-handoff-card">
          <div className="flex items-center gap-2 mb-4">
            <MessagesSquare size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Interview handoff</h3>
          </div>
          <div className="grid gap-3">
            <div>
              <p className="eyebrow mb-2">Requirement gaps</p>
              <div className="result-list">
                {(checklist.length > 0
                  ? checklist
                  : [{ requirement: 'No major gaps detected', suggestedFix: 'Shift into story repetition and polish.' }]).map((item) => (
                  <div key={item.requirement} className="result-list-item">
                    <AlertTriangle size={16} style={{ color: 'var(--warning)', marginTop: 2 }} />
                    <span>
                      <strong>{item.requirement}:</strong> {item.suggestedFix}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-2">Interview focus to seed</p>
              <div className="chip-grid">
                {(result.interviewFocus.length > 0 ? result.interviewFocus : ['No interview focus topics']).map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CoverLetterView({ payload }: { payload: AnyObject }) {
  const result = normalizeCoverLetterPayload(payload)
  const [openingText, setOpeningText] = useState(result.opening.text)
  const [bodyTexts, setBodyTexts] = useState(result.bodyPoints.map((item) => item.text))
  const [closingText, setClosingText] = useState(result.closing.text)
  const [revisionFocus, setRevisionFocus] = useState<'tone' | 'evidence' | null>(null)

  const compiledText = useMemo(
    () =>
      composeCoverLetterText({
        opening: openingText,
        bodyPoints: bodyTexts,
        closing: closingText,
      }),
    [bodyTexts, closingText, openingText],
  )

  const visibleNotes = result.customizationNotes.filter((item) =>
    revisionFocus === null
      ? true
      : revisionFocus === 'tone'
        ? item.category === 'tone'
        : item.category === 'evidence' || item.category === 'keyword' || item.category === 'gap',
  )

  async function handleCopy() {
    await navigator.clipboard.writeText(compiledText)
  }

  function handleDownload() {
    const blob = new Blob([compiledText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cover-letter.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="quality-result-stack">
      <div className="quality-hero-grid">
        <div className="result-section quality-role-fit">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <FileText size={13} />
              Cover letter
            </Badge>
            <Badge variant="outline">{result.toneUsed}</Badge>
          </div>
          <div className="grid gap-2">
            <h3 className="section-title">{result.summary.headline}</h3>
            <p className="muted-copy">{result.summary.confidence_note}</p>
          </div>
        </div>

        <div className="result-section">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Top actions</h3>
          </div>
          <TopActionsGrid actions={result.topActions.slice(0, 3)} />
        </div>
      </div>

      <div className="result-section">
        <div className="application-toolbar">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={revisionFocus === 'tone' ? 'default' : 'outline'}
              onClick={() => setRevisionFocus((current) => (current === 'tone' ? null : 'tone'))}
            >
              Revise tone
            </Button>
            <Button
              variant={revisionFocus === 'evidence' ? 'default' : 'outline'}
              onClick={() => setRevisionFocus((current) => (current === 'evidence' ? null : 'evidence'))}
            >
              Revise stronger evidence
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleCopy}>
              <Copy size={14} /> Copy
            </Button>
            <Button variant="outline" onClick={handleDownload}>
              <Download size={14} /> Download
            </Button>
          </div>
        </div>
      </div>

      <div className="application-editor-grid">
        <div className="result-section application-section-card">
          <p className="eyebrow mb-3">Opening</p>
          <Textarea
            rows={6}
            value={openingText}
            onChange={(event) => setOpeningText(event.target.value)}
          />
          <div className="application-note-stack">
            <div className="quality-note-block">
              <p className="eyebrow mb-1">Why this paragraph exists</p>
              <p>{result.opening.whyThisParagraph}</p>
            </div>
            <div className="application-chip-columns">
              <div>
                <p className="eyebrow mb-2">Requirements used</p>
                <div className="chip-grid">
                  {(result.opening.requirementsUsed.length > 0
                    ? result.opening.requirementsUsed
                    : ['No requirements returned']).map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow mb-2">Evidence used</p>
                <div className="chip-grid">
                  {(result.opening.evidenceUsed.length > 0
                    ? result.opening.evidenceUsed
                    : ['No evidence returned']).map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {result.bodyPoints.map((item, index) => (
          <div key={`body-point-${index}`} className="result-section application-section-card">
            <p className="eyebrow mb-3">Body block {index + 1}</p>
            <Textarea
              rows={7}
              value={bodyTexts[index] || ''}
              onChange={(event) =>
                setBodyTexts((current) =>
                  current.map((text, currentIndex) =>
                    currentIndex === index ? event.target.value : text,
                  ),
                )
              }
            />
            <div className="application-note-stack">
              <div className="quality-note-block">
                <p className="eyebrow mb-1">Why this paragraph exists</p>
                <p>{item.whyThisParagraph}</p>
              </div>
              <div className="application-chip-columns">
                <div>
                  <p className="eyebrow mb-2">Requirements used</p>
                  <div className="chip-grid">
                    {(item.requirementsUsed.length > 0
                      ? item.requirementsUsed
                      : ['No requirements returned']).map((value) => (
                      <Badge key={value} variant="outline">
                        {value}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2">Evidence used</p>
                  <div className="chip-grid">
                    {(item.evidenceUsed.length > 0
                      ? item.evidenceUsed
                      : ['No evidence returned']).map((value) => (
                      <Badge key={value} variant="outline">
                        {value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="result-section application-section-card">
          <p className="eyebrow mb-3">Closing</p>
          <Textarea
            rows={5}
            value={closingText}
            onChange={(event) => setClosingText(event.target.value)}
          />
          <div className="application-note-stack">
            <div className="quality-note-block">
              <p className="eyebrow mb-1">Why this paragraph exists</p>
              <p>{result.closing.whyThisParagraph}</p>
            </div>
            <div className="application-chip-columns">
              <div>
                <p className="eyebrow mb-2">Requirements used</p>
                <div className="chip-grid">
                  {(result.closing.requirementsUsed.length > 0
                    ? result.closing.requirementsUsed
                    : ['No requirements returned']).map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow mb-2">Evidence used</p>
                <div className="chip-grid">
                  {(result.closing.evidenceUsed.length > 0
                    ? result.closing.evidenceUsed
                    : ['No evidence returned']).map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="result-section application-section-card">
          <p className="eyebrow mb-3">Full text preview</p>
          <div className="letter-block">{compiledText || result.fullText}</div>
        </div>
      </div>

      <div className="application-handoff-grid">
        <div className="result-section application-handoff-card">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Customization notes</h3>
          </div>
          <div className="application-note-stack">
            {(visibleNotes.length > 0 ? visibleNotes : result.customizationNotes).map((item, index) => (
              <div key={`${item.note}-${index}`} className="quality-note-block">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant="outline">{item.category}</Badge>
                  <Badge variant="outline">{item.source}</Badge>
                </div>
                <p>{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="result-section application-handoff-card">
          <div className="flex items-center gap-2 mb-4">
            <Target size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Requirements carried into the draft</h3>
          </div>
          <div className="chip-grid">
            {[
              ...result.opening.requirementsUsed,
              ...result.bodyPoints.flatMap((item) => item.requirementsUsed),
              ...result.closing.requirementsUsed,
            ]
              .filter((item, index, items) => item && items.indexOf(item) === index)
              .map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function InterviewView({ payload }: { payload: AnyObject }) {
  const result = normalizeInterviewPayload(payload)
  const editableBlocks = readEditableBlocks(payload)
  const [practiceGapsFirst, setPracticeGapsFirst] = useState(false)

  const visibleQuestions = useMemo(() => {
    if (!practiceGapsFirst) return result.questions
    const gapQuestions = result.questions.filter((item) => item.practiceFirst)
    const remaining = result.questions.filter((item) => !item.practiceFirst)
    return [...gapQuestions, ...remaining]
  }, [practiceGapsFirst, result.questions])

  return (
    <div className="quality-result-stack">
      <div className="quality-hero-grid">
        <div className="result-section quality-role-fit">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <MessagesSquare size={13} />
              Interview prep
            </Badge>
            <Badge variant="outline">{result.summary.verdict}</Badge>
          </div>
          <div className="grid gap-2">
            <h3 className="section-title">{result.summary.headline}</h3>
            <p className="muted-copy">{result.summary.confidence_note}</p>
          </div>
        </div>

        <div className="result-section">
          <div className="flex items-center gap-2 mb-4">
            <ListChecks size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Top actions</h3>
          </div>
          <TopActionsGrid actions={result.topActions.slice(0, 3)} />
        </div>
      </div>

      <div className="result-section flex items-center justify-between gap-4">
        <div>
          <h3 className="section-title">Practice order</h3>
          <p className="muted-copy">
            Move through every question, or switch into a gap-first sequence that
            brings weaker signals to the front.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setPracticeGapsFirst((current) => !current)}
          >
            {practiceGapsFirst ? 'Show full mix' : 'Practice your gaps first'}
          </Button>
        </div>
      </div>

      <div className="application-handoff-grid">
        <div className="result-section application-handoff-card">
          <h3 className="section-title mb-4">Focus areas</h3>
          <div className="application-note-stack">
            {result.focusAreas.length > 0 ? (
              result.focusAreas.map((item) => (
                <div key={item.title} className="quality-note-block">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {item.practiceFirst ? <Badge variant="outline">Practice first</Badge> : null}
                    {item.requirementsUsed.map((value) => (
                      <Badge key={value} variant="outline">
                        {value}
                      </Badge>
                    ))}
                  </div>
                  <p className="section-title mb-1">{item.title}</p>
                  <p>{item.reason}</p>
                </div>
              ))
            ) : (
              <p className="muted-copy">No focus areas were returned.</p>
            )}
          </div>
        </div>

        <div className="result-section application-handoff-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
            <h3 className="section-title">Likely weak areas</h3>
          </div>
          <div className="application-note-stack">
            {result.weakSignals.length > 0 ? (
              result.weakSignals.map((item) => (
                <div key={item.title} className="quality-note-block">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge
                      variant="outline"
                      style={{ borderColor: priorityTone(item.severity), color: priorityTone(item.severity) }}
                    >
                      {item.severity}
                    </Badge>
                    {item.relatedRequirements.map((value) => (
                      <Badge key={value} variant="outline">
                        {value}
                      </Badge>
                    ))}
                  </div>
                  <p className="section-title mb-1">{item.title}</p>
                  <p className="muted-copy mb-2">{item.whyItMatters}</p>
                  <p>{item.prepAction}</p>
                </div>
              ))
            ) : (
              <p className="muted-copy">No weak signals were returned.</p>
            )}
          </div>
        </div>
      </div>

      <Accordion type="single" collapsible className="result-section">
        {visibleQuestions.length === 0 ? (
          <p>No interview questions were returned in the current payload.</p>
        ) : (
          visibleQuestions.map((item, index) => (
            <AccordionItem key={`${index}-${item.question}`} value={`qa-${index}`}>
              <AccordionTrigger>
                <div className="flex flex-wrap items-center gap-2 pr-4">
                  <span>{item.question}</span>
                  <Badge variant="outline">{item.focusArea}</Badge>
                  {item.practiceFirst ? <Badge variant="outline">Gap first</Badge> : null}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4">
                  <div className="quality-note-block">
                    <p className="eyebrow mb-1">Why this is being asked</p>
                    <p>{item.whyAsked}</p>
                  </div>
                  <div className="quality-note-block">
                    <p className="eyebrow mb-1">Sample answer</p>
                    <p>{item.answer}</p>
                  </div>
                  <div className="application-chip-columns">
                    <div>
                      <p className="eyebrow mb-2">Answer structure</p>
                      <div className="chip-grid">
                        {(item.answerStructure.length > 0
                          ? item.answerStructure
                          : ['No answer structure returned']).map((point) => (
                          <Badge key={point} variant="outline">
                            {point}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="eyebrow mb-2">Key points</p>
                      <div className="chip-grid">
                        {(item.keyPoints.length > 0
                          ? item.keyPoints
                          : ['No key points returned']).map((point) => (
                          <Badge key={point} variant="outline">
                            {point}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="quality-note-block">
                    <p className="eyebrow mb-1">Follow-up questions</p>
                    <div className="result-list">
                      {(item.followUpQuestions.length > 0
                        ? item.followUpQuestions
                        : ['No follow-up questions returned']).map((question) => (
                        <div key={question} className="result-list-item">
                          <CircleDot size={16} style={{ color: 'var(--tool-accent, var(--accent))', marginTop: 2 }} />
                          <span>{question}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))
        )}
      </Accordion>

      <div className="result-section">
        <h3 className="section-title mb-4">Interviewer notes</h3>
        <div className="result-list">
          {result.interviewerNotes.length > 0 ? (
            result.interviewerNotes.map((item) => (
              <div key={item} className="result-list-item">
                <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: 2 }} />
                <span>{item}</span>
              </div>
            ))
          ) : (
            <p className="muted-copy">No interviewer notes were returned.</p>
          )}
        </div>
      </div>

      <EditableBlocksPanel
        title="Answer refinement"
        blocks={editableBlocks}
      />
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

function CareerView({ payload }: { payload: AnyObject }) {
  const result = normalizeCareerPayload(payload)
  const groupedSkillGaps: Array<{
    label: string
    key: 'high' | 'medium' | 'low'
    items: CareerResultPayload['skillGaps']
  }> = [
    { label: 'High urgency', key: 'high', items: result.skillGaps.filter((item) => item.urgency === 'high') },
    { label: 'Medium urgency', key: 'medium', items: result.skillGaps.filter((item) => item.urgency === 'medium') },
    { label: 'Lower urgency', key: 'low', items: result.skillGaps.filter((item) => item.urgency === 'low') },
  ]
  const bestNextAction = result.topActions[0] || null
  const bestNextStep = result.nextSteps[0] || null

  return (
    <div className="quality-result-stack">
      <div className="quality-hero-grid">
        <div className="result-section quality-role-fit planning-spotlight-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <Target size={13} />
              Recommended direction
            </Badge>
            <Badge
              variant="outline"
              style={{
                borderColor: scoreColor(result.recommendedDirection.fitScore),
                color: scoreColor(result.recommendedDirection.fitScore),
              }}
            >
              {result.recommendedDirection.fitScore}% fit
            </Badge>
            <Badge
              variant="outline"
              style={{
                borderColor: priorityTone(result.recommendedDirection.confidence),
                color: priorityTone(result.recommendedDirection.confidence),
              }}
            >
              {result.recommendedDirection.confidence} confidence
            </Badge>
          </div>
          <div className="grid gap-2">
            <h3 className="section-title">{result.recommendedDirection.roleTitle}</h3>
            <p className="muted-copy">{result.summary.headline}</p>
          </div>
          <div className="planning-hero-meta">
            <div className="quality-note-block">
              <p className="eyebrow mb-1">Transition window</p>
              <p>{result.recommendedDirection.transitionTimeline}</p>
            </div>
            <div className="quality-note-block">
              <p className="eyebrow mb-1">Why now</p>
              <p>{result.recommendedDirection.whyNow}</p>
            </div>
          </div>
          <p className="small-copy muted-copy">{result.summary.confidence_note}</p>
        </div>

        <div className="result-section planning-cta-card">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Best next move</h3>
          </div>
          {bestNextAction || bestNextStep ? (
            <div className="grid gap-3">
              <div className="quality-note-block">
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow">{bestNextAction ? bestNextAction.title : bestNextStep?.timeframe}</p>
                  {bestNextAction ? (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: priorityTone(bestNextAction.priority),
                        color: priorityTone(bestNextAction.priority),
                      }}
                    >
                      {bestNextAction.priority}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2">{bestNextAction ? bestNextAction.action : bestNextStep?.action}</p>
              </div>
              <p className="small-copy muted-copy">
                Use this as the decision anchor before you compare other paths or start building proof.
              </p>
            </div>
          ) : (
            <p className="muted-copy">No next move was returned.</p>
          )}
        </div>
      </div>

      <div className="result-section">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
          <h3 className="section-title">Top actions</h3>
        </div>
        <TopActionsGrid actions={result.topActions.slice(0, 3)} />
      </div>

      <div className="result-section">
        <h3 className="section-title mb-4">Alternative path comparison</h3>
        <div className="career-card-grid">
          {(result.paths.length > 0 ? result.paths : [{
            roleTitle: 'No alternative paths returned.',
            fitScore: 0,
            transitionTimeline: 'Not specified',
            rationale: 'Run the planner again to compare paths.',
            strengthsToLeverage: [],
            gapsToClose: [],
            riskLevel: 'medium' as const,
          }]).map((path) => (
            <div key={path.roleTitle} className="metric-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h3 className="section-title">{path.roleTitle}</h3>
                <Badge
                  variant="outline"
                  style={{ borderColor: riskTone(path.riskLevel), color: riskTone(path.riskLevel) }}
                >
                  {path.riskLevel} risk
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge
                  variant="outline"
                  style={{
                    borderColor: scoreColor(path.fitScore),
                    color: scoreColor(path.fitScore),
                  }}
                >
                  {path.fitScore}% fit
                </Badge>
                <Badge variant="outline">{path.transitionTimeline}</Badge>
              </div>
              <p className="muted-copy mb-4">{path.rationale}</p>
              <div className="planning-chip-columns">
                <div>
                  <p className="eyebrow mb-2">Strengths to leverage</p>
                  <div className="chip-grid">
                    {(path.strengthsToLeverage.length > 0 ? path.strengthsToLeverage : ['No strengths returned']).map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2">Gaps to close</p>
                  <div className="chip-grid">
                    {(path.gapsToClose.length > 0 ? path.gapsToClose : ['No gaps returned']).map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="quality-evidence-grid">
        <div className="result-section">
          <h3 className="section-title mb-4">Skill baseline</h3>
          <div className="planning-chip-columns">
            <div className="practice-card">
              <p className="eyebrow mb-3">Current skills</p>
              <div className="chip-grid">
                {(result.currentSkills.length > 0 ? result.currentSkills : ['No current skills surfaced']).map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="practice-card">
              <p className="eyebrow mb-3">Target skills</p>
              <div className="chip-grid">
                {(result.targetSkills.length > 0 ? result.targetSkills : ['No target skills surfaced']).map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="result-section">
          <h3 className="section-title mb-4">Skill gaps by urgency</h3>
          <div className="grid gap-4">
            {groupedSkillGaps.map((group) => (
              <div key={group.key} className="quality-note-block">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <p className="eyebrow">{group.label}</p>
                  <Badge
                    variant="outline"
                    style={{ borderColor: priorityTone(group.key), color: priorityTone(group.key) }}
                  >
                    {group.items.length}
                  </Badge>
                </div>
                <div className="grid gap-3">
                  {(group.items.length > 0 ? group.items : [{
                    skill: `No ${group.label.toLowerCase()} gaps`,
                    urgency: group.key,
                    whyItMatters: 'The planner did not return items for this urgency tier.',
                    howToBuild: '',
                  }]).map((gap) => (
                    <div key={`${group.key}-${gap.skill}`} className="planning-gap-card">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant="outline"
                          style={{ borderColor: priorityTone(gap.urgency), color: priorityTone(gap.urgency) }}
                        >
                          {gap.urgency}
                        </Badge>
                        <strong>{gap.skill}</strong>
                      </div>
                      <p className="muted-copy mb-2">{gap.whyItMatters}</p>
                      {gap.howToBuild ? (
                        <p className="small-copy"><strong>How to build:</strong> {gap.howToBuild}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="result-section">
        <h3 className="section-title mb-4">Next-steps timeline</h3>
        <div className="planning-timeline-list">
          {(result.nextSteps.length > 0 ? result.nextSteps : [{
            timeframe: 'Next step',
            action: 'Run the planner again if you want a fuller timeline.',
          }]).map((step, index) => (
            <div key={`${step.timeframe}-${index}`} className="quality-note-block planning-timeline-step">
              <p className="eyebrow mb-2">{step.timeframe}</p>
              <p>{step.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PortfolioView({ payload }: { payload: AnyObject }) {
  const result = normalizePortfolioPayload(payload)
  const projectsByTitle = Object.fromEntries(
    result.projects.map((project) => [project.projectTitle.toLowerCase(), project]),
  ) as Record<string, PortfolioResultPayload['projects'][number]>
  const recommendedProject =
    projectsByTitle[result.recommendedStartProject.toLowerCase()] || result.projects[0] || null

  return (
    <div className="quality-result-stack">
      <div className="quality-hero-grid">
        <div className="result-section quality-role-fit planning-spotlight-card">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <Target size={13} />
              {result.targetRole}
            </Badge>
            <Badge variant="outline">{result.summary.verdict}</Badge>
          </div>
          <div className="grid gap-2">
            <h3 className="section-title">{result.strategy.headline}</h3>
            <p className="muted-copy">{result.strategy.focus}</p>
          </div>
          <div className="quality-note-block">
            <p className="eyebrow mb-1">Proof goal</p>
            <p>{result.strategy.proofGoal}</p>
          </div>
          <p className="small-copy muted-copy">{result.summary.confidence_note}</p>
        </div>

        <div className="result-section planning-cta-card">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
            <h3 className="section-title">Recommended first project</h3>
          </div>
          {recommendedProject ? (
            <div className="grid gap-3">
              <div>
                <h4 className="section-title">{recommendedProject.projectTitle}</h4>
                <p className="muted-copy mt-2">{recommendedProject.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  style={{
                    borderColor: complexityTone(recommendedProject.complexity),
                    color: complexityTone(recommendedProject.complexity),
                  }}
                >
                  {recommendedProject.complexity}
                </Badge>
                <Badge variant="outline">{recommendedProject.estimatedTimeline}</Badge>
              </div>
              <div className="quality-note-block">
                <p className="eyebrow mb-1">Why start here</p>
                <p>{recommendedProject.whyThisProject}</p>
              </div>
            </div>
          ) : (
            <p className="muted-copy">No starting project was returned.</p>
          )}
        </div>
      </div>

      <div className="result-section">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks size={16} style={{ color: 'var(--tool-accent, var(--accent))' }} />
          <h3 className="section-title">Top actions</h3>
        </div>
        <TopActionsGrid actions={result.topActions.slice(0, 3)} />
      </div>

      <div className="result-section">
        <h3 className="section-title mb-4">Sequenced project roadmap</h3>
        <div className="planning-roadmap-grid">
          {(result.sequencePlan.length > 0 ? result.sequencePlan : [{
            order: 1,
            projectTitle: 'No project sequence returned',
            reason: 'Run the planner again to generate a roadmap.',
          }]).map((step) => {
            const project = projectsByTitle[step.projectTitle.toLowerCase()]
            return (
              <div key={`${step.order}-${step.projectTitle}`} className="metric-card p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <Badge variant="outline">Step {step.order}</Badge>
                  {project ? (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: complexityTone(project.complexity),
                        color: complexityTone(project.complexity),
                      }}
                    >
                      {project.complexity}
                    </Badge>
                  ) : null}
                </div>
                <h3 className="section-title mb-2">{step.projectTitle}</h3>
                <p className="muted-copy">{step.reason}</p>
                {project ? <p className="small-copy mt-3">{project.estimatedTimeline}</p> : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="portfolio-card-grid">
        {(result.projects.length > 0 ? result.projects : [{
          projectTitle: 'No project recommendations returned.',
          description: 'Try running the planner again with a clearer target role.',
          skills: [],
          complexity: 'foundational' as const,
          whyThisProject: 'No project rationale was returned.',
          deliverables: [],
          hiringSignals: [],
          estimatedTimeline: 'Unavailable',
        }]).map((project) => (
          <div key={project.projectTitle} className="metric-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="section-title">{project.projectTitle}</h3>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  style={{
                    borderColor: complexityTone(project.complexity),
                    color: complexityTone(project.complexity),
                  }}
                >
                  {project.complexity}
                </Badge>
                <Badge variant="outline">{project.estimatedTimeline}</Badge>
              </div>
            </div>
            <p className="muted-copy mb-4">{project.description}</p>
            <div className="quality-note-block mb-4">
              <p className="eyebrow mb-1">Why this project</p>
              <p>{project.whyThisProject}</p>
            </div>
            <div className="planning-chip-columns">
              <div>
                <p className="eyebrow mb-2">Skills</p>
                <div className="chip-grid">
                  {(project.skills.length > 0 ? project.skills : ['No skills returned']).map((skill) => (
                    <Badge key={skill} variant="outline">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow mb-2">Hiring signals</p>
                <div className="chip-grid">
                  {(project.hiringSignals.length > 0 ? project.hiringSignals : ['No hiring signals returned']).map((signal) => (
                    <Badge key={signal} variant="outline">
                      {signal}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="quality-note-block mt-4">
              <p className="eyebrow mb-1">Deliverables</p>
              <div className="result-list">
                {(project.deliverables.length > 0 ? project.deliverables : ['No deliverables returned']).map((item) => (
                  <div key={item} className="result-list-item">
                    <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: 2 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="result-section">
        <h3 className="section-title mb-4">Presentation tips</h3>
        <div className="result-list">
          {(result.presentationTips.length > 0 ? result.presentationTips : ['No presentation tips were returned.']).map((tip) => (
            <div key={tip} className="result-list-item">
              <CircleDot size={16} style={{ color: 'var(--tool-accent, var(--accent))', marginTop: 2 }} />
              <span>{tip}</span>
            </div>
          ))}
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
    `Missing keywords: ${result.missingKeywords.join(', ') || 'None'}`,
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
}

export const resultDefinitions: Record<ToolId, ResultDefinition> = {
  resume: {
    copyText: (payload) => resumeCopyText(payload),
    render: (payload) => <ResumeResultView payload={payload} />,
  },
  'job-match': {
    copyText: (payload) => jobMatchCopyText(payload),
    render: (payload) => <JobMatchView payload={payload} />,
  },
  'cover-letter': {
    copyText: (payload) => coverLetterCopyText(payload),
    download: (payload, item) => ({
      filename: `${item.label || 'cover-letter'}.txt`,
      content: coverLetterCopyText(payload),
    }),
    render: (payload) => <CoverLetterView payload={payload} />,
  },
  interview: {
    copyText: (payload) => interviewCopyText(payload),
    render: (payload) => <InterviewView payload={payload} />,
  },
  career: {
    copyText: (payload) => careerCopyText(payload),
    render: (payload) => <CareerView payload={payload} />,
  },
  portfolio: {
    copyText: (payload) => portfolioCopyText(payload),
    render: (payload) => <PortfolioView payload={payload} />,
  },
}
