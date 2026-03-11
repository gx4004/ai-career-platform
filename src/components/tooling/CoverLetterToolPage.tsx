import { useState, useCallback, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRight, RotateCcw, Bold, Italic, Heading, Copy, Download } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
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

const tool = tools['cover-letter']

const LOADING_STAGES = [
  { label: 'Analyzing resume & role…' },
  { label: 'Structuring cover letter…' },
  { label: 'Writing draft…' },
  { label: 'Polishing tone…' },
]

const TONES = ['Professional', 'Confident', 'Warm'] as const

function pickText(payload: Record<string, unknown>): string {
  for (const k of ['cover_letter', 'letter', 'content', 'text']) {
    if (typeof payload[k] === 'string') return payload[k] as string
  }
  return ''
}

function CoverLetterEditor({ initialText }: { initialText: string }) {
  const [copied, setCopied] = useState(false)
  const editorId = 'cl-editor'

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    document.getElementById(editorId)?.focus()
  }, [])

  const handleCopy = useCallback(async () => {
    const el = document.getElementById(editorId)
    if (!el) return
    await navigator.clipboard.writeText(el.innerText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
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

  return (
    <div className="cl-editor-wrap">
      <div className="cl-editor-toolbar">
        <div className="cl-editor-toolbar-group">
          <button type="button" className="cl-toolbar-btn" onClick={() => exec('bold')} title="Bold"><Bold size={16} /></button>
          <button type="button" className="cl-toolbar-btn" onClick={() => exec('italic')} title="Italic"><Italic size={16} /></button>
          <button type="button" className="cl-toolbar-btn" onClick={() => exec('formatBlock', 'H3')} title="Heading"><Heading size={16} /></button>
        </div>
        <div className="cl-editor-toolbar-group">
          <button type="button" className="cl-toolbar-btn" onClick={handleCopy} aria-label="Copy to clipboard"><Copy size={14} /> {copied ? 'Copied!' : 'Copy'}</button>
          <button type="button" className="cl-toolbar-btn" onClick={handleDownload} aria-label="Download as text file"><Download size={14} /> Download</button>
        </div>
      </div>
      <div
        id={editorId}
        className="cl-editor-content"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Cover letter editor"
        aria-multiline="true"
        dangerouslySetInnerHTML={{ __html: initialText.replace(/\n/g, '<br>') }}
      />
    </div>
  )
}

export function CoverLetterToolPage() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('upload')
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [tone, setTone] = useState<string>('Professional')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const result = await tool.submit(payload)
      writeWorkflowContext({
        historyId: typeof result.history_id === 'string' ? result.history_id : '',
        lastToolId: 'cover-letter',
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
    mutation.mutate({ resume_text: resumeText, job_description: jobDescription, tone: tone || undefined })
  }, [resumeText, jobDescription, tone, mutation])

  const handleStartOver = useCallback(() => {
    setPhase('upload')
    setResumeText('')
    setJobDescription('')
    setTone('Professional')
    setErrors({})
    mutation.reset()
  }, [mutation])

  const resultPayload = mutation.data as Record<string, unknown> | undefined
  const letterText = resultPayload ? pickText(resultPayload) : ''

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} />
      <div className="tool-fs-body">
        <AnimatePresence mode="wait">
          {phase === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }}>
              <div className="resume-bespoke-header">
                <ToolHeroIllustration toolId="cover-letter" accent={tool.accent} />
                <h1 className="resume-bespoke-title">Cover Letter Generator</h1>
                <p className="resume-bespoke-subtitle">Generate a tailored cover letter from your resume and the target job posting.</p>
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
                  <Label>Tone</Label>
                  <div className="flex flex-wrap gap-2">
                    {TONES.map((t) => (
                      <Button key={t} variant={tone === t ? 'default' : 'outline'} type="button" onClick={() => setTone(t)}>{t}</Button>
                    ))}
                  </div>
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

          {phase === 'results' && letterText && (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="resume-results-section">
              <SectionReveal index={0}>
                <div className="resume-result-header">
                  <Badge variant="outline" style={{ borderColor: tool.accent, color: tool.accent }}>{tool.label}</Badge>
                  <h2 className="page-title">{tool.resultTitle}</h2>
                  <p className="muted-copy">Edit the draft below, then copy or download.</p>
                </div>
              </SectionReveal>
              <SectionReveal index={1}>
                <CoverLetterEditor initialText={letterText} />
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
