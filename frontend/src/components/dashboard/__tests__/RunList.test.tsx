import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { Clock } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { RunList } from '#/components/dashboard/RunList'
import { formatRunDate } from '#/components/dashboard/RunRow'

const items = vi.hoisted(() => ({ current: [] as unknown[] }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated' }) }))
vi.mock('#/hooks/useHistory', () => ({
  useHistory: () => ({ data: { items: items.current }, isPending: false }),
}))
vi.mock('#/components/ui/motion', () => ({
  ScrollFadeUp: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const base = { label: 'A run', created_at: new Date().toISOString(), is_favorite: false }

function renderList(viewAllTo?: '/history') {
  return render(
    <RunList
      eyebrow="Recent"
      title="Pick up"
      emptyIcon={Clock}
      emptyText="empty"
      unauthText="unauth"
      queryParams={{ page: 1, page_size: 3 }}
      viewAllTo={viewAllTo}
    />,
  )
}

describe('RunList', () => {
  it('labels application drafts and opens their application', () => {
    items.current = [
      { ...base, id: 'd1', tool_name: 'application-drafts', workspace: { id: 'ws-1' } },
    ]
    const { container } = renderList()
    expect(screen.getByText('Application')).toBeTruthy()
    expect(screen.queryByText('application-drafts')).toBeNull()
    expect(container.querySelector('.run-row-icon-col')).toBeTruthy()
    expect(container.querySelector('a.run-row')?.getAttribute('href')).toBe('/campaigns/ws-1')
  })

  it('renders older CV Studio runs as a plain row instead of a dead link', () => {
    items.current = [{ ...base, id: 'c1', tool_name: 'cv-quality' }]
    const { container } = renderList()
    expect(screen.getByText('CV Studio')).toBeTruthy()
    expect(container.querySelector('a.run-row')).toBeNull()
    expect(container.querySelector('.run-row-icon-col')).toBeTruthy()
  })

  it('opens registry tool results and offers View all', () => {
    items.current = [{ ...base, id: 'r1', tool_name: 'resume' }]
    const { container } = renderList('/history')
    expect(container.querySelector('a.run-row')?.getAttribute('href')).toBe('/resume/result/r1')
    expect(screen.getByRole('link', { name: 'View all' }).getAttribute('href')).toBe('/history')
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
