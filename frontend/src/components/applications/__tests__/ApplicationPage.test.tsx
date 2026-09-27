import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '#/lib/api/errors'
import { ApplicationPage } from '../ApplicationPage'

const api = vi.hoisted(() => ({
  getApplication: vi.fn(), updateApplication: vi.fn(), deleteApplication: vi.fn(),
  prepareApplication: vi.fn(), saveApplicationAnswers: vi.fn(), markApplicationApplied: vi.fn(), autofillApplication: vi.fn(),
  createApplicationTask: vi.fn(), updateApplicationTask: vi.fn(), deleteApplicationTask: vi.fn(),
  reviewApplication: vi.fn(), classifyApplicationGaps: vi.fn(), getApplicationGapResponse: vi.fn(),
}))
const flags = vi.hoisted(() => ({ autopilot: false }))
vi.mock('#/lib/api/client', () => api)
vi.mock('#/lib/flags/featureFlags', () => ({ isAutopilotExperimentEnabled: () => flags.autopilot }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated', openAuthDialog: vi.fn() }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => <a href={to} className={className}>{children}</a>,
  useNavigate: () => vi.fn(),
}))

const SALARY = { key: 'q-salary', question: 'What are your salary expectations?', category: 'salary', answered: false }
const saved = {
  id: 'app-1', label: null, title: 'Platform Engineer', company: 'Northstar Labs', role: 'Platform Engineer', status: 'saved',
  deadline: '2026-10-15T16:00:00Z', applied_at: null, match_score: 82, prepared: false, ready: false, open_question_count: 0,
  next_task: null, last_activity_at: null, is_pinned: false, updated_at: '2026-09-20T10:00:00Z', notes: null,
  listing: {
    title: 'Platform Engineer', company: 'Northstar Labs', description: 'Own the service platform.',
    source_url: 'https://jobs.example/platform', apply_url: 'https://jobs.example/platform/apply', retrieved_at: '2026-09-19T10:00:00Z',
  },
  selected_materials: { cv_variant: null, cover_letter: null, interview: null },
  available_materials: {
    cv_variants: [{ id: 'cv-1', document_id: 'doc-1', document_name: 'Engineering CV', name: 'Platform roles', target_role: null, created_at: '2026-09-19T10:00:00Z' }],
    cover_letters: [], interviews: [],
  },
  drafts: null, open_questions: [], answers: {}, tasks: [], events: [], snapshot: null,
}
const drafts = {
  run_id: 'run-1', created_at: '2026-09-20T11:00:00Z',
  cover_letter: { body: 'Dear Northstar team, I would like to apply.', support: 'document', evidence_item_ids: [] },
  screening_answers: [{ question: 'Notice period?', answer: 'Two weeks.', support: 'document', evidence_item_ids: [] }],
}
const prepared = { ...saved, prepared: true, drafts, open_questions: [SALARY], open_question_count: 1 }
const answered = { ...prepared, ready: true, open_question_count: 0, open_questions: [{ ...SALARY, answered: true }], answers: { 'q-salary': '€90k' } }
const applied = {
  ...answered, status: 'applied', applied_at: '2026-09-21T09:00:00Z', ready: false,
  snapshot: { id: 's-1', content: { listing: { title: 'Platform Engineer', company: 'Northstar Labs' }, cv_variant: { name: 'Platform roles' }, cover_letter: { source: 'prepared' }, answers: [{ question: SALARY.question, answer: '€90k' }] }, content_sha256: 'a'.repeat(64), created_at: '2026-09-21T09:00:00Z' },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ApplicationPage applicationId="app-1" /></QueryClientProvider>)
}
const applyPanel = async () => (await screen.findByText('Apply', { selector: '.workspace-panel__kicker' })).closest('section') as HTMLElement

