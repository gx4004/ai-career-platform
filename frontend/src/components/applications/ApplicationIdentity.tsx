import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Pin } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { updateHistoryWorkspace } from '#/lib/api/client'
import type { ApplicationDetail } from '#/lib/api/schemas'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { applicationTitle } from './stages'

/**
 * Name and pin for one application (an application is its workspace row, so
 * this is the workspace rename/pin that used to live on History). Quiet
 * icon buttons that sit in the page header next to the stage control.
 */
export function ApplicationIdentity({ application }: { application: ApplicationDetail }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const queryKey = applicationQueryKey(application.id)

  const save = useMutation({
    mutationFn: (payload: { label?: string; is_pinned?: boolean }) =>
      updateHistoryWorkspace(application.id, payload),
    onSuccess: (workspace) => {
      queryClient.setQueryData<ApplicationDetail>(queryKey, (current) =>
        current && { ...current, label: workspace.label ?? null, is_pinned: workspace.is_pinned },
      )
      void invalidateApplications(queryClient)
    },
  })

  const trimmed = draft.trim()
  const pinned = application.is_pinned

  if (editing) {
    return (
      <form
        className="camp-identity"
        onSubmit={(event) => {
          event.preventDefault()
          // An application is never left without a name.
          if (!trimmed) return
          save.mutate({ label: trimmed }, { onSuccess: () => setEditing(false) })
        }}
      >
        <Input
          autoFocus
          aria-label="Application name"
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setEditing(false)
            }
          }}
        />
        <Button type="submit" size="sm" disabled={!trimmed || save.isPending}>
          Save name
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {save.isError ? <p className="camp-alert" role="alert">The name couldn't be saved. Try again.</p> : null}
      </form>
    )
  }

  return (
    <div className="camp-identity">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Rename application"
        title="Rename application"
        onClick={() => {
          save.reset()
          setDraft(applicationTitle(application))
          setEditing(true)
        }}
      >
        <Pencil size={14} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-pressed={pinned}
        aria-label={pinned ? 'Unpin application' : 'Pin application'}
        title={pinned ? 'Unpin application' : 'Pin application'}
        disabled={save.isPending}
        onClick={() => save.mutate({ is_pinned: !pinned })}
      >
        <Pin size={14} fill={pinned ? 'currentColor' : 'none'} aria-hidden="true" />
      </Button>
      {save.isError ? <p className="camp-alert" role="alert">Your change couldn't be saved. Try again.</p> : null}
    </div>
  )
}
