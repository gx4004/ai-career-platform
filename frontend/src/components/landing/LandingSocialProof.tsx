import { motion, useReducedMotion } from 'framer-motion'
import {
  landingSocialProofStat,
  landingTestimonials,
} from '#/components/landing/landingContent'

export function LandingSocialProof() {
  const prefersReducedMotion = useReducedMotion() ?? false

  return (
    <section className="lp-section lp-proof-section" id="landing-proof">
      <div className="lp-proof-bg" aria-hidden="true" />

      <div className="lp-container">
        {/* ── Stat header ── */}
        <motion.div
          className="lp-proof-header"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="lp-proof-stat-number">{landingSocialProofStat.value}</span>
          <span className="lp-proof-stat-label">{landingSocialProofStat.label}</span>
        </motion.div>

        {/* ── Testimonial grid ── */}
        <motion.div
          className="lp-proof-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.06 } },
          }}
        >
          {landingTestimonials.map((t) => (
            <motion.figure
              key={t.name}
              className="lp-proof-card"
              variants={{
                hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { type: 'spring', stiffness: 100, damping: 20 },
                },
              }}
            >
              <blockquote className="lp-testimonial-quote">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="lp-testimonial-author">
                <div className="lp-testimonial-avatar" aria-hidden="true">
                  {t.initials}
                </div>
                <div>
                  <div className="lp-testimonial-name">{t.name}</div>
                  <div className="lp-testimonial-role">{t.role}</div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
