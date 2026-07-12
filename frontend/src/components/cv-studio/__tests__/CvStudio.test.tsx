import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvStudio } from '#/components/cv-studio/CvStudio'

const api = vi.hoisted(() => ({
  listCvDocuments: vi.fn(), getCvDocument: vi.fn(), updateCvDocument: vi.fn(),
  snapshotCvVariant: vi.fn(), restoreCvVariant: vi.fn(),
  scoreCvDocument: vi.fn(),
}))
const session = vi.hoisted(() => ({ status: 'authenticated', openAuthDialog: vi.fn() }))
vi.mock('#/lib/api/client', () => api)
vi.mock('#/hooks/useSession', () => ({ useSession: () => session }))

const section = { id: 's1', kind: 'experience' as const, title: 'Experience', visible: true, position: 0, entries: [{ id: 'e1', evidence_item_id: null, body: 'Built accessible systems.', position: 0 }] }
const document = { id: 'd1', name: 'Principal CV', sections: [section], created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z', variants: [{ id: 'v1', name: 'Base', target_role: null, sections: [section], created_at: '2026-07-12T10:00:00Z' }] }

function view() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CvStudio /></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks(); session.status = 'authenticated'
  api.listCvDocuments.mockResolvedValue({ items: [document] })
  api.getCvDocument.mockResolvedValue(document)
  api.updateCvDocument.mockResolvedValue(document)
  api.scoreCvDocument.mockResolvedValue({
    schema_version: 'cv-quality/v1', scoring_mode: 'heuristic',
    advisory_note: 'Quality scores are directional editing guidance. Compatibility checks report only named structural properties.',
    dimensions: [{ key: 'impact', label: 'Evidence of impact', score: 64, reasons: ['Two entries include outcomes.'], remediation: 'Add truthful measurements.' }],
    ats_checks: [{ key: 'section_structure', label: 'Section structure', status: 'pass', explanation: 'Found clear typed sections.', remediation: 'Add missing standard headings.' }],
    history_id: 'h1', access_mode: 'authenticated', saved: true, locked_actions: [],
  })
})

describe('CV Studio editor surface', () => {
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
})
