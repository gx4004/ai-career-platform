import { useEffect, useState } from 'react'
import {
  Button, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm, DialogHeader,
  DialogTitle, Field, Input, Select, Stack, Textarea,
} from '#/components/kit'
import type { EvidenceKind } from '#/lib/api/schemas'
import { MAIN_FIELDS, MAX_FACT_VALUE_CHARS, factLengthHint } from '#/lib/profile/evidence'

/** A short fact (a skill, a role) is a line; anything longer belongs in an achievement or a preference. */
const MAX_SHORT_CHARS = 500

/**
 * The kinds a person adds by hand, each with the one field its content is keyed by (the same keys an import
 * and the edit dialog use, so a typed fact reads like an imported one). Interview evidence only ever comes
 * from the Interview tool, so it is not offered here.
 */
const ADD_FACT_KINDS: ReadonlyArray<{
  kind: EvidenceKind
  label: string
  field: string
  fieldLabel: string
  placeholder: string
  long?: boolean
}> = [
  { kind: 'skill', label: 'Skill', ...MAIN_FIELDS.skill, placeholder: 'e.g. PostgreSQL' },
  { kind: 'experience', label: 'Experience', ...MAIN_FIELDS.experience, placeholder: 'e.g. Backend engineer at Northwind Labs' },
  { kind: 'achievement', label: 'Achievement', ...MAIN_FIELDS.achievement, placeholder: 'e.g. Cut p95 latency by 38% across 14 services', long: true },
  { kind: 'education', label: 'Education', ...MAIN_FIELDS.education, placeholder: 'e.g. BSc Computer Science, TU Berlin' },
  { kind: 'project', label: 'Project', ...MAIN_FIELDS.project, placeholder: 'e.g. Payments ledger rewrite' },
  { kind: 'certification', label: 'Certification', ...MAIN_FIELDS.certification, placeholder: 'e.g. AWS Solutions Architect Associate' },
  { kind: 'preference', label: 'Preference', ...MAIN_FIELDS.preference, placeholder: 'e.g. Remote-first teams, platform work', long: true },
]

/** A typed fact is the owner's own word, so it is saved at once (the API stores `user-entered` as confirmed). */
export function AddFactDialog({
  open,
  submitting,
  error,
  onOpenChange,
  onCloseAutoFocus,
  onSubmit,
}: {
  open: boolean
  submitting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  /** Where focus goes on close when nothing opened the dialog (a deep link); default: back to its trigger. */
  onCloseAutoFocus?: (event: Event) => void
  onSubmit: (kind: EvidenceKind, content: Record<string, string>) => void
}) {
  const [kind, setKind] = useState<EvidenceKind>('skill')
  const [text, setText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const option = ADD_FACT_KINDS.find((candidate) => candidate.kind === kind) ?? ADD_FACT_KINDS[0]
  // No maxLength on the control: a pasted text that is too long is kept and the count says by how much,
  // instead of being cut without a word.
  const limit = option.long ? MAX_FACT_VALUE_CHARS : MAX_SHORT_CHARS

  useEffect(() => {
    if (open) {
      setKind('skill')
      setText('')
      setFormError(null)
    }
  }, [open])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) {
      setFormError('Write the fact first.')
      return
    }
    if (value.length > limit) {
      setFormError(`Shorten this to ${limit.toLocaleString('en-US')} characters.`)
      return
    }
    setFormError(null)
    onSubmit(option.kind, { [option.field]: value })
  }

  const shownError = formError ?? error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissible={!submitting} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add a fact</DialogTitle>
            <DialogDescription>
              Something true about you that CV Studio and the tools can use. You typed it, so it is saved straight away.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Stack gap={4}>
              <Field label="Kind">
                <Select value={kind} disabled={submitting} onChange={(event) => setKind(event.target.value as EvidenceKind)}>
                  {ADD_FACT_KINDS.map((candidate) => (
                    <option key={candidate.kind} value={candidate.kind}>{candidate.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label={option.fieldLabel} error={shownError} help={option.long || text.trim().length > limit * 0.8 ? factLengthHint(text.trim().length, limit) : undefined}>
                {option.long ? (
                  <Textarea
                    autosize maxRows={8} rows={3} value={text} disabled={submitting}
                    placeholder={option.placeholder}
                    onChange={(event) => setText(event.target.value)}
                  />
                ) : (
                  <Input
                    value={text} disabled={submitting} placeholder={option.placeholder}
                    onChange={(event) => setText(event.target.value)}
                  />
                )}
              </Field>
            </Stack>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary" disabled={submitting}>Cancel</Button></DialogClose>
            <Button type="submit" loading={submitting}>Save fact</Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}
