import { useQuery, useQueryClient } from '@tanstack/react-query'
import { List, Row, RowActions, RowBody, RowSubtitle, RowTitle, Section } from '#/components/kit'
import { listEvidenceItems } from '#/lib/api/client'
import type { EvidenceItem } from '#/lib/api/schemas'
import { EVIDENCE_QUERY_KEY, invalidateEvidenceCaches } from '#/lib/query/evidenceCaches'
import { getPromotableClaims } from '#/lib/tools/promotableClaims'
import type { PromotableClaim } from '#/lib/tools/promotableClaims'
import type { ToolId } from '#/lib/tools/registry'
import { PromoteClaimButton } from './PromoteClaimButton'

/** Text compared the way a person reads it: case and runs of whitespace aside. */
function normalised(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : JSON.stringify(value ?? null)
}

/** The profile already holds this claim: an item of the same kind whose fields say what the claim says. */
export function isClaimInProfile(claim: PromotableClaim, items: readonly EvidenceItem[]) {
  return items.some(
    (item) =>
      item.kind === claim.kind &&
      Object.entries(claim.content).every(([key, value]) => normalised(item.content[key]) === normalised(value)),
  )
}

/**
 * "Save to your profile" block appended to a saved result (R11, #148).
 *
 * Promotion is an authenticated, per-claim action (D-066): guests render
 * nothing, and tools whose output has no reusable claims render nothing, so
 * every existing result view — including runs created before R11 — is
 * byte-identical for those cases. A claim the profile already holds shows as
 * added (the profile is read, so a reopened result never offers it twice).
 */
export function ClaimPromotionSection({
  toolId,
  payload,
  authenticated,
}: {
  toolId: ToolId
  payload: Record<string, unknown>
  authenticated: boolean
}) {
  const queryClient = useQueryClient()
  const claims = authenticated ? getPromotableClaims(toolId, payload) : []
  const itemsQuery = useQuery({
    queryKey: EVIDENCE_QUERY_KEY,
    queryFn: async () => (await listEvidenceItems()).items,
    enabled: claims.length > 0,
  })
  if (claims.length === 0) return null
  const items = itemsQuery.data ?? []

  return (
    <Section
      title="Save to your profile"
      // Every report section that lists N items says N (sign-off tool-results-F57, F69).
      count={claims.length}
      description="Adds it as a suggestion you can review and save on your profile."
      landmark
    >
      <List aria-label="Claims you can add">
        {claims.map((claim) => (
          <Row key={claim.key}>
            <RowBody>
              {/* A claim is a sentence or a quote: regular weight, so it does not read heavier than the section's titles. */}
              <RowTitle weight="regular">{claim.title}</RowTitle>
              {claim.detail ? <RowSubtitle>{claim.detail}</RowSubtitle> : null}
            </RowBody>
            {/* On a phone the button takes its own line under the claim, so the text keeps the full width. */}
            <RowActions reveal={false} placement="below">
              <PromoteClaimButton
                claim={claim}
                added={isClaimInProfile(claim, items)}
                // The new suggestion is on the profile now: every view of it (this list included) reads it again.
                onAdded={() => void invalidateEvidenceCaches(queryClient, { rankingMayChange: false })}
              />
            </RowActions>
          </Row>
        ))}
      </List>
    </Section>
  )
}
