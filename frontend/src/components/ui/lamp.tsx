'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '#/lib/utils'

export function LampDemo() {
  return (
    <LampContainer>
      <motion.h1
        initial={{ opacity: 0.5, y: 100 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.3,
          duration: 0.8,
          ease: 'easeInOut',
        }}
        className="mt-8 bg-gradient-to-br from-[var(--text-strong)] via-[var(--accent)] to-[var(--text-soft)] bg-clip-text py-4 text-center text-4xl font-medium tracking-tight text-transparent md:text-7xl"
      >
        Build lamps <br /> the right way
      </motion.h1>
    </LampContainer>
  )
}

export function LampContainer({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <div
      className={cn(
        'relative z-0 flex min-h-screen w-full items-center justify-center overflow-hidden rounded-[calc(var(--radius-2xl)+0.1rem)] border border-[color-mix(in_srgb,var(--edge-surface-border)_82%,white_18%)] bg-[radial-gradient(circle_at_top,rgba(74,147,239,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,249,254,0.98))]',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="relative isolate z-0 flex h-full w-full scale-y-125 items-center justify-center">
          <motion.div
            initial={{ opacity: 0.5, width: '15rem' }}
            whileInView={{ opacity: 1, width: '30rem' }}
            transition={{
              delay: 0.3,
              duration: 0.8,
              ease: 'easeInOut',
            }}
            style={{
              backgroundImage:
                'conic-gradient(from 70deg at center top, rgba(74,158,237,0.82), rgba(74,158,237,0.14), transparent)',
            }}
            className="absolute inset-auto right-1/2 h-56 w-[30rem] overflow-visible opacity-80"
          >
            <div className="absolute bottom-0 left-0 z-20 h-40 w-full bg-[rgba(248,251,255,0.98)] [mask-image:linear-gradient(to_top,white,transparent)]" />
            <div className="absolute bottom-0 left-0 z-20 h-full w-40 bg-[rgba(248,251,255,0.98)] [mask-image:linear-gradient(to_right,white,transparent)]" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0.5, width: '15rem' }}
            whileInView={{ opacity: 1, width: '30rem' }}
            transition={{
              delay: 0.3,
              duration: 0.8,
              ease: 'easeInOut',
            }}
            style={{
              backgroundImage:
                'conic-gradient(from 290deg at center top, transparent, rgba(74,158,237,0.14), rgba(74,158,237,0.82))',
            }}
            className="absolute inset-auto left-1/2 h-56 w-[30rem] opacity-80"
          >
            <div className="absolute right-0 bottom-0 z-20 h-full w-40 bg-[rgba(248,251,255,0.98)] [mask-image:linear-gradient(to_left,white,transparent)]" />
            <div className="absolute right-0 bottom-0 z-20 h-40 w-full bg-[rgba(248,251,255,0.98)] [mask-image:linear-gradient(to_top,white,transparent)]" />
          </motion.div>
          <div className="absolute top-1/2 h-48 w-full translate-y-12 scale-x-150 bg-[rgba(243,248,253,0.96)] blur-2xl" />
          <div className="absolute top-1/2 z-50 h-48 w-full bg-transparent opacity-20 backdrop-blur-md" />
          <div className="absolute inset-auto z-50 h-36 w-[28rem] -translate-y-1/2 rounded-full bg-[rgba(74,158,237,0.38)] blur-3xl" />
          <motion.div
            initial={{ width: '8rem' }}
            whileInView={{ width: '16rem' }}
            transition={{
              delay: 0.3,
              duration: 0.8,
              ease: 'easeInOut',
            }}
            className="absolute inset-auto z-30 h-36 w-64 -translate-y-[6rem] rounded-full bg-[rgba(116,188,255,0.48)] blur-2xl"
          />
          <motion.div
            initial={{ width: '15rem' }}
            whileInView={{ width: '30rem' }}
            transition={{
              delay: 0.3,
              duration: 0.8,
              ease: 'easeInOut',
            }}
            className="absolute inset-auto z-50 h-0.5 w-[30rem] -translate-y-[7rem] bg-[rgba(74,158,237,0.72)]"
          />

          <div className="absolute inset-auto z-40 h-44 w-full -translate-y-[12.5rem] bg-[rgba(248,251,255,0.98)]" />
        </div>
      </div>

      <div
        className={cn(
          'relative z-50 flex w-full flex-col items-center justify-center px-5 py-16 text-center sm:px-6 sm:py-20 md:py-24',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
