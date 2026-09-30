import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevelopmentItem } from '#/lib/api/developmentSchemas'
import { SkillsToBuildSection } from '#/components/profile/SkillsToBuildSection'

const getPlanMock = vi.hoisted(() => vi.fn())
const updateItemMock = vi.hoisted(() => vi.fn())
const deleteItemMock = vi.hoisted(() => vi.fn())
const warmEvidenceFetchMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/development', () => ({
  getDevelopmentPlan: getPlanMock,
  updateDevelopmentItem: updateItemMock,
  deleteDevelopmentItem: deleteItemMock,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function makeItem(overrides: Partial<DevelopmentItem>): DevelopmentItem {
  return {
    id: 'd1',
    gap_classification_id: 'g1',
    gap_kind: 'presentation_weakness',
    response_kind: 'reword',
    state: 'planned',
    target_date: null,
    notes: null,
    evidence_item_id: null,
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    ...overrides,
  }
}

const items = [
  makeItem({ id: 'd1' }),
  makeItem({
    id: 'd2',
    response_kind: 'learn_skill',
    gap_kind: 'missing_skill',
    state: 'completed',
    notes: 'Take a course',
    evidence_item_id: 'e1',
  }),
]

function WarmEvidenceConsumer() {
  useQuery({ queryKey: ['evidence-profile', 'items'], queryFn: warmEvidenceFetchMock })
  return null
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WarmEvidenceConsumer />
      <SkillsToBuildSection />
    </QueryClientProvider>,
  )
}

async function openMenu(scope: HTMLElement) {
  fireEvent.keyDown(within(scope).getByRole('button', { name: /More actions/ }), { key: 'Enter' })
  return screen.findByRole('menu')
}

describe('SkillsToBuildSection', () => {
  beforeEach(() => {
    getPlanMock.mockReset().mockResolvedValue({ schema_version: 'development-plan/v1', items })
    updateItemMock.mockReset().mockImplementation((id: string) => Promise.resolve(makeItem({ id })))
    deleteItemMock.mockReset().mockResolvedValue(undefined)
    warmEvidenceFetchMock.mockReset().mockResolvedValue({ items: [] })
  })

  it('renders each skill in its group with its status, notes and profile link', async () => {
    renderSection()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    expect((within(reword).getByLabelText('Status') as HTMLSelectElement).value).toBe('planned')
    const learn = screen.getByRole('region', { name: 'Learn a new skill' })
    expect(within(learn).getByText('Take a course')).toBeTruthy()
    expect(within(learn).getByText('Added to your profile')).toBeTruthy()
  })

  it('completing a skill saves it and refreshes the profile', async () => {
    renderSection()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(1))
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'completed' } })

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'completed' }))
    await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(2))
  })

  it('edits the target date and notes from the card menu', async () => {
    renderSection()

    const menu = await openMenu(await screen.findByRole('region', { name: 'Reword existing content' }))
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Edit/ }))
    fireEvent.change(await screen.findByLabelText('Target date (optional)'), {
      target: { value: '2026-09-01' },
    })
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'Rewrite the summary' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    await waitFor(() =>
      expect(updateItemMock).toHaveBeenCalledWith('d1', {
        target_date: '2026-09-01',
        notes: 'Rewrite the summary',
      }),
    )
  })

  it('deletes a skill through the confirm dialog', async () => {
    renderSection()

    const menu = await openMenu(await screen.findByRole('region', { name: 'Reword existing content' }))
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Delete/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete item/i }))

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('d1'))
  })

  it('shows an empty panel pointing to Campaigns when there is nothing to build', async () => {
    getPlanMock.mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    renderSection()

    expect(await screen.findByText('Nothing to build yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open applications' }).getAttribute('href')).toBe('/campaigns')
  })
})
