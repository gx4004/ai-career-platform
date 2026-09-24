import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignPage } from '../CampaignPage'

const api = vi.hoisted(() => ({ getCampaign: vi.fn(), updateCampaignMaterials: vi.fn(), updateHistoryWorkspace: vi.fn(), deleteCampaign: vi.fn(), createCampaignTask: vi.fn(), updateCampaignTask: vi.fn(), deleteCampaignTask: vi.fn(), createCampaignNote: vi.fn(), deleteCampaignNote: vi.fn(), createCampaignContact: vi.fn(), deleteCampaignContact: vi.fn(), getCampaignReminders: vi.fn(), updateCampaignReminderConsent: vi.fn(), reviewCampaign: vi.fn(), classifyCampaignGaps: vi.fn(), getCampaignGapResponse: vi.fn() }))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/client', () => api)
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated', openAuthDialog: vi.fn() }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, className }: { to: string; params?: { historyId?: string }; children: React.ReactNode; className?: string }) => (
    <a href={params?.historyId ? to.replace('$historyId', params.historyId) : to} className={className}>{children}</a>
  ),
  useNavigate: () => navigate,
}))

const campaign = {
  id: 'ws-1', label: 'Northstar', is_pinned: false, company: 'Northstar Labs', role: 'Platform Engineer', status: 'preparing', deadline: '2026-08-15T16:00:00Z', linked_run_ids: [], last_active_tool: null, last_active_result_id: null, updated_at: '2026-07-13T10:00:00Z', next_task: null, last_activity_at: null,
  listing: { title: 'Platform Engineer', company: 'Northstar Labs', description: 'Own the service platform and improve reliability across product teams.', source_url: 'https://jobs.example/platform', retrieved_at: '2026-07-12T10:00:00Z' },
  selected_materials: { cv_variant: null, cover_letter: null, interview: null },
  available_materials: { cv_variants: [{ id: 'cv-1', document_id: 'doc-1', document_name: 'Engineering CV', name: 'Northstar', target_role: 'Platform Engineer', created_at: '2026-07-12T10:00:00Z' }], cover_letters: [{ id: 'cl-2', label: 'Northstar letter', parent_run_id: 'cl-1', created_at: '2026-07-12T11:00:00Z' }], interviews: [] },
  events: [{ id: 'event-1', event_type: 'status_changed', details: { from: 'planning', to: 'preparing' }, provenance: 'user', created_at: '2026-07-13T10:00:00Z' }, { id: 'event-2', event_type: 'submission_snapshot_created', details: { snapshot_id: 'snapshot-1' }, provenance: 'system', created_at: '2026-07-14T10:00:00Z' }],
  tasks: [{ id: 'task-1', title: 'Send application', deadline: null, completed: false, created_at: '2026-07-13T10:00:00Z' }],
  notes: [{ id: 'note-1', text: 'Ask about team structure', created_at: '2026-07-13T10:00:00Z' }],
  contacts: [{ id: 'contact-1', name: 'Alex', role: 'Recruiter', channel: 'Email', created_at: '2026-07-13T10:00:00Z' }],
  submission_snapshots: [{ id: 'snapshot-1', content: { listing: { title: 'Platform Engineer', company: 'Northstar Labs', description: 'Frozen listing' }, cv_variant: { name: 'Applied CV', sections: [] }, cover_letter: { label: 'Sent letter', result_payload: { body: 'Frozen letter' } } }, content_sha256: 'a'.repeat(64), created_at: '2026-07-14T10:00:00Z' }],
}

const remindersOff = { enabled: false, items: [], next_surface_at: null }
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
function renderPage(reminders: unknown = remindersOff) { api.getCampaignReminders.mockResolvedValue(reminders); const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><CampaignPage campaignId="ws-1" /></QueryClientProvider>) }
async function openTab(name: string) {
  await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }))
  return screen.getByRole('tabpanel')
}

