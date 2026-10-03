import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, Check, Copy, ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  createApplicationTask,
  deleteApplicationTask,
  updateApplication,
  updateApplicationTask,
} from '#/lib/api/client'
import type { ApplicationDetail, ApplicationEvent, ApplicationStatus, ApplicationUpdate } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { EmptyLine, Panel } from './Panel'
import { STATUS_LABELS, formatDate, timeAgo } from './stages'

type Section = { application: ApplicationDetail }

function useApplicationUpdate(applicationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ApplicationUpdate) => updateApplication(applicationId, payload),
    onSuccess: (detail) => {
      queryClient.setQueryData(applicationQueryKey(applicationId), detail)
      void invalidateApplications(queryClient)
    },
  })
}

// ── What you're sending ──

export function DocumentsPanel({ application }: Section) {
  const materials = useApplicationUpdate(application.id)
  const { selected_materials: selected, available_materials: available, drafts } = application
  const draftCover = drafts?.cover_letter
  return (
    <Panel title="What you're sending" description="Pick the version of each document that goes with this application." className="camp-sec-documents">
      <div className="camp-materials">
        <MaterialRow
          label="CV version" field="cv_variant_id" value={selected.cv_variant?.id ?? ''} pending={materials.isPending}
          items={available.cv_variants.map((item) => ({ id: item.id, label: `${item.name} (${item.document_name})` }))}
          open={selected.cv_variant ? { to: '/cv-studio' } : null}
          create={{ to: '/cv-studio', label: 'Make one in CV Studio' }}
          onChange={(value) => materials.mutate({ cv_variant_id: value || null })}
        />
        <MaterialRow
          label="Cover letter" field="cover_letter_run_id" value={selected.cover_letter?.id ?? ''} pending={materials.isPending}
          items={available.cover_letters.map((item) => ({ id: item.id, label: runLabel(item, 'Cover letter') }))}
          open={selected.cover_letter ? { to: '/cover-letter/result/$historyId', historyId: selected.cover_letter.id } : null}
          create={draftCover ? null : { to: '/cover-letter', label: 'Write a cover letter' }}
          emptyLabel={draftCover ? 'Use the prepared draft' : 'Not chosen yet'}
          onChange={(value) => materials.mutate({ cover_letter_run_id: value || null })}
        />
        {draftCover && !selected.cover_letter ? (
          <CopyBlock label="Prepared cover letter" text={draftCover.body} />
        ) : null}
        {drafts?.screening_answers.length ? (
          <div className="camp-material">
            <span className="camp-field__label">Screening answers</span>
            {drafts.screening_answers.map((item) => (
              <CopyBlock key={item.question} label={item.question} text={item.answer} />
            ))}
          </div>
        ) : null}
        <MaterialRow
          label="Interview prep" field="interview_run_id" value={selected.interview?.id ?? ''} pending={materials.isPending}
          items={available.interviews.map((item) => ({ id: item.id, label: runLabel(item, 'Interview prep') }))}
          open={selected.interview ? { to: '/interview/result/$historyId', historyId: selected.interview.id } : null}
          create={{ to: '/interview', label: 'Prepare for interviews' }}
          onChange={(value) => materials.mutate({ interview_run_id: value || null })}
        />
      </div>
      <p className="camp-muted" role="status" aria-live="polite">{materials.isPending ? 'Saving…' : materials.isSuccess ? 'Saved.' : ''}</p>
      {materials.isError ? <p className="camp-alert" role="alert">Your choice couldn't be saved. Try again.</p> : null}
    </Panel>
  )
}

type OpenTarget = { to: '/cv-studio' } | { to: '/cover-letter/result/$historyId' | '/interview/result/$historyId'; historyId: string }

function MaterialRow({ label, field, value, items, pending, open, create, emptyLabel = 'Not chosen yet', onChange }: {
  label: string
  field: string
  value: string
  items: Array<{ id: string; label: string }>
  pending: boolean
  open: OpenTarget | null
  create: { to: '/cv-studio' | '/cover-letter' | '/interview'; label: string } | null
  emptyLabel?: string
  onChange: (value: string) => void
}) {
  const id = `application-${field}`
  if (!items.length && !create) return null
  return (
    <div className="camp-material">
      <label htmlFor={id} className="camp-field__label">{label}</label>
      {items.length ? (
        <div className="camp-material__row">
          <select id={id} className="workspace-select" value={value} disabled={pending} onChange={(event) => onChange(event.target.value)}>
            <option value="">{emptyLabel}</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {open ? (
            'historyId' in open
              ? <Link to={open.to} params={{ historyId: open.historyId }} className="camp-link-button">Open</Link>
              : <Link to={open.to} className="camp-link-button">Open</Link>
          ) : null}
        </div>
      ) : create ? (
        <p className="camp-material__empty">
          None yet. <Link to={create.to} className="camp-link-button">{create.label}</Link>
        </p>
      ) : null}
    </div>
  )
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="camp-copy">
      <div className="camp-copy__head">
        <span>{label}</span>
        <button
          type="button"
          className="camp-copy__button"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            } catch {
              // Clipboard access can be denied; the text stays visible to copy by hand.
            }
          }}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p>{text}</p>
    </div>
  )
}

