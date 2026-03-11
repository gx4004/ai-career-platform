import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronLeft, ChevronRight, FolderOpenDot } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { FadeUp } from '#/components/ui/motion'
import { useSession } from '#/hooks/useSession'
import { toolGroups, tools } from '#/lib/tools/registry'
import carouselResume from '#/assets/carousel/carousel-resume.png'
import carouselJobMatch from '#/assets/carousel/carousel-job-match.png'
import carouselCoverLetter from '#/assets/carousel/carousel-cover-letter.png'

const ease = [0.16, 1, 0.3, 1] as const

const slideVariants = {
  hidden: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  visible: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -40, opacity: 0 }),
}

const CAROUSEL_TOOLS = [tools.resume, tools['job-match'], tools['cover-letter']] as const

const CAROUSEL_FRAMES = [
  { image: carouselResume },
  { image: carouselJobMatch },
  { image: carouselCoverLetter },
]

export function DashboardHero() {
  const { status, openAuthDialog } = useSession()
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const pausedRef = useRef(false)
  const lastManualRef = useRef(0)

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > activeIndex ? 1 : -1)
      setActiveIndex(index)
      lastManualRef.current = Date.now()
    },
    [activeIndex],
  )

  const goNext = useCallback(() => {
    setDirection(1)
    setActiveIndex((i) => (i + 1) % CAROUSEL_TOOLS.length)
    lastManualRef.current = Date.now()
  }, [])

  const goPrev = useCallback(() => {
    setDirection(-1)
    setActiveIndex((i) => (i - 1 + CAROUSEL_TOOLS.length) % CAROUSEL_TOOLS.length)
    lastManualRef.current = Date.now()
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return
      if (Date.now() - lastManualRef.current < 6000) return
      setDirection(1)
      setActiveIndex((i) => (i + 1) % CAROUSEL_TOOLS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  const tool = CAROUSEL_TOOLS[activeIndex]
  const frame = CAROUSEL_FRAMES[activeIndex]
  const Icon = tool.icon

  return (
    <section className="dash-hero">
      <FadeUp className="dash-hero-panel dash-hero-copy">
        <div className="grid gap-5">
          <Badge variant="outline" className="w-fit">
            Command center
          </Badge>
          <div className="grid gap-3">
            <h1 className="display-lg text-balance">Build the search one strong decision at a time.</h1>
            <p className="muted-copy">
              Review the resume, compare a real role, then keep the same context moving through the application workflow.
            </p>
          </div>
          <div className="button-cluster button-cluster--hero">
            <Button asChild className="button-hero-primary" size="lg">
              <Link to="/resume">
                Start with resume
                <ArrowRight size={16} />
              </Link>
            </Button>
            {status === 'authenticated' ? (
              <Button variant="outline" asChild className="button-surface-secondary" size="lg">
                <Link to="/history">
                  <FolderOpenDot size={16} />
                  Open saved workspace
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="button-surface-secondary"
                size="lg"
                onClick={() =>
                  openAuthDialog({
                    to: '/history',
                    reason: 'saved-workspace',
                    label: 'Open saved workspace',
                  })
                }
              >
                <FolderOpenDot size={16} />
                Open saved workspace
              </Button>
            )}
          </div>
        </div>
      </FadeUp>
      <FadeUp delay={0.15} className="dash-hero-panel dash-hero-side dash-hero-media">
        <div className="grid gap-4">
          <div>
            <p className="eyebrow mb-2">Recommended flow</p>
            <h2 className="section-title">Resume → Match → Apply</h2>
          </div>
          <div
            className="dash-carousel glass-elevated"
            onMouseEnter={() => (pausedRef.current = true)}
            onMouseLeave={() => (pausedRef.current = false)}
          >
            <div className="dash-carousel-header">
              <div className="hero-mockup-dots">
                <span />
                <span />
                <span />
              </div>
              <Icon size={14} style={{ color: tool.accent }} />
              <span className="dash-carousel-label" style={{ color: tool.accent }}>
                {tool.label}
              </span>
            </div>
            <div className="dash-carousel-stage">
              <AnimatePresence custom={direction} mode="wait">
                <motion.div
                  key={tool.id}
                  className="hero-mockup-frame"
                  custom={direction}
                  variants={slideVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.3, ease }}
                >
                  <img
                    src={frame.image}
                    alt={tool.label}
                    className="dash-carousel-image"
                    draggable={false}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="hero-mockup-nav">
              <button className="hero-mockup-nav-btn glass" onClick={goPrev} aria-label="Previous tool">
                <ChevronLeft size={14} />
              </button>
              {CAROUSEL_TOOLS.map((t, i) => (
                <button
                  key={t.id}
                  className={`hero-mockup-dot${i === activeIndex ? ' is-active' : ''}`}
                  style={i === activeIndex ? { background: tool.accent } : undefined}
                  onClick={() => goTo(i)}
                  aria-label={t.label}
                />
              ))}
              <button className="hero-mockup-nav-btn glass" onClick={goNext} aria-label="Next tool">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="workflow-proof-strip">
            {[...toolGroups.primary, ...toolGroups.application].map((tool, index) => (
              <div key={tool.id} className="workflow-step workflow-step--proof">
                <tool.icon size={16} style={{ color: tool.accent }} />
                <span>{tool.shortLabel}</span>
                {index < toolGroups.primary.length + toolGroups.application.length - 1 ? (
                  <span className="workflow-arrow">→</span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="dash-hero-metrics">
            {[
              ['Core flow', 'Resume + Match'],
              ['Apply faster', 'Letter + Interview'],
              ['Plan ahead', 'Career + Portfolio'],
            ].map(([label, value]) => (
              <div key={label} className="dash-hero-metric">
                <p className="small-copy muted-copy">{label}</p>
                <p>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeUp>
    </section>
  )
}
