import { useEffect, useState } from 'react'

export function useCountUp(target: number, active = true, duration = 700) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) {
      setValue(target)
      return
    }

    let frame = 0
    const start = performance.now()

    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - start) / duration, 1)
      setValue(Math.round(target * progress))
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick)
      }
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [active, duration, target])

  return value
}
