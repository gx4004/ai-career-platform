import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvStudio } from '#/components/cv-studio/CvStudio'
import type { CvDocument, CvDocumentUpdate } from '#/lib/api/schemas'
import { previewFor } from '#/lib/cv-studio/__tests__/preview.fixture'
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
  previewCvDraft: vi.fn(),
  getTemplateThumbnails: vi.fn((..._args: unknown[]) => Promise.resolve({ thumbnails: [] as unknown[] })),
}))
const session = vi.hoisted(() => ({ status: 'authenticated', openAuthDialog: vi.fn(), user: null as { full_name?: string | null } | null }))
vi.mock('#/lib/api/client', () => api)
vi.mock('#/hooks/useSession', () => ({ useSession: () => session }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={to} {...rest}>{children}</a>,
}))

const experience = {
  id: 's1', kind: 'experience' as const, title: 'Experience', visible: true, position: 0,
  entries: [{
    id: 'e1', evidence_item_id: null, body: 'Built accessible systems.', position: 0,
    heading: 'Lead Designer', subheading: 'Acme', location: 'Berlin', start_date: '2021', end_date: 'Present', bullets: ['Built accessible systems.'],
  }],
}
const skills = { id: 's2', kind: 'skills' as const, title: 'Skills', visible: true, position: 1, entries: [{ id: 'e2', evidence_item_id: null, body: 'Figma, research', position: 0 }] }
const style = { template_id: 'classic' as const, font_id: null, accent_color: '#111827' as const, density: 'normal' as const, ats_mode: false, page_size: 'a4' as const, fit_one_page: false }
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

function view() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CvStudio /></QueryClientProvider>)
}
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
  vi.clearAllMocks(); session.status = 'authenticated'; session.user = null
  window.innerWidth = 1440
  window.sessionStorage.clear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:artifact') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  api.listCvDocuments.mockResolvedValue({ items: [document] })
  api.createCvDocument.mockResolvedValue(document)
  api.listEvidenceItems.mockResolvedValue({ items: [] })
  api.getCvDocument.mockResolvedValue(document)
  api.updateCvDocument.mockImplementation((_id: string, payload: Partial<CvDocument>) => Promise.resolve({ ...document, ...payload, updated_at: '2026-07-12T10:05:00Z' }))
  api.getCvStyleCatalog.mockResolvedValue(styleCatalogFixture)
  api.previewCvDraft.mockImplementation((_id: string, draft: CvDocumentUpdate) => Promise.resolve(previewFor(draft)))
  api.deleteCvDocument.mockResolvedValue(undefined)
  api.deleteAllCvDocuments.mockResolvedValue(undefined)
  api.exportCvDocuments.mockResolvedValue({ schema_version: 'cv-documents-export/v1', exported_at: '2026-08-13T10:00:00Z', document_count: 1, documents: [document] })
  api.scoreCvDocument.mockResolvedValue(quality)
  api.snapshotCvVariant.mockResolvedValue(document.variants[0])
})


