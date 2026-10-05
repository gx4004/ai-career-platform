import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResumeSource } from '#/components/tooling/ResumeSource'
import { SAMPLE_RESUME_TEXT } from '#/components/tooling/sampleResume'

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

function upload(name: string, content: BlobPart = '%PDF-1.4 stub') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([content], name, { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ResumeSource', () => {
  beforeEach(() => {
    parseCvMock.mockReset()
    sessionStorage.clear()
  })

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

  it('says the text was carried in when the editor opens on a carried resume', () => {
    renderSource({ value: 'one two three', seeded: true })
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByText('Resume text carried in from your recent workflow.')).toBeTruthy()
  })

  it('shows a busy row with the file name while a file is read, then names the dropzone "Resume"', async () => {
    let resolve: (value: unknown) => void = () => {}
    parseCvMock.mockReturnValue(new Promise((r) => { resolve = r }))
    renderSource()
    expect(screen.getByText('Resume')).toBeTruthy()
    upload('cv.pdf')
    const row = await screen.findByRole('list', { name: 'Resume source' })
    expect(row.getAttribute('aria-busy')).toBe('true')
    expect(row.textContent).toContain('Reading cv.pdf')
    expect(row.querySelector('.tool-spinner')).toBeTruthy()
    resolve({ filename: 'cv.pdf', extracted_text: 'text', chars_count: 4, warnings: [] })
  })

  describe('what happens to the resume after a pick', () => {
    const parsed = {
      filename: 'cv.pdf',
      extracted_text: 'Taylor Morgan. Senior product designer with eight years of experience in fintech.',
      chars_count: 80,
      warnings: [],
    }

    it('keeps an uploaded resume for the tab, so the Evidence Profile can import it (D07)', async () => {
      parseCvMock.mockResolvedValue(parsed)
      const { onChange } = renderSource()
      upload('cv.pdf')
      await waitFor(() => expect(onChange).toHaveBeenCalledWith(parsed.extracted_text))
      expect(sessionStorage.getItem('cw:resume-carry')).toBe(parsed.extracted_text)
      expect(sessionStorage.getItem('cw:resume-carry-filename')).toBe('cv.pdf')
    })

    it('shows what was read, and lets the user confirm it', async () => {
      parseCvMock.mockResolvedValue(parsed)
      renderSource({ value: parsed.extracted_text })
      upload('cv.pdf')
      const readBack = await screen.findByLabelText('What was read from your file')
      expect(readBack.textContent).toContain('Read 12 words from cv.pdf')
      expect(readBack.textContent).toContain('Taylor Morgan.')
      fireEvent.click(screen.getByRole('button', { name: 'Looks right' }))
      expect(screen.queryByLabelText('What was read from your file')).toBeNull()
    })

    it('treats a scan with no text as a fixable problem and does not wipe the resume that was there', async () => {
      parseCvMock.mockResolvedValue({ filename: 'scan.pdf', extracted_text: '', chars_count: 0, warnings: [] })
      const { onChange } = renderSource({ value: 'my existing resume text' })
      upload('scan.pdf')
      expect(await screen.findByText('No readable text in scan.pdf')).toBeTruthy()
      expect(screen.getByText(/Scanned PDF\?/)).toBeTruthy()
      expect(onChange).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Paste your resume text' }))
      expect(screen.getByLabelText('Resume text')).toBeTruthy()
    })

    it('refuses a file over 10 MB or of the wrong type before sending it', async () => {
      renderSource()
      upload('huge.pdf', new Uint8Array(10 * 1024 * 1024 + 1))
      expect(await screen.findByText(/larger than 10 MB/)).toBeTruthy()
      upload('notes.txt')
      expect(await screen.findByText(/Only PDF and DOCX files/)).toBeTruthy()
      expect(parseCvMock).not.toHaveBeenCalled()
    })

    it('offers a labelled sample resume that is never kept for the Evidence Profile', () => {
      const { onChange } = renderSource()
      fireEvent.click(screen.getByRole('button', { name: 'Try with a sample resume' }))
      expect(onChange).toHaveBeenCalledWith(SAMPLE_RESUME_TEXT)
      expect(SAMPLE_RESUME_TEXT).toMatch(/SAMPLE RESUME \(fictional person/)
      expect(sessionStorage.getItem('cw:resume-carry')).toBeNull()
    })

    it('says so when the resume in the row is the sample', () => {
      renderSource({ value: SAMPLE_RESUME_TEXT })
      expect(screen.getByText('Sample resume')).toBeTruthy()
      expect(screen.getByText('Made-up example text, not your resume')).toBeTruthy()
    })

    it('reuses a resume uploaded earlier in the tab instead of asking again', () => {
      sessionStorage.setItem('cw:resume-carry', 'Earlier resume text')
      sessionStorage.setItem('cw:resume-carry-updated-at', String(Date.now()))
      sessionStorage.setItem('cw:resume-carry-filename', 'earlier.pdf')
      const { onChange } = renderSource()
      expect(onChange).toHaveBeenCalledWith('Earlier resume text')
    })

    it('names the carried file in the row once the text is in the field', () => {
      sessionStorage.setItem('cw:resume-carry', 'Earlier resume text')
      sessionStorage.setItem('cw:resume-carry-updated-at', String(Date.now()))
      sessionStorage.setItem('cw:resume-carry-filename', 'earlier.pdf')
      renderSource({ value: 'Earlier resume text' })
      expect(screen.getByText('earlier.pdf')).toBeTruthy()
    })

    it('shows the resume row as an object: a stone panel around an unframed list, not loose text', () => {
      renderSource({ value: 'one two three' })
      const list = screen.getByRole('list', { name: 'Resume source' })
      expect(list.getAttribute('data-framed')).toBeNull()
      const panel = list.closest('.kit-panel-surface')
      expect(panel?.getAttribute('data-tone')).toBe('stone')
    })

    it('hands focus back to the file picker after a rejected file, so the keyboard user keeps their place', async () => {
      renderSource()
      upload('notes.txt')
      expect(await screen.findByText(/Only PDF and DOCX files/)).toBeTruthy()
      await waitFor(() => expect(document.activeElement).toBe(document.querySelector('input[type="file"]')))
    })

    it('does not keep the carried row once the carried text is cleared in the editor', () => {
      sessionStorage.setItem('cw:resume-carry', 'Earlier resume text')
      sessionStorage.setItem('cw:resume-carry-updated-at', String(Date.now()))
      function Controlled() {
        const [value, setValue] = useState('')
        return <ResumeSource id="r" label="Resume text" value={value} onChange={setValue} />
      }
      render(
        <QueryClientProvider client={new QueryClient()}>
          <Controlled />
        </QueryClientProvider>,
      )
      expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Change' }))
      fireEvent.change(screen.getByLabelText('Resume text'), { target: { value: '' } })
      expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
      expect(screen.queryByText('Resume carried from previous tool')).toBeNull()
    })
  })
})
