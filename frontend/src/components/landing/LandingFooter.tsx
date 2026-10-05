import { Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'

const currentYear = new Date().getFullYear()

/** A signed-in visitor already has an account, so the Product column drops "Sign in". */
export function LandingFooter({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <footer id="landing-footer" className="lp-footer" aria-labelledby="landing-footer-heading">
      <div className="lp-wrap lp-footer-grid">
        <div>
          <Link to="/" aria-label="Career Workbench home" className="lp-footer-brand-link">
            <AppBrandLockup mode="full" />
          </Link>
          <p className="lp-footer-blurb">
            The AI workspace for job seekers who want to move smarter, not harder.
          </p>
        </div>

        <nav className="lp-footer-nav" aria-label="Footer">
          <div>
            <h2 id="landing-footer-heading" className="lp-footer-h5">Product</h2>
            <ul className="lp-footer-list">
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><a href="#landing-journey">Workflow</a></li>
              <li><a href="#landing-tools">Tools</a></li>
              <li><a href="#landing-faq">FAQ</a></li>
              {signedIn ? null : <li><Link to="/login">Sign in</Link></li>}
            </ul>
          </div>

          <div>
            <h2 className="lp-footer-h5">Legal</h2>
            <ul className="lp-footer-list">
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><Link to="/cookies">Cookie Policy</Link></li>
              <li><Link to="/imprint">Imprint</Link></li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="lp-wrap lp-footer-bottom">
        <p className="lp-footer-copy">&copy; {currentYear} Career Workbench. All rights reserved.</p>
      </div>
    </footer>
  )
}
