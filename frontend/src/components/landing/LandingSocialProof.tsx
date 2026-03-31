import { useRef, useState, useEffect, useCallback } from 'react'
import { useReducedMotion } from 'framer-motion'
import { ScrollStagger, ScrollStaggerItem, useViewportTrigger } from '#/components/ui/motion'
import { StaggerTestimonials } from '#/components/ui/stagger-testimonials'

function AnimatedCounter({ target, suffix = '+' }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const triggered = useViewportTrigger(ref, { threshold: 0.5 })
  const prefersReducedMotion = useReducedMotion() ?? false
  const [display, setDisplay] = useState(target)

  const animate = useCallback(() => {
    if (prefersReducedMotion) return
    setDisplay(0) // reset before animating
    const duration = 1500
    const start = performance.now()
    const step = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, prefersReducedMotion])

  useEffect(() => {
    if (triggered) animate()
  }, [triggered, animate])

  return (
    <span ref={ref}>
      {display.toLocaleString()}{suffix}
    </span>
  )
}

export function LandingSocialProof() {
  return (
    <section className="landing-section landing-section-social-proof" id="landing-social-proof">
      <div className="content-max">
        <ScrollStagger className="landing-section-heading" stagger={0.1}>
          <ScrollStaggerItem>
            <p className="eyebrow">Real results from real job seekers</p>
          </ScrollStaggerItem>
          <ScrollStaggerItem>
            <h2 className="display-lg">
              <AnimatedCounter target={2400} /> resumes analyzed. Careers unblocked.
            </h2>
          </ScrollStaggerItem>
          <ScrollStaggerItem>
            <p className="muted-copy">
              From first upload to first interview — here's what job seekers are saying.
            </p>
          </ScrollStaggerItem>
        </ScrollStagger>
      </div>
      <StaggerTestimonials />
    </section>
  )
}
