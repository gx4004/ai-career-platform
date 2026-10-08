import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Pin } from 'lucide-react'
import { Button, Cluster, Input, PageHeader, Tooltip } from '#/components/kit'
import { updateHistoryWorkspace } from '#/lib/api/client'
import type { ApplicationDetail } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { applicationTitle, roleOnly } from './stages'
import { useOwnerMutation } from '#/hooks/useOwnerMutation'

/**
 * Title, company, name and pin for one application (an application is its workspace row, so
 * rename and pin are the workspace ones that used to live on History). Renaming swaps the visible title for
 * the name field with Save name and Cancel beside it, at its height (they wrap under it on a phone);
 * the stage control steps aside meanwhile. Closing the field puts focus back on the pencil. A failed
 * save is reported through `onError`, so the page can show it as a notice.
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

  const save = useOwnerMutation({
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

  // Saving, Cancel and Escape unmount the field; without this, keyboard focus fell to <body> (F31).
  const renameRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  useEffect(() => {
    if (wasEditing.current && !editing) renameRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

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
          <Button asChild variant="ghost" size="sm" flush="start">
            {/* Exact: on /campaigns/$id the list counts as active and the way back would say aria-current="page". */}
            <Link to="/campaigns" activeOptions={{ exact: true }}><ArrowLeft aria-hidden="true" /> All applications</Link>
          </Button>
        }
        title={roleOnly(applicationTitle(application), application.company)}
        // The rename form replaces the visible title beside the heading, not inside it: nested in the h1 its buttons
        // took the display tracking and the heading read "CancelSave name" (consistency-F31).
        titleEditor={
          editing ? (
            <Cluster gap={2} className="camp-rename">
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
              {/* md: the field's 44px, so the three line up. Cancel first, then the save action: the order of every
                  dialog footer and inline confirm (consistency-F22). */}
              <Cluster gap={2} nowrap>
                <Button type="button" variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
                <Button type="submit" variant="secondary" disabled={!trimmed} loading={save.isPending}>
                  Save name
                </Button>
              </Cluster>
            </Cluster>
          ) : null
        }
        meta={[
          application.company ? (
            application.listing?.source_url ? (
              <a href={application.listing.source_url} target="_blank" rel="noopener noreferrer">{application.company}</a>
            ) : application.company
          ) : null,
        ]}
        actions={
          editing ? undefined : (
            <Cluster gap={2} justify="end">
              <Cluster gap={1}>
                <Tooltip content="Rename application">
                  <Button
                    ref={renameRef}
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
              {stageControl}
            </Cluster>
          )
        }
      />
    </form>
  )
}
