import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, Trash2 } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Notice,
  Page,
  Skeleton,
  Split,
  Stack,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { deleteApplication, getApplication, updateApplication } from '#/lib/api/client'
import type { ApplicationStatus } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { ActivityPanel, DocumentsPanel, FactsPanel, JobPanel, NotesPanel, TasksPanel } from './ApplicationSections'
import { ApplicationHeader } from './ApplicationHeader'
import { ApplyPanel } from './ApplyPanel'
import { DocumentChecks } from './DocumentChecks'
import { StageMenu } from './StageMenu'
import { STATUS_LABELS } from './stages'

/** One application on one page: apply, documents, job, tasks, notes, activity. */
export function ApplicationPage({ applicationId }: { applicationId: string }) {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)
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
  if (!authenticated) {
    return (
      <Page>
        <ErrorState
          size="page"
          role="status"
          headingLevel={1}
          title="Sign in to open this application"
          description="Your applications are private to your account."
          backAction={
            <Button onClick={() => openAuthDialog({ to: `/campaigns/${applicationId}`, reason: 'campaign' })}>Sign in</Button>
          }
        />
      </Page>
    )
  }
  if (query.isPending) return <ApplicationSkeleton />
  if (query.isError || !query.data) {
    return (
      <Page>
        <ErrorState
          size="page"
          role="status"
          headingLevel={1}
          title="This application couldn't be opened"
          description="It may have been deleted."
          backAction={<Button asChild variant="secondary"><Link to="/campaigns">All applications</Link></Button>}
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
          <StageMenu status={application.status} onMove={(next) => stage.mutate(next)} disabled={stage.isPending}>
            <Button variant="secondary" size="sm" aria-label={`Change stage, currently ${STATUS_LABELS[application.status]}`}>
              {STATUS_LABELS[application.status]} <ChevronDown aria-hidden="true" />
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
        <DocumentChecks applicationId={application.id} />
        <JobPanel application={application} />
        <NotesPanel application={application} />
        <ActivityPanel application={application} />
        <div>
          <Button type="button" variant="ghost" size="sm" className="camp-flush" onClick={() => setDeleteOpen(true)}>
            <Trash2 aria-hidden="true" /> Delete this application
          </Button>
        </div>
      </Split>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pending={remove.isPending}
        title="Delete this application?"
        description="This removes it from your board along with its tasks and notes. It doesn't withdraw anything you already sent to the employer."
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete'}
        icon={<Trash2 aria-hidden="true" />}
        onConfirm={() => remove.mutate()}
      >
        {remove.isError ? <Notice tone="danger">It couldn't be deleted. Try again.</Notice> : null}
      </ConfirmDialog>
    </Page>
  )
}

function ApplicationSkeleton() {
  return (
    <Page aria-busy="true">
      <Stack gap={3}>
        <Skeleton size="meta" width="8rem" />
        <Skeleton size="display" width="40%" label="Loading this application…" />
        <Skeleton size="meta" width="12rem" />
      </Stack>
      <Stack gap={3}>
        <Skeleton size="body" width="14rem" />
        <Skeleton size="title" lines={2} width="55%" />
        <Skeleton variant="block" width="14rem" height={32} />
      </Stack>
      <Split
        railFirst
        railLabel="Details and tasks"
        rail={
          <>
            <Stack gap={3}>
              <Skeleton size="body" width="5rem" />
              <Skeleton lines={4} />
            </Stack>
            <Stack gap={3}>
              <Skeleton size="body" width="4rem" />
              <Skeleton variant="block" width="100%" height={32} />
              <Skeleton variant="row" count={2} />
            </Stack>
          </>
        }
      >
        <Stack gap={3}>
          <Skeleton size="body" width="10rem" />
          <Skeleton variant="block" width="100%" height={32} />
          <Skeleton variant="block" width="100%" height={32} />
          <Skeleton variant="block" width="100%" height={32} />
        </Stack>
        <Stack gap={3}>
          <Skeleton size="body" width="9rem" />
          <Skeleton lines={4} />
        </Stack>
        <Stack gap={3}>
          <Skeleton size="body" width="5rem" />
          <Skeleton variant="block" width="100%" height={72} />
        </Stack>
      </Split>
    </Page>
  )
}
