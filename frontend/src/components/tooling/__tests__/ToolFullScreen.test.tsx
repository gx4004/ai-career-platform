import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { SidebarProvider, useSidebar } from '#/components/ui/sidebar'

const mockUseIsMobile = vi.hoisted(() => vi.fn())

vi.mock('#/hooks/use-mobile', () => ({
  useIsMobile: mockUseIsMobile,
}))

function SidebarStateProbe() {
  const { state } = useSidebar()

  return <div data-testid="sidebar-state" data-state={state} />
}

function Harness({
  show = true,
  defaultOpen = true,
}: {
  show?: boolean
  defaultOpen?: boolean
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <SidebarStateProbe />
      {show ? (
        <ToolFullScreen accent="#0A66C2">
          <div>Tool workspace</div>
        </ToolFullScreen>
      ) : null}
    </SidebarProvider>
  )
}

describe('ToolFullScreen', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false)
    document.body.className = ''
  })

  it('collapses the desktop sidebar while mounted and restores the prior state on cleanup', async () => {
    const { rerender } = render(<Harness />)

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-state').getAttribute('data-state')).toBe(
        'collapsed',
      )
    })

    expect(document.body.classList.contains('tool-fullscreen-open')).toBe(true)

    rerender(<Harness show={false} />)

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-state').getAttribute('data-state')).toBe(
        'expanded',
      )
    })

    expect(document.body.classList.contains('tool-fullscreen-open')).toBe(false)
  })
})
