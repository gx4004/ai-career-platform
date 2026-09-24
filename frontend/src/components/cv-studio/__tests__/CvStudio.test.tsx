import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvStudio } from '#/components/cv-studio/CvStudio'
import type { CvDocument } from '#/lib/api/schemas'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'

const api = vi.hoisted(() => ({
  listCvDocuments: vi.fn(), createCvDocument: vi.fn(), getCvDocument: vi.fn(), updateCvDocument: vi.fn(),
  listEvidenceItems: vi.fn(), getCvStyleCatalog: vi.fn(),
  snapshotCvVariant: vi.fn(), restoreCvVariant: vi.fn(),
  deleteCvDocument: vi.fn(), deleteAllCvDocuments: vi.fn(),
  exportCvDocuments: vi.fn(), scoreCvDocument: vi.fn(),
  proposeCvImport: vi.fn(), acceptCvImport: vi.fn(),
  tailorCvDocument: vi.fn(), applyCvTailoring: vi.fn(),
  fetchCvArtifactBlob: vi.fn(() => Promise.resolve(new Blob(['artifact']))),
}))
const session = vi.hoisted(() => ({ status: 'authenticated', openAuthDialog: vi.fn() }))
vi.mock('#/lib/api/client', () => api)
vi.mock('#/hooks/useSession', () => ({ useSession: () => session }))

const experience = {
  id: 's1', kind: 'experience' as const, title: 'Experience', visible: true, position: 0,
  entries: [{
    id: 'e1', evidence_item_id: null, body: 'Built accessible systems.', position: 0,
    heading: 'Lead Designer', subheading: 'Acme', location: 'Berlin', start_date: '2021', end_date: 'Present', bullets: ['Built accessible systems.'],
  }],
}
const skills = { id: 's2', kind: 'skills' as const, title: 'Skills', visible: true, position: 1, entries: [{ id: 'e2', evidence_item_id: null, body: 'Figma, research', position: 0 }] }
const style = { template_id: 'ats-essential' as const, font_id: 'lato' as const, accent_color: '#111827' as const, density: 'normal' as const, ats_mode: false }
const document: CvDocument = {
  id: 'd1', name: 'Principal CV', sections: [experience, skills], style,
  created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z',
  quality_model_runs: 0, tailoring_model_runs: 0, quality_model_run_limit: 10, tailoring_model_run_limit: 10,
  variants: [{ id: 'v1', name: 'Base', target_role: null, sections: [experience], created_at: '2026-07-12T10:00:00Z' }],
}
const quality = {
  schema_version: 'cv-quality/v1', scoring_mode: 'heuristic', remaining_model_runs: 10,
  advisory_note: 'Directional guidance.',
  dimensions: [{ key: 'impact', label: 'Evidence of impact', score: 64, reasons: ['Two entries include outcomes.'], remediation: 'Add truthful measurements.' }],
  ats_checks: [
    { key: 'section_structure', label: 'Section structure', status: 'pass', explanation: 'Found typed sections.', remediation: 'Add Experience and Skills.' },
    { key: 'page_breaks', label: 'Page-break risk', status: 'fail', explanation: 'Validated against the generated PDF artifact.', remediation: 'Regenerate after editing if this artifact validation fails.' },
  ],
  history_id: 'h1', access_mode: 'authenticated', saved: true, locked_actions: [],
  ats_score: 72, ats_fixes: ['Regenerate after editing if this artifact validation fails.'],
}
let clickedDownload = ''

function view() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CvStudio /></QueryClientProvider>)
}
const saveStatus = () => screen.getByTestId('save-status')
const lastPatch = () => api.updateCvDocument.mock.calls.at(-1)?.[1]
async function openMenu(name: string) {
  const trigger = await screen.findByRole('button', { name })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return screen.findByRole('menu')
}

beforeEach(() => {
  vi.clearAllMocks(); session.status = 'authenticated'; clickedDownload = ''
  window.sessionStorage.clear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:artifact') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedDownload = this.download
  })
  api.listCvDocuments.mockResolvedValue({ items: [document] })
  api.createCvDocument.mockResolvedValue(document)
  api.listEvidenceItems.mockResolvedValue({ items: [] })
  api.getCvDocument.mockResolvedValue(document)
  api.updateCvDocument.mockImplementation((_id: string, payload: Partial<CvDocument>) => Promise.resolve({ ...document, ...payload, updated_at: '2026-07-12T10:05:00Z' }))
  api.getCvStyleCatalog.mockRejectedValue(new Error('offline'))
  api.deleteCvDocument.mockResolvedValue(undefined)
  api.deleteAllCvDocuments.mockResolvedValue(undefined)
  api.exportCvDocuments.mockResolvedValue({ schema_version: 'cv-documents-export/v1', exported_at: '2026-08-13T10:00:00Z', document_count: 1, documents: [document] })
  api.scoreCvDocument.mockResolvedValue(quality)
  api.snapshotCvVariant.mockResolvedValue(document.variants[0])
})

