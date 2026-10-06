import { List, Row, RowActions, RowBody, RowTitle, Section } from '#/components/kit'
import { getPromotableClaims } from '#/lib/tools/promotableClaims'
import type { ToolId } from '#/lib/tools/registry'
import { PromoteClaimButton } from './PromoteClaimButton'

/**
 * "Save to your profile" block appended to a saved result (R11, #148).
 *
 * Promotion is an authenticated, per-claim action (D-066): guests render
 * nothing, and tools whose output has no reusable claims render nothing, so
 * every existing result view — including runs created before R11 — is
 * byte-identical for those cases.
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
  if (!authenticated) return null
  const claims = getPromotableClaims(toolId, payload)
  if (claims.length === 0) return null

  return (
    <Section
      title="Save to your profile"
      description="Adds it as a suggestion you can review and save on your profile."
      landmark
    >
      <List aria-label="Claims you can add">
        {claims.map((claim) => (
          <Row key={claim.key}>
            <RowBody><RowTitle>{claim.label}</RowTitle></RowBody>
            <RowActions reveal={false}>
              <PromoteClaimButton claim={claim} />
            </RowActions>
          </Row>
        ))}
      </List>
    </Section>
  )
}
