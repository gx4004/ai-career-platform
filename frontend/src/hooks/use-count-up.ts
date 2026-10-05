import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'

export type CountUpOptions = {
  /** Count up from 0. When false (or under reduced motion) the final value is returned immediately. Default true. */
  enabled?: boolean
  /** ms before the count starts: the seal is still in flight. Default 330. */
  delay?: number
  /** ms the count takes. Default 520. */
  duration?: number
}

/**
 * The number a score stamp shows while it counts up: 0 until `delay`, then an ease-out-cubic run to `value`
 * in whole steps (requestAnimationFrame). Returns `value` itself when there is nothing to animate, so a
 * screen reader and a revisit never see the intermediate numbers.
 */
export function useCountUp(value: number, { enabled = true, delay = 330, duration = 520 }: CountUpOptions = {}): number {
  const reduced = usePrefersReducedMotion()
  const active = enabled && !reduced && Number.isFinite(value)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!active) return
    setShown(0)
    let frame = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration))
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, value, delay, duration])

  return active ? shown : value
}
