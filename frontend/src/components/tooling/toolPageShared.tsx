import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  List,
  Notice,
  NumberDisc,
  Page,
  PageHeader,
  Panel,
  PanelBody,
  Row,
  RowBody,
  RowMeta,
  RowSubtitle,
  RowTitle,
  Section,
  Skeleton,
  Split,
  Stack,
  ToolTile,
} from '#/components/kit'
import { CinematicLoader } from '#/components/tooling/CinematicLoader'
import { GuestSaveBanner } from '#/components/tooling/GuestSaveBanner'
import { WorkflowHandoffBanner } from '#/components/tooling/WorkflowHandoffBanner'
import { rememberResume } from '#/components/tooling/sampleResume'
import { useHistory } from '#/hooks/useHistory'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'
import { useSession } from '#/hooks/useSession'
import { readRegenFeedback, readWorkflowContext } from '#/lib/tools/drafts'
import { getResumeCarryText } from '#/lib/tools/resumeCarryStore'
import { getWorkflowTargetRole } from '#/lib/tools/workflowContext'
import { historyRunHref } from '#/lib/tools/historyToolLabel'
import { formatRunDate, splitScore } from '#/lib/tools/runLabel'
import { useToolDraft } from '#/hooks/useToolDraft'
import { useToolMutation } from '#/hooks/useToolMutation'
import { useWorkflowBridge } from '#/hooks/useWorkflowBridge'
import { workflowConfigs, validateWorkflowDraft } from '#/lib/tools/workflowConfigs'
import { tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'

/** After a failed submit, move focus to the first field the errors are about (they render on the next frame). */
function focusFirstInvalidField() {
  requestAnimationFrame(() => {
    const invalid = document.querySelector<HTMLElement>(
      'form [aria-invalid="true"], form [data-invalid] :is(input:not([type="file"]), textarea, select, button)',
    )
    invalid?.focus()
  })
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

  const handleSubmit = () => {
    const feedback = readRegenFeedback(parentRunId)
    const nextErrors = validateWorkflowDraft(config, draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField()
      return
    }
    // A resume pasted or carried in (not only an uploaded one) stays available to Evidence Profile import and the other tools.
    rememberResume(String(draft.resumeText ?? ''))
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

/** The input form's height at submit, per tool: the working panel takes the same room, so the page does not jump while a run is in flight. */
const formHeights: Partial<Record<ToolId, number>> = {}

/** Set by the working panel's Cancel, so keyboard and screen-reader focus lands on the form's submit button, not <body>. */
let focusSubmitAfterCancel: ToolId | null = null

type RegenNote = { feedback: string | null; filled: string[]; missing: string[] }

function joinWords(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * "Regenerating with: <feedback>" when this page was opened from a result's Re-generate: what was filled in
 * (and from where) and, in one line, what still has to be provided. Runs do not keep their inputs, so a
 * result opened in a new tab carries only what the Re-generate could find in the account.
 * Read after mount: the server render has no query string and the carry lives in the tab's session storage.
 */
function RegenerateNote({ toolId }: { toolId: ToolId }) {
  const [note, setNote] = useState<RegenNote | null>(null)
  useEffect(() => {
    const parentRunId = new URLSearchParams(window.location.search).get('parent_run_id')
    if (!parentRunId) return
    const fields = workflowConfigs[toolId].fields
    const needsResume = fields.some((field) => field.name === 'resumeText')
    const needsJob = fields.some((field) => field.name === 'jobDescription' && field.required)
    const needsRole = fields.some((field) => field.name === 'targetRole')
    let context: ReturnType<typeof readWorkflowContext> = null
    let carried = ''
    try {
      context = readWorkflowContext()
      carried = getResumeCarryText()
    } catch {
      /* storage unavailable: treat as nothing carried */
    }
    const resume = (context?.resumeText || carried).trim()
    const job = (context?.jobDescription ?? '').trim()
    const role = needsRole ? getWorkflowTargetRole(context) : undefined
    const filled: string[] = []
    const missing: string[] = []
    if (needsResume) {
      if (resume) filled.push(context?.resumeSource && context.resumeText ? context.resumeSource : 'your resume from this tab')
      else missing.push('your resume')
    }
    if (needsJob) {
      if (job) filled.push(context?.jobSource ?? 'the job description from this tab')
      else missing.push(context?.jobLabel ? `the job description for ${context.jobLabel}` : 'the job description')
    }
    if (needsRole) {
      if (role) filled.push('the target role')
      else missing.push('a target role')
    }
    setNote({ feedback: readRegenFeedback(parentRunId) ?? null, filled, missing })
  }, [toolId])
  if (!note) return null
  return (
    <Notice>
      {note.feedback ? (
        <>
          Regenerating with: <strong>{note.feedback}</strong>
          {/[.!?]$/.test(note.feedback) ? '' : '.'}
        </>
      ) : (
        'Regenerating from an earlier run.'
      )}
      {note.filled.length > 0 ? ` Filled in: ${joinWords(note.filled)}.` : null}
      {note.missing.length > 0
        ? ` Runs don’t keep their inputs, so add ${joinWords(note.missing)} below.`
        : ' Change anything below, then run it again.'}
    </Notice>
  )
}

/**
 * A tool input page: the compact header, then the form column (notices, then the form or the working panel)
 * beside a rail with the user's recent runs of this tool and what the tool gives back. Side by side when the
 * content is at least 56rem wide (Split asks its own width); below that the rail follows the form.
 */
export function ToolPageShell({
  toolId,
  children,
}: {
  toolId: ToolId
  children: ReactNode
}) {
  const tool = tools[toolId]

  return (
    <Page>
      <PageHeader
        title={tool.label}
        lead={tool.summary}
        mark={<ToolTile tone={tool.tone} icon={tool.icon} size="lg" />}
      />
      <Split
        className="tool-split"
        railLabel={`About ${tool.label}`}
        rail={
          <>
            <RecentToolRuns toolId={toolId} />
            <WhatYouGet toolId={toolId} />
          </>
        }
      >
        <div className="tool-notices">
          <GuestSaveBanner />
          <WorkflowHandoffBanner toolId={toolId} />
          <RegenerateNote toolId={toolId} />
        </div>
        {children}
      </Split>
    </Page>
  )
}

/** What the result page gives back, in the order it shows it: three plain lines from the registry. */
export function WhatYouGet({ toolId }: { toolId: ToolId }) {
  const tool = tools[toolId]
  return (
    <Section id="what-you-get" title="What you get">
      <ol className="tool-delivers" aria-labelledby="what-you-get-heading">
        {tool.delivers.map((line, index) => (
          <li key={line} className="tool-delivers__item">
            <span className="tool-delivers__mark">
              <NumberDisc n={index + 1} size="sm" />
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** Two runs can carry the same label: say what each one was about (role and company, or its headline). */
function aboutOf(item: {
  workspace?: { role?: string | null; company?: string | null } | null
  metadata?: { summary_headline?: string | null } | null
}) {
  return (
    [item.workspace?.role, item.workspace?.company].filter(Boolean).join(' at ') ||
    item.metadata?.summary_headline ||
    ''
  )
}

/** "9:41 AM", or "9:41:12 AM" when a run it could be mistaken for started in the same minute. */
function timeOf(createdAt: string, peers: { created_at: string }[]) {
  const minute = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const sameMinute = peers.filter((other) => other.created_at.slice(0, 16) === createdAt.slice(0, 16)).length > 1
  return sameMinute
    ? new Date(createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : minute(createdAt)
}

/** The last few saved runs of this tool, so the page opens with the user's own data. */
export function RecentToolRuns({ toolId }: { toolId: ToolId }) {
  const { status } = useSession()
  const query = useHistory({ tool: toolId, page: 1, page_size: 3 }, status === 'authenticated')
  const items = query.data?.items ?? []
  // Two runs that would read the same (label, subject, day) also show their time, so they can be told apart.
  const rowKey = (item: (typeof items)[number]) =>
    [item.label, aboutOf(item), formatRunDate(item.created_at)].join('|')
  const seen = new Map<string, number>()
  for (const item of items) seen.set(rowKey(item), (seen.get(rowKey(item)) ?? 0) + 1)

  if (status !== 'authenticated') return null

  return (
    <Section
      id="recent-runs"
      title="Recent runs"
      actions={
        query.isPending || query.isError || items.length === 0 ? null : (
          <Button asChild variant="link" size="sm">
            {/* The visible words lead the name, which says where it goes when read out of context. */}
            <Link to="/history" search={{ tool: toolId }} aria-label={`View all ${tools[toolId].label} runs in History`}>
              View all
            </Link>
          </Button>
        )
      }
    >
      {query.isError ? (
        <ErrorState
          size="inline"
          title="Recent runs couldn't be loaded"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : !query.isPending && items.length === 0 ? (
        // Signed in, nothing run yet: the section stays (no skeleton that then vanishes) and says what will appear.
        <EmptyState size="inline" title="No runs yet" description={`Your ${tools[toolId].label} results will be listed here.`} />
      ) : (
        <List aria-labelledby="recent-runs-heading" aria-busy={query.isPending || undefined}>
          {query.isPending ? (
            <Skeleton variant="row" as="li" count={3} />
          ) : (
            items.map((item) => {
              const href = historyRunHref(item)
              const { name, score } = splitScore(item.label || 'Untitled run')
              const about = aboutOf(item)
              const date = formatRunDate(item.created_at)
              const time =
                (seen.get(rowKey(item)) ?? 0) > 1
                  ? timeOf(item.created_at, items.filter((other) => rowKey(other) === rowKey(item)))
                  : ''
              const detailsId = `recent-run-${item.id}`
              return (
                <Row key={item.id} overflow="truncate">
                  <RowBody>
                    {/* Several runs share a name ("Job Match"): the date, subject and score describe each link. */}
                    {href ? (
                      <RowTitle asChild>
                        <Link to={href} aria-describedby={detailsId}>
                          {name}
                        </Link>
                      </RowTitle>
                    ) : (
                      <RowTitle>{name}</RowTitle>
                    )}
                    {/* Plain text, date first: in the narrow rail the subject is what gets cut, with a clean ellipsis. */}
                    <RowSubtitle id={detailsId} title={about || undefined}>
                      {[time ? `${date}, ${time}` : date, about].filter(Boolean).join(' · ')}
                      {/* The pill is decorative to assistive tech; the score is read here, with the link's description. */}
                      {score ? <span className="kit-sr-only">, score {score}</span> : null}
                    </RowSubtitle>
                  </RowBody>
                  {score ? (
                    <RowMeta aria-hidden="true">
                      <Badge tone={tools[toolId].tone} score>
                        {score}
                      </Badge>
                    </RowMeta>
                  ) : null}
                </Row>
              )
            })
          )}
        </List>
      )}
    </Section>
  )
}

/** The working panel: takes the form's footprint (same Panel, same height) while a run is in flight. */
export function ToolPageLoading({
  toolId,
  mutationDone,
  onReady,
  onCancel,
}: {
  toolId: ToolId
  /** Whether the data mutation has resolved */
  mutationDone?: boolean
  /** Called when minimum display time has elapsed */
  onReady?: () => void
  /** Stops the run and returns to the filled form. */
  onCancel?: () => void
}) {
  const { status } = useSession()
  const height = formHeights[toolId]
  const panelRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = usePrefersReducedMotion()

  // Submitting from the foot of a long form (a phone) leaves the panel's status and track above the viewport: bring its top into view.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel || panel.getBoundingClientRect().top >= 0) return
    panel.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the panel takes the form's place
  }, [])

  return (
    <Panel ref={panelRef} className="tool-loading" style={height ? { minBlockSize: `${Math.round(height)}px` } : undefined}>
      <PanelBody className="tool-loading__body">
        <CinematicLoader
          toolId={toolId}
          mutationDone={mutationDone}
          onReady={onReady}
          accessMode={status === 'authenticated' ? 'authenticated' : 'guest_demo'}
        />
        {onCancel ? (
          <div className="tool-loading__cancel">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                // Cancel unmounts with this panel: the form that takes its place picks the focus up (see ToolForm).
                focusSubmitAfterCancel = toolId
                onCancel()
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  )
}

/** The input form: one white Panel with its fields, then the run error (if any) and the one submit button. */
export function ToolForm({
  toolId,
  label,
  onSubmit,
  submitLabel,
  error,
  pending,
  children,
}: {
  toolId: ToolId
  label: string
  onSubmit: () => void
  submitLabel: string
  error?: unknown
  pending?: boolean
  children: ReactNode
}) {
  const formRef = useRef<HTMLFormElement | null>(null)
  useEffect(() => {
    if (focusSubmitAfterCancel !== toolId) return
    focusSubmitAfterCancel = null
    formRef.current?.querySelector<HTMLElement>('button[type="submit"]')?.focus()
  }, [toolId])
  return (
    <form
      ref={formRef}
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault()
        formHeights[toolId] = event.currentTarget.getBoundingClientRect().height
        onSubmit()
      }}
    >
      <Panel>
        <PanelBody className="tool-form">
          {children}
          <Stack gap={3}>
            {error ? (
              <Notice tone="danger">{error instanceof Error ? error.message : 'This run failed.'}</Notice>
            ) : null}
            <div>
              <Button type="submit" size="lg" loading={pending}>
                {submitLabel}
              </Button>
            </div>
          </Stack>
        </PanelBody>
      </Panel>
    </form>
  )
}

/** "Carried in" help for a field, only while it still holds the carried value (not once the user replaced it). */
export function getSeededFieldNote(
  fieldName: 'jobDescription' | 'targetRole',
  bridge: {
    seededJob: boolean
    seededTargetRole: boolean
    carriedJobDescription?: string
    carriedTargetRole?: string
  },
  value: string,
): string {
  const current = value.trim()
  if (!current) return ''

  if (fieldName === 'jobDescription' && bridge.seededJob && current === (bridge.carriedJobDescription ?? '').trim()) {
    return 'Job description carried in from your recent workflow.'
  }

  if (fieldName === 'targetRole' && bridge.seededTargetRole && current === (bridge.carriedTargetRole ?? '').trim()) {
    return 'Target role carried in from your recent workflow.'
  }

  return ''
}
