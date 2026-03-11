import { useState, useCallback } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Copy, Star, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
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

export const Route = createFileRoute('/interview/result/$historyId')({
  head: () => ({
    meta: [{ title: 'Interview Result | Career Workbench' }],
  }),
  component: InterviewResultPage,
})

type Confidence = '😟' | '😐' | '🙂' | '😊'

const CONFIDENCE_OPTIONS: { value: Confidence; label: string }[] = [
  { value: '😟', label: 'Not sure' },
  { value: '😐', label: 'So-so' },
  { value: '🙂', label: 'Good' },
  { value: '😊', label: 'Nailed it' },
]

function toString(v: unknown): string { return typeof v === 'string' ? v : '' }

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((i) => {
    if (typeof i === 'string') return [i]
    if (i && typeof i === 'object') { const t = (i as Record<string, unknown>).label || (i as Record<string, unknown>).name || (i as Record<string, unknown>).skill; return typeof t === 'string' ? [t] : [] }
    return []
  })
}

function normalizeQA(payload: Record<string, unknown>) {
  const raw = (payload.questions || payload.qa_pairs || payload.interview_questions || []) as Record<string, unknown>[]
  if (!Array.isArray(raw)) return []
  return raw.map((item, i) => ({
    question: toString(item.question || item.prompt || `Question ${i + 1}`),
    answer: toString(item.answer || item.suggested_answer || item.response),
    keyPoints: toStringArray(item.key_points || item.tags || []),
  }))
}

function FlashcardPractice({ questions, accent }: { questions: ReturnType<typeof normalizeQA>; accent?: string }) {
  const [ci, setCi] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [ratings, setRatings] = useState<Record<number, Confidence>>({})
  const [showSummary, setShowSummary] = useState(false)
  const total = questions.length
  const allRated = Object.keys(ratings).length === total
  const current = questions[ci]

  const goNext = useCallback(() => { if (ci < total - 1) { setFlipped(false); setCi((i) => i + 1) } else if (allRated) setShowSummary(true) }, [ci, total, allRated])
  const goPrev = useCallback(() => { if (ci > 0) { setFlipped(false); setCi((i) => i - 1) } }, [ci])
  const rate = useCallback((c: Confidence) => { setRatings((p) => ({ ...p, [ci]: c })); setTimeout(goNext, 400) }, [ci, goNext])

  if (showSummary) {
    const counts: Record<Confidence, number> = { '😟': 0, '😐': 0, '🙂': 0, '😊': 0 }
    Object.values(ratings).forEach((r) => { counts[r]++ })
    return (
      <div className="flashcard-summary">
        <h3 className="section-title mb-4">Practice Summary</h3>
        <div className="flashcard-summary-grid">
          {CONFIDENCE_OPTIONS.map((opt) => (
            <div key={opt.value} className="flashcard-summary-item">
              <span className="flashcard-summary-emoji">{opt.value}</span>
              <span className="flashcard-summary-count">{counts[opt.value]}</span>
              <span className="flashcard-summary-label">{opt.label}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-3 mt-6">
          <Button variant="outline" onClick={() => { setShowSummary(false); setCi(0); setFlipped(false); setRatings({}) }}>Practice Again</Button>
        </div>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="flashcard-stack" style={{ '--tool-accent': accent } as React.CSSProperties}>
      <div className="flashcard-progress"><div className="flashcard-progress-bar" style={{ width: `${((ci + 1) / total) * 100}%` }} /></div>
      <p className="flashcard-counter">{ci + 1} / {total}</p>
      <div className={`flashcard ${flipped ? 'flashcard--flipped' : ''}`} onClick={() => setFlipped((f) => !f)}>
        <div className="flashcard-front"><Badge variant="outline" className="mb-3">Question</Badge><p className="flashcard-question">{current.question}</p><p className="flashcard-hint">Tap to reveal answer</p></div>
        <div className="flashcard-back"><Badge variant="outline" className="mb-3">Answer</Badge><p className="flashcard-answer">{current.answer || 'No suggested answer.'}</p>{current.keyPoints.length > 0 && <div className="flashcard-keypoints">{current.keyPoints.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}</div>}</div>
      </div>
      {flipped && !ratings[ci] && (
        <motion.div className="flashcard-rating" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="small-copy muted-copy mb-2">How confident do you feel?</p>
          <div className="flashcard-rating-options">{CONFIDENCE_OPTIONS.map((opt) => <button key={opt.value} type="button" className="flashcard-rating-btn" onClick={() => rate(opt.value)}><span className="flashcard-rating-emoji">{opt.value}</span><span className="flashcard-rating-label">{opt.label}</span></button>)}</div>
        </motion.div>
      )}
      <div className="flashcard-nav">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={ci === 0}><ChevronLeft size={16} /></Button>
        <Button variant="outline" size="sm" onClick={goNext} disabled={ci >= total - 1 && !allRated}>{ci >= total - 1 && allRated ? 'View Summary' : <ChevronRight size={16} />}</Button>
      </div>
    </div>
  )
}

function InterviewResultPage() {
  const { historyId } = Route.useParams()
  const tool = tools.interview
  const { status } = useSession()
  const favoriteToggle = useFavoriteToggle()
  const [copied, setCopied] = useState(false)
  const [practiceMode, setPracticeMode] = useState(false)

  const query = useQuery({
    queryKey: ['tool-run', historyId],
    queryFn: () => getHistoryItem(historyId),
  })

  if (query.isPending) {
    return <AppStatePanel badge="Loading result" title="Fetching saved output" description="The result payload is loading from history." scene="emptyPlanning" />
  }

  if (query.isError || !query.data) {
    return <AppStatePanel badge="Result unavailable" title="This result could not be loaded" description="The saved run is missing, inaccessible, or the backend is offline." scene="emptyPlanning" detail={query.error instanceof Error ? query.error.message : undefined} actions={[{ label: 'Back to history', to: '/history' }, { label: 'Generate new deck', to: '/interview', variant: 'outline' }]} />
  }

  const item = query.data
  const resolvedTool = getToolByHistoryName(item.tool_name) || tool
  const definition = resultDefinitions[resolvedTool.id]
  const payload = item.result_payload
  const questions = normalizeQA(payload)

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} actions={
        <div className="flex items-center gap-2">
          {questions.length > 0 && (
            <Button variant={practiceMode ? 'default' : 'outline'} size="sm" onClick={() => setPracticeMode((p) => !p)}>
              {practiceMode ? 'List view' : 'Practice mode'}
            </Button>
          )}
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
                <ToolHeroIllustration toolId="interview" accent={tool.accent} />
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
            {practiceMode && questions.length > 0 ? (
              <FlashcardPractice questions={questions} accent={tool.accent} />
            ) : (
              definition.render(payload, item, resolvedTool)
            )}
          </SectionReveal>
          <SectionReveal index={2}>
            <div className="resume-result-actions">
              <Button variant="outline" asChild><Link to="/interview"><RotateCcw size={16} /> Generate new deck</Link></Button>
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
