import { formatRunDay } from '#/lib/tools/runLabel'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

/** Morning 04:00 to 11:59, Afternoon 12:00 to 17:59, Evening otherwise: by the viewer's own clock. */
export function partOfDay(now: Date) {
  const hour = now.getHours()
  if (hour >= 4 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 18) return 'Afternoon'
  return 'Evening'
}

/** "Morning, Alex." or "Morning." when no name is known. */
export function greetingTitle(now: Date, fullName: string | null | undefined) {
  const first = fullName?.trim().split(/\s+/)[0]
  return first ? `${partOfDay(now)}, ${first}.` : `${partOfDay(now)}.`
}

/** A no-break space: a date never breaks between its day and its month on a narrow screen. */
const NBSP = '\u00a0'

/** "Saturday 4 October", with "4 October" kept on one line. */
export function longDate(now: Date) {
  return `${WEEKDAYS[now.getDay()]} ${now.getDate()}${NBSP}${MONTHS[now.getMonth()]}`
}

/** "Two things need you today." / "Nothing needs you today." */
export function needsLine(count: number) {
  if (count <= 0) return 'Nothing needs you today.'
  if (count === 1) return 'One thing needs you today.'
  return `${NUMBER_WORDS[count] ?? count} things need you today.`
}

/** "today", "yesterday", "on Oct 3": when a run was, in a sentence. */
function runDay(value: string, now: Date) {
  const day = formatRunDay(value, now)
  if (day === 'Today' || day === 'Yesterday') return day.toLowerCase()
  return day ? `on ${day.replace(/ /g, NBSP)}` : ''
}

/** "your last two runs were today" / "…were on Oct 3" (without the closing full stop), or '' with no runs. */
function runsClause(runDates: string[], now: Date) {
  const days = runDates.slice(0, 2).map((value) => runDay(value, now)).filter(Boolean)
  if (days.length === 0) return ''
  if (days.length === 1) return `your last run was ${days[0]}`
  if (days[0] === days[1]) return `your last two runs were ${days[0]}`
  // "on Oct 2 and Oct 1", not "on Oct 2 and on Oct 1".
  const second = days[0].startsWith('on ') && days[1].startsWith('on ') ? days[1].slice(3) : days[1]
  return `your last two runs were ${days[0]} and ${second}`
}

/**
 * The line under the greeting, derived from the data on the page: how many things need the user
 * (when known), today's date, and when they last ran a tool (when they have).
 */
export function greetingLead(now: Date, { needsTotal, runDates }: { needsTotal: number | null; runDates: string[] }) {
  const clause = runsClause(runDates, now)
  const date = `${longDate(now)}${clause ? `; ${clause}` : ''}.`
  return needsTotal === null ? date : `${needsLine(needsTotal)} ${date}`
}

/** Whole local calendar days from today until `target` (negative once it has passed). */
export function daysUntil(target: Date, now: Date) {
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const end = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((end - start) / 86_400_000)
}

/** "today", "tomorrow", "in 5 days", "yesterday", "3 days ago". */
export function relativeDays(days: number) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}
