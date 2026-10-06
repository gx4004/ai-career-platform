import type { ReactNode } from 'react'
import { AuthAside } from '#/components/auth/AuthAside'
import { SiteHeader } from '#/components/legal/SiteHeader'

/**
 * The page around a sign-in form: brand and a way out at the top, one column of content on the ground.
 * The aside is decoration for wide screens (hidden from assistive tech and below 1100px). The grid keeps its
 * track when the aside is off, so the form column keeps one position between sign-in, reset and signed-in.
 */
export function AuthShell({
  actions,
  aside = true,
  children,
}: {
  actions?: ReactNode
  /** The guest pitch beside the form. Off once the visitor is signed in (it would pitch an account they have); the column keeps its place. */
  aside?: boolean
  children: ReactNode
}) {
  return (
    <div className="auth-page">
      <SiteHeader actions={actions} />
      <main id="main-content" tabIndex={-1} className="auth-page__main">
        <div className="auth-page__layout">
          <div className="auth-page__column">{children}</div>
          {aside ? (
            <aside className="auth-aside" aria-hidden="true">
              <AuthAside />
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  )
}
