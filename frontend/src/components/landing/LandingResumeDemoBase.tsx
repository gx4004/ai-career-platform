import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useReducedMotion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Check, ScanText } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  ScrollReveal,
  StaggerChildren,
  StaggerItem,
  motion,
  useViewportTrigger,
} from '#/components/ui/motion'

type DemoPhase = 'idle' | 'parsing' | 'highlighting' | 'scoring' | 'fixes'
type HighlightTone = 'positive' | 'warning' | 'neutral'
type ScanPass = 'none' | 'initial' | 'confirm'
type ResumeLineKind = 'summary' | 'detail' | 'role' | 'bullet'

type ResumeLine = {
  id: string
  text: string
  meta?: string
  kind: ResumeLineKind
  tone?: HighlightTone
}

type ResumeSection = {
  id: string
  label: string
  lines: ResumeLine[]
}

type ResumeIdentity = {
  name: string
  role: string
  location: string
  email: string
  site: string
}

type ResumeCallout = {
  id: string
  text: string
  tone: HighlightTone
  lineId: string
  top: string
  left: string
}

type ProofChip = {
  id: string
  label: string
  description: string
  tone: HighlightTone
}

type DemoResumeAnalysis = {
  summary: {
    headline: string
    verdict: string
  }
  overallScore: number
  strengths: string[]
  topActions: Array<{
    title: string
    action: string
  }>
  evidence: {
    quantifiedBullets: number
  }
}

const RESUME_IDENTITY: ResumeIdentity = {
  name: 'JOHN CARTER',
  role: 'Senior Frontend Engineer',
  location: 'Warsaw, PL',
  email: 'john.carter@sample.dev',
  site: 'portfolio.dev/johncarter',
}

const RESUME_SECTIONS: ResumeSection[] = [
  {
    id: 'summary',
    label: 'Summary',
    lines: [
      {
        id: 'profile-summary',
        text: 'Frontend engineer building polished product UI, resilient React systems, and high-trust product experiences.',
        kind: 'summary',
        tone: 'warning',
      },
    ],
  },
  {
    id: 'skills',
    label: 'Core Skills',
    lines: [
      {
        id: 'skills-core',
        text: 'TypeScript, React, Next.js, Node.js, TailwindCSS, PostgreSQL, design systems',
        kind: 'detail',
      },
      {
        id: 'skills-proof',
        text: 'Component APIs, accessibility, testing, architecture docs, and frontend platform work.',
        kind: 'detail',
      },
    ],
  },
  {
    id: 'experience',
    label: 'Experience',
    lines: [
      {
        id: 'experience-role',
        text: 'Senior Frontend Engineer · Acme Corp',
        meta: '2022–Present',
        kind: 'role',
      },
      {
        id: 'experience-scope',
        text: 'Owned customer-facing product UI, shared systems, and frontend platform improvements across the core app.',
        kind: 'detail',
      },
      {
        id: 'experience-migration',
        text: 'Migrated 40 modules from JavaScript to TypeScript across the core app.',
        kind: 'bullet',
        tone: 'positive',
      },
      {
        id: 'experience-velocity',
        text: 'Built a component library that reduced UI dev time by 35%.',
        kind: 'bullet',
        tone: 'positive',
      },
      {
        id: 'experience-architecture',
        text: 'Defined documentation and architecture guidance for reusable frontend patterns.',
        kind: 'bullet',
      },
    ],
  },
]

const DEMO_ANALYSIS: DemoResumeAnalysis = {
  summary: {
    headline:
      'Strong frontend depth, but the summary still undersells leadership and business impact.',
    verdict: 'Shortlist range',
  },
  overallScore: 84,
  strengths: ['TypeScript and React depth come through clearly.'],
  topActions: [
    {
      title: 'Add leadership signal to the summary',
      action:
        'Mention ownership, mentoring, or cross-functional leadership in the opening section.',
    },
  ],
  evidence: {
    quantifiedBullets: 2,
  },
}

const RESUME_CALLOUTS: ResumeCallout[] = [
  {
    id: 'callout-migration',
    text: '40 modules migrated to TypeScript',
    tone: 'positive',
    lineId: 'experience-migration',
    top: '15.8rem',
    left: '60%',
  },
  {
    id: 'callout-velocity',
    text: 'UI dev time reduced 35%',
    tone: 'positive',
    lineId: 'experience-velocity',
    top: '18.9rem',
    left: '56%',
  },
  {
    id: 'callout-leadership',
    text: 'Summary lacks leadership signal',
    tone: 'warning',
    lineId: 'profile-summary',
    top: '6rem',
    left: '57%',
  },
]

const PHASE_ORDER: DemoPhase[] = ['idle', 'parsing', 'highlighting', 'scoring', 'fixes']

const PHASE_COPY: Record<DemoPhase, string> = {
  idle: 'Ready to analyze',
  parsing: 'Scanning resume',
  highlighting: 'Marking the strongest signals',
  scoring: 'Calculating shortlist score',
  fixes: 'Top signals ready',
}

