import { useState, useCallback, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { ArrowRight, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
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

const tool = tools.career

const LOADING_STAGES = [
  { label: 'Analyzing your profile…' },
  { label: 'Evaluating career transitions…' },
  { label: 'Assessing skill gaps…' },
  { label: 'Building recommendations…' },
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

function normalizeCareerPaths(payload: Record<string, unknown>) {
  const raw = (payload.career_paths || payload.paths || payload.recommendations || []) as Record<string, unknown>[]
  if (!Array.isArray(raw)) return []
  return raw.map((item) => ({
    role: toString(item.role || item.title || item.position),
    fit: toNumber(item.fit_percentage || item.fit || item.match_score),
    timeline: toString(item.timeline || item.estimated_timeline || item.timeframe),
    description: toString(item.description || item.summary),
    requiredSkills: toStringArray(item.required_skills || item.skills_needed || []),
    currentSkills: toStringArray(item.current_skills || item.matched_skills || []),
    gapSkills: toStringArray(item.gap_skills || item.missing_skills || item.skill_gaps || []),
  }))
}

function CareerPathCard({ path }: { path: ReturnType<typeof normalizeCareerPaths>[0] }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="wizard-result-card">
      <button type="button" className="wizard-result-card-header" aria-expanded={expanded} aria-label={`${path.role || 'Career path'} details`} onClick={() => setExpanded((e) => !e)}>
        <div className="wizard-result-card-left">
          <h3 className="section-title">{path.role || 'Career path'}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {path.fit !== null && <Badge variant="outline" style={{ borderColor: 'var(--tool-accent)', color: 'var(--tool-accent)' }}>{path.fit}% fit</Badge>}
            {path.timeline && <Badge variant="outline">{path.timeline}</Badge>}
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="muted-copy" /> : <ChevronDown size={18} className="muted-copy" />}
      </button>
      {path.description && <p className="small-copy muted-copy mt-2 px-1">{path.description}</p>}
      {expanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="wizard-card-details">
          {path.currentSkills.length > 0 && (
            <div className="wizard-card-skill-group">
              <p className="wizard-card-skill-label">Skills you have</p>
              <div className="flex flex-wrap gap-1.5">{path.currentSkills.map((s) => <Badge key={s} variant="outline" className="wizard-badge-have">{s}</Badge>)}</div>
            </div>
          )}
          {path.gapSkills.length > 0 && (
            <div className="wizard-card-skill-group">
              <p className="wizard-card-skill-label">Skills to build</p>
              <div className="flex flex-wrap gap-1.5">{path.gapSkills.map((s) => <Badge key={s} variant="outline" className="wizard-badge-gap">{s}</Badge>)}</div>
            </div>
          )}
          {path.requiredSkills.length > 0 && path.currentSkills.length === 0 && path.gapSkills.length === 0 && (
            <div className="wizard-card-skill-group">
              <p className="wizard-card-skill-label">Required skills</p>
              <div className="flex flex-wrap gap-1.5">{path.requiredSkills.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

export function CareerToolPage() {
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
        lastToolId: 'career',
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
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    setPhase('loading')
    mutation.mutate({ resume_text: resumeText, target_role: targetRole || undefined })
  }, [resumeText, targetRole, mutation])

  const handleStartOver = useCallback(() => {
    setPhase('upload')
    setResumeText('')
    setTargetRole('')
    setErrors({})
    mutation.reset()
  }, [mutation])

  const resultPayload = mutation.data as Record<string, unknown> | undefined
  const careerPaths = resultPayload ? normalizeCareerPaths(resultPayload) : []

  return (
    <ToolFullScreen accent={tool.accent}>
      <FloatingToolNav label={tool.label} icon={tool.icon} accent={tool.accent} />
      <div className="tool-fs-body">
        <AnimatePresence mode="wait">
          {phase === 'upload' && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }}>
              <div className="resume-bespoke-header">
                <ToolHeroIllustration toolId="career" accent={tool.accent} />
                <h1 className="resume-bespoke-title">Career Path Planner</h1>
                <p className="resume-bespoke-subtitle">Explore realistic career transitions with fit scores, timelines, and skill gap analysis.</p>
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
                  <Label htmlFor="career-role">Dream role <span className="muted-copy">(Optional)</span></Label>
                  <Input id="career-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Product Designer, Staff Engineer…" />
                </div>
              </div>

              <div className="resume-submit-area">
                <Button size="lg" onClick={handleSubmit} disabled={mutation.isPending} style={{ background: tool.accent, color: '#071611' } as CSSProperties} className="resume-submit-btn">
                  {tool.entryPointLabel} <ArrowRight size={16} />
                </Button>
              </div>
              {mutation.error && <p className="small-copy text-center mt-2" style={{ color: 'var(--destructive)' }}>{mutation.error instanceof Error ? mutation.error.message : 'Analysis failed.'}</p>}
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
                  <p className="muted-copy">Tap a path to see the skill gap breakdown.</p>
                </div>
              </SectionReveal>
              <SectionReveal index={1}>
                <div className="wizard-result-list">
                  {careerPaths.map((path, i) => <CareerPathCard key={path.role || i} path={path} />)}
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
