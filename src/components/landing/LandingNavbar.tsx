import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { motion, useScroll, useTransform } from 'framer-motion'

export function LandingNavbar() {
  const { scrollY } = useScroll()
  const bgOpacity = useTransform(scrollY, [0, 200], [0, 1])

  return (
    <motion.nav
      className="landing-navbar glass-subtle"
      style={{ opacity: useTransform(bgOpacity, (v) => 0.7 + v * 0.3) }}
    >
      <div className="content-max landing-navbar-inner">
        <Link to="/">
          <AppBrandLockup mode="compact" />
        </Link>
        <div className="landing-navbar-actions">
          <Button variant="outline" asChild size="default">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="default" className="button-hero-primary">
            <Link to="/dashboard">Get started</Link>
          </Button>
        </div>
      </div>
    </motion.nav>
  )
}
