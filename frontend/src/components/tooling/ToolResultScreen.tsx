import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Copy, Download, Star } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
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

  return (
    <PageFrame>
      <section className="result-screen content-max">
        <div className="result-hero result-hero-card" style={toolAccentStyle(resolvedTool.accent)}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">{resolvedTool.label}</Badge>
                <Badge
                  variant="outline"
                  style={{ borderColor: resolvedTool.accent, color: resolvedTool.accent }}
                >
                  {savedResult ? 'Saved result' : 'Guest demo'}
                </Badge>
              </div>
              <div className="grid gap-1">
                <h1 className="page-title">{resolvedTool.resultTitle}</h1>
                <p className="muted-copy">
                  {item.label || 'Untitled run'} • {new Date(item.created_at).toLocaleString()}
                </p>
                {item.workspace?.label ? (
                  <p className="small-copy muted-copy">Workspace: {item.workspace.label}</p>
                ) : null}
              </div>
            </div>
            <div className="result-header-actions button-cluster button-cluster--toolbar">
              <Button variant="outline" asChild className="button-toolbar-utility">
                <Link to={resolvedTool.route}>View another →</Link>
              </Button>
              <Button
                variant="outline"
                className="button-toolbar-utility"
                onClick={async () => {
                  await navigator.clipboard.writeText(definition.copyText(payload, item))
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1200)
                }}
              >
                <Copy size={16} />
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {exportableSections.length > 0 ? (
                <>
                  <Button
                    variant="outline"
                    className="button-toolbar-utility"
                    onClick={() => {
                      trackTelemetry({
                        event_name: 'export_action_used',
                        tool_id: resolvedTool.id,
                        history_id: item.id,
                        access_mode: savedResult ? 'authenticated' : 'guest_demo',
                        saved: savedResult,
                        metadata: { format: 'txt' },
                      })
                      downloadTextFile(
                        sanitizeDownloadTitle(downloadTitle, 'txt'),
                        formatExportContent(exportableSections, 'txt'),
                      )
                    }}
                  >
                    <Download size={16} />
                    TXT
                  </Button>
                  <Button
                    variant="outline"
                    className="button-toolbar-utility"
                    onClick={() => {
                      trackTelemetry({
                        event_name: 'export_action_used',
                        tool_id: resolvedTool.id,
                        history_id: item.id,
                        access_mode: savedResult ? 'authenticated' : 'guest_demo',
                        saved: savedResult,
                        metadata: { format: 'md' },
                      })
                      downloadTextFile(
                        sanitizeDownloadTitle(downloadTitle, 'md'),
                        formatExportContent(exportableSections, 'md'),
                        'text/markdown;charset=utf-8',
                      )
                    }}
                  >
                    <Download size={16} />
                    Markdown
                  </Button>
                </>
              ) : definition.download ? (
                <Button
                  variant="outline"
                  className="button-toolbar-utility"
                  onClick={() => {
                    trackTelemetry({
                      event_name: 'export_action_used',
                      tool_id: resolvedTool.id,
                      history_id: item.id,
                      access_mode: savedResult ? 'authenticated' : 'guest_demo',
                      saved: savedResult,
                      metadata: { format: 'custom-download' },
                    })
                    const download = definition.download?.(payload, item)
                    if (!download) return
                    downloadTextFile(download.filename, download.content)
                  }}
                >
                  <Download size={16} />
                  Download
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="button-toolbar-utility"
                disabled={status !== 'authenticated' || favoriteToggle.isPending}
                onClick={() => {
                  if (!savedResult) {
                    openAuthDialog({
                      to: resolvedTool.route,
                      reason: 'save-demo-result',
                      label: 'Sign in to save and continue',
                    })
                    return
                  }
                  favoriteToggle.mutate({
                    historyId: item.id,
                    isFavorite: !item.is_favorite,
                  })
                }}
              >
                <Star
                  size={16}
                  fill={item.is_favorite ? 'currentColor' : 'none'}
                />
                {savedResult ? (item.is_favorite ? 'Favorited' : 'Favorite') : 'Sign in to save'}
              </Button>
            </div>
          </div>
        </div>
        {guestResult ? (
          <div className="tool-seed-banner">
            <span>
              {status === 'authenticated'
                ? 'This result was generated in guest demo mode. Rerun it while signed in to save it to history.'
                : 'Guest demo mode is active. Sign in to save this run, continue the guided workflow, and access history.'}
            </span>
            {status !== 'authenticated' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  openAuthDialog({
                    to: resolvedTool.route,
                    reason: 'guest-demo-result',
                    label: 'Sign in to save and continue',
                  })
                }
              >
                Sign in to save and continue
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: resolvedTool.route })}
              >
                Rerun in workspace
              </Button>
            )}
          </div>
        ) : null}
        <div className="section-card grid gap-2 p-5">
          <p className="eyebrow">Why this result was generated</p>
          <p>{typeof summary.headline === 'string' ? summary.headline : resolvedTool.summary}</p>
          <p className="small-copy muted-copy">
            {typeof summary.confidence_note === 'string'
              ? summary.confidence_note
              : 'This output is heuristic and advisory, not a hiring prediction.'}
          </p>
        </div>
        <div className="result-body">
          {definition.render(payload, item, resolvedTool)}
        </div>
        <div className="cta-card-grid">
          {resolvedTool.nextActions.map((action) => {
            const nextTool = tools[action.to]
            return (
              <div key={action.label} className="cta-card p-5">
                <div className="grid gap-3">
                  <div className="flex items-center gap-3">
                    <nextTool.icon size={18} style={{ color: nextTool.accent }} />
                    <h3 className="section-title">{action.label}</h3>
                  </div>
                  <p className="small-copy muted-copy">{nextTool.summary}</p>
                  <Button
                    className="button-hero-primary"
                    onClick={() => {
                      if (!canContinueWorkflow) {
                        openAuthDialog({
                          to: nextTool.route,
                          reason: 'continue-workflow',
                          label: 'Sign in to save and continue',
                        })
                        return
                      }
                      void navigate({ to: nextTool.route })
                    }}
                  >
                    {canContinueWorkflow
                      ? `Open ${nextTool.shortLabel}`
                      : `Sign in to open ${nextTool.shortLabel}`}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </PageFrame>
  )
}
