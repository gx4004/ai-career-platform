import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, Sparkles, X } from 'lucide-react'
import { Panel } from './Panel'
import { Button } from '#/components/ui/button'
import { getApplicationPreferences, prepareApplicationsForMe, saveApplicationPreferences } from '#/lib/api/client'
import type { ApplicationPreferences, ApplicationPreferencesUpdate, BulkPrepareResult } from '#/lib/api/schemas'
import { APPLICATION_PREFERENCES_QUERY_KEY, invalidateApplications } from '#/lib/query/applicationCaches'

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

  return (
    <Panel
      title="Prepare applications for me"
      description="Tell us what you're looking for. We pick the best matching jobs from Job Discovery and draft each application. You still check and send every one yourself."
      className="camp-prepare"
    >
      {preferences.isPending ? <p className="camp-muted">Loading your preferences…</p> : null}
      {preferences.isError ? <p className="camp-alert" role="alert">Your preferences couldn't be loaded.</p> : null}
      {prefs ? <PreferencesForm prefs={prefs} saving={save.isPending} onChange={update} /> : null}
      {save.isError ? <p className="camp-alert" role="alert">Your preferences couldn't be saved. Try again.</p> : null}
      {prepare.isError ? (
        <p className="camp-alert" role="alert">
          {prepare.error instanceof Error ? prepare.error.message : 'Nothing could be prepared. Try again.'}
        </p>
      ) : null}
      {prepare.data ? <PrepareResult result={prepare.data} /> : null}
      <div className="camp-prepare__footer">
        <Button
          className="camp-prepare__submit"
          onClick={() => prepare.mutate()}
          loading={prepare.isPending}
          disabled={!prefs || prepare.isPending || save.isPending}
          aria-describedby={prefs && prefs.keywords.length === 0 ? 'camp-prepare-hint' : undefined}
        >
          <Sparkles size={15} aria-hidden="true" /> {prepare.isPending ? 'Preparing…' : 'Prepare applications'}
        </Button>
        {prefs && prefs.keywords.length === 0 ? (
          <p id="camp-prepare-hint" className="camp-muted">Add at least one keyword so we know which jobs to prepare.</p>
        ) : null}
      </div>
    </Panel>
  )
}

function PrepareResult({ result }: { result: BulkPrepareResult }) {
  if (result.reason === 'no_preferences') {
    return <p className="camp-result" role="status">Add at least one keyword above so we know which jobs to prepare.</p>
  }
  if (result.reason === 'no_cv') {
    return (
      <p className="camp-result" role="status">
        You need a CV first. <Link to="/cv-studio" className="camp-link-button">Create one in CV Studio</Link>
      </p>
    )
  }
  const count = result.prepared.length
  if (count === 0) {
    return (
      <p className="camp-result" role="status">
        {result.matched_count === 0
          ? 'No new jobs match your keywords right now. Try broader keywords or check back later.'
          : 'Every matching job already has an application.'}
      </p>
    )
  }
  return (
    <p className="camp-result" role="status">
      Prepared {count} application{count === 1 ? '' : 's'}. {count === 1 ? 'It is' : 'They are'} in Saved on your board.
    </p>
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
  const [cap, setCap] = useState<string | null>(null)
  const capValue = cap ?? String(prefs.max_per_run)
  return (
    <div className="camp-prefs">
      <TermsField label="Keywords" placeholder="e.g. backend engineer" value={prefs.keywords} saving={saving} onChange={(keywords) => onChange({ keywords })} />
      <TermsField label="Locations" placeholder="e.g. Berlin" value={prefs.locations} saving={saving} onChange={(locations) => onChange({ locations })} />
      <div className="camp-prefs__row">
        <label className="camp-prefs__check">
          <input type="checkbox" checked={prefs.remote} disabled={saving} onChange={(event) => onChange({ remote: event.target.checked })} />
          Include remote jobs
        </label>
        <label className="camp-field camp-prefs__cap">
          <span className="camp-field__label">Most per click</span>
          <input
            type="number"
            min={1}
            max={prefs.max_per_run_limit}
            className="workspace-input"
            value={capValue}
            onChange={(event) => setCap(event.target.value)}
            onBlur={() => {
              const parsed = Number.parseInt(capValue, 10)
              if (Number.isFinite(parsed) && parsed !== prefs.max_per_run) {
                onChange({ max_per_run: Math.min(Math.max(parsed, 1), prefs.max_per_run_limit) })
              }
              setCap(null)
            }}
          />
        </label>
      </div>
    </div>
  )
}

function TermsField({
  label,
  placeholder,
  value,
  saving,
  onChange,
}: {
  label: string
  placeholder: string
  value: string[]
  saving: boolean
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  return (
    <div className="camp-prefs__field">
      <span className="camp-field__label">{label}</span>
      {value.length ? (
        <ul className="camp-chips" aria-label={label}>
          {value.map((term) => (
            <li key={term} className="camp-chip">
              {term}
              <button type="button" aria-label={`Remove ${term}`} disabled={saving} onClick={() => onChange(value.filter((item) => item !== term))}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="camp-prefs__add"
        onSubmit={(event) => {
          event.preventDefault()
          const next = draft.trim()
          if (!next || value.some((item) => item.toLowerCase() === next.toLowerCase())) return
          onChange([...value, next])
          setDraft('')
        }}
      >
        <input
          className="workspace-input"
          value={draft}
          placeholder={placeholder}
          aria-label={`Add ${label.toLowerCase()}`}
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" disabled={saving || !draft.trim()}>
          <Plus size={13} aria-hidden="true" /> Add
        </Button>
      </form>
    </div>
  )
}
