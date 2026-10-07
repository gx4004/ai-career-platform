import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, openCommandPalette } from '#/components/app/CommandPalette'
import { getHistory } from '#/lib/api/client'
import { SidebarProvider } from '#/components/ui/sidebar'

const navigate = vi.hoisted(() => vi.fn())
const logout = vi.hoisted(() => vi.fn())
const sessionUser = vi.hoisted(() => ({ current: { id: 'u1', email: 'a@example.com', is_admin: false } as { id: string; email: string; is_admin: boolean } | null }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ user: sessionUser.current, logout, openAuthDialog: vi.fn() }),
}))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  getHistory: vi.fn(async () => ({
    items: [
      {
        id: 'run-1',
        tool_name: 'resume',
        label: 'Resume Analysis (77/100)',
        is_favorite: false,
        created_at: '2026-10-03T10:00:00Z',
        metadata: {},
      },
    ],
    total: 1,
    page: 1,
    page_size: 12,
  })),
  listApplications: vi.fn(async () => ({
    items: [{ id: 'app-1', title: 'Platform Engineer', label: null, company: 'Harbor Health', status: 'saved' }],
    total: 1,
  })),
}))

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CommandPalette />
    </QueryClientProvider>,
  )
}

describe('CommandPalette', () => {
  beforeEach(() => {
    // jsdom has no layout, so no scrolling.
    Element.prototype.scrollIntoView = vi.fn()
    navigate.mockReset()
    sessionUser.current = { id: 'u1', email: 'a@example.com', is_admin: false }
  })

  it('opens with ⌘K and jumps to the highlighted page on Enter', async () => {
    renderPalette()
    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    // The dialog is its own chunk, loaded on first open.
    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'disc' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(navigate).toHaveBeenCalledWith({ to: '/discovery' })
  })

  it('ranks word starts above inner matches: "cover" opens Cover Letter, not Discover', async () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'cover' } })
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('Cover Letter')
    // The weaker substring match is still offered, just lower.
    expect(screen.getByRole('option', { name: /Discover/ })).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith({ to: '/cover-letter' })
  })

  it('lists applications and moves the selection with the arrow keys', async () => {
    renderPalette()
    openCommandPalette()

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'harbor' } })
    expect(await screen.findByRole('option', { name: /Platform Engineer/ })).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith({ to: '/campaigns/app-1' })
  })

  it('hides job-search destinations from guests', async () => {
    sessionUser.current = null
    renderPalette()
    openCommandPalette()

    fireEvent.change(await screen.findByRole('combobox', { name: 'Search' }), { target: { value: 'discover' } })
    expect(screen.getByText(/No results for/)).toBeTruthy()
    // A die-cut empty state carries the tilted lemon icon disc, as every other compact one does (STICKER 1.16).
    expect(screen.getByText(/No results for/).closest('.kit-empty')?.querySelector('.kit-empty__icon svg')).toBeTruthy()
  })

  it('groups results under Go to, Tools and Applications headings', async () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'e' } })
    expect(await screen.findByRole('option', { name: /Platform Engineer/ })).toBeTruthy()

    const goTo = screen.getByRole('group', { name: 'Go to' })
    expect(within(goTo).getByRole('option', { name: /Settings/ })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Tools' })).getAllByRole('option').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('group', { name: 'Applications' })).getByRole('option', { name: /Harbor Health/ })).toBeTruthy()
  })

  it('moves the active option with the arrow keys and announces it through aria-activedescendant', async () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    const first = screen.getAllByRole('option')[0]
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const second = screen.getAllByRole('option')[1]
    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(second.id)
    expect(first.getAttribute('aria-selected')).toBe('false')
  })

  it('opens an option on click and closes', async () => {
    renderPalette()
    act(() => openCommandPalette())

    fireEvent.click(await screen.findByRole('option', { name: /Profile/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/profile' })
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('says so when nothing matches, without an empty listbox', async () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'zzzqqq' } })

    expect(screen.getByRole('status').textContent).toContain('No results for “zzzqqq”')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-controls')).toBeNull()
  })

  it('closes on Escape and clears the query for next time', async () => {
    renderPalette()
    act(() => openCommandPalette())
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search' }), { target: { value: 'hist' } })

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search' }), { key: 'Escape' })
    expect(screen.queryByRole('combobox')).toBeNull()

    act(() => openCommandPalette())
    expect((screen.getByRole('combobox', { name: 'Search' }) as HTMLInputElement).value).toBe('')
  })

  it('has an Actions group: Sign out signs out, and does nothing else', async () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'sign out' } })
    const actions = screen.getByRole('group', { name: 'Actions' })
    expect(within(actions).getByRole('option', { name: /Sign out/ })).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(logout).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('finds a saved run by its tool and opens its result page', async () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'analysis' } })
    const runs = await screen.findByRole('group', { name: 'Recent runs' })
    fireEvent.click(within(runs).getByRole('option', { name: /Resume Analysis \(77\/100\)/ }))

    expect(navigate).toHaveBeenCalledWith({ to: '/resume/result/run-1' })
  })

  it('finds pages by what they hold: "run" finds History and the recent runs, "pipeline" finds Applications', async () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'run' } })
    const pages = await screen.findByRole('group', { name: 'Go to' })
    expect(within(pages).getByRole('option', { name: /History/ })).toBeTruthy()
    expect(await screen.findByRole('group', { name: 'Recent runs' })).toBeTruthy()

    fireEvent.change(input, { target: { value: 'pipeline' } })
    expect(within(await screen.findByRole('group', { name: 'Go to' })).getByRole('option', { name: /Applications/ })).toBeTruthy()
    fireEvent.change(input, { target: { value: 'skills' } })
    expect(within(await screen.findByRole('group', { name: 'Go to' })).getByRole('option', { name: /Profile/ })).toBeTruthy()
  })

  it('offers Sign in instead of Sign out to guests', async () => {
    sessionUser.current = null
    renderPalette()
    act(() => openCommandPalette())

    const actions = await screen.findByRole('group', { name: 'Actions' })
    expect(within(actions).getByRole('option', { name: /Sign in/ })).toBeTruthy()
    expect(within(actions).queryByRole('option', { name: /Sign out/ })).toBeNull()
  })

  // Sign-off r4 chrome-F04: Esc pressed while the dialog's chunk was still loading was lost, and the palette opened
  // a second later although it had been dismissed.
  it('stays shut when Esc comes before the dialog has loaded', async () => {
    renderPalette()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })

    await act(async () => {
      await import('#/components/app/CommandPaletteDialog')
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(screen.queryByRole('combobox')).toBeNull()

    // The shortcut still opens it afterwards.
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(await screen.findByRole('combobox', { name: 'Search' })).toBeTruthy()
  })

  // Sign-off r4 chrome-F05: every run carried the keyword "result", so "res" (looking for Resume) listed every run.
  it('finds runs by their tool: "res" lists the Resume runs, not every run', async () => {
    vi.mocked(getHistory).mockResolvedValueOnce({
      items: [
        { id: 'run-1', tool_name: 'resume', label: 'Resume Analysis (77/100)', is_favorite: false, created_at: '2026-10-03T10:00:00Z', metadata: {} },
        { id: 'run-2', tool_name: 'portfolio', label: 'Portfolio Roadmap', is_favorite: false, created_at: '2026-10-02T10:00:00Z', metadata: {} },
        { id: 'run-3', tool_name: 'interview', label: 'Interview Prep', is_favorite: false, created_at: '2026-10-01T10:00:00Z', metadata: {} },
      ],
      total: 3,
      page: 1,
      page_size: 12,
    } as never)
    renderPalette()
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'res' } })
    const runs = await screen.findByRole('group', { name: 'Recent runs' })
    expect(within(runs).getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('Resume Analysis (77/100)'),
    ])
  })

  // Sign-off r4 chrome-F06: the sidebar row's ⌘B is a keyboard hint, set apart so a touch screen can hide it.
  it('sets the sidebar shortcut apart from the row text', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SidebarProvider defaultOpen>
          <CommandPalette />
        </SidebarProvider>
      </QueryClientProvider>,
    )
    act(() => openCommandPalette())

    const input = await screen.findByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'collapse' } })
    const row = await screen.findByRole('option', { name: /Collapse the sidebar/ })
    expect(row.querySelector('.app-palette__shortcut')?.textContent).toMatch(/B$/)
  })
})
