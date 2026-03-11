import { useRef, useState, useEffect, useCallback } from 'react'
import { ScrollReveal, StaggerChildren, StaggerItem, useViewportTrigger, motion } from '#/components/ui/motion'
import { ScanText, Check, AlertTriangle } from 'lucide-react'

type DemoPhase = 'idle' | 'scanning' | 'scoring' | 'insights'

const RESUME_LINES = [
  { text: 'JOHN CARTER', heading: true },
  { text: 'Frontend Engineer · 4 years experience', heading: false },
  { text: '', heading: false },
  { text: 'SKILLS', heading: true },
  { text: 'TypeScript, React, Next.js, Node.js, TailwindCSS, PostgreSQL', heading: false },
  { text: '', heading: false },
  { text: 'EXPERIENCE', heading: true },
  { text: 'Senior Frontend Engineer — Acme Corp (2022–Present)', heading: false },
  { text: 'Led migration from JavaScript to TypeScript across 40+ modules.', heading: false },
  { text: 'Built component library reducing UI dev time by 35%.', heading: false },
]

const INSIGHTS = [
  { title: 'Strong technical depth', body: 'TypeScript and React experience well-documented with measurable impact.', positive: true },
  { title: 'Add quantified outcomes', body: 'Include revenue or user metrics to strengthen business impact claims.', positive: false },
  { title: 'Missing soft skills section', body: 'Leadership and collaboration keywords are absent from the summary.', positive: false },
  { title: 'ATS-ready formatting', body: 'Clean structure with proper headings passes most applicant tracking systems.', positive: true },
]

function useCountUp(target: number, active: boolean, duration = 1000) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = performance.now()
    let raf: number
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      setValue(Math.round(progress * target))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, target, duration])
  return value
}

export function LandingResumeDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const triggered = useViewportTrigger(ref, { threshold: 0.4, once: true })
  const [phase, setPhase] = useState<DemoPhase>('idle')
  const score = useCountUp(84, phase === 'scoring' || phase === 'insights')

  const runSequence = useCallback(() => {
    setPhase('scanning')
    setTimeout(() => setPhase('scoring'), 2000)
    setTimeout(() => setPhase('insights'), 3000)
  }, [])

  useEffect(() => {
    if (triggered && phase === 'idle') runSequence()
  }, [triggered, phase, runSequence])

  return (
    <section className="landing-section" ref={ref}>
      <div className="content-max landing-demo">
        <ScrollReveal>
          <div className="grid gap-1">
            <p className="eyebrow">Live demo</p>
            <h2 className="display-lg">See what the analyzer returns in seconds.</h2>
          </div>
        </ScrollReveal>
        <div className="landing-demo-grid">
          {/* Resume card with document chrome */}
          <div className="landing-demo-resume glass">
            <div className="landing-demo-resume-header">
              <div className="hero-mockup-dots">
                <span />
                <span />
                <span />
              </div>
              <span style={{ fontSize: 'var(--type-xs)', color: 'var(--text-muted)' }}>
                resume.pdf
              </span>
            </div>
            <div className="landing-demo-resume-body">
              {(phase === 'scanning') && (
                <div className="landing-demo-scan-overlay">
                  <div className="landing-demo-scan-bar" />
                </div>
              )}
              {RESUME_LINES.map((line, i) => (
                <div
                  key={i}
                  className={`landing-demo-resume-line${line.heading ? ' is-heading' : ''}`}
                >
                  {line.text || '\u00A0'}
                </div>
              ))}
            </div>
          </div>

          {/* Analysis output */}
          <div className="landing-demo-output">
            {(phase === 'scoring' || phase === 'insights') && (
              <motion.div
                className="landing-demo-score-card glass"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className={`landing-demo-score-ring${phase === 'insights' ? ' is-glowing' : ''}`}>
                    {score}
                  </div>
                  <div className="grid gap-1">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ScanText size={16} style={{ color: 'var(--accent)' }} />
                      <p className="section-title">Resume Score</p>
                    </div>
                    <p className="small-copy muted-copy">Above average — shortlist range</p>
                  </div>
                </div>
                <div className="hero-mockup-progress" style={{ marginTop: '0.75rem' }}>
                  <motion.div
                    className="hero-mockup-progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: '84%' }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </motion.div>
            )}
            {phase === 'insights' && (
              <StaggerChildren stagger={0.12} delay={0.1}>
                {INSIGHTS.map((insight) => (
                  <StaggerItem key={insight.title}>
                    <div className="landing-demo-insight glass">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {insight.positive ? (
                          <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                        ) : (
                          <AlertTriangle size={14} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
                        )}
                        <p className="landing-demo-insight-title">{insight.title}</p>
                      </div>
                      <p className="landing-demo-insight-body">{insight.body}</p>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerChildren>
            )}
            {phase === 'idle' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '12rem' }}>
                <p className="muted-copy">Scroll to trigger the demo…</p>
              </div>
            )}
            {phase === 'scanning' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '12rem' }}>
                <p className="muted-copy animate-pulse-glow">Analyzing resume…</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
