import { useEffect, useId, useState } from 'react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import type { DevelopmentItem } from '#/lib/api/developmentSchemas'
import { RESPONSE_KIND_LABELS, toDateInputValue } from '#/lib/development/plan'

export type DevelopmentEditSubmit = {
  target_date: string | null
  notes: string | null
}

export function EditDevelopmentItemDialog({
  item,
  open,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  item: DevelopmentItem | null
  open: boolean
  submitting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (payload: DevelopmentEditSubmit) => void
}) {
  const dateId = useId()
  const notesId = useId()
  const errorId = useId()
  const [targetDate, setTargetDate] = useState('')
  const [notes, setNotes] = useState('')

  // Reseed the editor whenever a different item opens.
  useEffect(() => {
    if (open && item) {
      setTargetDate(toDateInputValue(item.target_date))
      setNotes(item.notes ?? '')
    }
  }, [open, item])

  function handleSubmit() {
    // Empty inputs clear the field (null); a value sets it. Both fields are
    // always sent because the user is explicitly editing them here.
    const trimmedNotes = notes.trim()
    onSubmit({
      target_date: targetDate ? targetDate : null,
      notes: trimmedNotes ? trimmedNotes : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Edit development item</DialogTitle>
          <DialogDescription>
            {item ? (
              <>
                Set an optional target date and notes for this{' '}
                <strong>{RESPONSE_KIND_LABELS[item.response_kind].toLowerCase()}</strong>{' '}
                item. Leave a field empty to clear it.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor={dateId}>Target date (optional)</Label>
          <Input
            id={dateId}
            type="date"
            value={targetDate}
            disabled={submitting}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={notesId}>Notes (optional)</Label>
          <Textarea
            id={notesId}
            value={notes}
            rows={4}
            maxLength={2000}
            disabled={submitting}
            placeholder="What you plan to do to close this gap."
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        {error ? (
          <p id={errorId} role="alert" className="small-copy" style={{ color: 'var(--destructive)' }}>
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting} disabled={submitting}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