describe('CampaignPage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_R13_CAMPAIGNS_ENABLED', 'true')
    vi.clearAllMocks()
  })

  it('shows the role, company, stage and key dates in the hero', async () => {
    api.getCampaign.mockResolvedValue(campaign)
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
    expect(screen.getByText('Northstar Labs', { selector: '.workspace-hero__eyebrow' })).toBeTruthy()
    expect(screen.getByText('Getting ready')).toBeTruthy()
    expect(screen.getByText(date('2026-08-15T16:00:00Z'))).toBeTruthy()
    expect(screen.getByText(date('2026-07-14T10:00:00Z'))).toBeTruthy()
    expect(screen.getByRole('link', { name: /Job posting/ }).getAttribute('href')).toBe('https://jobs.example/platform')
    expect(screen.getByRole('link', { name: /All applications/ }).getAttribute('href')).toBe('/campaigns')
  })

  it('shows the job description and lets you pick the documents you are sending', async () => {
    api.getCampaign.mockResolvedValue(campaign)
    api.updateCampaignMaterials.mockImplementation(async (_id, payload) => ({ ...campaign, selected_materials: { ...campaign.selected_materials, cv_variant: payload.cv_variant_id ? campaign.available_materials.cv_variants[0] : null } }))
    renderPage()
    expect(await screen.findByText(/Own the service platform/)).toBeTruthy()
    expect(screen.getByRole('option', { name: /Northstar letter \(edited\)/ })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('CV version'), { target: { value: 'cv-1' } })

    await waitFor(() => expect(api.updateCampaignMaterials).toHaveBeenCalledWith('ws-1', { cv_variant_id: 'cv-1' }))
    expect((await screen.findByRole('status')).textContent).toBe('Saved.')
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/cv-studio')
    // Nothing to pick for interview prep yet, so point at the tool that makes one.
    expect(screen.getByRole('link', { name: 'Prepare for interviews' }).getAttribute('href')).toBe('/interview')
    expect(screen.getByText('Send application')).toBeTruthy()
  })

  it('shows friendly empty states when there is no posting or documents yet', async () => {
    api.getCampaign.mockResolvedValue({ ...campaign, listing: null, available_materials: { cv_variants: [], cover_letters: [], interviews: [] }, tasks: [] })
    renderPage()
    expect(await screen.findByText('No job posting yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Write a cover letter' })).toBeTruthy()
    expect(screen.getByText('Nothing planned')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Job posting/ })).toBeNull()
  })

  it('moves the application forward from the stage menu', async () => {
    api.getCampaign.mockResolvedValue(campaign)
    api.updateHistoryWorkspace.mockResolvedValue({ ...campaign, status: 'interviewing' })
    renderPage()
    fireEvent.keyDown(await screen.findByRole('button', { name: /Change stage/ }), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    const options = within(menu).getAllByRole('menuitem').map((item) => item.textContent)
    // Only later stages are offered: the server never moves an application backwards.
    expect(options).toEqual(['Applied', 'Interviewing', 'Offer', 'Offer accepted', 'Close: not selected', 'Close: I withdrew'])

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Interviewing' }))

    await waitFor(() => expect(api.updateHistoryWorkspace).toHaveBeenCalledWith('ws-1', { status: 'interviewing' }))
    await waitFor(() => expect(api.getCampaign).toHaveBeenCalledTimes(2))
  })

  it('deletes the application after confirming, then returns to the board', async () => {
    api.getCampaign.mockResolvedValue(campaign)
    api.deleteCampaign.mockResolvedValue({ deleted: 1 })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete application' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this application?' })
    expect(within(dialog).getByText(/doesn't withdraw anything you already sent/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteCampaign).toHaveBeenCalledWith('ws-1'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/campaigns' }))
  })

  describe('tasks, notes and contacts', () => {
    it('creates a task with the entered due date anchored inside the chosen day', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.createCampaignTask.mockResolvedValue({ id: 'task-2', title: 'Prepare portfolio', deadline: '2026-08-20T12:00:00Z', completed: false, created_at: '2026-07-13T10:00:00Z' })

      renderPage()
      const panel = await openTab('Tasks')
      fireEvent.change(within(panel).getByLabelText('New task'), { target: { value: 'Prepare portfolio' } })
      fireEvent.change(within(panel).getByLabelText('Due date (optional)'), { target: { value: '2026-08-20' } })
      fireEvent.click(within(panel).getByRole('button', { name: 'Add task' }))

      await waitFor(() => expect(api.createCampaignTask).toHaveBeenCalledTimes(1))
      const [id, payload] = api.createCampaignTask.mock.calls[0]
      expect(id).toBe('ws-1')
      expect(payload.title).toBe('Prepare portfolio')
      // The midday anchor is why a date-only input survives the trip through UTC.
      expect(payload.deadline.slice(0, 10)).toBe('2026-08-20')
      await waitFor(() => expect((within(panel).getByLabelText('New task') as HTMLInputElement).value).toBe(''))
      expect((within(panel).getByLabelText('Due date (optional)') as HTMLInputElement).value).toBe('')
    })

    it('submits a task with no due date as an explicit null', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.createCampaignTask.mockResolvedValue({ id: 'task-3', title: 'Call Alex', deadline: null, completed: false, created_at: '2026-07-13T10:00:00Z' })
      renderPage()
      const panel = await openTab('Tasks')
      fireEvent.change(within(panel).getByLabelText('New task'), { target: { value: 'Call Alex' } })
      fireEvent.click(within(panel).getByRole('button', { name: 'Add task' }))
      await waitFor(() => expect(api.createCampaignTask).toHaveBeenCalledWith('ws-1', { title: 'Call Alex', deadline: null }))
    })

    it('toggles completion against the stored state and shows the due date', async () => {
      const deadline = '2026-08-20T12:00:00Z'
      api.getCampaign.mockResolvedValue({ ...campaign, tasks: [{ ...campaign.tasks[0], deadline }] })
      api.updateCampaignTask.mockResolvedValue({ ...campaign.tasks[0], deadline, completed: true })
      renderPage()
      const panel = await openTab('Tasks')
      const checkbox = within(panel).getByRole('checkbox', { name: 'Send application' }) as HTMLInputElement
      expect(checkbox.checked).toBe(false)
      expect(within(panel).getByText(date(deadline))).toBeTruthy()
      fireEvent.click(checkbox)
      await waitFor(() => expect(api.updateCampaignTask).toHaveBeenCalledWith('ws-1', 'task-1', true))
    })

    it('deletes a task, a note, and a contact by their own ids', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      for (const mock of [api.deleteCampaignTask, api.deleteCampaignNote, api.deleteCampaignContact]) mock.mockResolvedValue({ deleted: 1 })
      renderPage()
      fireEvent.click(within(await openTab('Tasks')).getByRole('button', { name: 'Delete task Send application' }))
      await waitFor(() => expect(api.deleteCampaignTask).toHaveBeenCalledWith('ws-1', 'task-1'))
      fireEvent.click(within(await openTab('Notes')).getByRole('button', { name: 'Delete note' }))
      await waitFor(() => expect(api.deleteCampaignNote).toHaveBeenCalledWith('ws-1', 'note-1'))
      fireEvent.click(within(await openTab('Contacts')).getByRole('button', { name: 'Delete contact Alex' }))
      await waitFor(() => expect(api.deleteCampaignContact).toHaveBeenCalledWith('ws-1', 'contact-1'))
    })

    it('adds a note and a contact', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.createCampaignNote.mockResolvedValue({ id: 'note-2', text: 'Salary band', created_at: '2026-07-13T10:00:00Z' })
      api.createCampaignContact.mockResolvedValue({ id: 'contact-2', name: 'Sam', role: null, channel: null, created_at: '2026-07-13T10:00:00Z' })
      renderPage()
      let panel = await openTab('Notes')
      fireEvent.change(within(panel).getByLabelText('New note'), { target: { value: 'Salary band' } })
      fireEvent.click(within(panel).getByRole('button', { name: 'Add note' }))
      await waitFor(() => expect(api.createCampaignNote).toHaveBeenCalledWith('ws-1', 'Salary band'))
      panel = await openTab('Contacts')
      fireEvent.change(within(panel).getByLabelText('Name'), { target: { value: 'Sam' } })
      fireEvent.click(within(panel).getByRole('button', { name: 'Add contact' }))
      await waitFor(() => expect(api.createCampaignContact).toHaveBeenCalledWith('ws-1', { name: 'Sam', role: null, channel: null }))
    })

    it('shows empty states for notes and contacts', async () => {
      api.getCampaign.mockResolvedValue({ ...campaign, notes: [], contacts: [], tasks: [] })
      renderPage()
      expect(within(await openTab('Tasks')).getByText('No tasks yet')).toBeTruthy()
      expect(within(await openTab('Notes')).getByText('No notes yet')).toBeTruthy()
      expect(within(await openTab('Contacts')).getByText('No contacts yet')).toBeTruthy()
    })

    it('reports a failed write once', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.deleteCampaignNote.mockRejectedValueOnce(new Error('offline'))
      renderPage()
      fireEvent.click(within(await openTab('Notes')).getByRole('button', { name: 'Delete note' }))
      const banner = await screen.findByText("That change couldn't be saved. Try again.")
      expect(banner.getAttribute('role')).toBe('alert')
      expect(screen.getAllByText("That change couldn't be saved. Try again.")).toHaveLength(1)
    })
  })

  describe('timeline', () => {
    it('lists events newest first in plain words, with what was sent', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      renderPage()
      const panel = await openTab('Timeline')
      const entries = within(panel).getAllByRole('listitem').map((item) => item.textContent)
      expect(entries).toHaveLength(2)
      expect(entries[0]).toContain('Application sent')
      expect(entries[0]).toContain('Automatic')
      expect(entries[1]).toContain('Moved to Getting ready')
      expect(entries[1]).toContain('You')

      const sent = within(panel).getByText('See what you sent').closest('details') as HTMLDetailsElement
      expect(within(sent).getByText('Platform Engineer · Northstar Labs')).toBeTruthy()
      expect(within(sent).getByText('Applied CV')).toBeTruthy()
      expect(within(sent).getByText('Sent letter')).toBeTruthy()
    })

    it('has an empty state', async () => {
      api.getCampaign.mockResolvedValue({ ...campaign, events: [], submission_snapshots: [] })
      renderPage()
      expect(within(await openTab('Timeline')).getByText('Nothing here yet')).toBeTruthy()
    })
  })

  it('opens the pre-application checklist tab', async () => {
    api.getCampaign.mockResolvedValue(campaign)
    renderPage()
    const panel = await openTab('Checklist')
    expect(within(panel).getByText('The job posting is attached')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: 'Run the checks' })).toBeTruthy()
  })

  describe('deadline reminders', () => {
    it('starts off, shows deadlines only once turned on, and turns off cleanly', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.updateCampaignReminderConsent
        .mockResolvedValueOnce({ enabled: true, items: [{ kind: 'task_deadline', task_id: 'task-1', label: 'Follow up with Alex', deadline: '2026-08-14T12:00:00Z' }], next_surface_at: null })
        .mockResolvedValueOnce({ enabled: false, items: [], next_surface_at: null })
      renderPage()
      const panel = await openTab('Tasks')
      const enable = await within(panel).findByRole('button', { name: 'Turn reminders on' })
      expect(enable.getAttribute('aria-pressed')).toBe('false')
      expect(within(panel).getByText(/never send emails/)).toBeTruthy()
      expect(within(panel).queryByText('Follow up with Alex')).toBeNull()

      fireEvent.click(enable)
      await waitFor(() => expect(api.updateCampaignReminderConsent).toHaveBeenCalledWith('ws-1', true))
      const revoke = await within(panel).findByRole('button', { name: 'Turn reminders off' })
      expect(revoke.getAttribute('aria-pressed')).toBe('true')
      expect(within(panel).getByText('Follow up with Alex')).toBeTruthy()

      fireEvent.click(revoke)
      await waitFor(() => expect(api.updateCampaignReminderConsent).toHaveBeenLastCalledWith('ws-1', false))
      expect(await within(panel).findByRole('button', { name: 'Turn reminders on' })).toBeTruthy()
      expect(within(panel).queryByText('Follow up with Alex')).toBeNull()
    })

    it('stays on when nothing is due', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      renderPage({ enabled: true, items: [], next_surface_at: '2026-08-14T12:00:00Z' })
      const panel = await openTab('Tasks')
      expect(await within(panel).findByText('Nothing due soon.')).toBeTruthy()
      expect(within(panel).getByRole('button', { name: 'Turn reminders off' })).toBeTruthy()
    })

    it('leaves the control untouched when the change could not be saved', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.updateCampaignReminderConsent.mockRejectedValueOnce(new Error('offline'))
      renderPage()
      const panel = await openTab('Tasks')
      fireEvent.click(await within(panel).findByRole('button', { name: 'Turn reminders on' }))
      expect(await within(panel).findByText("Reminders couldn't be updated. Try again.")).toBeTruthy()
      expect(within(panel).getByRole('button', { name: 'Turn reminders on' })).toBeTruthy()
    })
  })
})