describe('CV Studio sign-off round 2 (cv-studio-G04..G14)', { timeout: 15_000 }, () => {
  it('says an empty visible section is left out of the PDF and opens it from the ATS check (cv-studio-G04)', async () => {
    api.scoreCvDocument.mockResolvedValue(passingQuality)
    const projects = { id: 's3', kind: 'projects' as const, title: 'Projects', visible: true, position: 2, entries: [] }
    const withEmpty = { ...document, sections: [experience, skills, projects] }
    api.getCvDocument.mockResolvedValue(withEmpty)
    api.listCvDocuments.mockResolvedValue({ items: [withEmpty] })
    view()
    const checks = await openTool(/^ATS check/)
    expect(await within(checks).findByText(/Projects is empty, so it is left out of your PDF\./)).toBeTruthy()
    fireEvent.click(within(checks).getByRole('button', { name: 'Open Projects' }))
    const editor = await within(panel()).findByRole('group', { name: 'Projects' })
    // The editor says the same thing where the section is filled in.
    expect(within(editor).getByText('No projects yet. Empty sections are left out of your PDF.')).toBeTruthy()
  })

  it('offers to open an empty required section instead of adding a second one (cv-studio-G04)', async () => {
    api.scoreCvDocument.mockResolvedValue({ ...quality, checks: [{ ...quality.checks[0], passed: false }] })
    const emptySkills = { ...document, sections: [experience, { ...skills, entries: [] }] }
    api.getCvDocument.mockResolvedValue(emptySkills)
    api.listCvDocuments.mockResolvedValue({ items: [emptySkills] })
    view()
    const checks = await openTool(/^ATS check/)
    const list = within(checks).getByRole('list', { name: 'Checks' })
    expect(await within(list).findByRole('button', { name: 'Open Skills' })).toBeTruthy()
    expect(within(checks).queryByRole('button', { name: 'Add Skills section' })).toBeNull()
  })

  it('keeps focus on “Your CVs” after the keyboard picks another CV (cv-studio-G05)', async () => {
    const other = { ...document, id: 'd2', name: 'Research CV' }
    api.listCvDocuments.mockResolvedValue({ items: [document, other] })
    api.getCvDocument.mockImplementation((id: string) => Promise.resolve(id === 'd2' ? other : document))
    view()
    const switcher = await screen.findByLabelText('Your CVs')
    switcher.focus()
    fireEvent.change(switcher, { target: { value: 'd2' } })
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Research CV'))
    await waitFor(() => expect(window.document.activeElement).toBe(screen.getByLabelText('Your CVs')))
  })

  it('puts the two-button conflict choice under its text (cv-studio-G06)', async () => {
    api.getCvDocument.mockResolvedValueOnce(document).mockResolvedValue({ ...document, updated_at: '2026-07-12T11:00:00Z' })
    view()
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'Renamed CV' } })
    const title = await screen.findByText('This CV was saved somewhere else', {}, { timeout: 3000 })
    expect(title.closest('.kit-notice')?.getAttribute('data-action-placement')).toBe('below')
  })

  it('says which CV was deleted once another one opens in its place (cv-studio-G09)', async () => {
    const other = { ...document, id: 'd2', name: 'Research CV' }
    api.listCvDocuments.mockResolvedValueOnce({ items: [document, other] }).mockResolvedValue({ items: [other] })
    api.getCvDocument.mockImplementation((id: string) => Promise.resolve(id === 'd2' ? other : document))
    view()
    const menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete this CV/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete CV' }))
    expect(await screen.findByText('Deleted “Principal CV”.')).toBeTruthy()
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Research CV'))
    expect(screen.getByText('Deleted “Principal CV”.')).toBeTruthy()
  })

  it('says every CV was deleted above the empty state (cv-studio-G09)', async () => {
    api.listCvDocuments.mockResolvedValueOnce({ items: [document] }).mockResolvedValue({ items: [] })
    view()
    const menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete all CVs/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete all CVs' }))
    expect(await screen.findByText('Let’s start with your CV')).toBeTruthy()
    expect(screen.getByText('All your CVs were deleted.')).toBeTruthy()
  })

  it('retries a failed load without asking for a CV it has no id for (cv-studio-G10)', async () => {
    api.listCvDocuments.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ items: [document] })
    view()
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }))
    expect(await screen.findByLabelText('Document name')).toBeTruthy()
    expect(api.getCvDocument).not.toHaveBeenCalledWith(null)
    expect(api.getCvDocument.mock.calls.every(([id]) => typeof id === 'string')).toBe(true)
  })

  it('puts Remove section in the editor foot on a phone too, never beside All sections (cv-studio-G11)', async () => {
    window.innerWidth = 320
    view()
    await screen.findByTestId('cv-pages')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Experience' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Experience' })
    const remove = within(sheet).getByRole('button', { name: 'Remove section' })
    expect(remove.closest('.cvs-editor__foot')).not.toBeNull()
    expect(within(sheet).getByRole('button', { name: 'All sections' }).closest('.cvs-editor__foot')).toBeNull()
  })

  it('does not name a single-entry section a third time inside its phone sheet (RSR-04)', async () => {
    window.innerWidth = 320
    view()
    await screen.findByTestId('cv-pages')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Skills' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Skills' })
    expect(within(sheet).getByRole('textbox', { name: 'Skills text' })).toBeTruthy()
    expect(within(sheet).queryByRole('heading', { name: 'Skills' })).toBeNull()
  })

  it('labels the highlights like a field, a group over textareas that keep their own names (cv-studio-G14)', async () => {
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Experience' }))
    const group = await within(panel()).findByRole('group', { name: 'Highlights' })
    expect(within(group).getByText('Highlights').className).toContain('kit-field__label')
    expect(within(group).getByRole('textbox', { name: 'Highlight 1 for Lead Designer' })).toBeTruthy()
    expect(within(panel()).queryByRole('heading', { name: 'Highlights' })).toBeNull()
  })
})


describe('CV Studio sign-off round 2 gaps (cv-studio-G17)', { timeout: 15_000 }, () => {
  // The confirm dialog's trigger is unmounted while the next CV (or the empty state) loads, so focus fell to <body>.
  it('returns focus to More options once another CV opens after Delete this CV', async () => {
    const other = { ...document, id: 'd2', name: 'Research CV' }
    api.listCvDocuments.mockResolvedValueOnce({ items: [document, other] }).mockResolvedValue({ items: [other] })
    api.getCvDocument.mockImplementation((id: string) => Promise.resolve(id === 'd2' ? other : document))
    view()
    const menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete this CV/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete CV' }))
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Research CV'))
    await waitFor(() => expect(window.document.activeElement).toBe(screen.getByRole('button', { name: 'More options' })))
    // The confirm dialog never comes back for the CV that opened in its place.
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('puts focus on Import your CV when Delete all CVs leaves the empty state', async () => {
    api.listCvDocuments.mockResolvedValueOnce({ items: [document] }).mockResolvedValue({ items: [] })
    view()
    const menu = await openMenu('More options')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete all CVs/ }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete all CVs' }))
    expect(await screen.findByText('Let’s start with your CV')).toBeTruthy()
    await waitFor(() => expect(window.document.activeElement).toBe(screen.getByRole('button', { name: /Import your CV/ })))
  })

  it('does not move focus to the empty state on a first visit with no CVs', async () => {
    api.listCvDocuments.mockResolvedValue({ items: [] })
    view()
    expect(await screen.findByText('Let’s start with your CV')).toBeTruthy()
    expect(window.document.activeElement).toBe(window.document.body)
  })
})
