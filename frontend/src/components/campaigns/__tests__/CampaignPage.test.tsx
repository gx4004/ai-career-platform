import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignPage } from '../CampaignPage'

const api = vi.hoisted(() => ({ getCampaign: vi.fn(), updateCampaignMaterials: vi.fn(), deleteCampaign: vi.fn(), createCampaignTask: vi.fn(), updateCampaignTask: vi.fn(), deleteCampaignTask: vi.fn(), createCampaignNote: vi.fn(), deleteCampaignNote: vi.fn(), createCampaignContact: vi.fn(), deleteCampaignContact: vi.fn(), getCampaignReminders: vi.fn(), updateCampaignReminderConsent: vi.fn(), reviewCampaign: vi.fn() }))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/client', () => api)
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated', openAuthDialog: vi.fn() }) }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="/history">{children}</a>, useNavigate: () => navigate }))

const campaign = {
  id: 'ws-1', label: 'Northstar', is_pinned: false, company: 'Northstar Labs', role: 'Platform Engineer', status: 'preparing', deadline: '2026-08-15T16:00:00Z', linked_run_ids: [], last_active_tool: null, last_active_result_id: null, updated_at: '2026-07-13T10:00:00Z',
  listing: { title: 'Platform Engineer', company: 'Northstar Labs', description: 'Own the service platform and improve reliability across product teams.', source_url: 'https://jobs.example/platform', retrieved_at: '2026-07-12T10:00:00Z' },
  selected_materials: { cv_variant: null, cover_letter: null, interview: null },
  available_materials: { cv_variants: [{ id: 'cv-1', document_id: 'doc-1', document_name: 'Engineering CV', name: 'Northstar', target_role: 'Platform Engineer', created_at: '2026-07-12T10:00:00Z' }], cover_letters: [{ id: 'cl-2', label: 'Northstar letter', parent_run_id: 'cl-1', created_at: '2026-07-12T11:00:00Z' }], interviews: [] },
  events: [{ id: 'event-1', event_type: 'status_changed', details: { from: 'planning', to: 'preparing' }, provenance: 'user', created_at: '2026-07-13T10:00:00Z' }, { id: 'event-2', event_type: 'submission_snapshot_created', details: { snapshot_id: 'snapshot-1' }, provenance: 'user', created_at: '2026-07-13T10:00:00Z' }, { id: 'event-3', event_type: 'submission_confirmed', details: { submission_record_id: 'record-1', packet_approval_snapshot_id: 'approval-1' }, provenance: 'system', created_at: '2026-07-13T10:05:00Z' }],
  tasks: [{ id: 'task-1', title: 'Send application', deadline: null, completed: false, created_at: '2026-07-13T10:00:00Z' }],
  notes: [{ id: 'note-1', text: 'Ask about team structure', created_at: '2026-07-13T10:00:00Z' }],
  contacts: [{ id: 'contact-1', name: 'Alex', role: 'Recruiter', channel: 'Email', created_at: '2026-07-13T10:00:00Z' }],
  submission_snapshots: [{ id: 'snapshot-1', content: { listing: { title: 'Platform Engineer', company: 'Northstar Labs', description: 'Frozen listing' }, cv_variant: { name: 'Applied CV', sections: [] }, cover_letter: { label: 'Sent letter', result_payload: { body: 'Frozen letter' } } }, content_sha256: 'a'.repeat(64), created_at: '2026-07-13T10:00:00Z' }],
  submission_confirmations: [{ record_id: 'record-1', discovery_source_id: 'source-1', contract_version: 'northstar/v1', submitted_fields: { job_title: 'Platform Engineer', cover_letter: 'Exact approved letter' }, submitted_fields_sha256: 'b'.repeat(64), source_confirmation_id: 'northstar-confirmation-1', submitted_at: '2026-07-13T10:05:00Z', snapshot: { id: 'approval-1', packet_id: 'packet-1', campaign_id: 'ws-1', listing_id: null, role_key: `role:v1:${'c'.repeat(64)}`, destination_url: 'https://jobs.example/platform', content: { schema_version: 'packet-approval/v1', packet_id: 'packet-1', campaign_id: 'ws-1', listing_id: null, frozen_at: '2026-07-13T10:00:00Z', match_rationale: { composite_score: 90, signals: [], matched_rules: [] }, unresolved_questions: [], unsupported_claims: [], resolved_stop_answers: [], listing: null, manual_handoff: null, cv_variant: null, drafts: null }, content_sha256: 'c'.repeat(64), created_at: '2026-07-13T10:00:00Z' }, product_copy_deletion_notice: 'Deleting this campaign removes its product-held submission records but does not withdraw the application from the employer.' }],
}

