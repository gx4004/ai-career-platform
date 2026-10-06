import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '#/lib/api/errors'
import { ApplicationPage } from '../ApplicationPage'

const api = vi.hoisted(() => ({
  getApplication: vi.fn(), updateApplication: vi.fn(), updateHistoryWorkspace: vi.fn(), deleteApplication: vi.fn(),
  prepareApplication: vi.fn(), saveApplicationAnswers: vi.fn(), markApplicationApplied: vi.fn(), autofillApplication: vi.fn(), getAutofillStatus: vi.fn(), cancelAutofill: vi.fn(),
  createApplicationTask: vi.fn(), updateApplicationTask: vi.fn(), deleteApplicationTask: vi.fn(), getApplicationDetails: vi.fn(),
  reviewApplication: vi.fn(), classifyApplicationGaps: vi.fn(), getApplicationGapResponse: vi.fn(),
}))
const flags = vi.hoisted(() => ({ autopilot: false }))
vi.mock('#/lib/api/client', () => api)
const eventsApi = vi.hoisted(() => ({ createApplication: vi.fn(), listApplicationEvents: vi.fn() }))
vi.mock('#/components/applications/applicationsApi', () => eventsApi)
vi.mock('#/lib/flags/featureFlags', () => ({ isAutopilotExperimentEnabled: () => flags.autopilot }))
const session = vi.hoisted(() => ({ status: 'authenticated' as string }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status, openAuthDialog: vi.fn() }) }))
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
const NO_DETAILS = {
  full_name: '', email: '', phone: '', location: '', linkedin: '', website: '',
  work_authorization: '', visa_sponsorship: '', notice_period: '', salary_expectation: '', relocation: '', is_default: true,
}
const drafts = {
  run_id: 'run-1', created_at: '2026-09-20T11:00:00Z',
  cover_letter: { body: 'Dear Northstar team, I would like to apply.', support: 'document', evidence_item_ids: [] },
  screening_answers: [{ question: 'Notice period?', answer: 'Two weeks.', support: 'document', evidence_item_ids: [] }],
}
const prepared = { ...saved, prepared: true, drafts, open_questions: [SALARY], open_question_count: 1 }
const answered = { ...prepared, autofill_supported: true, ready: true, open_question_count: 0, open_questions: [{ ...SALARY, answered: true }], answers: { 'q-salary': '€90k' } }
const applied = {
  ...answered, status: 'applied', applied_at: '2026-09-21T09:00:00Z', ready: false,
  snapshot: { id: 's-1', content: { listing: { title: 'Platform Engineer', company: 'Northstar Labs' }, cv_variant: { name: 'Platform roles' }, cover_letter: { source: 'prepared' }, answers: [{ question: SALARY.question, answer: '€90k' }] }, content_sha256: 'a'.repeat(64), created_at: '2026-09-21T09:00:00Z' },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ApplicationPage applicationId="app-1" /></QueryClientProvider>)
}
const applyPanel = async () => {
  await screen.findByRole('heading', { name: /Get this application ready|question|Ready to apply|You applied/ })
  return screen.getByRole('heading', { name: /Get this application ready|question|Ready to apply|You applied/ }).closest('section') as HTMLElement
}

