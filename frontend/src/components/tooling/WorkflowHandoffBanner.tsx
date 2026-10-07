import { useEffect, useState } from 'react'
import { Badge, Cluster, Notice, Stack } from '#/components/kit'
import { readWorkflowContext } from '#/lib/tools/drafts'
import { isSampleResume } from '#/components/tooling/sampleResume'
import { getResumeCarryFilename, getResumeCarryOrigin, getResumeCarryText } from '#/lib/tools/resumeCarryStore'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { workflowConfigs } from '#/lib/tools/workflowConfigs'
import { carryOriginLabel, getWorkflowTargetRole } from '#/lib/tools/workflowContext'

/**
 * "Carried over" with one quiet badge per value this form shows that came along: "Resume from Resume Analyzer",
 * "Job from Job Match". Each names where that value was supplied (recorded when it was first written), never simply
 * the tool that ran last, and a value supplied on this very page is not announced here. Analysis context alone (a
 * Resume Analyzer report behind a Job Match) is not something the user can see on the form, so it is not announced.
 * Neither is a resume whose row already names where it came from, and nothing is said during a Re-generate, whose own
 * note lists what was filled in (sign-off tool-inputs-F31).
 */
function joinWords(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The tool whose saved result's What next opened this page (`?from=resume`), when it is one. */
function openedFrom(): ToolId | null {
  const params = new URLSearchParams(window.location.search)
  const from = params.get('from')
  return from && from in tools ? (from as ToolId) : null
}

export function WorkflowHandoffBanner({ toolId }: { toolId: ToolId }) {
  const [items, setItems] = useState<string[]>([])
  // Opened from a saved result that could not carry everything: which result, and what is still to add.
  const [fromNote, setFromNote] = useState<{ from: ToolId; missing: string[] } | null>(null)

  useEffect(() => {
    // A Re-generate's own note says what was filled in and from where: a second lemon notice above it said the same.
    if (new URLSearchParams(window.location.search).has('parent_run_id')) return
    let context: ReturnType<typeof readWorkflowContext> = null
    let carriedResume = ''
    let carriedOrigin = ''
    let carriedName = ''
    try {
      context = readWorkflowContext()
      carriedResume = getResumeCarryText()
      carriedOrigin = getResumeCarryOrigin()
      carriedName = getResumeCarryFilename()
    } catch {
      return
    }
    const fields = workflowConfigs[toolId].fields
    const has = (name: string) => fields.some((field) => field.name === name)

    // Runs don't keep their inputs: a result opened cold (a new tab, a shared link) hands on only what the
    // account still had, so the page says why a field is empty, as a Re-generate does.
    const from = openedFrom()
    if (from) {
      const missing: string[] = []
      if (has('resumeText') && !context?.resumeText?.trim() && !carriedResume.trim()) missing.push('your resume')
      if (fields.some((field) => field.name === 'jobDescription' && field.required) && !context?.jobDescription?.trim()) {
        missing.push(context?.jobLabel ? `the job description for ${context.jobLabel}` : 'the job description')
      }
      if (has('targetRole') && !getWorkflowTargetRole(context)) missing.push('a target role')
      setFromNote(missing.length > 0 ? { from, missing } : null)
    }
    if (!context && !carriedResume) return

    const next: string[] = []
    // An application that handed its job here ("Prep for the round") is named, so the first line on the page says
    // which one: "Job from Senior Backend Engineer at Northwind Labs" (the same label the job field's note uses).
    const application = context?.workspaceId ? context.workspaceLabel?.trim() || undefined : undefined
    // "Job from Job Match"; the plain noun when the source is not known; nothing when it was supplied on this page.
    const add = (noun: string, bare: string, origin: string | undefined, source?: string) => {
      if (origin === toolId) return
      const from = origin === 'application' && application ? application : carryOriginLabel(origin)
      next.push(source ? `${noun}: ${source}` : from ? `${noun} from ${from}` : bare)
    }

    // The same rules the form's own seeding follows (useWorkflowBridge first, then ResumeSource's tab carry).
    if (has('resumeText')) {
      const resume = context?.resumeText?.trim() ? context.resumeText : carriedResume
      // The resume row right under this notice names a carried resume by where it came from ("Resume from Resume
      // Analyzer", the CV's name): a chip saying it again only pushed the form down. The chip stays where the row shows
      // something else (the file name, or "Sample resume").
      const rowNamesSource = !isSampleResume(resume) && !(carriedName && resume === carriedResume)
      if (!resume.trim() || rowNamesSource) {
        /* nothing to add */
      } else if (context?.resumeText?.trim()) {
        // A resume found in the account keeps its own name ("your CV Studio CV “Platform CV”").
        add('Resume', 'Resume', context.resumeOrigin, context.resumeSource)
      } else add('Resume', 'Resume', carriedOrigin || undefined)
    }
    if (has('jobDescription') && toolId !== 'career' && toolId !== 'portfolio' && context?.jobDescription?.trim()) {
      add('Job', 'Job description', context.jobOrigin)
    }
    if (has('targetRole') && getWorkflowTargetRole(context)) add('Target role', 'Target role', context?.roleOrigin)
    setItems(next)
  }, [toolId])

  if (items.length === 0 && !fromNote) return null

  const carried =
    items.length > 0 ? (
      <Cluster gap={2}>
        <span>Carried over</span>
        {items.map((item) => (
          <Badge key={item} tone="info" wrap>
            {item}
          </Badge>
        ))}
      </Cluster>
    ) : null

  return (
    <Notice>
      {fromNote ? (
        <Stack gap={2}>
          {carried}
          <div>
            Opened from your {tools[fromNote.from].label} result. Runs don’t keep their inputs, so add{' '}
            {joinWords(fromNote.missing)} below.
          </div>
        </Stack>
      ) : (
        carried
      )}
    </Notice>
  )
}
