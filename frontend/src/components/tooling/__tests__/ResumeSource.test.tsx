import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResumeSource } from '#/components/tooling/ResumeSource'

const parseCvMock = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/client', () => ({ parseCv: parseCvMock }))

function renderSource(props: Partial<Parameters<typeof ResumeSource>[0]> = {}) {
  const onChange = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ResumeSource id="r" label="Resume text" value="" onChange={onChange} {...props} />
    </QueryClientProvider>,
  )
  return { onChange }
}

function upload(name: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['%PDF-1.4 stub'], name, { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ResumeSource', () => {
  beforeEach(() => parseCvMock.mockReset())

  it('passes parsed text to onChange', async () => {
    parseCvMock.mockResolvedValue({
      filename: 'good.pdf',
      extracted_text: 'Real resume content.',
      chars_count: 20,
      warnings: [],
    })
    const { onChange } = renderSource()
    upload('good.pdf')
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Real resume content.'))
  })

  it('shows parse warnings', async () => {
    parseCvMock.mockResolvedValue({
      filename: 'scan.pdf',
      extracted_text: '',
      chars_count: 0,
      warnings: ['No text could be extracted from this file'],
    })
    renderSource()
    upload('scan.pdf')
    await waitFor(() =>
      expect(screen.getByText(/No text could be extracted from this file/i)).toBeTruthy(),
    )
  })

  it('shows the resume row with a word count when text exists', () => {
    renderSource({ value: 'one two three' })
    expect(screen.getByText('3 words')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()
  })
})