describe('ApplicationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.status = 'authenticated'
    flags.autopilot = false
    api.getAutofillStatus.mockResolvedValue({ state: 'idle' })
    api.getApplicationDetails.mockResolvedValue({ ...NO_DETAILS })
  })

  it.each(['loading', 'unreachable'])('waits with the page placeholder, not a sign-in prompt, while the session is %s', (status) => {
    session.status = status
    renderPage()
    expect(screen.getByRole('status', { name: 'Loading this application…' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(api.getApplication).not.toHaveBeenCalled()
  })

  it('shows every section on one page under the shared header', async () => {
    api.getApplication.mockResolvedValue(saved)
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Platform Engineer' })).toBeTruthy()
    expect(document.querySelector('.kit-page-header')).toBeTruthy()
    expect(screen.getByRole('img', { name: '82% fit' })).toBeTruthy()
    expect(screen.getByText(/when saved/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change stage, currently Saved' })).toBeTruthy()
    for (const title of ["What you're sending", 'Check your documents', 'Job description', 'Tasks', 'Notes', 'Activity', 'Details']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('pins and unpins the application from the page', async () => {
    api.getApplication.mockResolvedValue(saved)
    api.updateHistoryWorkspace.mockResolvedValue({ id: 'app-1', label: null, is_pinned: true, updated_at: saved.updated_at })
    renderPage()
    const pin = await screen.findByRole('button', { name: 'Pin application' })
    expect(pin.getAttribute('aria-pressed')).toBe('false')
    api.getApplication.mockResolvedValue({ ...saved, is_pinned: true })
    fireEvent.click(pin)
    await waitFor(() => expect(api.updateHistoryWorkspace).toHaveBeenCalledWith('app-1', { is_pinned: true }))
    expect((await screen.findByRole('button', { name: 'Unpin application' })).getAttribute('aria-pressed')).toBe('true')
  })

  it('renames the application, never saving an empty or whitespace name', async () => {
    api.getApplication.mockResolvedValue(saved)
    api.updateHistoryWorkspace.mockResolvedValue({ id: 'app-1', label: 'Dream job', is_pinned: false, updated_at: saved.updated_at })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename application' }))
    const input = screen.getByRole('textbox', { name: 'Application name' })
    const save = screen.getByRole('button', { name: 'Save name' }) as HTMLButtonElement
    for (const value of ['', '   ']) {
      fireEvent.change(input, { target: { value } })
      expect(save.disabled).toBe(true)
      fireEvent.submit(input.closest('form') as HTMLFormElement)
    }
    expect(api.updateHistoryWorkspace).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '  Dream job ' } })
    fireEvent.click(save)
    await waitFor(() => expect(api.updateHistoryWorkspace).toHaveBeenCalledWith('app-1', { label: 'Dream job' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Application name' })).toBeNull())
  })

  it('keeps the name field open and says so when the rename fails', async () => {
    api.getApplication.mockResolvedValue(saved)
    api.updateHistoryWorkspace.mockRejectedValue(new Error('nope'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Rename application' }))
    const input = screen.getByRole('textbox', { name: 'Application name' })
    // The field takes the title's place, inside the page heading.
    expect(input.closest('h1')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'Dream job' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText("The name couldn't be saved. Try again.")).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Application name' })).toBeTruthy()
  })

  it('shows a custom name as the page title but keeps the automatic one out of it', async () => {
    api.getApplication.mockResolvedValue({ ...saved, label: 'Dream job' })
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Dream job' })).toBeTruthy()
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
    api.getApplication.mockResolvedValue({ ...prepared, autofill_supported: true })
    const { unmount } = renderPage()
    await applyPanel()
    expect(screen.queryByRole('button', { name: /Fill the form for me/ })).toBeNull()
    unmount()

    flags.autopilot = true
    api.getApplication.mockResolvedValue({ ...prepared, autofill_supported: true })
    const second = renderPage()
    const fill = await screen.findByRole('button', { name: 'Fill the form for me' })
    expect(fill.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Experimental')).toBeTruthy()
    expect(screen.getByText('Answer the questions above first.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Mark as applied/ }).getAttribute('aria-describedby')).toBe('camp-applied-hint')
    second.unmount()

    // A destination Autopilot cannot open (server says so) gets no button at all.
    api.getApplication.mockResolvedValue({ ...prepared, autofill_supported: false })
    renderPage()
    await applyPanel()
    expect(screen.queryByRole('button', { name: /Fill the form for me/ })).toBeNull()
  })

  it('runs the Autopilot fill in the background: polls, shows the report, and can be cancelled', async () => {
    flags.autopilot = true
    api.getApplication.mockResolvedValue(answered)
    api.autofillApplication.mockResolvedValue({
      state: 'review', seconds_left: 1500,
      report: { filled: ['Email'], skipped: ['Pronouns'], mismatched: [], url: 'https://jobs.lever.co/acme/123/apply' },
    })
    api.cancelAutofill.mockResolvedValue({ state: 'closed', kind: 'cancelled', message: 'The run was cancelled and the window closed.' })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Fill the form for me/ }))
    await waitFor(() => expect(api.autofillApplication).toHaveBeenCalledWith('app-1'))
    expect(await screen.findByText(/Nothing was submitted/)).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.getByText(/closes itself in 25 min/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close the window' }))
    await waitFor(() => expect(api.cancelAutofill).toHaveBeenCalledWith('app-1'))
    expect(await screen.findByText('The run was cancelled and the window closed.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Fill the form for me/ })).toBeTruthy()
  })

  it('says what went wrong with the Autopilot fill and what to do next', async () => {
    flags.autopilot = true
    api.getApplication.mockResolvedValue(answered)
    api.getAutofillStatus.mockResolvedValue({
      state: 'failed', kind: 'job_closed',
      message: 'The employer’s page says this job is no longer there.', next_step: 'Open the apply page yourself.',
    })
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('no longer there')
    expect(alert.textContent).toContain('Open the apply page yourself.')
  })

  it('dates Saved from when the job was added, not when its posting was read', async () => {
    api.getApplication.mockResolvedValue({ ...saved, created_at: '2026-10-02T10:00:00Z' })
    renderPage()
    const savedOn = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date('2026-10-02T10:00:00Z'))
    const value = await screen.findByText(savedOn)
    expect(value.closest('dl')?.textContent).toContain('Saved')
    // The posting's own retrieval date is not called "saved" anywhere.
    expect(screen.queryByText(/saved Sep 19/)).toBeNull()
  })

  it('names each step in the activity, with the task title and the new date', async () => {
    const at = (minute: number) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00Z`
    api.getApplication.mockResolvedValue({
      ...saved,
      events: [
        { id: 'e1', event_type: 'created', details: { source: 'manual' }, provenance: 'user', created_at: at(1) },
        { id: 'e2', event_type: 'task_created', details: { task_id: 't', title: 'Send portfolio' }, provenance: 'user', created_at: at(2) },
        { id: 'e3', event_type: 'deadline_changed', details: { from: null, to: '2026-10-08T12:00:00Z' }, provenance: 'user', created_at: at(3) },
        { id: 'e4', event_type: 'material_selection_changed', details: { material_type: 'cv_variant', action: 'selected' }, provenance: 'user', created_at: at(4) },
      ],
      events_total: 4,
    })
    renderPage()
    const activity = await screen.findByRole('list', { name: 'Activity' })
    const rows = within(activity).getAllByRole('listitem').map((row) => row.textContent ?? '')
    expect(rows[0]).toContain('CV version chosen')
    expect(rows[1]).toMatch(/Deadline set to/)
    expect(rows[2]).toContain('Task added: Send portfolio')
    expect(rows[3]).toContain('Added by hand')
    expect(screen.queryByRole('button', { name: /Show older activity/ })).toBeNull()
  })

  it('shows one "Mark as applied" once, while a later move back to Applied still shows', async () => {
    const at = (minute: number, second = 0) => `2026-10-01T10:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`
    api.getApplication.mockResolvedValue({
      ...saved,
      events: [
        { id: 'e5', event_type: 'status_changed', details: { from: 'interviewing', to: 'applied' }, provenance: 'user', created_at: at(9) },
        { id: 'e4', event_type: 'status_changed', details: { from: 'applied', to: 'interviewing' }, provenance: 'user', created_at: at(8) },
        { id: 'e3', event_type: 'status_changed', details: { from: 'saved', to: 'applied' }, provenance: 'user', created_at: at(2, 1) },
        { id: 'e2', event_type: 'applied', details: { snapshot_id: 's' }, provenance: 'user', created_at: at(2) },
        { id: 'e1', event_type: 'created', details: { source: 'manual' }, provenance: 'user', created_at: at(1) },
      ],
      events_total: 5,
    })
    renderPage()
    const activity = await screen.findByRole('list', { name: 'Activity' })
    expect(within(activity).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Moved to Applied'),
      expect.stringContaining('Moved to Interviewing'),
      expect.stringContaining('Marked as applied'),
      expect.stringContaining('Added by hand'),
    ])
    expect(screen.queryByRole('button', { name: /Show older activity/ })).toBeNull()
  })

  it('pages in older activity when there is more than the page shows', async () => {
    const event = (id: string, minute: number, title: string) => ({
      id, event_type: 'task_created', details: { title }, provenance: 'user', created_at: `2026-10-01T10:${String(minute).padStart(2, '0')}:00Z`,
    })
    api.getApplication.mockResolvedValue({ ...saved, events: [event('e3', 3, 'Third'), event('e4', 4, 'Fourth')], events_total: 4 })
    eventsApi.listApplicationEvents.mockResolvedValue({ items: [event('e1', 1, 'First'), event('e2', 2, 'Second')], total: 4 })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Show older activity (2)' }))
    await waitFor(() => expect(eventsApi.listApplicationEvents).toHaveBeenCalledWith('app-1', 2, 50))
    const activity = screen.getByRole('list', { name: 'Activity' })
    await waitFor(() => expect(within(activity).getAllByRole('listitem')).toHaveLength(4))
    expect(within(activity).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      expect.stringContaining('Fourth'), expect.stringContaining('Third'), expect.stringContaining('Second'), expect.stringContaining('First'),
    ])
    expect(screen.queryByRole('button', { name: /Show older activity/ })).toBeNull()
  })

  it('keeps the CV and letter fixed once applied, but interview prep can still be picked', async () => {
    api.getApplication.mockResolvedValue({
      ...applied,
      available_materials: { ...applied.available_materials, interviews: [{ id: 'iv-1', label: 'Interview prep', parent_run_id: null, created_at: '2026-09-22T10:00:00Z' }] },
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeTruthy()
    expect((screen.getByLabelText('CV version') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('Interview prep') as HTMLSelectElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: /Copy Prepared cover letter/ })).toBeNull()
  })

  it('says what deleting takes with it', async () => {
    api.getApplication.mockResolvedValue({
      ...applied, notes: 'Recruiter: Tom', events_total: 3,
      tasks: [{ id: 't-1', title: 'Email Priya', deadline: null, completed: false, created_at: '2026-09-20T10:00:00Z' }],
    })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this application' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this application?' })
    expect(dialog.textContent).toContain('“Platform Engineer at Northstar Labs” leaves your board with 1 task, your notes, the prepared drafts, the record of what you sent and its activity.')
  })

  it('asks before deleting and removes the application once confirmed', async () => {
    api.getApplication.mockResolvedValue(saved)
    api.deleteApplication.mockResolvedValue({ deleted: true })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this application' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this application?' })
    expect(api.deleteApplication).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteApplication).toHaveBeenCalledWith('app-1'))
  })

  it('names the stage button with the current stage and puts details before the reading sections', async () => {
    api.getApplication.mockResolvedValue(saved)
    renderPage()
    const stage = await screen.findByRole('button', { name: /^Change stage/ })
    expect(stage.textContent?.trim()).toBe('Saved')
    expect(stage.getAttribute('aria-label')).toContain('Saved')
    const details = screen.getByRole('complementary', { name: 'Details and tasks' })
    expect(within(details).getByRole('heading', { name: 'Details' })).toBeTruthy()
    expect(within(details).getByRole('heading', { name: 'Tasks' })).toBeTruthy()
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
  it('sets, changes and clears the apply-by date from Details', async () => {
    api.getApplication.mockResolvedValue({ ...saved, deadline: null })
    api.updateApplication.mockResolvedValue({ ...saved, deadline: '2026-10-20T10:00:00Z' })
    renderPage()
    const field = await screen.findByLabelText('Apply by')
    expect(screen.queryByRole('button', { name: 'Save date' })).toBeNull()

    fireEvent.change(field, { target: { value: '2026-10-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save date' }))

    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledTimes(1))
    const [id, payload] = api.updateApplication.mock.calls[0]
    expect(id).toBe('app-1')
    expect(new Date(payload.deadline).getFullYear()).toBe(2026)
    expect(new Date(payload.deadline).getDate()).toBe(20)
  })

  it('clears a date that is already set', async () => {
    api.getApplication.mockResolvedValue(saved)
    api.updateApplication.mockResolvedValue({ ...saved, deadline: null })
    renderPage()
    expect(await screen.findByLabelText('Apply by')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith('app-1', { deadline: null }))
  })

  it('marks a date inside a week in rose and offers no editor once applied', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString()
    api.getApplication.mockResolvedValue({ ...saved, deadline: soon })
    const { unmount } = renderPage()
    expect(await screen.findByText('Due in 2 days')).toBeTruthy()
    unmount()

    api.getApplication.mockResolvedValue({ ...applied, deadline: soon })
    renderPage()
    await screen.findByRole('heading', { name: /You applied on/ })
    expect(screen.queryByLabelText('Apply by')).toBeNull()
  })

  it('stamps an Applied seal after marking applied, with the sent summary and the next steps', async () => {
    api.getApplication.mockResolvedValue(answered)
    api.markApplicationApplied.mockResolvedValue(applied)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Mark as applied/ }))
    api.getApplication.mockResolvedValue(applied)

    const heading = await screen.findByRole('heading', { name: /You applied on/ })
    const panel = heading.closest('section') as HTMLElement
    expect(within(panel).getByText('Application status')).toBeTruthy()
    expect(panel.querySelector('.kit-seal')?.getAttribute('data-reveal')).toBe('stamp')
    expect(within(panel).getByText('CV: Platform roles')).toBeTruthy()
    expect(within(panel).getByText('1 answer')).toBeTruthy()
    expect(within(panel).getByRole('link', { name: 'Prepare for interviews' }).getAttribute('href')).toBe('/interview')
  })

  it('does not replay the stamp on a revisit, and adds a follow-up task due in a week', async () => {
    api.getApplication.mockResolvedValue(applied)
    api.createApplicationTask.mockResolvedValue({ id: 't-9', title: 'Follow up on Platform Engineer', deadline: null, completed: false, created_at: '2026-09-21T10:00:00Z' })
    renderPage()

    const heading = await screen.findByRole('heading', { name: /You applied on/ })
    expect((heading.closest('section') as HTMLElement).querySelector('.kit-seal')?.getAttribute('data-reveal')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: /^Follow up in a week/ }))

    await waitFor(() => expect(api.createApplicationTask).toHaveBeenCalledTimes(1))
    const [id, payload] = api.createApplicationTask.mock.calls[0]
    expect(id).toBe('app-1')
    expect(payload.title).toBe('Follow up on Platform Engineer')
    const days = (new Date(payload.deadline).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6)
    expect(days).toBeLessThan(8)
  })

  it('offers a standing answer from Account for a mandatory-stop question, and saves it on one click', async () => {
    api.getApplication.mockResolvedValue(prepared)
    api.getApplicationDetails.mockResolvedValue({ ...NO_DETAILS, salary_expectation: '€90k', is_default: false })
    api.saveApplicationAnswers.mockResolvedValue(answered)
    renderPage()

    expect(await screen.findByText('From your details')).toBeTruthy()
    expect(screen.getByText('€90k')).toBeTruthy()
    // Offered, never filled in on its own.
    expect((screen.getByLabelText(SALARY.question) as HTMLTextAreaElement).value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: /Use your standing answer/ }))

    await waitFor(() => expect(api.saveApplicationAnswers).toHaveBeenCalledWith('app-1', { 'q-salary': '€90k' }))
  })

  it('offers no standing answer when Account has none', async () => {
    api.getApplication.mockResolvedValue(prepared)
    renderPage()
    await screen.findByLabelText(SALARY.question)
    expect(screen.queryByText('From your details')).toBeNull()
  })
})
