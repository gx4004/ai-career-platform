import { AppBrandLockup } from '#/components/app/AppBrandLockup'

export function LandingFooterBase() {
  return (
    <footer className="landing-footer glass-subtle">
      <div className="content-max landing-footer-inner">
        <div className="landing-footer-brand">
          <AppBrandLockup className="landing-footer-lockup" />
          <p className="landing-footer-tagline">Your career, sharper.</p>
        </div>
      </div>
    </footer>
  )
}

