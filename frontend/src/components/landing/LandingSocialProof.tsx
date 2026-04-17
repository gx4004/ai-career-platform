import { ArrowUpRight, Star } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  landingSocialProofStat,
  landingTestimonials,
} from '#/components/landing/landingContent'

export function LandingSocialProof() {
  const prefersReducedMotion = useReducedMotion() ?? false

  return (
    <section className="lp-section lp-surface-lowest lp-codex-social" id="landing-proof">
      <div className="lp-container lp-codex-social-shell">
        <motion.div
          className="lp-codex-social-intro"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="lp-codex-section-label">Quiet proof</p>
          <h2 className="lp-section-h2 lp-codex-section-title">
            The landing page should feel as focused as the product.
          </h2>
          <p className="lp-codex-section-copy">
            Strong signals, clearer hierarchy, and calmer pacing. The point is not more motion. It
            is knowing what matters first.
          </p>
        </motion.div>

        <div className="lp-codex-social-grid">
          <motion.aside
            className="lp-codex-metrics-card"
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="lp-codex-metrics-label">Operating metrics</p>
            <div className="lp-codex-metrics-stat">
              <strong>{landingSocialProofStat.value}</strong>
              <span>{landingSocialProofStat.label}</span>
            </div>
            <ul className="lp-codex-metrics-list">
              <li>
                <span>Resume review</span>
                <strong>First useful edits surfaced fast</strong>
              </li>
              <li>
                <span>Job match</span>
                <strong>One role mapped before new drafts start</strong>
              </li>
              <li>
                <span>Output quality</span>
                <strong>Application assets stay anchored to the same evidence</strong>
              </li>
            </ul>
            <a className="lp-codex-inline-link" href="#landing-tools">
              Explore the tool chain
              <ArrowUpRight size={16} />
            </a>
          </motion.aside>

          <motion.div
            className="lp-codex-quote-grid"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
          >
            {landingTestimonials.slice(0, 3).map((t) => (
              <motion.figure
                key={t.name}
                className="lp-codex-quote-card"
                variants={{
                  hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { type: 'spring', stiffness: 100, damping: 20 },
                  },
                }}
              >
                <div className="lp-codex-stars" role="img" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="lp-testimonial-quote">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption className="lp-codex-quote-author">
                  <div className="lp-codex-quote-avatar" aria-hidden="true">
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
      </div>
    </section>
  )
}
