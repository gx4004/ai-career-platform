import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolPageShell } from '#/components/tooling/toolPageShared'
import { tools } from '#/lib/tools/registry'

const getHistoryMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'guest'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ to, search: _search, children, ...props }: { to: string; search?: unknown; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: vi.fn() }),
}))
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistory: getHistoryMock,
}))

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToolPageShell toolId="job-match">
        <form aria-label="Job Match input form" />
      </ToolPageShell>
    </QueryClientProvider>,
  )
}

describe('ToolPageShell: form column plus a side rail', () => {
  beforeEach(() => {
    getHistoryMock.mockReset()
  })

  it('gives a guest the form and, beside it, what the tool gives back (never an empty rail)', () => {
    sessionStatus = 'guest'
    renderShell()
    const rail = screen.getByRole('complementary', { name: 'About Job Match' })
    expect(within(rail).getByRole('heading', { name: 'What you get' })).toBeTruthy()
    const lines = within(rail).getByRole('list', { name: 'What you get' })
    expect([...lines.querySelectorAll('li')].map((li) => li.textContent)).toEqual(
      tools['job-match'].delivers.map((line, index) => `${index + 1}${line}`),
    )
    expect(within(rail).queryByRole('heading', { name: 'Recent runs' })).toBeNull()
    expect(rail.contains(screen.getByRole('form', { name: 'Job Match input form' }))).toBe(false)
    expect(getHistoryMock).not.toHaveBeenCalled()
  })

  it('leads the rail with the signed-in user’s recent runs of this tool', async () => {
    sessionStatus = 'authenticated'
    getHistoryMock.mockResolvedValue({
      items: [
        {
          id: 'r1', tool_name: 'job-match', label: 'Job Match (74%)', is_favorite: false,
          created_at: '2026-10-03T10:00:00Z', saved: true, access_mode: 'authenticated',
          locked_actions: [], metadata: {}, workspace: null,
        },
      ],
      total: 1, page: 1, page_size: 3, has_more: false,
    })
    renderShell()
    const rail = screen.getByRole('complementary', { name: 'About Job Match' })
    // consistency-F23: a run with no subject is titled by when it ran, not by the tool's name.
    await within(rail).findByRole('link', { name: /^Oct 3, / })
    const headings = within(rail).getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Recent runs', 'What you get'])
  })
})
