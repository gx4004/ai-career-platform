import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { RefreshCw, Star, Undo2 } from 'lucide-react'
import {
  Button,
  Cluster,
  ErrorState,
  KeyValue,
  Lead,
  MetaRow,
  Notice,
  Page,
  PageHeader,
  ScoreBar,
  Skeleton,
  Split,
  Stack,
  Stat,
  Textarea,
  Tooltip,
} from '#/components/kit'
import { ScoreHelp } from '#/components/tooling/ScoreHelp'
import { ClaimPromotionSection } from '#/components/profile/ClaimPromotionSection'
import { formatRunDate, runSubject } from '#/lib/tools/runLabel'
import { ApiError } from '#/lib/api/errors'
import { getHistoryItem } from '#/lib/api/client'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useSession } from '#/hooks/useSession'
import { getTransientResult, isDemoHistoryId } from '#/lib/tools/demoRuns'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import {
  exportPdf,
  formatExportContent,
  readExportableSections,
  sanitizeDownloadTitle,
} from '#/lib/tools/exports'
import { FixFirstList, resultDefinitions } from '#/lib/tools/resultDefinitions'
import { deriveWorkflowUpdateFromHistoryItem } from '#/lib/tools/workflowContext'
import { getToolByHistoryName, tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { trackTelemetry } from '#/lib/telemetry/client'
import { ResultChromeContext, ResultToc } from './ResultParts'
import type { ResultSummary } from '#/lib/tools/resultDefinitions'

function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ToolResultScreen({
  toolId,
  historyId,
}: {
  toolId: ToolId
  historyId: string
}) {
  const navigate = useNavigate()
  const { status, openAuthDialog } = useSession()
  const favoriteToggle = useFavoriteToggle()
  const [copied, setCopied] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenFeedback, setRegenFeedback] = useState('')
  const [practicing, setPracticing] = useState(false)
  const [scoreDelta, setScoreDelta] = useState<number | null>(null)
  const [parentRunId, setParentRunId] = useState<string | null>(null)
  const [showUndo, setShowUndo] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryClient = useQueryClient()
  const demoItem = useMemo(() => getTransientResult(historyId), [historyId])
  const cachedItem = queryClient.getQueryData(['tool-run', historyId]) as ReturnType<typeof getTransientResult> | undefined
  const localItem = demoItem || cachedItem || null

  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])
  const hasLocalData = Boolean(localItem)

  // Track when the result page has no local data and must fetch from backend.
  // This should rarely happen — a cache miss here means the mutation's onSuccess
  // failed to populate the cache, or the cache was cleared between navigation.
  useEffect(() => {
    if (!hasLocalData) {
      trackTelemetry({
        event_name: 'result_page_cache_miss',
        tool_id: toolId,
        session_status: status,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [])

  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
    enabled: !hasLocalData,
  })

  const item = localItem || query.data
  const isDemoResult = Boolean(demoItem || cachedItem) || isDemoHistoryId(historyId)

  useEffect(() => {
    if (!item) return
    writeWorkflowContext({
      ...deriveWorkflowUpdateFromHistoryItem(item),
      updatedAt: Date.now(),
    })
  }, [item])

  const viewedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!item || viewedRef.current === item.id) return
    viewedRef.current = item.id
    trackTelemetry({
      event_name: 'result_page_loaded',
      tool_id: toolId,
      access_mode: item.access_mode === 'guest_demo' ? 'guest_demo' : 'authenticated',
      saved: item.saved,
    })
  }, [item, toolId])

  useEffect(() => {
    if (!item) return
    const nestedParentId = (item.result_payload as Record<string, unknown>)?.parent_run_id
    const parentId = typeof item.parent_run_id === 'string' ? item.parent_run_id : nestedParentId
    if (!parentId || typeof parentId !== 'string') {
      setParentRunId(null)
      setScoreDelta(null)
      setShowUndo(false)
      return
    }

    setParentRunId(parentId)
    setShowUndo(true)

    // Hide undo button after 30 seconds
    const timer = setTimeout(() => setShowUndo(false), 30_000)

    let mounted = true
    getHistoryItem(parentId).then((parent) => {
      if (!mounted || !parent) return
      const parentPayload = parent.result_payload ?? parent
      const pp = parentPayload as Record<string, unknown>
      const rp = item.result_payload as Record<string, unknown>
      const parentScore = (pp.overall_score ?? pp.match_score ?? null) as number | null
      const currentScore = (rp.overall_score ?? rp.match_score ?? null) as number | null
      if (parentScore != null && currentScore != null) {
        setScoreDelta(currentScore - parentScore)
      }
    })

    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [item])


  if (!item && query.isPending) {
    return <ResultLoading toolId={toolId} />
  }

  if (query.isError || !item) {
    const isMissingSavedResult =
      query.error instanceof ApiError && query.error.status === 404

    return (
      <Page>
        <ErrorState
          size="page"
          headingLevel={1}
          title={
            isDemoResult
              ? 'This guest demo is no longer available'
              : isMissingSavedResult
                ? 'This saved result is no longer available'
                : 'This result could not be loaded'
          }
          description={
            isDemoResult
              ? 'Run the tool again to regenerate the demo, or sign in to save future runs in your workspace.'
              : isMissingSavedResult
                ? 'The saved run may have been deleted or no longer matches the current workspace state.'
                : 'The saved run is missing, inaccessible, or the backend is offline.'
          }
          onRetry={isDemoResult || isMissingSavedResult ? undefined : () => void query.refetch()}
          retrying={query.isFetching}
          backAction={
            <>
              {isDemoResult ? null : (
                <Button asChild variant="secondary">
                  <Link to="/history">Back to history</Link>
                </Button>
              )}
              <Button asChild variant="secondary">
                <Link to={tools[toolId].route}>Run the tool again</Link>
              </Button>
            </>
          }
        />
      </Page>
    )
  }

  const resolvedTool = getToolByHistoryName(item.tool_name) || tools[toolId]
  const definition = resultDefinitions[resolvedTool.id]
  const guestSignupLabel = 'Sign in'
  const payload = item.result_payload
  const summary =
    payload.summary && typeof payload.summary === 'object'
      ? (payload.summary as Record<string, unknown>)
      : {}
  const exportableSections = readExportableSections(payload)
  const downloadTitle =
    typeof payload.download_title === 'string' && payload.download_title.trim()
      ? payload.download_title
      : item.label || resolvedTool.shortLabel
  const savedResult = item.saved
  const guestResult = !savedResult
  function handleRegenSubmit() {
    const params = new URLSearchParams()
    params.set('parent_run_id', historyId)
    if (regenFeedback.trim()) {
      params.set('feedback', regenFeedback.trim())
    }
    void navigate({ to: `${resolvedTool.route}?${params.toString()}` })
  }

  const summaryInfo = definition.summary(payload)
  const topActions = definition.topActions(payload)
  const runDate = item.created_at ? formatRunDate(item.created_at) : ''
  const headline = typeof summary.headline === 'string' ? summary.headline.trim() : ''
  const hasHeadline = headline.length > 0
  // What the run is about, unless the rail already says it: "Portfolio Roadmap (Backend Engineer)" and
  // a "Target role: Backend Engineer" fact would print the same words twice.
  const subject = runSubject(item.label, resolvedTool)
  const subjectInRail = summaryInfo.facts.some(
    (f) => f.value.trim().toLowerCase() === subject.toLowerCase(),
  )
  const runLabel = subjectInRail ? '' : subject

  async function handleCopy() {
    await navigator.clipboard.writeText(definition.copyText(payload, item!))
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1200)
  }

  function handleExport(format: 'txt' | 'md') {
    trackTelemetry({
      event_name: 'export_action_used',
      tool_id: resolvedTool.id,
      access_mode: savedResult ? 'authenticated' : 'guest_demo',
      saved: savedResult,
      export_format: format,
    })
    if (format === 'md') {
      downloadTextFile(
        sanitizeDownloadTitle(downloadTitle, 'md'),
        formatExportContent(exportableSections, 'md'),
        'text/markdown;charset=utf-8',
      )
    } else {
      downloadTextFile(
        sanitizeDownloadTitle(downloadTitle, 'txt'),
        formatExportContent(exportableSections, 'txt'),
      )
    }
  }

  const favoriteLabel = savedResult
    ? item.is_favorite
      ? 'Remove from favorites'
      : 'Add to favorites'
    : 'Sign in to favorite this result'
  // aria-disabled rather than disabled: the button keeps its focus stop, its name and its tooltip.
  const favoriteLocked = status !== 'authenticated' || favoriteToggle.isPending
  const favoriteButton = (
    <Button
      type="button"
      iconOnly
      variant="secondary"
      aria-disabled={favoriteLocked || undefined}
      data-disabled={favoriteLocked ? 'true' : undefined}
      onClick={() => {
        if (favoriteLocked) return
        if (!savedResult) {
          openAuthDialog({ to: resolvedTool.route, reason: 'save-demo-result', label: 'Sign in to save', toolId: resolvedTool.id })
          return
        }
        favoriteToggle.mutate({ historyId: item.id, isFavorite: !item.is_favorite })
      }}
      aria-label={favoriteLabel}
      aria-pressed={savedResult ? Boolean(item.is_favorite) : undefined}
    >
      <Star fill={item.is_favorite ? 'currentColor' : 'none'} aria-hidden="true" />
    </Button>
  )

  const exportButton =
    exportableSections.length > 0 && !definition.download ? (
      <Button
        type="button"
        variant="secondary"
        onClick={() => handleExport('txt')}
        aria-label="Export result as plain-text file"
      >
        Export
      </Button>
    ) : definition.download ? (
      // Tools with their own download (Cover Letter) export the
      // on-page, possibly edited text rather than the raw payload.
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          const dl = definition.download?.(payload, item)
          if (dl) downloadTextFile(dl.filename, dl.content)
        }}
        aria-label="Download result"
      >
        Download
      </Button>
    ) : null

  const pdfButton =
    (resolvedTool.id === 'cover-letter' || resolvedTool.id === 'interview') && status === 'authenticated' && historyId ? (
      <Button
        type="button"
        variant="secondary"
        onClick={() => exportPdf(historyId)}
        title={resolvedTool.id === 'cover-letter' ? 'Export PDF of the generated letter (edits not included)' : 'Export PDF'}
      >
        PDF
      </Button>
    ) : null

  const actions = (
    <div className="result-actions">
      <div className="result-actions__main">
        <Button
          type="button"
          variant={practicing ? 'secondary' : 'primary'}
          aria-expanded={regenOpen}
          onClick={() => setRegenOpen((v) => !v)}
        >
          <RefreshCw aria-hidden="true" />
          Re-generate
        </Button>
        <Tooltip content={favoriteLabel}>{favoriteButton}</Tooltip>
      </div>
      {regenOpen ? (
        <Stack gap={2} role="group" aria-label="Re-generate with feedback">
          <Textarea
            autoFocus
            placeholder="Optional: describe what you'd like changed..."
            aria-label="Re-generate feedback"
            value={regenFeedback}
            onChange={(e) => setRegenFeedback(e.target.value)}
            rows={3}
          />
          <Cluster justify="end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRegenOpen(false)
                setRegenFeedback('')
              }}
            >
              Cancel
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleRegenSubmit}>
              Submit
            </Button>
          </Cluster>
        </Stack>
      ) : null}
      <div className="result-actions__more">
        <Button
          type="button"
          variant="secondary"
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy result to clipboard'}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {exportButton}
        {pdfButton}
      </div>
      <Button asChild variant="link" className="tool-link">
        <Link to={resolvedTool.route}>New input</Link>
      </Button>
    </div>
  )

  return (
    <ResultChromeContext.Provider value={{ setPracticing }}>
      <Page>
        <PageHeader
          title={resolvedTool.label}
          meta={[runLabel, runDate]}
          actions={
            parentRunId && showUndo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: resolvedTool.resultRoute.replace('$historyId', parentRunId) })}
              >
                <Undo2 aria-hidden="true" />
                Undo — restore previous result
              </Button>
            ) : undefined
          }
        />

        {guestResult && !bannerDismissed ? (
          <Notice
            title="Guest demo"
            action={
              status !== 'authenticated' ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    openAuthDialog({
                      to: resolvedTool.route,
                      reason: 'guest-demo-result',
                      label: guestSignupLabel,
                      toolId: resolvedTool.id,
                    })
                  }}
                >
                  {guestSignupLabel}
                </Button>
              ) : undefined
            }
            onDismiss={() => setBannerDismissed(true)}
          />
        ) : null}

        <ResultSplit
          summary={summaryInfo}
          toolId={resolvedTool.id}
          scoreDelta={scoreDelta}
          actions={actions}
        >
          {hasHeadline ? <Lead>{headline}</Lead> : null}
          <FixFirstList actions={topActions} />
          {definition.render(payload, item, resolvedTool)}
          <ClaimPromotionSection
            toolId={resolvedTool.id}
            payload={payload as Record<string, unknown>}
            authenticated={status === 'authenticated'}
          />
          {summaryInfo.note ? <p className="result-note">{summaryInfo.note}</p> : null}
        </ResultSplit>
      </Page>
    </ResultChromeContext.Provider>
  )
}

