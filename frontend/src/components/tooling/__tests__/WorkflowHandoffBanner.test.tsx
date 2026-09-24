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

  it('renders nothing on the tool that produced the context', () => {
    seedContext()
    const { container } = render(<WorkflowHandoffBanner toolId="resume" />)
    expect(container.firstChild).toBeNull()
  })
})
