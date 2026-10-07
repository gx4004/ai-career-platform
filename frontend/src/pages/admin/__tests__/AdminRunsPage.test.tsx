import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminRunsPage } from '#/pages/admin/admin-runs-page'

const getAdminRunsMock = vi.hoisted(() => vi.fn())
const getAdminRunMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminRuns: getAdminRunsMock,
  getAdminRun: getAdminRunMock,
}))

const run = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  user_id: `${id}-user-0000`,
  user_email: 'ada@example.com',
  tool_name: 'job-match',
  label: 'Job Match (75%)',
  created_at: '2026-10-01T09:30:00Z',
  has_parent: false,
  ...overrides,
})

function renderPage(items: unknown[]) {
  getAdminRunsMock.mockResolvedValue({ items, total: items.length, page: 1, page_size: 20 })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminRunsPage />
    </QueryClientProvider>,
  )
}

describe('AdminRunsPage', () => {
  beforeEach(() => {
    getAdminRunsMock.mockReset()
    getAdminRunMock.mockReset().mockResolvedValue({
      ...run('r-1'),
      result_payload: { score: 75 },
      feedback_text: 'Useful.',
      workspace_id: null,
    })
  })

  it('says which tool made a run only when its label does not', async () => {
    renderPage([run('r-1'), run('r-2', { label: 'Backend application', tool_name: 'cover-letter' })])
    expect(await screen.findByRole('button', { name: 'Job Match (75%)' })).toBeTruthy()
    expect(screen.getAllByText('Job Match')).toHaveLength(1) // the filter option, not a repeated line
    expect(screen.getByText('Cover Letter', { selector: '.admin-subline' })).toBeTruthy()
  })

  it('opens the saved result of a run in a dialog and returns focus to the row', async () => {
    renderPage([run('r-1')])
    const opener = await screen.findByRole('button', { name: 'Job Match (75%)' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Run detail' })
    await waitFor(() => expect(dialog.textContent).toContain('"score": 75'))
    expect(dialog.textContent).toContain('Useful.')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers every kind of run the backend records, not only the six tools', async () => {
    renderPage([run('r-1')])
    await screen.findByRole('button', { name: 'Job Match (75%)' })
    const options = within(screen.getByRole('combobox', { name: 'Tool' })).getAllByRole('option')
    const values = options.map((option) => (option as HTMLOptionElement).value)
    expect(values).toEqual(expect.arrayContaining(['application-drafts', 'application-reviewer', 'cv-tailoring']))
  })

  it('keeps a long unbroken label inside its column', async () => {
    renderPage([run('r-1', { label: 'x'.repeat(300), tool_name: 'application-reviewer' })])
    const opener = await screen.findByRole('button', { name: 'x'.repeat(300) })
    expect(opener.closest('.admin-run')).toBeTruthy()
  })

  it('lets the run and its user share the width and stacks the rows under 48rem (consistency-F16)', async () => {
    renderPage([run('r-1')])
    const wrap = (await screen.findByRole('table', { name: 'Runs' })).closest('.kit-table-wrap') as HTMLElement
    expect(wrap.style.getPropertyValue('--kit-table-stack-below')).toBe('48')
    // Only Created keeps a fixed width; a 20rem User squeezed the run title to 3-5 lines on a tablet.
    expect([...wrap.querySelectorAll('col')].map((col) => col.style.width)).toEqual(['', '', '11rem'])
  })

  it('brings the tool filter and the rows back into view after Next, not the rows alone (account-admin-AA-F14)', async () => {
    const scrolled: Element[] = []
    // jsdom has no scrollIntoView: record which element the pager scrolls to.
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    // The list's top has scrolled out of view (Next pressed at the bottom of a long phone page).
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: -500 } as DOMRect)
    try {
      getAdminRunsMock.mockResolvedValue({ items: [run('r-1')], total: 45, page: 1, page_size: 20 })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={client}>
          <AdminRunsPage />
        </QueryClientProvider>,
      )
      await screen.findByRole('button', { name: 'Job Match (75%)' })
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      expect(scrolled).toHaveLength(1)
      expect(scrolled[0].contains(screen.getByRole('combobox', { name: 'Tool' }))).toBe(true)
      expect(scrolled[0].contains(screen.getByRole('table', { name: 'Runs' }))).toBe(true)
    } finally {
      HTMLElement.prototype.scrollIntoView = original
      rect.mockRestore()
    }
  })

  it('filters by tool and starts again from page one', async () => {
    renderPage([run('r-1')])
    await screen.findByRole('button', { name: 'Job Match (75%)' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Tool' }), { target: { value: 'resume' } })
    await waitFor(() =>
      expect(getAdminRunsMock).toHaveBeenLastCalledWith({ page: 1, page_size: 20, tool: 'resume' }),
    )
  })

  it('shows a load failure with the rose icon disc and a sentence on what it means', async () => {
    getAdminRunsMock.mockRejectedValue(new Error('500'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AdminRunsPage />
      </QueryClientProvider>,
    )
    const alert = (await screen.findByText("Couldn't load runs")).closest('.kit-error') as HTMLElement
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain("The server didn't send the list. Nothing was changed.")
    expect(alert.querySelector('.kit-empty__icon svg')).toBeTruthy()
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
