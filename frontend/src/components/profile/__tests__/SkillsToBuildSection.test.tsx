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

// The section reads the same evidence query the page warms; both go through one mock.
vi.mock('#/lib/api/client', () => ({
  listEvidenceItems: async () => ({ items: await warmEvidenceFetchMock() }),
}))

vi.mock('#/lib/api/development', () => ({
  getDevelopmentPlan: getPlanMock,
  updateDevelopmentItem: updateItemMock,
  deleteDevelopmentItem: deleteItemMock,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: { children: ReactNode; to: string; params?: { campaignId?: string } }) => (
    <a href={params?.campaignId ? to.replace('$campaignId', params.campaignId) : to} {...rest}>{children}</a>
  ),
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
  useQuery({ queryKey: ['evidence-profile', 'items'], queryFn: () => warmEvidenceFetchMock() })
  return null
}

function renderSection(onShowEvidence?: (id: string) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WarmEvidenceConsumer />
      <SkillsToBuildSection onShowEvidence={onShowEvidence} />
    </QueryClientProvider>,
  )
}

describe('SkillsToBuildSection', () => {
  beforeEach(() => {
    getPlanMock.mockReset().mockResolvedValue({ schema_version: 'development-plan/v1', items })
    updateItemMock.mockReset().mockImplementation((id: string) => Promise.resolve(makeItem({ id })))
    deleteItemMock.mockReset().mockResolvedValue(undefined)
    // The profile's evidence query holds the item list itself (as EvidenceProfilePage stores it).
    warmEvidenceFetchMock.mockReset().mockResolvedValue([
      { id: 'e1', kind: 'skill', content: { name: 'Go' }, provenance: 'user-entered', confirmation_state: 'confirmed', created_at: '2026-07-20T00:00:00Z', updated_at: '2026-07-20T00:00:00Z' },
    ])
  })

  it('renders each skill in its group with its status, notes and profile link', async () => {
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    expect((within(reword).getByLabelText('Status') as HTMLSelectElement).value).toBe('planned')
    const learn = screen.getByRole('list', { name: 'Learn a new skill' })
    expect(within(learn).getByText('Take a course')).toBeTruthy()
    expect(await within(learn).findByText('Added to your profile')).toBeTruthy()
  })

  it('names what to build, links its application, and says whether the fact is saved or waiting for review', async () => {
    getPlanMock.mockResolvedValue({
      schema_version: 'development-plan/v1',
      items: [
        makeItem({ id: 'd1', response_kind: 'learn_skill', gap_kind: 'missing_skill', label: 'Kubernetes', application_id: 'app-7', evidence_item_id: 'e1', state: 'completed' }),
        makeItem({ id: 'd2', response_kind: 'learn_skill', gap_kind: 'missing_skill', label: 'Leadership', evidence_item_id: 'e2', state: 'completed' }),
      ],
    })
    warmEvidenceFetchMock.mockResolvedValue([
      { id: 'e1', kind: 'skill', content: { name: 'Kubernetes' }, provenance: 'user-entered', confirmation_state: 'confirmed', created_at: '2026-07-20T00:00:00Z', updated_at: '2026-07-20T00:00:00Z' },
      { id: 'e2', kind: 'skill', content: { name: 'Leadership' }, provenance: 'imported', confirmation_state: 'unconfirmed', created_at: '2026-07-20T00:00:00Z', updated_at: '2026-07-20T00:00:00Z' },
    ])
    renderSection()

    const learn = await screen.findByRole('list', { name: 'Learn a new skill' })
    const rows = [...learn.children] as HTMLElement[]
    expect(within(rows[0]).getByText('Kubernetes')).toBeTruthy()
    expect(within(rows[0]).getByRole('button', { name: 'Edit: Kubernetes' })).toBeTruthy()
    expect(within(rows[0]).getByRole('link', { name: 'From an application: Kubernetes' }).getAttribute('href')).toBe('/campaigns/app-7')
    expect(await within(rows[0]).findByText('Added to your profile')).toBeTruthy()
    expect(within(rows[1]).getByText('Leadership')).toBeTruthy()
    expect(await within(rows[1]).findByText('Waiting for your review')).toBeTruthy()
    expect(within(rows[1]).queryByText('Added to your profile')).toBeNull()
    expect(within(rows[1]).queryByRole('link', { name: /From an application/ })).toBeNull()
  })

  it('completing a skill asks what was done, saves it with those words and refreshes the profile', async () => {
    updateItemMock.mockImplementation((id: string) => Promise.resolve(makeItem({ id, state: 'completed', evidence_item_id: 'e9' })))
    const onShow = vi.fn()
    renderSection(onShow)

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(1))
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'completed' } })

    const dialog = await screen.findByRole('dialog', { name: 'What did you do?' })
    expect(updateItemMock).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: /What you did/ }), { target: { value: 'Rewrote the summary' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark complete' }))

    await waitFor(() =>
      expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'completed', notes: 'Rewrote the summary' }),
    )
    await waitFor(() => expect(warmEvidenceFetchMock).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('dialog', { name: 'Added to your profile' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show me the fact' }))
    expect(onShow).toHaveBeenCalledWith('e9')
  })

  it('completing with nothing written only marks it done, as the server reports (no fact, no seal)', async () => {
    // With no notes the server stages nothing and returns no linked fact.
    updateItemMock.mockImplementation((id: string) => Promise.resolve(makeItem({ id, state: 'completed', evidence_item_id: null })))
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'completed' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete' }))

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'completed' }))
    const dialog = await screen.findByRole('dialog', { name: 'Marked complete' })
    expect(within(dialog).getByText(/Nothing was added to your profile/)).toBeTruthy()
    expect(within(dialog).queryByText(/suggestion/i)).toBeNull()
    expect(within(dialog).queryByRole('button', { name: /Show me/ })).toBeNull()
  })

  it('an unchanged note already on the skill is saved as a fact, so the result follows the server', async () => {
    getPlanMock.mockResolvedValue({ schema_version: 'development-plan/v1', items: [makeItem({ id: 'd1', notes: 'Rewrote the summary' })] })
    updateItemMock.mockImplementation((id: string) => Promise.resolve(makeItem({ id, state: 'completed', evidence_item_id: 'e9' })))
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'completed' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Mark complete' }))

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'completed' }))
    expect(await screen.findByRole('dialog', { name: 'Added to your profile' })).toBeTruthy()
  })

  it('other status changes save at once', async () => {
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'in_progress' } })

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledWith('d1', { state: 'in_progress' }))
  })

  it('edits the target date and notes by opening the skill', async () => {
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.click(within(reword).getByRole('button', { name: 'Edit: Presentation weakness' }))
    fireEvent.change(await screen.findByLabelText(/^Target date/), {
      target: { value: '2026-09-01' },
    })
    fireEvent.change(screen.getByLabelText(/^Notes/), {
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

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.click(within(reword).getByRole('button', { name: 'Delete: Presentation weakness' }))
    const dialog = await screen.findByRole('alertdialog')
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
