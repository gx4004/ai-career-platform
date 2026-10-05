import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Menu, type LucideIcon } from 'lucide-react'
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#/components/kit'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'
import { cn } from '#/lib/utils'

export type NavbarItem = {
  label: string
  href: string
  icon?: LucideIcon
}

type NavbarState = 'top' | 'scrolled'

const SCROLL_THRESHOLD = 60

/**
 * The landing bar: brand, four section links, and the account actions. It turns into a white bar with an
 * ink rule once the page has scrolled 60px. The current section (read by an IntersectionObserver) is the
 * lemon link. On phones the links move into a bottom Sheet (Radix Dialog: Esc closes, focus is trapped
 * and returned to the menu button).
 */
export function LandingNavbar({
  items = [],
  sectionIds = [],
  signedIn = false,
  ctaLabel = 'Get started',
  ctaTo,
  signInLabel = 'Sign in',
  signInTo = '/login',
  dashboardLabel = 'Open dashboard',
  brand,
  className,
}: {
  items?: NavbarItem[]
  sectionIds?: string[]
  /** A signed-in visitor gets one "Open dashboard" action instead of Sign in + Get started. */
  signedIn?: boolean
  ctaLabel?: string
  ctaTo: string
  signInLabel?: string
  signInTo?: string
  dashboardLabel?: string
  brand?: ReactNode
  className?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [navState, setNavState] = useState<NavbarState>('top')
  const [activeId, setActiveId] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const menuScrollTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(menuScrollTimer.current), [])

  useEffect(() => {
    let frame = 0
    const read = () => setNavState(window.scrollY > SCROLL_THRESHOLD ? 'scrolled' : 'top')
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        read()
        frame = 0
      })
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (sectionIds.length === 0 || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id)
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0.15 },
    )
    for (const id of sectionIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sectionIds])

  const scrollToHash = useCallback(
    (href: string) => {
      const el = document.getElementById(href.slice(1))
      if (el) el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
    },
    [reducedMotion],
  )

  const goTo = (event: React.MouseEvent<HTMLAnchorElement>, href: string, fromMenu = false) => {
    event.preventDefault()
    if (fromMenu) {
      setMenuOpen(false)
      // The modal's scroll lock is released after it unmounts; scroll once it has.
      window.clearTimeout(menuScrollTimer.current)
      menuScrollTimer.current = window.setTimeout(() => scrollToHash(href), 80)
    } else {
      scrollToHash(href)
    }
  }

  const isActive = (item: NavbarItem) => activeId !== null && item.href === `#${activeId}`

  return (
    <header className={cn('lp-nav', className)} data-state={navState}>
      <div className="lp-wrap lp-nav__inner">
        <div className="lp-nav__brand">{brand}</div>

        <nav className="lp-nav__links" aria-label="Sections">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="lp-nav__link"
              aria-current={isActive(item) ? 'location' : undefined}
              onClick={(event) => goTo(event, item.href)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="lp-nav__end">
          {signedIn ? (
            <Button asChild variant="secondary">
              <Link to="/dashboard">{dashboardLabel}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="lp-nav__signin">
                <Link to={signInTo}>{signInLabel}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={ctaTo}>{ctaLabel}</Link>
              </Button>
            </>
          )}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                iconOnly
                variant="secondary"
                className="lp-nav__menu"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" closeLabel="Close menu">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription className="kit-sr-only">Jump to a section of the page or sign in.</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <nav className="lp-menu" aria-label="Sections">
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <Button asChild key={item.label} variant="secondary" size="lg" className="lp-menu__link">
                        <a href={item.href} onClick={(event) => goTo(event, item.href, true)}>
                          {Icon ? <Icon aria-hidden="true" /> : null}
                          {item.label}
                        </a>
                      </Button>
                    )
                  })}
                  {signedIn ? null : (
                    <Button asChild variant="ghost" size="lg" className="lp-menu__link">
                      <Link to={signInTo} onClick={() => setMenuOpen(false)}>
                        {signInLabel}
                      </Link>
                    </Button>
                  )}
                </nav>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
