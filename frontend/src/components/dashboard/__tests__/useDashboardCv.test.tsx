import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboardCv } from '#/components/dashboard/useDashboardCv'

const listCvDocuments = vi.hoisted(() => vi.fn())
const getHistory = vi.hoisted(() => vi.fn())
const listApplications = vi.hoisted(() => vi.fn())
const session = vi.hoisted(() => ({ status: 'authenticated' }))

vi.mock('#/lib/api/client', () => ({ listCvDocuments, getHistory, listApplications }))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: session.status }) }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const cv = (name: string, updated_at: string) => ({ id: name, name, updated_at })

describe('useDashboardCv', () => {
  beforeEach(() => {
    session.status = 'authenticated'
    listCvDocuments.mockReset()
    getHistory.mockReset()
    listApplications.mockReset().mockResolvedValue({ items: [], total: 0 })
  })

  it('is a newcomer with no CV and no resume run', async () => {
    listCvDocuments.mockResolvedValue({ items: [] })
    getHistory.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1, has_more: false })
    const { result } = renderHook(() => useDashboardCv(), { wrapper })

    expect(result.current.pending).toBe(true)
    expect(result.current.isNewcomer).toBe(false)
    await waitFor(() => expect(result.current.isNewcomer).toBe(true))
    expect(result.current.pending).toBe(false)
  })

  it('picks the most recently edited CV and is no newcomer', async () => {
    listCvDocuments.mockResolvedValue({
      items: [cv('Old', '2026-01-01T00:00:00Z'), cv('New', '2026-09-01T00:00:00Z')],
    })
    getHistory.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1, has_more: false })
    const { result } = renderHook(() => useDashboardCv(), { wrapper })

    await waitFor(() => expect(result.current.latest?.name).toBe('New'))
    expect(result.current.isNewcomer).toBe(false)
  })

  it('is no newcomer once a resume was analysed, even without a CV', async () => {
    listCvDocuments.mockResolvedValue({ items: [] })
    getHistory.mockResolvedValue({ items: [{}], total: 1, page: 1, page_size: 1, has_more: false })
    const { result } = renderHook(() => useDashboardCv(), { wrapper })

    await waitFor(() => expect(result.current.hasResumeRun).toBe(true))
    expect(result.current.isNewcomer).toBe(false)
    expect(result.current.latest).toBeNull()
  })

  it('keeps the first steps after the first resume run, until there is an application', async () => {
    listCvDocuments.mockResolvedValue({ items: [] })
    getHistory.mockResolvedValue({ items: [{}], total: 1, page: 1, page_size: 1, has_more: false })
    const { result } = renderHook(() => useDashboardCv(), { wrapper })

    await waitFor(() => expect(result.current.showFirstSteps).toBe(true))
    expect(result.current.isNewcomer).toBe(false)
    expect(result.current.hasResume).toBe(true)
    expect(result.current.stepsPending).toBe(false)
  })

  it('drops the first steps once an application exists, and never shows them on a failed lookup', async () => {
    listCvDocuments.mockResolvedValue({ items: [] })
    getHistory.mockResolvedValue({ items: [{}], total: 1, page: 1, page_size: 1, has_more: false })
    listApplications.mockResolvedValue({ items: [{ id: 'a1' }], total: 1 })
    const first = renderHook(() => useDashboardCv(), { wrapper })
    await waitFor(() => expect(first.result.current.stepsPending).toBe(false))
    expect(first.result.current.showFirstSteps).toBe(false)
    first.unmount()

    listApplications.mockRejectedValue(new Error('down'))
    const second = renderHook(() => useDashboardCv(), { wrapper })
    await waitFor(() => expect(second.result.current.stepsPending).toBe(false))
    expect(second.result.current.showFirstSteps).toBe(false)
  })

  it('never calls a failed lookup "no CV"', async () => {
    listCvDocuments.mockRejectedValue(new Error('down'))
    getHistory.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 1, has_more: false })
    const { result } = renderHook(() => useDashboardCv(), { wrapper })

    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.isNewcomer).toBe(false)
  })

  it('does not look anything up for a guest', () => {
    session.status = 'guest'
    const { result } = renderHook(() => useDashboardCv(), { wrapper })

    expect(result.current.pending).toBe(false)
    expect(result.current.isNewcomer).toBe(false)
    expect(listCvDocuments).not.toHaveBeenCalled()
  })
})
