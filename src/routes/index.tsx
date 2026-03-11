import { createFileRoute } from '@tanstack/react-router'
import { LandingNavbar } from '#/components/landing/LandingNavbar'
import { LandingHero } from '#/components/landing/LandingHero'
import { LandingResumeDemo } from '#/components/landing/LandingResumeDemo'
import { LandingToolGrid } from '#/components/landing/LandingToolGrid'
import { LandingCTA } from '#/components/landing/LandingCTA'
import { LandingFooter } from '#/components/landing/LandingFooter'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="landing-page">
      <LandingNavbar />
      <LandingHero />
      <LandingResumeDemo />
      <LandingToolGrid />
      <LandingCTA />
      <LandingFooter />
    </div>
  )
}
