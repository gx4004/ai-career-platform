import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, FilePenLine } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { CinematicLoader } from '#/components/tooling/CinematicLoader'
import { GuestSaveBanner } from '#/components/tooling/GuestSaveBanner'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { ToolHeroIllustration } from '#/components/tooling/ToolHeroIllustration'
import { useSession } from '#/hooks/useSession'
import { useToolDraft } from '#/hooks/useToolDraft'
import { useToolMutation } from '#/hooks/useToolMutation'
import { useWorkflowBridge } from '#/hooks/useWorkflowBridge'
import { workflowConfigs, validateWorkflowDraft } from '#/lib/tools/workflowConfigs'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { cn } from '#/lib/utils'

const toolHeroChips: Record<ToolId, string[]> = {
  resume: ['Skills', 'Score', 'Tips'],
  'job-match': ['Fit', 'Keywords', 'Gap'],
  'cover-letter': ['Tone', 'Length', 'Match'],
  interview: ['Questions', 'Difficulty', 'Role'],
  career: ['Steps', 'Timeline', 'Options'],
  portfolio: ['Projects', 'Impact', 'Role'],
}

export function useToolPageState(toolId: ToolId) {
  const tool = tools[toolId]
  const config = workflowConfigs[toolId]
  const { status, openAuthDialog } = useSession()
  const { draft, setDraft, setField } = useToolDraft(toolId, config.defaults)
  const mutation = useToolMutation(tool)
  const bridge = useWorkflowBridge(toolId, draft, setDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({})

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const parentRunId = urlParams?.get('parent_run_id') ?? undefined
  const feedback = urlParams?.get('feedback') ?? undefined

  const handleSubmit = () => {
    const nextErrors = validateWorkflowDraft(config, draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    mutation.mutate({
      payload: config.buildPayload(draft),
      draft,
      parentRunId,
      feedback,
    })
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
  hero,
  children,
}: {
  toolId: ToolId
  bodyClassName?: string
  hero?: ReactNode
  children: ReactNode
}) {
  const tool = tools[toolId]

  return (
    <ToolFullScreen accent={tool.accent} heroFlow={Boolean(hero)}>
      <GuestSaveBanner />
      {hero}
      <div className={cn('tool-fs-body', bodyClassName)}>
        {children}
      </div>
    </ToolFullScreen>
  )
}

export function ToolInputHero({
  toolId,
  subtitle,
}: {
  toolId: ToolId
  subtitle: string
}) {
  const tool = tools[toolId]
  const chips = toolHeroChips[toolId]

  return (
    <div className="tool-input-hero">
      <div className="tool-input-hero-illust">
        <ToolHeroIllustration toolId={toolId} accent={tool.accent} loading={false} />
      </div>
      <h1 className="tool-input-hero-title">{tool.label}</h1>
      <p className="tool-input-hero-subtitle">{subtitle}</p>
      {chips.length > 0 && (
        <div className="tool-input-hero-chips">
          {chips.map((chip) => (
            <span key={chip} className="tool-input-hero-chip">{chip}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ToolStatusInline({
  label,
  onChangeResume,
}: {
  label: string
  onChangeResume?: () => void
}) {
  return (
    <div className="tool-status-inline">
      <span className="tool-status-inline-dot" />
      <span>{label}</span>
      {onChangeResume && (
        <button type="button" className="tool-status-inline-change" onClick={onChangeResume}>
          Change
        </button>
      )}
    </div>
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

export function useResumeEditorCollapse(
  hasResumeContent: boolean,
  initialCollapsed: boolean,
) {
  const [resumeEditorCollapsed, setResumeEditorCollapsed] = useState(initialCollapsed)
  const userOpenedEditorRef = useRef(false)

  useEffect(() => {
    if (!hasResumeContent || userOpenedEditorRef.current) return
    setResumeEditorCollapsed(true)
  }, [hasResumeContent])

  const openResumeEditor = () => {
    userOpenedEditorRef.current = true
    setResumeEditorCollapsed(false)
  }

  const collapseResumeEditor = () => {
    userOpenedEditorRef.current = false
    setResumeEditorCollapsed(true)
  }

  return {
    resumeEditorCollapsed,
    openResumeEditor,
    collapseResumeEditor,
  }
}
