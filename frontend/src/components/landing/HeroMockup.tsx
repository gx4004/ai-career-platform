import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCarousel } from '#/hooks/useCarousel'
import { tools, type ToolId } from '#/lib/tools/registry'

const CAROUSEL_ORDER: { id: ToolId; image: string }[] = [
  { id: 'resume', image: '/ai-generated/carousel/final-resume.png' },
  { id: 'cover-letter', image: '/ai-generated/carousel/final-cover-letter.png' },
  { id: 'job-match', image: '/ai-generated/carousel/final-job-match.png' },
  { id: 'career', image: '/ai-generated/carousel/final-career.png' },
  { id: 'interview', image: '/ai-generated/carousel/final-interview.png' },
  { id: 'portfolio', image: '/ai-generated/carousel/final-portfolio.png' },
]

const ease = [0.16, 1, 0.3, 1] as const

const fadeScaleVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.01 },
}

export function HeroMockup() {
  const { activeIndex, paused, goTo, goNext, goPrev, hoverHandlers } = useCarousel(
    CAROUSEL_ORDER.length,
  )

  const slide = CAROUSEL_ORDER[activeIndex]
  const tool = tools[slide.id]
  const Icon = tool.icon

  return (
    <div className="hero-mockup">
      <motion.div
        className="hero-mockup-inner"
        initial={{ opacity: 0, y: 30, rotateY: -4, rotateX: 2 }}
        animate={{ opacity: 1, y: 0, rotateY: -4, rotateX: 2 }}
        transition={{ duration: 0.7, delay: 0.3, ease }}
        {...hoverHandlers}
      >
        <div className="hero-mockup-header">
          <div className="hero-mockup-dots">
            <span />
            <span />
            <span />
          </div>
          <div className="hero-mockup-address-bar">
            <Icon size={14} style={{ color: tool.accent }} />
            <span style={{ fontSize: 'var(--type-xs)', color: tool.accent }}>
              {tool.label}
            </span>
          </div>
        </div>

        <div className="hero-mockup-stage">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              className="hero-mockup-frame"
              variants={fadeScaleVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.35, ease }}
            >
              <img src={slide.image} alt={tool.label} className="dash-carousel-image" draggable={false} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="hero-mockup-progress-track">
          <motion.div
            key={activeIndex}
            className="hero-mockup-auto-progress"
            style={{ background: tool.accent }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: paused ? undefined : 1 }}
            transition={{ duration: 4, ease: 'linear' }}
          />
        </div>

        <div className="hero-mockup-nav">
          <button className="hero-mockup-nav-btn" onClick={goPrev} aria-label="Previous tool">
            <ChevronLeft size={14} />
          </button>
          {CAROUSEL_ORDER.map((entry, index) => {
            const entryTool = tools[entry.id]
            return (
              <button
                key={entry.id}
                className={`hero-mockup-dot${index === activeIndex ? ' is-active' : ''}`}
                style={
                  index === activeIndex
                    ? {
                        background: entryTool.accent,
                        boxShadow: `0 0 8px ${entryTool.accent}44`,
                      }
                    : undefined
                }
                onClick={() => goTo(index)}
                aria-label={entryTool.label}
              />
            )
          })}
          <button className="hero-mockup-nav-btn" onClick={goNext} aria-label="Next tool">
            <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  )
}
