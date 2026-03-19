import type { CSSProperties } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCarousel } from '#/hooks/useCarousel'
import { toolList } from '#/lib/tools/registry'

const FRAME_IMAGES = [
  '/ai-generated/carousel/final-resume.png',
  '/ai-generated/carousel/final-career.png',
  '/ai-generated/carousel/final-interview.png',
  '/ai-generated/carousel/final-job-match.png',
  '/ai-generated/carousel/final-portfolio.png',
  '/ai-generated/carousel/final-cover-letter.png',
]

const FRAME_IMAGE_SCALE = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0] as const

const ease = [0.16, 1, 0.3, 1] as const

const slideVariants = {
  hidden: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  visible: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -40, opacity: 0 }),
}

export function HeroMockup() {
  const { activeIndex, direction, goTo, goNext, goPrev, hoverHandlers } =
    useCarousel(toolList.length)

  const tool = toolList[activeIndex]
  const frameImage = FRAME_IMAGES[activeIndex]
  const frameImageScale = FRAME_IMAGE_SCALE[activeIndex]
  const Icon = tool.icon

  return (
    <div className="hero-mockup">
      <motion.div
        className="hero-mockup-inner glass-elevated"
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
          <Icon size={14} style={{ color: tool.accent }} />
          <span style={{ fontSize: 'var(--type-xs)', color: tool.accent }}>
            {tool.label}
          </span>
        </div>

        <div className="hero-mockup-stage">
          <AnimatePresence custom={direction} mode="wait">
            <motion.div
              key={tool.id}
              className="hero-mockup-frame"
              style={
                {
                  '--landing-carousel-image-scale': frameImageScale,
                } as CSSProperties
              }
              custom={direction}
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, ease }}
            >
              <img
                src={frameImage}
                alt={tool.label}
                className="dash-carousel-image"
                draggable={false}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="hero-mockup-nav">
          <button
            className="hero-mockup-nav-btn glass"
            onClick={goPrev}
            aria-label="Previous tool"
          >
            <ChevronLeft size={14} />
          </button>
          {toolList.map((t, i) => (
            <button
              key={t.id}
              className={`hero-mockup-dot${i === activeIndex ? ' is-active' : ''}`}
              style={i === activeIndex ? { background: tool.accent } : undefined}
              onClick={() => goTo(i)}
              aria-label={t.label}
            />
          ))}
          <button
            className="hero-mockup-nav-btn glass"
            onClick={goNext}
            aria-label="Next tool"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  )
}
