import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { getApplicationDetails, saveApplicationDetails } from '#/lib/api/client'
import type { ApplicationDetails, ApplicationDetailsUpdate } from '#/lib/api/schemas'
import { APPLICATION_DETAILS_QUERY_KEY } from '#/lib/query/applicationCaches'

type Field = { name: keyof ApplicationDetailsUpdate; label: string; type?: string; placeholder?: string }

const CONTACT_FIELDS: Field[] = [
  { name: 'full_name', label: 'Full name' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
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

/**
 * Application details: typed once, used for every application form (#374).
 * Autopilot fills contact fields from here and answers the sensitive questions
 * (authorization, sponsorship, salary…) only with what the owner typed here.
 */
export function ApplicationDetailsCard() {
  const details = useQuery({ queryKey: APPLICATION_DETAILS_QUERY_KEY, queryFn: getApplicationDetails })

  return (
    <div className="account-card">
      <div className="account-card-header">
        <div className="account-card-icon">
          <ClipboardList size={18} />
        </div>
        <div>
          <h2 className="account-card-title">Application details</h2>
          <p className="account-card-description">
            Fill these in once. Autopilot types them into application forms, and answers questions like work
            authorization or salary only with what you write here. Leave anything blank to answer it yourself.
          </p>
        </div>
      </div>
      {details.isPending ? <p className="small-copy muted-copy">Loading your details…</p> : null}
      {details.isError ? <p className="small-copy" role="alert">Your details couldn't be loaded.</p> : null}
      {details.data ? <DetailsForm initial={toUpdate(details.data)} /> : null}
    </div>
  )
}

function DetailsForm({ initial }: { initial: ApplicationDetailsUpdate }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<ApplicationDetailsUpdate>(initial)
  const save = useMutation({
    mutationFn: (payload: ApplicationDetailsUpdate) => saveApplicationDetails(payload),
    onSuccess: (saved) => queryClient.setQueryData(APPLICATION_DETAILS_QUERY_KEY, saved),
  })

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate(values)
  }

  const renderField = (field: Field) => {
    const id = `application-details-${field.name}`
    return (
      <div key={field.name} className="grid gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Input
          id={id}
          type={field.type ?? 'text'}
          placeholder={field.placeholder}
          value={values[field.name] ?? ''}
          onChange={(event) => {
            save.reset()
            setValues((current) => ({ ...current, [field.name]: event.target.value }))
          }}
        />
      </div>
    )
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit} aria-label="Application details">
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="small-copy muted-copy mb-2">Contact</legend>
        {CONTACT_FIELDS.map(renderField)}
      </fieldset>
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="small-copy muted-copy mb-2">Your standing answers</legend>
        {STANDING_FIELDS.map(renderField)}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" className="settings-btn" loading={save.isPending}>
          Save details
        </Button>
        {save.isSuccess ? <span className="small-copy muted-copy" role="status">Saved.</span> : null}
        {save.isError ? (
          <span className="small-copy" role="alert">Your details couldn't be saved. Check them and try again.</span>
        ) : null}
      </div>
    </form>
  )
}
