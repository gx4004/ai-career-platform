import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentToolRuns } from '#/components/tooling/toolPageShared'

const getHistoryMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'authenticated'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>{children}</a>
    ),
  }
})
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: vi.fn() }),
}))
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistory: getHistoryMock,
}))

function run(id: string, label: string | null, tool = 'resume') {
  return {
    id,
    tool_name: tool,
    label,
    is_favorite: false,
    created_at: '2026-10-03T10:00:00Z',
    saved: true,
    access_mode: 'authenticated',
    locked_actions: [],
    metadata: {},
    workspace: null,
  }
}

function renderRuns() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RecentToolRuns toolId="resume" />
    </QueryClientProvider>,
  )
}

describe('RecentToolRuns', () => {
  beforeEach(() => {
    sessionStatus = 'authenticated'
    getHistoryMock.mockReset()
  })

  it('lists the last runs as links to their results, with a date', async () => {
    getHistoryMock.mockResolvedValue({
      items: [run('r1', 'Resume Analysis (77/100)'), run('r2', null)],
      total: 2,
      page: 1,
      page_size: 3,
      has_more: false,
    })
    renderRuns()
    expect(await screen.findByRole('heading', { name: 'Recent runs' })).toBeTruthy()
    const link = await screen.findByRole('link', { name: 'Resume Analysis (77/100)' })
    expect(link.getAttribute('href')).toBe('/resume/result/r1')
    expect(screen.getByRole('link', { name: 'Untitled run' }).getAttribute('href')).toBe('/resume/result/r2')
    expect(screen.getByRole('list', { name: 'Recent runs' }).querySelectorAll('li')).toHaveLength(2)
    expect(getHistoryMock).toHaveBeenCalledWith({ tool: 'resume', page: 1, page_size: 3 })
  })

  it('shows nothing for a new user and nothing for a guest (no request is made)', async () => {
    getHistoryMock.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 3, has_more: false })
    const { container } = renderRuns()
    await waitFor(() => expect(getHistoryMock).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('section')).toBeNull())

    getHistoryMock.mockClear()
    sessionStatus = 'guest'
    const guest = renderRuns()
    expect(guest.container.querySelector('section')).toBeNull()
    expect(getHistoryMock).not.toHaveBeenCalled()
  })

  it('keeps the row height while loading and offers a retry when the list cannot be loaded', async () => {
    getHistoryMock.mockRejectedValueOnce(new Error('boom'))
    renderRuns()
    expect(await screen.findByText("Recent runs couldn't be loaded")).toBeTruthy()

    getHistoryMock.mockResolvedValueOnce({ items: [run('r1', 'Backend application')], total: 1, page: 1, page_size: 3, has_more: false })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Backend application' })).toBeTruthy()
  })
})
