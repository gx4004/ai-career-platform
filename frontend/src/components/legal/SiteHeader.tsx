import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { Button } from '#/components/kit'

/**
 * The one way out of a shell-less page (sign-in, reset password, legal): a ghost sm "Back" with an arrow, the same
 * label on every page so the full wordmark always fits beside it. `to` links somewhere fixed; `onClick` goes back in
 * history (the page the visitor came from).
 */
export function SiteBackAction(props: { to: '/login' | '/dashboard' | '/'; onClick?: never } | { onClick: () => void; to?: never }) {
  if (props.to) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to={props.to}>
          <ArrowLeft aria-hidden />
          Back
        </Link>
      </Button>
    )
  }
  return (
    <Button type="button" variant="ghost" size="sm" onClick={props.onClick}>
      <ArrowLeft aria-hidden />
      Back
    </Button>
  )
}

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
