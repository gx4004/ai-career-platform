import type { ReactNode } from 'react'
import { SiteHeader } from '#/components/legal/SiteHeader'

/** The page around a sign-in form: brand and a way out at the top, one narrow column of content on paper. */
export function AuthShell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-page">
      <SiteHeader actions={actions} />
      <main id="main-content" tabIndex={-1} className="auth-page__main">
        <div className="auth-page__column">{children}</div>
      </main>
    </div>
  )
}
