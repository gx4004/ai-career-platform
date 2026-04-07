import { motion, useReducedMotion } from 'framer-motion'
import {
  landingWorkflowCopy,
  landingWorkflowFeatures,
} from '#/components/landing/landingContent'

export function LandingFeatureStepsDemo(_: { autoPlay?: boolean } = {}) {
  const prefersReducedMotion = useReducedMotion() ?? false

  return (
    <section className="lp-section" id="landing-journey">
      <div className="lp-container">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="lp-section-h2">{landingWorkflowCopy.title}</h2>
          <p className="lp-section-sub">
            A systematic approach to career growth, powered by AI precision.
          </p>
        </motion.div>

        <motion.div
          className="lp-workflow-grid"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
          }}
        >
          {landingWorkflowFeatures.map((f, i) => (
            <motion.div
              key={f.step}
              className={`lp-workflow-card-wrap${i === 1 ? ' is-step-2' : i === 2 ? ' is-step-3' : ''}`}
              variants={{
                hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 32 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { type: 'spring', stiffness: 100, damping: 20 },
                },
              }}
            >
              <div className="lp-workflow-card">
                <span className="lp-workflow-num">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="lp-workflow-title">{f.step}</h3>
                <p className="lp-workflow-body">{f.content}</p>
                <div className="lp-duotone" style={{ marginTop: 'auto', borderRadius: '0.75rem' }}>
                  <img
                    src={f.image}
                    alt={f.title}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
