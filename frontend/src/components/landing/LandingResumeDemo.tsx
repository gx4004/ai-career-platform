import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { AlertTriangle, Check } from 'lucide-react'
import { ScrollReveal, motion, useViewportTrigger } from '#/components/ui/motion'
import { landingResumeDemoCopy } from '#/components/landing/landingContent'

type DemoPhase = 'idle' | 'scanning' | 'summary' | 'proof' | 'building' | 'complete'
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
  linkedin: string
}

type DemoInsight = {
  id: string
  label: string
  text: string
  tone: Exclude<HighlightTone, 'neutral'>
}

type DemoScore = {
  value: number
  verdict: string
  summary: string
}

const RESUME_IDENTITY: ResumeIdentity = {
  name: 'Adrian Nowak',
  role: 'Senior Frontend Engineer',
  location: 'Warsaw, Poland',
  email: 'adrian@nowak.dev',
  site: 'adriannowak.dev',
  linkedin: 'linkedin.com/in/adriannowak',
}

const RESUME_SECTIONS: ResumeSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    lines: [
      {
        id: 'profile-summary',
        text: 'Senior frontend engineer building revenue-critical React products, design systems, and performance improvements across scaling SaaS teams.',
        kind: 'summary',
        tone: 'warning',
      },
    ],
  },
  {
    id: 'experience',
    label: 'Experience',
    lines: [
      {
        id: 'northstar-role',
        text: 'Senior Frontend Engineer - Northstar Commerce',
        meta: '2022-Present',
        kind: 'role',
      },
      {
        id: 'northstar-scope',
        text: 'Own checkout and shared frontend foundations for a multi-product commerce platform.',
        kind: 'detail',
      },
      {
        id: 'northstar-system',
        text: 'Led the design-system migration across 6 product squads, reducing UI delivery time by 34%.',
        kind: 'bullet',
        tone: 'positive',
      },
      {
        id: 'northstar-performance',
        text: 'Cut mobile checkout JavaScript by 41%, improving conversion 8.6% across the highest-volume funnel.',
        kind: 'bullet',
        tone: 'positive',
      },
      {
        id: 'northstar-collaboration',
        text: 'Partner with design, analytics, and product teams on launches and release quality.',
        kind: 'bullet',
      },
    ],
  },
  {
    id: 'selected-work',
    label: 'Selected Work',
    lines: [
      {
        id: 'selected-checkout',
        text: 'Checkout rebuild - React, GraphQL, experimentation, performance budgets.',
        kind: 'detail',
      },
      {
        id: 'selected-design-system',
        text: 'Design system foundation - component APIs, accessibility reviews, and docs.',
        kind: 'detail',
      },
    ],
  },
  {
    id: 'core-stack',
    label: 'Core Stack',
    lines: [
      {
        id: 'stack-core',
        text: 'TypeScript, React, Next.js, GraphQL, Storybook, Playwright.',
        kind: 'detail',
      },
    ],
  },
]

const DEMO_SCORE: DemoScore = {
  value: 86,
  verdict: 'Strong shortlist signal',
  summary: 'Clear senior frontend proof with measurable delivery and platform ownership.',
}

const DEMO_INSIGHTS: DemoInsight[] = [
  {
    id: 'strongest-signal',
    label: 'Strongest signal',
    text: 'Quantified platform and performance wins make the profile credible fast.',
    tone: 'positive',
  },
  {
    id: 'first-fix',
    label: 'First fix',
    text: 'The summary needs clearer leadership scope and stronger target-role language.',
    tone: 'warning',
  },
]

const SUMMARY_HIGHLIGHT_IDS = new Set(['profile-summary'])
const PROOF_HIGHLIGHT_IDS = new Set(['northstar-system', 'northstar-performance'])

const PHASE_ORDER: DemoPhase[] = ['idle', 'scanning', 'summary', 'proof', 'building', 'complete']

