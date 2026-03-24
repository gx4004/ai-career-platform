import { ArrowRight, Check } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '#/components/ui/button'
import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import {
  landingExperimentHeroCopy,
  landingPrimaryCta,
  type ExperimentHeroVariant,
} from '#/components/landing/landingContent'

export function LandingExperimentHero({
  variant = 'strong',
}: {
  variant?: ExperimentHeroVariant
}) {
  const prefersReducedMotion = useReducedMotion() ?? false
  const copy = landingExperimentHeroCopy[variant]

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    const el = document.getElementById(targetId)
    if (el) el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <section className="landing-experiment-hero landing-section" id="landing-hero">
      <div className="landing-experiment-hero-bg" aria-hidden="true">
        <div className="landing-experiment-hero-glow landing-experiment-hero-glow--top" />
      </div>

      <div className="content-max landing-experiment-hero-grid">
        <StaggerChildren
          className="landing-experiment-hero-copy"
          stagger={0.08}
          startHidden={!prefersReducedMotion}
        >
          <StaggerItem>
            <span className="landing-experiment-hero-eyebrow">{copy.eyebrow}</span>
          </StaggerItem>
          <StaggerItem>
            <h1 className="landing-experiment-hero-headline">
              {copy.headlinePre}
              <span className="text-accent">{copy.headlineAccent}</span>
              {copy.headlineMid}
              <br />
              {copy.headlinePost}
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="landing-experiment-hero-body">{copy.body}</p>
          </StaggerItem>
          <StaggerItem>
            <div className="landing-experiment-hero-actions">
              <Button asChild className="landing-experiment-hero-cta" size="lg">
                <a href={landingPrimaryCta.to}>
                  {copy.ctaLabel}
                  <ArrowRight size={16} />
                </a>
              </Button>
              <Button
                asChild
                className="landing-experiment-hero-cta landing-experiment-hero-cta--secondary"
                size="lg"
                variant="outline"
              >
                <a
                  href="#landing-journey"
                  onClick={(e) => handleSmoothScroll(e, 'landing-journey')}
                >
                  {copy.secondaryCtaLabel}
                </a>
              </Button>
            </div>
          </StaggerItem>
          <StaggerItem>
            <div className="landing-experiment-hero-trust">
              {copy.trustItems.map((item) => (
                <span key={item} className="landing-experiment-hero-trust-item">
                  <Check size={14} className="landing-experiment-hero-trust-icon" />
                  {item}
                </span>
              ))}
            </div>
          </StaggerItem>
        </StaggerChildren>

        <motion.div
          className="landing-experiment-mockup"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="landing-experiment-mockup-inner">
            <div className="landing-experiment-mockup-glow" aria-hidden="true" />

            <div className="landing-experiment-mockup-header">
              <div className="landing-experiment-mockup-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="landing-experiment-mockup-address">careerworkbench.io</div>
            </div>

            <div className="landing-experiment-mockup-stage">
              <img
                src="/ai-generated/carousel/final-resume.png"
                alt="Career Workbench resume analyzer preview"
                className="landing-experiment-mockup-image"
                draggable={false}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
