import { motion, useReducedMotion } from 'framer-motion'
import {
  landingWorkflowCopy,
  landingWorkflowFeatures,
} from '#/components/landing/landingContent'

export function LandingFeatureStepsDemo(_: { autoPlay?: boolean } = {}) {
  const prefersReducedMotion = useReducedMotion() ?? false

  return (
    <section className="lp-section lp-codex-workflow" id="landing-journey">
      <div className="lp-container lp-codex-workflow-shell">
        <motion.div
          className="lp-codex-workflow-intro"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="lp-codex-section-label">{landingWorkflowCopy.eyebrow}</p>
          <h2 className="lp-section-h2 lp-codex-section-title">{landingWorkflowCopy.title}</h2>
          <p className="lp-codex-section-copy">
            Start from what you already have, point it at one role, and keep the same context alive
            through every next step.
          </p>
        </motion.div>

        <motion.div
          className="lp-codex-workflow-grid"
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
              className="lp-codex-workflow-card-wrap"
              variants={{
                hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 32 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { type: 'spring', stiffness: 100, damping: 20 },
                },
              }}
            >
              <article className="lp-codex-workflow-card">
                <div className="lp-codex-workflow-card-head">
                  <span className="lp-codex-workflow-step">{String(i + 1).padStart(2, '0')}</span>
                  <p className="lp-codex-workflow-kicker">{f.step}</p>
                </div>
                <h3 className="lp-workflow-title lp-codex-workflow-title">{f.title}</h3>
                <p className="lp-workflow-body lp-codex-workflow-body">{f.content}</p>
                <div className="lp-codex-workflow-image">
                  <img
                    src={f.image}
                    alt={f.title}
                    width={960}
                    height={640}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </div>
              </article>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
