import { useCallback } from 'react'

/**
 * useSpotlight — drives a spotlight border that follows the cursor.
 *
 * Usage:
 *   const spotlight = useSpotlight()
 *   <div className="lp-spotlight" {...spotlight}>...</div>
 *
 * Writes --spot-x / --spot-y CSS vars on mouse move using raw DOM mutation
 * (no React state) to avoid re-renders.
 */
export function useSpotlight() {
  const onMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    target.style.setProperty('--spot-x', `${x}px`)
    target.style.setProperty('--spot-y', `${y}px`)
  }, [])
  return { onMouseMove }
}
