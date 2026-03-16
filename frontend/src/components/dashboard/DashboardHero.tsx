import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronLeft, ChevronRight, FolderOpenDot, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { FadeUp } from '#/components/ui/motion'
import { useCarousel } from '#/hooks/useCarousel'
import { useSession } from '#/hooks/useSession'
import { tools } from '#/lib/tools/registry'
import carouselResume from '#/assets/carousel/carousel-resume.png'
import carouselJobMatch from '#/assets/carousel/carousel-job-match.png'
import carouselCoverLetter from '#/assets/carousel/carousel-cover-letter.png'

const ease = [0.16, 1, 0.3, 1] as const

const slideVariants = {
  hidden: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  visible: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -40, opacity: 0 }),
}

const CAROUSEL_TOOL_IDS = ['resume', 'job-match', 'cover-letter'] as const
type CarouselToolId = (typeof CAROUSEL_TOOL_IDS)[number]

const CAROUSEL_IMAGES: Record<CarouselToolId, string> = {
  resume: carouselResume,
  'job-match': carouselJobMatch,
  'cover-letter': carouselCoverLetter,
}

const CAROUSEL_IMAGE_SCALE: Record<CarouselToolId, number> = {
  resume: 1.14,
  'job-match': 1.12,
  'cover-letter': 1.08,
}

type DashboardCarouselStyle = CSSProperties & {
  '--dashboard-carousel-image-scale': number
}

export function DashboardHero() {
  const { status, openAuthDialog } = useSession()
  const { activeIndex, direction, goTo, goNext, goPrev, hoverHandlers } =
    useCarousel(CAROUSEL_TOOL_IDS.length)

  const carouselToolId = CAROUSEL_TOOL_IDS[activeIndex]
  const tool = tools[carouselToolId]
  const frameImage = CAROUSEL_IMAGES[carouselToolId]
  const Icon = tool.icon
  const carouselStyle: DashboardCarouselStyle = {
    '--dashboard-carousel-image-scale': CAROUSEL_IMAGE_SCALE[carouselToolId],
  }
  const workspaceCtaContent = (
    <>
      <FolderOpenDot size={16} />
      Open saved workspace
    </>
  )

  return (
    <section className="dash-hero">
      <FadeUp className="dash-hero-panel dash-hero-copy">
        <div className="dash-hero-copy-inner">
          <Badge variant="outline" className="dash-hero-badge w-fit">
            <Sparkles size={12} />
            AI-powered workflow
          </Badge>
          <div className="dash-hero-headline-group">
            <h1 className="dash-hero-title text-gradient-hero">
              Build the search one strong decision at a time.
            </h1>
            <p className="dash-hero-body">
              Upload your resume, match it against a live role, and apply with context that carries across every tool.
            </p>
          </div>
          <div className="button-cluster button-cluster--hero">
            <Button asChild className="button-hero-primary" size="lg" data-tour="hero-cta">
              <Link to="/resume">
                Start with resume
                <ArrowRight size={16} />
              </Link>
            </Button>
            {status === 'authenticated' ? (
              <Button variant="outline" asChild className="button-surface-secondary" size="lg">
                <Link to="/history">{workspaceCtaContent}</Link>
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
                {workspaceCtaContent}
              </Button>
            )}
          </div>
        </div>
      </FadeUp>
      <FadeUp delay={0.15} className="dash-hero-panel dash-hero-side dash-hero-media">
        <div className="grid gap-4">
          <div className="dash-carousel-flow-header">
            <span className="dash-flow-label" style={{ color: tools.resume.accent }}>Resume</span>
            <span className="dash-flow-arrow">→</span>
            <span className="dash-flow-label" style={{ color: tools['job-match'].accent }}>Match</span>
            <span className="dash-flow-arrow">→</span>
            <span className="dash-flow-label" style={{ color: tools['cover-letter'].accent }}>Apply</span>
          </div>
          <div
            className="dash-carousel glass-elevated"
            {...hoverHandlers}
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
                  className="hero-mockup-frame dash-carousel-preview-frame"
                  style={carouselStyle}
                  custom={direction}
                  variants={slideVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ duration: 0.3, ease }}
                >
                  <img
                    src={frameImage}
                    alt={`${tool.label} preview`}
                    className="dash-carousel-image dash-carousel-image--dashboard"
                    draggable={false}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="hero-mockup-nav">
              <button className="hero-mockup-nav-btn glass" onClick={goPrev} aria-label="Previous tool">
                <ChevronLeft size={14} />
              </button>
              {CAROUSEL_TOOL_IDS.map((id, i) => {
                const item = tools[id]

                return (
                  <button
                    key={item.id}
                    className={`hero-mockup-dot${i === activeIndex ? ' is-active' : ''}`}
                    style={i === activeIndex ? { background: tool.accent } : undefined}
                    onClick={() => goTo(i)}
                    aria-label={item.label}
                  />
                )
              })}
              <button className="hero-mockup-nav-btn glass" onClick={goNext} aria-label="Next tool">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </FadeUp>
    </section>
  )
}
