import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '#/components/kit'
import { Menu, X, type LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils'

export type NavbarItem = {
  label: string
  href?: string
  to?: string
  icon: LucideIcon
}

type NavbarState = 'top' | 'scrolled'

const SCROLL_THRESHOLD = 60

export function LandingTubelightNavbar({
  items: allItems = [],
  sectionIds = [],
  ctaLabel = 'Get started',
  ctaTo,
  signInLabel = 'Sign in',
  signInTo = '/login',
  brand,
  className,
}: {
  items?: NavbarItem[]
  sectionIds?: string[]
  ctaLabel?: string
  ctaTo?: string
  signInLabel?: string
  signInTo?: string
  brand?: ReactNode
  className?: string
}) {
  // An item with neither `to` nor `href` would render a dead `#` link.
  const items = allItems.filter((item) => item.to || item.href)
  const [isOpen, setIsOpen] = useState(false)
  const [navState, setNavState] = useState<NavbarState>('top')
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion() ?? false
  const observerRef = useRef<IntersectionObserver | null>(null)

  const handleScroll = useCallback(() => {
    setNavState(window.scrollY > SCROLL_THRESHOLD ? 'scrolled' : 'top')
  }, [])

  useEffect(() => {
    handleScroll()
    let rafId = 0
    const onScroll = () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        handleScroll()
        rafId = 0
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafId)
    }
  }, [handleScroll])

  useEffect(() => {
    if (sectionIds.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveTab(entry.target.id)
          }
        }
      },
      {
        rootMargin: '-20% 0px -60% 0px',
        threshold: 0.15,
      },
    )

    observerRef.current = observer

    for (const id of sectionIds) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [sectionIds])

  const toggleMenu = () => setIsOpen((o) => !o)

  const handleAnchorClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    callback?: () => void,
  ) => {
    if (href.startsWith('#')) {
      e.preventDefault()
      const el = document.getElementById(href.slice(1))
      if (el) el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
    }
    callback?.()
  }

  const isItemActive = (item: NavbarItem): boolean => {
    if (!activeTab || !item.href) return false
    const hrefId = item.href.startsWith('#') ? item.href.slice(1) : item.href
    return hrefId === activeTab
  }

  const renderLinkAction = (
    label: string,
    to: string | undefined,
    mobile = false,
    onClick?: () => void,
    variant: 'primary' | 'secondary' = 'primary',
  ) => {
    return to ? (
      <Button
        asChild
        size={mobile ? 'lg' : 'sm'}
        variant={variant === 'primary' ? 'primary' : mobile ? 'secondary' : 'ghost'}
        className={mobile ? 'landing-experiment-navbar-cta--mobile' : undefined}
      >
        <Link to={to} onClick={onClick}>{label}</Link>
      </Button>
    ) : null
  }

  return (
    <header
      className={cn('landing-experiment-navbar', className)}
      data-state={navState}
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    >
      <div className="landing-experiment-navbar-inner">
        <div className="landing-experiment-navbar-brand">
          {brand ?? <span className="text-lg font-bold">Brand</span>}
        </div>

        <nav className="landing-experiment-navbar-nav">
          {items.map((item) => {
            const active = isItemActive(item)
            return (
              <div key={item.label} className="nav-indicator-wrap">
                {item.to ? (
                  <Link
                    to={item.to}
                    className={cn(
                      'landing-experiment-navbar-link',
                      active && 'landing-experiment-navbar-link--active',
                    )}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={item.href as string}
                    className={cn(
                      'landing-experiment-navbar-link',
                      active && 'landing-experiment-navbar-link--active',
                    )}
                    onClick={(e) => handleAnchorClick(e, item.href as string)}
                  >
                    {item.label}
                  </a>
                )}
              </div>
            )
          })}
        </nav>

        <div className="landing-experiment-navbar-cta-wrap">
          {renderLinkAction(signInLabel, signInTo, false, undefined, 'secondary')}
          {renderLinkAction(ctaLabel, ctaTo)}
        </div>

        <button
          type="button"
          className="landing-experiment-navbar-toggle"
          onClick={toggleMenu}
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
        >
          <Menu aria-hidden="true" />
        </button>
      </div>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="landing-experiment-navbar-mobile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
          >
            <button
              type="button"
              className="landing-experiment-navbar-close"
              onClick={toggleMenu}
              aria-label="Close menu"
            >
              <X aria-hidden="true" />
            </button>

            <div className="landing-experiment-navbar-mobile-body">
              {items.map((item) =>
                item.to ? (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="landing-experiment-navbar-mobile-link"
                    onClick={toggleMenu}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.label}
                    href={item.href as string}
                    className="landing-experiment-navbar-mobile-link"
                    onClick={(e) => handleAnchorClick(e, item.href as string, toggleMenu)}
                  >
                    {item.label}
                  </a>
                ),
              )}

              <div className="landing-experiment-navbar-mobile-actions">
                {renderLinkAction(signInLabel, signInTo, true, toggleMenu, 'secondary')}
                {renderLinkAction(ctaLabel, ctaTo, true, toggleMenu)}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
