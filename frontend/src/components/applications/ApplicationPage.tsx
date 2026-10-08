import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, CircleAlert, LogIn, SearchX, Trash2 } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Notice,
  Page,
  Panel,
  PanelBody,
  PanelHeader,
  Skeleton,
  Split,
  Stack,
  StageMark,
  useToast,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { deleteApplication, getApplication, updateApplication } from '#/lib/api/client'
import { ApiError, describeFailure } from '#/lib/api/errors'
import type { ApplicationDetail, ApplicationStatus } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { ActivityPanel, DocumentsPanel, FactsPanel, JobPanel, NotesPanel, TasksPanel } from './ApplicationSections'
import { ApplicationHeader } from './ApplicationHeader'
import { ApplyPanel } from './ApplyPanel'
import { DocumentChecks } from './DocumentChecks'
import { StageMenu } from './StageMenu'
import { STATUS_LABELS, applicationTitle, roleOnly, stageOf } from './stages'
import { useOwnerMutation } from '#/hooks/useOwnerMutation'

/** One application on one page: apply, documents, job, tasks, notes, activity. */
export function ApplicationPage({ applicationId }: { applicationId: string }) {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const authenticated = status === 'authenticated'
  const queryKey = applicationQueryKey(applicationId)
  const query = useQuery({ queryKey, queryFn: () => getApplication(applicationId), enabled: authenticated })
  const stage = useOwnerMutation({
    mutationFn: (next: ApplicationStatus) => updateApplication(applicationId, { status: next }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKey, detail)
      void invalidateApplications(queryClient)
    },
  })
  const remove = useOwnerMutation({
    mutationFn: () => deleteApplication(applicationId),
    onSuccess: () => {
      const detail = queryClient.getQueryData<ApplicationDetail>(queryKey)
      const name = detail ? roleOnly(applicationTitle(detail), detail.company) : 'the application'
      // Leave first: invalidating while this page is mounted would refetch the deleted application (a 404).
      void Promise.resolve(navigate({ to: '/campaigns' })).then(() => {
        queryClient.removeQueries({ queryKey })
        void invalidateApplications(queryClient)
        toast({ tone: 'success', title: `Deleted “${name}”.` })
      })
    },
  })

  // 'unreachable' is a signed-in browser that cannot reach the server, not a guest: it waits like 'loading'
  // while the service banner explains the outage.
  if (status === 'loading' || status === 'unreachable') return <ApplicationSkeleton />
  if (!authenticated) {
    return (
      <Page className="camp-state">
        {/* An empty state (lemon disc), not an ErrorState: being signed out is neither a problem nor time pressure. */}
        <EmptyState
          size="page"
          role="status"
          headingLevel={1}
          title="Sign in to open this application"
          icon={<LogIn aria-hidden="true" />}
          description="Your applications are private to your account."
          action={
            <Button onClick={() => openAuthDialog({ to: `/campaigns/${applicationId}`, reason: 'campaign' })}>Sign in</Button>
          }
        />
      </Page>
    )
  }
  if (query.isPending) return <ApplicationSkeleton />
  if (query.isError || !query.data) {
    // Only a 404 means the application is gone; anything else is a failure worth retrying.
    const missing = query.error instanceof ApiError && query.error.status === 404
    return (
      <Page className="camp-state">
        <ErrorState
          size="page"
          role={missing ? 'status' : 'alert'}
          headingLevel={1}
          title="This application couldn't be opened"
          description={
            missing
              ? 'It may have been deleted.'
              : describeFailure(query.error, 'Something went wrong on our side. Try again in a moment.').message
          }
          onRetry={missing ? undefined : () => void query.refetch()}
          retrying={query.isFetching}
          icon={missing ? <SearchX aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          // Not exact, /campaigns would count as the current page here (aria-current="page" on a way back).
          backAction={<Button asChild variant="secondary"><Link to="/campaigns" activeOptions={{ exact: true }}>All applications</Link></Button>}
        />
      </Page>
    )
  }

  const application = query.data
  const stageError = stage.isError
    ? (stage.error instanceof Error && stage.error.message ? stage.error.message : "The stage couldn't be changed. Try again.")
    : null

  return (
    <Page>
      <ApplicationHeader
        application={application}
        onError={setIdentityError}
        stageControl={
          <StageMenu status={application.status} sent={application.applied_at !== null} onMove={(next) => stage.mutate(next)} disabled={stage.isPending}>
            <Button variant="ghost" size="sm" aria-label={`Change stage, currently ${STATUS_LABELS[application.status]}`}>
              <StageMark stage={stageOf(application.status)} label={STATUS_LABELS[application.status]} /> <ChevronDown aria-hidden="true" />
            </Button>
          </StageMenu>
        }
      />
      {stageError || identityError ? (
        <Stack gap={2}>
          {stageError ? <Notice tone="danger" onDismiss={() => stage.reset()}>{stageError}</Notice> : null}
          {identityError ? <Notice tone="danger" onDismiss={() => setIdentityError(null)}>{identityError}</Notice> : null}
        </Stack>
      ) : null}

      <ApplyPanel application={application} />

      <Split
        railFirst
        railLabel="Details and tasks"
        rail={
          <>
            <FactsPanel application={application} />
            <TasksPanel application={application} />
          </>
        }
      >
        <DocumentsPanel application={application} />
        <DocumentChecks
          applicationId={application.id}
          sent={application.applied_at !== null}
          hasDocuments={Boolean(
            application.selected_materials.cv_variant ||
              application.selected_materials.cover_letter ||
              application.drafts?.cover_letter?.body.trim(),
          )}
        />
        <JobPanel application={application} />
        <NotesPanel application={application} />
        <ActivityPanel application={application} />
        <div>
          <Button type="button" variant="ghost" size="sm" flush="start" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" /> Delete this application
          </Button>
        </div>
      </Split>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pending={remove.isPending}
        title="Delete this application?"
        description={deleteSummary(application)}
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete application'}
        icon={<Trash2 aria-hidden="true" />}
        onConfirm={() => remove.mutate()}
      >
        {remove.isError ? <Notice tone="danger">It couldn't be deleted. Try again.</Notice> : null}
      </ConfirmDialog>
    </Page>
  )
}

/** What deleting takes with it, named from this application's own data. */
function deleteSummary(application: ApplicationDetail) {
  const role = roleOnly(applicationTitle(application), application.company)
  const name = application.company ? `${role} at ${application.company}` : role
  const tasks = application.tasks.length
  const parts = [
    tasks ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : null,
    application.notes ? 'your notes' : null,
    application.drafts ? 'the prepared drafts' : null,
    application.snapshot ? 'the record of what you sent' : null,
    application.events_total || application.events.length ? 'its activity' : null,
  ].filter((part): part is string => part !== null)
  const taken = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `“${name}” leaves your board${taken ? ` with ${taken}` : ''}. Cover letters and interview prep you made in the tools stay in History. Nothing you already sent to the employer is withdrawn.`
}

/**
 * The loading page in the loaded page's own frames (STICKER 4.O): the header lines, then the white panels of the
 * apply block, the Details and Tasks rail and the document column, each with its header rule, bars pulsing inside.
 * Loose bars on the ground jumped into white panels when the data arrived.
 */
function ApplicationSkeleton() {
  return (
    <Page aria-busy="true" className="camp-state">
      <Stack gap={3}>
        <Skeleton size="meta" width="8rem" />
        <Skeleton size="display" width="40%" label="Loading this application…" />
        <Skeleton size="meta" width="12rem" />
      </Stack>
      <SkeletonPanel title="16rem">
        <Skeleton size="title" lines={2} width="55%" />
        <Skeleton variant="block" width="14rem" height={44} />
      </SkeletonPanel>
      <Split
        railFirst
        railLabel="Details and tasks"
        rail={
          <>
            <SkeletonPanel title="5rem">
              <Skeleton lines={4} />
            </SkeletonPanel>
            <SkeletonPanel title="4rem">
              <Skeleton variant="block" width="100%" height={44} />
              <Skeleton lines={2} />
            </SkeletonPanel>
          </>
        }
      >
        <SkeletonPanel title="10rem">
          <Skeleton variant="block" width="100%" height={44} />
          <Skeleton variant="block" width="100%" height={44} />
          <Skeleton variant="block" width="100%" height={44} />
        </SkeletonPanel>
        <SkeletonPanel title="12rem">
          <Skeleton lines={2} />
        </SkeletonPanel>
        <SkeletonPanel title="9rem">
          <Skeleton lines={4} />
        </SkeletonPanel>
      </Split>
    </Page>
  )
}

/** A panel frame with a title bar in its header and placeholder lines in its body; hidden from assistive tech. */
function SkeletonPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel aria-hidden="true" data-testid="application-skeleton-panel">
      <PanelHeader title={<Skeleton size="title" width={title} />} />
      <PanelBody>
        <Stack gap={3}>{children}</Stack>
      </PanelBody>
    </Panel>
  )
}
