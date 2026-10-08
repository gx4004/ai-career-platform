import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field as FormField, Input, Notice, Section, Skeleton, useToast } from '#/components/kit'
import { getApplicationDetails, saveApplicationDetails } from '#/lib/api/client'
import type { ApplicationDetails, ApplicationDetailsUpdate } from '#/lib/api/schemas'
import { APPLICATION_DETAILS_QUERY_KEY } from '#/lib/query/applicationCaches'
import { useOwnerMutation } from '#/hooks/useOwnerMutation'

type Field = {
  name: keyof ApplicationDetailsUpdate
  label: string
  type?: string
  placeholder?: string
  /** What a usable value looks like, shown under the field when the typed one is not (the form checks itself, no browser bubble). */
  hint?: string
}

const CONTACT_FIELDS: Field[] = [
  // Not "Full name": the account has its own name, and this is the one forms get (they can differ).
  { name: 'full_name', label: 'Name on applications' },
  { name: 'email', label: 'Email', type: 'email', hint: 'Enter an email like you@example.com' },
  { name: 'phone', label: 'Phone', type: 'tel', placeholder: 'e.g. +49 30 1234567', hint: 'Enter a phone number like +49 30 1234567' },
  { name: 'location', label: 'City / location', placeholder: 'e.g. Berlin, Germany' },
  {
    name: 'linkedin',
    label: 'LinkedIn',
    type: 'url',
    placeholder: 'https://www.linkedin.com/in/…',
    hint: 'Enter a link like https://linkedin.com/in/you',
  },
  { name: 'website', label: 'Website or portfolio', type: 'url', placeholder: 'https://…', hint: 'Enter a link like https://yoursite.com' },
]

type FieldName = keyof ApplicationDetailsUpdate

/** A bare host ("linkedin.com/in/nora", "nora.dev:8080/work"), the way people usually type a link. */
const BARE_HOST = /^(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}(?::\d+)?(?:[/?#]\S*)?$/u
/** An http(s) address with a dotted host: what a form's link field can use. */
const WEB_LINK = /^https?:\/\/[^\s/?#.]+(?:\.[^\s/?#.]+)+(?:[/?#]\S*)?$/iu
// The server's own shapes (backend/app/schemas/applications.py), so a value it would refuse is named here first.
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PHONE_SHAPE = /^\+?[\d\s().\-/]+(?:\s*(?:ext\.?|x)\s*\d{1,6})?$/i

/** Trims every value and adds the https:// a bare link leaves off. */
function normalise(values: ApplicationDetailsUpdate): ApplicationDetailsUpdate {
  const next = { ...values }
  for (const key of Object.keys(next) as FieldName[]) {
    const value = next[key]
    if (typeof value === 'string') next[key] = value.trim()
  }
  for (const key of ['linkedin', 'website'] as const) {
    const value = next[key] ?? ''
    if (BARE_HOST.test(value)) next[key] = `https://${value}`
  }
  return next
}

/** The fields whose value the server would refuse, in form order. */
function problems(values: ApplicationDetailsUpdate): FieldName[] {
  const bad: FieldName[] = []
  const email = values.email ?? ''
  if (email && !EMAIL_SHAPE.test(email)) bad.push('email')
  const phone = values.phone ?? ''
  const digits = phone.replace(/\D/g, '').length
  if (phone && (!PHONE_SHAPE.test(phone) || digits < 5 || digits > 20)) bad.push('phone')
  for (const key of ['linkedin', 'website'] as const) {
    const value = values[key] ?? ''
    if (value && !WEB_LINK.test(value)) bad.push(key)
  }
  return bad
}

const STANDING_FIELDS: Field[] = [
  { name: 'work_authorization', label: 'Work authorization', placeholder: 'e.g. Yes, EU citizen' },
  { name: 'visa_sponsorship', label: 'Visa sponsorship needed?', placeholder: 'e.g. No' },
  { name: 'notice_period', label: 'Notice period', placeholder: 'e.g. One month' },
  { name: 'salary_expectation', label: 'Salary expectation', placeholder: 'e.g. 70,000 EUR' },
  { name: 'relocation', label: 'Open to relocation?', placeholder: 'e.g. Yes, within the EU' },
]

function toUpdate(details: ApplicationDetails): ApplicationDetailsUpdate {
  const { is_default: _isDefault, ...fields } = details
  return fields
}

const SECTIONS = [
  {
    title: 'Contact',
    description: 'Autopilot uses these for application forms and leaves anything blank for you.',
    fields: CONTACT_FIELDS,
  },
  { title: 'Your standing answers', description: undefined, fields: STANDING_FIELDS },
]

/**
 * Application details: typed once, used for every application form (#374).
 * Autopilot fills contact fields from here and answers the sensitive questions
 * (authorization, sponsorship, salary…) only with what the owner typed here.
 * Its sub-sections are small h3 headings under the page's own "Details for applications" section. `accountName`
 * (the signed-in account's name) lets the name field say when forms get a different name, and offer the account's.
 */
export function ApplicationDetailsCard({ accountName = null }: { accountName?: string | null } = {}) {
  const details = useQuery({ queryKey: APPLICATION_DETAILS_QUERY_KEY, queryFn: getApplicationDetails })

  // The page that places this block owns its heading: the failure is the notice alone, not a second title.
  if (details.isError) {
    return (
      <Notice
        tone="danger"
        action={
          <Button size="sm" variant="secondary" onClick={() => void details.refetch()} loading={details.isFetching}>
            Try again
          </Button>
        }
      >
        Your details couldn't be loaded.
      </Notice>
    )
  }
  if (!details.data) return <ApplicationDetailsSkeleton />
  return <DetailsForm initial={toUpdate(details.data)} accountName={accountName?.trim() || null} />
}

/**
 * The form's own sections, labels and button with a bar where each input goes, so the page does not jump when the data
 * arrives. Exported for the Account page's own loading frame (before the session answers).
 */
export function ApplicationDetailsSkeleton() {
  return (
    <div className="camp-details" aria-busy="true">
      <p className="kit-sr-only" role="status">
        Loading your details…
      </p>
      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title} description={section.description} size="sm" headingLevel={3}>
          <div className="camp-details__fields" aria-hidden="true">
            {section.fields.map((field) => (
              <FormField key={field.name} label={field.label}>
                <Skeleton variant="block" height="var(--kit-h-md)" />
              </FormField>
            ))}
          </div>
        </Section>
      ))}
      <Skeleton variant="block" width="6.25rem" height="var(--kit-h-md)" />
    </div>
  )
}