describe('CV Studio empty state', { timeout: 15_000 }, () => {
  it('welcomes a new owner with import and evidence starts', async () => {
    api.listCvDocuments.mockResolvedValue({ items: [] })
    view()
    expect(await screen.findByText('Let’s start with your CV')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start from your Evidence' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create CV' }))
    await waitFor(() => expect(api.createCvDocument).toHaveBeenCalledWith({ name: 'My CV', seed_evidence_item_ids: [] }))
    expect((await screen.findByLabelText('Document name') as HTMLInputElement).value).toBe('Principal CV')
    expect(api.getCvDocument).toHaveBeenCalledWith('d1')
  })

  it('imports a PDF through a reviewed proposal and opens the new CV', async () => {
    api.listCvDocuments.mockResolvedValue({ items: [] })
    const proposal = {
      filename: 'cv.pdf', import_id: '6b1f1d8e-4a4c-4c49-9b7e-3d5c1a2f0e11', name: 'cv', warnings: ['One line could not be read.'],
      sections: [{ id: 'sec', kind: 'experience', title: 'Experience', visible: true, position: 0, entries: [{ id: 'x', body: 'Did things', position: 0, claim: null }] }],
    }
    api.proposeCvImport.mockResolvedValue(proposal)
    api.acceptCvImport.mockResolvedValue(document)
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Import your CV (PDF/DOCX)' }))
    const dialog = await screen.findByRole('dialog')
    const file = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' })
    fireEvent.change(within(dialog).getByLabelText(/Choose a PDF or DOCX/), { target: { files: [file] } })
    expect(await within(dialog).findByText(/We found 1 section and 1 entry in cv.pdf/)).toBeTruthy()
    expect(within(dialog).getByText(/One line could not be read/)).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('CV name'), { target: { value: 'Imported CV' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create my CV' }))
    await waitFor(() => expect(api.acceptCvImport).toHaveBeenCalledWith({ ...proposal, name: 'Imported CV' }))
    expect(api.proposeCvImport).toHaveBeenCalledWith(file)
    expect((await screen.findByLabelText('Document name') as HTMLInputElement).value).toBe('Principal CV')
  })

  it('gates document loading and sends guests through sign in', () => {
    session.status = 'guest'
    view()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(api.listCvDocuments).not.toHaveBeenCalled()
    expect(session.openAuthDialog).toHaveBeenCalledWith(expect.objectContaining({ to: '/cv-studio' }))
  })
})

