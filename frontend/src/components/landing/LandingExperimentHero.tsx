import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  landingExperimentHeroCopy,
  landingPrimaryCta,
} from '#/components/landing/landingContent'

const TRUST_ITEMS = [
  'CS graduates',
  'Bootcamp alumni',
  'Career switchers',
  'MBA candidates',
  'PhD researchers',
  'Product managers',
  'Design leads',
] as const

export function LandingExperimentHero() {
  const prefersReducedMotion = useReducedMotion() ?? false
  const copy = landingExperimentHeroCopy.strong
  const mobileHeadlineLines = copy.mobileHeadlineLines

  const fadeUp = (delay: number) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
  })

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    targetId: string,
  ) => {
    e.preventDefault()
    const el = document.getElementById(targetId)
    if (el) el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <section className="lp-hero" id="landing-hero">
      <div className="lp-hero-grid-bg" aria-hidden="true" />

      <div className="lp-hero-grid">
        {/* ── Text column ── */}
        <div className="lp-hero-copy">
          <motion.div className="lp-hero-eyebrow-row" {...fadeUp(0)}>
            <span className="lp-hero-eyebrow">{copy.eyebrow}</span>
            <span className="lp-hero-beta">
              <span className="lp-hero-beta-dot" aria-hidden="true" />
              Now in public beta
            </span>
          </motion.div>

          <h1 className="lp-hero-h1">
            <motion.span className="lp-hero-line lp-hero-line--desktop" {...fadeUp(0.08)}>
              Your{' '}
              <em className="lp-hero-shimmer">resume</em>
              {' '}has{' '}
              <em className="lp-hero-shimmer lp-hero-shimmer--alt">{copy.headlineAccent}</em>.
            </motion.span>
            <motion.span className="lp-hero-line lp-hero-line--desktop" {...fadeUp(0.16)}>
              {copy.headlinePost}
            </motion.span>

            <motion.span className="lp-hero-line lp-hero-line--mobile" aria-label={copy.headlinePost} {...fadeUp(0.08)}>
              Your{' '}
              <em className="lp-hero-shimmer">resume</em>
              {' '}has{' '}
              <em className="lp-hero-shimmer lp-hero-shimmer--alt">{copy.headlineAccent}</em>.
            </motion.span>
            <motion.span className="lp-hero-line lp-hero-line--mobile" {...fadeUp(0.16)}>
              {mobileHeadlineLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </motion.span>
          </h1>

          <motion.p className="lp-hero-body lp-hero-body--desktop" {...fadeUp(0.24)}>
            {copy.body}
          </motion.p>
          <motion.p className="lp-hero-body lp-hero-body--mobile" {...fadeUp(0.24)}>
            {copy.mobileBody}
          </motion.p>

          <motion.div className="lp-hero-actions" {...fadeUp(0.32)}>
            <a href={landingPrimaryCta.to} className="lp-btn-primary">
              <span>{copy.ctaLabel}</span>
              <span className="lp-btn-icon-circle" aria-hidden="true">
                <ArrowRight size={15} strokeWidth={2.5} />
              </span>
            </a>
            <a
              href="#landing-journey"
              className="lp-btn-ghost"
              onClick={(e) => handleSmoothScroll(e, 'landing-journey')}
            >
              {copy.secondaryCtaLabel}
            </a>
          </motion.div>
        </div>

        {/* ── Visual column: hero image ── */}
        <motion.div
          className="lp-hero-visual"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="lp-hero-visual-glow" aria-hidden="true" />
          <div className="lp-hero-image-shell">
            <div className="lp-hero-titlebar" aria-hidden="true">
              <span className="lp-hero-dot lp-hero-dot--red" />
              <span className="lp-hero-dot lp-hero-dot--yellow" />
              <span className="lp-hero-dot lp-hero-dot--green" />
            </div>
            <div className="lp-hero-image-core">
              <img
                src="/ai-generated/carousel/landing-hero.webp"
                alt="Laptop showing a dark analytics dashboard with career metrics"
                width={800}
                height={450}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                draggable={false}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Trust marquee */}
      <motion.div
        className="lp-hero-trust"
        aria-label="Built for job seekers across disciplines"
        {...fadeUp(0.5)}
      >
        <span className="lp-hero-trust-label">Built for</span>
        <div className="lp-hero-trust-track-wrap">
          <div className="lp-hero-trust-track" aria-hidden="true">
            {[...TRUST_ITEMS, ...TRUST_ITEMS].map((item, i) => (
              <span key={`${item}-${i}`}>{item}</span>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
