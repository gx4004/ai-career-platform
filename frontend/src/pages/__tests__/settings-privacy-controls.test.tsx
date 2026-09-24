import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      <SettingsPage />
    </QueryClientProvider>,
  )
  return { ...view, client }
}

describe('Settings privacy controls', () => {
  beforeEach(() => {
    for (const flag of [
      'VITE_R11_EVIDENCE_PROFILE_ENABLED',
      'VITE_R12_CV_STUDIO_ENABLED',
      'VITE_R13_CAMPAIGNS_ENABLED',
      'VITE_R14_DISCOVERY_ENABLED',
      'VITE_R15_QUEUE_ENABLED',
      'VITE_R16_SUBMISSION_FOUNDATION_ENABLED',
      'VITE_R17_DEVELOPMENT_LOOP_ENABLED',
    ]) vi.stubEnv(flag, 'false')
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
    const dialog = screen.getByRole('dialog', { name: 'Delete your evidence profile?' })
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
