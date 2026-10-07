import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, House, LogIn, Menu, type LucideIcon } from 'lucide-react'
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
/** A section becomes the current one once its top passes this share of the viewport height, i.e. once it
 *  holds about half the screen (its heading and first content are in view). */
const READING_LINE = 0.55

/**
 * The landing bar: brand, four section links, and the account actions. It turns into a white bar with an
 * ink rule once the page has scrolled 60px. The current section (read from section positions on scroll) is
 * the lemon link. On phones the links move into a bottom Sheet (Radix Dialog: Esc closes, focus is trapped
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

  // The current section is read from positions on scroll (one read per frame), the rule the kit JumpNav uses:
  // the last listed section whose top has passed the reading line. A band that is not listed (Built for, the
  // closer) belongs to the section above it, and a jump back up or past several sections lands on the right one.
  useEffect(() => {
    if (sectionIds.length === 0 || typeof window === 'undefined') return
    let frame = 0
    let pending = false
    const read = () => {
      pending = false
      const line = window.innerHeight * READING_LINE
      let next: string | null = null
      for (const id of sectionIds) {
        const rect = document.getElementById(id)?.getBoundingClientRect()
        if (!rect || rect.height === 0) continue
        if (next === null || rect.top <= line) next = id
      }
      setActiveId(next)
    }
    const schedule = () => {
      if (pending) return
      pending = true
      frame = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (pending) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
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
            <Button asChild variant="secondary" className="lp-nav__cta">
              <Link to="/dashboard">{dashboardLabel}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="lp-nav__signin">
                <Link to={signInTo}>{signInLabel}</Link>
              </Button>
              <Button asChild variant="secondary" className="lp-nav__cta">
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
                <SheetDescription className="kit-sr-only">Jump to a section of the page, sign in or get started.</SheetDescription>
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
                  {/* On phones the bar has room only for the brand and this menu, so the bar's actions live here too:
                      the same lg secondary button with an icon as the section links, so every label starts at one x. */}
                  {signedIn ? (
                    <Button asChild variant="secondary" size="lg" className="lp-menu__link">
                      <Link to="/dashboard" onClick={() => setMenuOpen(false)}>
                        <House aria-hidden="true" />
                        {dashboardLabel}
                      </Link>
                    </Button>
                  ) : (
                    <>
                      <Button asChild variant="secondary" size="lg" className="lp-menu__link">
                        <Link to={signInTo} onClick={() => setMenuOpen(false)}>
                          <LogIn aria-hidden="true" />
                          {signInLabel}
                        </Link>
                      </Button>
                      <Button asChild variant="secondary" size="lg" className="lp-menu__link">
                        <Link to={ctaTo} onClick={() => setMenuOpen(false)}>
                          <ArrowRight aria-hidden="true" />
                          {ctaLabel}
                        </Link>
                      </Button>
                    </>
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
