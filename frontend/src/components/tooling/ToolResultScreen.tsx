import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Copy, Download, Star } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { ApiError } from '#/lib/api/errors'
import { getHistoryItem } from '#/lib/api/client'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useSession } from '#/hooks/useSession'
import { readDemoRun } from '#/lib/tools/demoRuns'
import { writeWorkflowContext } from '#/lib/tools/drafts'
import {
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
  const demoItem = useMemo(() => readDemoRun(historyId), [historyId])
  const isDemoResult = Boolean(demoItem)
  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
    enabled: !isDemoResult,
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

  const heroMetric = definition.heroMetric?.(payload)
  const insightStrip = definition.insightStrip?.(payload)
  const primaryNextAction = resolvedTool.nextActions[0]
  const secondaryNextAction = resolvedTool.nextActions[1]

  async function handleCopy() {
    await navigator.clipboard.writeText(definition.copyText(payload, item))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  function handleExport(format: 'txt' | 'md') {
    trackTelemetry({
      event_name: 'export_action_used',
      tool_id: resolvedTool.id,
      history_id: item.id,
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
        <div className="result-hero">
          <div className="result-hero__top">
            {heroMetric || (
              <div className="result-hero__icon">
                <resolvedTool.icon size={22} />
              </div>
            )}
            <div className="result-hero__text">
              <div className="result-hero__label">
                {resolvedTool.label}{savedResult ? '' : ' · Guest demo'}
              </div>
              <h1 className="result-hero__headline">
                {typeof summary.headline === 'string' ? summary.headline : resolvedTool.resultTitle}
              </h1>
              <p className="result-hero__sub">
                {item.label || 'Untitled run'} · {new Date(item.created_at).toLocaleString()}
              </p>
              <div className="result-hero__actions">
                <a href={resolvedTool.route} className="result-hero__btn-text">Run again</a>
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
            </div>
          </div>
          {insightStrip && insightStrip.length > 0 ? (
            <div className="result-hero__strip" style={{ ['--cols' as string]: insightStrip.length }}>
              {insightStrip.map((stat) => (
                <div key={stat.label} className="result-hero__strip-item">
                  <div className="result-hero__strip-val">{stat.value}</div>
                  <div className="result-hero__strip-lbl">{stat.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Guest banner ── */}
        {guestResult ? (
          <div className="result-guest-banner">
            <span>
              {status === 'authenticated'
                ? 'Guest demo. Rerun while signed in to save.'
                : 'Guest demo. Sign in to save and continue.'}
            </span>
            {status !== 'authenticated' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  openAuthDialog({ to: resolvedTool.route, reason: 'guest-demo-result', label: 'Sign in' })
                }
              >
                Sign in
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: resolvedTool.route })}
              >
                Rerun
              </Button>
            )}
          </div>
        ) : null}

        {/* ── Content ── */}
        <div className="result-content">
          {definition.render(payload, item, resolvedTool)}
        </div>

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
