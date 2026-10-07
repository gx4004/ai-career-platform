import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvImportDialog } from '#/components/cv-studio/CvImportDialog'
import { mergeIntoPrevious, moveImportEntry, toAcceptable } from '#/components/cv-studio/importReview'
import type { CvImportProposal } from '#/lib/api/schemas'

const api = vi.hoisted(() => ({ proposeCvImport: vi.fn(), acceptCvImport: vi.fn() }))
vi.mock('#/lib/api/client', () => api)

const header = { name: 'Alex Morgan', headline: 'Backend engineer', email: 'alex@example.com', phone: null, location: 'Berlin', links: [] }
const proposal: CvImportProposal = {
  filename: 'cv.pdf', import_id: '6b1f1d8e-4a4c-4c49-9b7e-3d5c1a2f0e11', name: 'Alex Morgan CV', warnings: [], header,
  sections: [
    {
      id: 'exp', kind: 'experience', title: 'Experience', visible: true, position: 0,
      entries: [
        { id: 'r1', body: 'Led the platform move.', position: 0, claim: null, heading: 'Senior Backend Engineer', subheading: 'Northwind Labs', start_date: 'Mar 2022', end_date: 'Present', bullets: ['Led the platform move.'] },
        { id: 'r2', body: 'Mentored four engineers.', position: 1, claim: null, heading: 'Mentoring', bullets: ['Mentored four engineers.'] },
      ],
    },
    { id: 'skills', kind: 'skills', title: 'Skills', visible: true, position: 1, entries: [{ id: 's1', body: 'Python, SQL', position: 0, claim: null }] },
  ],
}

function open() {
  const onImported = vi.fn()
  render(<CvImportDialog open onOpenChange={vi.fn()} onImported={onImported} />)
  return onImported
}

beforeEach(() => {
  vi.clearAllMocks()
  api.proposeCvImport.mockResolvedValue(proposal)
  api.acceptCvImport.mockResolvedValue({ id: 'd1' })
})

