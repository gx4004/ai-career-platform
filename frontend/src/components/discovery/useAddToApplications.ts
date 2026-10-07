import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '#/components/kit'
import { deleteApplication } from '#/lib/api/client'
import type { ApplicationDetail } from '#/lib/api/schemas'
import { invalidateApplications } from '#/lib/query/applicationCaches'

type Announce = {
  /**
   * This Add created the application (the adopt call answered 201). Only then is Undo offered: the call is
   * idempotent, and an application that already existed (added from another tab or page, perhaps minutes ago, with
   * tasks and notes since) comes back unchanged with 200; that one is not this toast's to delete.
   */
  created: boolean
  /** The Undo deleted the application: put the job back as it was on this page (the row, its Add button). */
  onUndone?: () => void
}

/**
 * The one "Added to your applications" toast, for every Add of a job (the dashboard's matches, Discover's rows and
 * its drawer). The person stays where they are, so several jobs can be added in a row; the toast offers the
 * application and, for an application this Add created, Undo. `toastId` keeps one toast per page: a run of adds
 * replaces it rather than stacking one per add, and its Undo is always for the latest add.
 */
export function useAddToApplicationsToast(toastId: string) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useCallback(
    (application: ApplicationDetail, { created, onUndone }: Announce) => {
      const open = () => navigate({ to: '/campaigns/$campaignId', params: { campaignId: application.id } })
      const undo = async () => {
        try {
          await deleteApplication(application.id)
        } catch {
          toast({
            id: toastId,
            tone: 'danger',
            title: 'That job could not be removed',
            description: 'It is still in your applications.',
            action: { label: 'Open application', onClick: open },
          })
          return
        }
        onUndone?.()
        void invalidateApplications(queryClient)
        toast({ id: toastId, title: 'Removed from your applications', description: application.title ?? undefined })
      }
      toast({
        id: toastId,
        tone: 'success',
        title: 'Added to your applications',
        description: application.title ?? undefined,
        action: { label: 'View application', onClick: open },
        secondaryAction: created ? { label: 'Undo', onClick: () => void undo() } : undefined,
      })
    },
    [navigate, queryClient, toast, toastId],
  )
}
