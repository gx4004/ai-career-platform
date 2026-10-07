import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardResumeUpload } from '#/components/dashboard/DashboardResumeUpload'
import { ApiError } from '#/lib/api/errors'

const navigateMock = vi.hoisted(() => vi.fn())
const writeWorkflowContextMock = vi.hoisted(() => vi.fn())
const parseCvMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('#/lib/api/client', () => ({ parseCv: parseCvMock }))
const setResumeCarryMock = vi.hoisted(() => vi.fn())
vi.mock('#/lib/tools/resumeCarryStore', () => ({ setResumeCarry: setResumeCarryMock }))
vi.mock('#/lib/tools/drafts', () => ({
  writeWorkflowContext: (payload: unknown) => writeWorkflowContextMock(payload),
}))

function renderUpload() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DashboardResumeUpload />
    </QueryClientProvider>,
  )
}

describe('DashboardResumeUpload', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    writeWorkflowContextMock.mockReset()
    parseCvMock.mockReset()
    setResumeCarryMock.mockReset()
  })

  it('offers a file chooser for PDF or DOCX in the tool pages\' dropzone', () => {
    renderUpload()
    expect(screen.getByText('Choose file')).toBeTruthy()
    expect(screen.getByText(/PDF or DOCX/)).toBeTruthy()
    // consistency-F08: the same dropzone as the tool pages (lemon icon disc, then the hint, then the trigger).
    expect(document.querySelector('.kit-file[data-variant="dropzone"]')?.getAttribute('data-icon')).toBe('true')
    const input = screen.getByLabelText('Resume file') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.pdf,.docx')
  })

  it('hands the made-up sample resume to the Resume Analyzer without any upload', () => {
    renderUpload()
    fireEvent.click(screen.getByRole('button', { name: 'Try with a sample resume' }))

    expect(parseCvMock).not.toHaveBeenCalled()
    expect(writeWorkflowContextMock.mock.calls[0]?.[0]).toMatchObject({ resumePendingReview: true })
    expect(writeWorkflowContextMock.mock.calls[0]?.[0]?.resumeText).toContain('SAMPLE RESUME')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/resume' })
  })

  it('stores a pending-review handoff before navigating to the resume tool', async () => {
    parseCvMock.mockResolvedValue({ extracted_text: 'Parsed dashboard resume text', warnings: [] })
    renderUpload()

    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Resume file'), { target: { files: [file] } })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/resume' }))
    expect(writeWorkflowContextMock.mock.calls[0]?.[0]).toMatchObject({
      resumeText: 'Parsed dashboard resume text',
      resumePendingReview: true,
    })
    expect(typeof writeWorkflowContextMock.mock.calls[0]?.[0]?.updatedAt).toBe('number')
    // The Resume Analyzer names the file instead of claiming a hand-off from another tool.
    expect(setResumeCarryMock).toHaveBeenCalledWith('Parsed dashboard resume text', 'cv.pdf')
  })

  it('shows the parse error', async () => {
    parseCvMock.mockRejectedValue(new Error('Could not read that file'))
    renderUpload()
    fireEvent.change(screen.getByLabelText('Resume file'), {
      target: { files: [new File(['x'], 'cv.pdf')] },
    })
    expect((await screen.findByRole('alert')).textContent).toContain('Could not read that file')
    expect(navigateMock).not.toHaveBeenCalled()
    // The dropzone turns to the error state, not the picked-file (success) look.
    const input = screen.getByLabelText('Resume file')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.closest('.kit-file')?.getAttribute('data-invalid')).toBe('true')
  })

  it('turns the server\'s "could not be safely parsed" into a next step and empties the dropzone', async () => {
    parseCvMock.mockRejectedValue(new ApiError('The uploaded file could not be safely parsed.', 400))
    renderUpload()
    fireEvent.change(screen.getByLabelText('Resume file'), { target: { files: [new File(['x'], 'broken.pdf')] } })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("We couldn't read that file. Try another PDF or DOCX, or try the sample resume.")
    expect(screen.queryByText('broken.pdf')).toBeNull()
    expect(screen.getByLabelText('Resume file').getAttribute('aria-invalid')).toBe('true')
    // Sign-off chrome-F43: the message sits right under the dropzone (before the sample link, which on a phone pushed
    // it under the tab tray) and the dropzone is described by it.
    const notice = alert.closest('.kit-notice') ?? alert
    expect(screen.getByLabelText('Resume file').getAttribute('aria-describedby')).toContain(notice.id)
    const sample = screen.getByRole('button', { name: 'Try with a sample resume' })
    expect(notice.compareDocumentPosition(sample) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('clears the last error when another file is picked', async () => {
    parseCvMock.mockRejectedValueOnce(new Error('Could not read that file')).mockReturnValue(new Promise(() => {}))
    renderUpload()
    fireEvent.change(screen.getByLabelText('Resume file'), { target: { files: [new File(['x'], 'bad.pdf')] } })
    await screen.findByRole('alert')

    fireEvent.change(screen.getByLabelText('Resume file'), { target: { files: [new File(['y'], 'good.pdf')] } })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByLabelText('Resume file').getAttribute('aria-invalid')).toBeNull()
  })

  it('says it is parsing while the file is read and blocks a second pick', async () => {
    parseCvMock.mockReturnValue(new Promise(() => {}))
    renderUpload()
    fireEvent.change(screen.getByLabelText('Resume file'), {
      target: { files: [new File(['x'], 'cv.pdf')] },
    })

    expect((await screen.findByRole('status')).textContent).toContain('Parsing your resume')
    expect((screen.getByLabelText('Resume file') as HTMLInputElement).disabled).toBe(true)
  })
})
