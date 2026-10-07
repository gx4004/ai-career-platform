import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getHistory } from '#/lib/api/client'
import { boundedIdentifierSchema } from '#/lib/api/schemas'
import { useSession } from '#/hooks/useSession'
import { useToast } from '#/components/kit'
import { markRevealPending } from '#/hooks/use-reveal-once'
import { readWorkflowContext, writeWorkflowContext } from '#/lib/tools/drafts'
import type { ToolDraftState } from '#/lib/tools/drafts'
import { setTransientResult } from '#/lib/tools/demoRuns'
import { deriveRunMetadata } from '#/lib/tools/runMetadata'
import { trackTelemetry } from '#/lib/telemetry/client'
import { getApplicationHandoffPayload } from '#/lib/tools/applicationHandoff'
import { getToolRunError } from '#/lib/tools/runErrors'
import type { ToolDefinition } from '#/lib/tools/registry'
import { workflowConfigs } from '#/lib/tools/workflowConfigs'
import {
  buildWorkspaceRequestContext,
  deriveWorkflowUpdateFromResult,
  originsAfterRun,
} from '#/lib/tools/workflowContext'
import { getResumeCarryOrigin, getResumeCarryText } from '#/lib/tools/resumeCarryStore'
// Note: `authRequiredToRun` on ToolDefinition is retained for future premium
// gating but currently `false` for every registered tool; the runtime gate
// that used to live here has been removed as unreachable.

function extractHistoryId(result: Record<string, unknown>): string | null {
  const value = result.history_id
  return typeof value === 'string' && value.trim() ? value : null
}

