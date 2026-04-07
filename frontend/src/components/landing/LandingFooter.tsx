import { Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'

const currentYear = new Date().getFullYear()

export function LandingFooter() {
  return (
    <footer className="landing-footer" aria-labelledby="landing-footer-heading">
      <div className="landing-footer__inner">
        <div className="landing-footer__brand">
          <Link to="/" className="landing-footer__brand-link" aria-label="Career Workbench home">
            <AppBrandLockup mode="full" className="landing-footer__lockup" />
          </Link>
          <p className="landing-footer__tagline">
            The AI workspace for job seekers who want to move smarter, not harder.
          </p>
          <p className="landing-footer__meta">
            Crafted for focused applicants. Built in Europe.
          </p>
        </div>

        <nav className="landing-footer__cols" aria-label="Footer">
          <div className="landing-footer__col">
            <h2 id="landing-footer-heading" className="landing-footer__col-title">
              Product
            </h2>
            <ul className="landing-footer__list">
              <li>
                <Link to="/dashboard" className="landing-footer__link">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/login" className="landing-footer__link">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>

          <div className="landing-footer__col">
            <h2 className="landing-footer__col-title">Legal</h2>
            <ul className="landing-footer__list">
              <li>
                <Link to="/privacy" className="landing-footer__link">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="landing-footer__link">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/cookies" className="landing-footer__link">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link to="/imprint" className="landing-footer__link">
                  Imprint
                </Link>
              </li>
            </ul>
          </div>

        </nav>
      </div>

      <div className="landing-footer__bottom">
        <p className="landing-footer__copy">© {currentYear} Career Workbench. All rights reserved.</p>
        <p className="landing-footer__bottom-meta">
          <span className="landing-footer__status-dot" aria-hidden="true" />
          All systems operational
        </p>
      </div>
    </footer>
  )
}
