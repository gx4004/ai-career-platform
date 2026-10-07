import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RunList } from '#/components/dashboard/RunList'
import { formatRunDate } from '#/components/dashboard/RunRow'
import { formatRunDay } from '#/lib/tools/runLabel'

const items = vi.hoisted(() => ({ current: [] as unknown[] }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated' }) }))
const query = vi.hoisted(() => ({ state: { isPending: false, isError: false, isFetching: false } }))
const refetch = vi.hoisted(() => vi.fn())
vi.mock('#/hooks/useHistory', () => ({
  useHistory: () => ({ data: { items: items.current }, refetch, ...query.state }),
}))

const base = { label: 'A run', created_at: new Date().toISOString(), is_favorite: false }

function renderList(viewAllTo?: '/history') {
  return render(
    <RunList
      title="Pick up"
      emptyTitle="Nothing yet"
      emptyText="Run a tool and it shows here."
      queryParams={{ page: 1, page_size: 3 }}
      viewAllTo={viewAllTo}
    />,
  )
}

describe('RunList', () => {
  beforeEach(() => {
    query.state = { isPending: false, isError: false, isFetching: false }
    refetch.mockReset()
  })

  it('labels application drafts and opens their application', () => {
    items.current = [
      { ...base, id: 'd1', tool_name: 'application-drafts', workspace: { id: 'ws-1' } },
    ]
    renderList()
    expect(screen.getByText('Application')).toBeTruthy()
    expect(screen.queryByText('application-drafts')).toBeNull()
    expect(screen.getByRole('link', { name: 'A run' }).getAttribute('href')).toBe('/campaigns/ws-1')
  })

  it('renders older CV Studio runs as a plain row instead of a dead link', () => {
    items.current = [{ ...base, id: 'c1', tool_name: 'cv-quality' }]
    renderList()
    expect(screen.getByText('CV Studio')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'A run' })).toBeNull()
    expect(screen.getByText('A run')).toBeTruthy()
  })

  it('opens registry tool results and offers View all', () => {
    items.current = [{ ...base, id: 'r1', tool_name: 'resume' }]
    renderList('/history')
    expect(screen.getByRole('link', { name: 'A run' }).getAttribute('href')).toBe('/resume/result/r1')
    expect(screen.getByRole('link', { name: 'View all' }).getAttribute('href')).toBe('/history')
  })

  it('does not repeat the tool name when the label already says it', () => {
    items.current = [{ ...base, id: 'r1', tool_name: 'job-match', label: 'Job Match (75%)' }]
    renderList()
    expect(screen.getByRole('link', { name: 'Job Match' })).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.queryByText('Match')).toBeNull()
  })

  it('shows the date of each run and its tool underneath the label', () => {
    items.current = [{ ...base, id: 'r1', tool_name: 'resume' }]
    renderList()
    expect(screen.getByText('Resume')).toBeTruthy()
    // A run from today reads "Today", as History's day heading does, not the bare date.
    expect(screen.getByText(formatRunDay(base.created_at))).toBeTruthy()
    expect(formatRunDay(base.created_at)).toBe('Today')
  })

  it('draws the score as a pill in the tool colour and keeps the name as the link', () => {
    items.current = [{ ...base, id: 'r1', tool_name: 'resume', label: 'Resume Analysis (77/100)' }]
    renderList()
    expect(screen.getByText('77/100').closest('.kit-badge')?.getAttribute('data-tone')).toBe('tangerine')
    expect(screen.getByRole('link', { name: 'Resume Analysis' })).toBeTruthy()
  })

  it('leaves a label alone when its brackets are not a score', () => {
    items.current = [{ ...base, id: 'r1', tool_name: 'resume', label: 'Backend resume (v2)' }]
    renderList()
    expect(screen.getByRole('link', { name: 'Backend resume (v2)' })).toBeTruthy()
  })

  it('draws nothing at all when asked to hide an empty list', () => {
    items.current = []
    const { container } = render(
      <RunList title="Pick up" emptyTitle="Nothing yet" emptyText="x" queryParams={{ page: 1 }} hideWhenEmpty />,
    )
    expect(container.textContent).toBe('')
  })

  it('shows an empty state with its title and sentence', () => {
    items.current = []
    renderList()
    expect(screen.getByText('Nothing yet')).toBeTruthy()
    expect(screen.getByText('Run a tool and it shows here.')).toBeTruthy()
  })

  it('shows a busy list while loading, so the layout does not move', () => {
    query.state = { isPending: true, isError: false, isFetching: true }
    items.current = []
    renderList()
    expect(screen.getByRole('list', { name: 'Pick up' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText('Nothing yet')).toBeNull()
  })

  it('says what failed and retries', () => {
    query.state = { isPending: false, isError: true, isFetching: false }
    items.current = []
    renderList()
    expect(screen.getByRole('alert').textContent).toContain("Pick up couldn't be loaded")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('formatRunDate', () => {
  const now = new Date(2026, 8, 30)

  it('omits the year in the current year', () => {
    expect(formatRunDate(new Date(2026, 8, 5), now)).toMatch(/^Sep 5$|^5 Sep$/)
  })

  it('adds the year otherwise', () => {
    expect(formatRunDate(new Date(2025, 11, 24), now)).toContain('2025')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatRunDate('nope', now)).toBe('')
  })
})
