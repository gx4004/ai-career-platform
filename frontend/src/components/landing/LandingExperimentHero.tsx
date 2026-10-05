import { ShieldCheck, Upload } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button, Sticker } from '#/components/kit'
import { HeroCollage } from '#/components/landing/HeroCollage'
import { landingExperimentHeroCopy, landingPrimaryCta } from '#/components/landing/landingContent'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'

export function LandingExperimentHero() {
  const copy = landingExperimentHeroCopy.strong
  const reducedMotion = usePrefersReducedMotion()

  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault()
    const el = document.getElementById(targetId)
    if (el) el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <section className="lp-hero" id="landing-hero" aria-labelledby="landing-hero-heading">
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <Sticker as="span" size="sm" tone="lemon" tilt={-2} className="lp-beta">
            <span className="lp-beta__dot" aria-hidden="true" />
            {copy.betaLabel}
          </Sticker>
          <h1 className="lp-display lp-hero-h1" id="landing-hero-heading">
            {copy.headline}
          </h1>
          <p className="lp-body-l lp-hero-body">{copy.body}</p>
          <div className="lp-hero-actions">
            <Button asChild size="lg">
              <Link to={landingPrimaryCta.to}>
                <Upload aria-hidden="true" />
                {copy.ctaLabel}
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#landing-journey" onClick={(e) => handleSmoothScroll(e, 'landing-journey')}>
                {copy.secondaryCtaLabel}
              </a>
            </Button>
          </div>
          <p className="lp-reassure">
            <ShieldCheck aria-hidden="true" />
            {copy.reassurance}
          </p>
        </div>

        <Link
          to={landingPrimaryCta.to}
          className="lp-hero-image-wrap lp-hero-image-link"
          aria-label="Open the Resume Analyzer. The preview shows an example result."
        >
          <HeroCollage />
        </Link>
      </div>
    </section>
  )
}
