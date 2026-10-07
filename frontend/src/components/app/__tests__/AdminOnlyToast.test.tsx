import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminOnlyToast } from '#/components/app/AdminOnlyToast'
import { ToastProvider } from '#/components/kit'

describe('AdminOnlyToast', () => {
  it('says once that the page was for admins, then clears the flag from the address', async () => {
    const onDone = vi.fn()
    render(
      <ToastProvider>
        <AdminOnlyToast notice="admin-only" onDone={onDone} />
      </ToastProvider>,
    )
    expect((await screen.findAllByText('That page is for admins')).length).toBeGreaterThan(0)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('says nothing without the flag', () => {
    const onDone = vi.fn()
    render(
      <ToastProvider>
        <AdminOnlyToast notice={undefined} onDone={onDone} />
      </ToastProvider>,
    )
    expect(screen.queryByText('That page is for admins')).toBeNull()
    expect(onDone).not.toHaveBeenCalled()
  })
})
