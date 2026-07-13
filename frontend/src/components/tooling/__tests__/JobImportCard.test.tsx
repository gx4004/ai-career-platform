import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { JobImportCard } from '#/components/tooling/JobImportCard'
import { SAMPLE_JOB_DESCRIPTION } from '#/lib/tools/sampleContent'

const importJobUrlMock = vi.hoisted(() => vi.fn())
const importJobTextMock = vi.hoisted(() => vi.fn())
const getHistoryWorkspacesMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  importJobUrl: importJobUrlMock,
  importJobText: importJobTextMock,
  getHistoryWorkspaces: getHistoryWorkspacesMock,
}))

function renderCard(onImported = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    onImported,
    ...render(
      <QueryClientProvider client={queryClient}>
        <JobImportCard onImported={onImported} />
      </QueryClientProvider>,
    ),
  }
}

describe('JobImportCard', () => {
  afterEach(() => {
    importJobUrlMock.mockReset()
    importJobTextMock.mockReset()
    getHistoryWorkspacesMock.mockReset()
    getHistoryWorkspacesMock.mockResolvedValue({ items: [], total: 0 })
    vi.unstubAllEnvs()
  })

  describe('R7 #111 sample quick-fill', () => {
    it('does not render the sample affordance when the flag is off (default, unchanged)', () => {
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', undefined as unknown as string)
      renderCard()

      expect(screen.queryByText(/Try a sample job description/i)).toBeNull()
      // The existing URL-import path is unchanged.
      expect(screen.getByPlaceholderText(/Paste the job posting URL/i)).toBeTruthy()
      expect(screen.getByRole('button', { name: /Import/i })).toBeTruthy()
    })

    it('seeds the job-description path with synthetic sample content when the flag is on', () => {
      vi.stubEnv('VITE_R7_SAMPLE_QUICKFILL', 'true')
      const { onImported } = renderCard()

      const sampleButton = screen.getByRole('button', { name: /Try a sample job description/i })
      fireEvent.click(sampleButton)

      expect(onImported).toHaveBeenCalledWith(SAMPLE_JOB_DESCRIPTION)
      expect(importJobUrlMock).not.toHaveBeenCalled()
    })
  })

  it('keeps populate-only import by default and exposes explicit campaign attachment', async () => {
    getHistoryWorkspacesMock.mockResolvedValue({
      items: [{ id: 'ws-1', label: 'Example campaign' }], total: 1,
    })
    renderCard()
    expect(getHistoryWorkspacesMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText(/Attach explicitly to a campaign/i))
    expect(await screen.findByRole('option', { name: 'Example campaign' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: 'ws-1' } })
    fireEvent.change(screen.getByPlaceholderText('Job title'), { target: { value: 'Engineer' } })
    fireEvent.change(screen.getByPlaceholderText('Company'), { target: { value: 'Example Corp' } })
    fireEvent.change(screen.getByPlaceholderText('Paste the job description'), { target: { value: 'A sufficiently detailed pasted listing description.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach pasted listing' }))
    await waitFor(() => expect(importJobTextMock).toHaveBeenCalledWith({
        campaign_id: 'ws-1', job_title: 'Engineer', company_name: 'Example Corp',
        job_description: 'A sufficiently detailed pasted listing description.',
      }, expect.anything()))
  })
})
