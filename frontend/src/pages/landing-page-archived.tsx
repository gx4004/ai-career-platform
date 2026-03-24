import { useEffect } from 'react'
import { LandingCTABase } from '#/components/landing/LandingCTABase'
import { LandingFooterBase } from '#/components/landing/LandingFooterBase'
import { LandingHero } from '#/components/landing/LandingHero'
import { LandingNavbar } from '#/components/landing/LandingNavbar'
import { LandingResumeDemoBase } from '#/components/landing/LandingResumeDemoBase'
import { LandingToolGridBase } from '#/components/landing/LandingToolGridBase'

export function LandingPageArchived() {
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
      <LandingResumeDemoBase />
      <LandingToolGridBase />
      <LandingCTABase />
      <LandingFooterBase />
    </div>
  )
}

export function LandingRoutePageArchived() {
  return <LandingPageArchived />
}
