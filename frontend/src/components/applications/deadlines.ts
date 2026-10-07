import type { ApplicationCard } from '#/lib/api/schemas'
import { stageOf } from './stages'

const DAY_MS = 86_400_000

/** Within this many days a date is "close": the board and list mark it in rose. */
export const SOON_DAYS = 7

const startOfDay = (ms: number) => {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Whole calendar days from today to a date: negative once it has passed, 0 for today. */
export function daysUntil(value: string, now = Date.now()): number {
  return Math.round((startOfDay(new Date(value).getTime()) - startOfDay(now)) / DAY_MS)
}

/**
 * "Due in 2 days", "Due today", "Overdue". A subject names what is due ("Reply due in 2 days",
 * "Task overdue"); without one the sentence starts with the verb.
 */
export function dueText(days: number, subject?: string): string {
  const rest = days < 0 ? 'overdue' : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`
  return subject ? `${subject} ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1)
}

/** Which date the chip is about: the apply-by date, an offer's reply date, or the next task's date. */
export type UrgencySource = 'apply' | 'reply' | 'task'

export type CardUrgency = { days: number; text: string; source: UrgencySource }

/**
 * The most pressing date on a card, or null: an apply-by date while it is still Saved, a reply
 * date on an Offer, or the next task's date. Applied and Closed applications have no apply-by
 * date that matters. Only dates that are overdue or within a week are urgent.
 */
export function cardUrgency(
  card: Pick<ApplicationCard, 'status' | 'deadline' | 'next_task'>,
  now = Date.now(),
): CardUrgency | null {
  const candidates: Array<{ days: number; subject?: string; source: UrgencySource }> = []
  if (card.deadline && card.status === 'saved') candidates.push({ days: daysUntil(card.deadline, now), source: 'apply' })
  if (card.deadline && card.status === 'offer') {
    candidates.push({ days: daysUntil(card.deadline, now), subject: 'Reply', source: 'reply' })
  }
  if (card.next_task?.deadline && stageOf(card.status) !== 'closed') {
    candidates.push({ days: daysUntil(card.next_task.deadline, now), subject: 'Task', source: 'task' })
  }
  const urgent = candidates.filter((candidate) => candidate.days <= SOON_DAYS).sort((a, b) => a.days - b.days)[0]
  return urgent ? { days: urgent.days, text: dueText(urgent.days, urgent.subject), source: urgent.source } : null
}

// Dated work first (soonest on top), then what waits on the owner, then the rest; closed last.
const ASKS_FOR_YOU = 1e15
const READY = 2e15
const NOTHING_DUE = 3e15
const CLOSED = 4e15

/** A number that sorts "what do I do next" first: a date, then open questions, then ready ones. Closed last. */
export function urgencySortKey(card: ApplicationCard): number {
  if (stageOf(card.status) === 'closed') return CLOSED
  const dates = [
    card.status === 'saved' || card.status === 'offer' ? card.deadline : null,
    card.next_task?.deadline ?? null,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((time) => !Number.isNaN(time))
  if (dates.length) return Math.min(...dates)
  if (card.status === 'saved' && card.open_question_count > 0) return ASKS_FOR_YOU
  if (card.status === 'saved' && card.ready) return READY
  if (card.no_reply_suggested) return READY
  return NOTHING_DUE
}
