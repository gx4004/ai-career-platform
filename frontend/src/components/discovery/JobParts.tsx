import { Badge, MetaRow, SkillPips } from '#/components/kit'
import type { DiscoveryListing } from '#/lib/api/schemas'

const DAY_MS = 86_400_000

/** Whole days since a listing was posted; null when the date is missing or unreadable. */
function daysSince(value: string | null, now: number): number | null {
  if (!value) return null
  const days = Math.floor((now - new Date(value).getTime()) / DAY_MS)
  return Number.isNaN(days) ? null : days
}

function relativeDays(value: string | null, now = Date.now()): string | null {
  const days = daysSince(value, now)
  if (days === null) return null
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted yesterday'
  if (days < 30) return `Posted ${days} days ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `Posted ${months} ${months === 1 ? 'month' : 'months'} ago` : 'Posted over a year ago'
}

/**
 * Company, place, posting age and (in the drawer) the board it came from. A job already in Applications carries a
 * mint "Added" mark; one posted within a day a "New today" mark.
 */
export function JobMeta({ listing, source = false }: { listing: DiscoveryListing; source?: boolean }) {
  const added = Boolean(listing.application_id)
  const days = daysSince(listing.posted_at, Date.now())
  const posted = days !== null && days <= 0 ? null : relativeDays(listing.posted_at)
  const saysRemote = /remote/i.test(listing.location ?? '')
  return (
    <MetaRow className="disc-meta">
      <span>
        <strong>{listing.company}</strong>
        {added ? <> <Badge size="sm" tone="mint">Added</Badge></> : null}
      </span>
      {listing.location}
      {listing.remote && !saysRemote ? 'Remote' : null}
      {days !== null && days <= 0 ? (
        <Badge size="sm" tone="lemon">New today</Badge>
      ) : (
        posted
      )}
      {source ? `via ${listing.source_name}` : null}
    </MetaRow>
  )
}

const SHOWN_MATCHED = 3
const SHOWN_MISSING = 2

const list = (items: string[], shown: number) =>
  items.length > shown ? `${items.slice(0, shown).join(', ')} +${items.length - shown}` : items.join(', ')

/**
 * Why a listing fits, in one line: "Matches Python, FastAPI · Missing Kubernetes". Scanning twenty
 * jobs then says why one is high, not just that it is.
 */
export function FitReasons({ listing }: { listing: DiscoveryListing }) {
  if (listing.skills_fit === null) return null
  const { matched_skills: matched, missing_skills: missing } = listing
  if (matched.length === 0 && missing.length === 0) return null
  return (
    <p className="disc-reasons">
      {matched.length > 0 ? (
        <span>
          <strong>Matches</strong> {list(matched, SHOWN_MATCHED)}
        </span>
      ) : null}
      {missing.length > 0 ? (
        <span>
          <strong>Missing</strong> {list(missing, SHOWN_MISSING)}
        </span>
      ) : null}
    </p>
  )
}

/** "6 of 8 skills" with one pip per skill. The pips repeat the words, so they are hidden from assistive tech. */
export function SkillTally({ listing }: { listing: DiscoveryListing }) {
  const matched = listing.matched_skills.length
  const total = matched + listing.missing_skills.length
  if (listing.skills_fit === null || total === 0) return null
  return (
    <span className="disc-skills">
      <span>{`${matched} of ${total} ${total === 1 ? 'skill' : 'skills'}`}</span>
      <SkillPips matched={matched} total={total} aria-hidden="true" />
    </span>
  )
}
