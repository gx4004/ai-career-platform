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
import type { EvidenceItem } from '#/lib/api/schemas'
import {
  KIND_LABELS,
  applyFieldEdits,
  contentEntries,
  fieldLabel,
} from '#/lib/profile/evidence'

// Long values (a summary, a story) get a textarea; short ones a single line.
const LONG_VALUE = 60

/** Edit a profile fact with one labelled field per piece of its content. */
export function EditFactDialog({
  item,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  item: EvidenceItem | null
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (content: Record<string, unknown>) => void
}) {
  const baseId = useId()
  const [values, setValues] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  // Reseed the fields whenever a different item opens.
  useEffect(() => {
    if (!item) return
    setValues(Object.fromEntries(contentEntries(item.content).map(({ key, value }) => [key, value])))
    setFormError(null)
  }, [item])

  const entries = item ? contentEntries(item.content) : []
  const shownError = formError ?? error

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!item) return
    const result = applyFieldEdits(item.content, values)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setFormError(null)
    onSubmit(result.value)
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !submitting && !open && onClose()}>
      <DialogContent showCloseButton={!submitting}>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              Edit {item ? KIND_LABELS[item.kind].toLowerCase() : 'fact'}
            </DialogTitle>
            <DialogDescription>
              Saving keeps it in your profile as a saved fact. Clear a field to remove it.
            </DialogDescription>
          </DialogHeader>

          {entries.map(({ key, value }) => {
            const id = `${baseId}-${key}`
            const Field = value.length > LONG_VALUE ? Textarea : Input
            return (
              <div className="grid gap-2" key={key}>
                <Label htmlFor={id}>{fieldLabel(key)}</Label>
                <Field
                  id={id}
                  value={values[key] ?? ''}
                  disabled={submitting}
                  onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setValues((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </div>
            )
          })}

          {shownError ? (
            <p role="alert" className="small-copy" style={{ color: 'var(--destructive)' }}>
              {shownError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={submitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
