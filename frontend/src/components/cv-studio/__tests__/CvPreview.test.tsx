import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvPreview } from '#/components/cv-studio/CvPreview'
import type { CvTemplateId } from '#/lib/api/schemas'

const api = vi.hoisted(() => ({ fetchCvArtifactBlob: vi.fn() }))
vi.mock('#/lib/api/client', () => api)

// The two artifact queries race, so each blob carries its own object URL and the
// assertions can tell the PDF preview apart from the DOCX download.
const urls = new Map<Blob, string>()
const onTemplateChange = vi.fn()

function view(props: Partial<Parameters<typeof CvPreview>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const merged = { documentId: 'd1', revision: '2026-07-12T10:00:00Z', dirty: false, template: 'ats-essential' as CvTemplateId, onTemplateChange, ...props }
  const rendered = render(<QueryClientProvider client={client}><CvPreview {...merged} /></QueryClientProvider>)
  return {
    ...rendered,
    reopen: (next: Partial<Parameters<typeof CvPreview>[0]>) =>
      rendered.rerender(<QueryClientProvider client={client}><CvPreview {...merged} {...next} /></QueryClientProvider>),
  }
}

beforeEach(() => {
  vi.clearAllMocks(); urls.clear()
  api.fetchCvArtifactBlob.mockImplementation((_documentId: string, template: CvTemplateId, format: 'docx' | 'pdf') => {
    const blob = new Blob([`${template}:${format}`])
    urls.set(blob, `blob:${template}-${format}`)
    return Promise.resolve(blob)
  })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => urls.get(blob) ?? 'blob:unknown') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

describe('CV export preview', () => {
  it('shows the paginated PDF and both export formats for the selected template', async () => {
    view()

    const frame = await screen.findByTitle('ATS Essential PDF preview')
    expect(frame.getAttribute('src')).toBe('blob:ats-essential-pdf#toolbar=0&navpanes=0&view=FitH')
    const pdfLink = screen.getByRole('link', { name: /PDF/ })
    const docxLink = screen.getByRole('link', { name: /DOCX/ })
    expect(pdfLink.getAttribute('href')).toBe('blob:ats-essential-pdf')
    expect(pdfLink.getAttribute('download')).toBe('d1-ats-essential.pdf')
    expect(docxLink.getAttribute('href')).toBe('blob:ats-essential-docx')
    expect(docxLink.getAttribute('download')).toBe('d1-ats-essential.docx')
  })

  it('never renders a stale artifact while unsaved edits are pending', () => {
    view({ dirty: true })

    expect(screen.getByText('Preview and exports refresh after autosave.')).toBeTruthy()
    expect(api.fetchCvArtifactBlob).not.toHaveBeenCalled()
    expect(screen.queryByTitle('ATS Essential PDF preview')).toBeNull()
    expect((screen.getByLabelText('Template') as HTMLSelectElement).disabled).toBe(true)
  })

  it('re-renders both artifacts when the owner picks another template', async () => {
    const { reopen } = view()
    await screen.findByTitle('ATS Essential PDF preview')

    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'technical-portfolio' } })

    expect(onTemplateChange).toHaveBeenCalledWith('technical-portfolio')
    reopen({ template: 'technical-portfolio' })
    await waitFor(() => expect(api.fetchCvArtifactBlob).toHaveBeenCalledWith('d1', 'technical-portfolio', 'pdf'))
    const frame = await screen.findByTitle('Technical / Portfolio PDF preview')
    expect(frame.getAttribute('src')).toContain('blob:technical-portfolio-pdf')
    expect(screen.getByRole('link', { name: /DOCX/ }).getAttribute('download')).toBe('d1-technical-portfolio.docx')
  })

  it('reports a failed render instead of offering an unvalidated download', async () => {
    api.fetchCvArtifactBlob.mockRejectedValue(new Error('Artifact export failed'))
    view()

    expect((await screen.findByRole('alert')).textContent).toContain('Preview or export validation failed.')
    expect(screen.queryByTitle('ATS Essential PDF preview')).toBeNull()
    expect(screen.queryByRole('link', { name: /PDF/ })).toBeNull()
  })

  it('releases both object URLs when the preview goes away', async () => {
    const { unmount } = view()
    await screen.findByTitle('ATS Essential PDF preview')

    unmount()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ats-essential-pdf')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ats-essential-docx')
  })
})
