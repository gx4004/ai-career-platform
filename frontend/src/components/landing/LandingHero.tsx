import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import { HeroMockup } from '#/components/landing/HeroMockup'

export function LandingHero() {
  return (
    <section className="landing-hero landing-section">
      <div className="content-max landing-hero-grid">
        <StaggerChildren className="landing-hero-copy" stagger={0.08}>
          <StaggerItem>
            <h1 className="display-xl text-gradient-aurora text-balance">
              Your resume has blind spots. We find them before recruiters do.
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-lg text-[var(--text-body)]">
              Upload your resume and get an instant score, targeted fixes, role matching,
              a cover letter draft, interview prep, and career planning — one session, fully connected.
            </p>
          </StaggerItem>
          <StaggerItem>
            <Button asChild className="button-hero-primary" size="lg">
              <Link to="/dashboard">
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
