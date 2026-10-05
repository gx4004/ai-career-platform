import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SidebarProvider, useSidebar } from '#/components/ui/sidebar'

function Probe() {
  const { state, toggleSidebar } = useSidebar()
  return (
    <button type="button" data-state={state} onClick={toggleSidebar}>
      toggle
    </button>
  )
}

const state = () => screen.getByRole('button', { name: 'toggle' }).getAttribute('data-state')

function clearSidebarCookie() {
  document.cookie = 'sidebar_state=; path=/; max-age=0'
}

describe('SidebarProvider railRoute', () => {
  beforeEach(clearSidebarCookie)

  it('is the rail on a rail route, expands for one visit, and never touches the saved preference', () => {
    const { rerender } = render(
      <SidebarProvider railRoute>
        <Probe />
      </SidebarProvider>,
    )
    expect(state()).toBe('collapsed')

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(state()).toBe('expanded')
    expect(document.cookie).not.toContain('sidebar_state')

    // Leaving the route restores the saved (expanded by default) preference; coming back is the rail again.
    rerender(
      <SidebarProvider railRoute={false}>
        <Probe />
      </SidebarProvider>,
    )
    expect(state()).toBe('expanded')
    rerender(
      <SidebarProvider railRoute>
        <Probe />
      </SidebarProvider>,
    )
    expect(state()).toBe('collapsed')
  })

  it('restores a collapsed preference on leaving the rail route, and still writes the cookie off the rail', () => {
    document.cookie = 'sidebar_state=false; path=/'
    const { rerender } = render(
      <SidebarProvider railRoute>
        <Probe />
      </SidebarProvider>,
    )
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    })
    expect(state()).toBe('expanded')

    rerender(
      <SidebarProvider railRoute={false}>
        <Probe />
      </SidebarProvider>,
    )
    expect(state()).toBe('collapsed')
    expect(document.cookie).toContain('sidebar_state=false')

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    expect(document.cookie).toContain('sidebar_state=true')
  })
})
