import type { CSSProperties } from 'react'
import type { DiscoveryListing } from '#/lib/api/schemas'

/** Skills fit with its sample size, shared by Discovery and the dashboard. */
export function SkillsFit({ listing }: { listing: DiscoveryListing }) {
  if (listing.skills_fit === null) return null
  const tone = listing.skills_fit >= 70 ? 'good' : listing.skills_fit >= 41 ? 'fair' : 'low'
  const total = listing.matched_skills.length + listing.missing_skills.length
  const sample = `${listing.matched_skills.length} of ${total} skills`
  return (
    <div className={`disc-score disc-score--${tone}`} aria-label={`${listing.skills_fit}% skills fit, ${sample}`}>
      <strong>{listing.skills_fit}%</strong>
      <span>skills fit</span>
      <small className="disc-score__n">{sample}</small>
    </div>
  )
}

const AVATAR_HUES = [211, 199, 226, 187, 240, 172]

export function CompanyAvatar({ name }: { name: string }) {
  const hue = AVATAR_HUES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_HUES.length]
  return (
    <span className="disc-avatar" style={{ '--avatar-hue': hue } as CSSProperties} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
