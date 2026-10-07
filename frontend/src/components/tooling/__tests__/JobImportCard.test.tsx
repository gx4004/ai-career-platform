import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { JobImportCard } from '#/components/tooling/JobImportCard'

const importJobUrlMock = vi.hoisted(() => vi.fn())
const importJobTextMock = vi.hoisted(() => vi.fn())
const listApplicationsMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'authenticated'

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('#/lib/api/client', () => ({
  importJobUrl: importJobUrlMock,
  importJobText: importJobTextMock,
  listApplications: listApplicationsMock,
}))


function renderCard(onImported = vi.fn(), onSubmit = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    onImported,
    onSubmit,
    ...render(
      <QueryClientProvider client={queryClient}>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <JobImportCard onImported={onImported} />
          <button type="submit">Run the tool</button>
        </form>
      </QueryClientProvider>,
    ),
  }
}

/** The card next to a real job description field, as on the tool pages. */
function Harness({ initial, onImported }: { initial: string; onImported: (text: string) => void }) {
  const [text, setText] = useState(initial)
  return (
    <>
      <JobImportCard
        current={text}
        onImported={(next) => {
          onImported(next)
          setText(next)
        }}
      />
      <textarea aria-label="Job description" value={text} onChange={(event) => setText(event.target.value)} />
    </>
  )
}

function renderWithField(initial: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onImported = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <Harness initial={initial} onImported={onImported} />
    </QueryClientProvider>,
  )
  return { onImported, field: () => screen.getByLabelText('Job description') as HTMLTextAreaElement }
}

const application = {
  id: 'app-1',
  label: 'Run label that must not be shown',
  title: 'Senior Backend Engineer',
  company: 'Northwind Labs',
  status: 'saved',
}

function typeUrl(value = 'https://jobs.example.com/backend') {
  fireEvent.change(screen.getByLabelText(/Import from job URL/), { target: { value } })
}

