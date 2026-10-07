import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useCanGoBack, useRouter, useRouterState } from '@tanstack/react-router'
import { SiteBackAction, SiteHeader } from '#/components/legal/SiteHeader'
import { LEGAL_LAST_UPDATED } from '#/components/legal/constants'
import { Button, JumpNav, PageHeader } from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import type { JumpNavItem } from '#/components/kit'

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

/** Fewer sections than this and the page is short enough to read without a contents list. */
const MIN_SECTIONS = 3

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/^\d+\.\s*/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

/** Gives every h2 of the body an id and returns them as jump links, in reading order. */
function collectSections(root: HTMLElement): JumpNavItem[] {
  const used = new Set<string>()
  return Array.from(root.querySelectorAll('h2')).map((heading) => {
    let id = heading.id
    if (!id) {
      const base = `legal-${slugify(heading.textContent ?? '')}`
      id = base
      for (let n = 2; used.has(id) || document.getElementById(id); n++) id = `${base}-${n}`
      heading.id = id
    }
    used.add(id)
    return { id, label: (heading.textContent ?? '').trim() }
  })
}

/**
 * One reading page: the brand and a way back, the title with its date, the text in one column with a
 * sticky contents rail built from its h2 headings, and the other legal pages at the foot.
 */
export function LegalLayout({ title, lastUpdated = LEGAL_LAST_UPDATED, children }: LegalLayoutProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [sections, setSections] = useState<JumpNavItem[]>([])

  // Before paint, so the contents column is there on the first frame and the article does not shift sideways.
  useLayoutEffect(() => {
    if (bodyRef.current) setSections(collectSections(bodyRef.current))
  }, [title])

  const hasRail = sections.length >= MIN_SECTIONS
  const router = useRouter()
  // The router's own history index: true only when the previous entry is a page of this app (a half-filled
  // sign-up form, a result page), never another site. Then "Back" returns there; otherwise the app is the way out.
  const canGoBack = useCanGoBack()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  // Without that history, Back is home: the dashboard when signed in, the landing page for a guest (as on the 404).
  const { status } = useSession()
  const home = status === 'authenticated' ? '/dashboard' : '/'

  return (
    <div className="legal-page">
      <SiteHeader
        actions={canGoBack ? <SiteBackAction onClick={() => router.history.back()} /> : <SiteBackAction to={home} />}
      />
      <main id="main-content" tabIndex={-1} className="legal-page__main">
        <div className="legal-page__layout" data-rail={hasRail ? 'true' : undefined}>
          {hasRail ? <JumpNav items={sections} aria-label="On this page" className="legal-page__contents" /> : null}
          <article className="legal-page__article">
            <PageHeader title={title} meta={[`Last updated ${formatLegalDate(lastUpdated)}`]} />
            <div ref={bodyRef} className="legal-page__body">
              {children}
            </div>
            {/* The page you are on is named, not linked, so the strip also says where you are. */}
            <nav className="legal-page__nav" aria-label="Legal pages">
              {LEGAL_PAGES.map((page) =>
                page.to === pathname ? (
                  <span key={page.to} className="legal-page__current" aria-current="page">
                    {page.label}
                  </span>
                ) : (
                  <Button key={page.to} asChild variant="link">
                    <Link to={page.to}>{page.label}</Link>
                  </Button>
                ),
              )}
            </nav>
          </article>
        </div>
      </main>
    </div>
  )
}
