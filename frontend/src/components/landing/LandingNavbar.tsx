import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { useSession } from '#/hooks/useSession'

export function LandingNavbar() {
  const { openAuthDialog } = useSession()

  return (
    <nav className="landing-navbar glass-subtle">
      <div className="content-max landing-navbar-inner">
        <Link to="/">
          <AppBrandLockup mode="compact" />
        </Link>
        <div className="landing-navbar-actions">
          <Button
            variant="outline"
            size="default"
            onClick={() =>
              openAuthDialog({
                to: '/dashboard',
                reason: 'landing-signin',
                label: 'Sign in',
              })
            }
          >
            Sign in
          </Button>
          <Button asChild size="default" className="button-hero-primary">
            <Link to="/dashboard">Get started</Link>
          </Button>
        </div>
      </div>
    </nav>
  )
}
