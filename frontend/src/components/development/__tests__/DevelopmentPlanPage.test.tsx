import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevelopmentItem } from '#/lib/api/developmentSchemas'
import { DevelopmentPlanPage } from '#/components/development/DevelopmentPlanPage'

const getPlanMock = vi.hoisted(() => vi.fn())
const updateItemMock = vi.hoisted(() => vi.fn())
const deleteItemMock = vi.hoisted(() => vi.fn())
const confirmEvidenceMock = vi.hoisted(() => vi.fn())
const declineEvidenceMock = vi.hoisted(() => vi.fn())
const warmEvidenceFetchMock = vi.hoisted(() => vi.fn())
const warmRecommendationsFetchMock = vi.hoisted(() => vi.fn())
const openAuthDialogMock = vi.hoisted(() => vi.fn())
const sessionState = vi.hoisted(() => ({ status: 'authenticated' as string }))

vi.mock('#/lib/api/development', () => ({
  getDevelopmentPlan: getPlanMock,
  updateDevelopmentItem: updateItemMock,
  deleteDevelopmentItem: deleteItemMock,
  confirmDevelopmentEvidence: confirmEvidenceMock,
  declineDevelopmentEvidence: declineEvidenceMock,
}))

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionState.status, openAuthDialog: openAuthDialogMock }),
}))

