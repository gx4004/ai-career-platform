import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DropzoneHero } from '#/components/tooling/DropzoneHero'

const parseCvMock = vi.hoisted(() => vi.fn())

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
})
