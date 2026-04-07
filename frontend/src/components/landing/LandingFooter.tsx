import { Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { LEGAL_CONTACT_EMAIL } from '#/components/legal/constants'

const currentYear = new Date().getFullYear()

export function LandingFooter() {
  return (
    <footer className="landing-footer" aria-labelledby="landing-footer-heading">
      <div className="landing-footer__inner">
        <div className="landing-footer__brand">
          <Link to="/" className="landing-footer__brand-link" aria-label="Career Workbench home">
            <AppBrandLockup mode="compact" />
          </Link>
          <p className="landing-footer__tagline">
            Your AI-powered job-search workspace. Thesis project, free to use.
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

          <div className="landing-footer__col">
            <h2 className="landing-footer__col-title">Contact</h2>
            <ul className="landing-footer__list">
              <li>
                <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="landing-footer__link">
                  {LEGAL_CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="landing-footer__bottom">
        <p className="landing-footer__copy">© {currentYear} Career Workbench. All rights reserved.</p>
      </div>
    </footer>
  )
}
