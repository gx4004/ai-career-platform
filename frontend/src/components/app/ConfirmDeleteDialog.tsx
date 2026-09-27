import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

/**
 * The one "are you sure?" dialog for a permanent delete. While the delete is
 * running the dialog cannot be dismissed, so the outcome is never ambiguous.
 */
export function ConfirmDeleteDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onCancel()}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="settings-btn--destructive"
            loading={pending}
            onClick={onConfirm}
          >
            <Trash2 size={14} className="mr-1.5" />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