const HIGHLIGHTED_LINE_IDS = new Set(RESUME_CALLOUTS.map((callout) => callout.lineId))

function hasReachedPhase(phase: DemoPhase, target: DemoPhase) {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target)
}

function buildSummaryRows(result: DemoResumeAnalysis): ProofChip[] {
  return [
    {
      id: 'strong',
      label: 'Strong',
      description: result.strengths[0] ?? 'Technical depth reads clearly.',
      tone: 'positive',
    },
    {
      id: 'fix',
      label: 'Fix first',
      description: result.topActions[0]?.title ?? 'Add sharper business impact proof.',
      tone: 'warning',
    },
    {
      id: 'evidence',
      label: 'Evidence',
      description: `${result.evidence.quantifiedBullets} quantified bullets detected.`,
      tone: 'neutral',
    },
  ]
}

function useCountUp(target: number, active: boolean, immediate: boolean, duration = 900) {
  const [value, setValue] = useState(immediate && active ? target : 0)

  useEffect(() => {
    if (!active) {
      setValue(0)
      return
    }

    if (immediate) {
      setValue(target)
      return
    }

    const start = Date.now()
    const timer = window.setInterval(() => {
      const progress = Math.min((Date.now() - start) / duration, 1)
      setValue(Math.round(progress * target))

      if (progress >= 1) {
        window.clearInterval(timer)
      }
    }, 16)

    return () => window.clearInterval(timer)
  }, [active, duration, immediate, target])

  return value
}

