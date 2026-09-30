import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EvidenceItem } from '#/lib/api/schemas'
import { EvidenceProfilePage } from '#/components/profile/EvidenceProfilePage'

const api = vi.hoisted(() => ({
  listEvidenceItems: vi.fn(),
  confirmEvidenceItem: vi.fn(),
  confirmEvidenceItems: vi.fn(),
  importEvidenceFromResume: vi.fn(),
  updateEvidenceItem: vi.fn(),
  deleteEvidenceItem: vi.fn(),
  deleteEvidenceProfile: vi.fn(),
}))
const getDevelopmentPlanMock = vi.hoisted(() => vi.fn())
const warmRecommendationsFetchMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const sessionState = vi.hoisted(() => ({ status: 'authenticated' as string }))
const resumeCarry = vi.hoisted(() => ({ resumeText: '' }))

vi.mock('#/lib/api/client', () => api)

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
    content: { name: 'TypeScript', level: 'Advanced' },
    confirmation_state: 'confirmed',
    provenance: 'user-entered',
  }),
]

function WarmRecommendationsConsumer() {
  useQuery({ queryKey: ['discovery', 'recommendations'], queryFn: warmRecommendationsFetchMock })
  return null
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WarmRecommendationsConsumer />
      <EvidenceProfilePage />
    </QueryClientProvider>,
  )
}

async function openMenu(name: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name }), { key: 'Enter' })
  return screen.findByRole('menu')
}

describe('EvidenceProfilePage', () => {
  beforeEach(() => {
    sessionState.status = 'authenticated'
    resumeCarry.resumeText = ''
    api.listEvidenceItems.mockReset().mockResolvedValue({ items })
    api.confirmEvidenceItem.mockReset().mockResolvedValue(makeItem({ confirmation_state: 'confirmed' }))
    api.confirmEvidenceItems.mockReset().mockResolvedValue({ items: [] })
    api.importEvidenceFromResume.mockReset().mockResolvedValue({ items: [] })
    api.updateEvidenceItem.mockReset().mockResolvedValue(makeItem({ confirmation_state: 'confirmed' }))
    api.deleteEvidenceItem.mockReset().mockResolvedValue(undefined)
    api.deleteEvidenceProfile.mockReset().mockResolvedValue(undefined)
    getDevelopmentPlanMock.mockReset().mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    warmRecommendationsFetchMock.mockReset().mockResolvedValue({ items: [] })
    openAuthDialogMock.mockReset()
  })

  it('lists each suggestion once and groups only saved facts by kind', async () => {
    renderPage()

    const suggestions = await screen.findByRole('list', { name: 'Suggestions to review' })
    expect(within(suggestions).getAllByRole('listitem')).toHaveLength(2)
    const skills = await screen.findByRole('region', { name: 'Skills' })
    expect(within(skills).getByText('TypeScript')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Experience' })).toBeNull()
    expect(screen.getAllByText('Backend Engineer')).toHaveLength(1)
  })

  it('saves a suggestion with its one primary action', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save: Backend Engineer' }))

    await waitFor(() => expect(api.confirmEvidenceItem).toHaveBeenCalledWith('e1'))
  })

  it('dismissing a suggestion inline deletes it', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss: Backend Engineer' }))

    await waitFor(() => expect(api.deleteEvidenceItem).toHaveBeenCalledWith('e1'))
    expect(api.confirmEvidenceItem).not.toHaveBeenCalled()
  })

  it('saves every suggestion in one call', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save all' }))

    await waitFor(() => expect(api.confirmEvidenceItems).toHaveBeenCalledWith(['e1', 'e2']))
  })

  it('edits a saved fact through one labelled field per value', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit: TypeScript' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'TypeScript, React' } })
    fireEvent.change(within(dialog).getByLabelText('Level'), { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(api.updateEvidenceItem).toHaveBeenCalledWith('s1', { content: { name: 'TypeScript, React' } }),
    )
  })

  it('deletes a saved fact through the confirm dialog and refreshes warm caches', async () => {
    renderPage()
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(1))

    const menu = await openMenu('More actions: TypeScript')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete fact/ }))

    await waitFor(() => expect(api.deleteEvidenceItem).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(2))
  })

  it('deletes the whole profile through the bulk endpoint', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Delete profile/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete everything/ }))

    await waitFor(() => expect(api.deleteEvidenceProfile).toHaveBeenCalledOnce())
  })

  it('links to the resume page to upload a CV, or imports the carried one', async () => {
    const { unmount } = renderPage()
    expect((await screen.findByRole('link', { name: /Upload a CV/ })).getAttribute('href')).toBe('/resume')
    unmount()

    resumeCarry.resumeText = 'x'.repeat(80)
    api.importEvidenceFromResume.mockResolvedValue({ items: [items[0], items[1]] })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Import from your CV/ }))

    await waitFor(() => expect(api.importEvidenceFromResume).toHaveBeenCalledWith('x'.repeat(80)))
    expect(await screen.findByText('Added 2 suggestions to review.')).toBeTruthy()
  })

  it('shows the Skills to build panel', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Skills to build' })).toBeTruthy()
    expect(await screen.findByText('Nothing to build yet')).toBeTruthy()
  })

  it('asks a signed-out visitor to sign in', () => {
    sessionState.status = 'unauthenticated'
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith({ to: '/profile', reason: 'account' })
    expect(api.listEvidenceItems).not.toHaveBeenCalled()
  })
})
