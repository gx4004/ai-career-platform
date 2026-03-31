import { useState, type ReactNode } from 'react'
import { CheckCircle2, FilePenLine } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { CinematicLoader } from '#/components/tooling/CinematicLoader'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { useSession } from '#/hooks/useSession'
import { useToolDraft } from '#/hooks/useToolDraft'
import { useToolMutation } from '#/hooks/useToolMutation'
import { useWorkflowBridge } from '#/hooks/useWorkflowBridge'
import { workflowConfigs, validateWorkflowDraft } from '#/lib/tools/workflowConfigs'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { cn } from '#/lib/utils'

export const loadingStagesByTool: Record<ToolId, Array<{ label: string }>> = {
  resume: [
    { label: 'Reading your document...' },
    { label: 'Scanning the resume...' },
    { label: 'Extracting the text...' },
    { label: 'Preparing your analysis...' },
  ],
  'job-match': [
    { label: 'Reading the resume...' },
    { label: 'Comparing against the role...' },
    { label: 'Scoring fit and gaps...' },
    { label: 'Preparing the match view...' },
  ],
  'cover-letter': [
    { label: 'Reading your context...' },
    { label: 'Structuring the letter...' },
    { label: 'Tailoring the draft...' },
    { label: 'Finalizing the letter...' },
  ],
  interview: [
    { label: 'Reading your resume...' },
    { label: 'Shaping interview questions...' },
    { label: 'Drafting answer guidance...' },
    { label: 'Preparing the practice deck...' },
  ],
  career: [
    { label: 'Reading your experience...' },
    { label: 'Mapping possible directions...' },
    { label: 'Comparing role fit...' },
    { label: 'Preparing the path options...' },
  ],
  portfolio: [
    { label: 'Reading your background...' },
    { label: 'Finding proof-building projects...' },
    { label: 'Sequencing the roadmap...' },
    { label: 'Preparing the plan...' },
  ],
}

export function useToolPageState(toolId: ToolId) {
  const tool = tools[toolId]
  const config = workflowConfigs[toolId]
  const { status, openAuthDialog } = useSession()
  const { draft, setDraft, setField } = useToolDraft(toolId, config.defaults)
  const mutation = useToolMutation(tool)
  const bridge = useWorkflowBridge(toolId, draft, setDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({})

  const handleSubmit = () => {
    const nextErrors = validateWorkflowDraft(config, draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    mutation.mutate({ payload: config.buildPayload(draft), draft })
  }

  return {
    tool,
    config,
    status,
    openAuthDialog,
    draft,
    setDraft,
    setField,
    mutation,
    bridge,
    errors,
    handleSubmit,
  }
}

export function ToolPageShell({
  toolId,
  bodyClassName,
  children,
}: {
  toolId: ToolId
  bodyClassName?: string
  children: ReactNode
}) {
  const tool = tools[toolId]

  return (
    <ToolFullScreen accent={tool.accent}>
      <div className={cn('tool-fs-body', bodyClassName)}>{children}</div>
    </ToolFullScreen>
  )
}

export function ToolPageLoading({
  toolId,
  className,
  mutationDone,
  onReady,
}: {
  toolId: ToolId
  className?: string
  /** Whether the data mutation has resolved */
  mutationDone?: boolean
  /** Called when minimum display time has elapsed */
  onReady?: () => void
}) {
  const tool = tools[toolId]

  return (
    <div className={cn('tool-loading-stage', className)}>
      <CinematicLoader
        accent={tool.accent}
        toolId={toolId}
        mutationDone={mutationDone}
        onReady={onReady}
      />
    </div>
  )
}

export function getSeededFieldNote(
  fieldName: 'resumeText' | 'jobDescription' | 'targetRole',
  bridge: {
    seededResume: boolean
    seededJob: boolean
    seededTargetRole: boolean
  },
): string {
  if (fieldName === 'resumeText' && bridge.seededResume) {
    return 'Resume text carried in from your recent workflow.'
  }

  if (fieldName === 'jobDescription' && bridge.seededJob) {
    return 'Job description carried in from your recent workflow.'
  }

  if (fieldName === 'targetRole' && bridge.seededTargetRole) {
    return 'Target role carried in from your recent workflow.'
  }

  return ''
}

export function ParsedResumeNotice({
  body,
  actionLabel,
  onAction,
}: {
  body: string
  actionLabel?: string
  onAction: () => void
}) {
  return (
    <div className="parsed-resume-notice">
      <div className="parsed-resume-notice-copy">
        <CheckCircle2 size={18} />
        <p className="small-copy">{body}</p>
      </div>
      {actionLabel !== '' ? (
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          <FilePenLine size={14} />
          {actionLabel ?? 'Review extracted text'}
        </Button>
      ) : null}
    </div>
  )
}
