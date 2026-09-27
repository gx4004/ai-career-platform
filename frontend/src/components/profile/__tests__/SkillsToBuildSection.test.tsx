import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevelopmentItem } from '#/lib/api/developmentSchemas'
import { SkillsToBuildSection } from '#/components/profile/SkillsToBuildSection'

const getPlanMock = vi.hoisted(() => vi.fn())
const updateItemMock = vi.hoisted(() => vi.fn())
const deleteItemMock = vi.hoisted(() => vi.fn())
const warmEvidenceFetchMock = vi.hoisted(() => vi.fn())
const warmRecommendationsFetchMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/development', () => ({
  getDevelopmentPlan: getPlanMock,
  updateDevelopmentItem: updateItemMock,
  deleteDevelopmentItem: deleteItemMock,
}))

function makeItem(overrides: Partial<DevelopmentItem>): DevelopmentItem {
  return {
    id: 'id',
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

const items: DevelopmentItem[] = [
  makeItem({
    id: 'd1',
    response_kind: 'reword',
    gap_kind: 'presentation_weakness',
    state: 'planned',
  }),
  makeItem({
    id: 'd2',
    response_kind: 'learn_skill',
    gap_kind: 'missing_skill',
    state: 'in_progress',
    target_date: '2026-08-01',
    notes: 'Take a course',
  }),
]

function WarmEvidenceConsumers() {
  useQuery({
    queryKey: ['evidence-profile', 'items'],
    queryFn: warmEvidenceFetchMock,
  })
  useQuery({
    queryKey: ['discovery', 'recommendations'],
    queryFn: warmRecommendationsFetchMock,
  })
  return null
}

function renderSection({ warmEvidenceConsumers = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {warmEvidenceConsumers ? <WarmEvidenceConsumers /> : null}
      <SkillsToBuildSection />
    </QueryClientProvider>,
  )
}

describe('SkillsToBuildSection', () => {
  beforeEach(() => {
    getPlanMock
      .mockReset()
      .mockResolvedValue({ schema_version: 'development-plan/v1', items })
    updateItemMock.mockReset().mockImplementation((id: string) => Promise.resolve(makeItem({ id })))
    deleteItemMock.mockReset().mockResolvedValue(undefined)
    warmEvidenceFetchMock.mockReset().mockResolvedValue({ items: [] })
    warmRecommendationsFetchMock.mockReset().mockResolvedValue({
      confirmed_item_count: 0,
      preference_item_count: 0,
      items: [],
    })
  })

  it('renders as the "Skills to build" section with an anchorable id', async () => {
    renderSection()

    const section = await screen.findByRole('region', { name: 'Skills to build' })
    expect(section.id).toBe('skills-to-build')
    expect(within(section).getByRole('heading', { name: 'Skills to build' })).toBeTruthy()
  })

  it('renders items grouped by response kind with a labeled status control', async () => {
    renderSection()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    const learn = screen.getByRole('region', { name: 'Learn a new skill' })

    const rewordStatus = within(reword).getByRole('combobox') as HTMLSelectElement
    expect(rewordStatus.value).toBe('planned')
    expect(within(reword).getByText('Planned', { selector: '.development-state' })).toBeTruthy()
    expect(within(reword).getByLabelText('Status')).toBe(rewordStatus)

    const learnStatus = within(learn).getByRole('combobox') as HTMLSelectElement
    expect(learnStatus.value).toBe('in_progress')
    expect(within(learn).getByText('Take a course')).toBeTruthy()
  })

  it('changes an item state through the update endpoint', async () => {
    renderSection()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByRole('combobox'), {
      target: { value: 'in_progress' },
    })

    await waitFor(() =>
      expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'in_progress' }),
    )
  })

  it('edits the target date and notes through the update endpoint', async () => {
    renderSection()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    fireEvent.click(within(reword).getByRole('button', { name: /Edit/i }))

    const dateInput = await screen.findByLabelText('Target date (optional)')
    fireEvent.change(dateInput, { target: { value: '2026-09-01' } })
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

  it('deletes an item after confirmation', async () => {
    renderSection()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    fireEvent.click(within(reword).getByRole('button', { name: /Delete/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete item/i }))

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('d1'))
  })

  it('completing an item refreshes the profile, where its evidence is reviewed', async () => {
    renderSection({ warmEvidenceConsumers: true })

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(1))
    fireEvent.change(within(reword).getByRole('combobox'), {
      target: { value: 'completed' },
    })

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'completed' }))
    await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(2))
  })

  it('marks a completed item whose evidence reached the profile', async () => {
    getPlanMock.mockResolvedValue({
      schema_version: 'development-plan/v1',
      items: [makeItem({ id: 'd3', state: 'completed', evidence_item_id: 'e1' })],
    })
    renderSection()

    const group = await screen.findByRole('region', { name: 'Reword existing content' })
    expect(within(group).getByText('Added to your profile')).toBeTruthy()
  })

  it('renders nothing when there are no development items', async () => {
    getPlanMock.mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    const { container } = renderSection()

    await waitFor(() => expect(getPlanMock).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('#skills-to-build')).toBeNull())
  })
})
