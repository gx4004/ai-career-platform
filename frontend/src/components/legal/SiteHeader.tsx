import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'

/** The top of a public page (sign-in, reset password, legal): the brand links home, one action sits at the end. */
export function SiteHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="site-header">
      <Link to="/" className="site-header__brand" aria-label="Career Workbench home">
        <AppBrandLockup />
      </Link>
      {actions ? <div className="site-header__actions">{actions}</div> : null}
    </header>
  )
}