function DetailsForm({ initial, accountName }: { initial: ApplicationDetailsUpdate; accountName: string | null }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [values, setValues] = useState<ApplicationDetailsUpdate>(initial)
  const [invalid, setInvalid] = useState<FieldName[]>([])
  const inputs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({})
  const save = useOwnerMutation({
    mutationFn: (payload: ApplicationDetailsUpdate) => saveApplicationDetails(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(APPLICATION_DETAILS_QUERY_KEY, saved)
      toast({ tone: 'success', title: 'Details saved' })
    },
  })

  const dirty = (Object.keys(values) as (keyof ApplicationDetailsUpdate)[]).some(
    (key) => (values[key] ?? '') !== (initial[key] ?? ''),
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const next = normalise(values)
    setValues(next)
    const bad = problems(next)
    setInvalid(bad)
    if (bad.length > 0) {
      inputs.current[bad[0]]?.focus()
      return
    }
    save.mutate(next)
  }

  const nameDiffers = accountName !== null && (values.full_name ?? '').trim() !== accountName
  const nameHelp = nameDiffers ? (
    <>
      Forms get this name. Your account name is {accountName}.{' '}
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={() => {
          save.reset()
          setValues((current) => ({ ...current, full_name: accountName }))
        }}
      >
        Use account name
      </Button>
    </>
  ) : undefined

  const renderField = (field: Field) => (
    <FormField
      key={field.name}
      label={field.label}
      help={field.name === 'full_name' ? nameHelp : undefined}
      error={invalid.includes(field.name) ? field.hint : undefined}
    >
      <Input
        ref={(node) => {
          inputs.current[field.name] = node
        }}
        type={field.type ?? 'text'}
        placeholder={field.placeholder}
        value={values[field.name] ?? ''}
        onChange={(event) => {
          save.reset()
          // The message goes with the edit; the next Save checks again.
          setInvalid((current) => current.filter((name) => name !== field.name))
          setValues((current) => ({ ...current, [field.name]: event.target.value }))
        }}
      />
    </FormField>
  )

  return (
    // noValidate: the form names a bad value under its field (kit Field error), not in the browser's grey bubble.
    <form className="camp-details" onSubmit={onSubmit} aria-label="Application details" noValidate>
      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title} description={section.description} size="sm" headingLevel={3}>
          <div className="camp-details__fields">{section.fields.map(renderField)}</div>
        </Section>
      ))}
      <div>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>
          Save details
        </Button>
      </div>
      {save.isError ? <Notice tone="danger">Your details couldn't be saved. Check them and try again.</Notice> : null}
    </form>
  )
}
