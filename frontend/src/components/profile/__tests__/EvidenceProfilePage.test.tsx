import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvidenceItem } from '#/lib/api/schemas'
import { EvidenceProfilePage } from '#/components/profile/EvidenceProfilePage'

const listEvidenceItemsMock = vi.hoisted(() => vi.fn())
const setConfirmationMock = vi.hoisted(() => vi.fn())
const updateItemMock = vi.hoisted(() => vi.fn())
const deleteItemMock = vi.hoisted(() => vi.fn())
const deleteProfileMock = vi.hoisted(() => vi.fn())
const confirmImportedMock = vi.hoisted(() => vi.fn())
const getDevelopmentPlanMock = vi.hoisted(() => vi.fn())
const warmRecommendationsFetchMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const sessionState = vi.hoisted(() => ({ status: 'authenticated' as string }))

vi.mock('#/lib/api/client', () => ({
  listEvidenceItems: listEvidenceItemsMock,
  setEvidenceItemConfirmation: setConfirmationMock,
  updateEvidenceItem: updateItemMock,
  deleteEvidenceItem: deleteItemMock,
  deleteEvidenceProfile: deleteProfileMock,
  confirmImportedEvidenceItems: confirmImportedMock,
}))

// The "Skills to build" section is folded into this page (Phase 1b, #321) and
// fetches through its own client module; keep it quiet by default so these
// tests stay focused on the Evidence Profile surface.
vi.mock('#/lib/api/development', () => ({
  getDevelopmentPlan: getDevelopmentPlanMock,
  updateDevelopmentItem: vi.fn(),
  deleteDevelopmentItem: vi.fn(),
  confirmDevelopmentEvidence: vi.fn(),
  declineDevelopmentEvidence: vi.fn(),
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionState.status, openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/components/app/AppStatePanel', () => ({
  AppStatePanel: ({ title, actions }: { title: string; actions: { label: string; onClick?: () => void }[] }) => (
    <div>
      <h1>{title}</h1>
      {actions.map((a) => (
        <button key={a.label} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function makeItem(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: 'id',
    kind: 'experience',
    content: { title: 'Backend Engineer' },
    provenance: 'imported',
    confirmation_state: 'unconfirmed',
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  }
}

const items: EvidenceItem[] = [
  makeItem({ id: 'e1', kind: 'experience', confirmation_state: 'unconfirmed', provenance: 'imported' }),
  makeItem({
    id: 's1',
    kind: 'skill',
    content: { text: 'TypeScript' },
    confirmation_state: 'confirmed',
    provenance: 'user-entered',
  }),
]

function WarmRecommendationsConsumer() {
  useQuery({
    queryKey: ['discovery', 'recommendations'],
    queryFn: warmRecommendationsFetchMock,
  })
  return null
}

function renderPage({ warmEvidenceConsumers = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {warmEvidenceConsumers ? <WarmRecommendationsConsumer /> : null}
      <EvidenceProfilePage />
    </QueryClientProvider>,
  )
}

describe('EvidenceProfilePage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_R17_DEVELOPMENT_LOOP_ENABLED', 'true')
    sessionState.status = 'authenticated'
    listEvidenceItemsMock.mockReset().mockResolvedValue({ items })
    setConfirmationMock.mockReset().mockImplementation((id: string) => Promise.resolve(makeItem({ id })))
    updateItemMock.mockReset().mockImplementation((id: string) => Promise.resolve(makeItem({ id, confirmation_state: 'confirmed' })))
    deleteItemMock.mockReset().mockResolvedValue(undefined)
    deleteProfileMock.mockReset().mockResolvedValue(undefined)
    confirmImportedMock.mockReset().mockResolvedValue({ items: [] })
    getDevelopmentPlanMock.mockReset().mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    warmRecommendationsFetchMock.mockReset().mockResolvedValue({
      confirmed_item_count: 0,
      preference_item_count: 0,
      items: [],
    })
    openAuthDialogMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders items grouped by kind with source and trust state', async () => {
    renderPage()

    const experience = await screen.findByRole('region', { name: 'Experience' })
    const skills = screen.getByRole('region', { name: 'Skills' })
    // Both source and trust-state labels are visible on each card.
    expect(within(experience).getByText('Suggested')).toBeTruthy()
    expect(within(experience).getByText('Imported')).toBeTruthy()
    expect(within(skills).getByText('Saved')).toBeTruthy()
    expect(within(skills).getByText('You entered')).toBeTruthy()
  })

  it('accepts a suggested item through the confirmation endpoint', async () => {
    renderPage()

    const region = await screen.findByRole('region', { name: 'Experience' })
    fireEvent.click(within(region).getByRole('button', { name: /^Accept$/i }))

    await waitFor(() => expect(setConfirmationMock).toHaveBeenCalledWith('e1', 'confirm'))
  })

  it('rejects an item through the confirmation endpoint', async () => {
    renderPage()

    const region = await screen.findByRole('region', { name: 'Experience' })
    fireEvent.click(within(region).getByRole('button', { name: /Reject/i }))

    await waitFor(() => expect(setConfirmationMock).toHaveBeenCalledWith('e1', 'reject'))
  })

  it('correcting content saves it directly — no extra confirm click', async () => {
    renderPage()

    const region = await screen.findByRole('region', { name: 'Experience' })
    fireEvent.click(within(region).getByRole('button', { name: /Correct/i }))

    const editor = await screen.findByLabelText('Content (JSON fields)')
    fireEvent.change(editor, { target: { value: '{"title":"Staff Engineer"}' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() =>
      expect(updateItemMock).toHaveBeenCalledWith('e1', { content: { title: 'Staff Engineer' } }),
    )
    // The old two-step "confirm the edit" call no longer exists.
    expect(setConfirmationMock).not.toHaveBeenCalled()
  })

  it('deletes a single item after confirmation', async () => {
    renderPage()

    const region = await screen.findByRole('region', { name: 'Experience' })
    fireEvent.click(within(region).getByRole('button', { name: /Delete/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete item/i }))

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('e1'))
  })

  it('deletes the whole profile through the atomic bulk endpoint', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Experience' })
    fireEvent.click(screen.getByRole('button', { name: /Delete profile/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete everything/i }))

    await waitFor(() => expect(deleteProfileMock).toHaveBeenCalledOnce())
    expect(deleteItemMock).not.toHaveBeenCalled()
  })

  it('accepts every still-suggested imported item at once', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Experience' })
    fireEvent.click(screen.getByRole('button', { name: /Accept all/i }))

    await waitFor(() => expect(confirmImportedMock).toHaveBeenCalledOnce())
  })

  it('hides the accept-all action when nothing imported is still suggested', async () => {
    listEvidenceItemsMock.mockResolvedValue({
      items: [makeItem({ id: 's1', confirmation_state: 'confirmed', provenance: 'user-entered' })],
    })
    renderPage()

    await screen.findByRole('region', { name: 'Experience' })
    expect(screen.queryByRole('button', { name: /Accept all/i })).toBeNull()
  })

  it.each([
    {
      action: 'accepting an item',
      perform: async () => {
        const region = await screen.findByRole('region', { name: 'Experience' })
        fireEvent.click(within(region).getByRole('button', { name: /^Accept$/i }))
        await waitFor(() => expect(setConfirmationMock).toHaveBeenCalledWith('e1', 'confirm'))
      },
    },
    {
      action: 'rejecting an item',
      perform: async () => {
        const region = await screen.findByRole('region', { name: 'Skills' })
        fireEvent.click(within(region).getByRole('button', { name: /Reject/i }))
        await waitFor(() => expect(setConfirmationMock).toHaveBeenCalledWith('s1', 'reject'))
      },
    },
    {
      action: 'correcting an item',
      perform: async () => {
        const region = await screen.findByRole('region', { name: 'Skills' })
        fireEvent.click(within(region).getByRole('button', { name: /Correct/i }))
        fireEvent.change(await screen.findByLabelText('Content (JSON fields)'), {
          target: { value: '{"text":"Advanced TypeScript"}' },
        })
        fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))
        await waitFor(() =>
          expect(updateItemMock).toHaveBeenCalledWith('s1', {
            content: { text: 'Advanced TypeScript' },
          }),
        )
      },
    },
    {
      action: 'deleting a confirmed item',
      perform: async () => {
        const region = await screen.findByRole('region', { name: 'Skills' })
        fireEvent.click(within(region).getByRole('button', { name: /Delete/i }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: /Delete item/i }))
        await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('s1'))
      },
    },
    {
      action: 'purging the profile',
      perform: async () => {
        await screen.findByRole('region', { name: 'Experience' })
        fireEvent.click(screen.getByRole('button', { name: /Delete profile/i }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: /Delete everything/i }))
        await waitFor(() => expect(deleteProfileMock).toHaveBeenCalledOnce())
      },
    },
  ])(
    '$action refreshes warm development and recommendation caches',
    async ({ perform }) => {
      renderPage({ warmEvidenceConsumers: true })
      await waitFor(() => expect(getDevelopmentPlanMock).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(1))

      await perform()

      await waitFor(() => expect(getDevelopmentPlanMock).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(2))
    },
  )

  it('shows Skills to build only when the development flag is on', async () => {
    vi.stubEnv('VITE_R17_DEVELOPMENT_LOOP_ENABLED', 'false')
    const { unmount } = renderPage()
    await screen.findByRole('region', { name: 'Experience' })
    expect(screen.queryByRole('region', { name: 'Skills to build' })).toBeNull()
    unmount()

    vi.stubEnv('VITE_R17_DEVELOPMENT_LOOP_ENABLED', 'true')
    renderPage()
    expect(await screen.findByRole('region', { name: 'Skills to build' })).toBeTruthy()
  })

  it('shows a sign-in prompt when unauthenticated', () => {
    sessionState.status = 'unauthenticated'
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith({ to: '/profile', reason: 'account' })
    expect(listEvidenceItemsMock).not.toHaveBeenCalled()
  })
})
