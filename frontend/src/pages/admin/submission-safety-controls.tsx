import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  configureSourceSubmissionSafety,
  getAdminSubmissionSafety,
  recordSubmissionIncidentRehearsal,
  setGlobalSubmissionKillSwitch,
  setSubmissionSourceKillSwitch,
} from '#/lib/api/admin'
import type { DiscoverySource } from '#/lib/api/discoverySchemas'
import {
  submissionSafetyPolicyConfigSchema,
  type SubmissionSafetyPolicy,
  type SubmissionSafetyPolicyConfig,
} from '#/lib/api/submissionSafetySchemas'

const safetyKey = ['admin-submission-safety'] as const

export function SubmissionSafetyControls({ sources }: { sources: DiscoverySource[] }) {
  const queryClient = useQueryClient()
  const [playbook, setPlaybook] = useState('')
  const safety = useQuery({ queryKey: safetyKey, queryFn: getAdminSubmissionSafety })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: safetyKey })
    queryClient.invalidateQueries({ queryKey: ['admin-discovery-sources'] })
  }
  const globalKill = useMutation({ mutationFn: setGlobalSubmissionKillSwitch, onSuccess: refresh })
  const rehearsal = useMutation({ mutationFn: recordSubmissionIncidentRehearsal, onSuccess: refresh })
  const policy = useMutation({
    mutationFn: ({ sourceId, config }: { sourceId: string; config: SubmissionSafetyPolicyConfig }) =>
      configureSourceSubmissionSafety(sourceId, config),
    onSuccess: refresh,
  })
  const sourceKill = useMutation({
    mutationFn: ({ sourceId, tripped }: { sourceId: string; tripped: boolean }) =>
      setSubmissionSourceKillSwitch(sourceId, tripped),
    onSuccess: refresh,
  })
  const failed = globalKill.isError || rehearsal.isError || policy.isError || sourceKill.isError

  return (
    <section aria-labelledby="submission-safety-title" style={{ marginTop: '1.5rem' }}>
      <h2 id="submission-safety-title" className="admin-section-title">Submission safety envelope</h2>
      <p className="admin-table-muted">Submission stays globally killed until operators record a completed incident rehearsal. Durable claims enforce every configured limit.</p>
      {safety.isLoading && <p role="status">Loading submission safety…</p>}
      {safety.isError && <p role="alert" className="admin-error-text">Submission safety could not be loaded.</p>}
      {failed && <p role="alert" className="admin-error-text">The safety change was refused. Check rehearsal and source gates.</p>}
      {safety.data && (
        <>
          <div className="admin-data-table-wrap" style={{ marginTop: '1rem', padding: '1rem' }}>
            <strong>Global submission kill switch {safety.data.control.global_kill_switch ? 'on' : 'off'}</strong>
            <p className="admin-table-muted">
              {safety.data.control.incident_rehearsed_at
                ? `Rehearsed ${new Date(safety.data.control.incident_rehearsed_at).toLocaleDateString()} · ${safety.data.control.incident_playbook_version}`
                : 'No incident rehearsal recorded.'}
            </p>
            <button
              type="button"
              className={safety.data.control.global_kill_switch ? 'admin-button' : 'admin-button admin-button--danger'}
              disabled={globalKill.isPending || (safety.data.control.global_kill_switch && !safety.data.control.incident_rehearsed_at)}
              onClick={() => globalKill.mutate(!safety.data.control.global_kill_switch)}
            >
              {safety.data.control.global_kill_switch ? 'Clear global submission kill switch' : 'Trip global submission kill switch'}
            </button>
            {!safety.data.control.incident_rehearsed_at && (
              <form style={{ marginTop: '1rem' }} onSubmit={(event) => { event.preventDefault(); if (playbook.trim()) rehearsal.mutate(playbook.trim()) }}>
                <label htmlFor="submission-playbook-version">Completed playbook version</label>
                <div className="flex gap-2">
                  <input id="submission-playbook-version" value={playbook} maxLength={100} onChange={(event) => setPlaybook(event.target.value)} />
                  <button className="admin-button" type="submit" disabled={!playbook.trim() || rehearsal.isPending}>Record completed rehearsal</button>
                </div>
              </form>
            )}
          </div>
          {sources.filter((source) => source.submission_governance).map((source) => (
            <SourceSafetyForm
              key={source.id}
              source={source}
              existing={safety.data.policies.find((item) => item.discovery_source_id === source.id)}
              saving={policy.isPending && policy.variables?.sourceId === source.id}
              switching={sourceKill.isPending && sourceKill.variables?.sourceId === source.id}
              onSave={(config) => policy.mutate({ sourceId: source.id, config })}
              onSwitch={(tripped) => sourceKill.mutate({ sourceId: source.id, tripped })}
            />
          ))}
        </>
      )}
    </section>
  )
}

