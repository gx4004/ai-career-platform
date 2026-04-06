import { ArrowRight, Check } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '#/components/ui/button'
import { ScrollStagger, ScrollStaggerItem, MagneticButton } from '#/components/ui/motion'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { landingCtaCopy, landingPrimaryCta } from '#/components/landing/landingContent'

export function LandingCTA() {
  const prefersReducedMotion = useReducedMotion() ?? false

  return (
    <motion.section
      className="landing-cta-dark"
      id="landing-cta"
      initial={prefersReducedMotion ? false : { opacity: 0, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, filter: 'blur(0px)' }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Aurora blob */}
      <div className="landing-aurora-blob landing-aurora-blob--3" aria-hidden="true" />

      {/* Fade-in: light → dark (reverse of hero's dark → light) */}
      <div className="landing-cta-fade" aria-hidden="true" />

      {/* Background: exact mirror of hero */}
      <div className="landing-cta-bg" aria-hidden="true">
        <div className="landing-cta-beam" />
        <div className="landing-cta-beam-wash" />
      </div>

      <ScrollStagger stagger={0.1} className="content-max landing-cta-dark-content">
        <ScrollStaggerItem>
          <h2 className="landing-cta-dark-title">{landingCtaCopy.title}</h2>
        </ScrollStaggerItem>

        <ScrollStaggerItem>
          <ul className="landing-cta-dark-bullets">
            {landingCtaCopy.valueBullets.map((bullet, i) => (
              <motion.li
                key={bullet}
                className="landing-cta-dark-bullet"
                initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <Check size={14} className="landing-cta-dark-check" />
                {bullet}
              </motion.li>
            ))}
          </ul>
        </ScrollStaggerItem>

        <ScrollStaggerItem>
          <MagneticButton>
            <Button asChild className="landing-cta-dark-btn" size="lg">
              <a href={landingPrimaryCta.to}>
                {landingCtaCopy.ctaLabel}
                <ArrowRight size={16} />
              </a>
            </Button>
          </MagneticButton>
          <p className="landing-cta-dark-trust">{landingCtaCopy.trustLine}</p>
        </ScrollStaggerItem>
      </ScrollStagger>

      {/* Footer merged into the dark section */}
      <footer className="landing-cta-footer">
        <div className="content-max landing-footer-inner">
          <div className="landing-footer-brand">
            <AppBrandLockup className="landing-footer-lockup" />
            <p className="landing-cta-footer-tagline">Signal first. Better applications. Clearer next steps.</p>
          </div>
          <p className="landing-cta-footer-copyright">
            &copy; {new Date().getFullYear()} Career Workbench
          </p>
        </div>
      </footer>
    </motion.section>
  )
}
