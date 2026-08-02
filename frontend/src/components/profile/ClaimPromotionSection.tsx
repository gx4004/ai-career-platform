import { getPromotableClaims } from '#/lib/tools/promotableClaims'
import type { ToolId } from '#/lib/tools/registry'
import { isR11EvidenceProfileEnabled } from '#/lib/flags/featureFlags'
import { PromoteClaimButton } from './PromoteClaimButton'

/**
 * "Save to your Evidence Profile" block appended to a saved result (R11, #148).
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
  if (!authenticated || !isR11EvidenceProfileEnabled()) return null
  const claims = getPromotableClaims(toolId, payload)
  if (claims.length === 0) return null

  return (
    <section className="claim-promote" aria-label="Save claims to your Evidence Profile">
      <div className="claim-promote__head">
        <strong className="claim-promote__title">Save to your Evidence Profile</strong>
        <p className="claim-promote__hint">
          Add a specific claim as an unconfirmed item you can review and confirm later.
        </p>
      </div>
      <ul className="claim-promote__list">
        {claims.map((claim) => (
          <li key={claim.key} className="claim-promote__item">
            <span className="claim-promote__label">{claim.label}</span>
            <PromoteClaimButton claim={claim} />
          </li>
        ))}
      </ul>
    </section>
  )
}