describe('JobImportCard', () => {
  afterEach(() => {
    importJobUrlMock.mockReset()
    importJobTextMock.mockReset()
    listApplicationsMock.mockReset()
    sessionStatus = 'authenticated'
  })

  describe('importing from a URL', () => {
    it('hands a real description to the page', async () => {
      importJobUrlMock.mockResolvedValue({ job_description: 'A real posting with plenty of detail about the role.' })
      const { onImported } = renderCard()
      typeUrl()
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      await waitFor(() => expect(onImported).toHaveBeenCalledWith('A real posting with plenty of detail about the role.'))
      expect(screen.queryByText("Couldn't read that page")).toBeNull()
    })

    // F21/F06: on touch a 44px button inside the 44px input frame doubled its border. The button sits beside the input.
    it('puts the Import button beside the URL input, not inside its frame', () => {
      renderCard()
      const input = screen.getByLabelText(/Import from job URL/)
      const button = screen.getByRole('button', { name: 'Import' })
      expect(input.closest('.kit-input')?.contains(button)).toBe(false)
      expect(button.closest('.kit-cluster')?.contains(input)).toBe(true)
    })

    it.each([
      // B13: a blocked board or a page that is not a job ad (https://example.com/) answers readable:false.
      ['a page the importer marks unreadable', { readable: false, job_description: '' }],
      ['readable:false even when text came back', { readable: false, job_description: 'Example Domain. This domain is for use in examples.' }],
      ['an empty page', { job_description: '' }],
      ['whitespace only', { job_description: '   \n' }],
    ])('leaves the job description alone and says so for %s (D03)', async (_name, answer) => {
      importJobUrlMock.mockResolvedValue(answer)
      const { onImported } = renderCard()
      typeUrl()
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      expect(await screen.findByText("Couldn't read that page")).toBeTruthy()
      expect(screen.getByText(/Paste the job description below instead/)).toBeTruthy()
      expect(onImported).not.toHaveBeenCalled()
      // Outside the stone import panel: three nested paddings left a phone a 150px text column.
      expect(screen.getByText("Couldn't read that page").closest('.tool-import')).toBeNull()
    })

    it('does not overwrite a typed description without asking', async () => {
      importJobUrlMock.mockResolvedValue({ job_description: 'The imported posting text, long enough to read.' })
      const { onImported, field } = renderWithField('My own notes about this role')
      typeUrl('https://www.jobs.example.com/backend')
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      expect(await screen.findByText('Imported the posting from jobs.example.com')).toBeTruthy()
      expect(onImported).not.toHaveBeenCalled()
      expect(field().value).toBe('My own notes about this role')

      fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
      expect(screen.queryByText('Imported the posting from jobs.example.com')).toBeNull()
      expect(field().value).toBe('My own notes about this role')

      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      // The notice asks "Replace it with the posting, or keep yours?": "Replace my description" wrapped onto two lines at 320px.
      fireEvent.click(await screen.findByRole('button', { name: 'Replace' }))
      expect(field().value).toBe('The imported posting text, long enough to read.')
      expect(screen.getByText('Job description filled from jobs.example.com.')).toBeTruthy()
    })

    it('fills an empty description and can undo it', async () => {
      importJobUrlMock.mockResolvedValue({ job_description: 'The imported posting text, long enough to read.' })
      const { field } = renderWithField('')
      typeUrl()
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      expect(await screen.findByText('Job description filled from jobs.example.com.')).toBeTruthy()
      expect(field().value).toBe('The imported posting text, long enough to read.')
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      expect(field().value).toBe('')
      expect(screen.queryByText('Job description filled from jobs.example.com.')).toBeNull()
    })

    it('imports on Enter without submitting the tool form behind it', async () => {
      importJobUrlMock.mockResolvedValue({ job_description: 'A real posting with plenty of detail about the role.' })
      const { onImported, onSubmit } = renderCard()
      typeUrl()
      fireEvent.keyDown(screen.getByLabelText(/Import from job URL/), { key: 'Enter' })
      await waitFor(() => expect(importJobUrlMock).toHaveBeenCalled())
      await waitFor(() => expect(onImported).toHaveBeenCalled())
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('attaching to an application', () => {
    it('is not offered to guests, who have no applications', () => {
      sessionStatus = 'guest'
      renderCard()
      expect(screen.queryByLabelText(/Attach to one of your applications/i)).toBeNull()
      expect(listApplicationsMock).not.toHaveBeenCalled()
    })

    it('lists real applications by title and company, not run labels (D17), and attaches the description on the form', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      importJobTextMock.mockResolvedValue({ job_description: 'A sufficiently detailed pasted listing description.' })
      const { onImported } = renderWithField('A sufficiently detailed pasted listing description.')
      expect(listApplicationsMock).not.toHaveBeenCalled()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      expect(await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })).toBeTruthy()
      expect(screen.queryByRole('option', { name: /Run label/ })).toBeNull()
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      // One place to paste the posting: the form's own job description. Title and company start from the application.
      expect(screen.queryByLabelText('Pasted listing text')).toBeNull()
      expect((screen.getByLabelText('Job title') as HTMLInputElement).value).toBe('Senior Backend Engineer')
      expect((screen.getByLabelText('Company') as HTMLInputElement).value).toBe('Northwind Labs')
      fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Engineer' } })
      fireEvent.click(screen.getByRole('button', { name: 'Attach job description' }))
      await waitFor(() => expect(importJobTextMock).toHaveBeenCalledWith({
        campaign_id: 'app-1', job_title: 'Engineer', company_name: 'Northwind Labs',
        job_description: 'A sufficiently detailed pasted listing description.',
      }, expect.anything()))
      expect(await screen.findByText('Listing attached to Senior Backend Engineer at Northwind Labs.')).toBeTruthy()
      // The description came from the form: nothing is written back into it.
      expect(onImported).not.toHaveBeenCalled()
    })

    // Sign-off tool-inputs-F32: an import with an application picked saves the posting there at once. When the form already
    // had text, "Keep mine" only decides the field below: the page says first what the application now holds.
    it('says the imported posting was saved to the application, before asking about the form field', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      importJobUrlMock.mockResolvedValue({ job_description: 'The imported posting text, long enough to read.' })
      renderWithField('My own notes about this role')
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      typeUrl()
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      const saved = await screen.findByText('The imported posting was saved to Senior Backend Engineer at Northwind Labs.')
      const question = screen.getByText(/Replace it with the posting, or keep yours\?/)
      expect(saved.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.queryByText(/^Listing attached to/)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
      expect(screen.getByText('The imported posting was saved to Senior Backend Engineer at Northwind Labs.')).toBeTruthy()
    })

    it('waits for a job description on the form before it can attach one', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      renderWithField('')
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      const attach = screen.getByRole('button', { name: 'Attach job description' }) as HTMLButtonElement
      expect(attach.disabled).toBe(true)
      expect(screen.getByText(/Paste the job description below first/)).toBeTruthy()
      // Review F6: the button is described by the Field's help through the kit, not by a copy of its id scheme.
      const described = (attach.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent)
      expect(described).toContain('Paste the job description below first.')
    })

    it('says why Import waits while an application is still to be picked', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      renderCard()
      typeUrl()
      expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true)
      const picker = screen.getByLabelText('Application')
      const help = document.getElementById(picker.getAttribute('aria-describedby')?.split(' ')[0] ?? '')
      expect(help?.textContent).toBe('Pick the application this posting belongs to, then Import.')
      fireEvent.change(picker, { target: { value: 'app-1' } })
      expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(false)
    })

    it('points to Discover instead of a dead-end picker when there are no applications yet', async () => {
      listApplicationsMock.mockResolvedValue({ items: [], total: 0 })
      importJobUrlMock.mockResolvedValue({ job_description: 'A real posting with plenty of detail about the role.' })
      const { onImported } = renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      expect(await screen.findByText(/You have no applications yet/)).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Discover jobs' }).getAttribute('href')).toBe('/discovery')
      expect(screen.queryByLabelText('Application')).toBeNull()
      expect(screen.queryByLabelText('Pasted listing text')).toBeNull()
      // The import itself is not held back by a pick that cannot be made.
      typeUrl()
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      await waitFor(() => expect(onImported).toHaveBeenCalled())
    })

    it('offers to attach the description only once an application is picked', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      expect(screen.queryByRole('button', { name: 'Attach job description' })).toBeNull()
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      expect(screen.getByRole('button', { name: 'Attach job description' })).toBeTruthy()
    })

    // The sub-option is a quiet lead sentence under the field labels, not a heading louder than them (sign-off F33).
    it('leads the attach sub-option with a plain sentence, not a heading', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      const group = screen.getByRole('group', { name: 'No posting URL? Attach the job description below to this application.' })
      expect(group.contains(screen.getByRole('button', { name: 'Attach job description' }))).toBe(true)
      expect(screen.queryByRole('heading', { name: /attach the job description/i })).toBeNull()
    })

    it('keeps applied applications out of reach: listed last, disabled and marked Applied', async () => {
      const applied = { ...application, id: 'app-2', title: 'Data Engineer', company: 'Quarry', status: 'interviewing', applied_at: '2026-09-01T10:00:00Z' }
      listApplicationsMock.mockResolvedValue({ items: [applied, application], total: 2 })
      renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      const sent = (await screen.findByRole('option', { name: 'Data Engineer at Quarry (Applied)' })) as HTMLOptionElement
      expect(sent.disabled).toBe(true)
      const open = screen.getByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' }) as HTMLOptionElement
      expect(open.disabled).toBe(false)
      const names = screen.getAllByRole('option').map((option) => option.textContent)
      expect(names.indexOf(open.textContent)).toBeLessThan(names.indexOf(sent.textContent))
      expect(screen.getByRole('option', { name: 'Select an application' })).toBeTruthy()
    })

    it('says so when every application is already applied, instead of asking for a pick', async () => {
      const applied = { ...application, applied_at: '2026-09-01T10:00:00Z' }
      listApplicationsMock.mockResolvedValue({ items: [applied], total: 1 })
      renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      expect(await screen.findByRole('option', { name: 'All your applications are already applied' })).toBeTruthy()
      expect(screen.queryByRole('option', { name: 'Select an application' })).toBeNull()
    })

    it('shows the reason an attach failed, not a generic line', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      importJobTextMock.mockRejectedValue(new Error('Application not found'))
      renderWithField('A sufficiently detailed pasted listing description.')
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      fireEvent.click(screen.getByRole('button', { name: 'Attach job description' }))
      expect(await screen.findByText('Application not found')).toBeTruthy()
    })
  })
})
