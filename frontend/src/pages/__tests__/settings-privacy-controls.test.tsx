import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { SettingsPage } from '#/pages/settings-page'
import { EVIDENCE_QUERY_KEY } from '#/lib/profile/evidence'

const api = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  deleteEvidenceProfile: vi.fn(),
  exportCareerData: vi.fn(),
}))
const warmDevelopmentFetch = vi.hoisted(() => vi.fn())
const warmRecommendationsFetch = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/api/client')>(),
  ...api,
}))
vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({
    status: 'authenticated',
    user: { email: 'owner@example.com' },
    health: { status: 'ok', service: 'API', environment: 'test' },
  }),
}))
vi.mock('#/hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    open: false,
    reset: vi.fn(),
    startTour: vi.fn(),
    complete: vi.fn(),
    skip: vi.fn(),
    setOpen: vi.fn(),
  }),
}))
vi.mock('#/components/onboarding/OnboardingDialog', () => ({
  OnboardingDialog: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#test">{children}</a>,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))
vi.mock('#/lib/i18n', () => ({ changeLanguage: vi.fn() }))

function WarmEvidenceConsumers() {
  useQuery({
    queryKey: ['development-plan', 'items'],
    queryFn: warmDevelopmentFetch,
  })
  useQuery({
    queryKey: ['discovery', 'recommendations'],
    queryFn: warmRecommendationsFetch,
  })
  return null
}

function renderPage({ warmEvidenceConsumers = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      {warmEvidenceConsumers ? <WarmEvidenceConsumers /> : null}
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

describe('Settings privacy controls', () => {
  beforeEach(() => {
    api.exportCareerData.mockReset().mockResolvedValue({
      schema_version: 'career-data-export/v1',
    })
    api.deleteEvidenceProfile.mockReset().mockResolvedValue(undefined)
    warmDevelopmentFetch.mockReset().mockResolvedValue({
      schema_version: 'development-plan/v1',
      items: [],
    })
    warmRecommendationsFetch.mockReset().mockResolvedValue({
      confirmed_item_count: 0,
      preference_item_count: 0,
      items: [],
    })
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:career-data'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  it('keeps export and profile erasure reachable while preview outcomes are dark', async () => {
    const { client } = renderPage()
    client.setQueryData(EVIDENCE_QUERY_KEY, [{ id: 'private-evidence' }])

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }))
    await waitFor(() => expect(api.exportCareerData).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete evidence profile' }))
    await waitFor(() => expect(api.deleteEvidenceProfile).toHaveBeenCalledTimes(1))
    expect(client.getQueryData(EVIDENCE_QUERY_KEY)).toBeUndefined()
  }, 10_000)

  it('keeps an erasure failure visible inside the confirmation dialog', async () => {
    api.deleteEvidenceProfile.mockRejectedValueOnce(new Error('Erase failed safely.'))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete your evidence profile?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete evidence profile' }))

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Erase failed safely.')
  })

  it('refreshes warm evidence consumers after recovery-route profile erasure', async () => {
    renderPage({ warmEvidenceConsumers: true })
    await waitFor(() => expect(warmDevelopmentFetch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(warmRecommendationsFetch).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Delete profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete evidence profile' }))

    await waitFor(() => expect(api.deleteEvidenceProfile).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(warmDevelopmentFetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(warmRecommendationsFetch).toHaveBeenCalledTimes(2))
  })
})

describe('Settings page structure', () => {
  beforeEach(() => {
    api.deleteAccount.mockReset().mockResolvedValue(undefined)
  })

  it('groups the rows under two headings, each row a title with its explanation and one control', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    for (const name of ['General', 'Data and privacy']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    const general = within(screen.getByRole('list', { name: 'General' }))
    expect(general.getByRole('button', { name: 'Replay tour' })).toBeTruthy()
    expect(general.getByRole('link', { name: 'Open timeline' })).toBeTruthy()
    expect(general.getByText('Connected')).toBeTruthy()
  })

  it('offers both deletions as quiet buttons; the loud destructive button is only the one that confirms', () => {
    renderPage()
    const profile = screen.getByRole('button', { name: 'Delete profile' })
    const account = screen.getByRole('button', { name: 'Delete account' })
    expect(profile.className).toContain('kit-button--secondary')
    expect(account.className).toContain('kit-button--secondary')
    fireEvent.click(account)
    expect(screen.getByRole('button', { name: 'Delete account permanently' }).className).toContain('kit-button--destructive')
  })

  it('confirms a local data clear with a toast and no inline status text', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Clear local drafts' }))
    expect(await screen.findAllByText('Local drafts and demo state were cleared.')).not.toHaveLength(0)
  })

  it('keeps Delete account permanently disabled until the email is typed exactly, then deletes', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete account permanently' }) as HTMLButtonElement
    const input = within(dialog).getByRole('textbox')
    expect(confirm.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'someone@example.com' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(input, { target: { value: ' OWNER@example.com ' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith('OWNER@example.com'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'))
  })

  it('shows an account deletion failure under the field it concerns', async () => {
    api.deleteAccount.mockRejectedValueOnce(new Error('The confirmation did not match.'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'owner@example.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account permanently' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('The confirmation did not match.')
  })
})
