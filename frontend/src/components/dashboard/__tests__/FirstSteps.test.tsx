import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FirstSteps } from '#/components/dashboard/FirstSteps'

const carry = vi.hoisted(() => ({ current: { hasResume: false, filename: '' } }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('#/hooks/use-resume-carry', () => ({ useResumeCarry: () => carry.current }))
vi.mock('#/components/dashboard/DashboardResumeUpload', () => ({
  DashboardResumeUpload: () => <div data-testid="upload" data-tour="hero-cta" />,
}))

describe('FirstSteps', () => {
  afterEach(() => {
    carry.current = { hasResume: false, filename: '' }
  })

  it('lists upload, run the analyzer, add a job, with the first step current', () => {
    render(<FirstSteps />)

    expect(screen.getByRole('heading', { name: 'Your first 3 steps' })).toBeTruthy()
    const steps = screen.getAllByRole('listitem')
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual(['current', 'next', 'next'])
    expect(screen.getByRole('heading', { name: 'Upload your resume' })).toBeTruthy()
    expect(screen.getByTestId('upload')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Resume Analyzer' }).getAttribute('href')).toBe('/resume')
    expect(screen.getByRole('link', { name: 'Find jobs' }).getAttribute('href')).toBe('/discovery')
  })

  it('counts a resume carried from before sign-in as the first step, named by its file', () => {
    carry.current = { hasResume: true, filename: 'alex-cv.pdf' }
    render(<FirstSteps />)

    expect(screen.queryByTestId('upload')).toBeNull()
    expect(screen.getByText(/alex-cv\.pdf is ready to use/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Analyze it' }).getAttribute('href')).toBe('/resume')
    expect(screen.getAllByRole('listitem').map((step) => step.getAttribute('data-state'))).toEqual(['done', 'current', 'next'])
  })

  it('sends a guest to sign in rather than to Discover for the third step', () => {
    render(<FirstSteps signedIn={false} />)
    expect(screen.getByRole('link', { name: 'Sign in to add jobs' }).getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('link', { name: 'Find jobs' })).toBeNull()
  })
})
