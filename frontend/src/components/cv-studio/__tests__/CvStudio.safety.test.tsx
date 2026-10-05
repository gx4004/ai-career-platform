import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CvStudio } from '#/components/cv-studio/CvStudio'
import { savedAgo } from '#/components/cv-studio/CvSaveStatus'
import type { CvDocument } from '#/lib/api/schemas'
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
const tailoredExperience = {
  ...experience,
  entries: [{ ...experience.entries[0], bullets: ['Built accessible systems for hiring teams.'], body: 'Built accessible systems for hiring teams.' }],
}
const skills = { id: 's2', kind: 'skills' as const, title: 'Skills', visible: true, position: 1, entries: [{ id: 'e2', evidence_item_id: null, body: 'Figma, research', position: 0 }] }
const style = { template_id: 'ats-essential' as const, font_id: 'lato' as const, accent_color: '#111827' as const, density: 'normal' as const, ats_mode: false }
const header = { name: null, headline: null, email: null, phone: null, location: null, links: [] }
const document: CvDocument = {
  id: 'd1', name: 'Principal CV', sections: [experience], style, header,
  created_at: '2026-07-12T10:00:00Z', updated_at: '2026-07-12T10:00:00Z',
  tailoring_model_runs: 0, tailoring_model_run_limit: 10,
  variants: [
    { id: 'v1', name: 'Base', target_role: null, sections: [experience], created_at: '2026-07-12T10:00:00Z' },
    { id: 'v2', name: 'Platform roles', target_role: 'Staff Engineer', sections: [tailoredExperience], created_at: '2026-07-13T10:00:00Z' },
  ],
}
const quality = {
  schema_version: 'cv-quality/v3',
  checks: [
    { id: 'sections', label: 'Clear section headings', passed: true, detail: 'Application systems look for standard sections.', fix: 'Add Experience and Skills.' },
    { id: 'page_breaks', label: 'Tidy page breaks', passed: false, detail: 'Each section starts with its first entry.', fix: 'An entry splits across pages.' },
    { id: 'layout', label: 'Single-column layout', passed: false, detail: 'Single-column layouts read in order.', fix: 'Your template uses two columns.' },
  ],
}
let clickedDownload = ''

function view() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><CvStudio /></QueryClientProvider>)
}
const saveStatus = () => screen.getByTestId('save-status')
const lastPatch = () => api.updateCvDocument.mock.calls.at(-1)?.[1]
const panel = () => screen.getByRole('complementary')
async function openTool(name: RegExp) {
  const tabs = await screen.findByRole('tablist', { name: 'Studio tools' })
  fireEvent.click(within(tabs).getByRole('tab', { name }))
  return panel()
}

beforeEach(() => {
  vi.clearAllMocks(); session.status = 'authenticated'; clickedDownload = ''
  window.innerWidth = 1440
  window.sessionStorage.clear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:artifact') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clickedDownload = this.download })
  api.listCvDocuments.mockResolvedValue({ items: [document] })
  api.getCvDocument.mockResolvedValue(document)
  api.updateCvDocument.mockImplementation((_id: string, payload: Partial<CvDocument>) => Promise.resolve({ ...document, ...payload, updated_at: '2026-07-12T10:05:00Z' }))
  api.getCvStyleCatalog.mockResolvedValue(styleCatalogFixture)
  api.listEvidenceItems.mockResolvedValue({ items: [] })
  api.scoreCvDocument.mockResolvedValue(quality)
  api.snapshotCvVariant.mockResolvedValue(document.variants[0])
})

afterEach(() => { vi.unstubAllGlobals() })

describe('the pending edit survives leaving the studio (cv-studio-d04)', () => {
  it('saves a pending edit when the studio closes inside the autosave window', async () => {
    const { unmount } = view()
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'Quick change' } })
    expect(api.updateCvDocument).not.toHaveBeenCalled()
    unmount()
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'Quick change' })))
  })

  it('sends a pending edit as a keepalive request when the page is being closed', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ...document, name: 'Quick change' }) }))
    vi.stubGlobal('fetch', fetchMock)
    view()
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'Quick change' } })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/cv-documents/d1')
    expect(init).toMatchObject({ method: 'PATCH', keepalive: true, credentials: 'include' })
    expect(JSON.parse(init.body as string)).toMatchObject({ name: 'Quick change' })
    // The debounce timer is spent: the edit is not sent a second time.
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 800)) })
    expect(api.updateCvDocument).not.toHaveBeenCalled()
  })
})

