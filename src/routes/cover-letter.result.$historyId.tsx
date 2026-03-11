import { useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Copy, Download, Star, RotateCcw, Bold, Italic, Heading } from 'lucide-react'
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
import { getToolByHistoryName, tools } from '#/lib/tools/registry'

export const Route = createFileRoute('/cover-letter/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Cover Letter Result | Career Workbench' }],
  }),
  component: CoverLetterResultPage,
})

function pickText(payload: Record<string, unknown>): string {
  for (const k of ['cover_letter', 'letter', 'content', 'text']) {
    if (typeof payload[k] === 'string') return payload[k] as string
  }
  return ''
}

function CoverLetterResultPage() {
  const { historyId } = Route.useParams()
  const tool = tools['cover-letter']
  const { status } = useSession()
  const favoriteToggle = useFavoriteToggle()
  const editorId = 'cl-result-editor'

  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
  })

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    document.getElementById(editorId)?.focus()
  }, [])

  const handleCopy = useCallback(async () => {
    const el = document.getElementById(editorId)
    if (el) await navigator.clipboard.writeText(el.innerText)
  }, [])

  const handleDownload = useCallback(() => {
    const el = document.getElementById(editorId)
    if (!el) return
    const blob = new Blob([el.innerText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cover-letter.txt'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  if (query.isPending) {
    return <AppStatePanel badge="Loading result" title="Fetching saved output" description="The result payload is loading from history." scene="emptyPlanning" />
  }

  if (query.isError || !query.data) {
    return <AppStatePanel badge="Result unavailable" title="This result could not be loaded" description="The saved run is missing, inaccessible, or the backend is offline." scene="emptyPlanning" detail={query.error instanceof Error ? query.error.message : undefined} actions={[{ label: 'Back to history', to: '/history' }, { label: 'Generate another', to: '/cover-letter', variant: 'outline' }]} />
  }

  const item = query.data
  const resolvedTool = getToolByHistoryName(item.tool_name) || tool
  const payload = item.result_payload
  const letterText = pickText(payload)

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}><Copy size={14} /> Copy</Button>
          <Button variant="outline" size="sm" onClick={handleDownload}><Download size={14} /></Button>
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
                <ToolHeroIllustration toolId="cover-letter" accent={tool.accent} />
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
          <SectionReveal index={1}>
            <div className="cl-editor-wrap">
              <div className="cl-editor-toolbar">
                <div className="cl-editor-toolbar-group">
                  <button type="button" className="cl-toolbar-btn" onClick={() => exec('bold')} title="Bold"><Bold size={16} /></button>
                  <button type="button" className="cl-toolbar-btn" onClick={() => exec('italic')} title="Italic"><Italic size={16} /></button>
                  <button type="button" className="cl-toolbar-btn" onClick={() => exec('formatBlock', 'H3')} title="Heading"><Heading size={16} /></button>
                </div>
              </div>
              <div id={editorId} className="cl-editor-content" contentEditable suppressContentEditableWarning role="textbox" aria-label="Cover letter editor" aria-multiline="true" dangerouslySetInnerHTML={{ __html: letterText.replace(/\n/g, '<br>') }} />
            </div>
          </SectionReveal>
          <SectionReveal index={2}>
            <div className="resume-result-actions">
              <Button variant="outline" asChild><Link to="/cover-letter"><RotateCcw size={16} /> Generate another</Link></Button>
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
