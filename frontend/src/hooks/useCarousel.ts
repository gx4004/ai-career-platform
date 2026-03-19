import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

type CarouselOptions = {
  interval?: number
  cooldown?: number
}

const DEFAULTS = { interval: 4000, cooldown: 6000 } as const

export function useCarousel(itemCount: number, opts?: CarouselOptions) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const pausedRef = useRef(false)
  const lastManualRef = useRef(0)

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > activeIndex ? 1 : -1)
      setActiveIndex(index)
      lastManualRef.current = Date.now()
    },
    [activeIndex],
  )

  const goNext = useCallback(() => {
    setDirection(1)
    setActiveIndex((i) => (i + 1) % itemCount)
    lastManualRef.current = Date.now()
  }, [itemCount])

  const goPrev = useCallback(() => {
    setDirection(-1)
    setActiveIndex((i) => (i - 1 + itemCount) % itemCount)
    lastManualRef.current = Date.now()
  }, [itemCount])

  const interval = opts?.interval ?? DEFAULTS.interval
  const cooldown = opts?.cooldown ?? DEFAULTS.cooldown

  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current) return
      if (Date.now() - lastManualRef.current < cooldown) return
      setDirection(1)
      setActiveIndex((i) => (i + 1) % itemCount)
    }, interval)
    return () => clearInterval(id)
  }, [itemCount, interval, cooldown])

  const [paused, setPaused] = useState(false)

  const hoverHandlers = useMemo(
    () => ({
      onMouseEnter: () => { pausedRef.current = true; setPaused(true) },
      onMouseLeave: () => { pausedRef.current = false; setPaused(false) },
    }),
    [],
  )

  return { activeIndex, direction, paused, goTo, goNext, goPrev, hoverHandlers }
}
