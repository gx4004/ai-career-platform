import { Star } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  landingSocialProofStat,
  landingTestimonials,
} from '#/components/landing/landingContent'
import { useSpotlight } from '#/hooks/useSpotlight'

export function LandingSocialProof() {
  const prefersReducedMotion = useReducedMotion() ?? false
  const spotlight = useSpotlight()

  return (
    <section className="lp-section lp-surface-lowest" id="landing-proof">
      <div className="lp-container">
        <motion.div
          style={{ textAlign: 'center', marginBottom: '1rem' }}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="lp-section-h2" style={{ marginBottom: '0.5rem' }}>
            {landingSocialProofStat.value} resumes analyzed.
          </h2>
          <p style={{ color: 'var(--lp-tertiary)', fontWeight: 500 }}>Careers unblocked.</p>
        </motion.div>

        <motion.div
          className="lp-testimonials-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.08 } },
          }}
        >
          {landingTestimonials.map((t) => (
            <motion.figure
              key={t.name}
              className="lp-testimonial-card lp-spotlight"
              {...spotlight}
              variants={{
                hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { type: 'spring', stiffness: 100, damping: 20 },
                },
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 2,
                  color: 'var(--lp-tertiary)',
                  marginBottom: '1rem',
                }}
                aria-label="5 out of 5 stars"
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} fill="currentColor" strokeWidth={0} />
                ))}
              </div>
              <blockquote className="lp-testimonial-quote">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="lp-testimonial-author">
                <div
                  className="lp-testimonial-avatar"
                  aria-hidden="true"
                  style={{
                    background: 'linear-gradient(135deg, #adc6ff 0%, #0f69dc 100%)',
                    color: '#002e6a',
                  }}
                >
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
