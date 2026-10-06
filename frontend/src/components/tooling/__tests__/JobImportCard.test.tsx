import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { JobImportCard } from '#/components/tooling/JobImportCard'

const importJobUrlMock = vi.hoisted(() => vi.fn())
const importJobTextMock = vi.hoisted(() => vi.fn())
const listApplicationsMock = vi.hoisted(() => vi.fn())
let sessionStatus: 'guest' | 'authenticated' = 'authenticated'

vi.mock('#/hooks/useSession', () => ({
  useSession: () => ({ status: sessionStatus, openAuthDialog: vi.fn() }),
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
