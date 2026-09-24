import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRightLeft, Briefcase, ExternalLink, FileText, LockKeyhole, Trash2 } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { StatusPill, WorkspaceEmpty, WorkspaceHero, WorkspacePage, WorkspacePanel } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Skeleton } from '#/components/ui/skeleton'
import { useSession } from '#/hooks/useSession'
import { deleteCampaign, getCampaign, updateCampaignMaterials, updateHistoryWorkspace } from '#/lib/api/client'
import type { CampaignDetail, CampaignMaterialSelection, CampaignStatus } from '#/lib/api/schemas'
import { CampaignChecklist } from './CampaignChecklist'
import { ContactsPanel, NotesPanel, TasksPanel, TimelinePanel } from './CampaignTracking'
import { StageMenu } from './StageMenu'
import { campaignCompany, campaignTitle, formatDate, stageTone, statusLabel } from './stages'

const TABS = ['Overview', 'Tasks', 'Notes', 'Contacts', 'Timeline', 'Checklist'] as const
type Tab = (typeof TABS)[number]

export function CampaignPage({ campaignId }: { campaignId: string }) {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('Overview')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const authenticated = status === 'authenticated'
  const queryKey = ['campaign', campaignId]
  const query = useQuery({ queryKey, queryFn: () => getCampaign(campaignId), enabled: authenticated })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
    return queryClient.invalidateQueries({ queryKey })
  }
  // One mutation for every task/note/contact write, so one error banner covers them all.
  const tracking = useMutation({ mutationFn: (write: () => Promise<unknown>) => write(), onSuccess: () => { void refresh() } })
  const materials = useMutation({
    mutationFn: (payload: CampaignMaterialSelection) => updateCampaignMaterials(campaignId, payload),
    onSuccess: (campaign) => {
      queryClient.setQueryData(queryKey, campaign)
      void queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
    },
  })
  const stage = useMutation({
    mutationFn: (next: CampaignStatus) => updateHistoryWorkspace(campaignId, { status: next }),
    onSuccess: () => { void refresh() },
  })
  const remove = useMutation({
    mutationFn: () => deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey })
      void queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
      void navigate({ to: '/campaigns' })
    },
  })

  if (status === 'loading') return <CampaignSkeleton />
  if (!authenticated) return <PageFrame><AppStatePanel badge="Account only" title="Sign in to open this application" description="Your applications are private to your account." icon={<LockKeyhole aria-hidden="true" />} actions={[{ label: 'Sign in', onClick: () => openAuthDialog({ to: `/campaigns/${campaignId}`, reason: 'campaign' }) }]} /></PageFrame>
  if (query.isPending) return <CampaignSkeleton />
  if (query.isError || !query.data) return <PageFrame><AppStatePanel badge="Not found" title="This application couldn't be opened" description="It may have been deleted." actions={[{ label: 'All applications', to: '/campaigns', variant: 'outline' }]} /></PageFrame>

  const campaign = query.data
  const title = campaignTitle(campaign)
  const company = campaignCompany(campaign)
  const openTasks = campaign.tasks.filter((task) => !task.completed)
  const sentAt = campaign.submission_snapshots[0]?.created_at
  const counts: Partial<Record<Tab, number>> = { Tasks: openTasks.length, Notes: campaign.notes.length, Contacts: campaign.contacts.length }
  const trackingProps = { campaign, run: (write: () => Promise<unknown>) => tracking.mutate(write), pending: tracking.isPending }

  return (
    <WorkspacePage className="camp-detail">
      <Link to="/campaigns" className="camp-back"><ArrowLeft size={15} aria-hidden="true" /> All applications</Link>
      <WorkspaceHero
        icon={Briefcase}
        eyebrow={company ?? 'Application'}
        title={title}
        actions={<>
          {campaign.listing?.source_url ? (
            <Button variant="outline" asChild>
              <a href={campaign.listing.source_url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Job posting</a>
            </Button>
          ) : null}
          <StageMenu status={campaign.status} onMove={(next) => stage.mutate(next)} disabled={stage.isPending}>
            <Button><ArrowRightLeft size={15} /> Change stage</Button>
          </StageMenu>
          <Button variant="ghost" size="icon" aria-label="Delete application" onClick={() => setDeleteOpen(true)}><Trash2 size={16} /></Button>
        </>}
        stats={[
          { label: 'Stage', value: <StatusPill tone={stageTone(campaign.status)}>{statusLabel(campaign.status)}</StatusPill> },
          { label: 'Apply by', value: campaign.deadline ? formatDate(campaign.deadline) : '—' },
          { label: 'Applied on', value: sentAt ? formatDate(sentAt) : '—' },
          { label: 'Open tasks', value: openTasks.length },
        ]}
      />
      {stage.isError ? <p className="camp-alert" role="alert">The stage couldn't be changed. Refresh the page and try again.</p> : null}

      <div className="camp-tabs" role="tablist" aria-label="Application sections">
        {TABS.map((name) => (
          <button key={name} type="button" role="tab" id={`tab-${name}`} aria-selected={tab === name} aria-controls="camp-tabpanel" className={tab === name ? 'camp-tab is-active' : 'camp-tab'} onClick={() => setTab(name)}>
            {name}
            {counts[name] ? <span className="camp-tab__count">{counts[name]}</span> : null}
          </button>
        ))}
      </div>

      <div id="camp-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'Overview' ? <Overview campaign={campaign} materials={materials} onOpenTasks={() => setTab('Tasks')} /> : null}
        {tab === 'Tasks' ? <TasksPanel {...trackingProps} /> : null}
        {tab === 'Notes' ? <NotesPanel {...trackingProps} /> : null}
        {tab === 'Contacts' ? <ContactsPanel {...trackingProps} /> : null}
        {tab === 'Timeline' ? <TimelinePanel campaign={campaign} /> : null}
        {tab === 'Checklist' ? <CampaignChecklist campaign={campaign} /> : null}
        {tracking.isError ? <p role="alert" className="camp-alert">That change couldn't be saved. Try again.</p> : null}
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!remove.isPending) setDeleteOpen(open) }}>
        <DialogContent showCloseButton={!remove.isPending}>
          <DialogHeader>
            <DialogTitle>Delete this application?</DialogTitle>
            <DialogDescription>This removes it from your board along with its tasks, notes and contacts. It doesn't withdraw anything you already sent to the employer.</DialogDescription>
          </DialogHeader>
          {remove.isError ? <p role="alert" className="camp-alert">It couldn't be deleted. Try again.</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="outline" className="button-destructive-soft" loading={remove.isPending} disabled={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 size={14} /> {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePage>
  )
}

