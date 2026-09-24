import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvTailorDialog } from '#/components/cv-studio/CvTailorDialog'

const api = vi.hoisted(() => ({ tailorCvDocument: vi.fn(), applyCvTailoring: vi.fn() }))
vi.mock('#/lib/api/client', () => api)

const change = (id: string, support: 'confirmed' | 'document' | 'unsupported', requirement: string) => ({
  id, section_id: 's1', entry_id: `e-${id}`, before: `Before ${id}`, after: `After ${id}`,
  job_requirement: requirement, evidence_item_ids: support === 'confirmed' ? ['ev-1'] : [], support,
})
const proposal = {
  schema_version: 'cv-tailoring/v1', job_title: 'Staff Designer',
  changes: [change('c1', 'confirmed', 'Leads design systems'), change('c2', 'document', 'Mentors designers'), change('c3', 'unsupported', 'Speaks Japanese')],
  skipped: [{ id: 'c4', reason: 'stale_before_text' }],
  remaining_regenerations: 7, request_id: '8e0f7c55-4f7f-4a57-9a3e-8b7d3c1f2a10', proposal_token: 'a'.repeat(64),
  history_id: null, access_mode: 'authenticated', saved: true, locked_actions: [],
}
const onSaved = vi.fn()
const onOpenChange = vi.fn()

function view(canGenerate = true) {
  return render(<CvTailorDialog open onOpenChange={onOpenChange} documentId="d1" canGenerate={canGenerate} remainingRuns={9} onSaved={onSaved} onGenerated={vi.fn()} />)
}

async function generate() {
  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Staff Designer' } })
  fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Lead our design system and mentor the team across products.' } })
  fireEvent.click(screen.getByRole('button', { name: /Suggest changes/ }))
  await screen.findByText(/3 suggestions for Staff Designer/)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.tailorCvDocument.mockResolvedValue(proposal)
  api.applyCvTailoring.mockResolvedValue({ id: 'v9', name: 'Staff Designer version', target_role: 'Staff Designer', sections: [], created_at: '2026-07-12T10:00:00Z' })
})

describe('Tailor to a job', () => {
  it('reviews each suggestion as a before/after card and saves accepted ones as a named version', async () => {
    view()
    expect(screen.getByText('9 suggestion runs left for this CV')).toBeTruthy()
    await generate()
    expect(api.tailorCvDocument).toHaveBeenCalledWith('d1', { job_title: 'Staff Designer', job_description: 'Lead our design system and mentor the team across products.' })
    expect(screen.getByText(/We left out 1 suggestion because that part of your CV changed/)).toBeTruthy()

    const first = screen.getByRole('article', { name: 'Suggestion for Leads design systems' })
    expect(within(first).getByText('Before c1')).toBeTruthy()
    expect(within(first).getByText('After c1')).toBeTruthy()
    const blocked = screen.getByRole('article', { name: 'Suggestion for Speaks Japanese' })
    expect(within(blocked).queryByRole('button', { name: /Use suggestion/ })).toBeNull()

    const save = screen.getByRole('button', { name: /^Save version/ }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(within(first).getByRole('button', { name: /Use suggestion/ }))
    const second = screen.getByRole('article', { name: 'Suggestion for Mentors designers' })
    fireEvent.click(within(second).getByRole('button', { name: /Use suggestion/ }))
    fireEvent.click(within(second).getByRole('button', { name: /Keep mine/ }))
    expect(within(second).getByRole('button', { name: /Keep mine/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(screen.getByLabelText('Save as version'), { target: { value: 'Staff roles' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save version with 1 change' }))
    await waitFor(() => expect(api.applyCvTailoring).toHaveBeenCalledWith('d1', expect.objectContaining({
      variant_name: 'Staff roles', job_title: 'Staff Designer',
      decisions: [{ change_id: 'c1', action: 'accept' }, { change_id: 'c2', action: 'reject' }, { change_id: 'c3', action: 'reject' }],
    })))
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'v9' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('waits for unsaved edits before generating and explains a failure plainly', async () => {
    const { rerender } = view(false)
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Staff Designer' } })
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Lead our design system and mentor the team.' } })
    expect((screen.getByRole('button', { name: /Suggest changes/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Saving your latest edits first…')).toBeTruthy()
    rerender(<CvTailorDialog open onOpenChange={onOpenChange} documentId="d1" canGenerate remainingRuns={9} onSaved={onSaved} onGenerated={vi.fn()} />)
    api.tailorCvDocument.mockRejectedValueOnce(new Error('Tailoring is busy.'))
    fireEvent.click(screen.getByRole('button', { name: /Suggest changes/ }))
    expect((await screen.findByRole('alert')).textContent).toBe('Tailoring is busy. Your CV hasn’t changed.')
  })
})
