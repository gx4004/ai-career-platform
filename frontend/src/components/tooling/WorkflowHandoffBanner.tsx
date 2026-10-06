import { useEffect, useState } from 'react'
import { Notice } from '#/components/kit'
import { readWorkflowContext } from '#/lib/tools/drafts'
import { getResumeCarryText } from '#/lib/tools/resumeCarryStore'
import { tools, type ToolId } from '#/lib/tools/registry'
import { workflowConfigs } from '#/lib/tools/workflowConfigs'
import { getWorkflowTargetRole } from '#/lib/tools/workflowContext'

type Handoff = { sourceId: ToolId; resumeSource?: string }

/**
 * "Carried over from <tool>", only when this form shows something that came along: a resume, a job
 * description or a target role in one of its own fields. Analysis context alone (a Resume Analyzer
 * report behind a Job Match) is not something the user can see here, so it is not announced.
 */
export function WorkflowHandoffBanner({ toolId }: { toolId: ToolId }) {
  const [handoff, setHandoff] = useState<Handoff | null>(null)

  useEffect(() => {
    let context: ReturnType<typeof readWorkflowContext> = null
    let carriedResume = ''
    try {
      context = readWorkflowContext()
      carriedResume = getResumeCarryText()
    } catch {
      return
    }
    if (!context) return

    const candidate = context.lastToolId
    if (!candidate || candidate === toolId) return

    const fields = workflowConfigs[toolId].fields
    const has = (name: string) => fields.some((field) => field.name === name)
    // The same rules the form's own seeding follows (useWorkflowBridge, ResumeSource).
    const resume = has('resumeText') && Boolean((context.resumeText || carriedResume).trim())
    const job = has('jobDescription') && toolId !== 'career' && toolId !== 'portfolio' && Boolean(context.jobDescription?.trim())
    const role = has('targetRole') && Boolean(getWorkflowTargetRole(context))
    if (!resume && !job && !role) return

    setHandoff({
      sourceId: candidate,
      // A resume found in the account (a cold result's "What next") is named for where it came from.
      resumeSource: resume && context.resumeText && context.resumeSource ? context.resumeSource : undefined,
    })
  }, [toolId])

  if (!handoff) return null
  const sourceTool = tools[handoff.sourceId]
  if (!sourceTool) return null

  return (
    <Notice>
      Carried over from <strong>{sourceTool.label}</strong>
      {handoff.resumeSource ? `, with ${handoff.resumeSource} as the resume` : null}
    </Notice>
  )
}