const PHASE_COPY: Record<DemoPhase, string> = {
  idle: 'Ready to analyze',
  scanning: 'Scanning uploaded resume',
  summary: 'Flagging the weak summary first',
  proof: 'Confirming the strongest proof',
  building: 'Building summary',
  complete: 'Analysis ready',
}

function hasReachedPhase(phase: DemoPhase, target: DemoPhase) {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target)
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

export function LandingResumeDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const timeoutIds = useRef<number[]>([])
  const triggered = useViewportTrigger(ref, { threshold: 0.35, once: true })
  const prefersReducedMotion = useReducedMotion() ?? false
  const [phase, setPhase] = useState<DemoPhase>(prefersReducedMotion ? 'complete' : 'idle')
  const [scanPass, setScanPass] = useState<ScanPass>('none')
  const summaryReady = hasReachedPhase(phase, 'summary')
  const proofReady = hasReachedPhase(phase, 'proof')
  const completeReady = hasReachedPhase(phase, 'complete')
  const scoreReady = completeReady
  const scanVisible = scanPass !== 'none'
  const score = useCountUp(DEMO_SCORE.value, scoreReady, prefersReducedMotion, 540)
  const resolvedScore = completeReady ? DEMO_SCORE.value : score
  const progress = scoreReady ? resolvedScore : 0

  const clearSequence = useCallback(() => {
    timeoutIds.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    timeoutIds.current = []
  }, [])

  const runSequence = useCallback(() => {
    clearSequence()
    setScanPass('initial')
    setPhase('scanning')

    timeoutIds.current = [
      window.setTimeout(() => setPhase('summary'), 1400),
      window.setTimeout(() => setPhase('proof'), 2000),
      window.setTimeout(() => {
        setPhase('building')
        setScanPass('confirm')
      }, 2800),
      window.setTimeout(() => {
        setPhase('complete')
        setScanPass('none')
      }, 4600),
    ]
  }, [clearSequence])

  useEffect(() => {
    return () => clearSequence()
  }, [clearSequence])

  useEffect(() => {
    if (prefersReducedMotion) {
      clearSequence()
      setScanPass('none')
      setPhase('complete')
      return
    }

    if (triggered && phase === 'idle') {
      runSequence()
    }
  }, [clearSequence, phase, prefersReducedMotion, runSequence, triggered])

  const phaseCopy = PHASE_COPY[phase]

  return (
    <section className="landing-section landing-section-demo" id="landing-demo" ref={ref}>
      <div className="content-max landing-demo landing-experiment-surface landing-experiment-surface--resume">
        <ScrollReveal>
          <div className="landing-demo-intro">
            <p className="eyebrow">{landingResumeDemoCopy.eyebrow}</p>
            <h2 className="display-lg">{landingResumeDemoCopy.title}</h2>
            <p className="landing-demo-subcopy">{landingResumeDemoCopy.body}</p>
          </div>
        </ScrollReveal>

        <div className="landing-demo-stage" data-phase={phase}>
          <aside className="landing-demo-summary" aria-label="Demo analysis summary">
            <div className="landing-demo-summary-header">
              <div className="landing-demo-summary-heading">
                <p className="landing-demo-summary-eyebrow">Review summary</p>
                <p className="landing-demo-summary-title">What to fix first</p>
              </div>
              <p className="landing-demo-summary-status">{phaseCopy}</p>
            </div>

            <motion.div
              className="landing-demo-card landing-demo-card--score"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.42 }}
            >
              <p className="landing-demo-card-label">Resume score</p>
              {completeReady ? (
                <>
                  <div
                    className="landing-demo-score-shell"
                    data-ready={scoreReady ? 'true' : 'false'}
                  >
                    <div className="landing-demo-score-orb">
                      <span>{resolvedScore}</span>
                      <small>/100</small>
                    </div>
                    <div className="landing-demo-score-copy">
                      <span className="landing-demo-score-pill">{DEMO_SCORE.verdict}</span>
                      <p className="landing-demo-score-note">{DEMO_SCORE.summary}</p>
                    </div>
                  </div>
                  <div className="landing-demo-score-progress">
                    <motion.div
                      className="landing-demo-score-progress-fill"
                      initial={prefersReducedMotion ? false : { width: '0%' }}
                      animate={{ width: `${progress}%` }}
                      transition={{
                        duration: prefersReducedMotion ? 0 : 0.72,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  </div>
                  <div className="landing-demo-score-scale" aria-hidden="true">
                    <span>Needs work</span>
                    <span>Competitive</span>
                    <span className="is-active">Shortlist</span>
                  </div>
                </>
              ) : (
                <div className="landing-demo-score-loading" aria-hidden="true">
                  <span className="landing-demo-score-loading-orb" />
                  <div className="landing-demo-score-loading-copy">
                    <span className="landing-demo-card-skeleton-bar" data-size="title-short" />
                    <span className="landing-demo-card-skeleton-bar" data-size="title" />
                    <span className="landing-demo-card-skeleton-bar" data-size="title" />
                  </div>
                  <div className="landing-demo-score-progress is-loading">
                    <span className="landing-demo-score-progress-fill is-loading" />
                  </div>
                </div>
              )}
            </motion.div>

            <div className="landing-demo-insights">
              {DEMO_INSIGHTS.map((insight, index) => (
                <motion.div
                  key={insight.id}
                  className="landing-demo-card landing-demo-card--insight"
                  data-tone={insight.tone}
                  data-ready={completeReady ? 'true' : 'false'}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.34,
                    delay: prefersReducedMotion || !completeReady ? 0 : 0.08 + index * 0.08,
                  }}
                >
                  <span className="landing-demo-card-icon" aria-hidden="true">
                    {insight.tone === 'positive' ? (
                      <Check size={14} />
                    ) : (
                      <AlertTriangle size={14} />
                    )}
                  </span>
                  <div className="landing-demo-card-copy">
                    {completeReady ? (
                      <>
                        <p className="landing-demo-card-label">{insight.label}</p>
                        <p className="landing-demo-card-text">{insight.text}</p>
                      </>
                    ) : (
                      <div className="landing-demo-card-skeleton" aria-hidden="true">
                        <span className="landing-demo-card-skeleton-bar" data-size="label" />
                        <span className="landing-demo-card-skeleton-bar" data-size="title" />
                        <span className="landing-demo-card-skeleton-bar" data-size="title-short" />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </aside>

          <div className="landing-demo-paper">
            <div className="landing-demo-paper-frame">
              <div className="landing-demo-paper-header">
                <div className="hero-mockup-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-demo-paper-file">
                  <span className="landing-demo-paper-file-chip">PDF</span>
                  <div className="landing-demo-paper-file-copy">
                    <span className="landing-demo-paper-file-name">adrian-nowak-resume.pdf</span>
                    <span className="landing-demo-paper-file-hint">Uploaded document</span>
                  </div>
                </div>
              </div>

              <div className="landing-demo-paper-body">
                {scanVisible && (
                  <div
                    className="landing-demo-scan-overlay"
                    data-pass={scanPass}
                    data-testid="landing-demo-scan-overlay"
                    aria-hidden="true"
                  >
                    <div key={scanPass} className="landing-demo-scan-bar" />
                  </div>
                )}

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
                      <span aria-hidden="true">•</span>
                      {RESUME_IDENTITY.linkedin}
                    </p>
                  </header>

                  {RESUME_SECTIONS.map((section) => (
                    <section className="landing-demo-doc-section" key={section.id}>
                      <div className="landing-demo-doc-label">{section.label}</div>
                      <div className="landing-demo-doc-lines">
                        {section.lines.map((line) => {
                          const isHighlighted =
                            (summaryReady && SUMMARY_HIGHLIGHT_IDS.has(line.id)) ||
                            (proofReady && PROOF_HIGHLIGHT_IDS.has(line.id))

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
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
