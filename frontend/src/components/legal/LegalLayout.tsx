import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { LEGAL_LAST_UPDATED } from '#/components/legal/constants'

type LegalLayoutProps = {
  title: string
  lastUpdated?: string
  children: ReactNode
}

function formatLegalDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)
}

export function LegalLayout({ title, lastUpdated = LEGAL_LAST_UPDATED, children }: LegalLayoutProps) {
  return (
    <div className="legal-page">
      <header className="legal-page__header">
        <Link to="/" className="legal-page__brand" aria-label="Career Workbench home">
          <AppBrandLockup />
        </Link>
        <nav className="legal-page__nav" aria-label="Legal pages">
          <Link to="/privacy" className="legal-page__nav-link" activeProps={{ className: 'is-active' }}>
            Privacy
          </Link>
          <Link to="/terms" className="legal-page__nav-link" activeProps={{ className: 'is-active' }}>
            Terms
          </Link>
          <Link to="/cookies" className="legal-page__nav-link" activeProps={{ className: 'is-active' }}>
            Cookies
          </Link>
          <Link to="/imprint" className="legal-page__nav-link" activeProps={{ className: 'is-active' }}>
            Imprint
          </Link>
        </nav>
      </header>
      <main className="legal-page__main">
        <article className="legal-page__article">
          <h1 className="legal-page__title">{title}</h1>
          <p className="legal-page__meta">Last updated {formatLegalDate(lastUpdated)}</p>
          <div className="legal-page__body">{children}</div>
        </article>
      </main>
    </div>
  )
}
