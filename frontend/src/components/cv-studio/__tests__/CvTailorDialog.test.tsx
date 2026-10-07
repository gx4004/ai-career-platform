import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvTailorDialog } from '#/components/cv-studio/CvTailorDialog'
import { ApiError } from '#/lib/api/errors'

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

function view(canGenerate = true, versionNames: string[] = []) {
  return render(<CvTailorDialog open onOpenChange={onOpenChange} documentId="d1" canGenerate={canGenerate} remainingRuns={9} onSaved={onSaved} onGenerated={vi.fn()} versionNames={versionNames} />)
}

async function generate() {
  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Staff Designer' } })
  fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Lead our design system and mentor the team across products.' } })
  fireEvent.click(screen.getByRole('button', { name: /Suggest changes/ }))
  await screen.findByText(/3 suggestions for Staff Designer/)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.innerWidth = 1440
  api.tailorCvDocument.mockResolvedValue(proposal)
  api.applyCvTailoring.mockResolvedValue({ id: 'v9', name: 'Staff Designer version', target_role: 'Staff Designer', sections: [], created_at: '2026-07-12T10:00:00Z' })
})

describe('Tailor to a job', () => {
  it('keeps Suggest changes filled while it works, says so, and blocks a second run (cv-studio-G07)', async () => {
    let finish: (value: typeof proposal) => void = () => undefined
    api.tailorCvDocument.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    view()
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Staff Designer' } })
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Lead our design system and mentor the team across products.' } })
    fireEvent.click(screen.getByRole('button', { name: /Suggest changes/ }))
    const busy = await screen.findByRole('button', { name: /Suggest changes/, busy: true }) as HTMLButtonElement
    // Loading, not disabled: the kit keeps a loading button's fill and shadow (STICKER 1.7).
    expect(busy.disabled).toBe(false)
    expect(busy.getAttribute('data-loading')).toBe('true')
    // The status also says what closing costs, now that the dialog can be closed while it works (cv-studio-G19).
    expect(screen.getByRole('status').textContent).toBe('Reading the job and your CV… Closing now won’t give this run back.')
    // The button itself says it is working, where a phone user's eye is (cv-studio-G18).
    expect(busy.querySelector('.kit-button__loading-label')?.textContent).toBe('Suggesting…')
    fireEvent.click(busy)
    expect(api.tailorCvDocument).toHaveBeenCalledTimes(1)
    finish(proposal)
    await screen.findByText(/3 suggestions for Staff Designer/)
    expect(screen.queryByText('Reading the job and your CV…')).toBeNull()
  })

  // cv-studio-G19: the model can take minutes; the user is never shut in the dialog while it works.
  it('can be closed while suggestions are generating, and a late answer changes nothing', async () => {
    let finish: (value: typeof proposal) => void = () => undefined
    let signal: AbortSignal | undefined
    api.tailorCvDocument.mockImplementation((_id: string, _payload: unknown, options?: { signal?: AbortSignal }) => {
      signal = options?.signal
      return new Promise((resolve) => { finish = resolve })
    })
    const onGenerated = vi.fn()
    const opened = vi.fn()
    function Host() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Reopen</button>
          <CvTailorDialog open={open} onOpenChange={(next) => { opened(next); setOpen(next) }} documentId="d1" canGenerate remainingRuns={9} onSaved={onSaved} onGenerated={onGenerated} />
        </>
      )
    }
    render(<Host />)
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Staff Designer' } })
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Lead our design system and mentor the team across products.' } })
    fireEvent.click(screen.getByRole('button', { name: /Suggest changes/ }))
    await screen.findByRole('button', { name: /Suggest changes/, busy: true })
    // The corner close button is there, and Cancel works while it generates.
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })).toBeTruthy()
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(false)
    fireEvent.click(cancel)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(opened).toHaveBeenLastCalledWith(false)
    // The request stops, and the run count is refreshed (the server counted the run when it started).
    expect(signal?.aborted).toBe(true)
    expect(onGenerated).toHaveBeenCalledTimes(1)
    // An answer that arrives anyway does nothing: no reopen, no suggestions, no error.
    finish(proposal)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opened).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByText(/suggestions for Staff Designer/)).toBeNull()
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(within(dialog).queryByRole('status')).toBeNull()
    expect((within(dialog).getByRole('button', { name: 'Suggest changes' })).getAttribute('aria-busy')).toBeNull()
    expect(onGenerated).toHaveBeenCalledTimes(1)
  })

  it('closes with Escape while suggestions are generating', async () => {
    api.tailorCvDocument.mockReturnValue(new Promise(() => undefined))
    view()
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Staff Designer' } })
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Lead our design system and mentor the team across products.' } })
    fireEvent.click(screen.getByRole('button', { name: /Suggest changes/ }))
    await screen.findByRole('button', { name: /Suggest changes/, busy: true })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the phone’s Save on one line: the count moves under the version name (cv-studio-G12)', async () => {
    window.innerWidth = 320
    view()
    await generate()
    fireEvent.click(within(screen.getByRole('article', { name: 'Suggestion for Leads design systems' })).getByRole('button', { name: /Use suggestion/ }))
    expect(screen.getByRole('button', { name: /^Save version/ }).textContent?.trim()).toBe('Save version')
    expect(screen.getByText('1 change will be saved.')).toBeTruthy()
  })

  it('keeps the version name with the suggestions on a phone, so the footer leaves room to read them', async () => {
    window.innerWidth = 375
    view()
    await generate()
    // The footer holds only the Save button; the name field follows the last suggestion in the scrolling body.
    expect(screen.getByLabelText('Save as version').closest('.kit-panel__footer')).toBeNull()
    expect(screen.getByRole('button', { name: /^Save version/ }).closest('.kit-panel__footer')).not.toBeNull()
    // A way out beside the save, as in every other form dialog (consistency-F14).
    expect(screen.getByRole('button', { name: 'Cancel' }).closest('.kit-panel__footer')).not.toBeNull()
  })

  it('keeps the version name in the footer beside Save on a wide screen', async () => {
    view()
    await generate()
    expect(screen.getByLabelText('Save as version').closest('.kit-panel__footer')).not.toBeNull()
  })

  it('reviews each suggestion as a before/after card and saves accepted ones as a named version', async () => {
    view()
    expect(screen.getByText('9 suggestion runs left for this CV')).toBeTruthy()
    await generate()
    // The third argument carries the signal that stops the request when the dialog is closed (cv-studio-G19).
    expect(api.tailorCvDocument).toHaveBeenCalledWith('d1', { job_title: 'Staff Designer', job_description: 'Lead our design system and mentor the team across products.' }, { signal: expect.any(AbortSignal) })
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

  it('suggests a version name the CV does not have yet, so Save never starts with a clash', async () => {
    view(true, ['Staff Designer version', 'Staff Designer version 2', 'Base'])
    await generate()
    expect((screen.getByLabelText('Save as version') as HTMLInputElement).value).toBe('Staff Designer version 3')

    // Typing a name the CV has is caught before it reaches the server.
    fireEvent.click(within(screen.getByRole('article', { name: 'Suggestion for Leads design systems' })).getByRole('button', { name: /Use suggestion/ }))
    fireEvent.change(screen.getByLabelText('Save as version'), { target: { value: 'Base' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save version with 1 change' }))
    expect((await screen.findByRole('alert')).textContent).toContain('You already have a version called “Base”. Pick another name.')
    expect(api.applyCvTailoring).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByLabelText('Save as version'))
  })

  it('says plainly when the name is taken and puts the cursor in the name field', async () => {
    api.applyCvTailoring.mockRejectedValueOnce(new ApiError('Variant name already exists', 409, 'Variant name already exists'))
    view()
    await generate()
    fireEvent.click(within(screen.getByRole('article', { name: 'Suggestion for Leads design systems' })).getByRole('button', { name: /Use suggestion/ }))
    fireEvent.change(screen.getByLabelText('Save as version'), { target: { value: 'Staff roles' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save version with 1 change' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('You already have a version called “Staff roles”. Pick another name.')
    expect(screen.queryByText(/Variant/)).toBeNull()
    expect(document.activeElement).toBe(screen.getByLabelText('Save as version'))
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    // A new name clears the message.
    fireEvent.change(screen.getByLabelText('Save as version'), { target: { value: 'Staff roles 2' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // consistency-F14: every form dialog ends in a footer with Cancel then the one primary, the Tailor dialog's first step too.
  it('ends step 1 in a footer with Cancel then the primary Suggest changes', () => {
    view()
    const footer = screen.getByRole('button', { name: 'Cancel' }).closest('.kit-panel__footer') as HTMLElement
    expect(footer).not.toBeNull()
    const buttons = within(footer).getAllByRole('button').map((button) => button.textContent)
    expect(buttons).toEqual(['Cancel', 'Suggest changes'])
    expect(within(footer).getByRole('button', { name: 'Suggest changes' }).classList.contains('kit-button--primary')).toBe(true)
    // The runs left stay with the fields, so the footer is buttons only (it stacks full width on a phone).
    expect(screen.getByText('9 suggestion runs left for this CV').closest('.kit-panel__footer')).toBeNull()
  })

  it('keeps Suggest again in the body as a secondary once suggestions are shown', async () => {
    view()
    await generate()
    const again = screen.getByRole('button', { name: 'Suggest again' })
    expect(again.closest('.kit-panel__footer')).toBeNull()
    expect(again.classList.contains('kit-button--secondary')).toBe(true)
  })

  // "Done" as in CompleteSkillDialog: there is nothing to cancel, and the corner X already carries the name "Close".
  it('offers only Done when the CV already fits the job', async () => {
    api.tailorCvDocument.mockResolvedValueOnce({ ...proposal, changes: [], skipped: [] })
    view()
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Staff Designer' } })
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Lead our design system and mentor the team across products.' } })
    fireEvent.click(screen.getByRole('button', { name: /Suggest changes/ }))
    await screen.findByText(/already fits this job well/)
    const footer = screen.getByRole('button', { name: 'Done' }).closest('.kit-panel__footer') as HTMLElement
    expect(footer).not.toBeNull()
    expect(within(footer).getAllByRole('button').map((button) => button.textContent)).toEqual(['Done'])
    expect(screen.queryByRole('button', { name: /^Save version/ })).toBeNull()
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
