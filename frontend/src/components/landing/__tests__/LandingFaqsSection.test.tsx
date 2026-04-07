import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingFaqsSection } from '#/components/landing/LandingFaqsSection'

describe('LandingFaqsSection', () => {
  it('renders the FAQ accordion with all product questions', () => {
    render(<LandingFaqsSection />)
    expect(screen.getByRole('heading', { name: /Frequently Asked Questions/i })).toBeTruthy()
    expect(screen.getByText(/Can I try Career Workbench without an account/i)).toBeTruthy()
    expect(screen.getByText(/Do I need a job description/i)).toBeTruthy()
    expect(screen.getByText(/What carries across tools/i)).toBeTruthy()
    expect(screen.getByText(/What do I leave with/i)).toBeTruthy()
    expect(screen.getByText(/How is this different from a resume checker/i)).toBeTruthy()
  })
})