type MaterialsMutation = { mutate: (payload: CampaignMaterialSelection) => void; isPending: boolean; isSuccess: boolean; isError: boolean }

function Overview({ campaign, materials, onOpenTasks }: { campaign: CampaignDetail; materials: MaterialsMutation; onOpenTasks: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const { selected_materials: selected, available_materials: available } = campaign
  const next = campaign.tasks.find((task) => !task.completed)
  const long = (campaign.listing?.description.length ?? 0) > 700
  return (
    <div className="camp-overview">
      <WorkspacePanel kicker="The job" title="Job description" description={campaign.listing ? `${campaign.listing.title} at ${campaign.listing.company} · saved ${formatDate(campaign.listing.retrieved_at)}` : undefined}>
        {campaign.listing ? (
          <>
            <p className={long && !expanded ? 'camp-description is-clamped' : 'camp-description'}>{campaign.listing.description}</p>
            {long ? <button type="button" className="camp-link-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show full description'}</button> : null}
          </>
        ) : (
          <WorkspaceEmpty icon={FileText} title="No job posting yet" description="Save the job from Job Discovery or import it in Job Match to keep the description here." />
        )}
      </WorkspacePanel>
      <div className="camp-stack">
        <WorkspacePanel kicker="Your documents" title="What you're sending" description="Pick the version of each document that goes with this application.">
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
              create={{ to: '/cover-letter', label: 'Write a cover letter' }}
              onChange={(value) => materials.mutate({ cover_letter_run_id: value || null })}
            />
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
        </WorkspacePanel>
        <WorkspacePanel kicker="Up next" title={next ? next.title : 'Nothing planned'} description={next?.deadline ? `Due ${formatDate(next.deadline)}` : next ? 'No due date' : 'Add a task so you know what to do next.'}>
          <button type="button" className="camp-link-button" onClick={onOpenTasks}>{next ? 'See all tasks' : 'Add a task'}</button>
        </WorkspacePanel>
      </div>
    </div>
  )
}

type OpenTarget = { to: '/cv-studio' } | { to: '/cover-letter/result/$historyId' | '/interview/result/$historyId'; historyId: string }

function MaterialRow({ label, field, value, items, pending, open, create, onChange }: {
  label: string
  field: keyof CampaignMaterialSelection
  value: string
  items: Array<{ id: string; label: string }>
  pending: boolean
  open: OpenTarget | null
  create: { to: '/cv-studio' | '/cover-letter' | '/interview'; label: string }
  onChange: (value: string) => void
}) {
  const id = `campaign-${field}`
  return (
    <div className="camp-material">
      <label htmlFor={id} className="workspace-field__label">{label}</label>
      {items.length ? (
        <div className="camp-material__row">
          <select id={id} className="workspace-select" value={value} disabled={pending} onChange={(event) => onChange(event.target.value)}>
            <option value="">Not chosen yet</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {open ? (
            'historyId' in open
              ? <Link to={open.to} params={{ historyId: open.historyId }} className="camp-link-button">Open</Link>
              : <Link to={open.to} className="camp-link-button">Open</Link>
          ) : null}
        </div>
      ) : (
        <p className="camp-material__empty">
          None yet. <Link to={create.to} className="camp-link-button">{create.label}</Link>
        </p>
      )}
    </div>
  )
}

function runLabel(run: { label: string | null; parent_run_id: string | null; created_at: string }, fallback: string) {
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.created_at))
  return `${run.label || fallback}${run.parent_run_id ? ' (edited)' : ''} · ${when}`
}

function CampaignSkeleton() {
  return (
    <WorkspacePage className="camp-detail">
      <div className="camp-stack" aria-busy="true">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-[26rem] w-full" />
      </div>
    </WorkspacePage>
  )
}
