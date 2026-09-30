import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, Clock, Copy, Download, FileText, Loader2, RefreshCw, Star, Undo2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScoreTooltip } from '#/components/tooling/ScoreTooltip'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { ClaimPromotionSection } from '#/components/profile/ClaimPromotionSection'
import { PageFrame } from '#/components/app/PageFrame'
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
import { MiniBar, ResultToc, scoreTone } from './ResultParts'

function formatRunDate(iso: string | null | undefined) {
  const parsed = iso ? new Date(iso) : null
  if (!parsed || Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Screen-reader names for the headline score (the old score ring carried these). */
const SCORE_ARIA_NAMES: Partial<Record<string, string>> = {
  resume: 'Resume score',
  'job-match': 'Job match score',
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
  const [scoreDelta, setScoreDelta] = useState<number | null>(null)
  const [parentRunId, setParentRunId] = useState<string | null>(null)
  const [showUndo, setShowUndo] = useState(true)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
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
    return (
      <AppStatePanel
        badge="Loading result"
        title="Fetching saved output"
        description="The result payload is loading from history."
        icon={<Loader2 size={40} className="app-state-icon app-state-icon--spin" />}
      />
    )
  }

  if (query.isError || !item) {
    const isMissingSavedResult =
      query.error instanceof ApiError && query.error.status === 404

    return (
      <AppStatePanel
        badge={isDemoResult ? 'Demo expired' : 'Result unavailable'}
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
        icon={isDemoResult
          ? <Clock size={40} className="app-state-icon app-state-icon--muted" />
          : <AlertCircle size={40} className="app-state-icon app-state-icon--muted" />
        }
        detail={query.error instanceof Error ? query.error.message : undefined}
        actions={[
          ...(isDemoResult ? [] : [{ label: 'Back to history', to: '/history' as const }]),
          { label: 'Run the tool again', to: tools[toolId].route, variant: 'outline' },
        ]}
      />
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
  const runDate = formatRunDate(item.created_at)
  const headline = typeof summary.headline === 'string' ? summary.headline : resolvedTool.resultTitle
  const runLabel = item.label && item.label.trim() ? item.label.trim() : ''

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

  return (
    <PageFrame>
      <div className="result-page">
        <header className="page-header result-header">
          <div className="page-header__text">
            <h1 className="page-header__title">{resolvedTool.label}</h1>
            <p className="page-header__purpose result-header__headline">{headline}</p>
            <ul className="page-header__meta">
              {runLabel ? <li>{runLabel}</li> : null}
              {runDate ? <li>{runDate}</li> : null}
              {parentRunId && showUndo ? (
                <li>
                  <button
                    type="button"
                    className="result-undo"
                    onClick={() => navigate({ to: resolvedTool.resultRoute.replace('$historyId', parentRunId) })}
                  >
                    <Undo2 size={12} aria-hidden="true" />
                    Undo — restore previous result
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
          <div className="page-header__action result-actions">
            <Button
              type="button"
              size="sm"
              aria-expanded={regenOpen}
              title="Re-generate with feedback"
              onClick={() => setRegenOpen((v) => !v)}
            >
              <RefreshCw aria-hidden="true" />
              Re-generate
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              title={copied ? 'Copied' : 'Copy'}
              aria-label={copied ? 'Copied to clipboard' : 'Copy result to clipboard'}
            >
              <Copy aria-hidden="true" />
              <span className="result-actions__label">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
            {exportableSections.length > 0 && !definition.download ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExport('txt')}
                title="Export TXT"
                aria-label="Export result as plain-text file"
              >
                <Download aria-hidden="true" />
                <span className="result-actions__label">Export</span>
              </Button>
            ) : definition.download ? (
              // Tools with their own download (Cover Letter) export the
              // on-page, possibly edited text rather than the raw payload.
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const dl = definition.download?.(payload, item)
                  if (dl) downloadTextFile(dl.filename, dl.content)
                }}
                title="Download"
                aria-label="Download result"
              >
                <Download aria-hidden="true" />
                <span className="result-actions__label">Download</span>
              </Button>
            ) : null}
            {(resolvedTool.id === 'cover-letter' || resolvedTool.id === 'interview') && status === 'authenticated' && historyId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => exportPdf(historyId)}
                title={resolvedTool.id === 'cover-letter' ? 'Export PDF of the generated letter (edits not included)' : 'Export PDF'}
              >
                <FileText aria-hidden="true" />
                PDF
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={status !== 'authenticated' || favoriteToggle.isPending}
              onClick={() => {
                if (!savedResult) {
                  openAuthDialog({ to: resolvedTool.route, reason: 'save-demo-result', label: 'Sign in to save', toolId: resolvedTool.id })
                  return
                }
                favoriteToggle.mutate({ historyId: item.id, isFavorite: !item.is_favorite })
              }}
              title={savedResult ? (item.is_favorite ? 'Favorited' : 'Favorite') : 'Sign in to save'}
              aria-label={
                savedResult
                  ? item.is_favorite
                    ? 'Remove from favorites'
                    : 'Add to favorites'
                  : 'Sign in to favorite this result'
              }
              aria-pressed={savedResult ? Boolean(item.is_favorite) : undefined}
            >
              <Star fill={item.is_favorite ? 'currentColor' : 'none'} aria-hidden="true" />
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={resolvedTool.route}>New input</Link>
            </Button>
          </div>
        </header>

        {regenOpen && (
          <div className="regen-panel">
            <textarea
              className="regen-panel__textarea"
              placeholder="Optional: describe what you'd like changed..."
              aria-label="Re-generate feedback"
              value={regenFeedback}
              onChange={(e) => setRegenFeedback(e.target.value)}
              rows={3}
            />
            <div className="regen-panel__actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setRegenOpen(false); setRegenFeedback('') }}>
                Cancel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleRegenSubmit}>
                Submit
              </Button>
            </div>
          </div>
        )}

        {guestResult && !bannerDismissed ? (
          <div className="result-notice">
            <span>Guest demo</span>
            {status !== 'authenticated' ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
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
            ) : null}
            <button
              type="button"
              className="result-notice__dismiss"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {(summaryInfo.score || summaryInfo.facts.length > 0) && (
          <div className="result-summary">
            {summaryInfo.score ? (
              <div className="result-score">
                <div
                  className="result-score__main"
                  role="img"
                  aria-label={`${SCORE_ARIA_NAMES[resolvedTool.id] ?? summaryInfo.score.label}: ${summaryInfo.score.value} ${summaryInfo.score.unit === '%' ? 'percent' : 'out of 100'}`}
                >
                  <span className="result-score__value">{summaryInfo.score.value}</span>
                  <span className={`result-score__unit${summaryInfo.score.unit === '%' ? ' result-score__unit--pct' : ''}`}>{summaryInfo.score.unit}</span>
                  {scoreDelta !== null && (
                    <span className={`result-score__delta ${scoreDelta >= 0 ? 'result-score__delta--up' : 'result-score__delta--down'}`}>
                      {scoreDelta >= 0 ? '+' : ''}{scoreDelta} pts
                    </span>
                  )}
                </div>
                <div className="result-score__label">
                  {summaryInfo.score.label}
                  <ScoreTooltip toolId={resolvedTool.id} />
                </div>
                <MiniBar value={summaryInfo.score.value} tone={scoreTone(summaryInfo.score.value)} />
              </div>
            ) : null}
            {summaryInfo.facts.length > 0 ? (
              <dl className="result-facts">
                {summaryInfo.facts.map((f) => (
                  <div key={f.label} className="result-facts__item">
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        )}
        {summaryInfo.note ? <p className="result-note">{summaryInfo.note}</p> : null}

        <div className="result-layout">
          <div className="result-main" ref={bodyRef}>
            <FixFirstList actions={topActions} />
            {definition.render(payload, item, resolvedTool)}
            <ClaimPromotionSection
              toolId={resolvedTool.id}
              payload={payload as Record<string, unknown>}
              authenticated={status === 'authenticated'}
            />
          </div>
          <ResultToc containerRef={bodyRef} />
        </div>
      </div>
    </PageFrame>
  )
}