function runLabel(run: { label: string | null; parent_run_id: string | null; created_at: string }, fallback: string) {
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.created_at))
  return `${run.label || fallback}${run.parent_run_id ? ' (edited)' : ''} · ${when}`
}

// ── The job ──

export function JobPanel({ application }: Section) {
  const [expanded, setExpanded] = useState(false)
  const listing = application.listing
  const long = (listing?.description.length ?? 0) > 700
  return (
    <Panel
      title="Job description"
      className="camp-sec-job"
      description={listing ? `${listing.title} at ${listing.company} · saved ${formatDate(listing.retrieved_at)}` : undefined}
      actions={listing?.source_url ? (
        <a href={listing.source_url} target="_blank" rel="noopener noreferrer" className="camp-link-button">
          Job posting <ExternalLink size={13} aria-hidden="true" />
        </a>
      ) : null}
    >
      {listing ? (
        <>
          <p className={long && !expanded ? 'camp-description is-clamped' : 'camp-description'}>{listing.description}</p>
          {long ? <button type="button" className="camp-link-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show full description'}</button> : null}
        </>
      ) : (
        <EmptyLine>No job posting yet. Save the job from Job Discovery or import it in Job Match to keep the description here.</EmptyLine>
      )}
    </Panel>
  )
}

// ── Tasks ──

export function TasksPanel({ application }: Section) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const write = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: () => { void invalidateApplications(queryClient) },
  })
  const open = application.tasks.filter((task) => !task.completed)
  const done = application.tasks.filter((task) => task.completed)
  return (
    <Panel title="Tasks" className="camp-sec-tasks">
      <form
        className="camp-task-form"
        onSubmit={(event) => {
          event.preventDefault()
          // Midday keeps a date-only choice on the same calendar day in any timezone.
          write.mutate(() => createApplicationTask(application.id, {
            title,
            deadline: deadline ? new Date(`${deadline}T12:00:00`).toISOString() : null,
          }).then(() => { setTitle(''); setDeadline('') }))
        }}
      >
        <input className="workspace-input camp-task-form__title" required maxLength={240} value={title} aria-label="New task" placeholder="Add a task" onChange={(event) => setTitle(event.target.value)} />
        <input className="workspace-input camp-task-form__date" type="date" value={deadline} aria-label="Due date (optional)" onChange={(event) => setDeadline(event.target.value)} />
        <Button type="submit" size="sm" variant="outline" disabled={write.isPending} aria-label="Add task">Add</Button>
      </form>
      {application.tasks.length ? (
        <ul className="camp-list">
          {[...open, ...done].map((task) => (
            <li key={task.id} className={task.completed ? 'camp-task is-done' : 'camp-task'}>
              <label>
                <input type="checkbox" checked={task.completed} onChange={() => write.mutate(() => updateApplicationTask(application.id, task.id, !task.completed))} />
                <span>{task.title}</span>
              </label>
              {task.deadline ? <span className="camp-task__due"><CalendarClock size={13} aria-hidden="true" />{formatDate(task.deadline)}</span> : null}
              <button type="button" className="camp-icon-button" aria-label={`Delete task ${task.title}`} onClick={() => write.mutate(() => deleteApplicationTask(application.id, task.id))}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="camp-muted">No tasks yet.</p>
      )}
      {write.isError ? <p role="alert" className="camp-alert">That change couldn't be saved. Try again.</p> : null}
    </Panel>
  )
}

// ── Notes ──

export function NotesPanel({ application }: Section) {
  const save = useApplicationUpdate(application.id)
  const [text, setText] = useState(application.notes ?? '')
  const changed = text.trim() !== (application.notes ?? '').trim()
  return (
    <Panel title="Notes" description="Only you can see these: interview impressions, salary details, who you spoke to." className="camp-sec-notes">
      <form className="camp-form" onSubmit={(event) => { event.preventDefault(); save.mutate({ notes: text.trim() || null }) }}>
        <label className="camp-field">
          <span className="camp-field__label">Your notes</span>
          <textarea className="workspace-textarea" rows={5} maxLength={20_000} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        {changed || save.isPending ? (
          <Button type="submit" size="sm" variant="outline" disabled={save.isPending} className="camp-form__submit">
            {save.isPending ? 'Saving…' : 'Save notes'}
          </Button>
        ) : null}
      </form>
      {save.isSuccess && !changed ? <p className="camp-muted" role="status">Saved.</p> : null}
      {save.isError ? <p role="alert" className="camp-alert">Your notes couldn't be saved. Try again.</p> : null}
    </Panel>
  )
}

// ── Activity ──

const EVENT_LABELS: Record<string, string> = {
  deadline_changed: 'Deadline updated',
  listing_attached: 'Job posting added',
  listing_adopted: 'Saved from Job Discovery',
  material_selection_changed: 'Documents updated',
  prepared: 'Application prepared',
  answers_saved: 'Answers saved',
  applied: 'Marked as applied',
  applied_undone: 'Moved back from Applied',
  autofill: 'Form filled by Autopilot',
  task_created: 'Task added',
  task_completed: 'Task done',
  task_reopened: 'Task reopened',
  task_deleted: 'Task removed',
}

function eventLabel(event: ApplicationEvent) {
  if (event.event_type === 'status_changed') {
    const to = event.details.to as ApplicationStatus | undefined
    if (to === 'no_reply') return 'Marked no reply'
    return to && STATUS_LABELS[to] ? `Moved to ${STATUS_LABELS[to]}` : 'Stage changed'
  }
  if (event.event_type === 'autofill') {
    if (event.details.outcome === 'failed') return 'Autopilot could not fill the form'
    const filled = Number(event.details.filled_count ?? 0)
    const left = Number(event.details.needs_you_count ?? 0)
    return `Autopilot filled ${filled} field${filled === 1 ? '' : 's'}, ${left} left for you`
  }
  return EVENT_LABELS[event.event_type] ?? 'Updated'
}

export function ActivityPanel({ application }: Section) {
  const events = [...application.events].reverse()
  return (
    <Panel title="Activity" className="camp-sec-activity">
      {events.length ? (
        <ol className="camp-timeline">
          {events.map((event) => (
            <li key={event.id} className={event.event_type === 'applied' ? 'is-key' : undefined}>
              <span className="camp-timeline__dot" aria-hidden="true" />
              <strong>{eventLabel(event)}</strong>
              <span className="camp-muted">{formatDate(event.created_at)} · {event.provenance === 'system' ? 'Automatic' : 'You'}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="camp-muted">Changes you make to this application will show up here.</p>
      )}
    </Panel>
  )
}

// ── Facts ──

const OUTCOMES: Partial<Record<ApplicationStatus, string>> = {
  applied: 'Waiting to hear back',
  no_reply: 'No reply',
  interviewing: 'Got a reply, interviewing',
  offer: 'Offer',
  rejected: 'Not selected',
  withdrawn: 'You withdrew',
}

export function FactsPanel({ application }: Section) {
  const { listing } = application
  const rows: Array<[string, ReactNode]> = [
    ...(application.match_score !== null ? [['Skills fit', `${application.match_score}% when saved`] as [string, ReactNode]] : []),
    ...(OUTCOMES[application.status] ? [['Outcome', OUTCOMES[application.status]] as [string, ReactNode]] : []),
    ...(application.deadline && !application.applied_at ? [['Apply by', formatDate(application.deadline)] as [string, ReactNode]] : []),
    ...(listing ? [['Saved', formatDate(listing.retrieved_at)] as [string, ReactNode]] : []),
    ['Last activity', timeAgo(application.last_activity_at ?? application.updated_at)],
  ]
  return (
    <Panel title="Details" className="camp-sec-details">
      <dl className="camp-facts">
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </Panel>
  )
}