/** The container width at which the kit's Split puts its rail beside the main column (56rem). */
const SPLIT_SIDE_BY_SIDE_REM = 56

/** Whether the Split is stacked (narrow): measured on the Split itself, like the kit's own container query. */
function useStacked(ref: RefObject<HTMLElement | null>) {
  const [stacked, setStacked] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const update = () => setStacked(el.getBoundingClientRect().width < SPLIT_SIDE_BY_SIDE_REM * rem)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return stacked
}

/** The score, a bar for a second ratio, and the run's facts: a rail block beside the report, one quiet line above it when stacked. */
function ResultSummaryBlock({
  summary,
  toolId,
  scoreDelta,
  compact,
}: {
  summary: ResultSummary
  toolId: ToolId
  scoreDelta: number | null
  compact: boolean
}) {
  const hasBars = summary.bars && summary.bars.length > 0
  if (!summary.score && !hasBars && summary.facts.length === 0) return null
  return (
    <Stack gap={compact ? 3 : 6} className="result-summary">
      {summary.score ? (
        <div className="result-score">
          <Stat
            label={summary.score.label}
            value={summary.score.value}
            unit={summary.score.unit}
            delta={scoreDelta !== null ? `${scoreDelta >= 0 ? '+' : ''}${scoreDelta} pts` : undefined}
            tone={scoreDelta !== null && scoreDelta < 0 ? 'danger' : 'success'}
          />
          <ScoreHelp toolId={toolId} />
        </div>
      ) : null}
      {hasBars ? (
        <Stack gap={3}>
          {summary.bars!.map((bar) => (
            <ScoreBar key={bar.label} label={bar.label} value={bar.value} max={bar.max} valueLabel={bar.valueLabel} />
          ))}
        </Stack>
      ) : null}
      {summary.facts.length > 0 ? (
        compact ? (
          <MetaRow>
            {summary.facts.map((f) => (
              <span key={f.label}>
                {f.label} <strong>{f.value}</strong>
              </span>
            ))}
          </MetaRow>
        ) : (
          <KeyValue labelWidth="7.5rem" items={summary.facts} />
        )
      ) : null}
    </Stack>
  )
}

