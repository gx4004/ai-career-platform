import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScrollReveal } from '#/components/ui/motion'

export function LandingCTA() {
  return (
    <section className="landing-section">
      <ScrollReveal>
        <div className="content-max landing-cta glass-elevated section-card">
          <div className="landing-cta-copy">
            <p className="eyebrow">One workspace, zero friction</p>
            <h2 className="display-lg">From resume to offer — all in one place.</h2>
            <p className="muted-copy">
              Every analysis flows into the next step automatically. No tab-switching, no copy-pasting, no lost context.
            </p>
          </div>
          <div className="landing-cta-glow">
            <Button asChild className="button-hero-primary" size="lg">
              <Link to="/dashboard">
                Open the workbench
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </ScrollReveal>
    </section>
  )
}