describe('CV Studio editor', { timeout: 15_000 }, () => {
  it('edits structured entry fields and bullets, shows them live, then autosaves', async () => {
    view()
    const role = await screen.findByLabelText('Job title')
    fireEvent.change(role, { target: { value: 'Principal Designer' } })
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add highlight' }))
    fireEvent.change(screen.getByLabelText('Highlight 2 for Principal Designer'), { target: { value: 'Grew adoption by 40%.' } })
    const paper = screen.getByTestId('cv-paper')
    expect(within(paper).getByText('Principal Designer')).toBeTruthy()
    expect(within(paper).getByText('Grew adoption by 40%.')).toBeTruthy()
    expect(saveStatus().textContent).toContain('Saving')

    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalledTimes(1), { timeout: 1500 })
    const saved = lastPatch().sections[0].entries[0]
    expect(saved).toMatchObject({
      heading: 'Principal Designer', subheading: null,
      bullets: ['Built accessible systems.', 'Grew adoption by 40%.'],
      body: 'Built accessible systems.\nGrew adoption by 40%.',
    })
    expect(lastPatch().style).toEqual(style)
    await waitFor(() => expect(saveStatus().textContent).toContain('Saved'))
  })

  it('reorders sections from the outline with the keyboard and saves new positions', async () => {
    view()
    const grip = await screen.findByRole('button', { name: /Reorder Skills/ })
    fireEvent.keyDown(grip, { key: 'ArrowUp' })
    const editor = screen.getByLabelText('CV sections')
    await waitFor(() => expect(within(editor).getAllByRole('textbox', { name: /^Section name for/ })[0]).toHaveProperty('value', 'Skills'))
    expect(screen.getByText('Skills moved to position 1 of 2.')).toBeTruthy()
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalled(), { timeout: 1500 })
    expect(lastPatch().sections.map((s: { id: string; position: number }) => [s.id, s.position])).toEqual([['s2', 0], ['s1', 1]])
    fireEvent.click(screen.getByRole('button', { name: 'Move Skills down' }))
    await waitFor(() => expect(within(editor).getAllByRole('textbox', { name: /^Section name for/ })[0]).toHaveProperty('value', 'Experience'))
  })

  it('hides a section from the preview without deleting it', async () => {
    view()
    const paper = await screen.findByTestId('cv-paper')
    expect(within(paper).getByText('Skills')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Skills' }))
    expect(within(paper).queryByText('Skills')).toBeNull()
    expect(screen.getByText('Hidden from your CV')).toBeTruthy()
    await waitFor(() => expect(lastPatch()?.sections[1]).toMatchObject({ id: 's2', visible: false }), { timeout: 1500 })
  })

  it('keeps a newer edit saving when an older autosave response resolves', async () => {
    let resolveFirst!: (value: CvDocument) => void
    let resolveSecond!: (value: CvDocument) => void
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
    expect(saveStatus().textContent).toContain('Saving')
    await act(async () => resolveSecond(document))
    expect(saveStatus().textContent).toContain('Saved')
    expect(api.updateCvDocument).toHaveBeenLastCalledWith('d1', expect.objectContaining({ name: 'Newest edit' }))
    expect((name as HTMLInputElement).value).toBe('Newest edit')
  })

  it('switches between CVs from the hero', async () => {
    const other = { ...document, id: 'd2', name: 'Research CV' }
    api.listCvDocuments.mockResolvedValue({ items: [document, other] })
    api.getCvDocument.mockImplementation((id: string) => Promise.resolve(id === 'd2' ? other : document))
    view()
    fireEvent.change(await screen.findByLabelText('Your CVs'), { target: { value: 'd2' } })
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Research CV'))
    expect(api.getCvDocument).toHaveBeenCalledWith('d2')
  })
})

