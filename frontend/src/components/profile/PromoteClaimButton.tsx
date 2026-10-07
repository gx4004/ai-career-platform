import { useEffect, useRef, useState } from 'react'
import { Check, Plus, RotateCcw } from 'lucide-react'
import { Badge, Button } from '#/components/kit'
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
export function PromoteClaimButton({
  claim,
  added = false,
  onAdded,
}: {
  claim: PromotableClaim
  /** The profile already holds this claim (read from the server): it shows as added, with nothing to click. */
  added?: boolean
  /** Called once the new suggestion is saved, so the caller can read the profile again. */
  onAdded?: () => void
}) {
  const [ownState, setState] = useState<PromoteState>('idle')
  const state: PromoteState = added && ownState !== 'pending' ? 'done' : ownState
  const doneRef = useRef<HTMLSpanElement | null>(null)
  const buttonHadFocus = useRef(false)

  // The button goes away once the claim is added: keep the keyboard user's place on the status that replaces it.
  useEffect(() => {
    if (state === 'done' && buttonHadFocus.current) doneRef.current?.focus()
  }, [state])

  async function handlePromote(event: { currentTarget: HTMLElement }) {
    if (state === 'pending' || state === 'done') return
    buttonHadFocus.current = document.activeElement === event.currentTarget
    setState('pending')
    try {
      await createEvidenceItem({
        kind: claim.kind,
        content: claim.content,
        provenance: 'inferred',
      })
      setState('done')
      onAdded?.()
    } catch {
      setState('error')
    }
  }

  return (
    <>
      {/* A live region present from the start (visually hidden, out of the row's flex flow), so "Added" is announced. */}
      <span role="status" className="kit-sr-only">
        {/* Only the add made here is announced: a claim the profile already held is not news on page load. */}
        {ownState === 'done' ? `Added "${claim.label}" to your profile` : ''}
      </span>
      {state === 'done' ? (
        // Done, not unavailable: a mint status chip (the disabled ghost button it replaces read as greyed out).
        <Badge ref={doneRef} tabIndex={-1} tone="success" icon={<Check strokeWidth={3} />}>
          Added to profile
        </Badge>
      ) : null}
      {state === 'done' ? null : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={state === 'pending'}
          onClick={(event) => void handlePromote(event)}
          aria-label={
            state === 'error' ? `Couldn't add "${claim.label}" to your profile. Retry` : `Add "${claim.label}" to your profile`
          }
        >
          {state === 'error' ? <RotateCcw aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {state === 'error' ? 'Couldn’t add. Retry' : state === 'pending' ? 'Adding…' : 'Add to profile'}
        </Button>
      )}
    </>
  )
}
