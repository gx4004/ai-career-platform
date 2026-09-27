import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRightLeft, Briefcase, LockKeyhole, Trash2 } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { PageHero } from '#/components/app/PageHero'
import { WorkspacePage } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Skeleton } from '#/components/ui/skeleton'
import { useSession } from '#/hooks/useSession'
import { deleteApplication, getApplication, updateApplication } from '#/lib/api/client'
import type { ApplicationStatus } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { ActivityPanel, DocumentsPanel, JobPanel, NotesPanel, TasksPanel } from './ApplicationSections'
import { ApplyPanel } from './ApplyPanel'
import { DocumentChecks } from './DocumentChecks'
import { StageMenu } from './StageMenu'
import { STATUS_LABELS, applicationTitle, formatDate } from './stages'

/** One application on one page: apply, documents, job, tasks, notes, activity. */
export function ApplicationPage({ applicationId }: { applicationId: string }) {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const authenticated = status === 'authenticated'
  const queryKey = applicationQueryKey(applicationId)
  const query = useQuery({ queryKey, queryFn: () => getApplication(applicationId), enabled: authenticated })
  const stage = useMutation({
    mutationFn: (next: ApplicationStatus) => updateApplication(applicationId, { status: next }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKey, detail)
      void invalidateApplications(queryClient)
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteApplication(applicationId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey })
      void invalidateApplications(queryClient)
      void navigate({ to: '/campaigns' })
    },
  })

  if (status === 'loading') return <ApplicationSkeleton />
  if (!authenticated) return <PageFrame><AppStatePanel badge="Account only" title="Sign in to open this application" description="Your applications are private to your account." icon={<LockKeyhole aria-hidden="true" />} actions={[{ label: 'Sign in', onClick: () => openAuthDialog({ to: `/campaigns/${applicationId}`, reason: 'campaign' }) }]} /></PageFrame>
  if (query.isPending) return <ApplicationSkeleton />
  if (query.isError || !query.data) return <PageFrame><AppStatePanel badge="Not found" title="This application couldn't be opened" description="It may have been deleted." actions={[{ label: 'All applications', to: '/campaigns', variant: 'outline' }]} /></PageFrame>

  const application = query.data
  const chips = [
    STATUS_LABELS[application.status],
    ...(application.match_score !== null ? [`${application.match_score}% match`] : []),
    ...(application.applied_at ? [`Applied ${formatDate(application.applied_at)}`] : []),
    ...(application.deadline && !application.applied_at ? [`Apply by ${formatDate(application.deadline)}`] : []),
  ]

  return (
    <WorkspacePage className="camp-detail">
      <Link to="/campaigns" className="camp-back"><ArrowLeft size={15} aria-hidden="true" /> All applications</Link>
      <PageHero
        icon={Briefcase}
        title={applicationTitle(application)}
        purpose={application.company ?? 'Application'}
        chips={chips}
        action={
          <StageMenu status={application.status} onMove={(next) => stage.mutate(next)} disabled={stage.isPending}>
            <Button variant="outline"><ArrowRightLeft size={15} /> Change stage</Button>
          </StageMenu>
        }
      />
      {stage.isError ? (
        <p className="camp-alert" role="alert">
          {stage.error instanceof Error && stage.error.message ? stage.error.message : "The stage couldn't be changed. Try again."}
        </p>
      ) : null}

      <div className="camp-layout">
        <div className="camp-stack">
          <ApplyPanel application={application} />
          <DocumentsPanel application={application} />
          <DocumentChecks applicationId={application.id} />
          <JobPanel application={application} />
        </div>
        <div className="camp-stack">
          <TasksPanel application={application} />
          <NotesPanel application={application} />
          <ActivityPanel application={application} />
          <button type="button" className="camp-delete" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} aria-hidden="true" /> Delete this application
          </button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!remove.isPending) setDeleteOpen(open) }}>
        <DialogContent showCloseButton={!remove.isPending}>
          <DialogHeader>
            <DialogTitle>Delete this application?</DialogTitle>
            <DialogDescription>This removes it from your board along with its tasks and notes. It doesn't withdraw anything you already sent to the employer.</DialogDescription>
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

function ApplicationSkeleton() {
  return (
    <WorkspacePage className="camp-detail">
      <div className="camp-stack" aria-busy="true">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-[26rem] w-full" />
      </div>
    </WorkspacePage>
  )
}
