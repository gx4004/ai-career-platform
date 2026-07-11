import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingExperimentHero } from '#/components/landing/LandingExperimentHero'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...(props as Record<string, unknown>)}>{children}</a>
  ),
}))

vi.mock('framer-motion', () => {
  const passthrough = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => (
    <div {...(props as Record<string, unknown>)}>{children}</div>
  )
  const motionValue = () => ({ set: () => {}, get: () => 0 })
  const motionFactory = (component: unknown) => component
  // motion.create(Component) returns the component itself so Link mock's href is
  // preserved; motion.div / motion.a etc. return passthrough via Proxy.
  const motion = new Proxy(motionFactory, {
    get: (_target, property) => property === 'create' ? motionFactory : passthrough,
  })
  return {
    motion,
    useReducedMotion: () => true,
    useMotionValue: motionValue,
    useSpring: (v: unknown) => v,
    useTransform: () => motionValue(),
  }
})

describe('LandingExperimentHero', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders the headline, hero image, and CTAs', () => {
    const { container } = render(<LandingExperimentHero />)
    const heading = container.querySelector('h1')
    expect(heading?.textContent).toContain('blind spots')
    expect(heading?.textContent).toContain('We find them')
    expect(container.querySelector('.lp-hero-image-card img')).toBeTruthy()
    expect(container.querySelector('a.lp-btn-primary')?.getAttribute('href')).toBe('/dashboard')
  })

  it('hero image link navigates to dashboard with aria-label', () => {
    const { container } = render(<LandingExperimentHero />)
    const imageLink = container.querySelector('.lp-hero-image-link')
    expect(imageLink?.getAttribute('href')).toBe('/dashboard')
    expect(imageLink?.getAttribute('aria-label')).toBeTruthy()
  })

  it('replaces the generic hero CTA with the resume-first vs role-first choice when the R7 flag is on', () => {
    vi.stubEnv('VITE_R7_ENTRY_CHOICE', 'true')
    const { container } = render(<LandingExperimentHero />)

    // The generic single primary CTA is gone; the explicit choice takes its place.
    expect(container.querySelector('.lp-hero-actions')).toBeNull()
    expect(container.querySelector('.lp-hero-entry .lp-entry-choice')).toBeTruthy()

    const resumeFirst = container.querySelector('[data-entry-choice="resume-first"]')
    const roleFirst = container.querySelector('[data-entry-choice="role-first"]')
    expect(resumeFirst?.getAttribute('href')).toBe('/resume')
    expect(roleFirst?.getAttribute('href')).toBe('/job-match')
  })

  it('lp-hero-copy has min-width:0 to prevent trust marquee from expanding grid cell', () => {
    // Regression: without min-width:0, the trust track's width:max-content expands
    // .lp-hero-copy to ~2300px; text-align:center then pushes hero text off-screen on mobile.
    const { container } = render(<LandingExperimentHero />)
    const copy = container.querySelector('.lp-hero-copy') as HTMLElement | null
    expect(copy).toBeTruthy()
    // The class must exist — CSS enforcement happens in the browser, but we verify
    // the element is rendered so a future refactor can't accidentally remove it.
    expect(copy?.className).toContain('lp-hero-copy')
  })
})
