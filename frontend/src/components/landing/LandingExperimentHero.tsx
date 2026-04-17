import { ArrowRight, BriefcaseBusiness, CircleCheckBig, ScanSearch } from 'lucide-react'
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

const TRUST_ITEMS = [
  'Resume signal mapped in 43 seconds',
  'Role fit pulled from one live posting',
  'Interview angles carried into the same session',
] as const

export function LandingExperimentHero() {
  const prefersReducedMotion = useReducedMotion() ?? false
  const copy = landingExperimentHeroCopy.strong
  const mobileHeadlineLines = copy.mobileHeadlineLines

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
    <section className="lp-hero lp-codex-hero" id="landing-hero">
      <div className="lp-codex-hero-grid">
        <div className="lp-hero-copy lp-codex-hero-copy">
          <div className="lp-codex-eyebrow-row">
            <span className="lp-codex-eyebrow">{copy.eyebrow}</span>
            <span className="lp-codex-status">
              <span className="lp-codex-status-dot" aria-hidden="true" />
              Live analysis workspace
            </span>
          </div>
          <h1 className="lp-hero-h1 lp-codex-hero-title">
            Your resume has <span className="lp-codex-accent">{copy.headlineAccent}</span>.
            <span className="lp-codex-hero-title-desktop"> {copy.headlinePost}</span>
            <span className="lp-codex-hero-title-mobile" aria-label={copy.headlinePost}>
              {mobileHeadlineLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </h1>
          <p className="lp-hero-body lp-codex-hero-body lp-codex-hero-body--desktop">{copy.body}</p>
          <p className="lp-hero-body lp-codex-hero-body lp-codex-hero-body--mobile">{copy.mobileBody}</p>

          <div className="lp-codex-hero-actions">
            <a href={landingPrimaryCta.to} className="lp-codex-btn lp-codex-btn--primary">
              {copy.ctaLabel}
              <ArrowRight size={18} />
            </a>
            <a
              href="#landing-journey"
              className="lp-codex-btn lp-codex-btn--secondary"
              onClick={(e) => handleSmoothScroll(e, 'landing-journey')}
            >
              {copy.secondaryCtaLabel}
            </a>
          </div>

          <div className="lp-codex-proof-grid" aria-label="Highlights from the workflow">
            <article className="lp-codex-proof-card">
              <ScanSearch size={18} aria-hidden="true" />
              <strong>See the baseline</strong>
              <p>Surface missing proof, weak phrasing, and the first edits worth making.</p>
            </article>
            <article className="lp-codex-proof-card">
              <BriefcaseBusiness size={18} aria-hidden="true" />
              <strong>Aim at one role</strong>
              <p>Lock one real posting into the same workspace before you draft anything new.</p>
            </article>
            <article className="lp-codex-proof-card">
              <CircleCheckBig size={18} aria-hidden="true" />
              <strong>Carry context forward</strong>
              <p>Cover letters, prep, and next steps all inherit the same signal.</p>
            </article>
          </div>
        </div>

        <MotionLink
          to="/dashboard"
          className="lp-hero-image-wrap lp-hero-image-link lp-codex-hero-visual"
          aria-label="Open Career Workbench dashboard"
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          onMouseMove={handleTilt}
          onMouseLeave={resetTilt}
        >
          <div className="lp-codex-hero-frame">
            <div className="lp-codex-hero-kicker">
              <span>Resume review</span>
              <span>Role fit</span>
              <span>Application flow</span>
            </div>
            <motion.div
              className="lp-hero-image-card lp-codex-hero-image-card"
              style={prefersReducedMotion ? undefined : { rotateX, rotateY }}
            >
              <img
                src="/ai-generated/landing-codex/landing-codex-hero-dashboard.webp"
                alt="Career Workbench dashboard showing resume review insights in a dark editorial interface"
                width={1200}
                height={675}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                draggable={false}
              />
            </motion.div>
            <div className="lp-codex-floating-note lp-codex-floating-note--top">
              <span className="lp-codex-floating-note-label">Blind spots found</span>
              <strong>3 fixes worth making first</strong>
            </div>
            <div className="lp-codex-floating-note lp-codex-floating-note--bottom">
              <span className="lp-codex-floating-note-label">Role match snapshot</span>
              <strong>Experience proof linked to one target role</strong>
            </div>
          </div>
        </MotionLink>
      </div>

      <div className="lp-codex-trust-strip" aria-label="Workflow outcomes">
        <span className="lp-codex-trust-label">Inside the workbench</span>
        <div className="lp-codex-trust-items">
          {TRUST_ITEMS.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