const labels: Array<[keyof SubmissionSafetyPolicyConfig, string]> = [
  ['user_rate_limit_per_minute', 'User / minute'],
  ['user_daily_volume_limit', 'User / 24 hours'],
  ['source_rate_limit_per_minute', 'Source / minute'],
  ['source_daily_volume_limit', 'Source / 24 hours'],
  ['anomaly_user_attempts_per_hour', 'Anomaly attempts / hour'],
]

function SourceSafetyForm({ source, existing, saving, switching, onSave, onSwitch }: {
  source: DiscoverySource
  existing?: SubmissionSafetyPolicy
  saving: boolean
  switching: boolean
  onSave: (config: SubmissionSafetyPolicyConfig) => void
  onSwitch: (tripped: boolean) => void
}) {
  const [values, setValues] = useState<SubmissionSafetyPolicyConfig>(existing ? {
    user_rate_limit_per_minute: existing.user_rate_limit_per_minute,
    user_daily_volume_limit: existing.user_daily_volume_limit,
    source_rate_limit_per_minute: existing.source_rate_limit_per_minute,
    source_daily_volume_limit: existing.source_daily_volume_limit,
    anomaly_user_attempts_per_hour: existing.anomaly_user_attempts_per_hour,
  } : {
    user_rate_limit_per_minute: 0,
    user_daily_volume_limit: 0,
    source_rate_limit_per_minute: 0,
    source_daily_volume_limit: 0,
    anomaly_user_attempts_per_hour: 0,
  })
  const parsed = submissionSafetyPolicyConfigSchema.safeParse(values)
  const governance = source.submission_governance!
  return (
    <form className="admin-data-table-wrap" style={{ marginTop: '1rem', padding: '1rem' }} onSubmit={(event) => { event.preventDefault(); if (parsed.success) onSave(parsed.data) }}>
      <strong>{source.display_name}</strong>
      <div className="flex flex-wrap gap-3" style={{ marginTop: '.75rem' }}>
        {labels.map(([name, label]) => (
          <label key={name}>{label}<input type="number" min={1} value={values[name] || ''} onChange={(event) => setValues((current) => ({ ...current, [name]: Number(event.target.value) }))} /></label>
        ))}
      </div>
      {!parsed.success && <p className="admin-table-muted">Enter every bounded limit; anomaly threshold cannot exceed daily user volume.</p>}
      <div className="flex gap-2" style={{ marginTop: '.75rem' }}>
        <button type="submit" className="admin-button" disabled={!parsed.success || saving}>{existing ? 'Update submission limits' : 'Configure submission limits'}</button>
        <button type="button" className={governance.kill_switch ? 'admin-button' : 'admin-button admin-button--danger'} disabled={switching} onClick={() => onSwitch(!governance.kill_switch)}>
          {governance.kill_switch ? 'Clear source submission kill switch' : 'Trip source submission kill switch'}
        </button>
      </div>
    </form>
  )
}
