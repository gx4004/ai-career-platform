import { useCallback, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '#/lib/utils'

type FaqAnimatedProps = {
  questions: Array<{ id: string; title: string; content: string }>
  className?: string
}

export function FaqAnimated({ questions, className }: FaqAnimatedProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const prefersReducedMotion = useReducedMotion()

  const toggle = useCallback(
    (index: number) => setOpenIndex((prev) => (prev === index ? null : index)),
    [],
  )

  return (
    <div className={cn('faq-animated', className)}>
      {questions.map((faq, index) => {
        const isOpen = openIndex === index
        return (
          <FaqItem
            key={faq.id}
            faq={faq}
            isOpen={isOpen}
            onToggle={() => toggle(index)}
            reducedMotion={prefersReducedMotion ?? false}
          />
        )
      })}
    </div>
  )
}

function FaqItem({
  faq,
  isOpen,
  onToggle,
  reducedMotion,
}: {
  faq: { id: string; title: string; content: string }
  isOpen: boolean
  onToggle: () => void
  reducedMotion: boolean
}) {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div className={cn('faq-animated-card', isOpen && 'faq-animated-card--open')}>
      <button
        type="button"
        onClick={onToggle}
        className="faq-animated-trigger"
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${faq.id}`}
      >
        <span className="faq-animated-title">{faq.title}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
          className="faq-animated-chevron"
        >
          <ChevronDown size={18} />
        </motion.div>
      </button>

      <div
        id={`faq-answer-${faq.id}`}
        role="region"
        className="faq-animated-collapse"
        data-open={isOpen ? 'true' : 'false'}
      >
        <div ref={contentRef} className="faq-animated-body">
          <p>{faq.content}</p>
        </div>
      </div>
    </div>
  )
}