const remindersOff = { enabled: false, items: [], next_surface_at: null }
function renderPage(reminders: unknown = remindersOff) { api.getCampaignReminders.mockResolvedValue(reminders); const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return render(<QueryClientProvider client={client}><CampaignPage campaignId="ws-1" /></QueryClientProvider>) }
// Tracking panels share one <section> per heading; scope queries so a control
// asserted for tasks cannot be satisfied by the notes or contacts panel.
function tracker(name: string) { return screen.getByRole('heading', { name, level: 3 }).closest('.campaign-tracker') as HTMLElement }

describe('CampaignPage', () => {
  beforeEach(() => {
    for (const flag of [
      'VITE_R11_EVIDENCE_PROFILE_ENABLED',
      'VITE_R12_CV_STUDIO_ENABLED',
      'VITE_R13_CAMPAIGNS_ENABLED',
      'VITE_R14_DISCOVERY_ENABLED',
      'VITE_R15_QUEUE_ENABLED',
      'VITE_R16_SUBMISSION_FOUNDATION_ENABLED',
    ]) vi.stubEnv(flag, 'true')
    vi.clearAllMocks()
  })

  it('shows campaign facts, canonical listing, and immutable material choices', async () => {
    api.getCampaign.mockResolvedValue(campaign)
    api.reviewCampaign.mockResolvedValue({ history_id: 'review-1', schema_version: 'application-reviewer/v1', summary: { headline: '1 advisory finding', verdict: 'Review', confidence_note: 'Deterministic' }, top_actions: [], generated_at: '2026-07-13T10:00:00Z', download_title: 'Review', exportable_sections: [], editable_blocks: [], access_mode: 'authenticated', saved: true, locked_actions: [], findings: [{ id: 'finding-1', category: 'unsupported_claim', severity: 'high', message: 'Nimbus is not traceable.', locations: ['Cover letter'], trace: ['claim:Nimbus', 'result:no_match'] }] })
    api.updateCampaignMaterials.mockImplementation(async (_id, payload) => ({ ...campaign, selected_materials: { ...campaign.selected_materials, cv_variant: payload.cv_variant_id ? campaign.available_materials.cv_variants[0] : null } }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
    expect(screen.getAllByText('Northstar Labs')).toHaveLength(2)
    expect(screen.getByText(/Own the service platform/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('CV variant'), { target: { value: 'cv-1' } })
    await waitFor(() => expect(api.updateCampaignMaterials).toHaveBeenCalledWith('ws-1', { cv_variant_id: 'cv-1' }))
    expect(screen.getByRole('option', { name: /Northstar letter — revision.*cl-2/ })).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toBe('Selection saved.')
    expect(screen.getByText('Send application')).toBeTruthy()
    expect(screen.getByText('Ask about team structure')).toBeTruthy()
    expect(screen.getByText(/Status changed/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Turn reminders on' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View submitted application' }))
    expect((screen.getByText(/Application sent/).closest('details') as HTMLDetailsElement).open).toBe(true)
    fireEvent.click(screen.getByText(/Application sent/))
    expect(screen.getByText('Frozen listing')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View submission confirmation' }))
    expect(screen.getByRole('heading', { name: 'Submitted fields' })).toBeTruthy()
    expect(screen.getByText('job title')).toBeTruthy()
    expect(screen.getByText('Exact approved letter')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View exact approved packet snapshot' }).getAttribute('href')).toBe('#approval-snapshot-approval-1')
    expect(screen.getByText(/does not withdraw the application from the employer/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run application review' }))
    expect(await screen.findByText('Nimbus is not traceable.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss finding' }))
    expect(screen.queryByText('Nimbus is not traceable.')).toBeNull()
    api.deleteCampaign.mockResolvedValue({ deleted: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign data' }))
    expect(screen.getByRole('dialog', { name: 'Delete this campaign?' })).toBeTruthy()
    expect(screen.getByText(/cannot withdraw or recall the employer-held application/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    await waitFor(() => expect(api.deleteCampaign).toHaveBeenCalledWith('ws-1'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/history' }))
  }, 10_000)

  it('renders an explicit empty state and disables unavailable material selection', async () => {
    api.getCampaign.mockResolvedValue({ ...campaign, listing: null, available_materials: { cv_variants: [], cover_letters: [], interviews: [] } })
    renderPage()
    expect(await screen.findByText('No canonical listing yet')).toBeTruthy()
    expect((screen.getByLabelText('Interview preparation revision') as HTMLSelectElement).disabled).toBe(true)
  })

  it('keeps R16 confirmation controls dark until the full R16 chain is enabled', async () => {
    vi.stubEnv('VITE_R16_SUBMISSION_FOUNDATION_ENABLED', 'false')
    api.getCampaign.mockResolvedValue(campaign)

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
    expect(screen.queryByText('Submission confirmations')).toBeNull()
    expect(screen.queryByRole('button', { name: 'View submission confirmation' })).toBeNull()
  })

  describe('campaign tracking', () => {
    it('creates a task with the entered deadline anchored inside the chosen day', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.createCampaignTask.mockResolvedValue({ id: 'task-2', title: 'Prepare portfolio', deadline: '2026-08-20T12:00:00Z', completed: false, created_at: '2026-07-13T10:00:00Z' })

      renderPage()
      expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Prepare portfolio' } })
      fireEvent.change(screen.getByLabelText('Deadline (optional)'), { target: { value: '2026-08-20' } })
      fireEvent.click(within(tracker('Tasks')).getByRole('button', { name: 'Add task' }))

      await waitFor(() => expect(api.createCampaignTask).toHaveBeenCalledTimes(1))
      const [id, payload] = api.createCampaignTask.mock.calls[0]
      expect(id).toBe('ws-1')
      expect(payload.title).toBe('Prepare portfolio')
      // The midday anchor is why a date-only input survives the trip through UTC:
      // the instant must still land on the day the owner picked, in either direction.
      expect(payload.deadline.slice(0, 10)).toBe('2026-08-20')
      await waitFor(() => expect((screen.getByLabelText('Next action') as HTMLInputElement).value).toBe(''))
      expect((screen.getByLabelText('Deadline (optional)') as HTMLInputElement).value).toBe('')
    })

    it('submits a task with no deadline as an explicit null', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.createCampaignTask.mockResolvedValue({ id: 'task-3', title: 'Call Alex', deadline: null, completed: false, created_at: '2026-07-13T10:00:00Z' })

      renderPage()
      expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Call Alex' } })
      fireEvent.click(within(tracker('Tasks')).getByRole('button', { name: 'Add task' }))

      await waitFor(() => expect(api.createCampaignTask).toHaveBeenCalledWith('ws-1', { title: 'Call Alex', deadline: null }))
    })

    it('toggles completion against the stored state and shows a task deadline', async () => {
      const deadline = '2026-08-20T12:00:00Z'
      api.getCampaign.mockResolvedValue({ ...campaign, tasks: [{ ...campaign.tasks[0], deadline }] })
      api.updateCampaignTask.mockResolvedValue({ ...campaign.tasks[0], deadline, completed: true })

      renderPage()
      expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
      const tasks = within(tracker('Tasks'))
      const checkbox = tasks.getByRole('checkbox') as HTMLInputElement
      expect(checkbox.checked).toBe(false)
      expect(tasks.getByText(`Send application · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(deadline))}`)).toBeTruthy()

      fireEvent.click(checkbox)

      await waitFor(() => expect(api.updateCampaignTask).toHaveBeenCalledWith('ws-1', 'task-1', true))
    })

    it('deletes a task, a note, and a contact by their own ids', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      for (const mock of [api.deleteCampaignTask, api.deleteCampaignNote, api.deleteCampaignContact]) mock.mockResolvedValue({ deleted: 1 })

      renderPage()
      expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Delete task Send application' }))
      await waitFor(() => expect(api.deleteCampaignTask).toHaveBeenCalledWith('ws-1', 'task-1'))
      fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))
      await waitFor(() => expect(api.deleteCampaignNote).toHaveBeenCalledWith('ws-1', 'note-1'))
      fireEvent.click(screen.getByRole('button', { name: 'Delete contact Alex' }))
      await waitFor(() => expect(api.deleteCampaignContact).toHaveBeenCalledWith('ws-1', 'contact-1'))
    })

    it('reports a failed tracking write once for the whole section', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.deleteCampaignNote.mockRejectedValueOnce(new Error('offline'))

      renderPage()
      expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
      expect(screen.queryByText('The campaign update could not be saved.')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Delete note' }))

      const banner = await screen.findByText('The campaign update could not be saved.')
      expect(banner.getAttribute('role')).toBe('alert')
      // One banner for tasks, notes and contacts together — the three trackers
      // share a single mutation, so a per-tracker copy would be a regression.
      expect(screen.getAllByText('The campaign update could not be saved.')).toHaveLength(1)
    })

    it('labels timeline events by humanized type and provenance', async () => {
      api.getCampaign.mockResolvedValue(campaign)

      renderPage()
      expect(await screen.findByRole('heading', { name: 'Platform Engineer', level: 1 })).toBeTruthy()
      const entries = within(tracker('Timeline')).getAllByRole('listitem').map(item => item.textContent)

      expect(entries).toHaveLength(3)
      expect(entries[0]).toContain('Status changed')
      expect(entries[0]).toContain('You')
      expect(entries[1]).toContain('View submitted application')
      expect(entries[2]).toContain('View submission confirmation')
      expect(entries[2]).toContain('System')
      // Event rows carry the type, never the private details behind it.
      expect(entries.join(' ')).not.toContain('planning')
    })

    it('opens the submitted snapshot disclosure from its timeline event', async () => {
      api.getCampaign.mockResolvedValue(campaign)

      renderPage()
      const summary = await screen.findByText(/Application sent/)
      const disclosure = summary.closest('details') as HTMLDetailsElement
      expect(disclosure.open).toBe(false)

      fireEvent.click(screen.getByRole('button', { name: 'View submitted application' }))

      expect(disclosure.open).toBe(true)
      const frozen = within(disclosure)
      expect(frozen.getByText(/Platform Engineer · Northstar Labs/)).toBeTruthy()
      expect(frozen.getByText('Frozen listing')).toBeTruthy()
      expect(frozen.getByText(/Applied CV/)).toBeTruthy()
      expect(frozen.getByText(/Sent letter/)).toBeTruthy()
      expect(frozen.getByText(`SHA-256 ${'a'.repeat(64)}`)).toBeTruthy()
    })

    it('says so plainly when nothing has been submitted yet', async () => {
      api.getCampaign.mockResolvedValue({ ...campaign, submission_snapshots: [] })

      renderPage()

      expect(await screen.findByText('No submitted application snapshot yet.')).toBeTruthy()
      expect(tracker('Submitted versions').querySelector('details')).toBeNull()
    })
  })

  describe('deadline reminders', () => {
    it('starts off, surfaces deadlines only after consent, and revokes cleanly', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.updateCampaignReminderConsent
        .mockResolvedValueOnce({ enabled: true, items: [{ kind: 'task_deadline', task_id: 'task-1', label: 'Follow up with Alex', deadline: '2026-08-14T12:00:00Z' }], next_surface_at: null })
        .mockResolvedValueOnce({ enabled: false, items: [], next_surface_at: null })

      renderPage()
      const enable = await screen.findByRole('button', { name: 'Turn reminders on' })
      expect(enable.getAttribute('aria-pressed')).toBe('false')
      expect(screen.getByText(/No email or push notifications/)).toBeTruthy()
      expect(screen.queryByText('Follow up with Alex')).toBeNull()

      fireEvent.click(enable)

      await waitFor(() => expect(api.updateCampaignReminderConsent).toHaveBeenCalledWith('ws-1', true))
      const revoke = await screen.findByRole('button', { name: 'Turn reminders off' })
      expect(revoke.getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByText('Follow up with Alex')).toBeTruthy()

      fireEvent.click(revoke)

      await waitFor(() => expect(api.updateCampaignReminderConsent).toHaveBeenLastCalledWith('ws-1', false))
      expect(await screen.findByRole('button', { name: 'Turn reminders on' })).toBeTruthy()
      expect(screen.queryByText('Follow up with Alex')).toBeNull()
    })

    it('keeps consent on when there is nothing due', async () => {
      api.getCampaign.mockResolvedValue(campaign)

      renderPage({ enabled: true, items: [], next_surface_at: '2026-08-14T12:00:00Z' })

      expect(await screen.findByText('No approaching deadlines to surface right now.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Turn reminders off' })).toBeTruthy()
    })

    it('leaves the control untouched when consent could not be saved', async () => {
      api.getCampaign.mockResolvedValue(campaign)
      api.updateCampaignReminderConsent.mockRejectedValueOnce(new Error('offline'))

      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Turn reminders on' }))

      expect(await screen.findByText('Reminder consent could not be updated.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Turn reminders on' })).toBeTruthy()
    })
  })
})
