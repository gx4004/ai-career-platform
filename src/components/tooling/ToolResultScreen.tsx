import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Copy, Download, Star } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { getHistoryItem } from '#/lib/api/client'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useSession } from '#/hooks/useSession'
import { resultDefinitions } from '#/lib/tools/resultDefinitions'
import { getToolByHistoryName, tools } from '#/lib/tools/registry'
import type { ToolId } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
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
  const { status } = useSession()
  const favoriteToggle = useFavoriteToggle()
  const [copied, setCopied] = useState(false)
  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
  })

  if (query.isPending) {
    return (
      <AppStatePanel
        badge="Loading result"
        title="Fetching saved output"
        description="The result payload is loading from history."
        scene="emptyPlanning"
      />
    )
  }

  if (query.isError || !query.data) {
    return (
      <AppStatePanel
        badge="Result unavailable"
        title="This result could not be loaded"
        description="The saved run is missing, inaccessible, or the backend is offline."
        scene="emptyPlanning"
        detail={query.error instanceof Error ? query.error.message : undefined}
        actions={[
          { label: 'Back to history', to: '/history' },
          { label: 'Run the tool again', to: tools[toolId].route, variant: 'outline' },
        ]}
      />
    )
  }

  const item = query.data
  const resolvedTool = getToolByHistoryName(item.tool_name) || tools[toolId]
  const definition = resultDefinitions[resolvedTool.id]
  const payload = item.result_payload

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
                  Saved result
                </Badge>
              </div>
              <div className="grid gap-1">
                <h1 className="page-title">{resolvedTool.resultTitle}</h1>
                <p className="muted-copy">
                  {item.label || 'Untitled run'} • {new Date(item.created_at).toLocaleString()}
                </p>
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
              {definition.download ? (
                <Button
                  variant="outline"
                  className="button-toolbar-utility"
                  onClick={() => {
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
                onClick={() =>
                  favoriteToggle.mutate({
                    historyId: item.id,
                    isFavorite: !item.is_favorite,
                  })
                }
              >
                <Star
                  size={16}
                  fill={item.is_favorite ? 'currentColor' : 'none'}
                />
                {item.is_favorite ? 'Favorited' : 'Favorite'}
              </Button>
            </div>
          </div>
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
                  <Button asChild className="button-hero-primary">
                    <Link to={nextTool.route}>Open {nextTool.shortLabel}</Link>
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
