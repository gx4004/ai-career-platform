import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CalendarClock, ListChecks, NotebookPen, Trash2, UserRound, Users } from 'lucide-react'
import { WorkspaceEmpty, WorkspacePanel } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import {
  createCampaignContact,
  createCampaignNote,
  createCampaignTask,
  deleteCampaignContact,
  deleteCampaignNote,
  deleteCampaignTask,
  getCampaignReminders,
  updateCampaignReminderConsent,
  updateCampaignTask,
} from '#/lib/api/client'
import type { CampaignDetail, CampaignStatus } from '#/lib/api/schemas'
import { STATUS_LABELS, formatDate } from './stages'

/** Runs one tracking write; CampaignPage owns the mutation so one banner covers every tab. */
export type RunAction = (write: () => Promise<unknown>) => void

export function TasksPanel({ campaign, run, pending }: { campaign: CampaignDetail; run: RunAction; pending: boolean }) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const open = campaign.tasks.filter((task) => !task.completed)
  const done = campaign.tasks.filter((task) => task.completed)
  return (
    <div className="camp-stack">
      <WorkspacePanel kicker="To do" title="Tasks" description="Small steps that keep this application moving.">
        <form
          className="camp-form camp-form--row"
          onSubmit={(event) => {
            event.preventDefault()
            // Midday keeps a date-only choice on the same calendar day in any timezone.
            run(() => createCampaignTask(campaign.id, {
              title,
              deadline: deadline ? new Date(`${deadline}T12:00:00`).toISOString() : null,
            }).then(() => { setTitle(''); setDeadline('') }))
          }}
        >
          <label className="workspace-field camp-form__grow">
            <span className="workspace-field__label">New task</span>
            <input className="workspace-input" required maxLength={240} value={title} placeholder="e.g. Follow up with the recruiter" onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="workspace-field">
            <span className="workspace-field__label">Due date (optional)</span>
            <input className="workspace-input" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          </label>
          <Button type="submit" disabled={pending}>Add task</Button>
        </form>
        {campaign.tasks.length ? (
          <ul className="camp-list">
            {[...open, ...done].map((task) => (
              <li key={task.id} className={task.completed ? 'camp-task is-done' : 'camp-task'}>
                <label>
                  <input type="checkbox" checked={task.completed} onChange={() => run(() => updateCampaignTask(campaign.id, task.id, !task.completed))} />
                  <span>{task.title}</span>
                </label>
                {task.deadline ? <span className="camp-task__due"><CalendarClock size={13} aria-hidden="true" />{formatDate(task.deadline)}</span> : null}
                <DeleteButton label={`Delete task ${task.title}`} onClick={() => run(() => deleteCampaignTask(campaign.id, task.id))} />
              </li>
            ))}
          </ul>
        ) : (
          <WorkspaceEmpty icon={ListChecks} title="No tasks yet" description="Add the next thing you need to do, like tailoring your CV or following up." />
        )}
      </WorkspacePanel>
      <Reminders campaignId={campaign.id} />
    </div>
  )
}

