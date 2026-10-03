import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { SiteHeader } from '#/components/legal/SiteHeader'
import { LEGAL_LAST_UPDATED } from '#/components/legal/constants'
import { Button, PageHeader } from '#/components/kit'

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

const LEGAL_PAGES = [
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/cookies', label: 'Cookies' },
  { to: '/imprint', label: 'Imprint' },
] as const

export function LegalLayout({ title, lastUpdated = LEGAL_LAST_UPDATED, children }: LegalLayoutProps) {
  return (
    <div className="legal-page">
      <SiteHeader
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <ArrowLeft aria-hidden />
              Back to app
            </Link>
          </Button>
        }
      />
      <main id="main-content" tabIndex={-1} className="legal-page__main">
        <article className="legal-page__article">
          <PageHeader title={title} meta={[`Last updated ${formatLegalDate(lastUpdated)}`]} />
          <div className="legal-page__body">{children}</div>
          <nav className="legal-page__nav" aria-label="Legal pages">
            {LEGAL_PAGES.map((page) => (
              <Link key={page.to} to={page.to} className="legal-page__nav-link">
                {page.label}
              </Link>
            ))}
          </nav>
        </article>
      </main>
    </div>
  )
}
