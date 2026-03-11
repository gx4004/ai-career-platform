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

type Phase = 'input' | 'loading' | 'results'

const tool = tools['job-match']
const definition = resultDefinitions['job-match']

const LOADING_STAGES = [
  { label: 'Parsing inputs…' },
  { label: 'Comparing skills & requirements…' },
  { label: 'Calculating fit score…' },
  { label: 'Generating recommendations…' },
]

export function JobMatchToolPage() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('input')
  const [resumeText, setResumeText] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [resumeReady, setResumeReady] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const result = await tool.submit(payload)
      writeWorkflowContext({
        historyId: typeof result.history_id === 'string' ? result.history_id : '',
        lastToolId: 'job-match',
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
    setResumeReady(true)
  }, [])

  const handleSubmit = useCallback(() => {
    const nextErrors: Record<string, string> = {}
    if (!resumeText.trim() || resumeText.trim().length < 50)
      nextErrors.resumeText = 'Resume must be at least 50 characters.'
    if (!jobDescription.trim() || jobDescription.trim().length < 50)
      nextErrors.jobDescription = 'Job description must be at least 50 characters.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setPhase('loading')
    mutation.mutate({ resume_text: resumeText, job_description: jobDescription })
  }, [resumeText, jobDescription, mutation])

  const handleStartOver = useCallback(() => {
    setPhase('input')
    setResumeText('')
    setJobDescription('')
    setResumeReady(false)
    setErrors({})
    mutation.reset()
  }, [mutation])

  const resultPayload = mutation.data as Record<string, unknown> | undefined
  const fakeItem = { id: '', tool_name: 'job-match', label: '', created_at: new Date().toISOString(), is_favorite: false, result_payload: resultPayload || {} } as ToolRunDetail

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} />
      <div className="tool-fs-body tool-fs-body--wide">
        <AnimatePresence mode="wait">
          {phase === 'input' && (
            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <div className="resume-bespoke-header">
                <ToolHeroIllustration toolId="job-match" accent={tool.accent} />
                <h1 className="resume-bespoke-title">Job Match</h1>
                <p className="resume-bespoke-subtitle">Compare your resume against a specific role to see fit score, matched skills, and gaps.</p>
              </div>

              <div className="jobmatch-split">
                <div className="jobmatch-panel">
                  <h3 className="section-title">Your Resume</h3>
                  {resumeReady ? (
                    <DropzoneHero onParsed={handleResumeParsed} accent={tool.accent} compact />
                  ) : (
                    <DropzoneHero
                      onParsed={handleResumeParsed}
                      onPasteText={() => setResumeReady(true)}
                      accent={tool.accent}
                      compact
                    />
                  )}
                  {!resumeReady && (
                    <div className="grid gap-2">
                      <Label htmlFor="jm-resume">Or paste resume text</Label>
                      <Textarea
                        id="jm-resume"
                        rows={8}
                        value={resumeText}
                        onChange={(e) => {
                          setResumeText(e.target.value)
                          if (e.target.value.trim().length >= 50) setResumeReady(true)
                        }}
                        placeholder="Paste your resume here…"
                      />
                    </div>
                  )}
                  {errors.resumeText && <p className="small-copy" style={{ color: 'var(--destructive)' }}>{errors.resumeText}</p>}
                </div>

                <div className="jobmatch-panel">
                  <h3 className="section-title">Job Description</h3>
                  <Textarea
                    rows={10}
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the full job posting here…"
                  />
                  {errors.jobDescription && <p className="small-copy" style={{ color: 'var(--destructive)' }}>{errors.jobDescription}</p>}
                  <div style={{ marginTop: 'auto' }}>
                    <JobImportCard onImported={(desc) => setJobDescription(desc)} />
                  </div>
                </div>
              </div>

              <div className="resume-submit-area" style={{ marginTop: '1.5rem' }}>
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
              {mutation.error && <p className="small-copy text-center mt-2" style={{ color: 'var(--destructive)' }}>{mutation.error instanceof Error ? mutation.error.message : 'Match failed.'}</p>}
            </motion.div>
          )}

          {phase === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="resume-loading-section">
              <CinematicLoader accent={tool.accent} stages={LOADING_STAGES} />
            </motion.div>
          )}

          {phase === 'results' && resultPayload && (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="resume-results-section">
              <SectionReveal index={0}>
                <div className="resume-result-header">
                  <Badge variant="outline" style={{ borderColor: tool.accent, color: tool.accent }}>{tool.label}</Badge>
                  <h2 className="page-title">{tool.resultTitle}</h2>
                </div>
              </SectionReveal>
              <SectionReveal index={1}>{definition.render(resultPayload, fakeItem, tool)}</SectionReveal>
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
