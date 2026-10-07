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

function renderCard(props: { accountName?: string | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ApplicationDetailsCard {...props} />
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

    expect((await screen.findByLabelText<HTMLInputElement>('Name on applications')).value).toBe('Ada Lovelace')
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
    expect((await screen.findAllByText('Details saved')).length).toBeGreaterThan(0)
  })

  it('shows the real section headings and labels while loading, so the page does not jump', async () => {
    api.getApplicationDetails.mockReturnValue(new Promise(() => {}))
    renderCard()

    // Sub-headings of the page's "Details for applications" section (h2), so h3 (account-admin-F04).
    expect(screen.getByRole('heading', { level: 3, name: 'Contact' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Your standing answers' })).toBeTruthy()
    expect(screen.getByText('Salary expectation')).toBeTruthy()
    expect(screen.getByText('Loading your details…')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('offers a retry when the details cannot be loaded', async () => {
    api.getApplicationDetails.mockRejectedValueOnce(new Error('down'))
    renderCard()

    expect((await screen.findByText(/couldn't be loaded/)).closest('[role="alert"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findByLabelText<HTMLInputElement>('Name on applications')).value).toBe('Ada Lovelace')
  })

  it('says so when saving fails', async () => {
    api.saveApplicationDetails.mockRejectedValue(new Error('nope'))
    renderCard()

    // A phone the server accepts (5+ digits): '123' is now named under the field before any request (AA-F05).
    fireEvent.change(await screen.findByLabelText('Phone'), { target: { value: '+44 20 7946 0958' } })
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

  it('says which name forms get when it differs from the account name, and offers the account name without saving it', async () => {
    api.getApplicationDetails.mockResolvedValue({ ...BLANK, full_name: 'Ada Tester', is_default: false })
    renderCard({ accountName: 'Ada Lovelace-Tester' })

    const field = await screen.findByLabelText<HTMLInputElement>('Name on applications')
    expect(field.value).toBe('Ada Tester')
    expect(screen.getByText(/Your account name is Ada Lovelace-Tester/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use account name' }))
    expect(field.value).toBe('Ada Lovelace-Tester')
    // The owner's saved value only changes when they press Save.
    expect(api.saveApplicationDetails).not.toHaveBeenCalled()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save details' }).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Use account name' })).toBeNull()
  })

  it('offers nothing when the name already matches the account', async () => {
    renderCard({ accountName: 'Ada Lovelace' })
    await screen.findByLabelText('Name on applications')
    expect(screen.queryByRole('button', { name: 'Use account name' })).toBeNull()
    expect(screen.queryByText(/Your account name is/)).toBeNull()
  })

  it('checks the form itself (no browser bubble) and adds the https:// people leave off a link', async () => {
    const { container } = renderCard()
    await screen.findByLabelText('LinkedIn')
    expect(container.querySelector('form')?.noValidate).toBe(true)

    fireEvent.change(screen.getByLabelText('LinkedIn'), { target: { value: 'linkedin.com/in/nora' } })
    fireEvent.change(screen.getByLabelText('Website or portfolio'), { target: { value: ' nora.dev ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    await waitFor(() => expect(api.saveApplicationDetails).toHaveBeenCalledTimes(1))
    expect(api.saveApplicationDetails.mock.calls[0][0]).toMatchObject({
      linkedin: 'https://linkedin.com/in/nora',
      website: 'https://nora.dev',
    })
    // The form shows what was saved.
    expect(screen.getByLabelText<HTMLInputElement>('LinkedIn').value).toBe('https://linkedin.com/in/nora')
  })

  it('names a link, email or phone it cannot use under the field, and saves nothing until it is fixed', async () => {
    renderCard()
    await screen.findByLabelText('LinkedIn')
    fireEvent.change(screen.getByLabelText('LinkedIn'), { target: { value: 'not a url' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'call me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))

    expect(await screen.findByText('Enter a link like https://linkedin.com/in/you')).toBeTruthy()
    expect(screen.getByText('Enter an email like you@example.com')).toBeTruthy()
    expect(screen.getByText('Enter a phone number like +49 30 1234567')).toBeTruthy()
    expect(screen.getByLabelText('LinkedIn').getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    expect(api.saveApplicationDetails).not.toHaveBeenCalled()

    // Editing a field clears its own message.
    fireEvent.change(screen.getByLabelText('LinkedIn'), { target: { value: 'https://linkedin.com/in/ada' } })
    expect(screen.queryByText('Enter a link like https://linkedin.com/in/you')).toBeNull()
    expect(screen.getByText('Enter an email like you@example.com')).toBeTruthy()
  })
})
