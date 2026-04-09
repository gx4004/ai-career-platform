import { ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion'
import {
  landingExperimentHeroCopy,
  landingPrimaryCta,
} from '#/components/landing/landingContent'

const MotionLink = motion(Link)

// Neutral audience descriptors — no real brands/universities to avoid implied-endorsement
// or trademark issues. Swap in testimonials later once we have written permission.
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
  const mobileHeadlineLines =
    copy.headlinePost === 'We find them before recruiters do.'
      ? ['We find them', 'before recruiters do.']
      : [copy.headlinePost]

  // Parallax tilt on the hero image card (no React state — pure motion values)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-6, 6]), {
    stiffness: 120,
    damping: 20,
  })
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [4, -4]), {
    stiffness: 120,
    damping: 20,
  })

  const handleTilt = (event: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion) return
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    mx.set((event.clientX - rect.left) / rect.width - 0.5)
    my.set((event.clientY - rect.top) / rect.height - 0.5)
  }
  const resetTilt = () => {
    mx.set(0)
    my.set(0)
  }

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
      <div className="lp-hero-grid">
        <div className="lp-hero-copy">
          <div className="lp-hero-eyebrow-row">
            <span className="lp-hero-eyebrow">{copy.eyebrow}</span>
            <span className="lp-hero-beta">
              <span className="lp-hero-beta-dot" aria-hidden="true" />
              Now in public beta
            </span>
          </div>
          <h1 className="lp-hero-h1">
            Your{' '}
            <span className="lp-hero-shimmer">{'resume'}</span>
            <br className="lp-hero-br--mobile" />
            {' '}has{' '}
            <span className="lp-hero-shimmer lp-hero-shimmer--alt">{copy.headlineAccent}</span>
            .{' '}
            <span className="lp-hero-line lp-hero-line--desktop">{copy.headlinePost}</span>
            <span className="lp-hero-line lp-hero-line--mobile" aria-label={copy.headlinePost}>
              {mobileHeadlineLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </h1>
          <p className="lp-hero-body lp-hero-body--desktop">{copy.body}</p>
          <p className="lp-hero-body lp-hero-body--mobile">
            Upload your resume and see exactly what{'\u2019'}s<br />
            working, what{'\u2019'}s not, and what to fix first<br />
            {' \u2014 '}in under a minute.
          </p>
          <div className="lp-hero-actions">
            <a href={landingPrimaryCta.to} className="lp-btn-primary">
              {copy.ctaLabel}
              <ArrowRight size={18} />
            </a>
            <a
              href="#landing-journey"
              className="lp-btn-ghost"
              onClick={(e) => handleSmoothScroll(e, 'landing-journey')}
            >
              {copy.secondaryCtaLabel}
            </a>
          </div>
        </div>

        <MotionLink
          to="/dashboard"
          className="lp-hero-image-wrap lp-hero-image-link"
          aria-label="Open Career Workbench dashboard"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          onMouseMove={handleTilt}
          onMouseLeave={resetTilt}
        >
          <div className="lp-hero-image-halo" aria-hidden="true" />
          <motion.div
            className="lp-hero-image-card"
            style={prefersReducedMotion ? undefined : { rotateX, rotateY }}
          >
            <img
              src="/ai-generated/carousel/hero-resume-analyzer.webp"
              alt="Career Workbench resume analyzer preview"
              width={800}
              height={471}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
          </motion.div>
        </MotionLink>
      </div>

      {/* Trust marquee — outside the grid so it spans the full hero width */}
      <div className="lp-hero-trust" aria-label="Built for job seekers across disciplines">
        <span className="lp-hero-trust-label">Built for</span>
        <div className="lp-hero-trust-track-wrap">
          <div className="lp-hero-trust-track" aria-hidden="true">
            {[...TRUST_ITEMS, ...TRUST_ITEMS].map((item, i) => (
              <span key={`${item}-${i}`}>{item}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
