import type { CampaignStatus } from '#/lib/api/schemas'

/** The five board columns. Each groups one or more stored statuses. */
export type Stage = 'saved' | 'applied' | 'interviewing' | 'offer' | 'closed'

export const STAGES: Array<{ id: Stage; label: string; hint: string }> = [
  { id: 'saved', label: 'Saved', hint: 'Jobs you want to apply for' },
  { id: 'applied', label: 'Applied', hint: 'Waiting to hear back' },
  { id: 'interviewing', label: 'Interviewing', hint: 'In conversations' },
  { id: 'offer', label: 'Offer', hint: 'Offers on the table' },
  { id: 'closed', label: 'Closed', hint: 'Not selected or withdrawn' },
]

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  planning: 'Saved',
  preparing: 'Getting ready',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Offer accepted',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
}

// Mirrors the server rule: forward-only along this ladder (skipping allowed),
// and any open application can close. accepted, rejected and withdrawn are final.
const LADDER: CampaignStatus[] = ['planning', 'preparing', 'applied', 'interviewing', 'offer', 'accepted']
const CLOSED: CampaignStatus[] = ['rejected', 'withdrawn']

export function stageOf(status: CampaignStatus | null): Stage {
  switch (status) {
    case 'applied': return 'applied'
    case 'interviewing': return 'interviewing'
    case 'offer':
    case 'accepted': return 'offer'
    case 'rejected':
    case 'withdrawn': return 'closed'
    default: return 'saved'
  }
}

export function statusLabel(status: CampaignStatus | null) {
  return status ? STATUS_LABELS[status] : 'Saved'
}

export function nextStatuses(status: CampaignStatus | null): CampaignStatus[] {
  if (status && (CLOSED.includes(status) || status === 'accepted')) return []
  // "Saved" (planning) is where every application starts, so it is never a target.
  const index = status ? LADDER.indexOf(status) : 0
  return [...LADDER.slice(index + 1), ...CLOSED]
}

export function stageTone(status: CampaignStatus | null) {
  const stage = stageOf(status)
  if (status === 'rejected' || status === 'withdrawn') return 'neutral' as const
  if (stage === 'offer') return 'positive' as const
  if (stage === 'interviewing') return 'warning' as const
  if (stage === 'applied') return 'accent' as const
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

export function campaignTitle(campaign: { role: string | null; label?: string | null; listing: { title: string } | null }) {
  return campaign.role || campaign.listing?.title || campaign.label || 'Untitled application'
}

export function campaignCompany(campaign: { company: string | null; listing: { company: string } | null }) {
  return campaign.company || campaign.listing?.company || null
}
