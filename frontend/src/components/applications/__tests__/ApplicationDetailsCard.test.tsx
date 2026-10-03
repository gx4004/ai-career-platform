import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationDetailsCard } from '#/components/applications/ApplicationDetailsCard'
import { ToastProvider } from '#/components/kit'

const api = vi.hoisted(() => ({
  getApplicationDetails: vi.fn(),
  saveApplicationDetails: vi.fn(),
}))

vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/lib/api/client')>(),
  ...api,
}))

const BLANK = {
  full_name: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '',
  linkedin: '',
  website: '',
  location: '',
  work_authorization: '',
  visa_sponsorship: '',
  notice_period: '',
  salary_expectation: '',
  relocation: '',
}

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ApplicationDetailsCard />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('Application details card', () => {
  beforeEach(() => {
    api.getApplicationDetails.mockReset().mockResolvedValue({ ...BLANK, is_default: true })
    api.saveApplicationDetails.mockReset().mockImplementation(async (payload) => ({
      ...payload,
      is_default: false,
    }))
  })

  it('starts from the account name and email and saves what the owner types', async () => {
    renderCard()

    expect((await screen.findByLabelText<HTMLInputElement>('Full name')).value).toBe('Ada Lovelace')
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('ada@example.com')

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+44 20 7946 0958' } })
    fireEvent.change(screen.getByLabelText('Visa sponsorship needed?'), { target: { value: 'No' } })
    fireEvent.change(screen.getByLabelText('Salary expectation'), { target: { value: '90k EUR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(api.saveApplicationDetails).toHaveBeenCalledTimes(1))
    expect(api.saveApplicationDetails.mock.calls[0][0]).toEqual({
      ...BLANK,
      phone: '+44 20 7946 0958',
      visa_sponsorship: 'No',
      salary_expectation: '90k EUR',
    })
    // The confirmation is a toast, not a line beside the button.
    expect((await screen.findAllByText('Details saved.')).length).toBeGreaterThan(0)
  })

  it('shows the real section headings and labels while loading, so the page does not jump', async () => {
    api.getApplicationDetails.mockReturnValue(new Promise(() => {}))
    renderCard()

    expect(screen.getByRole('heading', { level: 2, name: 'Contact' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Your standing answers' })).toBeTruthy()
    expect(screen.getByText('Salary expectation')).toBeTruthy()
    expect(screen.getByText('Loading your details…')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('offers a retry when the details cannot be loaded', async () => {
    api.getApplicationDetails.mockRejectedValueOnce(new Error('down'))
    renderCard()

    expect((await screen.findByText(/couldn't be loaded/)).closest('[role="alert"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findByLabelText<HTMLInputElement>('Full name')).value).toBe('Ada Lovelace')
  })

  it('says so when saving fails', async () => {
    api.saveApplicationDetails.mockRejectedValue(new Error('nope'))
    renderCard()

    fireEvent.change(await screen.findByLabelText('Phone'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    // The toast region is also a live alert region: look for the notice by its text.
    expect((await screen.findByText(/couldn't be saved/)).closest('[role="alert"]')).toBeTruthy()
  })

  it('keeps Save disabled until something changes', async () => {
    renderCard()
    const save = await screen.findByRole<HTMLButtonElement>('button', { name: 'Save details' })
    expect(save.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '1' } })
    expect(save.disabled).toBe(false)

    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '' } })
    expect(save.disabled).toBe(true)
  })
})
