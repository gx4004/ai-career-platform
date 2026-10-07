import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { CookiePolicyPage } from '#/pages/legal/CookiePolicyPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useCanGoBack: () => false,
  useRouter: () => ({ history: { back: () => undefined } }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: '/cookies' } }),
}))

vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'guest' }) }))

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

  // The cookie notice comes back at once, in the corner a toast would use (and a toast covered it, sign-off
  // public-F02): the page confirms in a status line under the button instead, and raises no toast.
  it('resets the stored consent, says so under the button (no toast) and refreshes the live table', async () => {
    window.localStorage.setItem('cw-cookie-consent', 'rejected')
    renderPage()
    const live = await screen.findByRole('table', { name: 'What this browser stores for Career Workbench right now' })
    expect(within(live).getByRole('rowheader', { name: 'cw-cookie-consent' })).toBeTruthy()
    // The live region is on the page from the start (so the message is announced) and empty until a reset.
    const status = document.querySelector('.legal-page__status')!
    expect(status.getAttribute('role')).toBe('status')
    expect(status.textContent).toBe('')
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset cookie consent' })[0])
    expect(window.localStorage.getItem('cw-cookie-consent')).toBeNull()
    expect(status.textContent).toBe('Reset. The cookie notice is back so you can choose again.')
    expect(screen.queryByText('Cookie consent reset')).toBeNull()
    expect(document.querySelector('.kit-toast')).toBeNull()
    await waitFor(() => {
      const table = screen.getByRole('table', { name: 'What this browser stores for Career Workbench right now' })
      expect(within(table).queryByRole('rowheader', { name: 'cw-cookie-consent' })).toBeNull()
    })
  })

  // After a reset the status line said the notice was back even once it had been answered (sign-off public-G04):
  // it follows the stored choice.
  it('says what was saved once the returned notice is answered', async () => {
    const { setStoredConsent } = await import('#/lib/consent')
    window.localStorage.setItem('cw-cookie-consent', 'accepted')
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset cookie consent' })[0])
    const status = document.querySelector('.legal-page__status')!
    expect(status.textContent).toBe('Reset. The cookie notice is back so you can choose again.')
    act(() => setStoredConsent('rejected'))
    expect(status.textContent).toBe('Saved: essential cookies only.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset cookie consent' })[0])
    act(() => setStoredConsent('accepted'))
    expect(status.textContent).toBe('Saved: optional diagnostics on.')
  })
})
