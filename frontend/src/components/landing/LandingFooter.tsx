import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'framer-motion'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'

const currentYear = new Date().getFullYear()

export function LandingFooter() {
  const prefersReducedMotion = useReducedMotion() ?? false
  return (
    <motion.footer
      id="landing-footer"
      className="lp-footer"
      aria-labelledby="landing-footer-heading"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="lp-footer-grid">
        <div className="lp-footer-brand-col">
          <Link to="/" aria-label="Career Workbench home" className="lp-footer-brand-link">
            <AppBrandLockup mode="full" />
          </Link>
          <p className="lp-footer-blurb">
            The AI workspace for job seekers who want to move smarter, not harder. Precision career
            architecture for the digital age.
          </p>
          <p className="lp-footer-meta">Crafted for focused applicants. Built in Europe.</p>
        </div>

        <nav className="lp-footer-nav" aria-label="Footer">
          <div>
            <h2 id="landing-footer-heading" className="lp-footer-h5">Product</h2>
            <ul className="lp-footer-list">
              <li><Link to="/dashboard">Dashboard</Link></li>
              <li><a href="#landing-journey">Workflow</a></li>
              <li><a href="#landing-tools">Tools</a></li>
              <li><a href="#landing-faq">FAQ</a></li>
              <li><Link to="/login">Sign in</Link></li>
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

      <div className="lp-footer-bottom">
        <p className="lp-footer-copy">© {currentYear} Career Workbench. All rights reserved.</p>
        <p className="lp-footer-status">
          <span className="lp-footer-status-dot" aria-hidden="true" />
          All systems operational
        </p>
      </div>
    </motion.footer>
  )
}
