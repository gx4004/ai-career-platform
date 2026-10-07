import { useEffect, useRef, useState } from 'react'
import {
  Button, DateField, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm,
  DialogHeader, DialogTitle, Field, Notice, Stack, Textarea,
} from '#/components/kit'
import type { DevelopmentItem } from '#/lib/api/developmentSchemas'
import { GAP_KIND_LABELS, RESPONSE_KIND_LABELS, toDateInputValue } from '#/lib/development/plan'

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
  const [targetDate, setTargetDate] = useState('')
  const [notes, setNotes] = useState('')
  // The description keeps its item while the dialog fades out after `item` is cleared.
  const shown = useRef<DevelopmentItem | null>(null)
  if (item) shown.current = item
  const current = item ?? shown.current

  // Reseed the editor whenever a different item opens.
  useEffect(() => {
    if (open && item) {
      setTargetDate(toDateInputValue(item.target_date))
      setNotes(item.notes ?? '')
    }
  }, [open, item])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    // Empty inputs clear the field (null); a value sets it. Both fields are
    // always sent because the user is explicitly editing them here.
    const trimmedNotes = notes.trim()
    onSubmit({
      target_date: targetDate ? targetDate : null,
      notes: trimmedNotes ? trimmedNotes : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissible={!submitting}>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            {/* Named as the row names it (what to build; older items only know their kind). */}
            <DialogTitle>{current ? `Edit ${current.label?.trim() || GAP_KIND_LABELS[current.gap_kind]}` : 'Edit skill to build'}</DialogTitle>
            <DialogDescription>
              {current ? `${RESPONSE_KIND_LABELS[current.response_kind]}. ` : null}
              Set a target date and notes; leave a field empty to clear it.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Stack gap={4}>
              <Field label="Target date" optional>
                <DateField value={targetDate} disabled={submitting} onValueChange={setTargetDate} />
              </Field>
              <Field label="Notes" optional>
                <Textarea
                  autosize maxRows={10} rows={4} value={notes} maxLength={2000} disabled={submitting}
                  placeholder="What you plan to do to close this gap."
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
              {error ? <Notice tone="danger">{error}</Notice> : null}
            </Stack>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary" disabled={submitting}>Cancel</Button></DialogClose>
            <Button type="submit" loading={submitting}>Save skill</Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}
