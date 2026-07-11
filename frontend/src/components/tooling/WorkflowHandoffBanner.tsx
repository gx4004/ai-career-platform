import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { isR7ContextCarryEnabled } from '#/lib/flags/featureFlags'
import { readWorkflowContext } from '#/lib/tools/drafts'
import {
  clearCarriedField,
  getCarriedFields,
  type CarriedField,
  type CarriedFieldKey,
} from '#/lib/tools/workflowContext'
import { tools, type ToolId } from '#/lib/tools/registry'
import { cn } from '#/lib/utils'

export function WorkflowHandoffBanner({ toolId }: { toolId: ToolId }) {
  const [sourceId, setSourceId] = useState<ToolId | null>(null)
  const [carriedFields, setCarriedFields] = useState<CarriedField[]>([])
  const transparencyEnabled = isR7ContextCarryEnabled()

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
    setCarriedFields(getCarriedFields(context, toolId))
  }, [toolId])

  const handleClearField = useCallback(
    (key: CarriedFieldKey) => {
      clearCarriedField(key)
      // Re-derive from the freshly written context: clearing one field can
      // neutralise a shared source (e.g. a role that only came from a result),
      // so filtering the clicked key alone could leave a stale chip.
      setCarriedFields(getCarriedFields(readWorkflowContext(), toolId))
    },
    [toolId],
  )

  if (!sourceId) return null
  const sourceTool = tools[sourceId]
  if (!sourceTool) return null

  // R7 #112 dark-ship: with the flag off, the field list is never rendered and
  // the content keeps its legacy class, so the banner is byte-for-byte the
  // pre-R7 single-line indicator.
  const showFields = transparencyEnabled && carriedFields.length > 0

  return (
    <div className="workflow-handoff-banner" role="status" aria-live="polite">
      <div
        className={cn(
          'workflow-handoff-banner-content',
          showFields && 'workflow-handoff-banner-content-detailed',
        )}
      >
        <ArrowRight size={14} className="workflow-handoff-banner-icon" aria-hidden="true" />
        <span className="workflow-handoff-banner-text">
          Carried over from <strong>{sourceTool.label}</strong>
        </span>
        {showFields && (
          <ul className="workflow-handoff-banner-fields">
            {carriedFields.map((field) => (
              <li key={field.key} className="workflow-handoff-banner-field">
                <span className="workflow-handoff-banner-field-label">{field.label}</span>
                <button
                  type="button"
                  className="workflow-handoff-banner-field-clear"
                  onClick={() => handleClearField(field.key)}
                  aria-label={`Clear carried ${field.label.toLowerCase()}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
