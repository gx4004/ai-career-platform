import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardCv } from '#/components/dashboard/DashboardCv'

const cv = vi.hoisted(() => ({
  latest: null as null | { name: string; updated_at: string },
  pending: false,
  isError: false,
  fetching: false,
  retry: vi.fn(),
}))

vi.mock('#/components/dashboard/useDashboardCv', () => ({ useDashboardCv: () => cv }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

describe('DashboardCv', () => {
  beforeEach(() => {
    cv.latest = null
    cv.pending = false
    cv.isError = false
    cv.retry = vi.fn()
  })

  it('holds its place with a skeleton row while the CV is being looked up', () => {
    cv.pending = true
    render(<DashboardCv />)
    expect(screen.getByRole('heading', { name: 'Your CV' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Your CV' }).getAttribute('aria-busy')).toBe('true')
  })

  it('says so, with a retry, when the lookup failed and there is no CV to show', () => {
    cv.isError = true
    render(<DashboardCv />)
    expect(screen.getByText("Your CV couldn't be loaded")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(cv.retry).toHaveBeenCalled()
  })

  it('shows nothing without a CV: the page leads with the upload instead', () => {
    const { container } = render(<DashboardCv />)
    expect(container.firstChild).toBeNull()
  })

  it('names the newest CV and opens CV Studio', () => {
    cv.latest = { name: 'Alex Morgan', updated_at: new Date().toISOString() }
    render(<DashboardCv />)

    expect(screen.getByRole('heading', { name: 'Your CV' })).toBeTruthy()
    expect(screen.getByText('Alex Morgan')).toBeTruthy()
    expect(screen.getByText(/^Edited /)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open CV Studio' }).getAttribute('href')).toBe('/cv-studio')
  })

  // Sign-off r4 chrome-F12: at 320px the button took most of the row and the CV name broke over two lines. Below
  // 360px the button reads "Open" (dashboard.css hides the rest), and its name stays "Open CV Studio".
  it('can shorten the button to "Open" on a narrow phone without changing its name', () => {
    cv.latest = { name: 'Alex Morgan', updated_at: new Date().toISOString() }
    render(<DashboardCv />)

    const link = screen.getByRole('link', { name: 'Open CV Studio' })
    expect(link.querySelector('.dash-cv__more')?.textContent).toBe('CV Studio')
  })
})
