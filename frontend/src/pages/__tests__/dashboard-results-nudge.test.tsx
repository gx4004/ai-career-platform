import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '#/pages/dashboard-page'

const flagMock = vi.hoisted(() => vi.fn())
const useHistoryMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/flags/featureFlags', () => ({
  isR7ResultsNudgeEnabled: flagMock,
}))

vi.mock('#/hooks/useHistory', () => ({ useHistory: useHistoryMock }))
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: 'authenticated' }),
}))
vi.mock('#/hooks/use-breakpoint', () => ({ useBreakpoint: () => 'desktop' }))
vi.mock('#/hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    shouldShow: false,
    startTour: vi.fn(),
    open: false,
    complete: vi.fn(),
    skip: vi.fn(),
  }),
}))
vi.mock('#/components/dashboard/DashboardHero', () => ({
  DashboardHero: () => <div>Existing dashboard hero</div>,
}))
vi.mock('#/components/dashboard/RecentRuns', () => ({
  RecentRuns: () => <div>Existing recent runs</div>,
}))
vi.mock('#/components/dashboard/FavoriteRuns', () => ({
  FavoriteRuns: () => <div>Existing favorite runs</div>,
}))
vi.mock('#/components/onboarding/OnboardingTour', () => ({
  OnboardingTour: () => null,
}))

describe('DashboardPage — R7 results nudge dark ship', () => {
  beforeEach(() => {
    flagMock.mockReset().mockReturnValue(false)
    useHistoryMock.mockReset().mockReturnValue({ data: { items: [] } })
  })

  it('keeps the authenticated dashboard unchanged when the flag is off by default', () => {
    render(<DashboardPage />)

    expect(screen.getByText('Existing dashboard hero')).toBeTruthy()
    expect(screen.getByText('Existing recent runs')).toBeTruthy()
    expect(screen.getByText('Existing favorite runs')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Recent results reminder' })).toBeNull()
    expect(useHistoryMock).toHaveBeenCalledWith({ page: 1, page_size: 5 }, false)
  })
})
