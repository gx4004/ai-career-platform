import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPipeline } from '#/components/dashboard/DashboardPipeline'

const listApplications = vi.hoisted(() => vi.fn())
const getApplicationInsights = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({ listApplications, getApplicationInsights }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const item = (id: string, status: string) => ({ id, status })

function renderPipeline() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DashboardPipeline />
    </QueryClientProvider>,
  )
}

/** "Saved, 2": the label is first in the DOM, so assistive technology reads the stat the same way. */
const stat = (label: string) => screen.getByText(label).closest('dl') as HTMLElement

describe('DashboardPipeline', () => {
  beforeEach(() => {
    listApplications.mockReset()
    getApplicationInsights.mockReset()
    getApplicationInsights.mockResolvedValue({ overall: { applied: 4, replied: 2, reply_rate: 50 } })
  })

  it('counts the applications in each stage and shows the reply rate', async () => {
    listApplications.mockResolvedValue({
      items: [item('1', 'saved'), item('2', 'saved'), item('3', 'applied'), item('4', 'no_reply'), item('5', 'rejected'), item('6', 'withdrawn')],
      total: 6,
    })
    renderPipeline()

    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(within(stat('Saved')).getByText('2')).toBeTruthy()
    expect(within(stat('Applied')).getByText('2')).toBeTruthy()
    expect(within(stat('Closed')).getByText('2')).toBeTruthy()
    expect(within(stat('Offer')).getByText('0')).toBeTruthy()
    expect(await screen.findByText('Reply rate')).toBeTruthy()
    expect(within(stat('Reply rate')).getByText('50')).toBeTruthy()
  })

  it('leaves the reply rate out until there is one', async () => {
    getApplicationInsights.mockResolvedValue({ overall: { applied: 0, replied: 0, reply_rate: null } })
    listApplications.mockResolvedValue({ items: [], total: 0 })
    renderPipeline()

    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(screen.queryByText('Reply rate')).toBeNull()
  })

  it('links to the applications board once, from the heading', async () => {
    listApplications.mockResolvedValue({ items: [], total: 0 })
    renderPipeline()

    await screen.findByText('Saved')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('href')).toBe('/campaigns')
  })

  it('says it is loading, then says what failed and retries', async () => {
    listApplications.mockRejectedValueOnce(new Error('down'))
    renderPipeline()

    expect(screen.getByRole('status', { name: 'Loading your pipeline' })).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toContain("couldn't be loaded")

    listApplications.mockResolvedValue({ items: [], total: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Saved')).toBeTruthy()
  })
})
