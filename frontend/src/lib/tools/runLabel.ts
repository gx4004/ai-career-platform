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
const TOOL_PREFIX = /^([^:]+):\s*(.*)$/
const TRAILING_QUESTION_COUNT = /\s*\(\d+ questions?\)\s*$/i

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
  // A label that names its job ("Job Match: Senior Backend Engineer at Northwind Labs (75%)") gives the job; a question
  // count after it is dropped as in "Interview Prep (6 questions)", a tone stays ("Senior Backend Engineer (Professional)").
  const prefixed = TOOL_PREFIX.exec(withoutScore)
  if (prefixed && known.includes(prefixed[1].trim().toLowerCase())) {
    return prefixed[2].replace(TRAILING_QUESTION_COUNT, '').trim()
  }
  const wrapped = DEFAULT_LABEL.exec(withoutScore)
  if (wrapped && known.includes(wrapped[1].trim().toLowerCase())) {
    const inner = wrapped[2].trim()
    return QUESTION_COUNT.test(inner) ? '' : inner
  }
  return withoutScore
}

/**
 * "Sep 29", or "Sep 29, 2025" when the run is not from the current year. The app is English only, so the
 * format is pinned (a German browser would otherwise end an English sentence with "29. Sept.").
 */
export function formatRunDate(value: string | Date, now: Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "Today", "Yesterday" (by the local calendar), else the date as formatRunDate writes it. */
export function formatRunDay(value: string | Date, now: Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const startOf = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return formatRunDate(date, now)
}

/** "Job Match (75%)" is the name and the score: the score is drawn as a pill, the name stays the link. */
export function splitScore(label: string): { name: string; score: string | null } {
  const match = /^(.*\S)\s*\((\d{1,3}(?:\.\d+)?%|\d{1,3}\/\d{1,3})\)$/.exec(label)
  return match ? { name: match[1], score: match[2] } : { name: label, score: null }
}
