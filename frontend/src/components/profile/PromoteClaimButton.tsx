import { useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { createEvidenceItem } from '#/lib/api/client'
import type { PromotableClaim } from '#/lib/tools/promotableClaims'

type PromoteState = 'idle' | 'pending' | 'done' | 'error'

/**
 * Explicit, per-claim promote control shown on a saved result (R11, #148).
 *
 * Promotion reuses the shared item-create path with `inferred` provenance — no
 * parallel write path. The server forces the new item to `unconfirmed`, never
 * touches the originating `ToolRun`, and records only an allowlisted adoption
 * event with no run identifier (D-066). There is no bulk action: each claim is
 * promoted by its own deliberate click.
 */
export function PromoteClaimButton({ claim }: { claim: PromotableClaim }) {
  const [state, setState] = useState<PromoteState>('idle')

  async function handlePromote() {
    if (state === 'pending' || state === 'done') return
    setState('pending')
    try {
      await createEvidenceItem({
        kind: claim.kind,
        content: claim.content,
        provenance: 'inferred',
      })
      setState('done')
    } catch {
      setState('error')
    }
  }

  const label =
    state === 'done'
      ? 'Added to profile'
      : state === 'pending'
        ? 'Adding…'
        : state === 'error'
          ? 'Retry'
          : 'Add to profile'

  return (
    <button
      type="button"
      className={`claim-promote__btn claim-promote__btn--${state}`}
      onClick={handlePromote}
      disabled={state === 'pending' || state === 'done'}
      aria-label={
        state === 'done'
          ? `Added "${claim.label}" to your Evidence Profile`
          : `Add "${claim.label}" to your Evidence Profile`
      }
    >
      {state === 'done' ? (
        <Check size={13} aria-hidden="true" />
      ) : state === 'pending' ? (
        <Loader2 size={13} className="claim-promote__spin" aria-hidden="true" />
      ) : (
        <Plus size={13} aria-hidden="true" />
      )}
      {label}
    </button>
  )
}
