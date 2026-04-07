import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingExperimentHero } from '#/components/landing/LandingExperimentHero'

vi.mock('framer-motion', () => {
  const passthrough = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <div {...(props as Record<string, unknown>)}>{children}</div>
  )
  const motionValue = () => ({ set: () => {}, get: () => 0 })
  return {
    motion: new Proxy({}, { get: () => passthrough }),
    useReducedMotion: () => true,
    useMotionValue: motionValue,
    useSpring: (v: unknown) => v,
    useTransform: () => motionValue(),
  }
})

describe('LandingExperimentHero', () => {
  it('renders the headline, hero image, and CTAs', () => {
    const { container } = render(<LandingExperimentHero />)
    const heading = container.querySelector('h1')
    expect(heading?.textContent).toContain('blind spots')
    expect(heading?.textContent).toContain('We find them')
    expect(container.querySelector('.lp-hero-image-card img')).toBeTruthy()
    expect(container.querySelector('a.lp-btn-primary')?.getAttribute('href')).toBe('/dashboard')
  })
})
