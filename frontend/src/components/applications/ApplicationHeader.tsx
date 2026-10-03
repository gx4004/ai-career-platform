import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Pin } from 'lucide-react'
import { Button, Cluster, Input, PageHeader, Tooltip } from '#/components/kit'
import { updateHistoryWorkspace } from '#/lib/api/client'
import type { ApplicationDetail } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { applicationTitle, roleOnly } from './stages'

/**
 * Title, company, name and pin for one application (an application is its workspace row, so
 * rename and pin are the workspace ones that used to live on History). Renaming swaps the title
 * for a field of the same width; the stage control stays where it is. A failed save is reported
 * through `onError`, so the page can show it as a notice.
 */
export function ApplicationHeader({
  application,
  stageControl,
  onError,
}: {
  application: ApplicationDetail
  stageControl: ReactNode
  onError: (message: string | null) => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const queryKey = applicationQueryKey(application.id)

  const save = useMutation({
    mutationFn: (payload: { label?: string; is_pinned?: boolean }) =>
      updateHistoryWorkspace(application.id, payload),
    onMutate: () => onError(null),
    onSuccess: (workspace) => {
      queryClient.setQueryData<ApplicationDetail>(queryKey, (current) =>
        current && { ...current, label: workspace.label ?? null, is_pinned: workspace.is_pinned },
      )
      void invalidateApplications(queryClient)
    },
  })

  const trimmed = draft.trim()
  const pinned = application.is_pinned
  const cancel = () => setEditing(false)

  return (
    // One form around the header, so Enter in the name field saves; it adds no box of its own.
    <form
      className="camp-header"
      onSubmit={(event) => {
        event.preventDefault()
        // An application is never left without a name.
        if (!editing || !trimmed) return
        save.mutate(
          { label: trimmed },
          { onSuccess: cancel, onError: () => onError("The name couldn't be saved. Try again.") },
        )
      }}
    >
      <PageHeader
        back={
          <Button asChild variant="ghost" size="sm" className="camp-flush">
            <Link to="/campaigns"><ArrowLeft aria-hidden="true" /> All applications</Link>
          </Button>
        }
        title={
          editing ? (
            <Input
              autoFocus
              aria-label="Application name"
              value={draft}
              maxLength={200}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancel()
                }
              }}
            />
          ) : (
            roleOnly(applicationTitle(application), application.company)
          )
        }
        meta={[
          application.company ? (
            application.listing?.source_url ? (
              <a href={application.listing.source_url} target="_blank" rel="noopener noreferrer">{application.company}</a>
            ) : application.company
          ) : null,
        ]}
        actions={
          <Cluster gap={2} justify="end">
            {editing ? (
              <>
                <Button type="submit" size="sm" variant="secondary" disabled={!trimmed} loading={save.isPending}>
                  Save name
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </>
            ) : (
              <Cluster gap={1}>
                <Tooltip content="Rename application">
                  <Button
                    type="button"
                    iconOnly
                    variant="ghost"
                    size="sm"
                    aria-label="Rename application"
                    onClick={() => {
                      setDraft(applicationTitle(application))
                      setEditing(true)
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </Tooltip>
                <Tooltip content={pinned ? 'Unpin application' : 'Pin application'}>
                  <Button
                    type="button"
                    iconOnly
                    variant="ghost"
                    size="sm"
                    aria-pressed={pinned}
                    aria-label={pinned ? 'Unpin application' : 'Pin application'}
                    disabled={save.isPending}
                    onClick={() => save.mutate({ is_pinned: !pinned }, { onError: () => onError("Your change couldn't be saved. Try again.") })}
                  >
                    <Pin fill={pinned ? 'currentColor' : 'none'} aria-hidden="true" />
                  </Button>
                </Tooltip>
              </Cluster>
            )}
            {stageControl}
          </Cluster>
        }
      />
    </form>
  )
}
