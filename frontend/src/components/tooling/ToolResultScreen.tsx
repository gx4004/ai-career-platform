import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Copy, Download, FileText, RefreshCw, Star, Undo2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { FadeIn, FadeUp } from '#/components/ui/motion'
import { ScoreTooltip } from '#/components/tooling/ScoreTooltip'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { ApiError } from '#/lib/api/errors'
import { getHistoryItem } from '#/lib/api/client'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useSession } from '#/hooks/useSession'
import { getTransientResult } from '#/lib/tools/demoRuns'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import {
  exportPdf,
  formatExportContent,
  readExportableSections,
  sanitizeDownloadTitle,
} from '#/lib/tools/exports'
import { resultDefinitions } from '#/lib/tools/resultDefinitions'
import { deriveWorkflowUpdateFromHistoryItem } from '#/lib/tools/workflowContext'
import { getToolByHistoryName, tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import { trackTelemetry } from '#/lib/telemetry/client'

function getStripGradient(value: number) {
  if (value >= 70) {
    return {
      start: '#15803d',
      end: '#4ade80',
      glow: '#22c55e',
    }
  }
  if (value >= 41) {
    return {
      start: '#c2410c',
      end: '#fbbf24',
      glow: '#f59e0b',
    }
  }
  return {
    start: '#b91c1c',
    end: '#fb7185',
    glow: '#ef4444',
  }
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
  const demoItem = useMemo(() => getTransientResult(historyId), [historyId])
  const isDemoResult = Boolean(demoItem)
  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
    enabled: !isDemoResult,
    staleTime: 60_000,
    retry: false,
  })

  const item = demoItem || query.data

  useEffect(() => {
    if (!item) return
    writeWorkflowContext({
      ...deriveWorkflowUpdateFromHistoryItem(item),
      updatedAt: Date.now(),
    })
  }, [item])

  useEffect(() => {
    if (!item) return
    trackTelemetry({
      event_name: 'result_page_loaded',
      tool_id: toolId,
      history_id: item.id,
      access_mode: item.access_mode === 'guest_demo' ? 'guest_demo' : 'authenticated',
      saved: item.saved,
      workspace_id: item.workspace?.id,
    })
  }, [item, toolId])

  useEffect(() => {
    if (!item) return
    const parentId = (item.result_payload as Record<string, unknown>)?.parent_run_id
    if (!parentId || typeof parentId !== 'string') return

    setParentRunId(parentId)
    setShowUndo(true)

    // Hide undo button after 30 seconds
    const timer = setTimeout(() => setShowUndo(false), 30_000)

    getHistoryItem(parentId).then((parent) => {
      if (!parent) return
      const parentPayload = parent.result_payload ?? parent
      const pp = parentPayload as Record<string, unknown>
      const rp = item.result_payload as Record<string, unknown>
      const parentScore = (pp.overall_score ?? pp.match_score ?? null) as number | null
      const currentScore = (rp.overall_score ?? rp.match_score ?? null) as number | null
      if (parentScore != null && currentScore != null) {
        setScoreDelta(currentScore - parentScore)
      }
    })

    return () => clearTimeout(timer)
  }, [item])

  if (!item && query.isPending) {
    return (
      <AppStatePanel
        badge="Loading result"
        title="Fetching saved output"
        description="The result payload is loading from history."
        scene="emptyPlanning"
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
        scene="emptyPlanning"
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
  const canContinueWorkflow = status === 'authenticated' || savedResult

  function handleRegenSubmit() {
    const params = new URLSearchParams()
    params.set('parent_run_id', historyId)
    if (regenFeedback.trim()) {
      params.set('feedback', regenFeedback.trim())
    }
    void navigate({ to: `${resolvedTool.route}?${params.toString()}` })
  }

  const heroMetric = definition.heroMetric?.(payload)
  const insightStrip = definition.insightStrip?.(payload)
  const primaryNextAction = resolvedTool.nextActions[0]
  const secondaryNextAction = resolvedTool.nextActions[1]

  async function handleCopy() {
    await navigator.clipboard.writeText(definition.copyText(payload, item!))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  function handleExport(format: 'txt' | 'md') {
    trackTelemetry({
      event_name: 'export_action_used',
      tool_id: resolvedTool.id,
      history_id: item!.id,
      access_mode: savedResult ? 'authenticated' : 'guest_demo',
      saved: savedResult,
      metadata: { format },
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
      <section className="result-shell" style={toolAccentStyle(resolvedTool.accent)}>
        {/* ── Hero ── */}
        <FadeIn delay={0.05}>
        <div className={`result-hero${definition.heroVariant === 'dark' ? ' result-hero--dark' : ''}`}>
          <div className="result-hero__top">
            {heroMetric ? (
              <div style={{ position: 'relative' }}>
                {heroMetric}
                <ScoreTooltip toolId={resolvedTool.id} />
              </div>
            ) : (
              <div className="result-hero__icon">
                <resolvedTool.icon size={22} />
              </div>
            )}
            <div className="result-hero__text">
              <div className="result-hero__label">
                {resolvedTool.label}{savedResult ? '' : ' · Guest demo'}
              </div>
              <h1 className="result-hero__headline result-hero__headline--premium">
                {typeof summary.headline === 'string' ? summary.headline : resolvedTool.resultTitle}
                {scoreDelta !== null && (
                  <span className={`score-delta ${scoreDelta >= 0 ? 'score-delta-positive' : 'score-delta-negative'}`}>
                    {scoreDelta >= 0 ? '+' : ''}{scoreDelta} pts
                  </span>
                )}
              </h1>
              {definition.heroVariant === 'dark' && typeof summary.confidence_note === 'string' && summary.confidence_note.trim() && (
                <p className="result-hero__sub">{summary.confidence_note}</p>
              )}
              {parentRunId && showUndo && (
                <button
                  className="result-undo-btn"
                  onClick={() => navigate({ to: resolvedTool.resultRoute.replace('$historyId', parentRunId) })}
                >
                  <Undo2 size={13} />
                  Undo — restore previous result
                </button>
              )}
              <div className="result-hero__actions">
                <a href={resolvedTool.route} className="result-hero__btn-text">Run again</a>
                <button
                  className="result-hero__btn-text"
                  onClick={() => setRegenOpen((v) => !v)}
                  title="Re-generate with feedback"
                >
                  <RefreshCw size={12} style={{ marginRight: 4 }} />
                  Re-generate
                </button>
                <button className="result-hero__btn" onClick={handleCopy} title={copied ? 'Copied' : 'Copy'}>
                  <Copy size={13} />
                </button>
                {exportableSections.length > 0 ? (
                  <button className="result-hero__btn" onClick={() => handleExport('txt')} title="Export TXT">
                    <Download size={13} />
                  </button>
                ) : definition.download ? (
                  <button className="result-hero__btn" onClick={() => {
                    const dl = definition.download?.(payload, item)
                    if (dl) downloadTextFile(dl.filename, dl.content)
                  }} title="Download">
                    <Download size={13} />
                  </button>
                ) : null}
                {(resolvedTool.id === 'cover-letter' || resolvedTool.id === 'interview') && status === 'authenticated' && historyId && (
                  <button className="result-hero__btn-text" onClick={() => exportPdf(historyId)} title="Export PDF">
                    <FileText size={12} style={{ marginRight: 4 }} />
                    PDF
                  </button>
                )}
                <button
                  className="result-hero__btn"
                  disabled={status !== 'authenticated' || favoriteToggle.isPending}
                  onClick={() => {
                    if (!savedResult) {
                      openAuthDialog({ to: resolvedTool.route, reason: 'save-demo-result', label: 'Sign in to save' })
                      return
                    }
                    favoriteToggle.mutate({ historyId: item.id, isFavorite: !item.is_favorite })
                  }}
                  title={savedResult ? (item.is_favorite ? 'Favorited' : 'Favorite') : 'Sign in to save'}
                >
                  <Star size={13} fill={item.is_favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              {regenOpen && (
                <div className="regen-feedback-panel">
                  <textarea
                    className="regen-feedback-textarea"
                    placeholder="Optional: describe what you'd like changed..."
                    value={regenFeedback}
                    onChange={(e) => setRegenFeedback(e.target.value)}
                    rows={3}
                  />
                  <div className="regen-feedback-actions">
                    <button
                      className="result-hero__btn-text"
                      onClick={() => { setRegenOpen(false); setRegenFeedback('') }}
                    >
                      Cancel
                    </button>
                    <button
                      className="result-hero__btn-text regen-submit-btn"
                      onClick={handleRegenSubmit}
                    >
                      Submit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          {insightStrip && insightStrip.length > 0 ? (
            <div className="result-hero__strip">
              {insightStrip.map((stat) => {
                const numericValue = parseFloat(stat.value)
                const isBar = !Number.isNaN(numericValue) && numericValue <= 100 && !/[a-zA-Z]/.test(stat.value.replace('%', ''))
                const stripGradient = isBar ? getStripGradient(numericValue) : null
                return (
                  <div key={stat.label} className="result-hero__strip-item">
                    <span className="result-hero__strip-lbl">{stat.label}</span>
                    {isBar ? (
                      <div className="result-hero__strip-track">
                        <div
                          className="result-hero__strip-fill"
                          style={{
                            width: `${numericValue}%`,
                            '--strip-start': stripGradient?.start,
                            '--strip-end': stripGradient?.end,
                            '--strip-color': stripGradient?.glow,
                          } as React.CSSProperties}
                        />
                      </div>
                    ) : null}
                    <span className="result-hero__strip-val">{stat.value}</span>
                  </div>
                )
              })}
            </div>
          ) : null}
          {definition.heroExtra?.(payload)}
        </div>
        </FadeIn>

        {/* ── Mid-section (e.g. Fix First cards) ── */}
        {definition.midSection ? (
          <FadeUp delay={0.08}>
            {definition.midSection(payload)}
          </FadeUp>
        ) : null}

        {/* ── Guest banner (floating pill) ── */}
        {guestResult && !bannerDismissed ? (
          <div className="result-guest-banner">
            {status !== 'authenticated' ? (
              <>
                <span>Guest demo</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  style={{ height: '1.5rem', fontSize: '0.6875rem', padding: '0 0.5rem', borderRadius: '9999px' }}
                  onClick={() =>
                    openAuthDialog({ to: resolvedTool.route, reason: 'guest-demo-result', label: 'Sign in' })
                  }
                >
                  Sign in
                </Button>
              </>
            ) : (
              <span>Guest demo</span>
            )}
            <button
              className="result-guest-banner__dismiss"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
            >
              <X size={10} />
            </button>
          </div>
        ) : null}

        {/* ── Content ── */}
        <FadeUp delay={0.12}>
        <div className="result-content">
          {definition.render(payload, item, resolvedTool)}
        </div>
        </FadeUp>

        {/* ── Sticky CTA ── */}
        {primaryNextAction ? (
          <div className="result-action">
            <div className="result-action__text">
              <strong>{primaryNextAction.label}</strong> — {tools[primaryNextAction.to].summary}
            </div>
            <div className="result-action__btns">
              <Button
                size="sm"
                onClick={() => {
                  if (!canContinueWorkflow) {
                    openAuthDialog({ to: tools[primaryNextAction.to].route, reason: 'continue-workflow', label: 'Sign in' })
                    return
                  }
                  void navigate({ to: tools[primaryNextAction.to].route })
                }}
              >
                {canContinueWorkflow ? `${tools[primaryNextAction.to].shortLabel} →` : 'Sign in'}
              </Button>
              {secondaryNextAction ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!canContinueWorkflow) {
                      openAuthDialog({ to: tools[secondaryNextAction.to].route, reason: 'continue-workflow', label: 'Sign in' })
                      return
                    }
                    void navigate({ to: tools[secondaryNextAction.to].route })
                  }}
                >
                  {tools[secondaryNextAction.to].shortLabel}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </PageFrame>
  )
}