describe('ApplicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    flags.autopilot = false
  })

  it('shows every section on one page under the shared hero', async () => {
    api.getApplication.mockResolvedValue(saved)
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Platform Engineer' })).toBeTruthy()
    expect(document.querySelector('.page-hero')).toBeTruthy()
    expect(screen.getByText('82% match')).toBeTruthy()
    for (const title of ["What you're sending", 'Check your documents', 'Job description', 'Tasks', 'Notes', 'Activity']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('walks the apply flow: prepare, answer, apply on the company site, mark applied', async () => {
    api.getApplication.mockResolvedValue(saved)
    api.prepareApplication.mockResolvedValue(prepared)
    api.saveApplicationAnswers.mockResolvedValue(answered)
    api.markApplicationApplied.mockResolvedValue(applied)
    renderPage()

    const panel = await applyPanel()
    api.getApplication.mockResolvedValue(prepared)
    fireEvent.click(within(panel).getByRole('button', { name: /Prepare application/ }))
    await waitFor(() => expect(api.prepareApplication).toHaveBeenCalledWith('app-1'))

    // The prepared drafts appear with copy buttons; the owner answers the one open question.
    expect(await screen.findByText('Dear Northstar team, I would like to apply.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy Notice period?' })).toBeTruthy()
    expect(within(await applyPanel()).getByRole('button', { name: /Mark as applied/ }).hasAttribute('disabled')).toBe(true)
    api.getApplication.mockResolvedValue(answered)
    fireEvent.change(screen.getByLabelText(SALARY.question), { target: { value: ' €90k ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save answers' }))
    await waitFor(() => expect(api.saveApplicationAnswers).toHaveBeenCalledWith('app-1', { 'q-salary': '€90k' }))

    // Ready: the employer link is the primary action and opens safely in a new tab.
    expect(await screen.findByRole('heading', { name: 'Ready to apply' })).toBeTruthy()
    const link = screen.getByRole('link', { name: /Apply on company site/ })
    expect(link.getAttribute('href')).toBe('https://jobs.example/platform/apply')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')

    api.getApplication.mockResolvedValue(applied)
    fireEvent.click(screen.getByRole('button', { name: /Mark as applied/ }))
    await waitFor(() => expect(api.markApplicationApplied).toHaveBeenCalledWith('app-1'))
    expect(await screen.findByRole('heading', { name: /You applied on/ })).toBeTruthy()
    expect(screen.getByText('See what you sent')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Mark as applied/ })).toBeNull()
  })

  it("shows the server's reason when an apply step is refused", async () => {
    api.getApplication.mockResolvedValue(saved)
    api.prepareApplication.mockRejectedValue(new ApiError('Create a CV in CV Studio before preparing applications.', 409))
    renderPage()
    fireEvent.click(within(await applyPanel()).getByRole('button', { name: /Prepare application/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Create a CV in CV Studio before preparing applications.')
  })

  it('offers the Autopilot fill only when the experiment is on, and never before questions are answered', async () => {
    api.getApplication.mockResolvedValue(prepared)
    const { unmount } = renderPage()
    await applyPanel()
    expect(screen.queryByRole('button', { name: /Fill the form for me/ })).toBeNull()
    unmount()

    flags.autopilot = true
    renderPage()
    expect((await screen.findByRole('button', { name: /Fill the form for me/ })).hasAttribute('disabled')).toBe(true)
  })

  it('saves the chosen CV version, notes and a new task', async () => {
    api.getApplication.mockResolvedValue(saved)
    api.updateApplication.mockImplementation(async (_id, payload) => ({ ...saved, ...('notes' in payload ? { notes: payload.notes } : {}) }))
    api.createApplicationTask.mockResolvedValue({ id: 't-1', title: 'Email Priya', deadline: null, completed: false, created_at: '2026-09-20T10:00:00Z' })
    renderPage()

    fireEvent.change(await screen.findByLabelText('CV version'), { target: { value: 'cv-1' } })
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('app-1', { cv_variant_id: 'cv-1' }))

    fireEvent.change(screen.getByLabelText('Your notes'), { target: { value: 'Recruiter: Tom' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }))
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('app-1', { notes: 'Recruiter: Tom' }))

    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Email Priya' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    await waitFor(() => expect(api.createApplicationTask).toHaveBeenCalledWith('app-1', { title: 'Email Priya', deadline: null }))
  })
})
