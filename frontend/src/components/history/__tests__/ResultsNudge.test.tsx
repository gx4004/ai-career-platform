import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultsNudge } from '#/components/history/ResultsNudge'

const flagMock = vi.hoisted(() => vi.fn())
const useHistoryMock = vi.hoisted(() => vi.fn())
const trackTelemetryMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/flags/featureFlags', () => ({
  isR7ResultsNudgeEnabled: flagMock,
}))

vi.mock('#/hooks/useHistory', () => ({
  useHistory: useHistoryMock,
}))

vi.mock('#/lib/telemetry/client', () => ({
  trackTelemetry: trackTelemetryMock,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: () => void }) => (
    <a
      href={to}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))

const items = [
  {
    id: 'recent-unfavorited',
    tool_name: 'resume',
    label: 'Backend resume review',
    is_favorite: false,
    created_at: '2026-07-11T10:00:00Z',
    saved: true,
    access_mode: 'authenticated' as const,
    locked_actions: [],
    metadata: { linked_context_ids: [] },
  },
  {
    id: 'recent-favorite',
    tool_name: 'job_match',
    label: 'Favorite match',
    is_favorite: true,
    created_at: '2026-07-10T10:00:00Z',
    saved: true,
    access_mode: 'authenticated' as const,
    locked_actions: [],
    metadata: { linked_context_ids: [] },
  },
]

describe('ResultsNudge', () => {
  beforeEach(() => {
    flagMock.mockReset().mockReturnValue(false)
    useHistoryMock.mockReset().mockReturnValue({ data: { items } })
    trackTelemetryMock.mockReset()
  })

  it('leaves the surface unchanged and does not fetch when the flag is off', () => {
    const { container } = render(<ResultsNudge />)

    expect(container.innerHTML).toBe('')
    expect(useHistoryMock).toHaveBeenCalledWith(
      { page: 1, page_size: 5 },
      false,
    )
  })

  it('surfaces only recent results whose known favorite state is false', () => {
    flagMock.mockReturnValue(true)
    render(<ResultsNudge />)

    expect(screen.getByRole('region', { name: 'Recent results reminder' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /Backend resume review/ }).getAttribute('href'),
    ).toBe('/resume/result/recent-unfavorited')
    expect(screen.queryByText('Favorite match')).toBeNull()
    expect(screen.getByText(/not starred yet/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: /Backend resume review/ }))
    expect(trackTelemetryMock).toHaveBeenCalledWith({
      event_name: 'workspace_resumed',
      tool_id: 'resume',
      access_mode: 'authenticated',
      saved: true,
    })
  })

  it('renders nothing when every recent result is already favorited', () => {
    flagMock.mockReturnValue(true)
    useHistoryMock.mockReturnValue({ data: { items: [{ ...items[0], is_favorite: true }] } })
    render(<ResultsNudge />)

    expect(screen.queryByRole('region', { name: 'Recent results reminder' })).toBeNull()
  })
})
