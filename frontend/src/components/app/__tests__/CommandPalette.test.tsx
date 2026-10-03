import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette, openCommandPalette } from '#/components/app/CommandPalette'

const navigate = vi.hoisted(() => vi.fn())
const sessionUser = vi.hoisted(() => ({ current: { id: 'u1', email: 'a@example.com', is_admin: false } as { id: string; email: string; is_admin: boolean } | null }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ user: sessionUser.current }),
}))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
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

  it('opens with ⌘K and jumps to the highlighted page on Enter', () => {
    renderPalette()
    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = screen.getByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'disc' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(navigate).toHaveBeenCalledWith({ to: '/discovery' })
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

  it('moves the active option with the arrow keys and announces it through aria-activedescendant', () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = screen.getByRole('combobox', { name: 'Search' })
    const first = screen.getAllByRole('option')[0]
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const second = screen.getAllByRole('option')[1]
    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(second.id)
    expect(first.getAttribute('aria-selected')).toBe('false')
  })

  it('opens an option on click and closes', () => {
    renderPalette()
    act(() => openCommandPalette())

    fireEvent.click(screen.getByRole('option', { name: /Profile/ }))
    expect(navigate).toHaveBeenCalledWith({ to: '/profile' })
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('says so when nothing matches, without an empty listbox', () => {
    renderPalette()
    act(() => openCommandPalette())

    const input = screen.getByRole('combobox', { name: 'Search' })
    fireEvent.change(input, { target: { value: 'zzzqqq' } })

    expect(screen.getByRole('status').textContent).toContain('No results for “zzzqqq”')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(input.getAttribute('aria-controls')).toBeNull()
  })

  it('closes on Escape and clears the query for next time', () => {
    renderPalette()
    act(() => openCommandPalette())
    fireEvent.change(screen.getByRole('combobox', { name: 'Search' }), { target: { value: 'hist' } })

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search' }), { key: 'Escape' })
    expect(screen.queryByRole('combobox')).toBeNull()

    act(() => openCommandPalette())
    expect((screen.getByRole('combobox', { name: 'Search' }) as HTMLInputElement).value).toBe('')
  })
})
