import { useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getHistory } from '#/lib/api/client'
import { useSession } from '#/hooks/useSession'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import type { ToolDraftState } from '#/lib/tools/drafts'
import { setTransientResult } from '#/lib/tools/demoRuns'
import { trackTelemetry } from '#/lib/telemetry/client'
import { getApplicationHandoffPayload } from '#/lib/tools/applicationHandoff'
import type { ToolDefinition } from '#/lib/tools/registry'
import {
  buildWorkspaceRequestContext,
  deriveWorkflowUpdateFromResult,
} from '#/lib/tools/workflowContext'

function extractHistoryId(result: Record<string, unknown>): string | null {
  const value = result.history_id
  return typeof value === 'string' && value.trim() ? value : null
}

export function useToolMutation(tool: ToolDefinition) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status, openAuthDialog } = useSession()
  const abortRef = useRef<AbortController | null>(null)

  // Abort in-flight request on tab close / visibility change
  const handleUnload = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return useMutation({
    mutationFn: async ({
      payload,
      draft,
      parentRunId,
      feedback,
    }: {
      payload: Record<string, unknown>
      draft: ToolDraftState
      parentRunId?: string
      feedback?: string
    }) => {
      const accessMode = status === 'authenticated' ? 'authenticated' : 'guest_demo'

      if (tool.authRequiredToRun && status !== 'authenticated') {
        openAuthDialog({
          to: tool.route,
          reason: `${tool.shortLabel.toLowerCase()}-run`,
          label: 'Sign in to run this tool',
        })
        throw new Error('Sign in to run this tool.')
      }

      // Set up AbortController for orphan request handling
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      window.addEventListener('beforeunload', handleUnload)
      document.addEventListener('visibilitychange', handleUnload)

      trackTelemetry({
        event_name: 'tool_run_started',
        tool_id: tool.id,
        access_mode: accessMode,
      })

      const workflowContext = readWorkflowContext()
      const handoffPayload =
        tool.id === 'cover-letter' || tool.id === 'interview'
          ? getApplicationHandoffPayload(workflowContext)
          : {}
      let result: Record<string, unknown>

      try {
        result = await tool.submit({
          ...payload,
          ...handoffPayload,
          ...buildWorkspaceRequestContext(workflowContext),
          ...(parentRunId ? { parent_run_id: parentRunId } : {}),
          ...(feedback ? { feedback } : {}),
        })
      } catch (error) {
        trackTelemetry({
          event_name: 'tool_run_failed',
          tool_id: tool.id,
          access_mode: accessMode,
          level: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown tool run failure.',
        })
        throw error
      } finally {
        window.removeEventListener('beforeunload', handleUnload)
        document.removeEventListener('visibilitychange', handleUnload)
        abortRef.current = null
      }

      let historyId = extractHistoryId(result)
      let saved = typeof result.saved === 'boolean' ? result.saved : Boolean(historyId)

      if (!historyId && saved && status === 'authenticated') {
        const latest = await getHistory({
          tool: tool.id,
          page: 1,
          page_size: 1,
        })
        historyId = latest.items[0]?.id || null
      }

      if (!historyId) {
        const demoItem = setTransientResult(tool.id, result)
        historyId = demoItem.id
        saved = false
      }

      writeWorkflowContext({
        historyId,
        lastToolId: tool.id,
        resumeText: draft.resumeText || undefined,
        jobDescription: draft.jobDescription || undefined,
        targetRole: draft.targetRole || undefined,
        selectedTargetRole: draft.targetRole || undefined,
        linkedContextIds: [],
        ...deriveWorkflowUpdateFromResult(tool.id, result),
        updatedAt: Date.now(),
      })

      if (feedback) {
        trackTelemetry({
          event_name: 'tool_regenerate',
          tool_id: tool.id,
          access_mode: saved ? 'authenticated' : 'guest_demo',
          metadata: { has_feedback: Boolean(feedback) },
        })
      }

      trackTelemetry({
        event_name: 'tool_run_succeeded',
        tool_id: tool.id,
        access_mode: saved ? 'authenticated' : 'guest_demo',
        history_id: historyId,
        saved,
      })

      return { historyId, result, saved }
    },
    onSuccess: async ({ historyId, saved }) => {
      if (saved) {
        await queryClient.invalidateQueries({ queryKey: ['history-page'] })
        await queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
      }
      await navigate({
        to: tool.resultRoute.replace('$historyId', historyId),
      })
    },
  })
}
