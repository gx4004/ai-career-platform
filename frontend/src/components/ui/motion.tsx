'use client'

import { type ReactNode, type CSSProperties, type RefObject, useRef, useState, useEffect } from 'react'
import { motion, animate, AnimatePresence, MotionConfig, useScroll, useTransform, useReducedMotion, useMotionValue, useInView, type Variants } from 'framer-motion'

const spring = { type: 'spring', stiffness: 260, damping: 20 }
const ease = [0.16, 1, 0.3, 1] as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

export function FadeIn({
  children,
  delay = 0,
  duration = 0.4,
  startHidden = true,
  className,
  style,
}: {
  children: ReactNode
  delay?: number
  duration?: number
  startHidden?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <motion.div
      variants={fadeIn}
      initial={startHidden ? 'hidden' : false}
      animate="visible"
      transition={{ duration, delay, ease }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function FadeUp({
  children,
  delay = 0,
  duration = 0.45,
  className,
  style,
}: {
  children: ReactNode
  delay?: number
  duration?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      transition={{ duration, delay, ease }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function StaggerChildren({
  children,
  stagger = 0.06,
  delay = 0,
  startHidden = true,
  className,
  style,
}: {
  children: ReactNode
  stagger?: number
  delay?: number
  startHidden?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <motion.div
      initial={startHidden ? 'hidden' : false}
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.4, ease }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function ScrollReveal({
  children,
  className,
  style,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useReducedMotion() ?? false
  const inView = useInView(ref, { once: true, amount: 0 })

  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView || prefersReducedMotion ? 'visible' : 'hidden'}
      transition={{ duration: 0.5, delay, ease }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function ScrollStagger({
  children,
  stagger = 0.08,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode
  stagger?: number
  delay?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useReducedMotion() ?? false
  const inView = useInView(ref, { once: true, amount: 0 })

  if (prefersReducedMotion) {
    return <div className={className} style={style}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function ScrollStaggerItem({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const prefersReducedMotion = useReducedMotion() ?? false

  if (prefersReducedMotion) {
    return <div className={className} style={style}>{children}</div>
  }

  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.45, ease }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function useViewportTrigger(
  ref: RefObject<HTMLElement | null>,
  { threshold = 0, once = true } = {},
) {
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTriggered(true)
          if (once) observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold, once])

  return triggered
}

export function useScrollProgress(ref: RefObject<HTMLElement | null>) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  return { scrollYProgress, useTransform }
}

export function AnimatedNumber({
  value,
  duration = 1.2,
  delay = 0.3,
  className,
}: {
  value: number
  duration?: number
  delay?: number
  className?: string
}) {
  const prefersReducedMotion = useReducedMotion() ?? false
  const [displayed, setDisplayed] = useState(prefersReducedMotion ? value : 0)

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayed(value)
      return
    }
    let raf: number
    let cancelled = false
    const timeout = setTimeout(() => {
      const start = performance.now()
      const animate = (now: number) => {
        if (cancelled) return
        const elapsed = (now - start) / (duration * 1000)
        if (elapsed >= 1) {
          setDisplayed(value)
          return
        }
        const progress = 1 - Math.pow(1 - elapsed, 3)
        setDisplayed(Math.round(progress * value))
        raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
    }, delay * 1000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
      cancelAnimationFrame(raf)
    }
  }, [value, duration, delay, prefersReducedMotion])

  return <span className={className}>{displayed}</span>
}

// ── New scroll animation utilities ──────────────────────────────────────────

const fadeUpScale: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1 },
}

/**
 * ScrollFadeUp — viewport-triggered reveal with spring physics.
 * Fires once when 15% of the element is visible.
 */
export function ScrollFadeUp({
  children,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode
  delay?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useReducedMotion() ?? false
  const inView = useInView(ref, { once: true, amount: 0 })

  if (prefersReducedMotion) {
    return <div className={className} style={style}>{children}</div>
  }
  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      transition={{ type: 'spring', stiffness: 80, damping: 20, delay }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

/**
 * ParallaxLayer — scroll-linked Y offset.
 * speed > 0 → moves down as you scroll (float up effect)
 * speed < 0 → moves up as you scroll (float down effect)
 */
export function ParallaxLayer({
  children,
  speed = 0.2,
  className,
  style,
}: {
  children: ReactNode
  speed?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useReducedMotion() ?? false
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [-speed * 60, speed * 60])

  if (prefersReducedMotion) {
    return <div className={className} style={style}>{children}</div>
  }
  return (
    <motion.div ref={ref} style={{ y, ...style }} className={className}>
      {children}
    </motion.div>
  )
}

/**
 * MagneticButton — cursor pull effect.
 * Children element pulls ±12px toward the cursor.
 * Uses useMotionValue only — no useState, no re-renders.
 */
export function MagneticButton({
  children,
  className,
  style,
  strength = 0.35,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  strength?: number
}) {
  const prefersReducedMotion = useReducedMotion() ?? false
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springCfg = { type: 'spring' as const, stiffness: 180, damping: 18 }

  if (prefersReducedMotion) {
    return <div className={className} style={style}>{children}</div>
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    animate(x, dx * strength, springCfg)
    animate(y, dy * strength, springCfg)
  }
  const handleMouseLeave = () => {
    animate(x, 0, springCfg)
    animate(y, 0, springCfg)
  }

  return (
    <motion.div
      className={className}
      style={{ x, y, display: 'inline-block', ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </motion.div>
  )
}

/**
 * ScrollStaggerGrid — like ScrollStagger but children also scale in (0.97→1).
 * Use for card grids where scale adds depth to the reveal.
 */
export function ScrollStaggerGrid({
  children,
  stagger = 0.07,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode
  stagger?: number
  delay?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prefersReducedMotion = useReducedMotion() ?? false
  const inView = useInView(ref, { once: true, amount: 0 })

  if (prefersReducedMotion) {
    return <div className={className} style={style}>{children}</div>
  }
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

/**
 * ScrollStaggerGridItem — child of ScrollStaggerGrid.
 * Fades up with a subtle scale (0.97→1) for depth.
 */
export function ScrollStaggerGridItem({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const prefersReducedMotion = useReducedMotion() ?? false
  if (prefersReducedMotion) {
    return <div className={className} style={style}>{children}</div>
  }
  return (
    <motion.div
      variants={fadeUpScale}
      transition={{ type: 'spring', stiffness: 80, damping: 18 }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export { motion, AnimatePresence, MotionConfig, useScroll, useTransform, spring, ease }
