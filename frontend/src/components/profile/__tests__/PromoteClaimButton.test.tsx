import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PromoteClaimButton } from '#/components/profile/PromoteClaimButton'
import type { PromotableClaim } from '#/lib/tools/promotableClaims'

const createItemMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  createEvidenceItem: createItemMock,
}))

const CLAIM: PromotableClaim = {
  key: 'interview-0',
  kind: 'interview-evidence',
  label: 'Tell me about a hard bug.',
  content: { question: 'Tell me about a hard bug.', answer: 'I traced a race condition…' },
}

function button() {
  return screen.getByRole('button') as HTMLButtonElement
}

beforeEach(() => {
  createItemMock.mockReset()
})

describe('PromoteClaimButton', () => {
  it('does not write anything on render (no automatic backfill)', () => {
    render(<PromoteClaimButton claim={CLAIM} />)
    expect(createItemMock).not.toHaveBeenCalled()
    expect(button().textContent).toContain('Add to profile')
  })

  it('promotes the claim through the create path as an inferred item, once', async () => {
    createItemMock.mockResolvedValue({ id: 'e1' })
    render(<PromoteClaimButton claim={CLAIM} />)

    fireEvent.click(button())

    await waitFor(() => expect(button().textContent).toContain('Added to profile'))
    expect(createItemMock).toHaveBeenCalledTimes(1)
    expect(createItemMock).toHaveBeenCalledWith({
      kind: 'interview-evidence',
      content: CLAIM.content,
      provenance: 'inferred',
    })
    // Once promoted, the button is disabled — no bulk / repeat writes.
    expect(button().disabled).toBe(true)
    fireEvent.click(button())
    expect(createItemMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces a retry affordance when the create call fails', async () => {
    createItemMock.mockRejectedValueOnce(new Error('offline'))
    render(<PromoteClaimButton claim={CLAIM} />)

    fireEvent.click(button())

    await waitFor(() => expect(button().textContent).toContain('Retry'))
    expect(button().disabled).toBe(false)

    createItemMock.mockResolvedValueOnce({ id: 'e1' })
    fireEvent.click(button())
    await waitFor(() => expect(button().textContent).toContain('Added to profile'))
    expect(createItemMock).toHaveBeenCalledTimes(2)
  })
})
