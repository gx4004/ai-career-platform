import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { SidebarProvider, useSidebar } from '#/components/ui/sidebar'

function SidebarStateProbe() {
  const { state } = useSidebar()
  return <div data-testid="sidebar-state" data-state={state} />
}

describe('ToolFullScreen', () => {
  it('renders the tool inside the shell without collapsing the sidebar', () => {
    render(
      <SidebarProvider defaultOpen>
        <SidebarStateProbe />
        <ToolFullScreen accent="#0A66C2">
          <div>Tool workspace</div>
        </ToolFullScreen>
      </SidebarProvider>,
    )

    expect(screen.getByText('Tool workspace')).toBeTruthy()
    expect(screen.getByTestId('sidebar-state').getAttribute('data-state')).toBe('expanded')
  })
})
