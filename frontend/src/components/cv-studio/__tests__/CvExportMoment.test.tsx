import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { styleCatalogFixture } from '#/lib/cv-studio/__tests__/styleCatalog.fixture'
import { CvExportMoment, type ExportMoment } from '../CvExportMoment'

afterEach(cleanup)

const base: ExportMoment = { id: 1, format: 'docx', filename: 'Maya.docx', pages: null, checks: null }

describe('CvExportMoment', () => {
  it('says the Word version is one column when the template is two-column', () => {
    render(<CvExportMoment moment={{ ...base, note: 'Word version uses a single column.' }} otherBusy={false} onDownloadOther={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Your DOCX is ready')).toBeTruthy()
    expect(screen.getByText('Word version uses a single column.')).toBeTruthy()
  })

  it('shows a plain-text export and offers the PDF as the other format', () => {
    const other = vi.fn()
    render(<CvExportMoment moment={{ ...base, format: 'txt', filename: 'Maya.txt' }} otherBusy={false} onDownloadOther={other} onClose={() => {}} />)
    expect(screen.getByText('Your TXT is ready')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    expect(other).toHaveBeenCalled()
  })
})

describe('style catalog docx_note', () => {
  it('carries the note for two-column templates and null for the rest', () => {
    const parsed = styleCatalogFixture
    expect(parsed.templates.find((t) => t.id === 'lagoon')?.docx_note).toBe('Word version uses a single column.')
    expect(parsed.templates.find((t) => t.id === 'classic')?.docx_note).toBeNull()
  })
})
