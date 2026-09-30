import type { ApplicationListing, ApplicationStatus } from '#/lib/api/schemas'

/** The five board columns. Rejected and withdrawn share "Closed". */
export type Stage = 'saved' | 'applied' | 'interviewing' | 'offer' | 'closed'

export const STAGES: Array<{ id: Stage; label: string; hint: string }> = [
  { id: 'saved', label: 'Saved', hint: 'Jobs you want to apply for' },
  { id: 'applied', label: 'Applied', hint: 'Waiting to hear back' },
  { id: 'interviewing', label: 'Interviewing', hint: 'In conversations' },
  { id: 'offer', label: 'Offer', hint: 'Offers on the table' },
  { id: 'closed', label: 'Closed', hint: 'Not selected or withdrawn' },
]

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

export function stageTone(status: ApplicationStatus) {
  if (status === 'offer') return 'positive' as const
  if (status === 'interviewing') return 'warning' as const
  if (status === 'applied' || status === 'no_reply') return 'accent' as const
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
