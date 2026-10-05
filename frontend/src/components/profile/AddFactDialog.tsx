import { useEffect, useState } from 'react'
import {
  Button, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm, DialogHeader,
  DialogTitle, Field, Input, Select, Stack, Textarea,
} from '#/components/kit'
import type { EvidenceKind } from '#/lib/api/schemas'

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
  { kind: 'skill', label: 'Skill', field: 'name', fieldLabel: 'Skill', placeholder: 'e.g. PostgreSQL' },
  { kind: 'experience', label: 'Experience', field: 'title', fieldLabel: 'Role and employer', placeholder: 'e.g. Backend engineer at Northwind Labs' },
  { kind: 'achievement', label: 'Achievement', field: 'text', fieldLabel: 'What you achieved', placeholder: 'e.g. Cut p95 latency by 38% across 14 services', long: true },
  { kind: 'education', label: 'Education', field: 'degree', fieldLabel: 'Degree and school', placeholder: 'e.g. BSc Computer Science, TU Berlin' },
  { kind: 'project', label: 'Project', field: 'name', fieldLabel: 'Project', placeholder: 'e.g. Payments ledger rewrite' },
  { kind: 'certification', label: 'Certification', field: 'name', fieldLabel: 'Certification', placeholder: 'e.g. AWS Solutions Architect Associate' },
  { kind: 'preference', label: 'Preference', field: 'text', fieldLabel: 'What you are looking for', placeholder: 'e.g. Remote-first teams, platform work', long: true },
]

/** A typed fact is the owner's own word, so it is saved at once (the API stores `user-entered` as confirmed). */
export function AddFactDialog({
  open,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  submitting: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (kind: EvidenceKind, content: Record<string, string>) => void
}) {
  const [kind, setKind] = useState<EvidenceKind>('skill')
  const [text, setText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const option = ADD_FACT_KINDS.find((candidate) => candidate.kind === kind) ?? ADD_FACT_KINDS[0]

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
    setFormError(null)
    onSubmit(option.kind, { [option.field]: value })
  }

  const shownError = formError ?? error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissible={!submitting}>
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
              <Field label={option.fieldLabel} error={shownError}>
                {option.long ? (
                  <Textarea
                    autosize maxRows={8} rows={3} value={text} maxLength={2000} disabled={submitting}
                    placeholder={option.placeholder}
                    onChange={(event) => setText(event.target.value)}
                  />
                ) : (
                  <Input
                    value={text} maxLength={500} disabled={submitting} placeholder={option.placeholder}
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
