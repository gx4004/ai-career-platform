import { ArrowRight, Check } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScrollReveal } from '#/components/ui/motion'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { landingCtaCopy, landingPrimaryCta } from '#/components/landing/landingContent'

export function LandingCTA() {
  return (
    <section className="landing-cta-dark" id="landing-cta">
      {/* Fade-in: light → dark (reverse of hero's dark → light) */}
      <div className="landing-cta-fade" aria-hidden="true" />

      {/* Background: exact mirror of hero */}
      <div className="landing-cta-bg" aria-hidden="true">
        <div className="landing-cta-beam" />
        <div className="landing-cta-beam-wash" />
      </div>

      <ScrollReveal>
        <div className="content-max landing-cta-dark-content">
          <h2 className="landing-cta-dark-title">{landingCtaCopy.title}</h2>

          <ul className="landing-cta-dark-bullets">
            {landingCtaCopy.valueBullets.map((bullet) => (
              <li key={bullet} className="landing-cta-dark-bullet">
                <Check size={14} className="landing-cta-dark-check" />
                {bullet}
              </li>
            ))}
          </ul>

          <Button asChild className="landing-cta-dark-btn" size="lg">
            <a href={landingPrimaryCta.to}>
              {landingCtaCopy.ctaLabel}
              <ArrowRight size={16} />
            </a>
          </Button>
          <p className="landing-cta-dark-trust">{landingCtaCopy.trustLine}</p>
        </div>
      </ScrollReveal>

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
    </section>
  )
}
