import type { ToolDefinition } from '#/lib/tools/registry'

/** Default labels the backend gives a run: "Resume Analysis (77/100)", "Career Plan (Engineering Manager)". */
const DEFAULT_LABEL_NAMES = [
  'resume analysis',
  'job match',
  'cover letter',
  'interview prep',
  'career plan',
  'portfolio roadmap',
]

const TRAILING_SCORE = /\s*\((\d+(\/100|%)?)\)\s*$/
const DEFAULT_LABEL = /^(.*?)\s*\((.+)\)\s*$/
const QUESTION_COUNT = /^\d+ questions?$/i

/**
 * What a run is about, for the report header: the part of the saved label that is not the tool name
 * or the score (both already on the page). "Career Plan (Engineering Manager)" gives "Engineering
 * Manager"; a label the user renamed is shown whole; "Resume Analysis (77/100)" gives "".
 */
export function runSubject(label: string | null | undefined, tool: Pick<ToolDefinition, 'label' | 'shortLabel'>) {
  const raw = label?.trim() ?? ''
  if (!raw) return ''
  const withoutScore = raw.replace(TRAILING_SCORE, '').trim()
  // A guest demo run is labelled "<Tool> demo".
  const known = [tool.label, tool.shortLabel, `${tool.shortLabel} demo`, ...DEFAULT_LABEL_NAMES].map((name) => name.toLowerCase())
  if (!withoutScore || known.includes(withoutScore.toLowerCase())) return ''
  const wrapped = DEFAULT_LABEL.exec(withoutScore)
  if (wrapped && known.includes(wrapped[1].trim().toLowerCase())) {
    const inner = wrapped[2].trim()
    return QUESTION_COUNT.test(inner) ? '' : inner
  }
  return withoutScore
}

/** "Sep 29", or "Sep 29, 2025" when the run is not from the current year. */
export function formatRunDate(value: string | Date, now: Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
