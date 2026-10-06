import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentToolRuns } from '#/components/tooling/toolPageShared'

const getHistoryMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'authenticated'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ to, search, children, ...props }: { to: string; search?: Record<string, string>; children: React.ReactNode }) => (
      <a href={search ? `${to}?${new URLSearchParams(search)}` : to} {...props}>{children}</a>
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

function run(id: string, label: string | null, tool = 'resume', workspace: Record<string, unknown> | null = null) {
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
    workspace,
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

  it('lists the last runs as links to their results, the score as a pill, and a link to all of them in History', async () => {
    getHistoryMock.mockResolvedValue({
      items: [run('r1', 'Resume Analysis (77/100)'), run('r2', null)],
      total: 2,
      page: 1,
      page_size: 3,
      has_more: false,
    })
    renderRuns()
    expect(await screen.findByRole('heading', { name: 'Recent runs' })).toBeTruthy()
    const link = await screen.findByRole('link', { name: 'Resume Analysis' })
    expect(link.getAttribute('href')).toBe('/resume/result/r1')
    expect(link.closest('li')?.querySelector('.kit-badge[data-score]')?.textContent).toBe('77/100')
    // Two runs can share a name: each link is described by its own date and score.
    const description = document.getElementById(link.getAttribute('aria-describedby') ?? '')?.textContent ?? ''
    expect(description).toContain('Oct 3')
    expect(description).toContain('score 77/100')
    const viewAll = screen.getByRole('link', { name: 'View all Resume Analyzer runs in History' })
    expect(viewAll.textContent).toBe('View all')
    expect(viewAll.getAttribute('href')).toBe('/history?tool=resume')
    expect(screen.getByRole('link', { name: 'Untitled run' }).getAttribute('href')).toBe('/resume/result/r2')
    expect(screen.getByRole('list', { name: 'Recent runs' }).querySelectorAll('li')).toHaveLength(2)
    expect(getHistoryMock).toHaveBeenCalledWith({ tool: 'resume', page: 1, page_size: 3 })
  })

  it('tells two runs with the same label apart by what they were about', async () => {
    const workspace = (role: string, company: string) => ({
      id: `ws-${company}`, label: null, is_pinned: false, company, role, status: 'saved', deadline: null,
      listing: null, linked_run_ids: [], updated_at: '2026-10-03T10:00:00Z',
    })
    getHistoryMock.mockResolvedValue({
      items: [
        run('r1', 'Job Match (48%)', 'job-match', workspace('Platform Engineer', 'Northwind Labs')),
        run('r2', 'Job Match (48%)', 'job-match', workspace('Data Analyst', 'Harbor Health')),
      ],
      total: 2, page: 1, page_size: 3, has_more: false,
    })
    renderRuns()
    expect(await screen.findByText(/Platform Engineer at Northwind Labs$/)).toBeTruthy()
    expect(screen.getByText(/Data Analyst at Harbor Health$/)).toBeTruthy()
  })

  it('adds the time when two rows would otherwise read the same', async () => {
    const at = (id: string, createdAt: string) => ({ ...run(id, 'Resume Analysis (93/100)'), created_at: createdAt })
    getHistoryMock.mockResolvedValue({
      items: [at('r1', '2026-10-03T14:02:00Z'), at('r2', '2026-10-03T10:00:00Z'), run('r3', 'Other run')],
      total: 3, page: 1, page_size: 3, has_more: false,
    })
    renderRuns()
    await screen.findByRole('link', { name: 'Other run' })
    // The date (and, when needed, the time) leads the line under the title.
    const metas = [...screen.getByRole('list', { name: 'Recent runs' }).querySelectorAll('li')].map(
      (row) => row.querySelector('.kit-row__subtitle')?.textContent ?? '',
    )
    const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    expect(metas[0]).toContain(time('2026-10-03T14:02:00Z'))
    expect(metas[1]).toContain(time('2026-10-03T10:00:00Z'))
    // A row with nothing to confuse it with keeps the plain date.
    expect(metas[2]).not.toContain(time('2026-10-03T10:00:00Z'))
  })

  it('tells a signed-in user with no runs what will appear (the section stays, no link to an empty History), and shows nothing to a guest', async () => {
    getHistoryMock.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 3, has_more: false })
    renderRuns()
    expect(await screen.findByText('No runs yet')).toBeTruthy()
    expect(screen.getByText('Your Resume Analyzer results will be listed here.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /View all/ })).toBeNull()

    cleanup()
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
