'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { cn } from '#/lib/utils'

export function ContainerScroll({
  titleComponent,
  children,
  className,
  containerClassName,
  cardClassName,
  contentClassName,
}: {
  titleComponent: ReactNode
  children: ReactNode
  className?: string
  containerClassName?: string
  cardClassName?: string
  contentClassName?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const prefersReducedMotion = useReducedMotion() ?? false
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  })

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => {
      window.removeEventListener('resize', checkMobile)
    }
  }, [])

  const rotate = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [0, 0] : [18, 0])
  const scale = useTransform(
    scrollYProgress,
    [0, 1],
    prefersReducedMotion ? [1, 1] : isMobile ? [0.92, 1] : [1.08, 1],
  )
  const translate = useTransform(
    scrollYProgress,
    [0, 1],
    prefersReducedMotion ? [0, 0] : [0, -96],
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-[52rem] items-start justify-center px-2 pt-6 md:h-[72rem] md:px-8 md:pt-16',
        className,
      )}
    >
      <div
        className={cn('relative w-full py-8 md:py-24', containerClassName)}
        style={{ perspective: '1000px' }}
      >
        <Header translate={translate} titleComponent={titleComponent} />
        <Card rotate={rotate} scale={scale} className={cardClassName} contentClassName={contentClassName}>
          {children}
        </Card>
      </div>
    </div>
  )
}

export function Header({
  translate,
  titleComponent,
}: {
  translate: MotionValue<number>
  titleComponent: ReactNode
}) {
  return (
    <motion.div
      style={{ translateY: translate }}
      className="mx-auto max-w-5xl text-center"
    >
      {titleComponent}
    </motion.div>
  )
}

export function Card({
  rotate,
  scale,
  children,
  className,
  contentClassName,
}: {
  rotate: MotionValue<number>
  scale: MotionValue<number>
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        boxShadow:
          '0 12px 32px rgba(16, 42, 67, 0.12), 0 36px 80px rgba(16, 42, 67, 0.12), 0 90px 140px rgba(16, 42, 67, 0.08)',
      }}
      className={cn(
        'mx-auto -mt-10 h-[20rem] w-full max-w-5xl rounded-[2rem] border border-[var(--edge-surface-border)] bg-[var(--edge-surface-bg)] p-2 md:-mt-16 md:h-[32rem] md:p-4 lg:h-[40rem]',
        className,
      )}
    >
      <div
        className={cn(
          'h-full w-full overflow-hidden rounded-[1.5rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(246,249,253,0.96))]',
          contentClassName,
        )}
      >
        {children}
      </div>
    </motion.div>
  )
}
