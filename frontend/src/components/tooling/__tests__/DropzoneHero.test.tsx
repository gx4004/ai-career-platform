import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { SAMPLE_RESUME_TEXT } from '#/lib/tools/sampleContent'

const parseCvMock = vi.hoisted(() => vi.fn())

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()

  return {
    ...actual,
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  }
})

vi.mock('#/lib/api/client', () => ({
  parseCv: parseCvMock,
}))

function makeFile(name = 'resume.pdf') {
  // jsdom does not implement %PDF magic-byte sniffing — the mock parser short-circuits
  return new File(['%PDF-1.4 stub'], name, { type: 'application/pdf' })
}

function renderHero(overrides: Partial<Parameters<typeof DropzoneHero>[0]> = {}) {
  const onParsed = overrides.onParsed ?? vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return {
    onParsed,
    ...render(
      <QueryClientProvider client={queryClient}>
        <DropzoneHero accent="#22c55e" {...overrides} onParsed={onParsed} />
      </QueryClientProvider>,
    ),
  }
}

describe('DropzoneHero', () => {
  beforeEach(() => {
    parseCvMock.mockReset()
  })

  afterEach(() => {
    parseCvMock.mockReset()
    vi.unstubAllEnvs()
  })

  it('shows a warning banner when parseCv returns warnings', async () => {
    parseCvMock.mockResolvedValue({
      filename: 'scan.pdf',
      extracted_text: '',
      chars_count: 0,
      warnings: ['No text could be extracted from this file'],
    })

    const { onParsed } = renderHero()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('scan.pdf')] } })

    await waitFor(() => {
      expect(screen.getByText(/Resume parsed with warnings/i)).toBeTruthy()
    })

    expect(screen.getByText(/No text could be extracted from this file/i)).toBeTruthy()
    expect(onParsed).toHaveBeenCalledWith('')
  })

  it('shows the regular success state when warnings are empty', async () => {
    parseCvMock.mockResolvedValue({
      filename: 'good.pdf',
      extracted_text: 'Real resume content goes here.',
      chars_count: 32,
      warnings: [],
    })

    const { onParsed } = renderHero()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [makeFile('good.pdf')] } })

    await waitFor(() => {
      expect(screen.getByText(/Resume parsed successfully/i)).toBeTruthy()
    })

    expect(screen.queryByText(/Resume parsed with warnings/i)).toBeNull()
    expect(onParsed).toHaveBeenCalledWith('Real resume content goes here.')
  })

  describe('R7 #111 sample quick-fill', () => {
    it('does not render the sample affordance when the flag is off (default, unchanged)', () => {
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', undefined as unknown as string)
      renderHero({ onPasteText: vi.fn() })

      expect(screen.queryByText(/Try a sample resume/i)).toBeNull()
      // The existing idle actions are unchanged.
      expect(screen.getByRole('button', { name: /Choose file/i })).toBeTruthy()
      expect(screen.getByRole('button', { name: /Paste text instead/i })).toBeTruthy()
    })

    it('seeds the paste-text path with synthetic sample content when the flag is on', () => {
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', 'true')
      const { onParsed } = renderHero()

      const sampleButton = screen.getByRole('button', { name: /Try a sample resume/i })
      fireEvent.click(sampleButton)

      expect(onParsed).toHaveBeenCalledWith(SAMPLE_RESUME_TEXT)
      expect(parseCvMock).not.toHaveBeenCalled()
    })
  })
})
