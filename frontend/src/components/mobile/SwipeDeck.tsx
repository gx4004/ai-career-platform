import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SwipeDeckProps<T> {
  items: T[]
  renderFront: (item: T, index: number) => ReactNode
  renderBack: (item: T, index: number) => ReactNode
  footer?: (item: T, index: number) => ReactNode
}

export function SwipeDeck<T>({
  items,
  renderFront,
  renderBack,
  footer,
}: SwipeDeckProps<T>) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [direction, setDirection] = useState(0)
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-12, 12])
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5])

  const current = items[index]
  if (!current) return null

  const goNext = () => {
    if (index < items.length - 1) {
      setDirection(1)
      setIndex((i) => i + 1)
      setFlipped(false)
    }
  }

  const goPrev = () => {
    if (index > 0) {
      setDirection(-1)
      setIndex((i) => i - 1)
      setFlipped(false)
    }
  }

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -80 || info.velocity.x < -500) {
      goNext()
    } else if (info.offset.x > 80 || info.velocity.x > 500) {
      goPrev()
    }
  }

  return (
    <div className="swipe-deck">
      <div className="swipe-deck-progress">
        <div
          className="swipe-deck-progress-bar"
          style={{ width: `${((index + 1) / items.length) * 100}%` }}
        />
      </div>

      <div className="swipe-deck-stage">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={index}
            custom={direction}
            initial={{ x: direction > 0 ? 300 : -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ x, rotate, opacity }}
            onDragEnd={handleDragEnd}
            className="swipe-deck-card-wrap"
          >
            <div
              className={`swipe-deck-card${flipped ? ' is-flipped' : ''}`}
              onClick={() => setFlipped((f) => !f)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setFlipped((f) => !f)
                }
              }}
            >
              <div className="swipe-deck-card-front">
                {renderFront(current, index)}
              </div>
              <div className="swipe-deck-card-back">
                {renderBack(current, index)}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="swipe-deck-nav">
        <button
          type="button"
          className="swipe-deck-nav-btn"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="Previous"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="swipe-deck-counter">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          className="swipe-deck-nav-btn"
          onClick={goNext}
          disabled={index === items.length - 1}
          aria-label="Next"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {footer && (
        <div className="swipe-deck-footer">
          {footer(current, index)}
        </div>
      )}
    </div>
  )
}
