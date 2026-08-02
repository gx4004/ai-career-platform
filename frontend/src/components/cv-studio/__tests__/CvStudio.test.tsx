import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvStudio } from '#/components/cv-studio/CvStudio'

const api = vi.hoisted(() => ({
  listCvDocuments: vi.fn(), createCvDocument: vi.fn(), getCvDocument: vi.fn(), updateCvDocument: vi.fn(),
  listEvidenceItems: vi.fn(),
  snapshotCvVariant: vi.fn(), restoreCvVariant: vi.fn(),
  deleteCvDocument: vi.fn(), deleteAllCvDocuments: vi.fn(),
  scoreCvDocument: vi.fn(),
  fetchCvArtifactBlob: vi.fn(() => Promise.resolve(new Blob(['artifact']))),
}))
const session = vi.hoisted(() => ({ status: 'authenticated', openAuthDialog: vi.fn() }))
vi.mock('#/lib/api/client', () => api)
vi.mock('#/hooks/useSession', () => ({ useSession: () => session }))

const section = { id: 's1', kind: 'experience' as const, title: 'Experience', visible: true, position: 0, entries: [{ id: 'e1', evidence_item_id: null, body: 'Built accessible systems.', position: 0 }] }
const document = { id: 'd1', name: 'Principal CV', sections: [section], created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z', quality_model_runs: 0, tailoring_model_runs: 0, quality_model_run_limit: 10 as const, tailoring_model_run_limit: 10 as const, variants: [{ id: 'v1', name: 'Base', target_role: null, sections: [section], created_at: '2026-07-12T10:00:00Z' }] }
const confirmedEvidence = { id: 'ev-1', kind: 'achievement' as const, content: { statement: 'Reduced review time by 23%.' }, provenance: 'user-entered' as const, confirmation_state: 'confirmed' as const, created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z' }

function view() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CvStudio /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks(); session.status = 'authenticated'
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:artifact') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  api.listCvDocuments.mockResolvedValue({ items: [document] })
  api.createCvDocument.mockResolvedValue(document)
  api.listEvidenceItems.mockResolvedValue({ items: [] })
  api.getCvDocument.mockResolvedValue(document)
  api.updateCvDocument.mockResolvedValue(document)
  api.deleteCvDocument.mockResolvedValue(undefined)
  api.deleteAllCvDocuments.mockResolvedValue(undefined)
  api.scoreCvDocument.mockResolvedValue({
    schema_version: 'cv-quality/v1', scoring_mode: 'heuristic',
    remaining_model_runs: 10,
    advisory_note: 'Quality scores are directional editing guidance. Compatibility checks report only named structural properties.',
    dimensions: [{ key: 'impact', label: 'Evidence of impact', score: 64, reasons: ['Two entries include outcomes.'], remediation: 'Add truthful measurements.' }],
    ats_checks: [{ key: 'section_structure', label: 'Section structure', status: 'pass', explanation: 'Found clear typed sections.', remediation: 'Add missing standard headings.' }],
    history_id: 'h1', access_mode: 'authenticated', saved: true, locked_actions: [],
  })
})

