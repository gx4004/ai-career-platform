import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingFeatureStepsDemo } from '#/components/landing/LandingFeatureStepsDemo'

describe('LandingFeatureStepsDemo', () => {
  it('renders the Review/Aim/Build workflow cards', () => {
    render(<LandingFeatureStepsDemo />)
    expect(screen.getByRole('heading', { name: /Review\. Aim\. Build\./i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Review$/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Aim$/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Build$/ })).toBeTruthy()
  })
})
