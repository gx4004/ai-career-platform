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
  fireEvent.change(screen.getByPlaceholderText('Job posting URL'), { target: { value } })
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
      fireEvent.click(await screen.findByRole('button', { name: 'Replace my description' }))
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
      fireEvent.keyDown(screen.getByPlaceholderText('Job posting URL'), { key: 'Enter' })
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

    it('lists real applications by title and company, not run labels (D17), and confirms the attach', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      importJobTextMock.mockResolvedValue({ job_description: 'A sufficiently detailed pasted listing description.' })
      const { onImported } = renderCard()
      expect(listApplicationsMock).not.toHaveBeenCalled()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      expect(await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })).toBeTruthy()
      expect(screen.queryByRole('option', { name: /Run label/ })).toBeNull()
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Engineer' } })
      fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Example Corp' } })
      fireEvent.change(screen.getByLabelText('Pasted listing text'), { target: { value: 'A sufficiently detailed pasted listing description.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Attach pasted listing' }))
      await waitFor(() => expect(importJobTextMock).toHaveBeenCalledWith({
        campaign_id: 'app-1', job_title: 'Engineer', company_name: 'Example Corp',
        job_description: 'A sufficiently detailed pasted listing description.',
      }, expect.anything()))
      expect(await screen.findByText('Listing attached to Senior Backend Engineer at Northwind Labs.')).toBeTruthy()
      expect(onImported).toHaveBeenCalled()
    })

    it('points to Discover instead of a dead-end picker when there are no applications yet', async () => {
      listApplicationsMock.mockResolvedValue({ items: [], total: 0 })
      importJobUrlMock.mockResolvedValue({ job_description: 'A real posting with plenty of detail about the role.' })
      const { onImported } = renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      expect(await screen.findByText(/You have no applications yet/)).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Find jobs' }).getAttribute('href')).toBe('/discovery')
      expect(screen.queryByLabelText('Application')).toBeNull()
      expect(screen.queryByLabelText('Pasted listing text')).toBeNull()
      // The import itself is not held back by a pick that cannot be made.
      typeUrl()
      fireEvent.click(screen.getByRole('button', { name: 'Import' }))
      await waitFor(() => expect(onImported).toHaveBeenCalled())
    })

    it('offers the pasted listing only once an application is picked', async () => {
      listApplicationsMock.mockResolvedValue({ items: [application], total: 1 })
      renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      expect(screen.queryByLabelText('Pasted listing text')).toBeNull()
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      expect(screen.getByLabelText('Pasted listing text')).toBeTruthy()
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
      renderCard()
      fireEvent.click(screen.getByLabelText(/Attach to one of your applications/i))
      await screen.findByRole('option', { name: 'Senior Backend Engineer at Northwind Labs' })
      fireEvent.change(screen.getByLabelText('Application'), { target: { value: 'app-1' } })
      fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Engineer' } })
      fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Example Corp' } })
      fireEvent.change(screen.getByLabelText('Pasted listing text'), { target: { value: 'A sufficiently detailed pasted listing description.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Attach pasted listing' }))
      expect(await screen.findByText('Application not found')).toBeTruthy()
    })
  })
})
