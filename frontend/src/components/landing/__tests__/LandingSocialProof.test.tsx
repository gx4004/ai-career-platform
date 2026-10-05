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
})
