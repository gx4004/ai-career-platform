'use client'

import { type ReactNode, type CSSProperties, type RefObject, useState, useEffect } from 'react'
import { motion, AnimatePresence, useScroll, useTransform, type Variants } from 'framer-motion'

const spring = { type: 'spring', stiffness: 260, damping: 20 }
const ease = [0.16, 1, 0.3, 1] as const

// ── shared variants ──
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

// ── wrapper components ──

export function FadeIn({
  children,
  delay = 0,
  duration = 0.4,
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
      variants={fadeIn}
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
  className,
  style,
}: {
  children: ReactNode
  stagger?: number
  delay?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <motion.div
      initial="hidden"
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
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function useViewportTrigger(
  ref: RefObject<HTMLElement | null>,
  { threshold = 0.4, once = true } = {},
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

export { motion, AnimatePresence, useScroll, useTransform, spring, ease }