/**
 * The report's two columns. Beside the report the rail leads with the summary; stacked, the summary moves
 * into the main column (above the lead) and the actions stay last in both the DOM and the picture, so the
 * keyboard order is the visual order at every width.
 */
function ResultSplit({
  summary,
  toolId,
  scoreDelta,
  actions,
  children,
}: {
  summary: ResultSummary
  toolId: ToolId
  scoreDelta: number | null
  actions: ReactNode
  children: ReactNode
}) {
  const splitRef = useRef<HTMLDivElement | null>(null)
  const stacked = useStacked(splitRef)
  return (
    <Split
      ref={splitRef}
      railLabel="Summary"
      stickyRail
      rail={
        <>
          {stacked ? null : <ResultSummaryBlock summary={summary} toolId={toolId} scoreDelta={scoreDelta} compact={false} />}
          {actions}
          <ResultToc containerRef={splitRef} />
        </>
      }
    >
      {stacked ? <ResultSummaryBlock summary={summary} toolId={toolId} scoreDelta={scoreDelta} compact /> : null}
      {children}
    </Split>
  )
}

/** The report's frame while the saved run is fetched: same header, rail and rows as the loaded page. */
function ResultLoading({ toolId }: { toolId: ToolId }) {
  return (
    <Page>
      <PageHeader title={tools[toolId].label} meta={[<Skeleton key="date" size="meta" width="4rem" />]} />
      <Split
        railLabel="Summary"
        rail={
          <>
            <Skeleton variant="stat" />
            <Skeleton lines={3} />
          </>
        }
      >
        <Skeleton label="Fetching saved output" lines={2} size="title" />
        <Stack gap={3}>
          <Skeleton width="8rem" />
          <Skeleton variant="row" count={3} />
        </Stack>
      </Split>
    </Page>
  )
}
