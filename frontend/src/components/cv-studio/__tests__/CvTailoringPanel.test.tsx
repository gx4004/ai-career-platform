import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvTailoringPanel } from '#/components/cv-studio/CvTailoringPanel'
import type { CvTailoringProposal } from '#/lib/api/schemas'

const api = vi.hoisted(() => ({
  tailorCvDocument: vi.fn(), applyCvTailoring: vi.fn(), proposeCvTailoringEdit: vi.fn(),
}))
vi.mock('#/lib/api/client', () => api)

const confirmed = {
  id: 'c1', section_id: 's1', entry_id: 'e1',
  before: 'Led platform work.', after: 'Led platform work that cut review time by 23%.',
  job_requirement: 'Distributed systems ownership', evidence_item_ids: ['ev-1', 'ev-2'], support: 'confirmed' as const,
}
const fromDocument = {
  id: 'c2', section_id: 's1', entry_id: 'e2',
  before: 'Mentored engineers.', after: 'Mentored four engineers through promotion.',
  job_requirement: 'Team growth', evidence_item_ids: [], support: 'document' as const,
}
const unsupported = {
  id: 'c3', section_id: 's1', entry_id: 'e3',
  before: 'Improved reliability.', after: 'Improved reliability to 99.99% uptime.',
  job_requirement: 'Reliability record', evidence_item_ids: [], support: 'unsupported' as const,
}
const proposal: CvTailoringProposal = {
  schema_version: 'cv-tailoring/v1', job_title: 'Staff Engineer',
  changes: [confirmed, fromDocument, unsupported], remaining_regenerations: 4,
  request_id: '0a5b9f3c-1d2e-4f60-8a71-2c3d4e5f6071', proposal_token: 'a'.repeat(64),
  history_id: 'h1', access_mode: 'authenticated', saved: true, locked_actions: [],
}
const onApplied = vi.fn()
const onGenerated = vi.fn()

function view(props: Partial<Parameters<typeof CvTailoringPanel>[0]> = {}) {
  return render(<CvTailoringPanel documentId="d1" disabled={false} remainingRuns={10} onApplied={onApplied} onGenerated={onGenerated} {...props} />)
}

// Every decision test needs a proposal on screen first, and the generate button
// only unlocks once the job description clears the 20-character floor.
async function generate() {
  fireEvent.change(screen.getByLabelText('Target job title'), { target: { value: 'Staff Engineer' } })
  fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Own distributed systems and grow the team.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate proposal' }))
  return (await screen.findByRole('heading', { name: 'Distributed systems ownership' })).closest('article') as HTMLElement
}

function changeCard(requirement: string) {
  return screen.getByRole('heading', { name: requirement }).closest('article') as HTMLElement
}

function applyButton() {
  return screen.getByRole('button', { name: 'Create reviewed variant' }) as HTMLButtonElement
}

beforeEach(() => {
  vi.clearAllMocks()
  api.tailorCvDocument.mockResolvedValue(proposal)
  api.applyCvTailoring.mockResolvedValue({ id: 'v2' })
  api.proposeCvTailoringEdit.mockResolvedValue({ id: 'ev-9' })
})

