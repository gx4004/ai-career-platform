import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, Check, Copy, ExternalLink, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  CardActions,
  CardHeader,
  CardTitle,
  Checkbox,
  Cluster,
  DateField,
  EmptyState,
  Field,
  Input,
  KeyValue,
  List,
  Notice,
  Row,
  RowActions,
  RowBody,
  RowMeta,
  RowTitle,
  Section,
  Select,
  Stack,
  Textarea,
} from '#/components/kit'
import {
  createApplicationTask,
  deleteApplicationTask,
  updateApplication,
  updateApplicationTask,
} from '#/lib/api/client'
import type { ApplicationDetail, ApplicationEvent, ApplicationStatus, ApplicationUpdate } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { STATUS_LABELS, formatDate, timeAgo } from './stages'

type Props = { application: ApplicationDetail }

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

export function DocumentsPanel({ application }: Props) {
  const materials = useApplicationUpdate(application.id)
  const { selected_materials: selected, available_materials: available, drafts } = application
  const draftCover = drafts?.cover_letter
  return (
    <Section title="What you're sending" description="Pick the version of each document that goes with this application.">
      <Stack gap={4}>
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
          <Section headingLevel={3} title="Screening answers" rule={false}>
            <Stack gap={2}>
              {drafts.screening_answers.map((item) => (
                <CopyBlock key={item.question} label={item.question} text={item.answer} />
              ))}
            </Stack>
          </Section>
        ) : null}
        <MaterialRow
          label="Interview prep" field="interview_run_id" value={selected.interview?.id ?? ''} pending={materials.isPending}
          items={available.interviews.map((item) => ({ id: item.id, label: runLabel(item, 'Interview prep') }))}
          open={selected.interview ? { to: '/interview/result/$historyId', historyId: selected.interview.id } : null}
          create={{ to: '/interview', label: 'Prepare for interviews' }}
          onChange={(value) => materials.mutate({ interview_run_id: value || null })}
        />
        {/* Always mounted so screen readers announce it; only takes room while it has something to say. */}
        <p className={materials.isPending || materials.isSuccess ? 'camp-note' : 'kit-sr-only'} role="status" aria-live="polite">
          {materials.isPending ? 'Saving…' : materials.isSuccess ? 'Saved.' : ''}
        </p>
        {materials.isError ? <Notice tone="danger">Your choice couldn't be saved. Try again.</Notice> : null}
      </Stack>
    </Section>
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
  if (!items.length && !create) return null
  return (
    <Field label={label} id={`application-${field}`}>
      <Cluster gap={3} className="camp-material">
        {items.length ? (
          <Select className="camp-material__select" value={value} disabled={pending} onChange={(event) => onChange(event.target.value)}>
            <option value="">{emptyLabel}</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </Select>
        ) : (
          <Select className="camp-material__select" value="" disabled>
            <option value="">None yet</option>
          </Select>
        )}
        {items.length && open ? (
          <Button asChild variant="secondary" size="sm">
            {'historyId' in open
              ? <Link to={open.to} params={{ historyId: open.historyId }}>Open</Link>
              : <Link to={open.to}>Open</Link>}
          </Button>
        ) : null}
        {!items.length && create ? (
          <Button asChild variant="secondary" size="sm"><Link to={create.to}>{create.label}</Link></Button>
        ) : null}
      </Cluster>
    </Field>
  )
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Card as="div" padding="sm">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardActions reveal={false}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
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
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </CardActions>
      </CardHeader>
      <p className="camp-prose">{text}</p>
    </Card>
  )
}

function runLabel(run: { label: string | null; parent_run_id: string | null; created_at: string }, fallback: string) {
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.created_at))
  return `${run.label || fallback}${run.parent_run_id ? ' (edited)' : ''} · ${when}`
}

// ── The job ──

export function JobPanel({ application }: Props) {
  const [expanded, setExpanded] = useState(false)
  const listing = application.listing
  const long = (listing?.description.length ?? 0) > 700
  return (
    <Section
      title="Job description"
      description={listing ? `${listing.title} at ${listing.company} · saved ${formatDate(listing.retrieved_at)}` : undefined}
      actions={listing?.source_url ? (
        <Button asChild variant="secondary" size="sm">
          <a href={listing.source_url} target="_blank" rel="noopener noreferrer">
            Job posting <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      ) : null}
    >
      {listing ? (
        <Stack gap={2}>
          <p className="camp-prose" data-clamped={long && !expanded ? 'true' : undefined}>{listing.description}</p>
          {long ? (
            <div>
              <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Show less' : 'Show full description'}
              </Button>
            </div>
          ) : null}
        </Stack>
      ) : (
        <EmptyState
          size="inline"
          title="No job posting yet"
          description="Save the job from Job Discovery or import it in Job Match to keep the description here."
        />
      )}
    </Section>
  )
}

