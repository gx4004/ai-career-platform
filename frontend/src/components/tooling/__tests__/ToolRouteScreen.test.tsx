import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'
import type { ToolId } from '#/lib/tools/registry'

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

vi.mock('#/components/tooling/JobImportCard', () => ({
  JobImportCard: () => <div data-testid="job-import-card">Import from job URL</div>,
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

function renderScreen(toolId: ToolId) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(<ToolRouteScreen toolId={toolId} />, { wrapper })
}

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

  it('shows a compact dropzone when there is no resume and opens the editor on paste', () => {
    draftState.resumeText = ''
    draftState.jobDescription = ''
    seededResume = false
    resumePendingReview = false
    seededJob = false
    bridgeBanner = ''

    renderScreen('resume')

    expect(screen.getByTestId('tool-fullscreen')).toBeTruthy()
    expect(screen.getByText(/Drop a PDF or DOCX here/i)).toBeTruthy()
    expect(screen.getByText(/Upload a PDF or DOCX, or paste your resume text/i)).toBeTruthy()
    expect(screen.queryByLabelText(/^Resume text$/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Paste text instead/i }))

    expect(screen.getByLabelText(/^Resume text$/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add target job description/i })).toBeTruthy()
    expect(screen.queryByText(/Guidance/i)).toBeNull()
  })

  it('keeps an existing resume as a compact row until the user chooses to edit it', () => {
    renderScreen('resume')

    expect(screen.getByText(/Resume carried from previous tool/i)).toBeTruthy()
    expect(screen.queryByLabelText(/^Resume text$/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Change/i }))

    expect(screen.getByLabelText(/^Resume text$/i)).toBeTruthy()
  })

  it('clears the pending-review flag when a dashboard-seeded resume is opened', () => {
    seededResume = true
    resumePendingReview = true
    seededJob = false
    bridgeBanner = 'Resume text carried from your last Resume run. Edit anytime.'

    renderScreen('resume')

    expect(screen.queryByLabelText(/^Resume text$/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Change/i }))
    expect(screen.getByLabelText(/^Resume text$/i)).toBeTruthy()
  })

  it('keeps a carried resume collapsed even before the draft text hydrates into job match', () => {
    draftState.resumeText = ''
    seededResume = true
    seededJob = true

    renderScreen('job-match')

    expect(screen.getByText(/Resume carried from previous tool/i)).toBeTruthy()
    expect(screen.queryByLabelText(/^Resume text$/i)).toBeNull()
  })

  it('moves from the dropzone to the resume row when workflow context arrives after mount', () => {
    draftState.resumeText = ''
    seededResume = false
    seededJob = false
    bridgeBanner = ''

    const { rerender } = renderScreen('job-match')
    expect(screen.getByText(/Drop a PDF or DOCX here/i)).toBeTruthy()

    seededResume = true
    bridgeBanner = 'Resume carried from your recent workflow.'
    rerender(<ToolRouteScreen toolId="job-match" />)

    expect(screen.getByText(/Resume carried from previous tool/i)).toBeTruthy()
  })

  it('shows the loader while the resume run is pending', () => {
    isPending = true

    renderScreen('resume')

    expect(screen.getByTestId('cinematic-loader')).toBeTruthy()
    expect(screen.queryByText(/Drop a PDF or DOCX here/i)).toBeNull()
  })

  it('keeps job import and submit payload behavior intact for job match', () => {
    sessionStatus = 'authenticated'
    bridgeBanner = ''

    renderScreen('job-match')

    expect(screen.getByTestId('job-import-card')).toBeTruthy()
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
    renderScreen('cover-letter')

    expect(screen.getByText(/Review your resume, paste the posting/i)).toBeTruthy()
    expect(screen.getByLabelText(/Tone controls/i)).toBeTruthy()
    expect(screen.queryByLabelText(/Cover letter editor shell/i)).toBeNull()
    expect(screen.queryByText(/Draft setup/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Warm/i }))

    expect(setFieldMock).toHaveBeenCalledWith('tone', 'Warm')
  })

  it('renders the bespoke interview practice setup and preserves submit payloads', () => {
    sessionStatus = 'authenticated'

    renderScreen('interview')

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
    renderScreen('career')

    expect(screen.getByText(/Review the resume text, optionally add a target role/i)).toBeTruthy()
    expect(screen.queryByText(/Path comparison preview/i)).toBeNull()
    expect(screen.queryByText(/Backend Engineer II/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Sign in to save runs/i })).toBeNull()
  })

  it('renders the bespoke portfolio planner preview and keeps submit payloads intact', () => {
    sessionStatus = 'authenticated'

    renderScreen('portfolio')

    expect(screen.getByText(/Add the role you want next/i)).toBeTruthy()
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
    renderScreen('career')

    expect(screen.queryByRole('button', { name: /Sign in to save runs/i })).toBeNull()
    expect(screen.queryByText(/Sign in to save runs/i)).toBeNull()
  })
})
