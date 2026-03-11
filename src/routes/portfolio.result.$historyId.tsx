import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Copy, Star, RotateCcw } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { FloatingToolNav } from '#/components/tooling/FloatingToolNav'
import { SectionReveal } from '#/components/tooling/SectionReveal'
import { ToolHeroIllustration } from '#/components/tooling/ToolHeroIllustration'
import { getHistoryItem } from '#/lib/api/client'
import { useFavoriteToggle } from '#/hooks/useFavoriteToggle'
import { useSession } from '#/hooks/useSession'
import { resultDefinitions } from '#/lib/tools/resultDefinitions'
import { getToolByHistoryName, tools } from '#/lib/tools/registry'

export const Route = createFileRoute('/portfolio/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Portfolio Result | Career Workbench' }],
  }),
  component: PortfolioResultPage,
})

function PortfolioResultPage() {
  const { historyId } = Route.useParams()
  const tool = tools.portfolio
  const { status } = useSession()
  const favoriteToggle = useFavoriteToggle()
  const [copied, setCopied] = useState(false)

  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
  })

  if (query.isPending) {
    return <AppStatePanel badge="Loading result" title="Fetching saved output" description="The result payload is loading from history." scene="emptyPlanning" />
  }

  if (query.isError || !query.data) {
    return <AppStatePanel badge="Result unavailable" title="This result could not be loaded" description="The saved run is missing, inaccessible, or the backend is offline." scene="emptyPlanning" detail={query.error instanceof Error ? query.error.message : undefined} actions={[{ label: 'Back to history', to: '/history' }, { label: 'Plan again', to: '/portfolio', variant: 'outline' }]} />
  }

  const item = query.data
  const resolvedTool = getToolByHistoryName(item.tool_name) || tool
  const definition = resultDefinitions[resolvedTool.id]
  const payload = item.result_payload

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(definition.copyText(payload, item)); setCopied(true); setTimeout(() => setCopied(false), 1200) }}>
            <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" disabled={status !== 'authenticated' || favoriteToggle.isPending} onClick={() => favoriteToggle.mutate({ historyId: item.id, isFavorite: !item.is_favorite })}>
            <Star size={14} fill={item.is_favorite ? 'currentColor' : 'none'} />
          </Button>
        </div>
      } />
      <div className="tool-fs-body">
        <div className="resume-results-section">
          <SectionReveal index={0}>
            <div className="resume-result-header">
              <div className="flex flex-wrap items-center gap-3">
                <ToolHeroIllustration toolId="portfolio" accent={tool.accent} />
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" style={{ borderColor: tool.accent, color: tool.accent }}>{resolvedTool.label}</Badge>
                    <Badge variant="outline">Saved result</Badge>
                  </div>
                  <h1 className="page-title">{resolvedTool.resultTitle}</h1>
                  <p className="muted-copy">{item.label || 'Untitled run'} • {new Date(item.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </SectionReveal>
          <SectionReveal index={1}>{definition.render(payload, item, resolvedTool)}</SectionReveal>
          <SectionReveal index={2}>
            <div className="resume-result-actions">
              <Button variant="outline" asChild><Link to="/portfolio"><RotateCcw size={16} /> Plan again</Link></Button>
            </div>
          </SectionReveal>
          <SectionReveal index={3}>
            <div className="resume-next-actions">
              <h3 className="section-title mb-4">What's next?</h3>
              <div className="cta-card-grid">
                {resolvedTool.nextActions.map((action) => {
                  const nt = tools[action.to]
                  return (
                    <div key={action.label} className="cta-card p-5">
                      <div className="grid gap-3">
                        <div className="flex items-center gap-3"><nt.icon size={18} style={{ color: nt.accent }} /><h3 className="section-title">{action.label}</h3></div>
                        <p className="small-copy muted-copy">{nt.summary}</p>
                        <Button asChild className="button-hero-primary"><Link to={nt.route}>Open {nt.shortLabel}</Link></Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </SectionReveal>
        </div>
      </div>
    </ToolFullScreen>
  )
}
