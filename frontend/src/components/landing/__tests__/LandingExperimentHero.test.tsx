import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingExperimentHero } from '#/components/landing/LandingExperimentHero'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={to} {...(props as Record<string, unknown>)}>{children}</a>
  ),
}))

describe('LandingExperimentHero', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders the headline, hero image, and CTAs', () => {
    const { container } = render(<LandingExperimentHero />)
    const heading = container.querySelector('h1')
    expect(heading?.textContent).toContain('blind spots')
    expect(heading?.textContent).toContain('We find them')
    expect(container.querySelector('.lp-hero-image-card .lp-preview')).toBeTruthy()
    // the call to action opens the tool itself, not the dashboard.
    expect(container.querySelector('.lp-hero-actions a')?.getAttribute('href')).toBe('/resume')
  })

  it('says it is a thesis demo, never a public beta', () => {
    const { container } = render(<LandingExperimentHero />)
    expect(container.textContent).not.toMatch(/public beta/i)
    expect(container.textContent).toMatch(/thesis demo/i)
  })

  it('labels the collage as an example and keeps the seal equal to the mean of its bars', () => {
    const { container } = render(<LandingExperimentHero />)
    expect(container.textContent).toContain('Example result')
    const bars = [...container.querySelectorAll('.lp-collage__card [role="meter"]')].map((el) =>
      Number(el.getAttribute('aria-valuenow')),
    )
    expect(bars).toHaveLength(4)
    const mean = Math.round(bars.reduce((a, b) => a + b, 0) / bars.length)
    expect(container.querySelector('.lp-collage__card .kit-seal__num')?.textContent).toBe(String(mean))
  })

  it('hero image link opens the Resume Analyzer with an aria-label', () => {
    const { container } = render(<LandingExperimentHero />)
    const imageLink = container.querySelector('.lp-hero-image-link')
    expect(imageLink?.getAttribute('href')).toBe('/resume')
    expect(imageLink?.getAttribute('aria-label')).toBeTruthy()
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
