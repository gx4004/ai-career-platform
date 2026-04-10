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
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="lp-section-eyebrow">{landingWorkflowCopy.eyebrow}</span>
          <h2 className="lp-section-h2">
            {landingWorkflowCopy.title.split('.').filter(Boolean).map((word, i) => (
              <span key={word}>
                {word.trim()}
                {i < 2 && <span className="lp-workflow-separator" aria-hidden="true"> · </span>}
              </span>
            ))}
          </h2>
        </motion.div>

        {/* Zig-zag steps */}
        <div className="lp-workflow-zigzag">
          {/* Connecting line */}
          <div className="lp-workflow-line" aria-hidden="true" />

          {landingWorkflowFeatures.map((f, i) => (
            <motion.div
              key={f.step}
              className={`lp-workflow-step${i % 2 === 1 ? ' lp-workflow-step--reversed' : ''}`}
              initial={prefersReducedMotion ? false : {
                opacity: 0,
                x: i % 2 === 0 ? -32 : 32,
              }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{
                duration: 0.7,
                delay: i * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {/* Text side */}
              <div className="lp-workflow-step-text">
                <span className="lp-workflow-step-num">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="lp-workflow-title">{f.step}</h3>
                <p className="lp-workflow-body">{f.content}</p>
              </div>

              {/* Image side */}
              <div className="lp-workflow-step-visual">
                <div className="lp-workflow-img-shell">
                  <div className="lp-workflow-img-core">
                    <img
                      src={f.image}
                      alt={f.title}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="lp-workflow-img"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
