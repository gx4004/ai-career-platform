import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button, Checkbox, Chip, Cluster, Field, Input, Notice, Select, Skeleton, Stack } from '#/components/kit'
import { getApplicationPreferences, prepareApplicationsForMe, saveApplicationPreferences } from '#/lib/api/client'
import type { ApplicationPreferences, ApplicationPreferencesUpdate, BulkPrepareResult } from '#/lib/api/schemas'
import { APPLICATION_PREFERENCES_QUERY_KEY, invalidateApplications } from '#/lib/query/applicationCaches'
import { ApplicationPanel } from './ApplicationPanel'

/**
 * "Prepare applications for me": the owner says which jobs they want, then one
 * click adopts the best matches from Job Discovery and drafts each one, up to
 * the per-run cap. Nothing runs on its own.
 */
export function PrepareForMePanel() {
  const queryClient = useQueryClient()
  const preferences = useQuery({ queryKey: APPLICATION_PREFERENCES_QUERY_KEY, queryFn: getApplicationPreferences })
  const save = useMutation({
    mutationFn: (payload: ApplicationPreferencesUpdate) => saveApplicationPreferences(payload),
    onSuccess: (saved) => queryClient.setQueryData(APPLICATION_PREFERENCES_QUERY_KEY, saved),
  })
  const prepare = useMutation({
    mutationFn: () => prepareApplicationsForMe(),
    onSuccess: () => { void invalidateApplications(queryClient) },
  })
  const prefs = preferences.data
  const update = (patch: Partial<ApplicationPreferencesUpdate>) => {
    if (!prefs) return
    prepare.reset()
    save.mutate({
      keywords: prefs.keywords,
      locations: prefs.locations,
      remote: prefs.remote,
      max_per_run: prefs.max_per_run,
      ...patch,
    })
  }

  // The standing hint under the button, until a click is refused for the same reason: then the refusal above it says it.
  const hint = Boolean(prefs && prefs.keywords.length === 0 && prepare.data?.reason !== 'no_preferences')

  return (
    <ApplicationPanel
      title="Prepare applications for me"
      description="Tell us what you're looking for. We pick the best matching jobs from Job Discovery and draft each application. You still check and send every one yourself."
    >
      <Stack gap={4}>
        {preferences.isPending ? <Skeleton lines={2} label="Loading your preferences…" /> : null}
        {preferences.isError ? <Notice tone="danger">Your preferences couldn't be loaded.</Notice> : null}
        {prefs ? <PreferencesForm prefs={prefs} saving={save.isPending} onChange={update} /> : null}
        {save.isError ? <Notice tone="danger">Your preferences couldn't be saved. Try again.</Notice> : null}
        {prepare.isError ? (
          <Notice tone="danger">
            {prepare.error instanceof Error ? prepare.error.message : 'Nothing could be prepared. Try again.'}
          </Notice>
        ) : null}
        {prepare.data ? <PrepareResult result={prepare.data} /> : null}
        <Stack gap={2}>
          <Button
            variant="secondary"
            onClick={() => prepare.mutate()}
            loading={prepare.isPending}
            disabled={!prefs || prepare.isPending || save.isPending}
            aria-describedby={hint ? 'camp-prepare-hint' : undefined}
          >
            {prepare.isPending ? 'Preparing…' : 'Prepare applications'}
          </Button>
          {hint ? (
            <p id="camp-prepare-hint" className="camp-note">Add at least one keyword so we know which jobs to prepare.</p>
          ) : null}
        </Stack>
      </Stack>
    </ApplicationPanel>
  )
}

function PrepareResult({ result }: { result: BulkPrepareResult }) {
  if (result.reason === 'no_preferences') {
    return <Notice>Add at least one keyword above so we know which jobs to prepare.</Notice>
  }
  if (result.reason === 'no_cv') {
    return (
      <Notice
        tone="warning"
        action={<Button asChild size="sm" variant="secondary"><Link to="/cv-studio">Create one in CV Studio</Link></Button>}
      >
        You need a CV first.
      </Notice>
    )
  }
  if (result.reason === 'no_evidence') {
    // Matching ranks jobs by what the owner has confirmed; with nothing confirmed nothing can match.
    return (
      <Notice
        tone="warning"
        action={<Button asChild size="sm" variant="secondary"><Link to="/profile">Open your profile</Link></Button>}
      >
        Confirm some evidence in your profile first. Jobs are matched on the skills and experience you saved there.
      </Notice>
    )
  }
  const count = result.prepared.length
  if (count === 0) {
    return (
      <Notice>
        {result.matched_count === 0
          ? 'No new jobs match your keywords right now. Try broader keywords or check back later.'
          : 'Every matching job already has an application.'}
      </Notice>
    )
  }
  return (
    <Notice tone="success">
      Prepared {count} application{count === 1 ? '' : 's'}. {count === 1 ? 'It is' : 'They are'} in Saved on your board.
    </Notice>
  )
}

function PreferencesForm({
  prefs,
  saving,
  onChange,
}: {
  prefs: ApplicationPreferences
  saving: boolean
  onChange: (patch: Partial<ApplicationPreferencesUpdate>) => void
}) {
  // 1 to the server's limit: a short list, so a Select (a typed number could be out of range or empty).
  const caps = Array.from({ length: Math.max(prefs.max_per_run_limit, prefs.max_per_run, 1) }, (_, index) => index + 1)
  return (
    <div className="camp-prefs">
      <TermsField label="Keywords" noun="keyword" placeholder="e.g. backend engineer" value={prefs.keywords} saving={saving} onChange={(keywords) => onChange({ keywords })} />
      <TermsField label="Locations" noun="location" placeholder="e.g. Berlin" value={prefs.locations} saving={saving} onChange={(locations) => onChange({ locations })} />
      {/* The two settings share one row under both lists, their 44px controls on one baseline. */}
      <Cluster gap={4} align="end" className="camp-prefs__options">
        <Checkbox framed label="Include remote jobs" checked={prefs.remote} disabled={saving} onCheckedChange={(remote) => onChange({ remote })} />
        <Field label="Most per click">
          <Select
            className="camp-cap"
            value={String(prefs.max_per_run)}
            disabled={saving}
            onChange={(event) => onChange({ max_per_run: Number(event.target.value) })}
          >
            {caps.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </Field>
      </Cluster>
    </div>
  )
}

function TermsField({
  label,
  noun,
  placeholder,
  value,
  saving,
  onChange,
}: {
  label: string
  noun: string
  placeholder: string
  value: string[]
  saving: boolean
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  // A repeat is not added twice; say so instead of leaving the text sitting in the field as if Add were broken.
  const [repeated, setRepeated] = useState<string | null>(null)
  return (
    <div className="camp-terms">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const next = draft.trim()
          if (!next) return
          const existing = value.find((item) => item.toLowerCase() === next.toLowerCase())
          setDraft('')
          if (existing) {
            setRepeated(existing)
            return
          }
          setRepeated(null)
          onChange([...value, next])
        }}
      >
        <Field label={label}>
          <Cluster nowrap className="camp-terms__add">
            <Input
              value={draft}
              placeholder={placeholder}
              aria-label={`Add ${label.toLowerCase()}`}
              maxLength={100}
              onChange={(event) => {
                setDraft(event.target.value)
                setRepeated(null)
              }}
            />
            <Button type="submit" variant="secondary" disabled={saving} aria-label={`Add ${noun}`}>
              Add
            </Button>
          </Cluster>
        </Field>
      </form>
      {/* Always in the DOM so the message is announced; out of the layout while it is empty. */}
      <p className={repeated ? 'camp-note' : 'kit-sr-only'} role="status">
        {repeated ? `“${repeated}” is already in the list.` : null}
      </p>
      {value.length ? (
        <ul className="camp-terms__list" aria-label={label}>
          {value.map((term) => (
            <li key={term}>
              <Chip removeLabel={`Remove ${term}`} disabled={saving} onRemove={() => onChange(value.filter((item) => item !== term))}>
                {term}
              </Chip>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
