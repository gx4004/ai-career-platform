import { useState } from 'react'
import type { ReactNode } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '#/components/ui/accordion'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import type { ToolRunDetail } from '#/lib/api/schemas'
import type { ToolDefinition, ToolId } from '#/lib/tools/registry'

type AnyObject = Record<string, unknown>

function toString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === 'string') return [item]
        if (item && typeof item === 'object') {
          const text = (item as AnyObject).label || (item as AnyObject).name || (item as AnyObject).skill
          return typeof text === 'string' ? [text] : []
        }
        return []
      })
      .filter(Boolean)
  }

  return []
}

function toObjectArray(value: unknown): AnyObject[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is AnyObject => Boolean(item) && typeof item === 'object',
  )
}

function pick<T>(payload: AnyObject, keys: string[], fallback: T): T {
  for (const key of keys) {
    if (key in payload) {
      return payload[key] as T
    }
  }

  return fallback
}

function scoreColor(score: number) {
  if (score >= 80) return 'var(--success)'
  if (score >= 60) return 'var(--warning)'
  return 'var(--destructive)'
}

function listWithFallback(items: string[], fallback: string): string[] {
  return items.length > 0 ? items : [fallback]
}

function ResumeResultView({ payload }: { payload: AnyObject }) {
  // Canonical: score (resumeResultSchema), legacy: resume_score, overall_score
  const score = toNumber(
    pick(payload, ['score', 'resume_score', 'overall_score'], 0),
  ) || 0
  // Canonical: skills (resumeResultSchema), legacy: extracted_skills, key_skills
  const skills = toStringArray(
    pick(payload, ['skills', 'extracted_skills', 'key_skills'], []),
  )
  // Canonical: strengths (resumeResultSchema), legacy: highlights
  const strengths = listWithFallback(
    toStringArray(pick(payload, ['strengths', 'highlights'], [])),
    'No strengths were returned in the current payload.',
  )
  // Canonical: improvements (resumeResultSchema), legacy: revision_priorities, recommendations
  const improvements = listWithFallback(
    toStringArray(
      pick(payload, ['improvements', 'revision_priorities', 'recommendations'], []),
    ),
    'No improvement priorities were returned in the current payload.',
  )
  const topActions = improvements.slice(0, 3)

  return (
    <div className="result-grid">
      <div className="result-section flex flex-wrap items-center gap-6">
        <div
          className="score-gauge"
          style={{
            ['--score-color' as string]: scoreColor(score),
            ['--score-value' as string]: score,
          }}
        >
          {score}
        </div>
        <div className="grid gap-2">
          <h3 className="section-title">Extracted skills</h3>
          <div className="chip-grid">
            {(skills.length ? skills : ['No extracted skills']).map((skill) => (
              <Badge key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="result-section">
        <h3 className="section-title mb-4">Strengths</h3>
        <div className="result-list">
          {strengths.map((item) => (
            <div key={item} className="result-list-item">
              <span style={{ color: 'var(--success)' }}>●</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="result-section">
        <h3 className="section-title mb-4">Improvements</h3>
        <div className="result-list">
          {improvements.map((item, index) => (
            <div key={`${index}-${item}`} className="result-list-item">
              <Badge>{index + 1}</Badge>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="priority-card-grid">
        {topActions.map((item, index) => (
          <div key={item} className="metric-card p-5">
            <p className="eyebrow mb-2">Fix first #{index + 1}</p>
            <p>{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function JobMatchView({ payload }: { payload: AnyObject }) {
  // Canonical: fit_percent (jobMatchResultSchema), legacy: fit_score, match_percentage
  const fit = toNumber(
    pick(payload, ['fit_percent', 'fit_score', 'match_percentage'], 0),
  ) || 0
  // Canonical: matched_skills (jobMatchResultSchema), legacy: matching_skills
  const matched = toStringArray(
    pick(payload, ['matched_skills', 'matching_skills'], []),
  )
  // Canonical: missing_skills (jobMatchResultSchema), legacy: gap_skills
  const missing = toStringArray(
    pick(payload, ['missing_skills', 'gap_skills'], []),
  )
  // Canonical: recommendation (jobMatchResultSchema), legacy: summary, analysis
  const recommendation = toString(
    pick(payload, ['recommendation', 'summary', 'analysis'], ''),
  )

  return (
    <div className="result-grid">
      <div className="result-section flex flex-wrap items-center gap-6">
        <div
          className="score-gauge"
          style={{
            ['--score-color' as string]: scoreColor(fit),
            ['--score-value' as string]: fit,
          }}
        >
          {fit}%
        </div>
        <div className="grid gap-3">
          <div>
            <h3 className="section-title mb-2">Matched skills</h3>
            <div className="chip-grid">
              {(matched.length ? matched : ['No matched skills']).map((skill) => (
                <Badge
                  key={skill}
                  variant="outline"
                  style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <h3 className="section-title mb-2">Missing skills</h3>
            <div className="chip-grid">
              {(missing.length ? missing : ['No missing skills']).map((skill) => (
                <Badge
                  key={skill}
                  variant="outline"
                  style={{ borderColor: 'rgba(251, 191, 36, 0.35)' }}
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="result-section">
        <h3 className="section-title mb-3">Recommendation</h3>
        <p>{recommendation || 'No recommendation text was returned.'}</p>
      </div>
    </div>
  )
}

function CoverLetterView({ payload }: { payload: AnyObject }) {
  // Canonical: cover_letter (coverLetterResultSchema), legacy: letter, content, text
  const letter = toString(
    pick(payload, ['cover_letter', 'letter', 'content', 'text'], ''),
  )

  return (
    <div className="result-section">
      <div className="letter-block">
        {letter || 'No cover letter content was returned in the current payload.'}
      </div>
    </div>
  )
}

function InterviewView({ payload }: { payload: AnyObject }) {
  // Canonical: questions (interviewResultSchema), legacy: qa_pairs, interview_questions
  const items = toObjectArray(
    pick(payload, ['questions', 'qa_pairs', 'interview_questions'], []),
  )
  const [practiceMode, setPracticeMode] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  const normalizedItems = items.map((item, index) => ({
    question: toString(item.question || item.prompt || `Question ${index + 1}`),
    answer: toString(item.answer || item.suggested_answer || item.response),
    keyPoints: toStringArray(item.key_points || item.tags || []),
  }))

  const visibleItems = practiceMode
    ? normalizedItems.slice(currentIndex, currentIndex + 1)
    : normalizedItems

  return (
    <div className="result-grid">
      <div className="result-section flex items-center justify-between gap-4">
        <div>
          <h3 className="section-title">Practice deck</h3>
          <p className="muted-copy">
            {practiceMode
              ? 'Practice mode hides all but the current question.'
              : 'Review every suggested question and answer pair.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setPracticeMode((value) => !value)
              setCurrentIndex(0)
            }}
          >
            {practiceMode ? 'Show all answers' : 'Practice mode'}
          </Button>
          {practiceMode && normalizedItems.length > 1 ? (
            <Button
              variant="outline"
              onClick={() =>
                setCurrentIndex((value) => (value + 1) % normalizedItems.length)
              }
            >
              Next question
            </Button>
          ) : null}
        </div>
      </div>
      <Accordion type="single" collapsible className="result-section">
        {visibleItems.length === 0 ? (
          <p>No interview questions were returned in the current payload.</p>
        ) : (
          visibleItems.map((item, index) => (
            <AccordionItem key={`${index}-${item.question}`} value={`qa-${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3">
                  {!practiceMode ? <p>{item.answer || 'No answer provided.'}</p> : null}
                  <div className="chip-grid">
                    {item.keyPoints.map((point) => (
                      <Badge key={point} variant="outline">
                        {point}
                      </Badge>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))
        )}
      </Accordion>
    </div>
  )
}

function CareerView({ payload }: { payload: AnyObject }) {
  // Canonical: paths (careerResultSchema), legacy: career_paths, recommendations
  const paths = toObjectArray(
    pick(payload, ['paths', 'career_paths', 'recommendations'], []),
  )
  const normalizedPaths = paths.map((item, index) => ({
    title: toString(item.role_title || item.title || `Path ${index + 1}`),
    fitScore: toNumber(item.fit_score || item.score || 0) || 0,
    timeline: toString(item.transition_timeline || item.timeline || 'Timeline not specified'),
    skills: toStringArray(item.required_skills || item.skills || []),
  }))
  // Canonical: current_skills (careerResultSchema), legacy: resume_skills
  const currentSkills = toStringArray(
    pick(payload, ['current_skills', 'resume_skills'], []),
  )
  // Canonical: target_skills (careerResultSchema), legacy: gap_skills
  const targetSkills = toStringArray(
    pick(payload, ['target_skills', 'gap_skills'], []),
  )

  return (
    <div className="result-grid">
      <div className="career-card-grid">
        {(normalizedPaths.length ? normalizedPaths : [{ title: 'No career directions returned.', fitScore: 0, timeline: 'Not specified', skills: [] }]).map((item) => (
          <div key={item.title} className="metric-card p-5">
            <h3 className="section-title mb-2">{item.title}</h3>
            <p className="muted-copy mb-3">Fit score: {item.fitScore}</p>
            <p className="small-copy mb-3">{item.timeline}</p>
            <div className="chip-grid">
              {item.skills.map((skill) => (
                <Badge key={skill} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="result-section">
        <h3 className="section-title mb-4">Skill gap comparison</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="practice-card">
            <p className="eyebrow mb-3">Current skills</p>
            <div className="chip-grid">
              {(currentSkills.length ? currentSkills : ['Not provided']).map((skill) => (
                <Badge key={skill} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
          <div className="practice-card">
            <p className="eyebrow mb-3">Target skills</p>
            <div className="chip-grid">
              {(targetSkills.length ? targetSkills : ['Not provided']).map((skill) => (
                <Badge key={skill} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PortfolioView({ payload }: { payload: AnyObject }) {
  // Canonical: projects (portfolioResultSchema), legacy: project_recommendations, recommendations
  const projects = toObjectArray(
    pick(payload, ['projects', 'project_recommendations', 'recommendations'], []),
  )
  const normalizedProjects = projects.map((item, index) => ({
    title: toString(item.project_title || item.title || `Project ${index + 1}`),
    description: toString(item.description || item.summary),
    skills: toStringArray(item.skills || item.skills_demonstrated || []),
    complexity: toString(item.complexity || item.estimated_complexity || 'Scope TBD'),
  }))

  return (
    <div className="portfolio-card-grid">
      {(normalizedProjects.length
        ? normalizedProjects
        : [
            {
              title: 'No project recommendations returned.',
              description: 'Try running the planner again with a clearer target role.',
              skills: [],
              complexity: 'Unavailable',
            },
          ]).map((project) => (
        <div key={project.title} className="metric-card p-5">
          <h3 className="section-title mb-2">{project.title}</h3>
          <p className="muted-copy mb-4">{project.description}</p>
          <div className="chip-grid mb-4">
            {project.skills.map((skill) => (
              <Badge key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
          <Badge>{project.complexity}</Badge>
        </div>
      ))}
    </div>
  )
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
    copyText: (payload) =>
      JSON.stringify(payload, null, 2),
    render: (payload) => <ResumeResultView payload={payload} />,
  },
  'job-match': {
    copyText: (payload) =>
      JSON.stringify(payload, null, 2),
    render: (payload) => <JobMatchView payload={payload} />,
  },
  'cover-letter': {
    // Canonical: cover_letter (coverLetterResultSchema), legacy: letter, content, text
    copyText: (payload) =>
      toString(pick(payload, ['cover_letter', 'letter', 'content', 'text'], '')),
    download: (payload, item) => ({
      filename: `${item.label || 'cover-letter'}.txt`,
      content: toString(
        pick(payload, ['cover_letter', 'letter', 'content', 'text'], ''),
      ),
    }),
    render: (payload) => <CoverLetterView payload={payload} />,
  },
  interview: {
    copyText: (payload) =>
      JSON.stringify(payload, null, 2),
    render: (payload) => <InterviewView payload={payload} />,
  },
  career: {
    copyText: (payload) =>
      JSON.stringify(payload, null, 2),
    render: (payload) => <CareerView payload={payload} />,
  },
  portfolio: {
    copyText: (payload) =>
      JSON.stringify(payload, null, 2),
    render: (payload) => <PortfolioView payload={payload} />,
  },
}
