import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkflowHandoffBanner } from '#/components/tooling/WorkflowHandoffBanner'
import {
  writeWorkflowContext,
  type WorkflowContextState,
} from '#/lib/tools/drafts'

function seedContext(partial: Partial<WorkflowContextState> = {}): void {
  writeWorkflowContext({
    lastToolId: 'resume',
    resumePendingReview: false,
    updatedAt: Date.now(),
    resumeText: 'Resume body carried from a prior run.',
    jobDescription: 'Job posting body carried from a prior run.',
    targetRole: 'Backend Engineer',
    ...partial,
  })
}

describe('WorkflowHandoffBanner', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('renders the legacy single-line source banner', () => {
    seedContext()

    render(<WorkflowHandoffBanner toolId="job-match" />)

    expect(screen.getByText(/Carried over from/i)).toBeTruthy()
    expect(screen.getByText('Resume Analyzer')).toBeTruthy()
    expect(screen.queryByText('Job description')).toBeNull()
    expect(screen.queryByRole('button', { name: /Clear carried/i })).toBeNull()
  })

  it('renders nothing when nothing carried over', () => {
    writeWorkflowContext({
      lastToolId: 'resume',
      resumePendingReview: false,
      updatedAt: Date.now(),
    })

    const { container } = render(<WorkflowHandoffBanner toolId="job-match" />)
    expect(container.firstChild).toBeNull()
  })

  it('claims nothing when only analysis context came along (no field on this form shows it)', () => {
    // A Resume Analyzer result opened cold: a target role and the report travel, but Job Match has no
    // field for either, and its resume and job description boxes are empty.
    writeWorkflowContext({
      lastToolId: 'resume',
      targetRole: 'Platform Engineer',
      recommendedDirectionRole: 'Platform Engineer',
      updatedAt: Date.now(),
    })
    const { container } = render(<WorkflowHandoffBanner toolId="job-match" />)
    expect(container.firstChild).toBeNull()
  })

  it('counts a target role only on a form with a target role field', () => {
    writeWorkflowContext({ lastToolId: 'resume', targetRole: 'Platform Engineer', updatedAt: Date.now() })
    render(<WorkflowHandoffBanner toolId="career" />)
    expect(screen.getByText(/Carried over from/i)).toBeTruthy()
  })

  it('names where a resume found in the account came from', () => {
    seedContext({ jobDescription: undefined, resumeSource: 'your CV Studio CV “Platform CV”' })
    render(<WorkflowHandoffBanner toolId="job-match" />)
    expect(screen.getByRole('status').textContent).toBe(
      'Carried over from Resume Analyzer, with your CV Studio CV “Platform CV” as the resume',
    )
  })

  it('renders nothing on the tool that produced the context', () => {
    seedContext()
    const { container } = render(<WorkflowHandoffBanner toolId="resume" />)
    expect(container.firstChild).toBeNull()
  })
})
