import { useState, useCallback, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRight, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { Input } from '#/components/ui/input'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { FloatingToolNav } from '#/components/tooling/FloatingToolNav'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { CinematicLoader } from '#/components/tooling/CinematicLoader'
import { SectionReveal } from '#/components/tooling/SectionReveal'
import { ToolHeroIllustration } from '#/components/tooling/ToolHeroIllustration'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { tools } from '#/lib/tools/registry'
import { writeWorkflowContext } from '#/lib/tools/drafts'

type Phase = 'upload' | 'form' | 'loading' | 'results'
type Confidence = '😟' | '😐' | '🙂' | '😊'

const tool = tools.interview

const LOADING_STAGES = [
  { label: 'Analyzing role requirements…' },
  { label: 'Generating questions…' },
  { label: 'Building answer guidance…' },
  { label: 'Creating practice deck…' },
]

const CONFIDENCE_OPTIONS: { value: Confidence; label: string }[] = [
  { value: '😟', label: 'Not sure' },
  { value: '😐', label: 'So-so' },
  { value: '🙂', label: 'Good' },
  { value: '😊', label: 'Nailed it' },
]

function toString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((i) => {
    if (typeof i === 'string') return [i]
    if (i && typeof i === 'object') {
      const t = (i as Record<string, unknown>).label || (i as Record<string, unknown>).name || (i as Record<string, unknown>).skill
      return typeof t === 'string' ? [t] : []
    }
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

function FlashcardStack({
  questions,
  accent,
}: {
  questions: ReturnType<typeof normalizeQA>
  accent?: string
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [ratings, setRatings] = useState<Record<number, Confidence>>({})
  const [showSummary, setShowSummary] = useState(false)

  const current = questions[currentIndex]
  const total = questions.length
  const allRated = Object.keys(ratings).length === total

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setFlipped(false)
      setCurrentIndex((i) => i + 1)
    } else if (allRated) {
      setShowSummary(true)
    }
  }, [currentIndex, total, allRated])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setFlipped(false)
      setCurrentIndex((i) => i - 1)
    }
  }, [currentIndex])

  const rate = useCallback((confidence: Confidence) => {
    setRatings((prev) => ({ ...prev, [currentIndex]: confidence }))
    setTimeout(goNext, 400)
  }, [currentIndex, goNext])

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
          <Button variant="outline" onClick={() => { setShowSummary(false); setCurrentIndex(0); setFlipped(false); setRatings({}) }}>
            Practice Again
          </Button>
        </div>
      </div>
    )
  }

  if (!current) return null

  return (
    <div className="flashcard-stack" style={{ '--tool-accent': accent } as CSSProperties}>
      <div className="flashcard-progress">
        <div className="flashcard-progress-bar" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
      </div>
      <p className="flashcard-counter">{currentIndex + 1} / {total}</p>

      <div
        className={`flashcard ${flipped ? 'flashcard--flipped' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Flip card to question' : 'Flip card to reveal answer'}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped((f) => !f) } }}
      >
        <div className="flashcard-front">
          <Badge variant="outline" className="mb-3">Question</Badge>
          <p className="flashcard-question">{current.question}</p>
          <p className="flashcard-hint">Press Enter or tap to reveal answer</p>
        </div>
        <div className="flashcard-back">
          <Badge variant="outline" className="mb-3">Answer</Badge>
          <p className="flashcard-answer">{current.answer || 'No suggested answer provided.'}</p>
          {current.keyPoints.length > 0 && (
            <div className="flashcard-keypoints">
              {current.keyPoints.map((p) => <Badge key={p} variant="outline">{p}</Badge>)}
            </div>
          )}
        </div>
      </div>

      {flipped && !ratings[currentIndex] && (
        <motion.div className="flashcard-rating" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <p className="small-copy muted-copy mb-2">How confident do you feel?</p>
          <div className="flashcard-rating-options">
            {CONFIDENCE_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" className="flashcard-rating-btn" onClick={() => rate(opt.value)}>
                <span className="flashcard-rating-emoji">{opt.value}</span>
                <span className="flashcard-rating-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      <div className="flashcard-nav">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={currentIndex === 0}><ChevronLeft size={16} /></Button>
        <Button variant="outline" size="sm" onClick={goNext} disabled={currentIndex >= total - 1 && !allRated}>
          {currentIndex >= total - 1 && allRated ? 'View Summary' : <ChevronRight size={16} />}
        </Button>
      </div>
    </div>
  )
}

export function InterviewToolPage() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('upload')
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [numQuestions, setNumQuestions] = useState(6)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const result = await tool.submit(payload)
      writeWorkflowContext({
        historyId: typeof result.history_id === 'string' ? result.history_id : '',
        lastToolId: 'interview',
        resumeText: resumeText || undefined,
        jobDescription: jobDescription || undefined,
        updatedAt: Date.now(),
      })
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history-page'] })
      setPhase('results')
    },
  })

  const handleResumeParsed = useCallback((text: string) => {
    setResumeText(text)
    setPhase('form')
  }, [])

  const handleSubmit = useCallback(() => {
    const nextErrors: Record<string, string> = {}
    if (!resumeText.trim() || resumeText.trim().length < 50) nextErrors.resumeText = 'Resume must be at least 50 characters.'
    if (!jobDescription.trim() || jobDescription.trim().length < 50) nextErrors.jobDescription = 'Job description must be at least 50 characters.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setPhase('loading')
    mutation.mutate({ resume_text: resumeText, job_description: jobDescription, num_questions: numQuestions })
  }, [resumeText, jobDescription, numQuestions, mutation])

  const handleStartOver = useCallback(() => {
    setPhase('upload')
    setResumeText('')
    setJobDescription('')
    setNumQuestions(6)
    setErrors({})
    mutation.reset()
  }, [mutation])

  const resultPayload = mutation.data as Record<string, unknown> | undefined
  const questions = resultPayload ? normalizeQA(resultPayload) : []

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} />
      <div className="tool-fs-body">
        <AnimatePresence mode="wait">
          {phase === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }}>
              <div className="resume-bespoke-header">
                <ToolHeroIllustration toolId="interview" accent={tool.accent} />
                <h1 className="resume-bespoke-title">Interview Prep</h1>
                <p className="resume-bespoke-subtitle">Generate role-specific questions with suggested answers and practice with flashcards.</p>
              </div>
              <DropzoneHero onParsed={handleResumeParsed} onPasteText={() => setPhase('form')} accent={tool.accent} />
            </motion.div>
          )}

          {phase === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="resume-form-section">
              <DropzoneHero onParsed={handleResumeParsed} accent={tool.accent} compact />

              {!resumeText && (
                <div className="grid gap-2">
                  <Label>Resume text</Label>
                  <Textarea rows={10} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste your resume here…" />
                  {errors.resumeText && <p className="small-copy" style={{ color: 'var(--destructive)' }}>{errors.resumeText}</p>}
                </div>
              )}

              <div className="resume-optional-fields">
                <div className="grid gap-2">
                  <Label>Job description <span className="muted-copy">(Required)</span></Label>
                  <Textarea rows={8} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the target job posting…" />
                  {errors.jobDescription && <p className="small-copy" style={{ color: 'var(--destructive)' }}>{errors.jobDescription}</p>}
                </div>
                <JobImportCard onImported={(desc) => setJobDescription(desc)} />
                <div className="grid gap-2">
                  <Label htmlFor="int-num-q">Number of questions ({numQuestions})</Label>
                  <Input id="int-num-q" type="number" min={3} max={12} value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value) || 6)} />
                </div>
              </div>

              <div className="resume-submit-area">
                <Button size="lg" onClick={handleSubmit} disabled={mutation.isPending} style={{ background: tool.accent, color: '#071611' } as CSSProperties} className="resume-submit-btn">
                  {tool.entryPointLabel} <ArrowRight size={16} />
                </Button>
              </div>
              {mutation.error && <p className="small-copy text-center mt-2" style={{ color: 'var(--destructive)' }}>{mutation.error instanceof Error ? mutation.error.message : 'Generation failed.'}</p>}
            </motion.div>
          )}

          {phase === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="resume-loading-section">
              <CinematicLoader accent={tool.accent} stages={LOADING_STAGES} />
            </motion.div>
          )}

          {phase === 'results' && questions.length > 0 && (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="resume-results-section">
              <SectionReveal index={0}>
                <div className="resume-result-header">
                  <Badge variant="outline" style={{ borderColor: tool.accent, color: tool.accent }}>{tool.label}</Badge>
                  <h2 className="page-title">{tool.resultTitle}</h2>
                  <p className="muted-copy">{questions.length} questions generated. Tap cards to flip.</p>
                </div>
              </SectionReveal>
              <SectionReveal index={1}>
                <FlashcardStack questions={questions} accent={tool.accent} />
              </SectionReveal>
              <SectionReveal index={2}>
                <div className="resume-result-actions">
                  <Button variant="outline" onClick={handleStartOver}><RotateCcw size={16} /> Start Over</Button>
                </div>
              </SectionReveal>
              <SectionReveal index={3}>
                <div className="resume-next-actions">
                  <h3 className="section-title mb-4">What's next?</h3>
                  <div className="cta-card-grid">
                    {tool.nextActions.map((action) => {
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToolFullScreen>
  )
}
