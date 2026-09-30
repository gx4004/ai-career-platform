import { useLayoutEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

/**
 * Textarea that grows to fit its content instead of clipping or scrolling.
 * Re-measures when the value changes and when its width changes (wrapping).
 */
export function AutoGrowTextarea({
  value,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return
      lastWidth = el.clientWidth
      measure()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [value])

  return <textarea ref={ref} rows={1} value={value} {...props} />
}