describe('two tabs never overwrite each other silently (cv-studio-d03)', () => {
  const elsewhere = { ...document, name: 'Edited in the other tab', updated_at: '2026-07-12T11:00:00Z' }

  it('stops autosaving and offers the newer version when the server copy moved on', async () => {
    view()
    const name = await screen.findByLabelText('Document name')
    api.getCvDocument.mockResolvedValue(elsewhere)
    fireEvent.change(name, { target: { value: 'My edit' } })
    expect(await screen.findByText('This CV was saved somewhere else', {}, { timeout: 2500 })).toBeTruthy()
    expect(api.updateCvDocument).not.toHaveBeenCalled()
    expect(saveStatus().textContent).toContain('Newer version')

    fireEvent.click(screen.getByRole('button', { name: 'Reload newer version' }))
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Edited in the other tab'))
    expect(screen.queryByText('This CV was saved somewhere else')).toBeNull()
    expect(api.updateCvDocument).not.toHaveBeenCalled()
    expect(saveStatus().textContent).toContain('Saved')
  })

  it('saves over the newer version only when told to keep this copy', async () => {
    view()
    const name = await screen.findByLabelText('Document name')
    api.getCvDocument.mockResolvedValue(elsewhere)
    fireEvent.change(name, { target: { value: 'My edit' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my version' }, { timeout: 2500 }))
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'My edit' })))
    await waitFor(() => expect(saveStatus().textContent).toContain('Saved'))
  })

  it('treats a 409 from the server as the same conflict', async () => {
    const { ApiError } = await import('#/lib/api/errors')
    api.updateCvDocument.mockRejectedValueOnce(new ApiError('Conflict', 409))
    view()
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'My edit' } })
    expect(await screen.findByText('This CV was saved somewhere else', {}, { timeout: 2500 })).toBeTruthy()
  })

  it('says a newer version exists when the tab gets focus back with nothing unsaved', async () => {
    view()
    await screen.findByLabelText('Document name')
    api.getCvDocument.mockResolvedValue(elsewhere)
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(await screen.findByText('A newer version of this CV is available')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reload newer version' }))
    await waitFor(() => expect((screen.getByLabelText('Document name') as HTMLInputElement).value).toBe('Edited in the other tab'))
    expect(screen.queryByRole('button', { name: 'Keep my version' })).toBeNull()
  })

  it('does not mistake its own saves for another tab', async () => {
    view()
    const name = await screen.findByLabelText('Document name')
    fireEvent.change(name, { target: { value: 'One' } })
    await waitFor(() => expect(saveStatus().textContent).toContain('Saved'), { timeout: 2500 })
    // The server now holds this tab's save: asking again must not raise a conflict.
    api.getCvDocument.mockResolvedValue({ ...document, name: 'One', updated_at: '2026-07-12T10:05:00Z' })
    fireEvent.change(name, { target: { value: 'Two' } })
    await waitFor(() => expect(api.updateCvDocument).toHaveBeenCalledTimes(2), { timeout: 2500 })
    expect(screen.queryByText('This CV was saved somewhere else')).toBeNull()
  })
})

describe('the saved indicator', () => {
  it('says how long ago, in words', () => {
    const now = Date.parse('2026-07-12T12:00:00Z')
    expect(savedAgo(now - 10_000, now)).toBe('just now')
    expect(savedAgo(now - 2 * 60_000, now)).toBe('2 min ago')
    expect(savedAgo(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(savedAgo(now - 3 * 86_400_000, now)).toMatch(/^on /)
  })

  it('reads "Saved just now" after an autosave and names the last save in its tooltip text', async () => {
    view()
    fireEvent.change(await screen.findByLabelText('Document name'), { target: { value: 'Renamed' } })
    await waitFor(() => expect(saveStatus().textContent).toBe('Saved just now'), { timeout: 2500 })
  })
})

describe('ATS check actions', () => {
  it('offers compact spacing for a failing page-break check and applies it', async () => {
    view()
    const checks = await openTool(/^ATS check/)
    fireEvent.click(await within(checks).findByRole('button', { name: 'Use compact spacing' }))
    await waitFor(() => expect(lastPatch().style.density).toBe('compact'))
  })

  it('shows a ready-to-send state with a one-click PDF when every check passes', async () => {
    api.scoreCvDocument.mockResolvedValue({ ...quality, checks: quality.checks.map((check) => ({ ...check, passed: true })) })
    view()
    const checks = await openTool(/^ATS check/)
    expect(await within(checks).findByText('Ready to send')).toBeTruthy()
    fireEvent.click(within(checks).getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(api.fetchCvArtifactBlob).toHaveBeenCalledWith('d1', 'pdf'))
  })
})

describe('export moment', () => {
  it('marks a finished PDF with its page count, ATS result and file name', async () => {
    api.fetchCvArtifactBlob.mockResolvedValueOnce(new Blob(['%PDF /Type /Page /Parent 1 0 R /Type /Page /Parent 1 0 R /Type /Pages']))
    view()
    await screen.findByLabelText('Document name')
    await screen.findByRole('tab', { name: 'ATS check 2 to fix' })
    fireEvent.click(screen.getByRole('button', { name: /^Export PDF/ }))
    const moment = await screen.findByTestId('export-moment')
    expect(within(moment).getByText('Your PDF is ready')).toBeTruthy()
    expect(within(moment).getByText('Principal CV.pdf')).toBeTruthy()
    expect(within(moment).getByText('2 pages · 1 of 3 ATS checks pass')).toBeTruthy()
    fireEvent.click(within(moment).getByRole('button', { name: 'Download DOCX' }))
    await waitFor(() => expect(api.fetchCvArtifactBlob).toHaveBeenCalledWith('d1', 'docx'))
  })
})

describe('versions as cards (cv-studio-d11)', () => {
  it('previews a version on its paper without touching the working CV', async () => {
    view()
    const versions = await openTool(/^Versions/)
    expect(within(versions).getByText('Differs from your CV now: 1 entry reworded')).toBeTruthy()
    fireEvent.click(within(versions).getByRole('button', { name: 'Preview Platform roles' }))
    const dialog = await screen.findByRole('dialog', { name: 'Preview: Platform roles' })
    expect(within(dialog).getByText('Built accessible systems for hiring teams.')).toBeTruthy()
    expect(api.restoreCvVariant).not.toHaveBeenCalled()
    expect(api.updateCvDocument).not.toHaveBeenCalled()
  })

  it('exports a version as a file named after it, without restoring it', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(['%PDF /Type /Page'])) }))
    vi.stubGlobal('fetch', fetchMock)
    view()
    const versions = await openTool(/^Versions/)
    fireEvent.keyDown(within(versions).getByRole('button', { name: 'Export Platform roles' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'PDF' }))
    await waitFor(() => expect(clickedDownload).toBe('Platform roles.pdf'))
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain('/cv-documents/d1/variants/v2/artifacts/pdf')
    expect(api.restoreCvVariant).not.toHaveBeenCalled()
  })

  it('says so when this server cannot export a saved version yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) })))
    view()
    const versions = await openTool(/^Versions/)
    fireEvent.keyDown(within(versions).getByRole('button', { name: 'Export Platform roles' }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'DOCX' }))
    expect((await screen.findByRole('alert')).textContent).toContain('isn’t available on this server yet')
    expect(clickedDownload).toBe('')
  })
})

