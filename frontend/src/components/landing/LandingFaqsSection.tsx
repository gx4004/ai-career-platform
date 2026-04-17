import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { landingFaqQuestions } from '#/components/landing/landingContent'

export function LandingFaqsSection() {
  const [openId, setOpenId] = useState<string | null>(landingFaqQuestions[0]?.id ?? null)
  const prefersReducedMotion = useReducedMotion() ?? false

  return (
    <section className="lp-section lp-codex-faq" id="landing-faq">
      <div className="lp-container lp-codex-faq-shell">
        <motion.h2
          className="lp-section-h2 lp-codex-section-title"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          Frequently Asked Questions
        </motion.h2>
        <motion.div
          className="lp-faq-list"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.05 } },
          }}
        >
          {landingFaqQuestions.map((q) => {
            const open = openId === q.id
            return (
              <motion.div
                key={q.id}
                className="lp-faq-item"
                data-open={open}
                layout
                variants={{
                  hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 12 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { type: 'spring', stiffness: 120, damping: 22 },
                  },
                }}
                transition={{ layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
              >
                <button
                  type="button"
                  className="lp-faq-trigger"
                  aria-expanded={open}
                  aria-controls={`${q.id}-content`}
                  onClick={() => setOpenId(open ? null : q.id)}
                >
                  <span>{q.title}</span>
                  <motion.span
                    className="lp-faq-chevron"
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    style={{ display: 'inline-flex' }}
                  >
                    <ChevronDown size={20} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      id={`${q.id}-content`}
                      className="lp-faq-content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="lp-codex-faq-answer">{q.content}</div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
