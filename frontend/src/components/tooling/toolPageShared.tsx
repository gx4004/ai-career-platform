import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Clock } from 'lucide-react'
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
import { isSampleResume, rememberResume } from '#/components/tooling/sampleResume'
import { useHistory } from '#/hooks/useHistory'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'
import { useSession } from '#/hooks/useSession'
import { readRegenFeedback, readWorkflowContext } from '#/lib/tools/drafts'
import { getResumeCarryText } from '#/lib/tools/resumeCarryStore'
import { getWorkflowTargetRole, roleFromRegeneratedRun } from '#/lib/tools/workflowContext'
import { historyRunHref } from '#/lib/tools/historyToolLabel'
import { formatRunDate, runSubject, splitScore } from '#/lib/tools/runLabel'
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
  const { draft, setDraft, setField: setDraftField } = useToolDraft(toolId, config.defaults)
  const mutation = useToolMutation(tool)
  const bridge = useWorkflowBridge(toolId, draft, setDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof draft, string>>>({})
  // An error describes what the field held at submit: once the user changes that field, the error goes with it
  // (an upload, a paste or the sample must not sit under "Add your resume"). The other fields keep theirs.
  const setField: typeof setDraftField = (name, value) => {
    setDraftField(name, value)
    setErrors((previous) => (previous[name] ? { ...previous, [name]: undefined } : previous))
  }

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
    rememberResume(String(draft.resumeText ?? ''), undefined, toolId)
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
    // Each filled item says whether it came from this tab; "from this tab" is then said once when all of them did,
    // instead of after every item.
    const items: { name: string; fromTab: boolean; quiet?: boolean }[] = []
    const missing: string[] = []
    if (needsResume) {
      if (resume) {
        items.push(
          context?.resumeSource && context.resumeText
            ? { name: context.resumeSource, fromTab: false }
            : { name: isSampleResume(resume) ? 'the sample resume' : 'your resume', fromTab: true },
        )
      } else missing.push('your resume')
    }
    if (needsJob) {
      if (job) items.push(context?.jobSource ? { name: context.jobSource, fromTab: false } : { name: 'the job description', fromTab: true })
      else missing.push(context?.jobLabel ? `the job description for ${context.jobLabel}` : 'the job description')
    }
    if (needsRole) {
      const fromRun = roleFromRegeneratedRun(toolId, context, parentRunId)
      // Opening the result wrote its role into the tab, so the role is that run's (sign-off tool-inputs-F30): said so.
      // Otherwise it is read from the tab, but never named that on its own: it only joins an all-from-the-tab line.
      if (role && fromRun)
        items.push({ name: fromRun === 'recommended' ? 'the role the earlier run recommended' : 'the earlier run’s target role', fromTab: false })
      else if (role) items.push({ name: 'the target role', fromTab: true, quiet: true })
      else missing.push('a target role')
    }
    const allFromTab = items.length > 0 && items.every((item) => item.fromTab)
    const filled = allFromTab
      ? [`${joinWords(items.map((item) => item.name))} from this tab`]
      : items.map((item) => (item.fromTab && !item.quiet ? `${item.name} from this tab` : item.name))
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
 * content is at least 52rem wide (Split breakpoint="compact": the form still has about 35rem, so 1024 with the
 * sidebar collapsed keeps the rail beside it); below that the rail follows the form.
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
        breakpoint="compact"
        railLabel={`About ${tool.label}`}
        rail={
          <>
            <RecentToolRuns toolId={toolId} />
            <WhatYouGet toolId={toolId} />
          </>
        }
      >
        <div className="tool-notices">
          <GuestSaveBanner toolId={toolId} />
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

/**
 * What a run was about, as its title in the narrow rail: the tool's own name ("Career Plan", "Job Match") is already the
 * page title, so it says nothing there. A name the user gave the run wins; then the application's role and company; then
 * the role a Career Path or Portfolio label names ("Career Plan (X)" gives X); then what any other default label wraps
 * (a tone, "4 questions"). The result's headline is never the title (consistency-F06: clamped in 280px it read
 * "Strong foundation: 2…" and was not the name History shows); it is the line under the title, as in History. A run with
 * none of these (a plain "Resume Analysis (77/100)") returns null: the rail titles it by when it ran (consistency-F23:
 * three Resume Analyzer runs read "Resume Analysis" three times).
 */
function runTitle(
  item: {
    workspace?: { role?: string | null; company?: string | null } | null
  },
  name: string,
  toolId: ToolId,
): string | null {
  const subject = runSubject(name, tools[toolId])
  if (subject && subject === name.trim()) return subject
  const application = [item.workspace?.role, item.workspace?.company].filter(Boolean).join(' at ')
  const questions = /\((\d+ questions?)\)\s*$/i.exec(name)?.[1]
  return application || subject || questions || null
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
  const titleOf = (item: (typeof items)[number]) => runTitle(item, splitScore(item.label || 'Untitled run').name, toolId)
  // Two runs that would read the same (subject and day) also show their time, so they can be told apart.
  const rowKey = (item: (typeof items)[number]) => [titleOf(item) ?? '', formatRunDate(item.created_at)].join('|')
  const seen = new Map<string, number>()
  for (const item of items) seen.set(rowKey(item), (seen.get(rowKey(item)) ?? 0) + 1)
  // Runs titled by when they ran: their times, to the second when two share a minute.
  const dated = items.filter((item) => titleOf(item) === null)

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
        // Signed in, nothing run yet: the section stays (no skeleton that then vanishes) and says what will appear,
        // as the Sticker die-cut empty state.
        <EmptyState
          icon={<Clock />}
          title="No runs yet"
          description={`Your ${tools[toolId].label} results will be listed here.`}
        />
      ) : (
        <List aria-labelledby="recent-runs-heading" aria-busy={query.isPending || undefined}>
          {query.isPending ? (
            <Skeleton variant="row" as="li" count={3} />
          ) : (
            items.map((item) => {
              const href = historyRunHref(item)
              const { score } = splitScore(item.label || 'Untitled run')
              const subject = titleOf(item)
              const headline = item.metadata?.summary_headline?.trim()
              const date = formatRunDate(item.created_at)
              // No subject: the date and time are the title, and the line under it is the headline alone.
              const title = subject ?? `${date}, ${timeOf(item.created_at, dated)}`
              const time =
                subject !== null && (seen.get(rowKey(item)) ?? 0) > 1
                  ? timeOf(item.created_at, items.filter((other) => rowKey(other) === rowKey(item)))
                  : ''
              const detailsId = `recent-run-${item.id}`
              const headlineId = `${detailsId}-headline`
              const describedBy = [subject !== null || !headline ? detailsId : null, headline ? headlineId : null].filter(Boolean).join(' ')
              // The pill is decorative to assistive tech; the score is read with the link's description, at its end.
              const srScore = score ? <span className="kit-sr-only">, score {score}</span> : null
              // On the title's line (kit RowTitle aside): as a RowMeta column it squeezed the headline under the title to
              // ~150px, which then cut before the role (consistency-F23).
              const pill = score ? (
                <Badge tone={tools[toolId].tone} score aria-hidden="true">
                  {score}
                </Badge>
              ) : null
              return (
                // The subject wraps to two lines (a rail is 280px); the date keeps one line under it, the headline two.
                <Row key={item.id} overflow="clamp">
                  <RowBody>
                    {href ? (
                      <RowTitle asChild aside={pill}>
                        <Link to={href} aria-describedby={describedBy} title={title}>
                          {title}
                        </Link>
                      </RowTitle>
                    ) : (
                      <RowTitle title={title} aside={pill}>{title}</RowTitle>
                    )}
                    {/* Runs can share a subject: the date (and the time when two collide), the headline and the score
                        describe each link. A run titled by its date has no date line. */}
                    {subject !== null ? (
                      <RowSubtitle id={detailsId}>
                        {time ? `${date}, ${time}` : date}
                        {headline ? null : srScore}
                      </RowSubtitle>
                    ) : !headline && srScore ? (
                      <span id={detailsId} className="kit-sr-only">score {score}</span>
                    ) : null}
                    {/* The headline (History's summary line) has its own two lines, the body's full width (consistency-F17,
                        F23). */}
                    {headline ? (
                      <RowSubtitle id={headlineId} lines={2}>
                        {headline}
                        {srScore}
                      </RowSubtitle>
                    ) : null}
                  </RowBody>
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

  // Submitting from the foot of a long form (a phone) can leave the panel's status under the sticky app header, or its
  // Cancel under the floating tab tray. Its scroll margins are exactly those bars (tooling.css; 16px and 0 on desktop):
  // when the panel crosses either, bring its top to sit just under the header.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const style = window.getComputedStyle(panel)
    const clearTop = parseFloat(style.scrollMarginTop) || 0
    const clearBottom = parseFloat(style.scrollMarginBottom) || 0
    const { top, bottom } = panel.getBoundingClientRect()
    if (top >= clearTop && bottom <= window.innerHeight - clearBottom) return
    panel.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the panel takes the form's place
  }, [])

  // The form's height is the panel's floor (tooling.css): on a phone it is capped to one screen, so the status, the
  // steps and Cancel are all in view instead of a long empty panel.
  const style = height ? ({ '--tool-form-h': `${Math.round(height)}px` } as CSSProperties) : undefined

  return (
    <Panel ref={panelRef} className="tool-loading" style={style}>
      <PanelBody className="tool-loading__body">
        <CinematicLoader
          toolId={toolId}
          mutationDone={mutationDone}
          onReady={onReady}
          accessMode={status === 'authenticated' ? 'authenticated' : 'guest_demo'}
          action={
            onCancel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="tool-loading__cancel"
                onClick={() => {
                  // Cancel unmounts with this panel: the form that takes its place picks the focus up (see ToolForm).
                  focusSubmitAfterCancel = toolId
                  onCancel()
                }}
              >
                Cancel
              </Button>
            ) : null
          }
        />
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
  const errorRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = usePrefersReducedMotion()
  useEffect(() => {
    if (focusSubmitAfterCancel !== toolId) return
    focusSubmitAfterCancel = null
    formRef.current?.querySelector<HTMLElement>('button[type="submit"]')?.focus()
  }, [toolId])
  // A failed run: the working panel had scrolled to its own top, so on a phone the error by the submit would sit below
  // the fold (or under the tab tray) with focus on <body>. Bring it into view and focus the way to retry; the notice is
  // an alert, so it is announced once on its own and the focus does not read it a second time.
  useEffect(() => {
    if (!error) return
    errorRef.current?.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    formRef.current?.querySelector<HTMLElement>('button[type="submit"]')?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per failed run, not when motion settings change
  }, [error])
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
              <Notice ref={errorRef} tone="danger" className="tool-form__error">
                {error instanceof Error ? error.message : 'This run failed.'}
              </Notice>
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
    /** Set when the value came from one of the user's applications: it is named, and the run is filed under it. */
    jobApplicationLabel?: string
    roleApplicationLabel?: string
    /** Set on a Re-generate whose role is the earlier run's: its input role, or the role it recommended. */
    roleFromRun?: 'target' | 'recommended'
  },
  value: string,
): string {
  const current = value.trim()
  if (!current) return ''

  if (fieldName === 'jobDescription' && bridge.seededJob && current === (bridge.carriedJobDescription ?? '').trim()) {
    return bridge.jobApplicationLabel
      ? `Job description from your application ${bridge.jobApplicationLabel}. This run is saved to it.`
      : 'Job description carried in from your recent workflow.'
  }

  if (fieldName === 'targetRole' && bridge.seededTargetRole && current === (bridge.carriedTargetRole ?? '').trim()) {
    if (bridge.roleApplicationLabel) {
      return `Target role from your application ${bridge.roleApplicationLabel}. This run is saved to it.`
    }
    if (bridge.roleFromRun === 'recommended') return 'The role the run you are re-generating recommended.'
    if (bridge.roleFromRun === 'target') return 'Target role from the run you are re-generating.'
    return 'Target role carried in from your recent workflow.'
  }

  return ''
}
