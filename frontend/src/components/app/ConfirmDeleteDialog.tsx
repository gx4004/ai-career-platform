import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmDialog } from '#/components/kit'

/**
 * The one "are you sure?" for a permanent delete. While the delete is running the dialog cannot be
 * dismissed, so the outcome is never ambiguous. The caller owns `open`: it closes when the action succeeds.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
  onCloseAutoFocus,
  children,
}: {
  open: boolean
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
  /** Where focus goes on close, when the control that opened the dialog is gone (a deleted row). */
  onCloseAutoFocus?: (event: Event) => void
  /** Extra content under the description, e.g. the error when the delete failed. */
  children?: ReactNode
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      icon={<Trash2 aria-hidden />}
      pending={pending}
      onConfirm={onConfirm}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {children}
    </ConfirmDialog>
  )
}
