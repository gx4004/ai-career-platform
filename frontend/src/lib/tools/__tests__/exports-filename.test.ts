import { afterEach, describe, expect, it, vi } from 'vitest'

const requestBlob = vi.fn()
vi.mock('#/lib/api/client', () => ({ requestBlob: (...args: unknown[]) => requestBlob(...args) }))

import { exportPdf, safeFileName, sanitizeDownloadTitle } from '#/lib/tools/exports'

describe('safeFileName', () => {
  it('drops path separators, quotes, reserved and control characters', () => {
    expect(safeFileName('../Acme "Labs"/Cover\u0007 letter:v2', 'txt')).toBe('Acme Labs Cover letter v2.txt')
    expect(safeFileName("O'Brien\\notes")).toBe('O Brien notes')
  })

  it('caps the length before the extension and trims trailing dots', () => {
    const name = safeFileName(`${'a'.repeat(200)}...`, 'pdf')
    expect(name.endsWith('.pdf')).toBe(true)
    expect(name.length).toBeLessThanOrEqual(84)
  })

  it('does not double an extension the name already carries', () => {
    expect(safeFileName('Resume report.pdf', 'pdf')).toBe('Resume report.pdf')
  })

  it('returns an empty string when nothing usable is left', () => {
    expect(safeFileName('///""')).toBe('')
  })
})

describe('sanitizeDownloadTitle', () => {
  it('slugs and caps a long title', () => {
    const name = sanitizeDownloadTitle('Cover letter / '.repeat(20), 'md')
    expect(name).toMatch(/^[a-z0-9-]+\.md$/)
    expect(name.length).toBeLessThanOrEqual(83)
  })
})

describe('exportPdf', () => {
  const clicked: string[] = []
  afterEach(() => {
    vi.restoreAllMocks()
    clicked.length = 0
  })

  function trackDownloads() {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })
  }

  it('uses the server file name when it sends one', async () => {
    trackDownloads()
    requestBlob.mockResolvedValueOnce({ blob: new Blob(['%PDF']), filename: 'resume-analysis-2026-10-06.pdf' })
    await exportPdf('run-1')
    expect(clicked).toEqual(['resume-analysis-2026-10-06.pdf'])
  })

  it('sanitises a hostile server file name and falls back when none is sent', async () => {
    trackDownloads()
    requestBlob.mockResolvedValueOnce({ blob: new Blob(['%PDF']), filename: 'evil"\u0000name.pdf' })
    await exportPdf('run-1')
    requestBlob.mockResolvedValueOnce({ blob: new Blob(['%PDF']), filename: null })
    await exportPdf('run-2')
    expect(clicked).toEqual(['evil name.pdf', 'result-run-2.pdf'])
  })
})
