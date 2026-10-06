import { forwardRef, useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef, type MouseEvent } from 'react'
import { cn } from '#/lib/utils'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'

/** After a click the smooth scroll passes through other sections; the observer is ignored until the scroll has been idle this long. */
const SCROLL_IDLE_MS = 160
/** Upper bound when the click causes no scroll at all (the target is already in place). */
const CLICK_NO_SCROLL_MS = 300

export type JumpNavItem = { id: string; label: string }

export type JumpNavProps = Omit<ComponentPropsWithoutRef<'nav'>, 'children' | 'aria-label'> & {
  items: JumpNavItem[]
  'aria-label': string
  /** Stick to the top of the viewport while the report scrolls. Default true. */
  sticky?: boolean
}

/**
 * In-page jump links for a long report. The link whose section is nearest the top reads as current
 * (lemon, like the active nav item); a click scrolls there smoothly, or instantly under reduced motion.
 * Targets need the ids; give them scroll-margin-top so they clear the sticky bar.
 */
export const JumpNav = forwardRef<HTMLElement, JumpNavProps>(function JumpNav(
  { items, sticky = true, className, ...rest },
  ref,
) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null)
  const reduced = usePrefersReducedMotion()
  const locked = useRef(false)
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const key = items.map((item) => item.id).join('|')

  // The edge fade (CSS ::after) says "more this way" only while the strip scrolls and is not at its end:
  // `data-more` is written straight to the element, so scrolling never re-renders the links.
  const [strip, setStrip] = useState<HTMLElement | null>(null)
  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      setStrip(node)
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  useEffect(() => {
    if (!strip) return
    const measure = () => {
      const more = strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1
      strip.dataset.more = more ? 'true' : 'false'
    }
    measure()
    strip.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(strip)
    return () => {
      strip.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [strip, key])

  useEffect(() => {
    setActive((current) => (current && items.some((item) => item.id === current) ? current : (items[0]?.id ?? null)))
    if (items.length === 0 || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (records) => {
        if (locked.current) return
        for (const record of records) {
          if (record.isIntersecting) setActive(record.target.id)
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )
    for (const item of items) {
      const node = document.getElementById(item.id)
      if (node) observer.observe(node)
    }
    return () => observer.disconnect()
    // items is compared by its ids: a new array with the same ids must not rebuild the observer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const scrollCleanup = useRef<(() => void) | null>(null)

  const lock = (ms: number) => {
    locked.current = true
    if (unlockTimer.current) clearTimeout(unlockTimer.current)
    unlockTimer.current = setTimeout(() => {
      locked.current = false
      scrollCleanup.current?.()
      scrollCleanup.current = null
    }, ms)
  }

  useEffect(
    () => () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current)
      scrollCleanup.current?.()
    },
    [],
  )

  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // Cmd/Ctrl/Shift/Alt and middle clicks keep the browser's own anchor behaviour.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = document.getElementById(id)
    if (!target) return
    event.preventDefault()
    lock(CLICK_NO_SCROLL_MS)
    const onScroll = () => lock(SCROLL_IDLE_MS)
    window.addEventListener('scroll', onScroll, { passive: true })
    scrollCleanup.current?.()
    scrollCleanup.current = () => window.removeEventListener('scroll', onScroll)
    setActive(id)
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav ref={setRefs} className={cn('kit-jump-nav', className)} data-sticky={sticky ? 'true' : undefined} {...rest}>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="kit-jump-nav__link"
          aria-current={active === item.id ? 'true' : undefined}
          onClick={(event) => go(event, item.id)}
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
})
