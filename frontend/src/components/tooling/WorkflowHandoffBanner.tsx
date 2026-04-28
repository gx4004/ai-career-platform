import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { readWorkflowContext } from '#/lib/tools/drafts'
import { tools, type ToolId } from '#/lib/tools/registry'

export function WorkflowHandoffBanner({ toolId }: { toolId: ToolId }) {
  const [sourceId, setSourceId] = useState<ToolId | null>(null)

  useEffect(() => {
    const context = readWorkflowContext()
    if (!context) return

    const candidate = context.lastToolId
    if (!candidate || candidate === toolId) return

    const carriedSomething =
      Boolean(context.resumeText) ||
      Boolean(context.jobDescription) ||
      Boolean(context.targetRole) ||
      Boolean(context.selectedTargetRole) ||
      Boolean(context.recommendedDirectionRole) ||
      Boolean(context.recommendedProjectTitle)
    if (!carriedSomething) return

    setSourceId(candidate)
  }, [toolId])

  if (!sourceId) return null
  const sourceTool = tools[sourceId]
  if (!sourceTool) return null

  return (
    <div className="workflow-handoff-banner" role="status" aria-live="polite">
      <div className="workflow-handoff-banner-content">
        <ArrowRight size={14} className="workflow-handoff-banner-icon" aria-hidden="true" />
        <span className="workflow-handoff-banner-text">
          Carried over from <strong>{sourceTool.label}</strong>
        </span>
      </div>
    </div>
  )
}
