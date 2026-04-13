import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Menu, X, type LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils'

export type NavbarItem = {
  label: string
  href?: string
  to?: string
  icon: LucideIcon
}

type NavbarState = 'light' | 'dark'

const SCROLL_THRESHOLD = 60

export function LandingTubelightNavbar({
  items = [],
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
  const [isOpen, setIsOpen] = useState(false)
  const [navState, setNavState] = useState<NavbarState>('light')
  const [activeTab, setActiveTab] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion() ?? false
  const observerRef = useRef<IntersectionObserver | null>(null)

  const handleScroll = useCallback(() => {
    setNavState(window.scrollY > SCROLL_THRESHOLD ? 'dark' : 'light')
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
    const cls = cn(
      'landing-experiment-navbar-cta',
      variant === 'secondary' && 'landing-experiment-navbar-cta--secondary',
      mobile && 'landing-experiment-navbar-cta--mobile',
    )

    return to ? (
      <Link to={to} className={cls} onClick={onClick}>{label}</Link>
    ) : (
      <a href="#" className={cls} onClick={onClick}>{label}</a>
    )
  }

  return (
    <header
      className={cn('landing-experiment-navbar', className)}
      data-state={navState}
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    >
      <div className="landing-experiment-navbar-inner" data-state={navState}>
        <div className="landing-experiment-navbar-brand">
          {brand ?? <span className="text-lg font-bold">Brand</span>}
        </div>

        <nav className="landing-experiment-navbar-nav">
          {items.map((item) => {
            const active = isItemActive(item)
            return (
              <div key={item.label} className="nav-indicator-wrap">
                {active && (
                  <motion.div
                    layoutId="nav-active-pill"
                    className="nav-active-indicator"
                    initial={false}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 400, damping: 32 }
                    }
                  />
                )}
                {item.to ? (
                  <Link
                    to={item.to}
                    className={cn(
                      'relative z-10 landing-experiment-navbar-link',
                      active && 'landing-experiment-navbar-link--active',
                    )}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    href={item.href ?? '#'}
                    className={cn(
                      'relative z-10 landing-experiment-navbar-link',
                      active && 'landing-experiment-navbar-link--active',
                    )}
                    onClick={(e) => handleAnchorClick(e, item.href ?? '#')}
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
          <Menu className="h-6 w-6" />
        </button>
      </div>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="landing-experiment-navbar-mobile"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 320,
              duration: prefersReducedMotion ? 0 : undefined,
            }}
          >
            <button
              type="button"
              className="absolute right-6 top-6 p-2 text-[var(--text-strong)]"
              onClick={toggleMenu}
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="flex flex-col space-y-6 pt-16 px-6">
              {items.map((item, index) => {
                const Icon = item.icon
                return (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.06 + 0.08 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    {item.to ? (
                      <Link
                        to={item.to}
                        className="flex items-center gap-3 text-lg font-medium text-[var(--text-strong)] hover:text-[var(--accent)]"
                        onClick={toggleMenu}
                      >
                        <Icon className="h-5 w-5 text-[var(--text-muted)]" />
                        {item.label}
                      </Link>
                    ) : (
                      <a
                        href={item.href ?? '#'}
                        className="flex items-center gap-3 text-lg font-medium text-[var(--text-strong)] hover:text-[var(--accent)]"
                        onClick={(e) => handleAnchorClick(e, item.href ?? '#', toggleMenu)}
                      >
                        <Icon className="h-5 w-5 text-[var(--text-muted)]" />
                        {item.label}
                      </a>
                    )}
                  </motion.div>
                )
              })}

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                exit={{ opacity: 0, y: 16 }}
                className="pt-6 flex flex-col gap-3"
              >
                {renderLinkAction(signInLabel, signInTo, true, toggleMenu, 'secondary')}
                {renderLinkAction(ctaLabel, ctaTo, true, toggleMenu)}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
