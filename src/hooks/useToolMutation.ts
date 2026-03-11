import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getHistory } from '#/lib/api/client'
import { useSession } from '#/hooks/useSession'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import type { ToolDraftState } from '#/lib/tools/drafts'
import type { ToolDefinition } from '#/lib/tools/registry'

function extractHistoryId(result: Record<string, unknown>): string | null {
  // Canonical key from typed schemas (Phase 1), then legacy fallbacks
  const possibleKeys = ['history_id', 'historyId', 'run_id', 'runId', 'id']

  for (const key of possibleKeys) {
    const value = result[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return null
}

export function useToolMutation(tool: ToolDefinition) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { status } = useSession()

  return useMutation({
    mutationFn: async ({
      payload,
      draft,
    }: {
      payload: Record<string, unknown>
      draft: ToolDraftState
    }) => {
      const result = await tool.submit(payload)
      let historyId = extractHistoryId(result)

      if (!historyId && status === 'authenticated') {
        const latest = await getHistory({
          tool: tool.id,
          page: 1,
          page_size: 1,
        })
        historyId = latest.items[0]?.id || null
      }

      if (!historyId) {
        throw new Error(
          'The backend did not return a history id for this run.',
        )
      }

      writeWorkflowContext({
        historyId,
        lastToolId: tool.id,
        resumeText: draft.resumeText || undefined,
        jobDescription: draft.jobDescription || undefined,
        updatedAt: Date.now(),
      })

      return { historyId, result }
    },
    onSuccess: async ({ historyId }) => {
      await queryClient.invalidateQueries({ queryKey: ['history-page'] })
      await navigate({
        to: tool.resultRoute.replace('$historyId', historyId),
      })
    },
  })
}
