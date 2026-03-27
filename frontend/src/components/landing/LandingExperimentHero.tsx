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
    <section className="landing-cascade-hero landing-section" id="landing-hero">
      {/* Background: layered blue gradient (dashboard lamp style) */}
      <div className="landing-cascade-bg" aria-hidden="true">
        <div className="landing-cascade-beam" />
        <div className="landing-cascade-beam-wash" />
      </div>

      {/* Split grid: copy left, product right */}
      <div className="content-max landing-cascade-grid">
        <StaggerChildren
          className="landing-cascade-copy"
          stagger={0.08}
          startHidden={!prefersReducedMotion}
        >
          <StaggerItem>
            <span className="landing-cascade-eyebrow">{copy.eyebrow}</span>
          </StaggerItem>
          <StaggerItem>
            <h1 className="landing-cascade-headline">
              {copy.headlinePre}
              <span className="landing-cascade-accent">{copy.headlineAccent}</span>
              {copy.headlineMid}
              <br />
              {copy.headlinePost}
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="landing-cascade-body">{copy.body}</p>
          </StaggerItem>
          <StaggerItem>
            <div className="landing-cascade-actions">
              <Button asChild className="landing-cascade-cta" size="lg">
                <a href={landingPrimaryCta.to}>
                  {copy.ctaLabel}
                  <ArrowRight size={16} />
                </a>
              </Button>
              <Button
                asChild
                className="landing-cascade-cta landing-cascade-cta--ghost"
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
            <div className="landing-cascade-trust">
              {copy.trustItems.map((item) => (
                <span key={item} className="landing-cascade-trust-item">
                  <Check size={14} className="landing-cascade-trust-check" />
                  {item}
                </span>
              ))}
            </div>
          </StaggerItem>
        </StaggerChildren>

        {/* Product mockup with 3D tilt */}
        <motion.div
          className="landing-cascade-mockup"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="landing-cascade-mockup-glow" aria-hidden="true" />
          <div className="landing-cascade-window">
            <div className="landing-cascade-window-bar">
              <div className="landing-cascade-window-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="landing-cascade-window-url">careerworkbench.io</div>
            </div>
            <img
              src="/ai-generated/carousel/final-resume.png"
              alt="Career Workbench resume analyzer preview"
              className="landing-cascade-window-image"
              draggable={false}
            />
          </div>
        </motion.div>
      </div>

      {/* Cascade fade: dark gradient → frosted blue page */}
      <div className="landing-cascade-fade" aria-hidden="true" />
    </section>
  )
}