describe('CV Studio editor surface', () => {
  it('creates a blank document from the empty state and opens it', async () => {
    let resolveCreate!: (value: typeof document) => void
    api.listCvDocuments.mockResolvedValue({ items: [] })
    api.createCvDocument.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve }))
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Create a CV' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create CV' }))

    await waitFor(() => expect(api.createCvDocument).toHaveBeenCalledWith({ name: 'My CV', seed_evidence_item_ids: [] }))
    const pendingButton = within(dialog).getByRole('button', { name: 'Creating CV…' }) as HTMLButtonElement
    expect(pendingButton.disabled).toBe(true)
    fireEvent.click(pendingButton)
    expect(api.createCvDocument).toHaveBeenCalledTimes(1)
    await act(async () => resolveCreate(document))
    expect((await screen.findByLabelText('Document name') as HTMLInputElement).value).toBe('Principal CV')
    expect(api.getCvDocument).toHaveBeenCalledWith('d1')
    expect(api.listCvDocuments).toHaveBeenCalledTimes(1)
  })

  it('keeps the creation dialog actionable and announces a failure', async () => {
    api.listCvDocuments.mockResolvedValue({ items: [] })
    api.createCvDocument.mockRejectedValue(new Error('Creation unavailable'))
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Create a CV' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create CV' }))

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Creation unavailable')
    expect(within(dialog).getByRole('button', { name: 'Create CV' })).toBeTruthy()
  })

  it('creates another document from selected confirmed evidence', async () => {
    const created = { ...document, id: 'd2', name: 'Role CV' }
    api.listEvidenceItems.mockResolvedValue({ items: [
      confirmedEvidence,
      { ...confirmedEvidence, id: 'ev-2', content: { name: 'Unreviewed skill' }, confirmation_state: 'unconfirmed' },
    ] })
    api.createCvDocument.mockResolvedValue(created)
    api.getCvDocument.mockImplementation((id: string) => Promise.resolve(id === 'd2' ? created : document))
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'New CV' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Document name'), { target: { value: 'Role CV' } })
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: /Reduced review time by 23%/ }))
    expect(within(dialog).queryByText('Unreviewed skill')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create CV' }))

    await waitFor(() => expect(api.createCvDocument).toHaveBeenCalledWith({
      name: 'Role CV', seed_evidence_item_ids: ['ev-1'],
    }))
    expect((await screen.findByLabelText('Document name') as HTMLInputElement).value).toBe('Role CV')
  })

  it('lets the owner delete one document or all documents after explicit confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const firstView = view()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete document' }))
    await waitFor(() => expect(api.deleteCvDocument).toHaveBeenCalledWith('d1'))
    firstView.unmount()

    api.listCvDocuments.mockResolvedValue({ items: [document] })
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete all documents' }))
    await waitFor(() => expect(api.deleteAllCvDocuments).toHaveBeenCalled())
  })
  it('previews the exact paginated PDF artifact and exposes both export formats', async () => {
    view()
    const preview = await screen.findByTitle('ATS Essential PDF preview')
    expect(preview.getAttribute('src')).toContain('blob:artifact')
    expect(screen.getByRole('link', { name: /DOCX/ }).getAttribute('download')).toContain('.docx')
    expect(screen.getByRole('link', { name: /PDF/ }).getAttribute('download')).toContain('.pdf')
  })

  it('gates document loading and sends guests through the auth intent', () => {
    session.status = 'guest'
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(api.listCvDocuments).not.toHaveBeenCalled()
    expect(session.openAuthDialog).toHaveBeenCalledWith(expect.objectContaining({ to: '/cv-studio' }))
  })

  it('keeps a newer edit saving when an older autosave response resolves', async () => {
    let resolveFirst!: (value: typeof document) => void
    let resolveSecond!: (value: typeof document) => void
    api.updateCvDocument
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    view()
    const name = await screen.findByLabelText('Document name')
    fireEvent.change(name, { target: { value: 'First edit' } })
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalledTimes(1), { timeout: 1500 })
    fireEvent.change(name, { target: { value: 'Newest edit' } })
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    expect(api.updateCvDocument).toHaveBeenCalledTimes(1)
    await act(async () => resolveFirst(document))
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status').textContent).toContain('Saving')
    await act(async () => resolveSecond(document))
    expect(screen.getByRole('status').textContent).toContain('Saved')
    expect(api.updateCvDocument).toHaveBeenLastCalledWith('d1', expect.objectContaining({ name: 'Newest edit' }))
  })

  it('lets the owner open another document without discarding a pending edit', async () => {
    const other = { ...document, id: 'd2', name: 'Research CV' }
    api.listCvDocuments.mockResolvedValue({ items: [document, other] })
    api.getCvDocument.mockImplementation((id: string) => Promise.resolve(id === 'd2' ? other : document))
    view()
    const picker = await screen.findByLabelText('Structured document')
    fireEvent.change(picker, { target: { value: 'd2' } })
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Research CV'))
    expect(api.getCvDocument).toHaveBeenCalledWith('d2')
  })

  it('supports keyboard section moves and reports a confirmed restore failure', async () => {
    const second = { ...section, id: 's2', kind: 'skills' as const, title: 'Skills', position: 1 }
    api.getCvDocument.mockResolvedValue({ ...document, sections: [section, second] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    api.restoreCvVariant.mockRejectedValue(new Error('Restore unavailable'))
    view()
    const moveUp = await screen.findByRole('button', { name: 'Move Skills up' })
    fireEvent.keyDown(moveUp, { key: 'Enter' }); fireEvent.click(moveUp)
    await waitFor(() => expect(screen.getByLabelText('CV sections').querySelectorAll('.studio-section')[0]?.textContent).toContain('Skills'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved'), { timeout: 1500 })
    fireEvent.click(screen.getByRole('button', { name: /Restore/ }))
    expect(window.confirm).toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toContain('Restore unavailable')
  })

  it('shows explainable quality without a universal ATS score and reruns a named check', async () => {
    view()
    expect(await screen.findByText('Evidence of impact')).toBeTruthy()
    expect(screen.getByText('Two entries include outcomes.')).toBeTruthy()
    expect(screen.queryByText(/ATS score/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Rerun Section structure' }))
    await waitFor(() => expect(api.scoreCvDocument).toHaveBeenLastCalledWith('d1', {
      use_model: false, checks: ['section_structure'],
    }))
  })

  it('shows the durable model scoring limit while keeping deterministic checks available', async () => {
    api.scoreCvDocument
      .mockResolvedValueOnce({ ...(await api.scoreCvDocument()), remaining_model_runs: 0 })
      .mockRejectedValueOnce(new Error('This document has reached its model scoring limit. Deterministic checks remain available.'))
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Add model perspective' }))
    expect((await screen.findByRole('alert')).textContent).toContain('reached its model scoring limit')
    expect(screen.getByText('0 model scoring runs remain for this document.')).toBeTruthy()
  })
})
