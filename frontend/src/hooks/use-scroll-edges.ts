import { useCallback, useRef } from 'react'

/**
 * A callback ref for a horizontal scroller: marks which ends still have content out of view
 * (data-overflow="start", "end" or both, removed when everything fits) so its CSS can fade that edge.
 * Written to the DOM directly: it changes on every scroll and is presentation only.
 */
export function useScrollEdges<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback((element: T | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!element) return
    const update = () => {
      const max = element.scrollWidth - element.clientWidth
      // scrollLeft runs negative right to left, so the distance from the start is its magnitude.
      const offset = Math.abs(element.scrollLeft)
      const edges = [offset > 1 ? 'start' : '', max > 1 && offset < max - 1 ? 'end' : ''].filter(Boolean).join(' ')
      if (edges) element.dataset.overflow = edges
      else delete element.dataset.overflow
    }
    update()
    element.addEventListener('scroll', update, { passive: true })
    // The window's width and cards arriving or leaving both change what fits.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resize?.observe(element)
    const children = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update)
    children?.observe(element, { childList: true, subtree: true })
    cleanup.current = () => {
      element.removeEventListener('scroll', update)
      resize?.disconnect()
      children?.disconnect()
    }
  }, [])
}
