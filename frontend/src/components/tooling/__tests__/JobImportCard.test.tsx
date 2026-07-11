import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { JobImportCard } from '#/components/tooling/JobImportCard'
import { SAMPLE_JOB_DESCRIPTION } from '#/lib/tools/sampleContent'

const importJobUrlMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  importJobUrl: importJobUrlMock,
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
})
