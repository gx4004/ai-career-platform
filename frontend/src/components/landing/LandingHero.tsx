import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { Button } from '#/components/ui/button'
import { StaggerChildren, StaggerItem, motion } from '#/components/ui/motion'
import { HeroMockup } from '#/components/landing/HeroMockup'
import { landingHeroStageCopy, landingPrimaryCta } from '#/components/landing/landingContent'

export type LandingHeroVariant = 'classic' | 'lamp'

export function LandingHero({
  variant = 'classic',
  animateOnMount = true,
}: {
  variant?: LandingHeroVariant
  animateOnMount?: boolean
}) {
  const prefersReducedMotion = useReducedMotion() ?? false

  if (variant === 'lamp') {
    return (
      <section className="landing-hero landing-section landing-hero--lamp" id="landing-hero">
        <div className="content-max landing-dashboard-hero">
          <StaggerChildren
            className="landing-dashboard-hero-copy"
            stagger={0.08}
            startHidden={animateOnMount && !prefersReducedMotion}
          >
            <StaggerItem className="flex justify-center">
              <h1 className="display-xl text-balance text-white">
                One shared signal. Six sharper moves.
              </h1>
            </StaggerItem>
            <StaggerItem className="flex justify-center">
              <p className="max-w-2xl text-lg leading-8 text-[rgba(220,232,255,0.78)]">
                Career Workbench keeps your resume baseline, role context, and next fixes
                connected from first review to final prep.
              </p>
            </StaggerItem>
            <StaggerItem className="flex justify-center">
              <Button asChild className="button-hero-primary landing-dashboard-hero-cta" size="lg">
                <Link to={landingPrimaryCta.to}>
                  Open the workbench
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </StaggerItem>
          </StaggerChildren>

          <motion.div
            className="landing-dashboard-stage"
            data-testid="landing-dashboard-stage"
            initial={animateOnMount && !prefersReducedMotion ? { opacity: 0, y: 72, scale: 0.94 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="landing-dashboard-stage-glow" aria-hidden="true" />
            <div className="landing-dashboard-stage-window">
              <div className="landing-dashboard-stage-bar">
                <div className="hero-mockup-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-dashboard-stage-meta">
                  <span className="landing-dashboard-stage-kicker">
                    {landingHeroStageCopy.eyebrow}
                  </span>
                  <span className="landing-dashboard-stage-status">
                    {landingHeroStageCopy.status}
                  </span>
                </div>
              </div>

              <div className="landing-dashboard-stage-frame">
                <img
                  src="/ai-generated/carousel/final-job-match.png"
                  alt="Career Workbench dashboard preview"
                  className="landing-dashboard-stage-image"
                  draggable={false}
                />
                <div className="landing-dashboard-stage-overlay-card landing-dashboard-stage-overlay-card--signal">
                  <p className="landing-dashboard-stage-overlay-eyebrow">Resume signal</p>
                  <p className="landing-dashboard-stage-overlay-title">86 / 100</p>
                  <p className="landing-dashboard-stage-overlay-copy">
                    Shortlist-ready proof with clear next edits.
                  </p>
                </div>
                <div className="landing-dashboard-stage-overlay-card landing-dashboard-stage-overlay-card--context">
                  <p className="landing-dashboard-stage-overlay-eyebrow">Shared context</p>
                  <p className="landing-dashboard-stage-overlay-copy">
                    One role, one baseline, six connected moves.
                  </p>
                </div>
                <div className="landing-dashboard-stage-pills">
                  {landingHeroStageCopy.pills.map((pill) => (
                    <span key={pill} className="landing-dashboard-stage-pill">
                      {pill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    )
  }

  return (
    <section className="landing-hero landing-section" id="landing-hero">
      <div className="content-max landing-hero-grid">
        <StaggerChildren
          className="landing-hero-copy"
          stagger={0.08}
          startHidden={animateOnMount && !prefersReducedMotion}
        >
          <StaggerItem>
            <h1 className="display-xl text-gradient-aurora text-balance">
              Your resume has blind spots. We find them before recruiters do.
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-lg text-[var(--text-body)]">
              Upload your resume and get an instant score, targeted fixes, role matching,
              a cover letter draft, interview prep, and career planning — one session,
              fully connected.
            </p>
          </StaggerItem>
          <StaggerItem>
            <Button asChild className="button-hero-primary" size="lg">
              <Link to={landingPrimaryCta.to}>
                Start free — no account needed
                <ArrowRight size={16} />
              </Link>
            </Button>
          </StaggerItem>
        </StaggerChildren>
        <HeroMockup />
      </div>
    </section>
  )
}
