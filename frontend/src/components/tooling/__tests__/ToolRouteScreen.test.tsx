import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'

const mutateMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const setFieldMock = vi.hoisted(() => vi.fn())
const setDraftMock = vi.hoisted(() => vi.fn())
let isPending = false

const draftState = {
  resumeText: 'Built backend APIs with Python, SQL, and cloud deployment ownership across multiple teams.',
  jobDescription:
    'Looking for a backend engineer with Python, SQL, and Kubernetes experience across production systems.',
  tone: 'Professional',
  numQuestions: 6,
  targetRole: 'Backend Engineer',
}

let sessionStatus: 'guest' | 'authenticated' = 'guest'
let bridgeBanner = 'Resume and job description carried from your recent workflow.'
let seededResume = true
let resumePendingReview = false
let seededJob = true
let seededTargetRole = false

vi.mock('#/components/tooling/ToolFullScreen', () => ({
  ToolFullScreen: ({ children }: { children: ReactNode }) => (
    <div data-testid="tool-fullscreen">{children}</div>
  ),
}))

vi.mock('#/components/tooling/DropzoneHero', () => ({
  DropzoneHero: ({
    collapseOnSuccess,
    compact,
    onParsed,
    onPasteText,
  }: {
    collapseOnSuccess?: boolean
    compact?: boolean
    onParsed?: (text: string) => void
    onPasteText?: () => void
  }) => (
    <div data-testid="dropzone-hero">
      {collapseOnSuccess ? 'collapse-on-success' : 'full-hero'}
      {compact ? ' compact' : ''}
      <button
        type="button"
        onClick={() => {
          draftState.resumeText =
            'Parsed resume text from pdf upload that is definitely long enough to pass validation.'
          onParsed?.(draftState.resumeText)
        }}
      >
        Simulate parse
      </button>
      <button type="button" onClick={onPasteText}>
        Paste text instead
      </button>
    </div>
  ),
}))

vi.mock('#/components/tooling/JobImportCard', () => ({
  JobImportCard: () => <div data-testid="job-import-card">Import from job URL</div>,
}))

vi.mock('#/components/tooling/ToolHeroIllustration', () => ({
  ToolHeroIllustration: ({ toolId }: { toolId: string }) => (
    <div data-testid="tool-illustration">{toolId}</div>
  ),
}))

vi.mock('#/components/tooling/CinematicLoader', () => ({
  CinematicLoader: () => <div data-testid="cinematic-loader">Scanning resume...</div>,
}))

vi.mock('#/components/tooling/GuestSaveBanner', () => ({
  GuestSaveBanner: () => null,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: sessionStatus,
    openAuthDialog: openAuthDialogMock,
  }),
}))

vi.mock('#/hooks/useToolDraft', () => ({
  useToolDraft: () => ({
    draft: draftState,
    setDraft: setDraftMock,
    setField: setFieldMock,
  }),
}))

vi.mock('#/hooks/useToolMutation', () => ({
  useToolMutation: () => ({
    mutate: mutateMock,
    isPending,
    error: null,
  }),
}))

vi.mock('#/hooks/useWorkflowBridge', () => ({
  useWorkflowBridge: () => ({
    seededResume,
    resumePendingReview,
    seededJob,
    seededTargetRole,
    seededProject: false,
    seededDirection: false,
    seededGaps: false,
    banner: bridgeBanner,
  }),
}))

