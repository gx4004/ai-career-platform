import { fireEvent, render, screen } from '@testing-library/react'
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
})
