import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvStudio } from '#/components/cv-studio/CvStudio'
import type { CvDocument } from '#/lib/api/schemas'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import { styleCatalogFixture } from '#/lib/cv-studio/__tests__/styleCatalog.fixture'

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
  tailoring_model_runs: 0, tailoring_model_run_limit: 10,
  variants: [{ id: 'v1', name: 'Base', target_role: null, sections: [experience], created_at: '2026-07-12T10:00:00Z' }],
}
const quality = {
  schema_version: 'cv-quality/v3',
  checks: [
    { id: 'sections', label: 'Clear section headings', passed: true, detail: 'Application systems look for standard sections.', fix: 'Add Experience and Skills.' },
    { id: 'page_breaks', label: 'Tidy page breaks', passed: false, detail: 'Each section starts with its first entry.', fix: 'An entry splits across pages. Shorten it or move it so it fits on one page.' },
    { id: 'layout', label: 'Single-column layout', passed: false, detail: 'Single-column layouts read in order.', fix: 'Your template uses two columns.' },
  ],
}
const passingQuality = { ...quality, checks: quality.checks.map((check) => ({ ...check, passed: true })) }
let clickedDownload = ''

function view() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CvStudio /></QueryClientProvider>)
}
const saveStatus = () => screen.getByTestId('save-status')
const lastPatch = () => api.updateCvDocument.mock.calls.at(-1)?.[1]
const paper = () => screen.getByTestId('cv-paper')
const panel = () => screen.getByRole('complementary')
/** Open a studio tool (Sections, Design, ATS check, Versions) from the toolbar. */
async function openTool(name: RegExp) {
  const toolbar = await screen.findByRole('navigation', { name: 'Studio tools' })
  fireEvent.click(within(toolbar).getByRole('button', { name }))
  return panel()
}
async function openMenu(name: string) {
  const trigger = await screen.findByRole('button', { name })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  return screen.findByRole('menu')
}

