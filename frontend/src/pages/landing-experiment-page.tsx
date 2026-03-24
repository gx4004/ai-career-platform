import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { LandingCTA } from '#/components/landing/LandingCTA'
import {
  landingExperimentNavbarItems,
  landingExperimentSectionOrder,
  landingExperimentToolsCopy,
  landingPrimaryCta,
  type LandingSectionId,
} from '#/components/landing/landingContent'
import { LandingExperimentHero } from '#/components/landing/LandingExperimentHero'
import { LandingTubelightNavbar, type NavbarItem } from '#/components/landing/LandingTubelightNavbar'
import { LandingFaqsSection } from '#/components/landing/LandingFaqsSection'
import { LandingFeatureStepsDemo } from '#/components/landing/LandingFeatureStepsDemo'
import { LandingFooter } from '#/components/landing/LandingFooter'
import { LandingResumeDemo } from '#/components/landing/LandingResumeDemo'
import { LandingToolGridBase } from '#/components/landing/LandingToolGridBase'
import { useLandingPageSetup } from '#/components/landing/useLandingPageSetup'

const experimentItems: NavbarItem[] = [...landingExperimentNavbarItems]

const SECTION_IDS = [
  'landing-hero',
  'landing-journey',
  'landing-tools',
  'landing-demo',
  'landing-faq',
]

export function LandingExperimentPage() {
  useLandingPageSetup()

  const sections: Record<LandingSectionId, ReactNode> = {
    hero: <LandingExperimentHero />,
    'resume-demo': <LandingResumeDemo />,
    'context-scroll': null,
    workflow: <LandingFeatureStepsDemo />,
    tools: <LandingToolGridBase copy={landingExperimentToolsCopy} autoRotate={false} />,
    faq: <LandingFaqsSection />,
    cta: <LandingCTA />,
    footer: <LandingFooter />,
  }

  return (
    <div className="landing-page landing-page-experiment premium-corner-canvas" id="landing-experiment">
      <LandingTubelightNavbar
        items={experimentItems}
        sectionIds={SECTION_IDS}
        ctaLabel="Get started"
        ctaTo={landingPrimaryCta.to}
        signInLabel="Sign in"
        signInTo="/login"
        brand={
          <Link to="/" className="inline-flex items-center">
            <AppBrandLockup mode="compact" />
          </Link>
        }
      />

      <main>
        {landingExperimentSectionOrder.map((sectionId) => (
          <div
            key={sectionId}
            className={`landing-experiment-section-slot landing-experiment-section-slot--${sectionId}`}
          >
            {sections[sectionId]}
          </div>
        ))}
      </main>
    </div>
  )
}
