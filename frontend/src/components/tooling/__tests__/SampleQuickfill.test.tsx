import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SampleQuickfill } from '#/components/tooling/SampleQuickfill'

describe('SampleQuickfill (R7 #111 dark-ship)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders nothing when the flag is off (default)', () => {
    vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', undefined as unknown as string)
    const onUse = vi.fn()
    const { container } = render(<SampleQuickfill label="Try a sample resume" onUse={onUse} />)

    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(onUse).not.toHaveBeenCalled()
  })

  it('renders a clearly-labeled sample affordance and fires onUse when on', () => {
    vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', 'true')
    const onUse = vi.fn()
    render(<SampleQuickfill label="Try a sample resume" onUse={onUse} />)

    // Clearly labeled as a sample in the UI.
    expect(screen.getByText(/Synthetic sample — not real data/i)).toBeTruthy()
    const button = screen.getByRole('button', { name: /Try a sample resume/i })

    fireEvent.click(button)
    expect(onUse).toHaveBeenCalledTimes(1)
  })
})
