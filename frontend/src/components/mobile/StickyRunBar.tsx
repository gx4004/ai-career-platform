import { type ReactNode, useEffect, useState } from 'react'

interface StickyRunBarProps {
  children: ReactNode
}

/**
 * Mobile sticky bottom bar that hides when the virtual keyboard is open.
 * Uses visualViewport API to detect keyboard.
 */
export function StickyRunBar({ children }: StickyRunBarProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const onResize = () => {
      // If visual viewport is significantly smaller than window, keyboard is open
      const threshold = window.innerHeight * 0.75
      setKeyboardOpen(vv.height < threshold)
    }

    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  if (keyboardOpen) return null

  return (
    <div className="mobile-sticky-run-bar">
      {children}
    </div>
  )
}
