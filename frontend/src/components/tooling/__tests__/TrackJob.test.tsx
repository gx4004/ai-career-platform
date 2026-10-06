import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '#/components/kit'
import type { ToolRunDetail } from '#/lib/api/schemas'

const requestMock = vi.fn()
vi.mock('#/lib/api/client', () => ({ request: (...args: unknown[]) => requestMock(...args) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: { to: string; params?: Record<string, string>; children: React.ReactNode }) => (
    <a href={to.replace('$campaignId', params?.campaignId ?? '')} {...props}>{children}</a>
  ),
}))

import { TrackJobRow, knownJob } from '#/components/tooling/TrackJob'

const application = {
  id: 'app-9', label: 'Staff Engineer at Northwind', title: 'Staff Engineer', company: 'Northwind', role: 'Staff Engineer',
  status: 'saved', deadline: null, listing: null, is_pinned: false, updated_at: '2026-10-06T00:00:00Z',
}
const run = (workspace: Partial<NonNullable<ToolRunDetail['workspace']>> | null = null) =>
  ({ id: 'run-1', workspace }) as unknown as ToolRunDetail

function renderRow(item: ToolRunDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ul>
          <TrackJobRow item={item} />
        </ul>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  requestMock.mockReset()
})

describe('TrackJobRow', () => {
  it('tracks the job with the run attached and then links to the application', async () => {
    requestMock.mockResolvedValue(application)
    renderRow(run({ id: 'ws-1', role: 'Staff Engineer', company: 'Northwind', status: null, listing: null }))
    fireEvent.click(screen.getByRole('button', { name: 'Track job' }))
    const dialog = await screen.findByRole('dialog', { name: 'Track this job' })
    expect((screen.getByLabelText('Role') as HTMLInputElement).value).toBe('Staff Engineer')
    expect((screen.getByLabelText('Company') as HTMLInputElement).value).toBe('Northwind')
    fireEvent.submit(dialog.querySelector('form')!)
    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1))
    expect(requestMock.mock.calls[0][0]).toBe('/applications')
    expect(requestMock.mock.calls[0][1].body).toMatchObject({ history_id: 'run-1', role: 'Staff Engineer', company: 'Northwind' })
    const link = await screen.findByRole('link', { name: 'Open application' })
    expect(link.getAttribute('href')).toBe('/campaigns/app-9')
    expect(await screen.findByText('Added to your applications')).toBeTruthy()
  })

  it('shows an already tracked run as an application, with no Track button', () => {
    renderRow(run({ id: 'ws-2', role: 'Staff Engineer', company: 'Northwind', status: 'applied' as never }))
    expect(screen.getByText('In your applications')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open application' }).getAttribute('href')).toBe('/campaigns/ws-2')
    expect(screen.queryByRole('button', { name: 'Track job' })).toBeNull()
  })

  it('keeps the dialog open with a readable message when the request fails', async () => {
    requestMock.mockRejectedValue(Object.assign(new Error('Something went wrong on our side. Try again in a moment.'), { status: 500 }))
    renderRow(run(null))
    fireEvent.click(screen.getByRole('button', { name: 'Track job' }))
    fireEvent.change(await screen.findByLabelText('Role'), { target: { value: 'Platform Lead' } })
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } })
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    expect(await screen.findByText('Something went wrong on our side. Try again in a moment.')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('knownJob', () => {
  it('reads the "Role at Company" header the app writes on a handed-over job description', () => {
    expect(
      knownJob('Senior Backend Engineer at Northwind Labs\n\nWe build...', { targetRole: 'Senior Backend Engineer' }),
    ).toEqual({ role: 'Senior Backend Engineer', company: 'Northwind Labs' })
  })

  it('falls back to a re-generate job label, and never guesses from a pasted posting', () => {
    expect(knownJob('We are hiring at Acme a backend engineer who...', { jobLabel: 'Staff Engineer at Northwind' })).toEqual({
      role: 'Staff Engineer',
      company: 'Northwind',
    })
    expect(knownJob('We are hiring at Acme a backend engineer who...')).toBeNull()
    // A pasted posting with a short first line and a blank line is still the user's text, not an app header.
    expect(knownJob('Join our team at Acme\n\nWe build...')).toBeNull()
    expect(knownJob('Join our team at Acme\n\nWe build...', { targetRole: 'Backend Engineer' })).toBeNull()
    expect(knownJob('')).toBeNull()
  })
})

describe('TrackJobRow prefill', () => {
  it('prefills Role and Company from what the Job Match run reports', async () => {
    renderRow({
      id: 'run-2',
      workspace: null,
      result_payload: { job_title: 'Senior Backend Engineer, Platform', company: 'Northwind Labs' },
    } as unknown as ToolRunDetail)
    fireEvent.click(screen.getByRole('button', { name: 'Track job' }))
    await screen.findByRole('dialog', { name: 'Track this job' })
    expect((screen.getByLabelText('Role') as HTMLInputElement).value).toBe('Senior Backend Engineer, Platform')
    expect((screen.getByLabelText('Company') as HTMLInputElement).value).toBe('Northwind Labs')
  })
})
