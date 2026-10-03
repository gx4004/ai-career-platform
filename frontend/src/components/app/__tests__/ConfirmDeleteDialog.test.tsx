import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDeleteDialog } from '#/components/app/ConfirmDeleteDialog'

function renderDialog(props: Partial<Parameters<typeof ConfirmDeleteDialog>[0]> = {}) {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  render(
    <ConfirmDeleteDialog
      open
      title="Delete this saved run?"
      description="It will be removed for good."
      confirmLabel="Delete run"
      pending={false}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  )
  return { onCancel, onConfirm }
}

describe('ConfirmDeleteDialog', () => {
  it('is an alert dialog named by its title, with the choice stated in verbs', () => {
    renderDialog()
    expect(screen.getByRole('alertdialog', { name: 'Delete this saved run?' })).toBeTruthy()
    expect(screen.getByText('It will be removed for good.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete run' })).toBeTruthy()
  })

  it('confirms and cancels through the props the callers already pass', () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Delete run' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cannot be dismissed while the delete is running', () => {
    const { onCancel } = renderDialog({ pending: true })
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