describe('CV Studio design', { timeout: 15_000 }, () => {
  it('persists a template, font, accent and spacing change and mirrors it in the preview', async () => {
    view()
    fireEvent.click(within(await screen.findByRole('tablist', { name: 'Side panel' })).getByRole('tab', { name: /Design/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Modern Two-Column/ }))
    fireEvent.click(screen.getByRole('radio', { name: /PT Serif/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Roomy' }))
    const paper = screen.getByTestId('cv-paper')
    expect(paper.className).toContain('cvp-paper--two-column')
    expect(paper.style.getPropertyValue('--cvp-accent')).toBe('#075985')
    expect(paper.style.getPropertyValue('--cvp-font')).toContain('PT Serif')
    await waitFor(() => expect(lastPatch()?.style).toEqual({
      template_id: 'modern-two-column', font_id: 'pt-serif', accent_color: '#075985', density: 'spacious', ats_mode: false,
    }), { timeout: 1500 })
  })

  it('turns on ATS-friendly mode, pauses the other controls and saves it', async () => {
    api.getCvDocument.mockResolvedValue({ ...document, style: { ...style, template_id: 'modern-two-column', accent_color: '#B91C1C' } })
    view()
    fireEvent.click(within(await screen.findByRole('tablist', { name: 'Side panel' })).getByRole('tab', { name: /Design/ }))
    const toggle = screen.getByRole('switch', { name: 'ATS-friendly mode' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Paused while ATS-friendly mode is on.')).toBeTruthy()
    expect((screen.getByRole('radio', { name: /PT Serif/ }) as HTMLInputElement).disabled || screen.getByRole('radio', { name: /PT Serif/ }).closest('fieldset')?.disabled).toBe(true)
    const paper = screen.getByTestId('cv-paper')
    expect(paper.className).not.toContain('two-column')
    expect(paper.style.getPropertyValue('--cvp-accent')).toBe('#111827')
    await waitFor(() => expect(lastPatch()?.style).toMatchObject({ ats_mode: true }), { timeout: 1500 })
  })
})

describe('CV Studio quality, exports and versions', { timeout: 15_000 }, () => {
  it('shows the ATS score, plain fixes and tucks detailed checks under Advanced checks', async () => {
    view()
    expect(await screen.findByRole('img', { name: 'ATS score: 72 out of 100' })).toBeTruthy()
    expect(screen.getByText('An entry splits across pages. Shorten it or move it so it fits on one page.')).toBeTruthy()
    expect(api.scoreCvDocument).toHaveBeenCalledWith('d1', { use_model: false, artifact_template: 'ats-essential', artifact_format: 'pdf' })
    const advanced = screen.getByText('Advanced checks').closest('details')!
    expect(within(advanced).getByText('Clear section headings')).toBeTruthy()
    expect(within(advanced).getByText('Needs a fix')).toBeTruthy()
    expect(window.document.body.textContent).not.toMatch(/deterministic|preflight|immutable|canonical/i)
  })

  it('reports the AI review limit while the checks stay available', async () => {
    api.scoreCvDocument
      .mockResolvedValueOnce(quality)
      .mockRejectedValueOnce(new Error('This document has reached its model scoring limit.'))
    view()
    fireEvent.click(await screen.findByRole('button', { name: /Ask AI for a second opinion/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('used all AI reviews')
    expect(screen.getByText('Clear section headings')).toBeTruthy()
  })

  it('exports the PDF with the chosen template and opens the exact server PDF', async () => {
    view()
    fireEvent.click(await screen.findByRole('button', { name: /Export PDF/ }))
    await waitFor(() => expect(api.fetchCvArtifactBlob).toHaveBeenCalledWith('d1', 'ats-essential', 'pdf'))
    await waitFor(() => expect(clickedDownload).toBe('Principal CV.pdf'))
    fireEvent.click(screen.getByRole('button', { name: /View exact PDF/ }))
    expect(await screen.findByTitle('ATS Essential PDF preview')).toBeTruthy()
  })

  it('downloads CV data and deletes all CVs from the overflow menu after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    view()
    let menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Download my CV data/ }))
    await waitFor(() => expect(clickedDownload).toBe('career-workbench-cv-data.json'))
    menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete all CVs/ }))
    await waitFor(() => expect(api.deleteAllCvDocuments).toHaveBeenCalled())
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete all of your CVs'))
  })

  it('saves a named version and restores one after an inline confirmation', async () => {
    api.restoreCvVariant.mockRejectedValueOnce(new Error('Restore unavailable'))
    view()
    fireEvent.change(await screen.findByLabelText('Version name'), { target: { value: 'Design roles' } })
    fireEvent.click(screen.getByRole('button', { name: /Save version/ }))
    await waitFor(() => expect(api.snapshotCvVariant).toHaveBeenCalledWith('d1', 'Design roles'))
    expect(await screen.findByText('Saved “Design roles” to your versions.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore Base' }))
    expect(screen.getByText('Replace your current CV?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(api.restoreCvVariant).toHaveBeenCalledWith('d1', 'v1'))
    expect((await screen.findByRole('alert')).textContent).toContain('Restore unavailable')
  })
})

describe('CV Studio tailoring prefill from Job Discovery', { timeout: 15_000 }, () => {
  it('opens the tailor dialog prefilled from a pending job and clears the marker', async () => {
    writeWorkflowContext({
      targetRole: 'Senior Backend Engineer',
      jobDescription: 'Senior Backend Engineer at Northwind Labs\n\nOwn our platform services.',
      tailorPending: true,
      updatedAt: Date.now(),
    })

    view()

    const dialog = await screen.findByRole('dialog', { name: 'Tailor to a job' })
    expect((within(dialog).getByLabelText('Job title') as HTMLInputElement).value).toBe('Senior Backend Engineer')
    expect((within(dialog).getByLabelText('Job description') as HTMLTextAreaElement).value).toBe(
      'Senior Backend Engineer at Northwind Labs\n\nOwn our platform services.',
    )
    expect(readWorkflowContext()?.tailorPending).toBeFalsy()
  })

  it('does not reopen the tailor dialog after it is dismissed once', async () => {
    writeWorkflowContext({
      targetRole: 'Senior Backend Engineer',
      jobDescription: 'Own our platform services.',
      tailorPending: true,
      updatedAt: Date.now(),
    })

    view()

    const dialog = await screen.findByRole('dialog', { name: 'Tailor to a job' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tailor to a job' })).toBeNull())

    // A later autosave-driven re-render of `draft` must not reopen it.
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'Renamed' } })
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalled(), { timeout: 1500 })
    expect(screen.queryByRole('dialog', { name: 'Tailor to a job' })).toBeNull()
  })

  it('leaves the tailor dialog closed when nothing is pending', async () => {
    view()
    await screen.findByLabelText('Document name')
    expect(screen.queryByRole('dialog', { name: 'Tailor to a job' })).toBeNull()
  })
})
