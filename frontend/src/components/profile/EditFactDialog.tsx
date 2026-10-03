import { useEffect, useRef, useState } from 'react'
import {
  Button, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm, DialogHeader,
  DialogTitle, Field, Input, Notice, Stack, Textarea,
} from '#/components/kit'
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
  const [values, setValues] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  // The dialog keeps its content while it fades out after `item` is cleared.
  const shown = useRef<EvidenceItem | null>(null)
  if (item) shown.current = item
  const current = item ?? shown.current

  // Reseed the fields whenever a different item opens.
  useEffect(() => {
    if (!item) return
    setValues(Object.fromEntries(contentEntries(item.content).map(({ key, value }) => [key, value])))
    setFormError(null)
  }, [item])

  const entries = current ? contentEntries(current.content) : []
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
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dismissible={!submitting}>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              Edit {current ? KIND_LABELS[current.kind].toLowerCase() : 'fact'}
            </DialogTitle>
            <DialogDescription>
              Saving keeps it in your profile as a saved fact. Clear a field to remove it.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Stack gap={4}>
              {entries.map(({ key, value }) => (
                <Field key={key} label={fieldLabel(key)}>
                  {value.length > LONG_VALUE ? (
                    <Textarea
                      autosize maxRows={10} value={values[key] ?? ''} disabled={submitting}
                      onChange={(event) => setValues((state) => ({ ...state, [key]: event.target.value }))}
                    />
                  ) : (
                    <Input
                      value={values[key] ?? ''} disabled={submitting}
                      onChange={(event) => setValues((state) => ({ ...state, [key]: event.target.value }))}
                    />
                  )}
                </Field>
              ))}
              {shownError ? <Notice tone="danger">{shownError}</Notice> : null}
            </Stack>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary" disabled={submitting}>Cancel</Button></DialogClose>
            <Button type="submit" loading={submitting}>Save</Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}
