import type { ApplicationDetail, ApplicationListing, ApplicationStatus } from '#/lib/api/schemas'
import type { Tone } from '#/components/kit/tone'

/** The five board columns. Rejected and withdrawn share "Closed". */
export type Stage = 'saved' | 'applied' | 'interviewing' | 'offer' | 'closed'

export const STAGES: Array<{ id: Stage; label: string; hint: string }> = [
  { id: 'saved', label: 'Saved', hint: 'Jobs you want to apply for' },
  { id: 'applied', label: 'Applied', hint: 'Waiting to hear back' },
  { id: 'interviewing', label: 'Interviewing', hint: 'In conversations' },
  { id: 'offer', label: 'Offer', hint: 'Offers on the table' },
  { id: 'closed', label: 'Closed', hint: 'Not selected or withdrawn' },
]

/** The Sticker colour of each stage: Saved lemon, Applied lilac, Interviewing tangerine, Offer mint, Closed stone. */
export const STAGE_TONE: Record<Stage, Tone> = {
  saved: 'lemon',
  applied: 'lilac',
  interviewing: 'tangerine',
  offer: 'mint',
  closed: 'stone',
}

export const STATUSES: ApplicationStatus[] = ['saved', 'applied', 'no_reply', 'interviewing', 'offer', 'rejected', 'withdrawn']

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  no_reply: 'No reply',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
}

/** No reply is still waiting on the employer, so it stays in the Applied column. */
export function stageOf(status: ApplicationStatus): Stage {
  if (status === 'no_reply') return 'applied'
  return status === 'rejected' || status === 'withdrawn' ? 'closed' : status
}

/** The kit Badge tone of a status: accent while a conversation is open, success for an offer, quiet otherwise. */
export function stageTone(status: ApplicationStatus) {
  if (status === 'offer') return 'success' as const
  if (status === 'applied' || status === 'interviewing') return 'accent' as const
  return 'neutral' as const
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

/** "today", "3 days ago", "2 weeks ago" — for last-activity lines. */
export function timeAgo(value: string, now = Date.now()) {
  const days = Math.floor((now - new Date(value).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return formatDate(value)
}

/**
 * What an application is called. A name the user chose wins; the automatic
 * label ("Role — Company", set when a job is adopted) just repeats the title.
 */
export function applicationTitle(application: {
  title: string | null
  label?: string | null
  company?: string | null
}) {
  const label = application.label?.trim()
  const automatic =
    !label ||
    label === application.title ||
    (application.title && label === `${application.title} — ${application.company ?? ''}`)
  return (automatic ? application.title || label : label) || 'Untitled application'
}

/**
 * The employer link to open for applying, or null when there is none worth
 * opening. Only plain http(s) links without credentials are ever rendered.
 */
export function applyLink(listing: Pick<ApplicationListing, 'apply_url' | 'source_url'> | null) {
  const raw = listing?.apply_url || listing?.source_url
  if (!raw) return null
  try {
    const url = new URL(raw)
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * The role alone, for a page title. A stored label can carry the company
 * ("Role at Acme", "Role @ Acme"); the company is shown once, as the subtitle.
 */
export function roleOnly(title: string, company?: string | null) {
  const name = company?.trim()
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stripped = title.replace(new RegExp(`\\s+(?:at|@)\\s+${escaped}\\s*$`, 'i'), '').trim()
    if (stripped) return stripped
  }
  return title
}

/** "Mark as applied" freezes what was sent ("applied") and moves the card to Applied in the same moment. */
const SAME_MOMENT_MS = 5_000

/**
 * True when what was sent was recorded on a card that had already moved past Applied ("Record what I sent" on an
 * Interviewing, Offer or Closed card). Its applied_at is then the day it was recorded, not the day the owner applied.
 * The timeline tells: a recording on a later stage has no move to Applied beside it. When the freeze is older than
 * the events the detail carries, the dates tell, until the card moves again.
 */
export function sentRecordedLate(
  application: Pick<ApplicationDetail, 'applied_at' | 'status_changed_at' | 'events'>,
): boolean {
  if (!application.applied_at) return false
  const time = (value: string) => new Date(value).getTime()
  const freezes = application.events.filter((event) => event.event_type === 'applied').map((event) => time(event.created_at))
  if (freezes.length) {
    const freeze = Math.max(...freezes)
    return !application.events.some(
      (event) => event.event_type === 'status_changed' && event.details.to === 'applied'
        && Math.abs(time(event.created_at) - freeze) < SAME_MOMENT_MS,
    )
  }
  return application.status_changed_at ? time(application.applied_at) > time(application.status_changed_at) : false
}
