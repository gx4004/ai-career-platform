import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Field as FormField, Input, Notice, Section, Skeleton, useToast } from '#/components/kit'
import { getApplicationDetails, saveApplicationDetails } from '#/lib/api/client'
import type { ApplicationDetails, ApplicationDetailsUpdate } from '#/lib/api/schemas'
import { APPLICATION_DETAILS_QUERY_KEY } from '#/lib/query/applicationCaches'

type Field = { name: keyof ApplicationDetailsUpdate; label: string; type?: string; placeholder?: string }

const CONTACT_FIELDS: Field[] = [
  { name: 'full_name', label: 'Full name' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel', placeholder: 'e.g. +49 30 1234567' },
  { name: 'location', label: 'City / location', placeholder: 'e.g. Berlin, Germany' },
  { name: 'linkedin', label: 'LinkedIn', type: 'url', placeholder: 'https://www.linkedin.com/in/…' },
  { name: 'website', label: 'Website or portfolio', type: 'url', placeholder: 'https://…' },
]

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
 * Renders its own kit Sections, so a page places it directly among its other sections.
 */
export function ApplicationDetailsCard() {
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
  if (!details.data) return <DetailsSkeleton />
  return <DetailsForm initial={toUpdate(details.data)} />
}

/** The form's own sections, labels and button with a bar where each input goes, so the page does not jump when the data arrives. */
function DetailsSkeleton() {
  return (
    <div className="camp-details" aria-busy="true">
      <p className="kit-sr-only" role="status">
        Loading your details…
      </p>
      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title} description={section.description}>
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

function DetailsForm({ initial }: { initial: ApplicationDetailsUpdate }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [values, setValues] = useState<ApplicationDetailsUpdate>(initial)
  const save = useMutation({
    mutationFn: (payload: ApplicationDetailsUpdate) => saveApplicationDetails(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(APPLICATION_DETAILS_QUERY_KEY, saved)
      toast({ tone: 'success', title: 'Details saved.' })
    },
  })

  const dirty = (Object.keys(values) as (keyof ApplicationDetailsUpdate)[]).some(
    (key) => (values[key] ?? '') !== (initial[key] ?? ''),
  )

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate(values)
  }

  const renderField = (field: Field) => (
    <FormField key={field.name} label={field.label}>
      <Input
        type={field.type ?? 'text'}
        placeholder={field.placeholder}
        value={values[field.name] ?? ''}
        onChange={(event) => {
          save.reset()
          setValues((current) => ({ ...current, [field.name]: event.target.value }))
        }}
      />
    </FormField>
  )

  return (
    <form className="camp-details" onSubmit={onSubmit} aria-label="Application details">
      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title} description={section.description}>
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
