import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScrollReveal } from '#/components/ui/motion'

export function LandingCTABase() {
  return (
    <section className="landing-section landing-section-cta" id="landing-cta">
      <ScrollReveal>
        <div className="content-max landing-cta glass-elevated section-card">
          <div className="landing-cta-copy">
            <p className="eyebrow">One session</p>
            <h2 className="display-lg">From raw resume to interview-ready in one sitting.</h2>
            <p className="muted-copy">
              Every step feeds the next. No copy-pasting between tabs. No lost context.
            </p>
          </div>
          <div className="landing-cta-glow">
            <Button asChild className="button-hero-primary" size="lg">
              <Link to="/dashboard">
                Get started
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </ScrollReveal>
    </section>
  )
}

