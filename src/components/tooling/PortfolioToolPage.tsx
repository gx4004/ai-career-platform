import { useState, useCallback, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRight, RotateCcw, Star as StarIcon } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Input } from '#/components/ui/input'
import { ToolFullScreen } from '#/components/tooling/ToolFullScreen'
import { FloatingToolNav } from '#/components/tooling/FloatingToolNav'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { CinematicLoader } from '#/components/tooling/CinematicLoader'
import { SectionReveal } from '#/components/tooling/SectionReveal'
import { ToolHeroIllustration } from '#/components/tooling/ToolHeroIllustration'
import { tools } from '#/lib/tools/registry'
import { writeWorkflowContext } from '#/lib/tools/drafts'

type Phase = 'upload' | 'form' | 'loading' | 'results'

const tool = tools.portfolio

const LOADING_STAGES = [
  { label: 'Analyzing your skills…' },
  { label: 'Matching to target role…' },
  { label: 'Designing project ideas…' },
  { label: 'Estimating complexity…' },
]

function toString(v: unknown): string { return typeof v === 'string' ? v : '' }
function toNumber(v: unknown): number | null { return typeof v === 'number' ? v : null }

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((i) => {
    if (typeof i === 'string') return [i]
    if (i && typeof i === 'object') { const t = (i as Record<string, unknown>).label || (i as Record<string, unknown>).name || (i as Record<string, unknown>).skill; return typeof t === 'string' ? [t] : [] }
    return []
  })
}

function normalizeProjects(payload: Record<string, unknown>) {
  const raw = (payload.projects || payload.portfolio_projects || payload.recommendations || []) as Record<string, unknown>[]
  if (!Array.isArray(raw)) return []
  return raw.map((item) => ({
    name: toString(item.name || item.title || item.project_name),
    description: toString(item.description || item.summary),
    skills: toStringArray(item.skills || item.technologies || item.tech_stack || []),
    complexity: toNumber(item.complexity || item.difficulty) || 1,
  }))
}

function ComplexityStars({ count }: { count: number }) {
  const clamped = Math.max(1, Math.min(3, count))
  return (
    <div className="flex items-center gap-0.5" title={`Complexity: ${clamped}/3`}>
      {Array.from({ length: 3 }, (_, i) => (
        <StarIcon key={i} size={12} fill={i < clamped ? 'var(--tool-accent)' : 'transparent'} color={i < clamped ? 'var(--tool-accent)' : 'var(--muted-foreground)'} />
      ))}
    </div>
  )
}

function ProjectCard({ project }: { project: ReturnType<typeof normalizeProjects>[0] }) {
  return (
    <div className="portfolio-project-card">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="section-title">{project.name || 'Project idea'}</h3>
        <ComplexityStars count={project.complexity} />
      </div>
      {project.description && <p className="small-copy muted-copy mb-3">{project.description}</p>}
      {project.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.skills.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
        </div>
      )}
    </div>
  )
}

export function PortfolioToolPage() {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('upload')
  const [resumeText, setResumeText] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const result = await tool.submit(payload)
      writeWorkflowContext({
        historyId: typeof result.history_id === 'string' ? result.history_id : '',
        lastToolId: 'portfolio',
        resumeText: resumeText || undefined,
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
    if (!targetRole.trim()) nextErrors.targetRole = 'Target role is required.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setPhase('loading')
    mutation.mutate({ resume_text: resumeText, target_role: targetRole })
  }, [resumeText, targetRole, mutation])

  const handleStartOver = useCallback(() => {
    setPhase('upload')
    setResumeText('')
    setTargetRole('')
    setErrors({})
    mutation.reset()
  }, [mutation])

  const resultPayload = mutation.data as Record<string, unknown> | undefined
  const projects = resultPayload ? normalizeProjects(resultPayload) : []

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} />
      <div className="tool-fs-body">
        <AnimatePresence mode="wait">
          {phase === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }}>
              <div className="resume-bespoke-header">
                <ToolHeroIllustration toolId="portfolio" accent={tool.accent} />
                <h1 className="resume-bespoke-title">Portfolio Planner</h1>
                <p className="resume-bespoke-subtitle">Get concrete project ideas that demonstrate the right skills for your target role.</p>
              </div>
              <div className="wizard-step-indicator">
                <div className="wizard-step wizard-step--active">1</div>
                <div className="wizard-step-line" />
                <div className="wizard-step">2</div>
              </div>
              <DropzoneHero onParsed={handleResumeParsed} onPasteText={() => setPhase('form')} accent={tool.accent} />
            </motion.div>
          )}

          {phase === 'form' && (
            <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="resume-form-section">
              <div className="wizard-step-indicator">
                <div className="wizard-step wizard-step--done">✓</div>
                <div className="wizard-step-line wizard-step-line--done" />
                <div className="wizard-step wizard-step--active">2</div>
              </div>
              <DropzoneHero onParsed={handleResumeParsed} accent={tool.accent} compact />
              {errors.resumeText && <p className="small-copy mt-2" style={{ color: 'var(--destructive)' }}>{errors.resumeText}</p>}

              <div className="resume-optional-fields">
                <div className="grid gap-2">
                  <Label htmlFor="portfolio-role">Target role <span style={{ color: 'var(--destructive)' }}>*</span></Label>
                  <Input id="portfolio-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Full Stack Developer, UX Designer…" />
                  {errors.targetRole && <p className="small-copy" style={{ color: 'var(--destructive)' }}>{errors.targetRole}</p>}
                </div>
              </div>

              <div className="resume-submit-area">
                <Button size="lg" onClick={handleSubmit} disabled={mutation.isPending} style={{ background: tool.accent, color: '#071611' } as CSSProperties} className="resume-submit-btn">
                  {tool.entryPointLabel} <ArrowRight size={16} />
                </Button>
              </div>
              {mutation.error && <p className="small-copy text-center mt-2" style={{ color: 'var(--destructive)' }}>{mutation.error instanceof Error ? mutation.error.message : 'Planning failed.'}</p>}
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
                  <p className="muted-copy">{projects.length} project ideas generated. Stars indicate complexity.</p>
                </div>
              </SectionReveal>
              <SectionReveal index={1}>
                <div className="portfolio-project-grid">
                  {projects.map((p, i) => <ProjectCard key={i} project={p} />)}
                </div>
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
