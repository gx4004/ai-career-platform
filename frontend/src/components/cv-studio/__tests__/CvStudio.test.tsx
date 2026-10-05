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
  header: { name: null, headline: null, email: null, phone: null, location: null, links: [] },
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
  const tabs = await screen.findByRole('tablist', { name: 'Studio tools' })
  fireEvent.click(within(tabs).getByRole('tab', { name }))
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

  it('reorders and removes a highlight with its own inline buttons', async () => {
    api.getCvDocument.mockResolvedValue({
      ...document,
      sections: [{ ...experience, entries: [{ ...experience.entries[0], bullets: ['First.', 'Second.'] }] }, skills],
    })
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Experience' }))
    const first = within(panel()).getByRole('button', { name: 'Move highlight 1 up' })
    expect((first as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(panel()).getByRole('button', { name: 'Move highlight 1 down' }))
    expect((within(panel()).getByLabelText(/Highlight 1 for/) as HTMLTextAreaElement).value).toBe('Second.')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove highlight 1' }))
    expect(within(panel()).queryByLabelText('Highlight 2 for Lead Designer')).toBeNull()
    expect((within(panel()).getByLabelText(/Highlight 1 for/) as HTMLTextAreaElement).value).toBe('First.')
  })

  it('says when autosave fails and saves again on Try again', async () => {
    view()
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'Renamed CV' } })
    api.updateCvDocument.mockRejectedValueOnce(new Error('save failed'))
    const alert = await screen.findByRole('alert', {}, { timeout: 2500 })
    expect(alert.textContent).toContain('couldn’t save your latest changes')
    expect(alert.textContent).not.toContain('save failed')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(saveStatus().textContent).toContain('Saved'), { timeout: 2500 })
    expect(screen.queryByRole('alert')).toBeNull()
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
    expect(within(paper()).getAllByRole('button').map((section) => section.getAttribute('aria-label'))).toEqual(['Edit header', 'Edit Skills', 'Edit Experience'])
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

  it('keeps one tool selected as a tab on a phone and opens its sheet from the tab', async () => {
    window.innerWidth = 375
    view()
    await screen.findByTestId('cv-paper')
    const tabs = screen.getByRole('tablist', { name: 'Studio tools' })
    expect(within(tabs).getByRole('tab', { name: 'Sections' }).getAttribute('aria-selected')).toBe('true')
    expect(within(tabs).getByRole('tab', { name: /^Design/ }).getAttribute('aria-selected')).toBe('false')

    fireEvent.click(within(tabs).getByRole('tab', { name: /^Design/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Design' })
    expect(within(sheet).getByRole('switch', { name: 'ATS-friendly mode' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close panel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // The tool stays selected after the sheet closes; tapping it again reopens the sheet.
    const design = within(screen.getByRole('tablist', { name: 'Studio tools' })).getByRole('tab', { name: /^Design/ })
    expect(design.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(design)
    expect(await screen.findByRole('dialog', { name: 'Design' })).toBeTruthy()
  })

  it('asks before removing a section that has entries', async () => {
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Skills' }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove section' }))
    let confirm = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(api.updateCvDocument).not.toHaveBeenCalled()

    fireEvent.click(within(panel()).getByRole('button', { name: 'Remove section' }))
    confirm = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove section' }))
    await waitFor(() => expect(lastPatch()?.sections.map((item: { id: string }) => item.id)).toEqual(['s1']), { timeout: 1500 })
    expect(within(panel()).getByRole('list', { name: 'Sections in your CV' })).toBeTruthy()
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

describe('CV Studio document header', { timeout: 15_000 }, () => {
  const header = {
    name: 'Ada Lovelace', headline: 'Analyst and Mathematician', email: 'ada@example.com', phone: '+44 20 7946 0958',
    location: 'London, UK', links: ['https://github.com/ada'],
  }
  const withHeader = () => {
    const doc = { ...document, header }
    api.listCvDocuments.mockResolvedValue({ items: [doc] })
    api.getCvDocument.mockResolvedValue(doc)
  }

  it('leaves the paper as it was while the header is empty: the title is the document name', async () => {
    view()
    await screen.findByTestId('cv-paper')
    const shown = within(paper()).getByTestId('cv-header')
    expect(within(shown).getByRole('heading', { name: 'Principal CV' })).toBeTruthy()
    expect(shown.className).not.toContain('cvp-header--detailed')
    expect(shown.querySelector('.cvp-headline, .cvp-contact')).toBeNull()
  })

  it('draws name, headline and the contact line like the export, links blue', async () => {
    withHeader()
    view()
    await screen.findByTestId('cv-paper')
    const shown = within(paper()).getByTestId('cv-header')
    expect(within(shown).getByRole('heading', { name: 'Ada Lovelace' })).toBeTruthy()
    expect(shown.querySelector('.cvp-headline')?.textContent).toBe('Analyst and Mathematician')
    expect(shown.querySelector('.cvp-contact')?.textContent).toBe('ada@example.com | +44 20 7946 0958 | London, UK | https://github.com/ada')
    expect(shown.querySelector('.cvp-link')?.textContent).toBe('https://github.com/ada')
  })

  it('stacks the contact items in a two-column template, as the export does', async () => {
    withHeader()
    const doc = { ...document, header, style: { ...style, template_id: 'modern-two-column' as const } }
    api.listCvDocuments.mockResolvedValue({ items: [doc] })
    api.getCvDocument.mockResolvedValue(doc)
    view()
    await screen.findByTestId('cv-paper')
    const contact = within(paper()).getByTestId('cv-header').querySelector('.cvp-contact')!
    expect(contact.querySelectorAll('br')).toHaveLength(3)
    expect(contact.textContent).not.toContain('|')
  })

  it('opens the header editor from the paper and from the Header row, updates live and autosaves', async () => {
    withHeader()
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit header' }))
    expect(within(panel()).getByRole('heading', { name: 'Edit header' })).toBeTruthy()
    expect(within(paper()).getByRole('button', { name: 'Edit header' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(within(panel()).getByLabelText(/^Headline/), { target: { value: 'Countess of Computing' } })
    expect(within(paper()).getByTestId('cv-header').querySelector('.cvp-headline')?.textContent).toBe('Countess of Computing')
    fireEvent.change(within(panel()).getByLabelText(/^Links/), { target: { value: 'https://example.com/a\nhttps://example.com/b' } })
    expect(within(paper()).getByTestId('cv-header').querySelectorAll('.cvp-link')).toHaveLength(2)
    await waitFor(() => expect(lastPatch()?.header).toEqual({
      ...header, headline: 'Countess of Computing', links: ['https://example.com/a', 'https://example.com/b'],
    }), { timeout: 1500 })
  })

  it('removes a cleared field from the paper and saves it as null', async () => {
    withHeader()
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit header' }))
    fireEvent.change(within(panel()).getByLabelText(/^Email/), { target: { value: '' } })
    expect(within(paper()).getByTestId('cv-header').querySelector('.cvp-contact')?.textContent).toBe('+44 20 7946 0958 | London, UK | https://github.com/ada')
    fireEvent.change(within(panel()).getByLabelText(/^Name/), { target: { value: '' } })
    expect(within(paper()).getByRole('heading', { name: 'Principal CV' })).toBeTruthy()
    await waitFor(() => expect(lastPatch()?.header).toMatchObject({ name: null, email: null }), { timeout: 1500 })
  })

  it('lists the header first in Sections and opens its editor there', async () => {
    withHeader()
    view()
    const list = await within(await screen.findByRole('complementary')).findByRole('list', { name: 'Sections in your CV' })
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('Header')
    expect(within(list).getAllByRole('listitem')[0].textContent).toContain('5 details')
    fireEvent.click(within(list).getByRole('button', { name: 'Header' }))
    expect(within(panel()).getByLabelText(/^Name/)).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'All sections' }))
    expect(within(panel()).queryByLabelText(/^Name/)).toBeNull()
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
    const retry = await screen.findByRole('button', { name: 'Try again' })
    // The button shows a spinner (and ignores clicks) while the other requests are still in flight.
    await waitFor(() => expect(retry.getAttribute('aria-busy')).toBeNull())
    fireEvent.click(retry)
    expect(await screen.findByTestId('cv-paper')).toBeTruthy()
  })

  it('turns on ATS-friendly mode, pauses the other controls and saves it', async () => {
    api.getCvDocument.mockResolvedValue({ ...document, style: { ...style, template_id: 'modern-two-column', accent_color: '#B91C1C' } })
    view()
    const design = await openTool(/^Design/)
    const toggle = within(design).getByRole('switch', { name: 'ATS-friendly mode' })
    fireEvent.click(toggle)
    expect((toggle as HTMLInputElement).checked).toBe(true)
    expect(within(design).getByText('Paused while ATS-friendly mode is on.')).toBeTruthy()
    expect((within(design).getByRole('radio', { name: /PT Serif/ }) as HTMLInputElement).disabled).toBe(true)
    expect(paper().className).not.toContain('two-column')
    expect(paper().style.getPropertyValue('--cvp-accent')).toBe('#111827')
    await waitFor(() => expect(lastPatch()?.style).toMatchObject({ ats_mode: true }), { timeout: 1500 })
  })
})

describe('CV Studio ATS check, exports and versions', { timeout: 15_000 }, () => {
  it('summarises failing checks on the tab and lists their fixes, never a score', async () => {
    view()
    const tabs = await screen.findByRole('tablist', { name: 'Studio tools' })
    expect(await within(tabs).findByRole('tab', { name: 'ATS check 2 to fix' })).toBeTruthy()
    expect(api.scoreCvDocument).toHaveBeenCalledWith('d1')
    const checks = await openTool(/^ATS check/)
    const list = within(checks).getByRole('list', { name: 'Checks' })
    expect(within(list).getByText('Clear section headings')).toBeTruthy()
    expect(within(list).getByText('An entry splits across pages. Shorten it or move it so it fits on one page.')).toBeTruthy()
    fireEvent.click(within(checks).getByRole('button', { name: /Turn on ATS-friendly mode/ }))
    expect((within(panel()).getByRole('switch', { name: 'ATS-friendly mode' }) as HTMLInputElement).checked).toBe(true)
    expect(window.document.body.textContent).not.toMatch(/\/100|ATS score|second opinion|AI review/i)
    expect(window.document.body.textContent).not.toMatch(/deterministic|preflight|immutable|canonical/i)
  })

  it('offers to show a hidden required section and to add a missing one', async () => {
    const failingSections = { ...quality, checks: [{ ...quality.checks[0], passed: false }] }
    api.scoreCvDocument.mockResolvedValue(failingSections)
    const hiddenSkills = { ...document, sections: [experience, { ...skills, visible: false }] }
    api.getCvDocument.mockResolvedValue(hiddenSkills)
    api.listCvDocuments.mockResolvedValue({ items: [hiddenSkills] })
    view()
    let checks = await openTool(/^ATS check/)
    expect(within(checks).queryByRole('button', { name: 'Add Skills section' })).toBeNull()
    fireEvent.click(await within(checks).findByRole('button', { name: 'Show Skills section' }))
    await waitFor(() => expect(lastPatch().sections.find((s: { kind: string }) => s.kind === 'skills').visible).toBe(true))
    expect(lastPatch().sections).toHaveLength(2)
  })

  it('adds a missing required section from the ATS check and opens its editor', async () => {
    api.scoreCvDocument.mockResolvedValue({ ...quality, checks: [{ ...quality.checks[0], passed: false }] })
    const noSkills = { ...document, sections: [experience] }
    api.getCvDocument.mockResolvedValue(noSkills)
    api.listCvDocuments.mockResolvedValue({ items: [noSkills] })
    view()
    const checks = await openTool(/^ATS check/)
    fireEvent.click(await within(checks).findByRole('button', { name: 'Add Skills section' }))
    await waitFor(() => expect(lastPatch().sections.map((s: { kind: string }) => s.kind)).toEqual(['experience', 'skills']))
    expect(await within(panel()).findByText('Edit Skills')).toBeTruthy()
  })

  it('starts a new CV from the overflow menu', async () => {
    view()
    expect(screen.queryByRole('button', { name: /New CV/ })).toBeNull()
    const menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Start from your Evidence/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('says every check passes when the CV is clean', async () => {
    api.scoreCvDocument.mockResolvedValue(passingQuality)
    view()
    const checks = await openTool(/^ATS check/)
    expect(await within(checks).findByText('All 3 checks pass')).toBeTruthy()
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
    view()
    let menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Export DOCX/ }))
    await waitFor(() => expect(clickedDownload).toBe('Principal CV.docx'))
    menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Download my CV data/ }))
    await waitFor(() => expect(clickedDownload).toBe('career-workbench-cv-data.json'))
    menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete all CVs/ }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByText(/Delete all of your CVs/)).toBeTruthy()
    expect(api.deleteAllCvDocuments).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete all CVs' }))
    await waitFor(() => expect(api.deleteAllCvDocuments).toHaveBeenCalled())
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
