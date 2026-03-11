import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ScrollReveal } from '#/components/ui/motion'

export function LandingCTA() {
  return (
    <section className="landing-section">
      <ScrollReveal>
        <div className="content-max landing-cta glass-elevated section-card">
          <div className="grid gap-2" style={{ maxWidth: '32rem', margin: '0 auto' }}>
            <p className="eyebrow">Stop switching between tools</p>
            <h2 className="display-lg">Resume to offer — one workspace.</h2>
            <p className="muted-copy">
              Every analysis feeds the next step. No copy-pasting, no lost context.
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
