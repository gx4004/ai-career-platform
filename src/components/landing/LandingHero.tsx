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
              Build the search one strong decision at a time.
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-lg text-[var(--text-body)]">
              Career Workbench connects resume analysis, job matching, cover letters,
              interview prep, career planning, and portfolio ideas into one focused workflow.
            </p>
          </StaggerItem>
          <StaggerItem>
            <Button asChild className="button-hero-primary" size="lg">
              <Link to="/dashboard">
                Start free — no login needed
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
