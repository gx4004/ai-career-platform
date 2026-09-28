import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationDetailsCard } from '#/components/applications/ApplicationDetailsCard'

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
      <ApplicationDetailsCard />
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
    expect((await screen.findByRole('status')).textContent).toBe('Saved.')
  })

  it('says so when saving fails', async () => {
    api.saveApplicationDetails.mockRejectedValue(new Error('nope'))
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Save details' }))

    expect((await screen.findByRole('alert')).textContent).toContain("couldn't be saved")
  })
})
