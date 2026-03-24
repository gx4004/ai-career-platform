import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingFeatureStepsDemo } from '#/components/landing/LandingFeatureStepsDemo'

const featureState = vi.hoisted(() => ({
  lastProps: null as null | Record<string, unknown>,
}))

vi.mock('#/components/ui/motion', () => ({
  ScrollReveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('#/components/ui/feature-section', () => ({
  FeatureSteps: ({
    title,
    features,
    autoPlay,
  }: {
    title: string
    autoPlay?: boolean
    features: Array<{ title?: string; step: string; image: string }>
  }) => {
    featureState.lastProps = { title, features, autoPlay }

    return (
      <div>
        {title ? <h2>{title}</h2> : null}
        {features.map((feature) => (
          <button key={feature.step} type="button">
            {feature.title || feature.step}
          </button>
        ))}
        <img src={features[0]?.image} alt={`${features[0]?.title || features[0]?.step} preview`} />
      </div>
    )
  },
}))

describe('LandingFeatureStepsDemo', () => {
  beforeEach(() => {
    featureState.lastProps = null
  })

  it('renders the workflow section with the current experiment copy', () => {
    render(<LandingFeatureStepsDemo />)

    expect(
      screen.getByRole('heading', {
        name: /Review it\. Aim it\. Build from it\./i,
      }),
    ).toBeTruthy()
    expect(screen.getByText(/How it works/i)).toBeTruthy()
    expect(
      screen.getByText(
        /Start with the resume you have, lock in one target role, then move through applications and planning from the same workspace\./i,
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Review the resume you already have/i })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Check fit against a real role/i }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Finish the rest of the search faster/i }),
    ).toBeTruthy()
    expect(screen.getByRole('img', { name: /Review the resume you already have preview/i })).toBeTruthy()
    expect(featureState.lastProps?.autoPlay).toBe(false)
  }, 20000)

  it('allows autoplay when explicitly enabled for experiment usage', () => {
    render(<LandingFeatureStepsDemo autoPlay />)

    expect(featureState.lastProps?.autoPlay).toBe(true)
  }, 20000)
})
