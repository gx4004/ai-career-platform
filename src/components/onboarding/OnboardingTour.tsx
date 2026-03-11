import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, X } from 'lucide-react'
import { Button } from '#/components/ui/button'

type TourStep = {
  target: string
  title: string
  body: string
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="hero-cta"]',
    title: 'Start here',
    body: 'Upload your resume to begin the workflow — every tool builds on this first step.',
  },
  {
    target: '[data-tour="quick-start"]',
    title: 'Six connected tools',
    body: 'Each tool builds on the previous. Start left, move right through the workflow.',
  },
  {
    target: '[data-tour="activity"]',
    title: 'Your activity',
    body: 'Recent runs and favorites appear here. Sign in to persist your workspace.',
  },
]

const tooltipVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.96 },
}

function getTooltipPosition(rect: DOMRect) {
  const pad = 12
  const top = rect.bottom + pad
  const left = Math.max(16, rect.left + rect.width / 2 - 160)
  const fitsBelow = top + 200 < window.innerHeight
  return {
    top: fitsBelow ? top : rect.top - pad - 180,
    left: Math.min(left, window.innerWidth - 336),
    placement: fitsBelow ? ('below' as const) : ('above' as const),
  }
}

export function OnboardingTour({
  open,
  onComplete,
  onSkip,
}: {
  open: boolean
  onComplete: () => void
  onSkip: () => void
}) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const rafRef = useRef(0)

  const measure = useCallback(() => {
    const sel = STEPS[step]?.target
    if (!sel) return
    const el = document.querySelector(sel)
    if (el) {
      setRect(el.getBoundingClientRect())
    }
  }, [step])

  useEffect(() => {
    if (!open) return
    // small delay so dashboard elements mount first
    const id = setTimeout(measure, 300)
    return () => clearTimeout(id)
  }, [open, step, measure])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      cancelAnimationFrame(rafRef.current)
    }
  }, [open, measure])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      onComplete()
    }
  }, [step, onComplete])

  if (!open || !rect) return null

  const pos = getTooltipPosition(rect)
  const current = STEPS[step]

  return createPortal(
    <>
      {/* Pulsing ring highlight */}
      <div
        className="tour-ring"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          borderRadius: 'var(--radius-xl)',
        }}
      />

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="tour-tooltip glass-elevated"
          style={{ top: pos.top, left: pos.left }}
          variants={tooltipVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="tour-tooltip-header">
            <span className="small-copy muted-copy">
              {step + 1} of {STEPS.length}
            </span>
            <button className="tour-close" onClick={onSkip} aria-label="Skip tour">
              <X size={14} />
            </button>
          </div>
          <h3 className="section-title">{current.title}</h3>
          <p className="small-copy muted-copy">{current.body}</p>
          <div className="tour-tooltip-footer">
            <div className="tour-dots">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`tour-dot${i === step ? ' is-active' : i < step ? ' is-done' : ''}`}
                />
              ))}
            </div>
            <Button size="sm" className="button-hero-primary" onClick={next}>
              {step === STEPS.length - 1 ? 'Got it' : 'Next'}
              <ArrowRight size={14} />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>,
    document.body,
  )
}
