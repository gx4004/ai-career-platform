'use client'

import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { cn } from '#/lib/utils'

export type Navbar1Item = {
  label: string
  href?: string
  to?: string
}

export function Navbar1({
  items = [
    { label: 'Home', href: '#' },
    { label: 'Pricing', href: '#' },
    { label: 'Docs', href: '#' },
    { label: 'Projects', href: '#' },
  ],
  ctaLabel = 'Get started',
  ctaHref = '#',
  ctaTo,
  brand,
  animated = true,
  className,
  innerClassName,
}: {
  items?: Navbar1Item[]
  ctaLabel?: string
  ctaHref?: string
  ctaTo?: string
  brand?: ReactNode
  animated?: boolean
  className?: string
  innerClassName?: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  const toggleMenu = () => setIsOpen((open) => !open)

  const renderItem = (item: Navbar1Item, onClick?: () => void) => {
    const sharedClassName =
      'text-sm font-medium text-[var(--text-strong)] transition-colors hover:text-[var(--accent)]'

    if (item.to) {
      return (
        <Link to={item.to} className={sharedClassName} onClick={onClick}>
          {item.label}
        </Link>
      )
    }

    return (
      <a href={item.href ?? '#'} className={sharedClassName} onClick={onClick}>
        {item.label}
      </a>
    )
  }

  const renderCta = (className: string, onClick?: () => void) => {
    if (ctaTo) {
      return (
        <Link to={ctaTo} className={className} onClick={onClick}>
          {ctaLabel}
        </Link>
      )
    }

    return (
      <a href={ctaHref} className={className} onClick={onClick}>
        {ctaLabel}
      </a>
    )
  }

  return (
    <div className={cn('flex w-full justify-center px-4 py-6', className)}>
      <div
        className={cn(
          'relative z-10 flex w-full max-w-3xl items-center justify-between rounded-full border border-[color-mix(in_srgb,var(--edge-surface-border)_82%,white_18%)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,249,254,0.94))] px-6 py-3 text-[var(--text-strong)] shadow-[0_18px_44px_rgba(19,44,72,0.1)] backdrop-blur',
          innerClassName,
        )}
      >
        <div className="flex items-center">
          <motion.div
            className={cn('mr-6 flex items-center', brand ? '' : 'h-8 w-8')}
            initial={animated ? { scale: 0.8 } : false}
            animate={{ scale: 1 }}
            whileHover={{ rotate: brand ? 0 : 10 }}
            transition={{ duration: 0.3 }}
          >
            {brand ? (
              brand
            ) : (
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="16" cy="16" r="16" fill="url(#navbar1-gradient)" />
                <defs>
                  <linearGradient
                    id="navbar1-gradient"
                    x1="0"
                    y1="0"
                    x2="32"
                    y2="32"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#FF9966" />
                    <stop offset="1" stopColor="#FF5E62" />
                  </linearGradient>
                </defs>
              </svg>
            )}
          </motion.div>
        </div>

        <nav className="hidden items-center space-x-8 md:flex">
          {items.map((item) => (
            <motion.div
              key={item.label}
              initial={animated ? { opacity: 0, y: -10 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              whileHover={{ scale: 1.05 }}
            >
              {renderItem(item)}
            </motion.div>
          ))}
        </nav>

        <motion.div
          className="hidden md:block"
          initial={animated ? { opacity: 0, x: 20 } : false}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ scale: 1.05 }}
        >
          {renderCta(
            'inline-flex items-center justify-center rounded-full border border-[rgba(74,158,237,0.28)] bg-[linear-gradient(135deg,#0a66c2_0%,#1d7ee0_100%)] px-5 py-2 text-sm font-semibold text-white shadow-[0_0_22px_rgba(74,158,237,0.14),inset_0_1px_0_rgba(255,255,255,0.12)] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_0_28px_rgba(74,158,237,0.22),inset_0_1px_0_rgba(255,255,255,0.14)]',
          )}
        </motion.div>

        <motion.button
          type="button"
          className="flex items-center md:hidden"
          onClick={toggleMenu}
          whileTap={{ scale: 0.9 }}
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
        >
          <Menu className="h-6 w-6 text-[var(--text-strong)]" />
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="fixed inset-0 z-50 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,249,255,0.98))] px-6 pt-24 backdrop-blur md:hidden"
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <motion.button
              type="button"
              className="absolute top-6 right-6 p-2"
              onClick={toggleMenu}
              whileTap={{ scale: 0.9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              aria-label="Close menu"
            >
              <X className="h-6 w-6 text-[var(--text-strong)]" />
            </motion.button>
            <div className="flex flex-col space-y-6">
              {items.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 + 0.1 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  {renderItem(item, toggleMenu)}
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                exit={{ opacity: 0, y: 20 }}
                className="pt-6"
              >
                {renderCta(
                  'inline-flex w-full items-center justify-center rounded-full border border-[rgba(74,158,237,0.28)] bg-[linear-gradient(135deg,#0a66c2_0%,#1d7ee0_100%)] px-5 py-3 text-base font-semibold text-white shadow-[0_0_24px_rgba(74,158,237,0.16)] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_0_30px_rgba(74,158,237,0.22)]',
                  toggleMenu,
                )}
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
