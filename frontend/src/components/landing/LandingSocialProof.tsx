import { motion, useReducedMotion } from 'framer-motion'

export function LandingSocialProof() {
  const prefersReducedMotion = useReducedMotion() ?? false

  return (
    <section className="lp-section lp-surface-lowest" id="landing-proof">
      <div className="lp-container">
        <motion.div
          style={{ textAlign: 'center', maxWidth: '46rem', margin: '0 auto' }}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="lp-section-h2" style={{ marginBottom: '0.75rem' }}>
            A thesis project in public beta.
          </h2>
          <p style={{ color: 'var(--lp-tertiary)', fontWeight: 500, lineHeight: 1.6 }}>
            Career Workbench is a 2025/2026 thesis at Politechnika Wrocławska. The tools are
            free to try, your data stays in your account, and you can delete it at any time.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
