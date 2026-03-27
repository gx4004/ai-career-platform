import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowRight, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { BorderBeam } from '#/components/ui/border-beam'
import { NumberTicker } from '#/components/ui/number-ticker'
import { ScrollReveal, motion, useViewportTrigger } from '#/components/ui/motion'
import { landingResumeDemoCopy } from '#/components/landing/landingContent'

/* ── Types ── */

type DemoPhase = 'idle' | 'scanning' | 'annotate-1' | 'annotate-2' | 'annotate-3' | 'score' | 'complete'
type HighlightTone = 'positive' | 'warning'
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

type Annotation = {
  id: string
  lineId: string
  label: string
  tone: HighlightTone
  phase: DemoPhase
}

/* ── Data ── */

const RESUME_IDENTITY = {
  name: 'Adrian Nowak',
  role: 'Senior Frontend Engineer',
  location: 'Warsaw, Poland',
  email: 'adrian@nowak.dev',
  site: 'adriannowak.dev',
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
        text: 'Senior Frontend Engineer — Northstar Commerce',
        meta: '2022–Present',
        kind: 'role',
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

const ANNOTATIONS: Annotation[] = [
  {
    id: 'ann-summary',
    lineId: 'profile-summary',
    label: 'Add leadership scope to summary',
    tone: 'warning',
    phase: 'annotate-1',
  },
  {
    id: 'ann-system',
    lineId: 'northstar-system',
    label: 'Measurable delivery proof found',
    tone: 'positive',
    phase: 'annotate-2',
  },
  {
    id: 'ann-perf',
    lineId: 'northstar-performance',
    label: 'Clear business impact detected',
    tone: 'positive',
    phase: 'annotate-3',
  },
]

const DEMO_SCORE = {
  value: 86,
  verdict: 'Ready for shortlists',
  firstFix: 'Add leadership scope to summary',
}

const PHASE_ORDER: DemoPhase[] = [
  'idle', 'scanning', 'annotate-1', 'annotate-2', 'annotate-3', 'score', 'complete',
]

function hasReachedPhase(phase: DemoPhase, target: DemoPhase) {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(target)
}

/* ── Component ── */

export function LandingResumeDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const timeoutIds = useRef<number[]>([])
  const triggered = useViewportTrigger(ref, { threshold: 0.25, once: false })
  const prefersReducedMotion = useReducedMotion() ?? false
  const [phase, setPhase] = useState<DemoPhase>(prefersReducedMotion ? 'complete' : 'idle')
  const [hasPlayed, setHasPlayed] = useState(prefersReducedMotion)
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null)
  const scoreReady = hasReachedPhase(phase, 'score')

  const clearSequence = useCallback(() => {
    timeoutIds.current.forEach((id) => window.clearTimeout(id))
    timeoutIds.current = []
  }, [])

  const runSequence = useCallback(() => {
    clearSequence()
    setPhase('scanning')
    setHoveredAnnotation(null)

    timeoutIds.current = [
      window.setTimeout(() => setPhase('annotate-1'), 600),
      window.setTimeout(() => setPhase('annotate-2'), 1000),
      window.setTimeout(() => setPhase('annotate-3'), 1400),
      window.setTimeout(() => setPhase('score'), 2000),
      window.setTimeout(() => {
        setPhase('complete')
        setHasPlayed(true)
      }, 2800),
    ]
  }, [clearSequence])

  const handleReplay = useCallback(() => {
    clearSequence()
    setPhase('idle')
    setHoveredAnnotation(null)
    requestAnimationFrame(() => runSequence())
  }, [clearSequence, runSequence])

  useEffect(() => {
    return () => clearSequence()
  }, [clearSequence])

  useEffect(() => {
    if (prefersReducedMotion) {
      clearSequence()
      setPhase('complete')
      setHasPlayed(true)
      return
    }

    if (triggered && phase === 'idle' && !hasPlayed) {
      runSequence()
    }
  }, [clearSequence, hasPlayed, phase, prefersReducedMotion, runSequence, triggered])

  const isAnnotationVisible = (ann: Annotation) => hasReachedPhase(phase, ann.phase)

  const isLineHighlighted = (lineId: string) =>
    ANNOTATIONS.some((ann) => ann.lineId === lineId && isAnnotationVisible(ann))

  const getLineTone = (lineId: string): HighlightTone | undefined =>
    ANNOTATIONS.find((ann) => ann.lineId === lineId && isAnnotationVisible(ann))?.tone

  const isLineHovered = (lineId: string) =>
    hoveredAnnotation !== null &&
    ANNOTATIONS.some((ann) => ann.id === hoveredAnnotation && ann.lineId === lineId)

  return (
    <section className="landing-section landing-section-demo" id="landing-demo" ref={ref}>
      <div className="content-max landing-demo-v2">
        <ScrollReveal>
          <div className="landing-demo-v2-intro">
            <p className="eyebrow">{landingResumeDemoCopy.eyebrow}</p>
            <h2 className="display-lg">{landingResumeDemoCopy.title}</h2>
            <p className="muted-copy landing-demo-v2-subcopy">{landingResumeDemoCopy.body}</p>
          </div>
        </ScrollReveal>

        {/* G6 Cinema Widescreen */}
        <div className="landing-demo-g6" data-phase={phase}>
          {/* Ghosted watermark */}
          <span className="landing-demo-g6-watermark" aria-hidden="true">86</span>

          <div className="landing-demo-g6-grid">
            {/* Left: Resume document */}
            <div className="landing-demo-g6-left">
              <div className="landing-demo-g6-window">
                <div className="landing-demo-v2-window-header">
                  <div className="hero-mockup-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="landing-demo-v2-file">
                    <span className="landing-demo-v2-file-chip">PDF</span>
                    <span className="landing-demo-v2-file-name">adrian-nowak-resume.pdf</span>
                  </div>
                  {hasPlayed && !prefersReducedMotion && (
                    <button
                      className="landing-demo-v2-replay"
                      onClick={handleReplay}
                      aria-label="Replay analysis"
                    >
                      <RotateCcw size={13} />
                      <span>Replay</span>
                    </button>
                  )}
                </div>

                <div className="landing-demo-v2-body">
                  <div className="landing-demo-paper-grid" aria-hidden="true" />

                  <div className="landing-demo-v2-content">
                    <header className="landing-demo-v2-identity">
                      <h3 className="landing-demo-v2-name">{RESUME_IDENTITY.name}</h3>
                      <p className="landing-demo-v2-role">{RESUME_IDENTITY.role}</p>
                      <p className="landing-demo-v2-meta">
                        {RESUME_IDENTITY.location}
                        <span aria-hidden="true">·</span>
                        {RESUME_IDENTITY.email}
                        <span aria-hidden="true">·</span>
                        {RESUME_IDENTITY.site}
                      </p>
                    </header>

                    {RESUME_SECTIONS.map((section) => (
                      <div className="landing-demo-v2-section" key={section.id}>
                        <div className="landing-demo-v2-section-label">{section.label}</div>
                        <div className="landing-demo-v2-lines">
                          {section.lines.map((line) => {
                            const highlighted = isLineHighlighted(line.id)
                            const tone = getLineTone(line.id)
                            const hovered = isLineHovered(line.id)

                            return (
                              <div
                                key={line.id}
                                className="landing-demo-v2-line"
                                data-kind={line.kind}
                                data-highlighted={highlighted ? 'true' : 'false'}
                                data-tone={tone ?? 'neutral'}
                                data-hovered={hovered ? 'true' : 'false'}
                              >
                                {line.kind === 'bullet' && (
                                  <span className="landing-demo-v2-bullet" aria-hidden="true" />
                                )}
                                <span className="landing-demo-v2-line-text">{line.text}</span>
                                {line.meta && (
                                  <span className="landing-demo-v2-line-meta">{line.meta}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BorderBeam scan effect */}
                {!prefersReducedMotion && hasReachedPhase(phase, 'scanning') && !hasReachedPhase(phase, 'annotate-1') && (
                  <BorderBeam
                    size={280}
                    duration={1.1}
                    colorFrom="#4a93ef"
                    colorTo="#a8d4ff"
                    borderWidth={2.5}
                  />
                )}
                {!prefersReducedMotion && hasReachedPhase(phase, 'scanning') && !hasReachedPhase(phase, 'score') && (
                  <BorderBeam
                    size={180}
                    duration={1.4}
                    delay={0.4}
                    colorFrom="transparent"
                    colorTo="#4a93ef"
                    borderWidth={1.5}
                    className="opacity-50"
                  />
                )}
              </div>
            </div>

            {/* Right: Frosted analysis panel */}
            <div className="landing-demo-g6-right">
              {/* Score */}
              <div className="landing-demo-g6-score-block">
                <div className="landing-demo-g6-score-row">
                  <span className="landing-demo-g6-num">
                    {scoreReady ? (
                      prefersReducedMotion ? (
                        <span>{DEMO_SCORE.value}</span>
                      ) : (
                        <NumberTicker
                          value={DEMO_SCORE.value}
                          startValue={0}
                          delay={0}
                          className="tabular-nums leading-none"
                        />
                      )
                    ) : (
                      <span>0</span>
                    )}
                  </span>
                  <small className="landing-demo-g6-denom">/100</small>
                </div>
                <p className="landing-demo-g6-verdict">{DEMO_SCORE.verdict}</p>
                <div className="landing-demo-g6-bar">
                  <motion.div
                    className="landing-demo-g6-bar-fill"
                    initial={prefersReducedMotion ? false : { width: '0%' }}
                    animate={{ width: scoreReady ? '86%' : '0%' }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.8,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </div>
                <div className="landing-demo-g6-scale" aria-hidden="true">
                  <span>Needs work</span>
                  <span>Competitive</span>
                  <span className="is-active">Shortlist</span>
                </div>
              </div>

              {/* Insight items */}
              <div className="landing-demo-g6-insights">
                <AnimatePresence>
                  {ANNOTATIONS.map((ann) =>
                    isAnnotationVisible(ann) ? (
                      <motion.div
                        key={ann.id}
                        className="landing-demo-g6-insight"
                        data-tone={ann.tone}
                        onMouseEnter={() => setHoveredAnnotation(ann.id)}
                        onMouseLeave={() => setHoveredAnnotation(null)}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
                        transition={{
                          duration: prefersReducedMotion ? 0 : 0.28,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      >
                        <span className="landing-demo-g6-insight-dot" data-tone={ann.tone} />
                        <span className="landing-demo-g6-insight-text">{ann.label}</span>
                      </motion.div>
                    ) : null,
                  )}
                </AnimatePresence>
              </div>

              {/* CTA */}
              <Button asChild className="button-hero-primary landing-demo-g6-cta" size="lg">
                <Link to="/resume">
                  Try it with your resume
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
