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
    // The status shares the row's actions with edit and delete, so on a phone the three form one line under the text.
    const status = within(reword).getByLabelText('Status')
    const actions = status.closest('.kit-row__actions') as HTMLElement
    expect(actions.getAttribute('data-placement')).toBe('below')
    expect(within(actions).getByRole('button', { name: /^Edit / })).toBeTruthy()
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
    expect(within(rows[0]).getByRole('button', { name: 'Edit Kubernetes' })).toBeTruthy()
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

  // Replaces the old "an unchanged note already on the skill is saved as a fact" test: the notes are the PLAN
  // ("What you plan to do to close this gap"), so saving them as "what you did" claimed work never done
  // (sign-off history-profile-F01). The plan is shown, never pre-filled, never sent as the fact, and kept.
  it('a plan on the skill is shown but not pre-filled, and marking done with nothing written adds no fact and keeps the plan', async () => {
    const plan = 'Take the CKA course and run a small cluster at home.'
    getPlanMock.mockResolvedValue({ schema_version: 'development-plan/v1', items: [makeItem({ id: 'd1', notes: plan })] })
    updateItemMock.mockImplementation((id: string, body: { notes?: string | null }) =>
      Promise.resolve(makeItem({ id, state: 'completed', notes: 'notes' in body ? body.notes : plan, evidence_item_id: null })))
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'completed' } })

    const dialog = await screen.findByRole('dialog', { name: 'What did you do?' })
    expect((within(dialog).getByRole('textbox', { name: /What you did/ }) as HTMLTextAreaElement).value).toBe('')
    expect(within(dialog).getByText('Your plan')).toBeTruthy()
    expect(within(dialog).getByText(plan)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark complete' }))

    // The completion carries no words (the server stages a fact only from the notes it holds), then the plan is put back.
    await waitFor(() => expect(updateItemMock).toHaveBeenCalledTimes(2))
    expect(updateItemMock).toHaveBeenNthCalledWith(1, 'd1', { state: 'completed', notes: null })
    expect(updateItemMock).toHaveBeenNthCalledWith(2, 'd1', { notes: plan })
    expect(await screen.findByRole('dialog', { name: 'Marked complete' })).toBeTruthy()
  })

  it('words written over a plan become the fact, and the plan is kept on the skill', async () => {
    const plan = 'Take the CKA course.'
    getPlanMock.mockResolvedValue({ schema_version: 'development-plan/v1', items: [makeItem({ id: 'd1', notes: plan })] })
    updateItemMock
      .mockImplementationOnce((id: string) => Promise.resolve(makeItem({ id, state: 'completed', notes: 'Passed the CKA', evidence_item_id: 'e9' })))
      .mockImplementationOnce((id: string) => Promise.resolve(makeItem({ id, state: 'completed', notes: plan, evidence_item_id: 'e9' })))
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'completed' } })
    const dialog = await screen.findByRole('dialog', { name: 'What did you do?' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: /What you did/ }), { target: { value: 'Passed the CKA' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark complete' }))

    await waitFor(() => expect(updateItemMock).toHaveBeenCalledTimes(2))
    expect(updateItemMock).toHaveBeenNthCalledWith(1, 'd1', { state: 'completed', notes: 'Passed the CKA' })
    expect(updateItemMock).toHaveBeenNthCalledWith(2, 'd1', { notes: plan })
    expect(await screen.findByRole('dialog', { name: 'Added to your profile' })).toBeTruthy()
  })

  it('if the plan cannot be put back, the completion still stands and the page says so', async () => {
    const plan = 'Take the CKA course.'
    getPlanMock.mockResolvedValue({ schema_version: 'development-plan/v1', items: [makeItem({ id: 'd1', notes: plan })] })
    updateItemMock
      .mockImplementationOnce((id: string) => Promise.resolve(makeItem({ id, state: 'completed', notes: 'Passed', evidence_item_id: 'e9' })))
      .mockImplementationOnce(() => Promise.reject(new Error('Network down')))
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.change(within(reword).getByLabelText('Status'), { target: { value: 'completed' } })
    const dialog = await screen.findByRole('dialog', { name: 'What did you do?' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: /What you did/ }), { target: { value: 'Passed' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark complete' }))

    expect(await screen.findByRole('dialog', { name: 'Added to your profile' })).toBeTruthy()
    expect(await screen.findByText(/your plan could not be kept/i)).toBeTruthy()
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
    fireEvent.click(within(reword).getByRole('button', { name: 'Edit Presentation weakness' }))
    // The dialog names the skill being edited, and its kind in sentence case.
    const editor = await screen.findByRole('dialog')
    expect(within(editor).getByRole('heading', { name: 'Edit Presentation weakness' })).toBeTruthy()
    expect(editor.textContent).toContain('Reword existing content. Set a target date and notes; leave a field empty to clear it.')
    fireEvent.change(await screen.findByLabelText(/^Target date/), {
      target: { value: '2026-09-01' },
    })
    fireEvent.change(screen.getByLabelText(/^Notes/), {
      target: { value: 'Rewrite the summary' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save skill' }))

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
    fireEvent.click(within(reword).getByRole('button', { name: 'Delete Presentation weakness' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete skill' }))

    await waitFor(() => expect(deleteItemMock).toHaveBeenCalledWith('d1'))
  })

  // history-profile-F30: the trash button that opened the dialog is gone after a delete; focus must not fall to BODY.
  it('after a delete moves focus to the next skill in the same group', async () => {
    const third = makeItem({ id: 'd3', gap_kind: 'missing_skill', label: 'Kubernetes' })
    getPlanMock
      .mockResolvedValueOnce({ schema_version: 'development-plan/v1', items: [items[0], third, items[1]] })
      .mockResolvedValue({ schema_version: 'development-plan/v1', items: [third, items[1]] })
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.click(within(reword).getByRole('button', { name: 'Delete Presentation weakness' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete skill' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement?.id).toBe('skill-d3'))
  })

  it('after deleting the last skill to build moves focus to the section heading', async () => {
    getPlanMock
      .mockResolvedValueOnce({ schema_version: 'development-plan/v1', items: [items[0]] })
      .mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    renderSection()

    const reword = await screen.findByRole('list', { name: 'Reword existing content' })
    fireEvent.click(within(reword).getByRole('button', { name: 'Delete Presentation weakness' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete skill' }))

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Skills to build' })))
  })

  it('shows an empty panel pointing to Campaigns when there is nothing to build', async () => {
    getPlanMock.mockResolvedValue({ schema_version: 'development-plan/v1', items: [] })
    renderSection()

    expect(await screen.findByText('Nothing to build yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open applications' }).getAttribute('href')).toBe('/campaigns')
  })

  it('says the list is safe when it cannot load, like the profile error above it', async () => {
    getPlanMock.mockRejectedValue(new Error('boom'))
    renderSection()

    expect(await screen.findByText('Your skills to build couldn’t be loaded')).toBeTruthy()
    expect(screen.getByText('Your list is safe. Try again in a moment.')).toBeTruthy()
  })
})
