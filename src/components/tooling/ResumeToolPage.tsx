import { useState, useCallback, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRight, RotateCcw } from 'lucide-react'
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
import { resultDefinitions } from '#/lib/tools/resultDefinitions'
import type { ToolRunDetail } from '#/lib/api/schemas'

type Phase = 'upload' | 'form' | 'loading' | 'results'

const tool = tools.resume
const resumeDefinition = resultDefinitions.resume

const LOADING_STAGES = [
  { label: 'Parsing resume…' },
  { label: 'Analyzing skills & experience…' },
  { label: 'Scoring & generating insights…' },
  { label: 'Finalizing results…' },
]

export function ResumeToolPage() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('upload')
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [showPasteMode, setShowPasteMode] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const result = await tool.submit(payload)

      const historyId =
        typeof result.history_id === 'string' ? result.history_id : ''

      writeWorkflowContext({
        historyId,
        lastToolId: 'resume',
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
    setShowPasteMode(false)
    setPhase('form')
  }, [])

  const handleSubmit = useCallback(() => {
    const nextErrors: Record<string, string> = {}
    if (!resumeText.trim()) {
      nextErrors.resumeText = 'Resume text is required.'
    } else if (resumeText.trim().length < 50) {
      nextErrors.resumeText = 'Resume must be at least 50 characters.'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPhase('loading')
    mutation.mutate({
      resume_text: resumeText,
      job_description: jobDescription || undefined,
    })
  }, [resumeText, jobDescription, mutation])

  const handleStartOver = useCallback(() => {
    setPhase('upload')
    setResumeText('')
    setJobDescription('')
    setShowPasteMode(false)
    setErrors({})
    mutation.reset()
  }, [mutation])

  const resultPayload = mutation.data as Record<string, unknown> | undefined
  const fakeItem = {
    id: '',
    tool_name: 'resume',
    label: '',
    created_at: new Date().toISOString(),
    is_favorite: false,
    result_payload: resultPayload || {},
  } as ToolRunDetail

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav
        label={tool.label}
        icon={tool.icon}
        accent={tool.accent}
      />

      <div className="tool-fs-body">
        <AnimatePresence mode="wait">
          {/* Phase: Upload (dropzone hero) */}
          {phase === 'upload' && !showPasteMode && (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="resume-bespoke-header">
                <ToolHeroIllustration toolId="resume" accent={tool.accent} />
                <h1 className="resume-bespoke-title">Resume Analyzer</h1>
                <p className="resume-bespoke-subtitle">
                  Score your resume, identify strengths, and get prioritized
                  action items to improve it.
                </p>
              </div>
              <DropzoneHero
                onParsed={handleResumeParsed}
                onPasteText={() => setShowPasteMode(true)}
                accent={tool.accent}
              />
            </motion.div>
          )}

          {/* Phase: Upload but paste mode */}
          {phase === 'upload' && showPasteMode && (
            <motion.div
              key="paste"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="resume-paste-section"
            >
              <div className="resume-bespoke-header">
                <h1 className="resume-bespoke-title">Paste your resume</h1>
                <p className="resume-bespoke-subtitle">
                  Copy-paste the contents of your resume below.
                </p>
              </div>
              <div className="grid gap-2">
                <Textarea
                  rows={14}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste the full text of your resume here…"
                  className="resume-paste-textarea"
                />
                {errors.resumeText && (
                  <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                    {errors.resumeText}
                  </p>
                )}
              </div>
              <div className="resume-paste-actions">
                <Button
                  variant="outline"
                  onClick={() => setShowPasteMode(false)}
                >
                  ← Upload file instead
                </Button>
                <Button
                  onClick={() => {
                    if (!resumeText.trim() || resumeText.trim().length < 50) {
                      setErrors({ resumeText: 'Resume must be at least 50 characters.' })
                      return
                    }
                    setErrors({})
                    setPhase('form')
                  }}
                  style={{ background: tool.accent, color: '#071611' } as CSSProperties}
                >
                  Continue
                  <ArrowRight size={16} />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Phase: Form (additional options after resume is loaded) */}
          {phase === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="resume-form-section"
            >
              <DropzoneHero
                onParsed={handleResumeParsed}
                accent={tool.accent}
                compact
              />

              <div className="resume-optional-fields">
                <div className="resume-optional-header">
                  <Badge variant="outline">Optional</Badge>
                  <h2 className="section-title">Add context for better results</h2>
                  <p className="muted-copy">
                    Adding a target job description gives more specific feedback
                    on how well your resume matches.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="resume-job-desc">Job description</Label>
                  <Textarea
                    id="resume-job-desc"
                    rows={6}
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste a target job posting for more contextual feedback…"
                  />
                </div>

                <JobImportCard
                  onImported={(desc) => setJobDescription(desc)}
                />

                {mutation.error && (
                  <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                    {mutation.error instanceof Error
                      ? mutation.error.message
                      : 'Analysis failed. Please try again.'}
                  </p>
                )}
              </div>

              <div className="resume-submit-area">
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={mutation.isPending}
                  style={{ background: tool.accent, color: '#071611' } as CSSProperties}
                  className="resume-submit-btn"
                >
                  {tool.entryPointLabel}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Phase: Loading (cinematic animation) */}
          {phase === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="resume-loading-section"
            >
              <CinematicLoader accent={tool.accent} stages={LOADING_STAGES} />
            </motion.div>
          )}

          {/* Phase: Results (inline, section by section) */}
          {phase === 'results' && resultPayload && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="resume-results-section"
            >
              <SectionReveal index={0}>
                <div className="resume-result-header">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      variant="outline"
                      style={{ borderColor: tool.accent, color: tool.accent }}
                    >
                      {tool.label}
                    </Badge>
                    <Badge variant="outline">Analysis complete</Badge>
                  </div>
                  <h2 className="page-title">{tool.resultTitle}</h2>
                </div>
              </SectionReveal>

              <SectionReveal index={1}>
                {resumeDefinition.render(resultPayload, fakeItem, tool)}
              </SectionReveal>

              <SectionReveal index={2}>
                <div className="resume-result-actions">
                  <Button
                    variant="outline"
                    onClick={handleStartOver}
                    className="resume-start-over"
                  >
                    <RotateCcw size={16} />
                    Start Over
                  </Button>
                </div>
              </SectionReveal>

              <SectionReveal index={3}>
                <div className="resume-next-actions">
                  <h3 className="section-title mb-4">What's next?</h3>
                  <div className="cta-card-grid">
                    {tool.nextActions.map((action) => {
                      const nextTool = tools[action.to]
                      return (
                        <div key={action.label} className="cta-card p-5">
                          <div className="grid gap-3">
                            <div className="flex items-center gap-3">
                              <nextTool.icon
                                size={18}
                                style={{ color: nextTool.accent }}
                              />
                              <h3 className="section-title">{action.label}</h3>
                            </div>
                            <p className="small-copy muted-copy">
                              {nextTool.summary}
                            </p>
                            <Button asChild className="button-hero-primary">
                              <Link to={nextTool.route}>
                                Open {nextTool.shortLabel}
                              </Link>
                            </Button>
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