// ── Tasks ──

export function TasksPanel({ application }: Props) {
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
    <Section title="Tasks">
      <Stack gap={3}>
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
          <Input required maxLength={240} value={title} aria-label="New task" placeholder="Add a task" onChange={(event) => setTitle(event.target.value)} />
          <div className="camp-task-form__row">
            <DateField aria-label="Due date (optional)" value={deadline} onValueChange={setDeadline} />
            <Button type="submit" variant="secondary" disabled={write.isPending} aria-label="Add task">Add</Button>
          </div>
        </form>
        {application.tasks.length ? (
          <List aria-label="Tasks">
            {[...open, ...done].map((task) => (
              <Row key={task.id} density="compact">
                <RowBody>
                  <Checkbox
                    label={task.completed ? <span className="camp-done">{task.title}</span> : task.title}
                    checked={task.completed}
                    onCheckedChange={() => write.mutate(() => updateApplicationTask(application.id, task.id, !task.completed))}
                  />
                </RowBody>
                {task.deadline ? (
                  <RowMeta>
                    <span className="camp-due"><CalendarClock aria-hidden="true" />{formatDate(task.deadline)}</span>
                  </RowMeta>
                ) : null}
                <RowActions>
                  <Button
                    type="button"
                    iconOnly
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete task ${task.title}`}
                    onClick={() => write.mutate(() => deleteApplicationTask(application.id, task.id))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </RowActions>
              </Row>
            ))}
          </List>
        ) : (
          <EmptyState size="inline" title="No tasks yet" />
        )}
        {write.isError ? <Notice tone="danger">That change couldn't be saved. Try again.</Notice> : null}
      </Stack>
    </Section>
  )
}

// ── Notes ──

export function NotesPanel({ application }: Props) {
  const save = useApplicationUpdate(application.id)
  const [text, setText] = useState(application.notes ?? '')
  const changed = text.trim() !== (application.notes ?? '').trim()
  return (
    <Section title="Notes" description="Only you can see these: interview impressions, salary details, who you spoke to.">
      <Stack gap={2}>
        <form className="camp-notes" onSubmit={(event) => { event.preventDefault(); save.mutate({ notes: text.trim() || null }) }}>
          <Field label="Your notes" hideLabel>
            <Textarea autosize rows={3} maxRows={14} maxLength={20_000} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          {changed || save.isPending ? (
            <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save notes'}
            </Button>
          ) : null}
        </form>
        {save.isSuccess && !changed ? <p className="camp-note" role="status">Saved.</p> : null}
        {save.isError ? <Notice tone="danger">Your notes couldn't be saved. Try again.</Notice> : null}
      </Stack>
    </Section>
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

export function ActivityPanel({ application }: Props) {
  const events = [...application.events].reverse()
  return (
    <Section title="Activity">
      {events.length ? (
        <List aria-label="Activity">
          {events.map((event) => (
            <Row key={event.id} density="compact">
              <RowBody>
                <RowTitle>{eventLabel(event)}</RowTitle>
              </RowBody>
              <RowMeta>{formatDate(event.created_at)} · {event.provenance === 'system' ? 'Automatic' : 'You'}</RowMeta>
            </Row>
          ))}
        </List>
      ) : (
        <EmptyState size="inline" title="Nothing yet" description="Changes you make to this application will show up here." />
      )}
    </Section>
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

export function FactsPanel({ application }: Props) {
  const { listing } = application
  const rows: Array<{ label: string; value: ReactNode }> = [
    ...(application.match_score !== null ? [{ label: 'Skills fit', value: `${application.match_score}% when saved` }] : []),
    ...(OUTCOMES[application.status] ? [{ label: 'Outcome', value: OUTCOMES[application.status] }] : []),
    ...(application.deadline && !application.applied_at ? [{ label: 'Apply by', value: formatDate(application.deadline) }] : []),
    ...(listing ? [{ label: 'Saved', value: formatDate(listing.retrieved_at) }] : []),
    { label: 'Last activity', value: timeAgo(application.last_activity_at ?? application.updated_at) },
  ]
  return (
    <Section title="Details">
      <KeyValue items={rows} labelWidth="6.5rem" />
    </Section>
  )
}
