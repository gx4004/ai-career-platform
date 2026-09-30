import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardResumeUpload } from '#/components/dashboard/DashboardResumeUpload'

const navigateMock = vi.hoisted(() => vi.fn())
const writeWorkflowContextMock = vi.hoisted(() => vi.fn())
const parseCvMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('#/lib/api/client', () => ({ parseCv: parseCvMock }))
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
  })

  it('offers a file chooser for PDF or DOCX', () => {
    renderUpload()
    expect(screen.getByText('Upload your resume')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Choose file/i })).toBeTruthy()
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
  })

  it('shows the parse error', async () => {
    parseCvMock.mockRejectedValue(new Error('Could not read that file'))
    renderUpload()
    fireEvent.change(screen.getByLabelText('Resume file'), {
      target: { files: [new File(['x'], 'cv.pdf')] },
    })
    expect((await screen.findByRole('alert')).textContent).toContain('Could not read that file')
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
