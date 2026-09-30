import { useState, type ReactNode } from 'react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { CinematicLoader } from '#/components/tooling/CinematicLoader'
import { GuestSaveBanner } from '#/components/tooling/GuestSaveBanner'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { WorkflowHandoffBanner } from '#/components/tooling/WorkflowHandoffBanner'
import { useSession } from '#/hooks/useSession'
import { useToolDraft } from '#/hooks/useToolDraft'
import { useToolMutation } from '#/hooks/useToolMutation'
import { useWorkflowBridge } from '#/hooks/useWorkflowBridge'
import { workflowConfigs, validateWorkflowDraft } from '#/lib/tools/workflowConfigs'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'

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
  hero,
  children,
}: {
  toolId: ToolId
  hero?: ReactNode
  children: ReactNode
}) {
  const tool = tools[toolId]

  return (
    <ToolFullScreen accent={tool.accent} heroFlow={Boolean(hero)}>
      {hero}
      <div className="tool-page-body">
        <GuestSaveBanner />
        <WorkflowHandoffBanner toolId={toolId} />
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
    <header className="page-header page-header--tool">
      <div className="page-header__text">
        <h1 className="page-header__title">{tool.label}</h1>
        <p className="page-header__purpose">{subtitle}</p>
        {chips.length > 0 && (
          <ul className="page-header__meta">
            {chips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        )}
      </div>
    </header>
  )
}

export function ToolPageLoading({
  toolId,
  mutationDone,
  onReady,
}: {
  toolId: ToolId
  /** Whether the data mutation has resolved */
  mutationDone?: boolean
  /** Called when minimum display time has elapsed */
  onReady?: () => void
}) {
  const { status } = useSession()

  return (
    <div className="tool-loading">
      <CinematicLoader
        toolId={toolId}
        mutationDone={mutationDone}
        onReady={onReady}
        accessMode={status === 'authenticated' ? 'authenticated' : 'guest_demo'}
      />
    </div>
  )
}

/** A labelled form field: label above, optional note, control, error below. */
export function ToolField({
  htmlFor,
  label,
  meta,
  note,
  error,
  children,
}: {
  htmlFor?: string
  label: string
  meta?: string
  note?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="tool-field">
      <div className="tool-field-head">
        <Label className="tool-field-label" htmlFor={htmlFor}>
          <span>{label}</span>
          {meta ? <span className="tool-field-meta">{meta}</span> : null}
        </Label>
      </div>
      {note ? <p className="tool-field-note">{note}</p> : null}
      {children}
      {error ? <p className="tool-field-error">{error}</p> : null}
    </div>
  )
}

/** Single primary submit, bottom-left, with the run error above it. */
export function ToolSubmitRow({
  label,
  error,
  pending,
}: {
  label: string
  error?: unknown
  pending?: boolean
}) {
  return (
    <div className="tool-submit-row">
      {error ? (
        <p className="tool-field-error">
          {error instanceof Error ? error.message : 'This run failed.'}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {label}
      </Button>
    </div>
  )
}

/** Small segmented picker for short option lists (tone, question count). */
export function ToolSegmented<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string
  options: Array<{ value: T; label: string; ariaLabel?: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="tool-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-label={option.ariaLabel}
          aria-pressed={value === option.value}
          className="tool-segmented-option"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
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
