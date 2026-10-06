import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '#/components/kit'
import { SettingsPage } from '#/pages/settings-page'
import { ApiError } from '#/lib/api/errors'
import { EVIDENCE_QUERY_KEY } from '#/lib/profile/evidence'

const api = vi.hoisted(() => ({
  getHealth: vi.fn(),
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
    api.getHealth.mockReset().mockResolvedValue({ status: 'ok' })
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
    expect(await screen.findAllByText('Evidence profile deleted')).not.toHaveLength(0)
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
    api.getHealth.mockReset().mockResolvedValue({ status: 'ok', service: 'API', environment: 'test' })
  })

  it('checks the connection itself: checking, then connected or not', async () => {
    let answer: (value: unknown) => void = () => {}
    api.getHealth.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    renderPage()
    const general = within(screen.getByRole('list', { name: 'General' }))
    expect(general.getByText('Checking…')).toBeTruthy()
    answer({ status: 'ok' })
    expect(await general.findByText('Connected')).toBeTruthy()
  })

  it("says it can't reach the server when the health check fails", async () => {
    api.getHealth.mockRejectedValueOnce(new Error('offline'))
    renderPage()
    expect(await within(screen.getByRole('list', { name: 'General' })).findByText("Can't reach the server")).toBeTruthy()
  })

  it('calls a 5xx answer a server error, not an unreachable server', async () => {
    api.getHealth.mockRejectedValueOnce(new ApiError('The server ran into a problem.', 503))
    renderPage()
    expect(await within(screen.getByRole('list', { name: 'General' })).findByText('Server error')).toBeTruthy()
  })

  it('a re-check that fails is not still called connected (the banner says unreachable)', async () => {
    api.getHealth.mockResolvedValueOnce({ status: 'ok' }).mockRejectedValueOnce(new ApiError("Can't reach the server.", 0))
    const { client } = renderPage()
    const general = within(screen.getByRole('list', { name: 'General' }))
    expect(await general.findByText('Connected')).toBeTruthy()

    await client.refetchQueries({ queryKey: ['health'] })

    expect(await general.findByText("Can't reach the server")).toBeTruthy()
    expect(general.queryByText('Connected')).toBeNull()
  })

  it('a re-check answered with a 5xx after a good one says server error', async () => {
    api.getHealth.mockResolvedValueOnce({ status: 'ok' }).mockRejectedValueOnce(new ApiError('The server ran into a problem.', 502))
    const { client } = renderPage()
    const general = within(screen.getByRole('list', { name: 'General' }))
    expect(await general.findByText('Connected')).toBeTruthy()

    await client.refetchQueries({ queryKey: ['health'] })

    expect(await general.findByText('Server error')).toBeTruthy()
  })

  it('a 4xx is an answer from a server that is up, as the service banner reads it, not an unreachable one', async () => {
    api.getHealth.mockRejectedValueOnce(new ApiError('Too many requests', 429))
    renderPage()
    const general = within(screen.getByRole('list', { name: 'General' }))
    expect(await general.findByText('Connected')).toBeTruthy()
    expect(general.queryByText("Can't reach the server")).toBeNull()
  })

  it('groups the rows under two headings, each row a title with its explanation and one control', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    for (const name of ['General', 'Data and privacy']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy()
    }
    const general = within(screen.getByRole('list', { name: 'General' }))
    expect(general.getByRole('button', { name: 'Replay tour' })).toBeTruthy()
    expect(general.getByRole('link', { name: 'Open timeline' })).toBeTruthy()
    expect(await general.findByText('Connected')).toBeTruthy()
  })

  it('fills only the irreversible account deletion; the profile deletion stays quiet', () => {
    renderPage()
    const profile = screen.getByRole('button', { name: 'Delete profile' })
    const account = screen.getByRole('button', { name: 'Delete account' })
    expect(profile.className).toContain('kit-button--secondary')
    expect(account.className).toContain('kit-button--destructive')
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
    // The landing page reads this once to say the deletion worked.
    expect(sessionStorage.getItem('cw-account-deleted')).toBe('1')
    sessionStorage.removeItem('cw-account-deleted')
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