export function LandingResumeDemoBase() {
  const ref = useRef<HTMLDivElement>(null)
  const timeoutIds = useRef<number[]>([])
  const triggered = useViewportTrigger(ref, { threshold: 0.35, once: true })
  const prefersReducedMotion = useReducedMotion() ?? false
  const [phase, setPhase] = useState<DemoPhase>(prefersReducedMotion ? 'fixes' : 'idle')
  const [scanPass, setScanPass] = useState<ScanPass>('none')
  const highlightReady = hasReachedPhase(phase, 'highlighting')
  const scoreReady = hasReachedPhase(phase, 'scoring')
  const fixesReady = hasReachedPhase(phase, 'fixes')
  const scanVisible = scanPass !== 'none'
  const score = useCountUp(DEMO_ANALYSIS.overallScore, scoreReady, prefersReducedMotion)
  const resolvedScore = fixesReady ? DEMO_ANALYSIS.overallScore : score
  const progress = scoreReady ? resolvedScore : 0
  const summaryRows = buildSummaryRows(DEMO_ANALYSIS)

  const clearSequence = useCallback(() => {
    timeoutIds.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    timeoutIds.current = []
  }, [])

  const runSequence = useCallback(() => {
    clearSequence()
    setScanPass('initial')
    setPhase('parsing')

    timeoutIds.current = [
      window.setTimeout(() => setPhase('highlighting'), 1200),
      window.setTimeout(() => setScanPass('none'), 1320),
      window.setTimeout(() => setPhase('scoring'), 2200),
      window.setTimeout(() => setPhase('fixes'), 3100),
      window.setTimeout(() => setScanPass('confirm'), 3220),
      window.setTimeout(() => setScanPass('none'), 4140),
    ]
  }, [clearSequence])

  useEffect(() => {
    return () => clearSequence()
  }, [clearSequence])

  useEffect(() => {
    if (prefersReducedMotion) {
      clearSequence()
      setScanPass('none')
      setPhase('fixes')
      return
    }

    if (triggered && phase === 'idle') {
      runSequence()
    }
  }, [clearSequence, phase, prefersReducedMotion, runSequence, triggered])

  const phaseCopy = PHASE_COPY[phase]

  return (
    <section className="landing-section landing-section-demo" id="landing-demo" ref={ref}>
      <div className="content-max landing-demo">
        <ScrollReveal>
          <div className="landing-demo-intro">
            <p className="eyebrow">Resume Analyzer</p>
            <h2 className="display-lg">Watch your resume turn into a clear hiring signal.</h2>
            <p className="landing-demo-subcopy">
              We pull out proof, score what matters, and flag the fixes most likely to move
              you into shortlist range.
            </p>
          </div>
        </ScrollReveal>

        <div className="landing-demo-stage" data-phase={phase}>
          <div className="landing-demo-paper">
            <div className="landing-demo-paper-frame">
              <div className="landing-demo-paper-header">
                <div className="hero-mockup-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-demo-paper-file">
                  <ScanText size={14} />
                  <span>resume.pdf</span>
                </div>
              </div>

              <div className="landing-demo-paper-body">
                {scanVisible ? (
                  <div
                    className="landing-demo-scan-overlay"
                    data-pass={scanPass}
                    data-testid="landing-demo-scan-overlay"
                    aria-hidden="true"
                  >
                    <div className="landing-demo-scan-bar" />
                  </div>
                ) : null}

                <div className="landing-demo-paper-grid" aria-hidden="true" />

                <div className="landing-demo-paper-content">
                  <header className="landing-demo-paper-identity">
                    <div className="landing-demo-paper-name-block">
                      <h3 className="landing-demo-paper-name">{RESUME_IDENTITY.name}</h3>
                      <p className="landing-demo-paper-role">{RESUME_IDENTITY.role}</p>
                    </div>
                    <p className="landing-demo-paper-meta">
                      {RESUME_IDENTITY.location}
                      <span aria-hidden="true">•</span>
                      {RESUME_IDENTITY.email}
                      <span aria-hidden="true">•</span>
                      {RESUME_IDENTITY.site}
                    </p>
                  </header>

                  {RESUME_SECTIONS.map((section) => (
                    <section className="landing-demo-doc-section" key={section.id}>
                      <div className="landing-demo-doc-label">{section.label}</div>
                      <div className="landing-demo-doc-lines">
                        {section.lines.map((line) => {
                          const isHighlighted =
                            highlightReady && HIGHLIGHTED_LINE_IDS.has(line.id)

                          return (
                            <div
                              key={line.id}
                              className="landing-demo-doc-line"
                              data-kind={line.kind}
                              data-highlighted={isHighlighted ? 'true' : 'false'}
                              data-tone={line.tone ?? 'neutral'}
                            >
                              <span className="landing-demo-doc-bullet" aria-hidden="true" />
                              <span className="landing-demo-doc-line-text">{line.text}</span>
                              {line.meta ? (
                                <span className="landing-demo-doc-line-meta">{line.meta}</span>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>

                {highlightReady ? (
                  <div className="landing-demo-callouts" aria-live="polite">
                    {RESUME_CALLOUTS.map((callout, index) => (
                      <motion.div
                        key={callout.id}
                        className="landing-demo-callout"
                        data-tone={callout.tone}
                        style={
                          {
                            '--callout-top': callout.top,
                            '--callout-left': callout.left,
                          } as CSSProperties
                        }
                        initial={
                          prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.96 }
                        }
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                          duration: prefersReducedMotion ? 0 : 0.32,
                          delay: prefersReducedMotion ? 0 : index * 0.1,
                        }}
                      >
                        <span className="landing-demo-callout-icon" aria-hidden="true">
                          {callout.tone === 'positive' ? (
                            <Check size={12} />
                          ) : (
                            <AlertTriangle size={12} />
                          )}
                        </span>
                        <span>{callout.text}</span>
                      </motion.div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="landing-demo-rail" aria-label="Resume analysis summary">
            <div className="landing-demo-rail-header">
              <p className="landing-demo-rail-eyebrow">Live analysis</p>
              <p className="landing-demo-rail-status">{phaseCopy}</p>
            </div>

            <motion.div
              className="landing-demo-score-card"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.45 }}
            >
              <div className="landing-demo-score-meta">
                <div>
                  <p className="landing-demo-score-label">Resume score</p>
                  <h3 className="landing-demo-score-title">{DEMO_ANALYSIS.summary.verdict}</h3>
                </div>
              </div>

              <div className="landing-demo-score-hero">
                <div
                  className="landing-demo-score-ring"
                  data-active={scoreReady ? 'true' : 'false'}
                >
                  <span>{resolvedScore}</span>
                </div>
                <div className="landing-demo-score-copy">
                  <p className="landing-demo-score-summary">{DEMO_ANALYSIS.summary.headline}</p>
                  <div className="landing-demo-score-progress">
                    <motion.div
                      className="landing-demo-score-progress-fill"
                      initial={prefersReducedMotion ? false : { width: '0%' }}
                      animate={{ width: `${progress}%` }}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 0.85,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="landing-demo-proof-panel">
              <div className="landing-demo-panel-heading">
                <p className="landing-demo-panel-eyebrow">At a glance</p>
                <p className="landing-demo-panel-title">What the real tool flags first</p>
              </div>
              {fixesReady ? (
                <StaggerChildren className="landing-demo-proof-list" stagger={0.08} delay={0.05}>
                  {summaryRows.map((chip) => (
                    <StaggerItem key={chip.id}>
                      <div
                        className="landing-demo-proof-row"
                        data-tone={chip.tone}
                        data-active={highlightReady ? 'true' : 'false'}
                      >
                        <span className="landing-demo-proof-row-icon" aria-hidden="true">
                          {chip.tone === 'positive' ? (
                            <Check size={14} />
                          ) : chip.tone === 'warning' ? (
                            <AlertTriangle size={14} />
                          ) : (
                            <ScanText size={14} />
                          )}
                        </span>
                        <div className="landing-demo-proof-row-copy">
                          <p className="landing-demo-proof-row-label">{chip.label}</p>
                          <p className="landing-demo-proof-row-title">{chip.description}</p>
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              ) : (
                <div className="landing-demo-fix-placeholder">
                  Pulling the strongest signals into a quick recruiter readout.
                </div>
              )}
            </div>

            <div className="landing-demo-cta">
              <p className="landing-demo-cta-copy">Free demo, no sign-in</p>
              <Button asChild className="button-hero-primary landing-demo-cta-button" size="lg">
                <Link to="/resume">
                  Analyze my resume
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

