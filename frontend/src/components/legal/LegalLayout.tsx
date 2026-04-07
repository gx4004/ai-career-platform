import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'

export const LEGAL_CONTACT_EMAIL = 'privacy@careerworkbench.com'
export const LEGAL_CONTROLLER = 'Career Workbench'
export const LEGAL_LAST_UPDATED = '2026-04-07'

type LegalLayoutProps = {
  title: string
  lastUpdated?: string
  children: ReactNode
}

export function LegalLayout({ title, lastUpdated = LEGAL_LAST_UPDATED, children }: LegalLayoutProps) {
  return (
    <div className="legal-page">
      <header className="legal-page__header">
        <Link to="/" className="legal-page__brand" aria-label="Career Workbench home">
          <AppBrandLockup mode="compact" />
        </Link>
        <nav className="legal-page__nav" aria-label="Legal pages">
          <Link to="/privacy" className="legal-page__nav-link" activeProps={{ className: 'legal-page__nav-link is-active' }}>
            Privacy
          </Link>
          <Link to="/terms" className="legal-page__nav-link" activeProps={{ className: 'legal-page__nav-link is-active' }}>
            Terms
          </Link>
          <Link to="/cookies" className="legal-page__nav-link" activeProps={{ className: 'legal-page__nav-link is-active' }}>
            Cookies
          </Link>
          <Link to="/imprint" className="legal-page__nav-link" activeProps={{ className: 'legal-page__nav-link is-active' }}>
            Imprint
          </Link>
        </nav>
      </header>
      <main className="legal-page__main">
        <article className="legal-page__article">
          <h1 className="legal-page__title">{title}</h1>
          <p className="legal-page__meta">Last updated: {lastUpdated}</p>
          <div className="legal-page__body">{children}</div>
          <p className="legal-page__contact-footer">
            Questions? Contact us at{' '}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="legal-page__link">
              {LEGAL_CONTACT_EMAIL}
            </a>
            .
          </p>
        </article>
      </main>
      <footer className="legal-page__footer">
        <Link to="/" className="legal-page__footer-link">
          ← Back to Career Workbench
        </Link>
      </footer>
    </div>
  )
}
