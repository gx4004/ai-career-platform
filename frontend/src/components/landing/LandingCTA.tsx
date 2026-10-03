import { ArrowRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/kit'
import { landingCtaCopy, landingPrimaryCta } from '#/components/landing/landingContent'

export function LandingCTA() {
  return (
    <section className="lp-section" id="landing-cta">
      <div className="lp-container">
        <div className="lp-cta-card">
          <h2 className="lp-cta-h2">{landingCtaCopy.title}</h2>
          <div className="lp-cta-action">
            <Button asChild size="lg">
              <Link to={landingPrimaryCta.to}>
                {landingCtaCopy.ctaLabel}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <p className="lp-cta-micro">No sign-up required. Your data stays yours.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
