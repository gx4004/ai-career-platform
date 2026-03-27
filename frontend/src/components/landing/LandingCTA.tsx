import { ArrowRight, Check } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScrollReveal } from '#/components/ui/motion'
import { landingCtaCopy, landingPrimaryCta } from '#/components/landing/landingContent'

export function LandingCTA() {
  return (
    <section className="landing-section landing-section-cta" id="landing-cta">
      <ScrollReveal>
        <div className="content-max landing-cta glass-elevated section-card">
          <div className="landing-cta-copy">
            <p className="eyebrow">{landingCtaCopy.eyebrow}</p>
            <h2 className="display-lg">{landingCtaCopy.title}</h2>

            <ul className="landing-cta-bullets">
              {landingCtaCopy.valueBullets.map((bullet) => (
                <li key={bullet} className="landing-cta-bullet">
                  <Check size={14} className="landing-cta-bullet-icon" />
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <div className="landing-cta-glow">
            <Button asChild className="button-hero-primary" size="lg">
              <a href={landingPrimaryCta.to}>
                {landingCtaCopy.ctaLabel}
                <ArrowRight size={16} />
              </a>
            </Button>
            <p className="landing-cta-trust-line">{landingCtaCopy.trustLine}</p>
          </div>
        </div>
      </ScrollReveal>
    </section>
  )
}
