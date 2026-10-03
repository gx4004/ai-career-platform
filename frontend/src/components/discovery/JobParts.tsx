import { ScoreBar } from '#/components/kit'
import type { DiscoveryListing } from '#/lib/api/schemas'

/**
 * Skills fit as a thin bar with its number. The sample size ("2 of 3 skills") is in the accessible
 * name and in the detail drawer: a varying visible suffix would stop the bars of a column of rows lining up.
 */
export function SkillsFit({ listing }: { listing: DiscoveryListing }) {
  if (listing.skills_fit === null) return null
  const total = listing.matched_skills.length + listing.missing_skills.length
  const sample = `${listing.matched_skills.length} of ${total} skill${total === 1 ? '' : 's'}`
  // A figure space pads "82" to the width of "100" (tabular numerals), so the bars of a column of rows start together.
  const number = String(listing.skills_fit).padStart(3, '\u2007')
  return (
    <ScoreBar
      aria-label={`${listing.skills_fit}% skills fit, ${sample}`}
      layout="inline"
      size="sm"
      lowTone="neutral"
      value={listing.skills_fit}
      valueLabel={`${number}% skills fit`}
    />
  )
}
