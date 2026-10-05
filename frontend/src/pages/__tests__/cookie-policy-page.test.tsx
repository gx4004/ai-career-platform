import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { CookiePolicyPage } from '#/pages/legal/CookiePolicyPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

function renderPage() {
  return render(
    <ToastProvider>
      <CookiePolicyPage />
    </ToastProvider>,
  )
}

describe('CookiePolicyPage', () => {
  afterEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('lists, live, what this browser holds for the app, with what each key is for', async () => {
    window.localStorage.setItem('cw-cookie-consent', 'accepted')
    renderPage()
    const table = await screen.findByRole('table', { name: 'What this browser stores for Career Workbench right now' })
    const row = within(table).getByRole('rowheader', { name: 'cw-cookie-consent' }).closest('tr')!
    expect(within(row).getByText('localStorage')).toBeTruthy()
    expect(within(row).getByText('Remembers your cookie-consent choice.')).toBeTruthy()
  })

  it('resets the stored consent, says so in a toast and refreshes the live table', async () => {
    window.localStorage.setItem('cw-cookie-consent', 'rejected')
    renderPage()
    const live = await screen.findByRole('table', { name: 'What this browser stores for Career Workbench right now' })
    expect(within(live).getByRole('rowheader', { name: 'cw-cookie-consent' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset cookie consent' })[0])
    expect(window.localStorage.getItem('cw-cookie-consent')).toBeNull()
    expect(await screen.findByText('Cookie consent reset')).toBeTruthy()
    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'What this browser stores for Career Workbench right now' })
      expect(within(table).queryByRole('rowheader', { name: 'cw-cookie-consent' })).toBeNull()
    })
  })
})