beforeEach(() => {
  vi.clearAllMocks(); session.status = 'authenticated'; clickedDownload = ''
  window.innerWidth = 1440
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
  api.getCvStyleCatalog.mockResolvedValue(styleCatalogFixture)
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

describe('CV Studio paper and section editor', { timeout: 15_000 }, () => {
  it('opens a section’s editor from the paper, mirrors edits live, then autosaves', async () => {
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Experience' }))
    expect(within(panel()).getByRole('heading', { name: 'Edit Experience' })).toBeTruthy()
    fireEvent.change(within(panel()).getByLabelText('Job title'), { target: { value: 'Principal Designer' } })
    fireEvent.change(within(panel()).getByLabelText('Company'), { target: { value: '' } })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add highlight' }))
    fireEvent.change(within(panel()).getByLabelText('Highlight 2 for Principal Designer'), { target: { value: 'Grew adoption by 40%.' } })
    expect(within(paper()).getByText('Principal Designer')).toBeTruthy()
    expect(within(paper()).getByText('Grew adoption by 40%.')).toBeTruthy()
    expect(saveStatus().textContent).toContain('Saving')

    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalledTimes(1), { timeout: 1500 })
    expect(lastPatch().sections[0].entries[0]).toMatchObject({
      heading: 'Principal Designer', subheading: null,
      bullets: ['Built accessible systems.', 'Grew adoption by 40%.'],
      body: 'Built accessible systems.\nGrew adoption by 40%.',
    })
    expect(lastPatch().style).toEqual(style)
    await waitFor(() => expect(saveStatus().textContent).toContain('Saved'))
  })

  it('opens a section with the keyboard and goes back to the sections list', async () => {
    view()
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Edit Skills' }), { key: 'Enter' })
    expect(within(panel()).getByLabelText('Skills text')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'All sections' }))
    expect(within(panel()).getByRole('list', { name: 'Sections in your CV' })).toBeTruthy()
  })

  it('reorders, hides and adds sections from the sections list', async () => {
    view()
    await screen.findByTestId('cv-paper')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Move Skills up' }))
    expect(screen.getByText('Skills moved to position 1 of 2.')).toBeTruthy()
    expect(within(paper()).getAllByRole('button').map((section) => section.getAttribute('aria-label'))).toEqual(['Edit Skills', 'Edit Experience'])
    fireEvent.click(within(panel()).getByRole('button', { name: 'Hide Skills' }))
    expect(within(paper()).queryByText('Skills')).toBeNull()
    await waitFor(() => expect(lastPatch()?.sections.map((s: { id: string; position: number; visible: boolean }) => [s.id, s.position, s.visible]))
      .toEqual([['s2', 0, false], ['s1', 1, true]]), { timeout: 1500 })

    const menu = await openMenu('Add section')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Education' }))
    expect(within(panel()).getByRole('heading', { name: 'Edit Education' })).toBeTruthy()
    expect(within(paper()).getByRole('button', { name: 'Edit Education' }).getAttribute('aria-pressed')).toBe('true')
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
    expect(within(paper()).getByText('Newest edit')).toBeTruthy()
  })

  it('updates the CV list from the autosave response without refetching every CV', async () => {
    const other = { ...document, id: 'd2', name: 'Research CV' }
    api.listCvDocuments.mockResolvedValue({ items: [document, other] })
    view()
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'Renamed CV' } })
    await waitFor(() => expect(saveStatus().textContent).toContain('Saved'), { timeout: 1500 })
    const switcher = screen.getByLabelText('Your CVs')
    expect(within(switcher).getByRole('option', { name: 'Renamed CV' })).toBeTruthy()
    expect(within(switcher).getByRole('option', { name: 'Research CV' })).toBeTruthy()
    expect(api.listCvDocuments).toHaveBeenCalledTimes(1)
  })

  it('opens a section’s editor in a bottom sheet on a phone', async () => {
    window.innerWidth = 375
    view()
    await screen.findByTestId('cv-paper')
    expect(screen.queryByRole('complementary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Skills' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Skills' })
    fireEvent.change(within(sheet).getByLabelText('Skills text'), { target: { value: 'Figma, research, SQL' } })
    expect(within(paper()).getByText('Figma, research, SQL')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close panel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('switches between CVs', async () => {
    const other = { ...document, id: 'd2', name: 'Research CV' }
    api.listCvDocuments.mockResolvedValue({ items: [document, other] })
    api.getCvDocument.mockImplementation((id: string) => Promise.resolve(id === 'd2' ? other : document))
    view()
    fireEvent.change(await screen.findByLabelText('Your CVs'), { target: { value: 'd2' } })
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Research CV'))
    expect(api.getCvDocument).toHaveBeenCalledWith('d2')
  })
})

describe('CV Studio design panel', { timeout: 15_000 }, () => {
  it('persists a template, font, accent and spacing change and mirrors it on the paper', async () => {
    view()
    const design = await openTool(/^Design/)
    fireEvent.click(within(design).getByRole('radio', { name: /Modern Two-Column/ }))
    fireEvent.click(within(design).getByRole('radio', { name: /PT Serif/ }))
    fireEvent.click(within(design).getByRole('radio', { name: 'Ocean' }))
    fireEvent.click(within(design).getByRole('radio', { name: 'Roomy' }))
    expect(paper().className).toContain('cvp-paper--two-column')
    expect(paper().style.getPropertyValue('--cvp-accent')).toBe('#075985')
    expect(paper().style.getPropertyValue('--cvp-font')).toContain('PT Serif')
    await waitFor(() => expect(lastPatch()?.style).toEqual({
      template_id: 'modern-two-column', font_id: 'pt-serif', accent_color: '#075985', density: 'spacious', ats_mode: false,
    }), { timeout: 1500 })
  })

  it('shows the names the style catalog provides', async () => {
    api.getCvStyleCatalog.mockResolvedValue({
      ...styleCatalogFixture,
      templates: styleCatalogFixture.templates.map((template) => template.id === 'ats-essential' ? { ...template, name: 'Catalog Plain', description: 'Named by the server.' } : template),
      palette: [{ value: '#111827', name: 'Graphite' }],
      densities: [{ id: 'normal', name: 'Airy' }],
    })
    view()
    const design = await openTool(/^Design/)
    expect(within(design).getByRole('radio', { name: /Catalog Plain/ })).toBeTruthy()
    expect(within(design).getByText('Named by the server.')).toBeTruthy()
    expect(within(design).getByRole('radio', { name: 'Graphite' })).toBeTruthy()
    expect(within(design).getByRole('radio', { name: 'Airy' })).toBeTruthy()
    expect(within(design).queryByRole('radio', { name: 'Roomy' })).toBeNull()
  })

  it('asks to try again when the style catalog cannot load', async () => {
    api.getCvStyleCatalog.mockRejectedValueOnce(new Error('offline'))
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('cv-paper')).toBeTruthy()
  })

  it('turns on ATS-friendly mode, pauses the other controls and saves it', async () => {
    api.getCvDocument.mockResolvedValue({ ...document, style: { ...style, template_id: 'modern-two-column', accent_color: '#B91C1C' } })
    view()
    const design = await openTool(/^Design/)
    const toggle = within(design).getByRole('switch', { name: 'ATS-friendly mode' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(within(design).getByText('Paused while ATS-friendly mode is on.')).toBeTruthy()
    expect(within(design).getByRole('radio', { name: /PT Serif/ }).closest('fieldset')?.disabled).toBe(true)
    expect(paper().className).not.toContain('two-column')
    expect(paper().style.getPropertyValue('--cvp-accent')).toBe('#111827')
    await waitFor(() => expect(lastPatch()?.style).toMatchObject({ ats_mode: true }), { timeout: 1500 })
  })
})

describe('CV Studio ATS check, exports and versions', { timeout: 15_000 }, () => {
  it('summarises failing checks in the toolbar and lists their fixes, never a score', async () => {
    view()
    const toolbar = await screen.findByRole('navigation', { name: 'Studio tools' })
    expect(await within(toolbar).findByText('2 to fix')).toBeTruthy()
    expect(api.scoreCvDocument).toHaveBeenCalledWith('d1')
    const checks = await openTool(/^ATS check/)
    const list = within(checks).getByRole('list', { name: 'Checks' })
    expect(within(list).getByText('Clear section headings')).toBeTruthy()
    expect(within(list).getByText('An entry splits across pages. Shorten it or move it so it fits on one page.')).toBeTruthy()
    fireEvent.click(within(checks).getByRole('button', { name: /Turn on ATS-friendly mode/ }))
    expect(within(panel()).getByRole('switch', { name: 'ATS-friendly mode' }).getAttribute('aria-checked')).toBe('true')
    expect(window.document.body.textContent).not.toMatch(/\/100|ATS score|second opinion|AI review/i)
    expect(window.document.body.textContent).not.toMatch(/deterministic|preflight|immutable|canonical/i)
  })

  it('says every check passes when the CV is clean', async () => {
    api.scoreCvDocument.mockResolvedValue(passingQuality)
    view()
    expect(await screen.findByText('All 3 checks pass')).toBeTruthy()
    const checks = await openTool(/^ATS check/)
    expect(within(checks).queryByRole('button', { name: /Turn on ATS-friendly mode/ })).toBeNull()
  })

  it('exports the saved PDF and opens the exact server PDF', async () => {
    view()
    fireEvent.click(await screen.findByRole('button', { name: /Export PDF/ }))
    await waitFor(() => expect(api.fetchCvArtifactBlob).toHaveBeenCalledWith('d1', 'pdf'))
    await waitFor(() => expect(clickedDownload).toBe('Principal CV.pdf'))
    fireEvent.click(screen.getByRole('button', { name: /View exact PDF/ }))
    expect(await screen.findByTitle('ATS Essential PDF preview')).toBeTruthy()
  })

  it('exports DOCX and CV data and deletes all CVs from the overflow menu after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    view()
    let menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Export DOCX/ }))
    await waitFor(() => expect(clickedDownload).toBe('Principal CV.docx'))
    menu = await openMenu('More options')
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
    const versions = await openTool(/^Versions/)
    fireEvent.change(within(versions).getByLabelText('Version name'), { target: { value: 'Design roles' } })
    fireEvent.click(within(versions).getByRole('button', { name: /Save version/ }))
    await waitFor(() => expect(api.snapshotCvVariant).toHaveBeenCalledWith('d1', 'Design roles'))
    expect(await screen.findByText('Saved “Design roles” to your versions.')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Restore Base' }))
    expect(within(panel()).getByText('Replace your current CV? We’ll keep it in your versions.')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Restore' }))
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