describe('tailored version next steps', () => {
  it('offers Preview and Export PDF right after a tailored version is saved', async () => {
    api.tailorCvDocument.mockResolvedValue({
      schema_version: 'cv-tailoring/v1', job_title: 'Staff Engineer', skipped: [], remaining_regenerations: 9,
      request_id: '6b1f1d8e-4a4c-4c49-9b7e-3d5c1a2f0e11', proposal_token: 'a'.repeat(64), history_id: null, access_mode: 'authenticated',
      saved: false, locked_actions: [],
      changes: [{ id: 'c1', section_id: 's1', entry_id: 'e1', field: 'body', before: 'Built accessible systems.', after: 'Built accessible systems for hiring teams.', job_requirement: 'Hiring', evidence_item_ids: [], support: 'document' }],
    })
    api.applyCvTailoring.mockResolvedValue(document.variants[1])
    view()
    fireEvent.click(await screen.findByRole('button', { name: /Tailor to a job/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Job title'), { target: { value: 'Staff Engineer' } })
    fireEvent.change(within(dialog).getByLabelText('Job description'), { target: { value: 'Own the hiring platform for the whole company.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suggest changes' }))
    fireEvent.click(await within(dialog).findByRole('button', { name: /Use suggestion/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Save version/ }))
    const notice = await screen.findByText('Saved “Platform roles” to your versions.')
    const strip = notice.closest('.kit-notice') as HTMLElement
    expect(within(strip).getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(within(strip).getByRole('button', { name: 'Export PDF' })).toBeTruthy()
    cleanup()
  })
})

describe('section rows', () => {
  const twoSections = { ...document, sections: [experience, skills] }

  it('unfolds the open section inside its row and folds it back from the row header', async () => {
    api.getCvDocument.mockResolvedValue(twoSections)
    api.listCvDocuments.mockResolvedValue({ items: [twoSections] })
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Skills' }))
    const list = within(panel()).getByRole('list', { name: 'Sections in your CV' })
    const row = within(list).getByText('Skills', { selector: '.cvs-sec__name' }).closest('li') as HTMLElement
    expect(row.getAttribute('data-open')).toBe('true')
    expect(within(row).getByLabelText('Skills text')).toBeTruthy()
    // The other sections stay in the list, closed.
    expect(within(list).getByRole('button', { name: 'Experience' })).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'All sections' }))
    expect(within(panel()).queryByLabelText('Skills text')).toBeNull()
    expect(within(list).getByRole('button', { name: 'Skills' })).toBeTruthy()
  })

  it('reorders by dragging a row onto another and says where it went', async () => {
    api.getCvDocument.mockResolvedValue(twoSections)
    api.listCvDocuments.mockResolvedValue({ items: [twoSections] })
    view()
    await screen.findByTestId('cv-paper')
    const rows = within(panel()).getAllByRole('listitem')
    const transfer = { effectAllowed: '', setData: vi.fn() }
    fireEvent.dragStart(rows[1], { dataTransfer: transfer })
    fireEvent.dragOver(rows[0], { dataTransfer: transfer })
    fireEvent.drop(rows[0], { dataTransfer: transfer })
    expect(screen.getByText('Skills moved to position 1 of 2.')).toBeTruthy()
    await waitFor(() => expect(lastPatch()?.sections.map((section: { id: string }) => section.id)).toEqual(['s2', 's1']), { timeout: 2500 })
  })
})
