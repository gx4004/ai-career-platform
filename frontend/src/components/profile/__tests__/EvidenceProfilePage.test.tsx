import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvidenceItem } from '#/lib/api/schemas'
import { EvidenceProfilePage } from '#/components/profile/EvidenceProfilePage'

const listEvidenceItemsMock = vi.hoisted(() => vi.fn())
const confirmItemMock = vi.hoisted(() => vi.fn())
const confirmItemsMock = vi.hoisted(() => vi.fn())
const importMock = vi.hoisted(() => vi.fn())
const updateItemMock = vi.hoisted(() => vi.fn())
const deleteItemMock = vi.hoisted(() => vi.fn())
const deleteProfileMock = vi.hoisted(() => vi.fn())
const getDevelopmentPlanMock = vi.hoisted(() => vi.fn())
const warmRecommendationsFetchMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const sessionState = vi.hoisted(() => ({ status: 'authenticated' as string }))
const resumeCarry = vi.hoisted(() => ({ resumeText: '' }))

vi.mock('#/lib/api/client', () => ({
  listEvidenceItems: listEvidenceItemsMock,
  confirmEvidenceItem: confirmItemMock,
  confirmEvidenceItems: confirmItemsMock,
  importEvidenceFromResume: importMock,
  updateEvidenceItem: updateItemMock,
  deleteEvidenceItem: deleteItemMock,
  deleteEvidenceProfile: deleteProfileMock,
}))

// The "Skills to build" section is folded into this page (Phase 1b, #321) and
// fetches through its own client module; keep it quiet by default so these
// tests stay focused on the Evidence Profile surface.
vi.mock('#/lib/api/development', () => ({
  getDevelopmentPlan: getDevelopmentPlanMock,
  updateDevelopmentItem: vi.fn(),
  deleteDevelopmentItem: vi.fn(),
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionState.status, openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/hooks/use-resume-carry', () => ({
  useResumeCarry: () => ({
    resumeText: resumeCarry.resumeText,
    hasResume: resumeCarry.resumeText.length > 0,
  }),
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
  makeItem({ id: 'e1', kind: 'experience', content: { title: 'Backend Engineer' } }),
  makeItem({ id: 'e2', kind: 'project', content: { name: 'Payments service' } }),
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
    sessionState.status = 'authenticated'
    resumeCarry.resumeText = ''
    listEvidenceItemsMock.mockReset().mockResolvedValue({ items })
    confirmItemMock.mockReset().mockImplementation((id: string) =>
      Promise.resolve(makeItem({ id, confirmation_state: 'confirmed' })),
    )
    confirmItemsMock.mockReset().mockResolvedValue({ items: [] })
    importMock.mockReset().mockResolvedValue({ items: [] })
    updateItemMock.mockReset().mockImplementation((id: string) => Promise.resolve(makeItem({ id, confirmation_state: 'confirmed' })))
    deleteItemMock.mockReset().mockResolvedValue(undefined)
    deleteProfileMock.mockReset().mockResolvedValue(undefined)
    getDevelopmentPlanMock.mockReset().mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    warmRecommendationsFetchMock.mockReset().mockResolvedValue({
      confirmed_item_count: 0,
      preference_item_count: 0,
      items: [],
    })
    openAuthDialogMock.mockReset()
  })

  it('lists suggestions once for review and groups only saved facts by kind', async () => {
    renderPage()

    const skills = await screen.findByRole('region', { name: 'Skills' })
    expect(within(skills).getByText('Saved')).toBeTruthy()
    expect(within(skills).getByText('You entered')).toBeTruthy()
    // Suggestions are not repeated in the grouped list.
    expect(screen.queryByRole('region', { name: 'Experience' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Accept: Backend Engineer' })).toBeTruthy()
  })

  it('imports from the carried CV straight into the suggestions list', async () => {
    resumeCarry.resumeText = 'x'.repeat(80)
    importMock.mockResolvedValue({ items: [items[0], items[1]] })
    renderPage()

    await screen.findByRole('region', { name: 'Skills' })
    fireEvent.click(screen.getByRole('button', { name: /Import from your CV/i }))

    await waitFor(() => expect(importMock).toHaveBeenCalledWith('x'.repeat(80)))
    expect(await screen.findByText('Added 2 suggestions to review.')).toBeTruthy()
    await waitFor(() => expect(listEvidenceItemsMock).toHaveBeenCalledTimes(2))
  })

  it('accepts a suggestion', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Accept: Backend Engineer' }))

    await waitFor(() => expect(confirmItemMock).toHaveBeenCalledWith('e1'))
  })

  it('rejecting a suggestion deletes it', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Reject: Backend Engineer' }))

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('e1'))
    expect(confirmItemMock).not.toHaveBeenCalled()
  })

  it('editing a suggestion saves its content directly', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit: Backend Engineer' }))
    const editor = await screen.findByLabelText('Content (JSON fields)')
    fireEvent.change(editor, { target: { value: '{"title":"Staff Engineer"}' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() =>
      expect(updateItemMock).toHaveBeenCalledWith('e1', { content: { title: 'Staff Engineer' } }),
    )
  })

  it('accepts every listed suggestion in one call', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Accept all/i }))

    await waitFor(() => expect(confirmItemsMock).toHaveBeenCalledWith(['e1', 'e2']))
    expect(confirmItemMock).not.toHaveBeenCalled()
  })

  it('deletes a saved fact after confirmation and refreshes warm caches', async () => {
    renderPage({ warmEvidenceConsumers: true })
    await waitFor(() => expect(getDevelopmentPlanMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(1))

    const skills = await screen.findByRole('region', { name: 'Skills' })
    fireEvent.click(within(skills).getByRole('button', { name: /Delete/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete item/i }))

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(getDevelopmentPlanMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(2))
  })

  it('deletes the whole profile through the atomic bulk endpoint', async () => {
    renderPage()

    await screen.findByRole('region', { name: 'Skills' })
    fireEvent.click(screen.getByRole('button', { name: /Delete profile/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete everything/i }))

    await waitFor(() => expect(deleteProfileMock).toHaveBeenCalledOnce())
    expect(deleteItemMock).not.toHaveBeenCalled()
  })

  it('shows the Skills to build section', async () => {
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
