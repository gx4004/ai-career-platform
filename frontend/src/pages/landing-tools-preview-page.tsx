import { Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { LandingToolGrid } from '#/components/landing/LandingToolGrid'
import { useLandingPageSetup } from '#/components/landing/useLandingPageSetup'
import { landingPrimaryCta } from '#/components/landing/landingContent'

export function LandingToolsPreviewPage() {
  useLandingPageSetup()

  return (
    <div className="landing-page premium-corner-canvas">
      <header className="px-4 pt-5 md:px-6 md:pt-8">
        <div className="content-max">
          <div className="flex items-center justify-between gap-3 rounded-full border border-white/70 bg-white/88 px-4 py-3 shadow-[0_20px_50px_rgba(16,42,67,0.12)] backdrop-blur md:px-6">
            <Link to="/" aria-label="Back to landing">
              <AppBrandLockup mode="compact" />
            </Link>
            <Link
              to={landingPrimaryCta.to}
              className="inline-flex items-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(39,116,219,0.24)] transition hover:brightness-105"
            >
              {landingPrimaryCta.label}
            </Link>
          </div>
        </div>
      </header>

      <main className="pb-16 pt-4 md:pb-24 md:pt-8">
        <LandingToolGrid />
      </main>
    </div>
  )
}