describe('ToolRouteScreen', () => {
  beforeEach(() => {
    sessionStatus = 'guest'
    bridgeBanner = 'Resume and job description carried from your recent workflow.'
    seededResume = true
    resumePendingReview = false
    seededJob = true
    seededTargetRole = false
    draftState.resumeText =
      'Built backend APIs with Python, SQL, and cloud deployment ownership across multiple teams.'
    draftState.jobDescription =
      'Looking for a backend engineer with Python, SQL, and Kubernetes experience across production systems.'
    draftState.tone = 'Professional'
    draftState.numQuestions = 6
    draftState.targetRole = 'Backend Engineer'
    isPending = false
    mutateMock.mockReset()
    openAuthDialogMock.mockReset()
    setFieldMock.mockReset()
    setDraftMock.mockReset()
  })

  it('renders the resume upload phase first and moves into the wider form flow', () => {
    draftState.resumeText = ''
    draftState.jobDescription = ''
    seededResume = false
    resumePendingReview = false
    seededJob = false
    bridgeBanner = ''

    render(<ToolRouteScreen toolId="resume" />)

    expect(screen.getByTestId('tool-fullscreen')).toBeTruthy()
    expect(screen.getByTestId('tool-illustration').textContent).toContain('resume')
    expect(screen.getByTestId('dropzone-hero').textContent).toContain('full-hero')
    expect(screen.getByText(/Upload a PDF or DOCX, then review the extracted text/i)).toBeTruthy()
    expect(screen.queryByText(/Target job description/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Paste text instead/i }))

    expect(screen.getByTestId('dropzone-hero').textContent).toContain('collapse-on-success')
    expect(screen.getByRole('button', { name: /Add target job description/i })).toBeTruthy()
    expect(screen.queryByText(/Guidance/i)).toBeNull()
    expect(screen.queryByText(/Trust note/i)).toBeNull()
    expect(screen.queryByText(/Workspace mode/i)).toBeNull()
  })

  it('hides the parsed resume text by default after a pdf-style parse until the user chooses to open it', () => {
    draftState.resumeText = ''
    draftState.jobDescription = ''
    seededResume = false
    resumePendingReview = false
    seededJob = false
    bridgeBanner = ''

    render(<ToolRouteScreen toolId="resume" />)

    fireEvent.click(screen.getByRole('button', { name: /Simulate parse/i }))

    expect(screen.getByText(/Resume parsed successfully/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Resume textRequired/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Review extracted text/i }))

    expect(screen.getByLabelText(/Resume textRequired/i)).toBeTruthy()
  })

  it('keeps a dashboard-seeded resume collapsed until the user chooses to review it', () => {
    seededResume = true
    resumePendingReview = true
    seededJob = false
    bridgeBanner = 'Resume text carried from your last Resume run. Edit anytime.'

    render(<ToolRouteScreen toolId="resume" />)

    expect(screen.getByText(/Resume parsed successfully/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Resume textRequired/i)).toBeNull()
    expect(screen.getByTestId('resume-sticky-submit')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Review extracted text/i }))

    expect(screen.getByLabelText(/Resume textRequired/i)).toBeTruthy()
  })

  it('keeps a carried resume collapsed even before the draft text hydrates into job match', () => {
    draftState.resumeText = ''
    seededResume = true
    seededJob = true
    bridgeBanner = 'Resume and job description carried from your recent workflow.'

    render(<ToolRouteScreen toolId="job-match" />)

    expect(screen.getByText(/Resume parsed and ready/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Resume textRequired/i)).toBeNull()
  })

  it('shows the cinematic resume scanner while the resume run is pending', () => {
    isPending = true

    render(<ToolRouteScreen toolId="resume" />)

    expect(screen.getByTestId('cinematic-loader')).toBeTruthy()
    expect(screen.queryByTestId('dropzone-hero')).toBeNull()
  })

  it('keeps job import and submit payload behavior intact for job match', () => {
    sessionStatus = 'authenticated'
    bridgeBanner = ''

    render(<ToolRouteScreen toolId="job-match" />)

    expect(screen.getByTestId('job-import-card')).toBeTruthy()
    expect(screen.getByTestId('tool-illustration').textContent).toContain('job-match')
    expect(screen.queryByText(/Guest demo runs are not saved/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Compare to role/i }))

    expect(mutateMock).toHaveBeenCalledWith({
      payload: {
        resume_text: draftState.resumeText,
        job_description: draftState.jobDescription,
      },
      draft: draftState,
    })
  })

  it('renders the bespoke cover-letter editor shell and keeps tone selection interactive', () => {
    render(<ToolRouteScreen toolId="cover-letter" />)

    expect(screen.getByText(/Review your resume, paste the posting/i)).toBeTruthy()
    expect(screen.getByLabelText(/Tone controls/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Cover letter editor shell/i)).toBeNull()
    expect(screen.queryByText(/Draft setup/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Warm/i }))

    expect(setFieldMock).toHaveBeenCalledWith('tone', 'Warm')
  })

  it('renders the bespoke interview practice setup and preserves submit payloads', () => {
    sessionStatus = 'authenticated'

    render(<ToolRouteScreen toolId="interview" />)

    expect(screen.queryByLabelText(/Practice preview/i)).toBeNull()
    expect(screen.getByLabelText(/Question count quick picks/i)).toBeTruthy()
    expect(screen.getByText(/Practice depth/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /8 questions/i }))

    expect(setFieldMock).toHaveBeenCalledWith('numQuestions', 8)

    fireEvent.click(screen.getByRole('button', { name: /Build interview prep/i }))

    expect(mutateMock).toHaveBeenCalledWith({
      payload: {
        resume_text: draftState.resumeText,
        job_description: draftState.jobDescription,
        num_questions: draftState.numQuestions,
      },
      draft: draftState,
    })
  })

  it('renders the bespoke career wizard without inline sign-in CTA', () => {
    render(<ToolRouteScreen toolId="career" />)

    expect(screen.getByText(/Review the resume text, optionally add a target role/i)).toBeTruthy()
    expect(screen.getByLabelText(/Career steps/i)).toBeTruthy()
    expect(screen.queryByText(/Path comparison preview/i)).toBeNull()
    expect(screen.queryByText(/Backend Engineer II/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Sign in to save runs/i })).toBeNull()
  })

  it('renders the bespoke portfolio planner preview and keeps submit payloads intact', () => {
    sessionStatus = 'authenticated'

    render(<ToolRouteScreen toolId="portfolio" />)

    expect(screen.getByText(/Add the role you want next/i)).toBeTruthy()
    expect(screen.getByLabelText(/Portfolio steps/i)).toBeTruthy()
    expect(screen.queryByText(/Roadmap preview/i)).toBeNull()
    expect(screen.queryByText(/Analytics Workspace/i)).toBeNull()
    expect(screen.queryByText(/Guest demo runs are not saved/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Generate roadmap/i }))

    expect(mutateMock).toHaveBeenCalledWith({
      payload: {
        resume_text: draftState.resumeText,
        target_role: draftState.targetRole,
      },
      draft: draftState,
    })
  })

  it('does not render inline sign-in CTA for guests on tool pages', () => {
    render(<ToolRouteScreen toolId="career" />)

    expect(screen.queryByRole('button', { name: /Sign in to save runs/i })).toBeNull()
    expect(screen.queryByText(/Sign in to save runs/i)).toBeNull()
  })
})
