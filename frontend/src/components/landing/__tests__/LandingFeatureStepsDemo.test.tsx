import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingFeatureStepsDemo } from '#/components/landing/LandingFeatureStepsDemo'

describe('LandingFeatureStepsDemo', () => {
  it('renders the Review/Aim/Build workflow cards', () => {
    render(<LandingFeatureStepsDemo />)
    expect(screen.getByRole('heading', { name: /Review\. Aim\. Build\./i })).toBeTruthy()
    expect(screen.getByText(/^Review$/)).toBeTruthy()
    expect(screen.getByText(/^Aim$/)).toBeTruthy()
    expect(screen.getByText(/^Build$/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Review the resume you already have/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Check fit against a real role/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Finish the rest of the search faster/i })).toBeTruthy()
  })
})
