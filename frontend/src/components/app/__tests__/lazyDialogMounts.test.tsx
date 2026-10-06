import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthDialogMount } from '#/components/app/AuthDialogMount'
import { CommandPalette, openCommandPalette } from '#/components/app/CommandPalette'

const session = vi.hoisted(() => ({ authDialogOpen: false }))

vi.mock('#/hooks/useSession', () => ({ useSession: () => session }))

// Both dialog chunks fail to load (offline, or a deploy replaced the hashed files).
vi.mock('#/components/app/CommandPaletteDialog', () => {
  throw new Error('Failed to fetch dynamically imported module')
})
vi.mock('#/components/auth/AuthDialog', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

describe('lazily loaded dialogs whose chunk fails to load', () => {
  afterEach(() => {
    session.authDialogOpen = false
    vi.restoreAllMocks()
  })

  it('the command palette closes quietly and the page stays', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <p>Page content</p>
        <CommandPalette />
      </div>,
    )
    act(() => openCommandPalette())
    // Opening again retries with a fresh import instead of rethrowing the cached failure.
    await new Promise((resolve) => setTimeout(resolve, 20))
    act(() => openCommandPalette())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByText('Page content')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the session-expired dialog falls back to a full load of the sign-in page and the page stays', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      pathname: '/history',
      search: '?page=2',
      assign,
    } as Location)
    session.authDialogOpen = true
    render(
      <div>
        <p>Page content</p>
        <AuthDialogMount />
      </div>,
    )
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login?returnTo=%2Fhistory%3Fpage%3D2'))
    expect(screen.getByText('Page content')).toBeTruthy()
  })
})
