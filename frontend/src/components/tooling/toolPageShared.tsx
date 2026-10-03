import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Button,
  ErrorState,
  List,
  Notice,
  Page,
  PageHeader,
  Row,
  RowBody,
  RowMeta,
  RowTitle,
  Section,
  Skeleton,
  Stack,
} from '#/components/kit'
import { CinematicLoader } from '#/components/tooling/CinematicLoader'
import { GuestSaveBanner } from '#/components/tooling/GuestSaveBanner'
import { WorkflowHandoffBanner } from '#/components/tooling/WorkflowHandoffBanner'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { historyRunHref } from '#/lib/tools/historyToolLabel'
import { formatRunDate } from '#/lib/tools/runLabel'
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
  const feedback = urlParams?.get('feedback') ?? undefined

  const handleSubmit = () => {
    const nextErrors = validateWorkflowDraft(config, draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalidField()
      return
    }
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
  children,
}: {
  toolId: ToolId
  children: ReactNode
}) {
  const tool = tools[toolId]

  return (
    <Page width="narrow">
      <PageHeader title={tool.label} lead={tool.summary} />
      <GuestSaveBanner />
      <WorkflowHandoffBanner toolId={toolId} />
      {children}
      <RecentToolRuns toolId={toolId} />
    </Page>
  )
}

/** The last few saved runs of this tool, so the page opens with the user's own data. */
export function RecentToolRuns({ toolId }: { toolId: ToolId }) {
  const { status } = useSession()
  const query = useHistory({ tool: toolId, page: 1, page_size: 3 }, status === 'authenticated')
  const items = query.data?.items ?? []

  if (status !== 'authenticated' || (!query.isPending && !query.isError && items.length === 0)) return null

  return (
    <Section id="recent-runs" title="Recent runs">
      {query.isError ? (
        <ErrorState
          size="inline"
          title="Recent runs couldn't be loaded"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <List aria-labelledby="recent-runs-heading" aria-busy={query.isPending || undefined}>
          {query.isPending ? (
            <Skeleton variant="row" as="li" count={3} />
          ) : (
            items.map((item) => {
              const href = historyRunHref(item)
              const label = item.label || 'Untitled run'
              return (
                <Row key={item.id}>
                  <RowBody>
                    {href ? (
                      <RowTitle asChild>
                        <Link to={href}>{label}</Link>
                      </RowTitle>
                    ) : (
                      <RowTitle>{label}</RowTitle>
                    )}
                  </RowBody>
                  <RowMeta>{formatRunDate(item.created_at)}</RowMeta>
                </Row>
              )
            })
          )}
        </List>
      )}
    </Section>
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

/** The input form: its fields, then the run error (if any) and the one submit button. */
export function ToolForm({
  label,
  onSubmit,
  submitLabel,
  error,
  pending,
  children,
}: {
  label: string
  onSubmit: () => void
  submitLabel: string
  error?: unknown
  pending?: boolean
  children: ReactNode
}) {
  return (
    <form
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Stack gap={6}>
        {children}
        <Stack gap={3}>
          {error ? (
            <Notice tone="danger">{error instanceof Error ? error.message : 'This run failed.'}</Notice>
          ) : null}
          <div>
            <Button type="submit" loading={pending}>
              {submitLabel}
            </Button>
          </div>
        </Stack>
      </Stack>
    </form>
  )
}

export function getSeededFieldNote(
  fieldName: 'jobDescription' | 'targetRole',
  bridge: {
    seededJob: boolean
    seededTargetRole: boolean
  },
): string {
  if (fieldName === 'jobDescription' && bridge.seededJob) {
    return 'Job description carried in from your recent workflow.'
  }

  if (fieldName === 'targetRole' && bridge.seededTargetRole) {
    return 'Target role carried in from your recent workflow.'
  }

  return ''
}
