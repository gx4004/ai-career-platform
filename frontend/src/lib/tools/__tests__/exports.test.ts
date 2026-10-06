import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_URL, __resetRefreshState } from '#/lib/api/client'
import { ApiError } from '#/lib/api/errors'
import { hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'
import {
  exportPdf,
  formatExportContent,
  readEditableBlocks,
  readExportableSections,
  sanitizeDownloadTitle,
} from '#/lib/tools/exports'

describe('exports helpers', () => {
  it('formats exportable sections as plain text and markdown', () => {
    const payload = {
      exportable_sections: [
        {
          id: 'summary',
          title: 'Application brief',
          body: 'Strong backend baseline with one clear infrastructure gap.',
          items: ['Match score: 68%', 'Verdict: borderline'],
        },
      ],
    }

    const sections = readExportableSections(payload)
    expect(formatExportContent(sections, 'txt')).toContain('APPLICATION BRIEF')
    expect(formatExportContent(sections, 'md')).toContain('## Application brief')
    expect(formatExportContent(sections, 'md')).toContain('- Match score: 68%')
  })

  it('normalizes editable blocks and stable filenames', () => {
    const payload = {
      editable_blocks: [
        {
          id: 'draft',
          label: 'Full draft',
          content: 'Dear Hiring Manager...',
        },
      ],
    }

    expect(readEditableBlocks(payload)).toHaveLength(1)
    expect(sanitizeDownloadTitle('Interview Practice Packet', 'md')).toBe(
      'interview-practice-packet.md',
    )
  })
})

describe('exportPdf', () => {
  const mockFetch = vi.fn()
  let clicked: HTMLAnchorElement[]

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
    window.localStorage.clear()
    __resetRefreshState()
    clicked = []
    URL.createObjectURL = vi.fn(() => 'blob:pdf')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads the file with the name the server suggested', async () => {
    markSessionHint()
    mockFetch.mockResolvedValueOnce(
      new Response('%PDF-1.4', {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="cover-letter-acme.pdf"' },
      }),
    )

    await exportPdf('run-1')

    expect(String(mockFetch.mock.calls[0]?.[0])).toBe(`${API_URL}/history/run-1/export/pdf`)
    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('cover-letter-acme.pdf')
  })

  it('falls back to a name built from the run when the server suggests none', async () => {
    markSessionHint()
    mockFetch.mockResolvedValueOnce(new Response('%PDF-1.4', { status: 200 }))

    await exportPdf('run-1')

    expect(clicked[0].download).toBe('result-run-1.pdf')
  })

  it('refreshes the session after the access token lapsed and still downloads, without signing the person out', async () => {
    markSessionHint()
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response('%PDF-1.4', { status: 200 }))

    await exportPdf('run-1')
    window.removeEventListener('cw:session-expired', expired)

    expect(mockFetch.mock.calls.map((call) => String(call[0]))).toEqual([
      `${API_URL}/history/run-1/export/pdf`,
      `${API_URL}/auth/refresh`,
      `${API_URL}/history/run-1/export/pdf`,
    ])
    expect(clicked).toHaveLength(1)
    expect(expired).not.toHaveBeenCalled()
    expect(hasSessionHint()).toBe(true)
  })

  it('says so in words when the export fails', async () => {
    markSessionHint()
    mockFetch.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const failure = await exportPdf('run-1').then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).message).toBe('Something went wrong on our side. Try again in a moment.')
    expect(clicked).toHaveLength(0)
  })
})
