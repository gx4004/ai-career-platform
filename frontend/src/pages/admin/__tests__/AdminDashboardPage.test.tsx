import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminDashboardPage } from '#/pages/admin/admin-dashboard-page'

const statsMock = vi.hoisted(() => vi.fn())
const healthMock = vi.hoisted(() => vi.fn())
const runsMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminStats: statsMock,
  getAdminHealth: healthMock,
  getAdminRuns: runsMock,
}))

const HEALTHY = {
  database: 'ok',
  llm_provider: 'vertex',
  llm_model: 'gemini-2.5-flash',
  cache_enabled: true,
  cache_entries: 1,
  environment: 'production',
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminDashboardPage />
    </QueryClientProvider>,
  )
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    statsMock.mockReset().mockResolvedValue({
      total_users: 67,
      total_runs: 192,
      runs_today: 11,
      active_users_7d: 21,
      runs_by_tool: { resume: 54, 'job-match': 43, 'application-drafts': 18 },
    })
    healthMock.mockReset().mockResolvedValue(HEALTHY)
    runsMock.mockReset().mockResolvedValue({
      items: [{ created_at: new Date().toISOString() }, { created_at: new Date().toISOString() }],
      total: 2,
      page: 1,
      page_size: 100,
    })
  })

  it('shows the four numbers, one panel each', async () => {
    renderPage()
    expect(await screen.findByText('Total users')).toBeTruthy()
    for (const label of ['Total runs', 'Runs today', 'Active users (7d)']) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.getByText('67')).toBeTruthy()
  })

  it('draws the last 14 days of runs as a chart that names its numbers', async () => {
    renderPage()
    const chart = await screen.findByRole('img', { name: /Runs per day, last 14 days/ })
    expect(chart.getAttribute('aria-label')).toMatch(/ 2$/)
    expect(screen.getByText('Runs in 14 days').nextElementSibling?.textContent).toBe('2')
  })

  it('lists the tools busiest first, each with its tile colour', async () => {
    renderPage()
    const list = within(await screen.findByRole('list', { name: 'Runs by tool' }))
    const names = list.getAllByRole('listitem').map((row) => row.textContent)
    expect(names[0]).toContain('Resume Analyzer')
    expect(names[0]).toContain('54')
    expect(names[2]).toContain('Application drafts')
    expect(list.getAllByRole('listitem')[0].querySelector('.admin-bar')?.getAttribute('data-tone')).toBe('tangerine')
  })

  it('stamps one seal when the database answers and a provider is configured', async () => {
    renderPage()
    expect(await screen.findByText('All systems healthy')).toBeTruthy()
    expect(screen.getByText('System status')).toBeTruthy()
    expect(screen.getByText('vertex / gemini-2.5-flash')).toBeTruthy()
  })

  it('does not claim health when the database is down, and says the fake provider has no model', async () => {
    healthMock.mockResolvedValue({ ...HEALTHY, database: 'error', llm_provider: 'fake' })
    renderPage()
    expect(await screen.findByText('error')).toBeTruthy()
    expect(screen.queryByText('All systems healthy')).toBeNull()
    expect(screen.getByText('fake (local fixtures, no model)')).toBeTruthy()
  })

  it('offers a retry when the stats fail', async () => {
    statsMock.mockRejectedValueOnce(new Error('boom'))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Total users')).toBeTruthy()
  })
})