describe('import review step', () => {
  it('reads pasted text through the same endpoint as a file', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }))
    const read = screen.getByRole('button', { name: 'Read my CV' })
    expect((read as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Your CV as text'), { target: { value: 'Alex Morgan\nSenior Backend Engineer, Northwind Labs' } })
    fireEvent.click(read)
    await waitFor(() => expect(api.proposeCvImport).toHaveBeenCalledTimes(1))
    const file = api.proposeCvImport.mock.calls[0][0] as File
    expect(file.name).toBe('pasted-cv.txt')
    expect(file.type).toBe('text/plain')
    expect(await screen.findByLabelText('CV name')).toBeTruthy()
  })

  it('shows the name and contact block and every role as an editable card', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }))
    fireEvent.change(screen.getByLabelText('Your CV as text'), { target: { value: 'x'.repeat(40) } })
    fireEvent.click(screen.getByRole('button', { name: 'Read my CV' }))
    const head = await screen.findByRole('region', { name: 'Name and contact details' })
    expect((within(head).getByLabelText('Your name') as HTMLInputElement).value).toBe('Alex Morgan')
    expect((within(head).getByLabelText('Email') as HTMLInputElement).value).toBe('alex@example.com')
    const card = screen.getByRole('article', { name: 'Senior Backend Engineer' })
    expect((within(card).getByLabelText('Company') as HTMLInputElement).value).toBe('Northwind Labs')
    expect((within(card).getByLabelText('Start') as HTMLInputElement).value).toBe('Mar 2022')
    expect((within(card).getByLabelText('Highlights') as HTMLTextAreaElement).value).toBe('Led the platform move.')
  })

  it('creates the CV from the corrected cards: edited company, merged role, moved entry, blank contact fields as null', async () => {
    const onImported = open()
    fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }))
    fireEvent.change(screen.getByLabelText('Your CV as text'), { target: { value: 'x'.repeat(40) } })
    fireEvent.click(screen.getByRole('button', { name: 'Read my CV' }))
    const first = await screen.findByRole('article', { name: 'Senior Backend Engineer' })
    fireEvent.change(within(first).getByLabelText('Company'), { target: { value: 'Northwind' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '' } })

    // The second role is really part of the first: fold it in.
    const second = screen.getByRole('article', { name: 'Mentoring' })
    expect((within(first).getByRole('button', { name: 'Merge into previous' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(second).getByRole('button', { name: 'Merge into previous' }))
    expect(screen.queryByRole('article', { name: 'Mentoring' })).toBeNull()
    // The card it joined keeps its place and takes focus (the button that was used went with the folded card).
    await waitFor(() => expect(document.activeElement).toBe(within(first).getByLabelText('Job title')))
    expect(within(first).getByLabelText('Highlights')).toHaveProperty('value', 'Led the platform move.\nMentoring\nMentored four engineers.')

    fireEvent.click(screen.getByRole('button', { name: 'Create my CV' }))
    await waitFor(() => expect(api.acceptCvImport).toHaveBeenCalledTimes(1))
    const sent = api.acceptCvImport.mock.calls[0][0] as CvImportProposal
    const roles = sent.sections[0].entries
    expect(roles).toHaveLength(1)
    expect(roles[0]).toMatchObject({ id: 'r1', subheading: 'Northwind', bullets: ['Led the platform move.', 'Mentoring', 'Mentored four engineers.'] })
    expect(roles[0].body).toBe('Led the platform move.\nMentoring\nMentored four engineers.')
    expect(sent.header.email).toBeNull()
    expect(sent.header.name).toBe('Alex Morgan')
    await waitFor(() => expect(onImported).toHaveBeenCalled())
  })

  it('moves an entry to a section of the same shape from its menu, and focus follows the card (cv-studio-G08)', async () => {
    // A role can go to Projects (title, organisation, dates) but not to Skills, which could not show or edit them.
    const projects = { id: 'proj', kind: 'projects' as const, title: 'Projects', visible: true, position: 2, entries: [] }
    api.proposeCvImport.mockResolvedValue({ ...proposal, sections: [...proposal.sections, projects] })
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }))
    fireEvent.change(screen.getByLabelText('Your CV as text'), { target: { value: 'x'.repeat(40) } })
    fireEvent.click(screen.getByRole('button', { name: 'Read my CV' }))
    const second = await screen.findByRole('article', { name: 'Mentoring' })
    fireEvent.keyDown(within(second).getByRole('button', { name: 'Move to section' }), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Skills' })).toBeNull()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Projects' }))
    await waitFor(() => expect(screen.getByRole('article', { name: 'Mentoring' }).closest('section')?.querySelector('h3')?.textContent).toMatch(/^Projects/))
    const moved = screen.getByRole('article', { name: 'Mentoring' })
    await waitFor(() => expect(window.document.activeElement).toBe(within(moved).getByLabelText('Project name')))
  })

  it('offers no move for an entry no other section can take (cv-studio-G08)', async () => {
    open()
    fireEvent.click(screen.getByRole('radio', { name: 'Paste text' }))
    fireEvent.change(screen.getByLabelText('Your CV as text'), { target: { value: 'x'.repeat(40) } })
    fireEvent.click(screen.getByRole('button', { name: 'Read my CV' }))
    await screen.findByRole('article', { name: 'Mentoring' })
    // Experience's roles have no other structured section here, and Skills has no other freeform one.
    expect(screen.queryByRole('button', { name: 'Move to section' })).toBeNull()
  })
})

describe('import edits (pure)', () => {
  it('merges an entry into the one above and renumbers positions', () => {
    const next = mergeIntoPrevious(proposal, 'exp', 'r2')
    expect(next.sections[0].entries.map((entry) => [entry.id, entry.position])).toEqual([['r1', 0]])
    expect(mergeIntoPrevious(proposal, 'exp', 'r1')).toEqual(proposal)
  })

  it('moves an entry to the end of another section', () => {
    const next = moveImportEntry(proposal, 'exp', 'r1', 'skills')
    expect(next.sections[0].entries.map((entry) => entry.id)).toEqual(['r2'])
    expect(next.sections[1].entries.map((entry) => [entry.id, entry.position])).toEqual([['s1', 0], ['r1', 1]])
  })

  it('leaves an untouched proposal exactly as the server sent it', () => {
    expect(toAcceptable(proposal, 'Alex Morgan CV')).toEqual(proposal)
  })

  it('drops an entry with nothing in it and turns a blank field into null', () => {
    const edited = {
      ...proposal,
      sections: [{ ...proposal.sections[0], entries: [{ ...proposal.sections[0].entries[0], subheading: '  ', bullets: [''], body: '' }] }],
    }
    expect(toAcceptable(edited, 'x').sections[0].entries[0]).toMatchObject({ heading: 'Senior Backend Engineer', subheading: null, bullets: [], body: 'Senior Backend Engineer' })
    const empty = { ...proposal, sections: [{ ...proposal.sections[0], entries: [{ id: 'z', body: ' ', position: 0, claim: null }] }] }
    expect(toAcceptable(empty, 'x').sections[0].entries).toEqual([])
  })
})