function Reminders({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['campaign-reminders', campaignId], queryFn: () => getCampaignReminders(campaignId) })
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateCampaignReminderConsent(campaignId, enabled),
    onSuccess: (value) => queryClient.setQueryData(['campaign-reminders', campaignId], value),
  })
  const reminder = query.data
  return (
    <WorkspacePanel
      kicker="Reminders"
      title="Deadline reminders"
      description="See upcoming deadlines here whenever you open this application. We never send emails or notifications."
      actions={reminder ? (
        <Button variant="outline" aria-pressed={reminder.enabled} disabled={toggle.isPending} onClick={() => toggle.mutate(!reminder.enabled)}>
          {reminder.enabled ? <BellOff size={15} /> : <Bell size={15} />}
          {reminder.enabled ? 'Turn reminders off' : 'Turn reminders on'}
        </Button>
      ) : null}
    >
      {query.isPending ? <p className="camp-muted">Loading…</p> : null}
      {query.isError ? <p className="camp-alert" role="alert">Reminder settings couldn't be loaded.</p> : null}
      {reminder?.enabled && reminder.items.length ? (
        <ul className="camp-list">
          {reminder.items.map((item) => (
            <li key={`${item.kind}-${item.task_id || 'campaign'}`} className="camp-reminder">
              <strong>{item.label}</strong>
              <span>{formatDate(item.deadline)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {reminder?.enabled && !reminder.items.length ? <p className="camp-muted">Nothing due soon.</p> : null}
      {reminder && !reminder.enabled ? <p className="camp-muted">Reminders are off.</p> : null}
      {toggle.isError ? <p role="alert" className="camp-alert">Reminders couldn't be updated. Try again.</p> : null}
    </WorkspacePanel>
  )
}

export function NotesPanel({ campaign, run, pending }: { campaign: CampaignDetail; run: RunAction; pending: boolean }) {
  const [text, setText] = useState('')
  return (
    <WorkspacePanel kicker="Only you can see these" title="Notes" description="Interview impressions, salary details, questions to ask.">
      <form className="camp-form" onSubmit={(event) => { event.preventDefault(); run(() => createCampaignNote(campaign.id, text).then(() => setText(''))) }}>
        <label className="workspace-field">
          <span className="workspace-field__label">New note</span>
          <textarea className="workspace-textarea" required maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <Button type="submit" disabled={pending} className="camp-form__submit">Add note</Button>
      </form>
      {campaign.notes.length ? (
        <ul className="camp-list">
          {[...campaign.notes].reverse().map((note) => (
            <li key={note.id} className="camp-note">
              <p>{note.text}</p>
              <span className="camp-muted">{formatDate(note.created_at)}</span>
              <DeleteButton label="Delete note" onClick={() => run(() => deleteCampaignNote(campaign.id, note.id))} />
            </li>
          ))}
        </ul>
      ) : (
        <WorkspaceEmpty icon={NotebookPen} title="No notes yet" description="Jot down anything you want to remember about this job." />
      )}
    </WorkspacePanel>
  )
}

export function ContactsPanel({ campaign, run, pending }: { campaign: CampaignDetail; run: RunAction; pending: boolean }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [channel, setChannel] = useState('')
  return (
    <WorkspacePanel kicker="People" title="Contacts" description="Recruiters, hiring managers and anyone who referred you.">
      <form
        className="camp-form camp-form--row"
        onSubmit={(event) => {
          event.preventDefault()
          run(() => createCampaignContact(campaign.id, { name, role: role || null, channel: channel || null })
            .then(() => { setName(''); setRole(''); setChannel('') }))
        }}
      >
        <label className="workspace-field camp-form__grow">
          <span className="workspace-field__label">Name</span>
          <input className="workspace-input" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="workspace-field camp-form__grow">
          <span className="workspace-field__label">Their role</span>
          <input className="workspace-input" maxLength={200} value={role} placeholder="e.g. Recruiter" onChange={(event) => setRole(event.target.value)} />
        </label>
        <label className="workspace-field camp-form__grow">
          <span className="workspace-field__label">How to reach them</span>
          <input className="workspace-input" maxLength={200} value={channel} placeholder="Email, phone or LinkedIn" onChange={(event) => setChannel(event.target.value)} />
        </label>
        <Button type="submit" disabled={pending}>Add contact</Button>
      </form>
      {campaign.contacts.length ? (
        <ul className="camp-contacts">
          {campaign.contacts.map((contact) => (
            <li key={contact.id} className="camp-contact">
              <span className="camp-contact__avatar" aria-hidden="true"><UserRound size={16} /></span>
              <div>
                <strong>{contact.name}</strong>
                {contact.role ? <span>{contact.role}</span> : null}
                {contact.channel ? <span className="camp-muted">{contact.channel}</span> : null}
              </div>
              <DeleteButton label={`Delete contact ${contact.name}`} onClick={() => run(() => deleteCampaignContact(campaign.id, contact.id))} />
            </li>
          ))}
        </ul>
      ) : (
        <WorkspaceEmpty icon={Users} title="No contacts yet" description="Add the people you're talking to so their details are one click away." />
      )}
    </WorkspacePanel>
  )
}

const EVENT_LABELS: Record<string, string> = {
  deadline_changed: 'Deadline updated',
  listing_attached: 'Job posting added',
  listing_adopted: 'Saved from Job Discovery',
  material_selection_changed: 'Documents updated',
  task_created: 'Task added',
  task_completed: 'Task done',
  task_reopened: 'Task reopened',
  task_deleted: 'Task removed',
  note_added: 'Note added',
  note_deleted: 'Note removed',
  contact_added: 'Contact added',
  contact_deleted: 'Contact removed',
  packet_approved: 'Approved in your queue',
  submission_snapshot_created: 'Application sent',
}

function eventLabel(event: CampaignDetail['events'][number]) {
  if (event.event_type === 'status_changed') {
    const to = event.details.to as CampaignStatus | undefined
    return to && STATUS_LABELS[to] ? `Moved to ${STATUS_LABELS[to]}` : 'Stage changed'
  }
  return EVENT_LABELS[event.event_type] ?? 'Updated'
}

export function TimelinePanel({ campaign }: { campaign: CampaignDetail }) {
  const events = campaign.events.filter((event) => event.event_type !== 'submission_confirmed').reverse()
  const sent = new Map(campaign.submission_snapshots.map((snapshot) => [snapshot.id, snapshot]))
  return (
    <WorkspacePanel kicker="History" title="Timeline" description="Everything that happened with this application, newest first.">
      {events.length ? (
        <ol className="camp-timeline">
          {events.map((event) => {
            const snapshot = typeof event.details.snapshot_id === 'string' ? sent.get(event.details.snapshot_id) : undefined
            return (
              <li key={event.id} className={snapshot ? 'is-key' : undefined}>
                <span className="camp-timeline__dot" aria-hidden="true" />
                <div>
                  <strong>{eventLabel(event)}</strong>
                  <span className="camp-muted">{formatDate(event.created_at)} · {event.provenance === 'system' ? 'Automatic' : 'You'}</span>
                  {snapshot ? <SentApplication content={snapshot.content} /> : null}
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <WorkspaceEmpty icon={CalendarClock} title="Nothing here yet" description="Changes you make to this application will show up here." />
      )}
    </WorkspacePanel>
  )
}

/** What was sent, as saved at the moment the application moved to Applied. */
function SentApplication({ content }: { content: Record<string, unknown> }) {
  const listing = content.listing as { title?: string; company?: string } | null
  const cv = content.cv_variant as { name?: string } | null
  const cover = content.cover_letter as { label?: string | null } | null
  return (
    <details className="camp-sent">
      <summary>See what you sent</summary>
      <dl>
        <div><dt>Job</dt><dd>{listing ? [listing.title, listing.company].filter(Boolean).join(' · ') : 'No job posting attached'}</dd></div>
        <div><dt>CV</dt><dd>{cv?.name || 'No CV chosen'}</dd></div>
        <div><dt>Cover letter</dt><dd>{cover ? cover.label || 'Cover letter' : 'No cover letter chosen'}</dd></div>
      </dl>
    </details>
  )
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="camp-icon-button" aria-label={label} onClick={onClick}>
      <Trash2 size={14} aria-hidden="true" />
    </button>
  )
}
