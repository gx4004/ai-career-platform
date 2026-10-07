import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FirstSteps } from '#/components/dashboard/FirstSteps'

const carry = vi.hoisted(() => ({ current: { hasResume: false, filename: '' } }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('#/hooks/use-resume-carry', () => ({ useResumeCarry: () => carry.current }))
vi.mock('#/components/dashboard/DashboardResumeUpload', () => ({
  DashboardResumeUpload: () => <div data-testid="upload" />,
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
    expect(screen.getByRole('link', { name: 'Discover jobs' }).getAttribute('href')).toBe('/discovery')
    // Sign-off chrome-F38: the tour's first ring frames the whole upload step, so it never cuts the step's text.
    expect(steps.map((step) => step.getAttribute('data-tour'))).toEqual(['hero-cta', null, null])
  })

  it('counts a resume carried from before sign-in as the first step, named by its file', () => {
    carry.current = { hasResume: true, filename: 'alex-cv.pdf' }
    render(<FirstSteps />)

    expect(screen.queryByTestId('upload')).toBeNull()
    expect(screen.getByText(/alex-cv\.pdf is ready to use/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Analyze it' }).getAttribute('href')).toBe('/resume')
    expect(screen.getAllByRole('listitem').map((step) => step.getAttribute('data-state'))).toEqual(['done', 'current', 'next'])
  })

  it('ticks off the resume and the analyzer after the first run, with adding a job as the current step', () => {
    render(<FirstSteps resumeIn analyzed />)

    expect(screen.getAllByRole('listitem').map((step) => step.getAttribute('data-state'))).toEqual(['done', 'done', 'current'])
    expect(screen.queryByTestId('upload')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Resume analyzed' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open Resume Analyzer' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Discover jobs' }).getAttribute('href')).toBe('/discovery')
  })

  it("makes the current step's action the page's one primary button, the others secondary", () => {
    render(<FirstSteps resumeIn analyzed />)
    expect(screen.getByRole('link', { name: 'Discover jobs' }).className).toContain('kit-button--primary')

    carry.current = { hasResume: true, filename: 'alex-cv.pdf' }
    render(<FirstSteps />)
    expect(screen.getByRole('link', { name: 'Analyze it' }).className).toContain('kit-button--primary')
    expect(screen.getAllByRole('link', { name: 'Discover jobs' })[1].className).toContain('kit-button--secondary')
  })

  it('sends a guest to sign in rather than to Discover for the third step', () => {
    render(<FirstSteps signedIn={false} />)
    expect(screen.getByRole('link', { name: 'Sign in to add jobs' }).getAttribute('href')).toBe('/login')
    expect(screen.queryByRole('link', { name: 'Discover jobs' })).toBeNull()
  })
})
