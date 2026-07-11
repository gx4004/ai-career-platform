import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkflowHandoffBanner } from '#/components/tooling/WorkflowHandoffBanner'
import {
  readWorkflowContext,
  writeWorkflowContext,
  type WorkflowContextState,
} from '#/lib/tools/drafts'
import { getCarriedFields } from '#/lib/tools/workflowContext'

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
    vi.unstubAllEnvs()
    window.sessionStorage.clear()
  })

  describe('with the R7 context-carry flag off (dark-ship default)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_R7_CONTEXT_CARRY', undefined as unknown as string)
    })

    it('renders only the legacy single-line source banner', () => {
      seedContext()

      render(<WorkflowHandoffBanner toolId="job-match" />)

      expect(screen.getByText(/Carried over from/i)).toBeTruthy()
      expect(screen.getByText('Resume Analyzer')).toBeTruthy()
      // No per-field transparency or clear controls when the flag is off.
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

  describe('with the R7 context-carry flag on', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_R7_CONTEXT_CARRY', 'true')
    })

    it('names the fields a non-planner tool actually pre-fills (resume + job description)', () => {
      seedContext()

      render(<WorkflowHandoffBanner toolId="job-match" />)

      expect(screen.getByText('Resume Analyzer')).toBeTruthy()
      expect(screen.getByText('Resume')).toBeTruthy()
      expect(screen.getByText('Job description')).toBeTruthy()
      // Job Match never pre-fills a target role, so it must not be named.
      expect(screen.queryByText('Target role')).toBeNull()
    })

    it('names the fields a planner tool actually pre-fills (resume + target role)', () => {
      seedContext()

      render(<WorkflowHandoffBanner toolId="career" />)

      expect(screen.getByText('Resume')).toBeTruthy()
      expect(screen.getByText('Target role')).toBeTruthy()
      // Career never pre-fills a job description, so it must not be named.
      expect(screen.queryByText('Job description')).toBeNull()
    })

    it('clears a specific carried field so it no longer pre-fills the next tool', () => {
      seedContext()

      render(<WorkflowHandoffBanner toolId="job-match" />)

      fireEvent.click(screen.getByRole('button', { name: /Clear carried job description/i }))

      // Removed from the banner...
      expect(screen.queryByText('Job description')).toBeNull()
      expect(screen.getByText('Resume')).toBeTruthy()

      // ...and removed from the tab-scoped context the next tool reads to pre-fill.
      const next = readWorkflowContext()
      expect(next?.jobDescription).toBeUndefined()
      expect(getCarriedFields(next, 'job-match').map((field) => field.key)).toEqual([
        'resume',
      ])
    })
  })
})
