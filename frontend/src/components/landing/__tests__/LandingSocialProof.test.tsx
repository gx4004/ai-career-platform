import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingSocialProof } from '#/components/landing/LandingSocialProof'

describe('LandingSocialProof', () => {
  it('keeps the honest note to what the spec says: a thesis demo, no unsourced claims', () => {
    const { container } = render(<LandingSocialProof />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/thesis project/i)
    expect(text).not.toMatch(/public beta/i)
    expect(text).not.toMatch(/Politechnika|Wroc/i)
    expect(container.querySelector('#landing-proof')).toBeTruthy()
    expect(container.querySelectorAll('mark')).toHaveLength(2)
  })

  // Sign-off public-G08 (round 2): on a wide screen the first scroll past the hero collage brought the cookie card
  // up over the pinned thesis note. The note is marked keep-clear, so the card waits until it is out from under it.
  it('marks the pinned thesis note for the cookie card to keep clear of', () => {
    const { container } = render(<LandingSocialProof />)
    const note = container.querySelector('.lp-note')
    expect(note?.textContent).toMatch(/thesis project/i)
    expect(note?.hasAttribute('data-cookie-keep-clear')).toBe(true)
  })
})
