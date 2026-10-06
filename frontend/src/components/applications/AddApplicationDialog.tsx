import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Button, DateField, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm,
  DialogHeader, DialogTitle, Field, Input, Notice, Stack, Textarea,
} from '#/components/kit'
import { describeFailure } from '#/lib/api/errors'
import type { ApplicationDetail } from '#/lib/api/schemas'
import { createApplication } from './applicationsApi'

type FieldName = 'role' | 'company' | 'source_url' | 'description' | 'deadline'
type Errors = Partial<Record<FieldName, string>>

const EMPTY = { role: '', company: '', source_url: '', description: '', deadline: '' }
const MIN_DESCRIPTION = 20
const FIELDS = ['role', 'company', 'source_url', 'description', 'deadline'] as const satisfies readonly FieldName[]
const firstError = (errors: Errors) => FIELDS.find((name) => errors[name]) ?? null

// One sentence per field, the same whether the browser or the server caught it.
const MESSAGES: Record<FieldName, string> = {
  role: 'Enter the role, for example “Backend Engineer”.',
  company: 'Enter the company you are applying to.',
  source_url: 'Enter the full link, starting with https://, or leave it empty.',
  description: `Paste the whole job description (at least ${MIN_DESCRIPTION} characters), or leave it empty.`,
  deadline: 'Pick a date, or leave it empty.',
}

function validate(values: typeof EMPTY): Errors {
  const errors: Errors = {}
  if (!values.role.trim()) errors.role = MESSAGES.role
  if (!values.company.trim()) errors.company = MESSAGES.company
  const link = values.source_url.trim()
  if (link && !/^https?:\/\/\S+$/i.test(link)) errors.source_url = MESSAGES.source_url
  const description = values.description.trim()
  if (description && description.length < MIN_DESCRIPTION) errors.description = MESSAGES.description
  return errors
}

/**
 * "Add a job by hand": the role and company name the card; the posting, its link and an apply-by date
 * are optional and can be added later on the application's page. It lands in Saved.
 */
export function AddApplicationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (application: ApplicationDetail) => void
}) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  // The first field to fix gets focus, whether the browser or the server caught it; its message is announced
  // with it. Focus waits for the render that re-enables the fields after a submit.
  const [focusField, setFocusField] = useState<FieldName | null>(null)
  const create = useMutation({
    mutationFn: () =>
      createApplication({
        role: values.role.trim(),
        company: values.company.trim(),
        source_url: values.source_url.trim() || null,
        description: values.description.trim() || null,
        // Midday keeps a date-only choice on the same calendar day in any timezone.
        deadline: values.deadline ? new Date(`${values.deadline}T12:00:00`).toISOString() : null,
      }),
    retry: false,
    onSuccess: onCreated,
    onError: (error) => {
      const failure = describeFailure(error, "The job couldn't be added. Try again.")
      const fieldErrors: Errors = {}
      for (const name of FIELDS) {
        if (failure.fields[name]) fieldErrors[name] = MESSAGES[name]
      }
      setErrors(fieldErrors)
      setFocusField(firstError(fieldErrors))
    },
  })

  // A fresh form each time it opens.
  const { reset } = create
  useEffect(() => {
    if (!open) return
    setValues(EMPTY)
    setErrors({})
    reset()
  }, [open, reset])

  const pending = create.isPending
  useEffect(() => {
    if (!focusField || pending) return
    document.getElementById(`add-application-${focusField}`)?.focus()
    setFocusField(null)
  }, [focusField, pending])

  const set = (name: FieldName) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (create.isPending) return
    const found = validate(values)
    setErrors(found)
    const first = firstError(found)
    if (first) {
      setFocusField(first)
      return
    }
    create.mutate()
  }

  const failure = create.isError && !Object.values(errors).some(Boolean)
    ? describeFailure(create.error, "The job couldn't be added. Try again.").message
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissible={!pending}>
        <DialogForm onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a job by hand</DialogTitle>
            <DialogDescription>
              For a job you found somewhere else. It goes into Saved; you can add the posting and documents later.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Stack gap={4}>
              <Field label="Role" required error={errors.role} id="add-application-role">
                <Input
                  autoFocus value={values.role} maxLength={200} disabled={pending} placeholder="e.g. Backend Engineer"
                  onChange={(event) => set('role')(event.target.value)}
                />
              </Field>
              <Field label="Company" required error={errors.company} id="add-application-company">
                <Input
                  value={values.company} maxLength={200} disabled={pending} placeholder="e.g. Northwind Labs"
                  onChange={(event) => set('company')(event.target.value)}
                />
              </Field>
              <Field label="Link to the posting" optional error={errors.source_url} id="add-application-source_url">
                <Input
                  type="url" inputMode="url" autoComplete="off" value={values.source_url} maxLength={2048} disabled={pending}
                  placeholder="https://"
                  onChange={(event) => set('source_url')(event.target.value)}
                />
              </Field>
              <Field
                label="Job description"
                optional
                error={errors.description}
                help={errors.description ? undefined : 'Paste it now and we can prepare drafts and check your documents against it.'}
                id="add-application-description"
              >
                <Textarea
                  autosize rows={4} maxRows={10} maxLength={20_000} value={values.description} disabled={pending}
                  onChange={(event) => set('description')(event.target.value)}
                />
              </Field>
              <Field label="Apply by" optional error={errors.deadline} id="add-application-deadline">
                <DateField value={values.deadline} disabled={pending} onValueChange={set('deadline')} />
              </Field>
              {failure ? <Notice tone="danger">{failure}</Notice> : null}
            </Stack>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={pending}>Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={pending}>Add to Saved</Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}