vi.mock('#/components/app/AppStatePanel', () => ({
  AppStatePanel: ({
    title,
    actions,
  }: {
    title: string
    actions: { label: string; onClick?: () => void }[]
  }) => (
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

function makeItem(overrides: Partial<DevelopmentItem>): DevelopmentItem {
  return {
    id: 'id',
    gap_classification_id: 'g1',
    gap_kind: 'presentation_weakness',
    response_kind: 'reword',
    state: 'planned',
    target_date: null,
    notes: null,
    source_finding_id: null,
    timeline: [],
    evidence_proposal: null,
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

function renderPage({ warmEvidenceConsumers = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      {warmEvidenceConsumers ? <WarmEvidenceConsumers /> : null}
      <DevelopmentPlanPage />
    </QueryClientProvider>,
  )
}

describe('DevelopmentPlanPage', () => {
  beforeEach(() => {
    sessionState.status = 'authenticated'
    getPlanMock
      .mockReset()
      .mockResolvedValue({ schema_version: 'development-plan/v1', items })
    updateItemMock.mockReset().mockImplementation((id: string) => Promise.resolve(makeItem({ id })))
    deleteItemMock.mockReset().mockResolvedValue(undefined)
    confirmEvidenceMock.mockReset().mockResolvedValue(
      makeItem({
        id: 'd3',
        state: 'completed',
        evidence_proposal: {
          id: 'e1',
          content: { statement: 'Completed the planned work.' },
          confirmation_state: 'confirmed',
        },
      }),
    )
    declineEvidenceMock.mockReset().mockResolvedValue(
      makeItem({ id: 'd3', state: 'completed' }),
    )
    warmEvidenceFetchMock.mockReset().mockResolvedValue({ items: [] })
    warmRecommendationsFetchMock.mockReset().mockResolvedValue({
      confirmed_item_count: 0,
      preference_item_count: 0,
      items: [],
    })
    openAuthDialogMock.mockReset()
  })

  it('renders items grouped by response kind with a labeled status control', async () => {
    renderPage()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    const learn = screen.getByRole('region', { name: 'Learn a new skill' })

    const rewordStatus = within(reword).getByRole('combobox') as HTMLSelectElement
    expect(rewordStatus.value).toBe('planned')
    // The visible state badge (not the <select> option) reflects the state.
    expect(within(reword).getByText('Planned', { selector: '.development-state' })).toBeTruthy()
    // The status control is labeled for assistive tech.
    expect(within(reword).getByLabelText('Status')).toBe(rewordStatus)

    const learnStatus = within(learn).getByRole('combobox') as HTMLSelectElement
    expect(learnStatus.value).toBe('in_progress')
    expect(within(learn).getByText('Take a course')).toBeTruthy()
  })

  it('changes an item state through the update endpoint', async () => {
    renderPage()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByRole('combobox'), {
      target: { value: 'in_progress' },
    })

    await waitFor(() =>
      expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'in_progress' }),
    )
  })

  it('edits the target date and notes through the update endpoint', async () => {
    renderPage()

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
    renderPage()

    const reword = await screen.findByRole('region', { name: 'Reword existing content' })
    fireEvent.click(within(reword).getByRole('button', { name: /Delete/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete item/i }))

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('d1'))
  })

  it('offers reachable confirm and decline actions for a completion proposal', async () => {
    getPlanMock.mockResolvedValue({
      schema_version: 'development-plan/v1',
      items: [
        makeItem({
          id: 'd3',
          state: 'completed',
          evidence_proposal: {
            id: 'e1',
            content: { statement: 'Rewrote the CV summary around measured outcomes.' },
            confirmation_state: 'unconfirmed',
          },
        }),
      ],
    })
    renderPage()

    const group = await screen.findByRole('region', { name: 'Reword existing content' })
    expect(within(group).getByText(/ready to become reusable evidence/i)).toBeTruthy()
    expect(
      within(group).getByText('Rewrote the CV summary around measured outcomes.'),
    ).toBeTruthy()
    fireEvent.click(within(group).getByRole('button', { name: 'Confirm evidence' }))
    await waitFor(() => expect(confirmEvidenceMock).toHaveBeenCalledWith('d3'))

    fireEvent.click(within(group).getByRole('button', { name: 'Decline proposal' }))
    await waitFor(() => expect(declineEvidenceMock).toHaveBeenCalledWith('d3'))
  })

  it.each([
    {
      actionName: 'Confirm evidence',
      mutation: confirmEvidenceMock,
      expectedRecommendationCalls: 2,
    },
    {
      actionName: 'Decline proposal',
      mutation: declineEvidenceMock,
      expectedRecommendationCalls: 1,
    },
  ])(
    '$actionName refreshes warm evidence consumers with ranking impact respected',
    async ({ actionName, mutation, expectedRecommendationCalls }) => {
      getPlanMock.mockResolvedValue({
        schema_version: 'development-plan/v1',
        items: [
          makeItem({
            id: 'd3',
            state: 'completed',
            evidence_proposal: {
              id: 'e1',
              content: { statement: 'Rewrote the CV summary around measured outcomes.' },
              confirmation_state: 'unconfirmed',
            },
          }),
        ],
      })
      renderPage({ warmEvidenceConsumers: true })

      const group = await screen.findByRole('region', { name: 'Reword existing content' })
      await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(1))

      fireEvent.click(within(group).getByRole('button', { name: actionName }))

      await waitFor(() => expect(mutation).toHaveBeenCalledWith('d3'))
      await waitFor(() => expect(getPlanMock).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(2))
      expect(warmRecommendationsFetchMock).toHaveBeenCalledTimes(expectedRecommendationCalls)
    },
  )

  it('shows confirmed evidence without offering proposal actions again', async () => {
    getPlanMock.mockResolvedValue({
      schema_version: 'development-plan/v1',
      items: [
        makeItem({
          id: 'd3',
          state: 'completed',
          evidence_proposal: {
            id: 'e1',
            content: { statement: 'Rewrote the CV summary around measured outcomes.' },
            confirmation_state: 'confirmed',
          },
        }),
      ],
    })
    renderPage()

    const group = await screen.findByRole('region', { name: 'Reword existing content' })
    expect(within(group).getByText('Evidence confirmed')).toBeTruthy()
    expect(within(group).queryByRole('button', { name: 'Decline proposal' })).toBeNull()
  })

  it('shows a sign-in prompt when unauthenticated and does not fetch', () => {
    sessionState.status = 'guest'
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(openAuthDialogMock).toHaveBeenCalledWith({ to: '/development-plan', reason: 'account' })
    expect(getPlanMock).not.toHaveBeenCalled()
  })
})
