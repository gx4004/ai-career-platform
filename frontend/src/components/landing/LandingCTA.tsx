import { ArrowRight } from 'lucide-react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion'
import { landingCtaCopy, landingPrimaryCta } from '#/components/landing/landingContent'

export function LandingCTA() {
  const prefersReducedMotion = useReducedMotion() ?? false

  // Magnetic pull on the primary CTA (pure motion values, no React state)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, { stiffness: 180, damping: 18 })
  const y = useSpring(my, { stiffness: 180, damping: 18 })

  const handleMagnet = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (prefersReducedMotion) return
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    mx.set((event.clientX - cx) * 0.22)
    my.set((event.clientY - cy) * 0.22)
  }
  const resetMagnet = () => {
    mx.set(0)
    my.set(0)
  }

  return (
    <section className="lp-section" id="landing-cta">
      <motion.div
        className="lp-cta-card"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="lp-cta-orb lp-cta-orb-1" aria-hidden="true" />
        <div className="lp-cta-orb lp-cta-orb-2" aria-hidden="true" />
        <h2 className="lp-cta-h2">{landingCtaCopy.title}</h2>
        <motion.a
          href={landingPrimaryCta.to}
          className="lp-btn-primary"
          onMouseMove={handleMagnet}
          onMouseLeave={resetMagnet}
          style={prefersReducedMotion ? undefined : { x, y }}
        >
          {landingCtaCopy.ctaLabel}
          <ArrowRight size={18} />
        </motion.a>
        <p className="lp-cta-micro">No sign-up required. Your data stays yours.</p>
      </motion.div>
    </section>
  )
}
