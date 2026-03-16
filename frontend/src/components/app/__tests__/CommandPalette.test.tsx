import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '#/components/app/CommandPalette'

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('#/hooks/useHistory', () => ({
  useHistory: () => ({
    data: {
      items: [],
    },
  }),
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: 'guest',
  }),
}))

vi.mock('#/lib/tools/registry', () => ({
  toolList: [],
}))

describe('CommandPalette', () => {
  beforeEach(() => {
    navigateMock.mockReset()
  })

  it('renders the dashboard result without the old secondary label while keeping other descriptions', async () => {
    render(<CommandPalette />)

    fireEvent.keyDown(window, {
      ctrlKey: true,
      key: 'k',
    })

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.queryByText('Command center')).toBeNull()
    expect(screen.getByText('Saved runs and favorites')).toBeTruthy()

    const dashboardResult = screen.getByText('Dashboard').closest('button')

    expect(dashboardResult).toBeTruthy()
    expect(within(dashboardResult!).queryByText('Command center')).toBeNull()
  })
})
