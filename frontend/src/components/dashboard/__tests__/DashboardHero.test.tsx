import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHero } from '#/components/dashboard/DashboardHero'

const navigateMock = vi.hoisted(() => vi.fn())
const writeWorkflowContextMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('#/components/ui/motion', () => ({
  FadeUp: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

vi.mock('#/components/tooling/DropzoneHero', () => ({
  DropzoneHero: ({ onParsed }: { onParsed: (text: string) => void }) => {
    return (
      <button type="button" onClick={() => onParsed('Parsed dashboard resume text')}>
        Simulate dashboard parse
      </button>
    )
  },
}))

vi.mock('#/lib/tools/drafts', () => ({
  writeWorkflowContext: (payload: unknown) => writeWorkflowContextMock(payload),
}))

describe('DashboardHero', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    writeWorkflowContextMock.mockReset()
  })

  it('renders the dashboard resume handoff copy', () => {
    render(<DashboardHero />)

    expect(screen.getByText('Review your resume')).toBeTruthy()
    expect(
      screen.getByText(/Upload once to get a score, compare yourself to roles, and improve your application\./i),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Simulate dashboard parse/i })).toBeTruthy()
  })

  it('stores a pending-review handoff before navigating to the resume tool', () => {
    render(<DashboardHero />)

    fireEvent.click(screen.getByRole('button', { name: /Simulate dashboard parse/i }))

    expect(writeWorkflowContextMock).toHaveBeenCalledTimes(1)
    expect(writeWorkflowContextMock.mock.calls[0]?.[0]).toMatchObject({
      resumeText: 'Parsed dashboard resume text',
      resumePendingReview: true,
    })
    expect(typeof writeWorkflowContextMock.mock.calls[0]?.[0]?.updatedAt).toBe('number')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/resume' })
  })
})
