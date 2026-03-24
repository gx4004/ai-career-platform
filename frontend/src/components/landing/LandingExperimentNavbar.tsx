'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { cn } from '#/lib/utils'

export type NavbarItem = {
  label: string
  href?: string
  to?: string
}

type NavbarState = 'light' | 'dark'

const SCROLL_THRESHOLD = 60

export function LandingExperimentNavbar({
  items = [],
  ctaLabel = 'Get started',
  ctaTo,
  signInLabel = 'Sign in',
  signInTo = '/login',
  brand,
  className,
}: {
  items?: NavbarItem[]
  ctaLabel?: string
  ctaTo?: string
  signInLabel?: string
  signInTo?: string
  brand?: ReactNode
  className?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [navState, setNavState] = useState<NavbarState>('light')
  const prefersReducedMotion = useReducedMotion() ?? false

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY
    setNavState(scrollY > SCROLL_THRESHOLD ? 'dark' : 'light')
  }, [])

  useEffect(() => {
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const toggleMenu = () => setIsOpen((open) => !open)

  const renderItem = (item: NavbarItem, onClick?: () => void) => {
    if (item.to) {
      return (
        <Link
          to={item.to}
          className="landing-experiment-navbar-link"
          onClick={onClick}
        >
          {item.label}
        </Link>
      )
    }

    return (
      <a
        href={item.href ?? '#'}
        className="landing-experiment-navbar-link"
        onClick={onClick}
      >
        {item.label}
      </a>
    )
  }

  const renderLinkAction = (
    label: string,
    to: string | undefined,
    mobile = false,
    onClick?: () => void,
    variant: 'primary' | 'secondary' = 'primary',
  ) => {
    const className = cn(
      'landing-experiment-navbar-cta',
      variant === 'secondary' && 'landing-experiment-navbar-cta landing-experiment-navbar-cta--secondary',
      mobile && 'landing-experiment-navbar-cta--mobile',
    )

    if (to) {
      return (
        <Link to={to} className={className} onClick={onClick}>
          {label}
        </Link>
      )
    }

    return (
      <a href="#" className={className} onClick={onClick}>
        {label}
      </a>
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
          {brand ?? (
            <span className="text-lg font-bold">Brand</span>
          )}
        </div>

        <nav className="landing-experiment-navbar-nav">
          {items.map((item) => (
            <div key={item.label}>{renderItem(item)}</div>
          ))}
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
              {items.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08 + 0.1 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <a
                    href={item.to ?? item.href ?? '#'}
                    className="text-lg font-medium text-[var(--text-strong)] hover:text-[var(--accent)]"
                    onClick={toggleMenu}
                  >
                    {item.label}
                  </a>
                </motion.div>
              ))}

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} exit={{ opacity: 0, y: 20 }} className="pt-6 flex flex-col gap-3">
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
