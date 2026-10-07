import { Link } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
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
import { LandingNavbar, type NavbarItem } from '#/components/landing/LandingNavbar'
import { LandingFaqsSection } from '#/components/landing/LandingFaqsSection'
import { LandingSocialProof } from '#/components/landing/LandingSocialProof'
import { LandingFeatureStepsDemo } from '#/components/landing/LandingFeatureStepsDemo'
import { LandingFooter } from '#/components/landing/LandingFooter'
import { LandingToolGridBase } from '#/components/landing/LandingToolGridBase'
import { useLandingPageSetup } from '#/components/landing/useLandingPageSetup'
import { useSession } from '#/hooks/useSession'

const experimentItems: NavbarItem[] = [...landingExperimentNavbarItems]

const SECTION_IDS = ['landing-hero', 'landing-journey', 'landing-tools', 'landing-faq']

export function LandingExperimentPage() {
  useLandingPageSetup()
  const session = useSession()

  const sections: Record<LandingSectionId, ReactNode> = {
    hero: <LandingExperimentHero />,
    'social-proof': <LandingSocialProof />,
    'resume-demo': null,
    'context-scroll': null,
    workflow: <LandingFeatureStepsDemo />,
    tools: <LandingToolGridBase copy={landingExperimentToolsCopy} />,
    faq: <LandingFaqsSection />,
    cta: <LandingCTA />,
    footer: <LandingFooter signedIn={session.status === 'authenticated'} />,
  }

  return (
    <div className="landing-page" id="landing-experiment">
      <LandingNavbar
        items={experimentItems}
        sectionIds={SECTION_IDS}
        signedIn={session.status === 'authenticated'}
        ctaLabel="Get started"
        ctaTo={landingPrimaryCta.to}
        signInLabel="Sign in"
        signInTo="/login"
        brand={
          <Link to="/" className="lp-nav__brand-link" aria-label="Career Workbench home">
            <AppBrandLockup mode="full" />
          </Link>
        }
      />

      <main id="main-content" tabIndex={-1}>
        {landingExperimentSectionOrder.map((sectionId) => (
          <Fragment key={sectionId}>{sections[sectionId]}</Fragment>
        ))}
      </main>
    </div>
  )
}
