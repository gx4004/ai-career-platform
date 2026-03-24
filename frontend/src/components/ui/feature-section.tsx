'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '#/lib/utils'

export interface Feature {
  step: string
  title?: string
  content: string
  image: string
}

export interface FeatureStepsProps {
  features: Feature[]
  className?: string
  title?: string
  autoPlayInterval?: number
  imageHeight?: string
  autoPlay?: boolean
}

export function FeatureSteps({
  features,
  className,
  title = 'How to get started',
  autoPlayInterval = 3000,
  imageHeight = 'min-h-[18rem] md:min-h-[24rem] lg:min-h-[28rem]',
  autoPlay = true,
}: FeatureStepsProps) {
  const prefersReducedMotion = useReducedMotion() ?? false
  const [currentFeature, setCurrentFeature] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (features.length === 0) {
      setCurrentFeature(0)
      setProgress(0)
      return
    }

    setCurrentFeature((prev) => prev % features.length)
  }, [features.length])

  useEffect(() => {
    if (features.length <= 1 || prefersReducedMotion || !autoPlay) {
      setProgress(0)
      return
    }

    const safeInterval = Math.max(autoPlayInterval, 1000)
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + 100 / (safeInterval / 100)

        if (next < 100) {
          return next
        }

        setCurrentFeature((current) => (current + 1) % features.length)
        return 0
      })
    }, 100)

    return () => window.clearInterval(timer)
  }, [autoPlay, autoPlayInterval, features.length, prefersReducedMotion])

  if (features.length === 0) {
    return null
  }

  return (
    <div className={cn('p-4 md:p-6 lg:p-8', className)}>
      <div className="mx-auto w-full">
        {title ? (
          <div className="mx-auto mb-8 max-w-3xl text-center md:mb-10">
            <h2 className="text-3xl font-semibold tracking-[var(--tracking-title)] text-[var(--text-strong)] md:text-4xl lg:text-[2.7rem]">
              {title}
            </h2>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] lg:gap-8">
          <div className="order-2 space-y-3 md:order-1 md:space-y-4">
            {features.map((feature, index) => {
              const isActive = index === currentFeature
              const isComplete = index <= currentFeature

              return (
                <motion.button
                  key={feature.step}
                  type="button"
                  className={cn(
                    'group flex w-full items-start gap-4 rounded-[calc(var(--radius-xl)+0.15rem)] border p-4 text-left transition-[transform,background-color,border-color,box-shadow] duration-300 md:gap-5 md:p-5',
                    isActive
                      ? 'border-[color-mix(in_srgb,var(--accent)_24%,var(--border-soft))] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,248,255,0.96))] shadow-[0_18px_42px_rgba(19,44,72,0.08)]'
                      : 'border-[color-mix(in_srgb,var(--border-soft)_84%,white_16%)] bg-[rgba(255,255,255,0.72)] hover:border-[color-mix(in_srgb,var(--accent)_16%,var(--border-soft))] hover:bg-[rgba(255,255,255,0.9)]',
                  )}
                  initial={false}
                  animate={{ opacity: isActive ? 1 : 0.78, y: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
                  onClick={() => {
                    setCurrentFeature(index)
                    setProgress(0)
                  }}
                >
                  <motion.div
                    className={cn(
                      'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] md:h-11 md:w-11 md:text-base',
                      isActive
                        ? 'scale-105 border-primary/20 bg-primary text-primary-foreground'
                        : isComplete
                          ? 'border-primary/20 bg-primary/10 text-primary'
                          : 'border-[var(--border-soft)] bg-[var(--surface-focus)] text-[var(--text-muted)]',
                    )}
                  >
                    {isComplete ? (
                      <span className="text-base font-bold md:text-lg">✓</span>
                    ) : (
                      <span className="text-base font-semibold md:text-lg">{index + 1}</span>
                    )}
                  </motion.div>

                  <div className="flex-1">
                    <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
                      {feature.step}
                    </p>
                    <h3 className="text-lg font-semibold tracking-[var(--tracking-tight)] text-[var(--text-strong)] md:text-[1.35rem]">
                      {feature.title || feature.step}
                    </h3>
                    <p className="mt-2 max-w-[32rem] text-sm leading-6 text-[var(--text-body)] md:text-[1.02rem] md:leading-7">
                      {feature.content}
                    </p>
                    {isActive && autoPlay && !prefersReducedMotion ? (
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--border-soft)_72%,white_28%)]">
                        <motion.div
                          className="h-full rounded-full bg-primary"
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.1, ease: 'linear' }}
                        />
                      </div>
                    ) : null}
                  </div>
                </motion.button>
              )
            })}
          </div>

          <div
            className={cn(
              'order-1 relative overflow-hidden rounded-[calc(var(--radius-2xl)+0.1rem)] border border-[color-mix(in_srgb,var(--edge-surface-border)_84%,white_16%)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,247,253,0.98))] shadow-[var(--edge-surface-shadow)] md:order-2',
              imageHeight,
            )}
          >
            <AnimatePresence mode="wait">
              {features.map(
                (feature, index) =>
                  index === currentFeature && (
                    <motion.div
                      key={feature.step}
                      className="absolute inset-0 overflow-hidden rounded-[calc(var(--radius-2xl)+0.1rem)]"
                      initial={prefersReducedMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' }}
                    >
                      <img
                        src={feature.image}
                        alt={`${feature.title || feature.step} preview`}
                        className="h-full w-full object-cover object-top transition-transform"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(74,147,239,0.2),transparent_34%),linear-gradient(180deg,transparent_24%,rgba(11,34,58,0.12)_100%)]" />
                      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[rgba(247,251,255,0.96)] via-[rgba(247,251,255,0.18)] to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4 rounded-[calc(var(--radius-lg)+0.1rem)] border border-white/80 bg-white/88 p-3 shadow-[0_12px_28px_rgba(19,44,72,0.08)] backdrop-blur">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                          {feature.step}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--text-strong)] md:text-[0.98rem]">
                          {feature.title || feature.step}
                        </p>
                      </div>
                    </motion.div>
                  ),
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