export function useToolMutation(tool: ToolDefinition) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status } = useSession()
  const { toast } = useToast()
  const abortRef = useRef<AbortController | null>(null)
  // Keep a ref so the async mutationFn always reads the latest session status
  const statusRef = useRef(status)
  statusRef.current = status
  // A run outlives its page (onSuccess below still fires after unmount): only a page that is still open moves to the result.
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Abort the in-flight request when the page is really left (not when the tab is merely hidden: a long run must survive a tab switch).
  const handleUnload = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const mutation = useMutation({
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
      // Preload the result page chunk while the LLM call runs (15-60s)
      void import('#/pages/tool-result-pages').catch(() => {})

      const currentStatus = statusRef.current
      const accessMode = currentStatus === 'authenticated' ? 'authenticated' : 'guest_demo'

      // Set up AbortController for orphan request handling
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      window.addEventListener('pagehide', handleUnload)

      trackTelemetry({
        event_name: 'tool_run_started',
        tool_id: tool.id,
        access_mode: accessMode,
      })

      let result: Record<string, unknown>

      try {
        const workflowContext = readWorkflowContext()
        const handoffPayload =
          tool.id === 'cover-letter' || tool.id === 'interview'
            ? getApplicationHandoffPayload(workflowContext)
            : {}
        const validatedParentRunId = parentRunId
          ? boundedIdentifierSchema.parse(parentRunId)
          : undefined
        result = await tool.submit(
          {
            ...payload,
            ...handoffPayload,
            ...buildWorkspaceRequestContext(workflowContext),
            ...(validatedParentRunId ? { parent_run_id: validatedParentRunId } : {}),
            ...(feedback ? { feedback } : {}),
          },
          { signal: controller.signal },
        )
      } catch (error) {
        // Cancelled by the user: not a failure to report.
        if (controller.signal.aborted) throw error
        trackTelemetry({
          event_name: 'tool_run_failed',
          tool_id: tool.id,
          access_mode: accessMode,
          level: 'error',
          failure_category: 'tool_request_failed',
        })
        throw getToolRunError(tool, error)
      } finally {
        window.removeEventListener('pagehide', handleUnload)
        if (abortRef.current === controller) abortRef.current = null
      }

      let historyId = extractHistoryId(result)
      let saved = typeof result.saved === 'boolean' ? result.saved : Boolean(historyId)

      if (!historyId && saved && statusRef.current === 'authenticated') {
        const latest = await getHistory({
          tool: tool.id,
          page: 1,
          page_size: 1,
        })
        historyId = latest.items[0]?.id || null
      }

      if (!historyId) {
        const demoItem = setTransientResult(tool.id, result, parentRunId)
        historyId = demoItem.id
        saved = false
      }

      // Only the fields this tool has: Career Path (no job description) must not wipe the one Job Match carried.
      // A field the tool has but was left empty is cleared on purpose.
      const has = (name: keyof ToolDraftState) => workflowConfigs[tool.id].fields.some((field) => field.name === name)
      const previous = readWorkflowContext()
      const update = {
        historyId,
        lastToolId: tool.id,
        ...(has('resumeText') ? { resumeText: draft.resumeText || undefined } : {}),
        ...(has('jobDescription') ? { jobDescription: draft.jobDescription || undefined } : {}),
        ...(has('targetRole')
          ? { targetRole: draft.targetRole || undefined, selectedTargetRole: draft.targetRole || undefined }
          : {}),
        linkedContextIds: [],
        regenFeedback: undefined,
        ...deriveWorkflowUpdateFromResult(tool.id, result),
        updatedAt: Date.now(),
      }
      writeWorkflowContext({
        ...update,
        // Where each value was supplied, not just where it was last run: the next tool's banner credits the right place.
        // A Re-generate's "found in your account" label is kept only while the run used that same text.
        ...originsAfterRun(tool.id, previous, update, { text: getResumeCarryText(), origin: getResumeCarryOrigin() }),
      })

      if (feedback) {
        trackTelemetry({
          event_name: 'tool_regenerate',
          tool_id: tool.id,
          access_mode: saved ? 'authenticated' : 'guest_demo',
          has_feedback: Boolean(feedback),
        })
      }

      trackTelemetry({
        event_name: 'tool_run_succeeded',
        tool_id: tool.id,
        access_mode: saved ? 'authenticated' : 'guest_demo',
        saved,
      })

      return { historyId, result, saved }
    },
    onSuccess: ({ historyId, result, saved }, variables) => {
      // Synchronously populate the query cache with a complete ToolRunDetail shape
      queryClient.setQueryData(['tool-run', historyId], {
        id: historyId,
        tool_name: tool.id,
        label: tool.shortLabel,
        is_favorite: false,
        saved,
        access_mode: saved ? 'authenticated' : 'guest_demo',
        locked_actions: saved ? [] : ['save', 'favorite', 'continue', 'history'],
        parent_run_id: variables.parentRunId ?? null,
        metadata: deriveRunMetadata(tool.id, result),
        workspace: null,
        result_payload: result,
        created_at: new Date().toISOString(),
      })

      // The result page plays the stamp-in reveal once for a run that has just finished (guest results too).
      markRevealPending(historyId)

      const resultHref = tool.resultRoute.replace('$historyId', historyId)
      if (mountedRef.current || window.location.pathname === tool.route) {
        // Navigate synchronously — do NOT await. This ensures navigation is
        // queued in the same microtask as the cache set, before React re-renders
        // the tool page (which would briefly flash the form).
        void navigate({ to: resultHref })
      } else {
        // The user moved on while it ran: leave them where they are and offer the result.
        toast({
          id: `tool-result-${tool.id}`,
          tone: 'success',
          title: `Your ${tool.label} result is ready`,
          action: { label: 'View result', onClick: () => void navigate({ to: resultHref }) },
        })
      }

      // Fire-and-forget cache invalidation AFTER navigation is queued
      if (saved) {
        void queryClient.invalidateQueries({ queryKey: ['history-page'] })
        void queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
      }
    },
  })

  const { reset } = mutation
  /** Stop the run and go back to the filled form (the draft is untouched). */
  const cancel = useCallback(() => {
    abortRef.current?.abort()
    reset()
  }, [reset])

  return { ...mutation, cancel }
}
