import { useEffect } from 'react'
import { LandingCTA } from '#/components/landing/LandingCTA'
import { LandingFooter } from '#/components/landing/LandingFooter'
import { LandingHero } from '#/components/landing/LandingHero'
import { LandingNavbar } from '#/components/landing/LandingNavbar'
import { LandingResumeDemo } from '#/components/landing/LandingResumeDemo'
import { LandingToolGrid } from '#/components/landing/LandingToolGrid'

export function LandingPage() {
  useEffect(() => {
    document.body.classList.add('page-tone-landing')

    return () => {
      document.body.classList.remove('page-tone-landing')
    }
  }, [])

  return (
    <div className="landing-page premium-corner-canvas">
      <LandingNavbar />
      <LandingHero />
      <LandingResumeDemo />
      <LandingToolGrid />
      <LandingCTA />
      <LandingFooter />
    </div>
  )
}
