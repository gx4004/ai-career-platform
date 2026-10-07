import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResumeSource } from '#/components/tooling/ResumeSource'
import { SAMPLE_RESUME_TEXT } from '#/components/tooling/sampleResume'
import { ApiError } from '#/lib/api/errors'
import { writeWorkflowContext } from '#/lib/tools/drafts'

const parseCvMock = vi.hoisted(() => vi.fn())
// The row names where a carried resume came from (tool labels from the registry, which imports the rest of the client).
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  parseCv: parseCvMock,
}))

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
      filename: 'cv.pdf',
      extracted_text: 'Some text that was read.',
      chars_count: 24,
      warnings: ['Some pages could not be read'],
    })
    renderSource()
    upload('cv.pdf')
    await waitFor(() => expect(screen.getByText('Some pages could not be read')).toBeTruthy())
  })

  // The scan notice used to say the same thing three times: its title, the backend's "No text could be extracted from
  // this file", and the explanation. The title and the explanation say it; the backend line is left out.
  it('does not repeat the backend’s no-text warning under a scan notice that already says it', async () => {
    parseCvMock.mockResolvedValue({
      filename: 'scan.pdf',
      extracted_text: '',
      chars_count: 0,
      warnings: ['No text could be extracted from this file', 'Page 2 is an image'],
    })
    renderSource()
    upload('scan.pdf')
    expect(await screen.findByText('No readable text in scan.pdf')).toBeTruthy()
    expect(screen.queryByText(/No text could be extracted/i)).toBeNull()
    // Anything else the reader noticed still shows.
    expect(screen.getByText('Page 2 is an image')).toBeTruthy()
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

    it('stops naming the uploaded file once its text is edited or replaced', async () => {
      parseCvMock.mockResolvedValue(parsed)
      function Harness() {
        const [value, setValue] = useState('')
        return <ResumeSource id="r" label="Resume text" value={value} onChange={setValue} />
      }
      render(
        <QueryClientProvider client={new QueryClient()}>
          <Harness />
        </QueryClientProvider>,
      )
      upload('cv.pdf')
      const row = await screen.findByRole('list', { name: 'Resume source' })
      await waitFor(() => expect(row.textContent).toContain('cv.pdf'))

      fireEvent.click(screen.getByRole('button', { name: 'Change' }))
      const editor = screen.getByLabelText('Resume text')
      fireEvent.change(editor, { target: { value: `${parsed.extracted_text} Led the payments redesign.` } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(screen.getByRole('list', { name: 'Resume source' }).textContent).toContain('cv.pdf (edited)')

      fireEvent.click(screen.getByRole('button', { name: 'Change' }))
      fireEvent.change(screen.getByLabelText('Resume text'), { target: { value: 'Jordan Lee. Data analyst, SQL and dbt.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      const replaced = screen.getByRole('list', { name: 'Resume source' }).textContent
      expect(replaced).toContain('Pasted resume')
      expect(replaced).not.toContain('cv.pdf')
      // Other tools and a reload read the carry store: it must not claim the file either.
      expect(sessionStorage.getItem('cw:resume-carry-filename')).toBeNull()
    })

    it('shows what was read, and lets the user confirm it', async () => {
      parseCvMock.mockResolvedValue(parsed)
      renderSource({ value: parsed.extracted_text })
      upload('cv.pdf')
      const readBack = await screen.findByLabelText('What was read from your file')
      // Titled by its job: the file name and the word count are already in the resume row right above it.
      expect(readBack.textContent).toContain('Check what was read')
      expect(readBack.textContent).not.toContain('cv.pdf')
      expect(readBack.textContent).not.toContain('12 words')
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

    // The server's 400 is technical and gives no next step: the same failure reads as on the dashboard upload, with the
    // paste path this field offers (sign-off F32).
    it('says a file the server could not read in plain words, with a next step', async () => {
      parseCvMock.mockRejectedValue(new ApiError('The uploaded file could not be safely parsed.', 400))
      renderSource()
      upload('broken.pdf')
      expect(
        await screen.findByText("We couldn't read that file. Try another PDF or DOCX, or paste the text instead."),
      ).toBeTruthy()
      expect(screen.queryByText(/could not be safely parsed/)).toBeNull()
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

    it('names where a carried resume was supplied: pasted here, from another tool, or this session when unknown', () => {
      sessionStorage.setItem('cw:resume-carry', 'Earlier resume text')
      sessionStorage.setItem('cw:resume-carry-updated-at', String(Date.now()))
      sessionStorage.setItem('cw:resume-carry-origin', 'resume')
      const source = () => screen.getByRole('list', { name: 'Resume source' }).querySelector('.kit-row__title')?.textContent
      const view = render(
        <QueryClientProvider client={new QueryClient()}>
          <ResumeSource id="r" label="Resume text" toolId="resume" value="Earlier resume text" onChange={vi.fn()} />
        </QueryClientProvider>,
      )
      // Pasted on Resume Analyzer and run there: back on Resume Analyzer it is not "carried from a previous tool".
      expect(source()).toBe('Pasted resume')
      view.unmount()

      const other = render(
        <QueryClientProvider client={new QueryClient()}>
          <ResumeSource id="r" label="Resume text" toolId="job-match" value="Earlier resume text" onChange={vi.fn()} />
        </QueryClientProvider>,
      )
      expect(source()).toBe('Resume from Resume Analyzer')
      other.unmount()

      sessionStorage.removeItem('cw:resume-carry-origin')
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ResumeSource id="r" label="Resume text" toolId="job-match" value="Earlier resume text" onChange={vi.fn()} seeded />
        </QueryClientProvider>,
      )
      expect(source()).toBe('Your resume from this session')
      expect(screen.queryByText('Resume carried from previous tool')).toBeNull()
    })

    it('names a resume a Re-generate found in the account by that CV', () => {
      writeWorkflowContext({
        resumeText: 'Alex Morgan, Staff Engineer. Ten years of platform work.',
        resumeSource: 'your CV Studio CV “Platform CV”',
        resumeOrigin: 'cv-studio',
        updatedAt: Date.now(),
      })
      renderSource({ value: 'Alex Morgan, Staff Engineer. Ten years of platform work.', seeded: true, toolId: 'job-match' })
      expect(screen.getByText('Your CV Studio CV “Platform CV”')).toBeTruthy()
    })

    it('remembers text pasted here as supplied on this tool', () => {
      function Controlled() {
        const [value, setValue] = useState('')
        return <ResumeSource id="r" label="Resume text" toolId="interview" value={value} onChange={setValue} />
      }
      render(
        <QueryClientProvider client={new QueryClient()}>
          <Controlled />
        </QueryClientProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Paste text instead' }))
      fireEvent.change(screen.getByLabelText('Resume text'), { target: { value: 'Jordan Lee. Data analyst, SQL and dbt.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(sessionStorage.getItem('cw:resume-carry-origin')).toBe('interview')
      expect(screen.getByRole('list', { name: 'Resume source' }).textContent).toContain('Pasted resume')
    })

    it('lets the user back out of an empty paste editor, and keeps the sample one click away', () => {
      const { onChange } = renderSource()
      fireEvent.click(screen.getByRole('button', { name: 'Paste text instead' }))
      expect(screen.getByLabelText('Resume text')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Try with a sample resume' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      // Back to the dropzone.
      expect(screen.queryByLabelText('Resume text')).toBeNull()
      expect(screen.getByRole('button', { name: 'Paste text instead' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Paste text instead' }))
      fireEvent.click(screen.getByRole('button', { name: 'Try with a sample resume' }))
      expect(onChange).toHaveBeenCalledWith(SAMPLE_RESUME_TEXT)
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

// Sign-off tool-inputs-F27: actions that swap the control for another body (a finished upload, the sample, Looks right,
// Done, the empty editor's Cancel) dropped keyboard focus on <body>. Focus now lands on the control that takes their place.
describe('ResumeSource: keyboard focus across its states', () => {
  beforeEach(() => {
    parseCvMock.mockReset()
    sessionStorage.clear()
  })

  function renderControlled(initial = '') {
    function Controlled() {
      const [value, setValue] = useState(initial)
      return <ResumeSource id="r" label="Resume text" value={value} onChange={setValue} />
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Controlled />
      </QueryClientProvider>,
    )
  }

  /** A keyboard press: the button has focus, then activates (and unmounts with the body it was in). */
  function press(name: string) {
    const button = screen.getByRole('button', { name })
    button.focus()
    fireEvent.click(button)
  }

  it('hands focus back to the picker when an upload finishes', async () => {
    parseCvMock.mockResolvedValue({ filename: 'cv.docx', extracted_text: 'Taylor Morgan. Designer.', chars_count: 24, warnings: [] })
    renderControlled()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    input.focus()
    upload('cv.docx')
    await screen.findByLabelText('What was read from your file')
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('input[type="file"]')))
  })

  it('puts focus on Change after the sample, Looks right and Done', async () => {
    renderControlled()
    press('Try with a sample resume')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change' }))

    press('Change')
    press('Done')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change' }))

    parseCvMock.mockResolvedValue({ filename: 'cv.docx', extracted_text: 'Taylor Morgan. Designer.', chars_count: 24, warnings: [] })
    upload('cv.docx')
    await screen.findByLabelText('What was read from your file')
    press('Looks right')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change' }))
  })

  it('returns focus to "Paste text instead" when the empty editor is cancelled', () => {
    renderControlled()
    press('Paste text instead')
    press('Cancel')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Paste text instead' }))
  })

  it('does not take focus from where the user moved it meanwhile', async () => {
    let resolve: (value: unknown) => void = () => {}
    parseCvMock.mockReturnValue(new Promise((r) => { resolve = r }))
    renderControlled()
    const elsewhere = document.createElement('input')
    document.body.appendChild(elsewhere)
    upload('cv.docx')
    elsewhere.focus()
    resolve({ filename: 'cv.docx', extracted_text: 'Taylor Morgan. Designer.', chars_count: 24, warnings: [] })
    await screen.findByLabelText('What was read from your file')
    expect(document.activeElement).toBe(elsewhere)
    elsewhere.remove()
  })
})

describe('ResumeSource: what the scan notice and the dropzone say', () => {
  beforeEach(() => {
    parseCvMock.mockReset()
    sessionStorage.clear()
  })

  // Sign-off tool-inputs-F36: a scan over an uploaded resume keeps that resume; the notice says it is still the one used.
  it('says which resume the run still uses when a scan replaced nothing', async () => {
    parseCvMock.mockResolvedValue({ filename: 'scan.pdf', extracted_text: '', chars_count: 0, warnings: [] })
    sessionStorage.setItem('cw:resume-carry', 'my existing resume text')
    sessionStorage.setItem('cw:resume-carry-updated-at', String(Date.now()))
    sessionStorage.setItem('cw:resume-carry-filename', 'riley-chen-resume.docx')
    renderSource({ value: 'my existing resume text' })
    upload('scan.pdf')
    expect(
      await screen.findByText('Your earlier resume (riley-chen-resume.docx) is still the one this run uses.'),
    ).toBeTruthy()
  })

  it('says nothing about an earlier resume when there was none', async () => {
    parseCvMock.mockResolvedValue({ filename: 'scan.pdf', extracted_text: '', chars_count: 0, warnings: [] })
    renderSource()
    upload('scan.pdf')
    await screen.findByText('No readable text in scan.pdf')
    expect(screen.queryByText(/is still the one this run uses/)).toBeNull()
  })

  // Sign-off tool-inputs-F38: the dropzone takes a dropped file, but nothing said so to a mouse user.
  it('invites a drop on a fine pointer, and keeps the plain hint on touch', () => {
    const original = window.matchMedia
    try {
      renderSource()
      expect(screen.getByText(/^PDF or DOCX, up to 10\sMB$/).closest('p')?.textContent).toBe(
        'Drop your resume here: PDF or DOCX, up to 10\u00a0MB',
      )
      cleanup()
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      })) as typeof window.matchMedia
      renderSource()
      expect(screen.getByText(/^PDF or DOCX, up to 10\sMB$/).closest('p')?.textContent).toBe('PDF or DOCX, up to 10\u00a0MB')
    } finally {
      window.matchMedia = original
    }
  })
})