describe('CV tailoring review surface', () => {
  it('keeps generation locked until a job title and a substantial description are present', async () => {
    view()
    const generateButton = screen.getByRole('button', { name: 'Generate proposal' }) as HTMLButtonElement
    expect(generateButton.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Target job title'), { target: { value: 'Staff Engineer' } })
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Too short' } })
    expect(generateButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Own distributed systems and grow the team.' } })
    fireEvent.click(generateButton)

    await waitFor(() => expect(api.tailorCvDocument).toHaveBeenCalledWith('d1', {
      job_title: 'Staff Engineer', job_description: 'Own distributed systems and grow the team.',
    }))
    expect(onGenerated).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('4 tailored generations remain for this document.')).toBeTruthy()
  })

  it('offers no decision at all on an unsupported change', async () => {
    view()
    await generate()

    const blocked = changeCard('Reliability record')
    expect(blocked.querySelector('fieldset')).toBeNull()
    expect(within(blocked).queryAllByRole('radio')).toHaveLength(0)
    expect(blocked.className).toContain('is-blocked')
    expect(within(blocked).getByText('Blocked: confirm supporting evidence in your Evidence Profile, then regenerate.')).toBeTruthy()
    // The reviewable changes keep their decision controls.
    expect(within(changeCard('Distributed systems ownership')).getAllByRole('radio')).toHaveLength(3)
  })

  it('names the confirmed evidence behind a change and the document provenance of another', async () => {
    view()
    const supported = await generate()

    expect(within(supported).getByText('Confirmed evidence: ev-1, ev-2')).toBeTruthy()
    expect(within(supported).getByText('Led platform work that cut review time by 23%.')).toBeTruthy()
    expect(within(changeCard('Team growth')).getByText('Provenance: existing document content')).toBeTruthy()
  })

  it('routes new edited wording through the evidence-confirmation loop instead of creating a variant', async () => {
    view()
    const supported = await generate()

    fireEvent.click(within(supported).getByRole('radio', { name: 'edit' }))
    fireEvent.change(screen.getByLabelText('Edit proposed wording for Distributed systems ownership'), {
      target: { value: 'Led platform work that cut review time by 40%.' },
    })
    fireEvent.click(applyButton())

    await waitFor(() => expect(api.proposeCvTailoringEdit).toHaveBeenCalledWith('d1', expect.objectContaining({
      request_id: proposal.request_id, proposal_token: proposal.proposal_token, job_title: 'Staff Engineer',
      change_id: 'c1', edited_after: 'Led platform work that cut review time by 40%.',
    })))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Your edited wording was saved as unconfirmed evidence. Confirm it in your Evidence Profile, then regenerate this proposal.',
    )
    expect(api.applyCvTailoring).not.toHaveBeenCalled()
    expect(onApplied).not.toHaveBeenCalled()
    // The proposal stays on screen so the reviewer can see what was not applied.
    expect(applyButton()).toBeTruthy()
  })

  it('keeps the apply action disabled while every change is rejected', async () => {
    view()
    const supported = await generate()

    // No decision at all is treated as a rejection, so the default state is inert.
    expect(applyButton().disabled).toBe(true)
    fireEvent.click(within(supported).getByRole('radio', { name: 'reject' }))
    fireEvent.click(within(changeCard('Team growth')).getByRole('radio', { name: 'reject' }))
    expect(applyButton().disabled).toBe(true)

    fireEvent.click(within(supported).getByRole('radio', { name: 'accept' }))
    expect(applyButton().disabled).toBe(false)
  })

  it('creates the variant with a decision recorded for every proposed change', async () => {
    view()
    const supported = await generate()

    fireEvent.click(within(supported).getByRole('radio', { name: 'accept' }))
    fireEvent.click(applyButton())

    await waitFor(() => expect(api.applyCvTailoring).toHaveBeenCalledWith('d1', expect.objectContaining({
      request_id: proposal.request_id, variant_name: 'Staff Engineer — tailored', job_title: 'Staff Engineer',
      proposal_token: proposal.proposal_token, changes: proposal.changes,
      decisions: [
        { change_id: 'c1', action: 'accept' },
        { change_id: 'c2', action: 'reject' },
        { change_id: 'c3', action: 'reject' },
      ],
    })))
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Create reviewed variant' })).toBeNull()
  })

  it('reports a failed apply without claiming the document changed', async () => {
    api.applyCvTailoring.mockRejectedValueOnce(new Error('The proposal expired.'))
    view()
    const supported = await generate()

    fireEvent.click(within(supported).getByRole('radio', { name: 'accept' }))
    fireEvent.click(applyButton())

    expect((await screen.findByRole('alert')).textContent).toContain('The proposal expired. Your document was not changed.')
    expect(onApplied).not.toHaveBeenCalled()
  })
})
