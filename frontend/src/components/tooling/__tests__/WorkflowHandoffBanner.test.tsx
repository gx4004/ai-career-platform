import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkflowHandoffBanner } from '#/components/tooling/WorkflowHandoffBanner'
import {
  writeWorkflowContext,
  type WorkflowContextState,
} from '#/lib/tools/drafts'
import { setResumeCarry } from '#/lib/tools/resumeCarryStore'
import { SAMPLE_RESUME_TEXT } from '#/components/tooling/sampleResume'

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

/** The quiet badges, in order: what was carried and where each came from. */
const badges = () => [...document.querySelectorAll('.kit-notice .kit-badge')].map((badge) => badge.textContent)

// The banner used to credit the last tool run (context.lastToolId) for everything on the form. It now names, per field,
// where each value was supplied (resumeOrigin, jobOrigin, roleOrigin), as the quiet badges the spec asks for (4.O).
describe('WorkflowHandoffBanner', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.sessionStorage.clear()
  })

  // A saved result opened cold carries nothing: its What next used to open an empty form with no word of why.
  describe('opened from a saved result (?from=)', () => {
    afterEach(() => window.history.replaceState(null, '', '/'))

    it('says runs do not keep their inputs and names what to add', () => {
      window.history.replaceState(null, '', '/job-match?from=resume')
      render(<WorkflowHandoffBanner toolId="job-match" />)
      const text = screen.getByRole('status').textContent ?? ''
      expect(text).toContain('Opened from your Resume Analyzer result.')
      expect(text).toContain('Runs don’t keep their inputs, so add your resume and the job description below.')
    })

    it('names only what is still missing next to what was carried, and says nothing extra when all is there', () => {
      seedContext({ resumeOrigin: 'cv-studio', resumeSource: 'your CV Studio CV “Platform CV”', jobDescription: undefined })
      window.history.replaceState(null, '', '/job-match?from=resume')
      const { unmount } = render(<WorkflowHandoffBanner toolId="job-match" />)
      // The resume row right under the banner names that CV (sign-off tool-inputs-F31): no chip repeats it here.
      expect(badges()).toEqual([])
      expect(screen.getByRole('status').textContent).toContain('so add the job description below.')
      unmount()
      window.history.replaceState(null, '', '/portfolio?from=resume')
      render(<WorkflowHandoffBanner toolId="portfolio" />)
      expect(screen.getByRole('status').textContent).not.toContain('Runs don’t keep')
    })
  })

  it('names where each carried value was supplied, not the tool that ran last', () => {
    // Resume uploaded on Resume Analyzer, job typed on Job Match, then a Career Path run: Cover Letter shows both.
    seedContext({ lastToolId: 'career', resumeOrigin: 'resume', jobOrigin: 'job-match' })
    render(<WorkflowHandoffBanner toolId="cover-letter" />)
    expect(screen.getByRole('status').textContent).toContain('Carried over')
    // The resume row names "Resume from Resume Analyzer" itself (sign-off tool-inputs-F31); the banner keeps the job.
    expect(badges()).toEqual(['Job from Job Match'])
    expect(screen.queryByText(/Career Path/)).toBeNull()
  })

  it('leaves out what came from this very page, and says nothing when that is everything', () => {
    seedContext({ lastToolId: 'portfolio', resumeOrigin: 'resume', jobOrigin: 'job-match' })
    render(<WorkflowHandoffBanner toolId="resume" />)
    // Back on Resume Analyzer: the resume was supplied here; only the job came from elsewhere.
    expect(badges()).toEqual(['Job from Job Match'])
    expect(screen.queryByText(/Portfolio Planner/)).toBeNull()
  })

  // Sign-off chrome-F45: "Prep for the round" names the application the job came from in the first line on the page.
  it('names the application a job came from, and keeps the plain noun when its name is unknown', () => {
    seedContext({
      resumeOrigin: 'resume',
      jobOrigin: 'application',
      targetRole: undefined,
      workspaceId: 'app-1',
      workspaceLabel: 'Senior Backend Engineer, Platform at Northwind Labs',
    })
    const { unmount } = render(<WorkflowHandoffBanner toolId="interview" />)
    expect(badges()).toEqual(['Job from Senior Backend Engineer, Platform at Northwind Labs'])
    // A long name wraps inside its chip instead of losing its end to an ellipsis.
    expect(document.querySelectorAll('.kit-notice .kit-badge[data-wrap="true"]')).toHaveLength(1)
    unmount()

    window.sessionStorage.clear()
    seedContext({ resumeOrigin: 'resume', jobOrigin: 'application', targetRole: undefined })
    render(<WorkflowHandoffBanner toolId="interview" />)
    expect(badges()).toEqual(['Job from your application'])
  })

  it('renders nothing on the page every carried value came from', () => {
    seedContext({ jobDescription: undefined, resumeOrigin: 'resume', roleOrigin: 'resume' })
    const { container } = render(<WorkflowHandoffBanner toolId="resume" />)
    expect(container.firstChild).toBeNull()
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
    writeWorkflowContext({ lastToolId: 'resume', targetRole: 'Platform Engineer', roleOrigin: 'resume', updatedAt: Date.now() })
    render(<WorkflowHandoffBanner toolId="career" />)
    expect(badges()).toEqual(['Target role from Resume Analyzer'])
  })

  // Sign-off tool-inputs-F31: the resume row right under the banner already says "Resume from Resume Analyzer" or the
  // CV's name, so a chip saying it again only pushed the form down. It stays where the row shows a file name or the sample.
  it('leaves the resume to the resume row when that row names where it came from', () => {
    seedContext({ jobDescription: undefined, resumeSource: 'your CV Studio CV “Platform CV”', resumeOrigin: 'cv-studio' })
    const { container, unmount } = render(<WorkflowHandoffBanner toolId="job-match" />)
    expect(container.firstChild).toBeNull()
    unmount()

    window.sessionStorage.clear()
    seedContext({ jobDescription: undefined, resumeOrigin: 'resume', resumeText: SAMPLE_RESUME_TEXT })
    render(<WorkflowHandoffBanner toolId="job-match" />)
    expect(badges()).toEqual(['Resume from Resume Analyzer'])
  })

  it('says nothing during a Re-generate, whose own note says what was filled in', () => {
    seedContext({ resumeOrigin: 'resume', jobOrigin: 'job-match' })
    window.history.replaceState(null, '', '/cover-letter?parent_run_id=run-1')
    try {
      const { container } = render(<WorkflowHandoffBanner toolId="cover-letter" />)
      expect(container.firstChild).toBeNull()
    } finally {
      window.history.replaceState(null, '', '/')
    }
  })

  it('reads the tab’s resume carry when no run has written the context yet', () => {
    // Uploaded on Resume Analyzer, not run yet: Job Match fills its resume from the tab's carry.
    setResumeCarry('Uploaded resume text', 'cv.pdf', 'resume')
    writeWorkflowContext({ updatedAt: Date.now() })
    render(<WorkflowHandoffBanner toolId="job-match" />)
    expect(badges()).toEqual(['Resume from Resume Analyzer'])
  })

  it('says plainly what was carried when its source is not known (an older tab)', () => {
    seedContext({ lastToolId: 'career' })
    render(<WorkflowHandoffBanner toolId="cover-letter" />)
    // The resume row says "Your resume from this session"; the plain "Resume" chip added nothing (tool-inputs-F31).
    expect(badges()).toEqual(['Job description'])
    expect(screen.queryByText(/Career Path/)).toBeNull()
  })
})
