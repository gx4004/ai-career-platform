import { forwardRef, useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef, type MouseEvent } from 'react'
import { cn } from '#/lib/utils'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'

/** After a click the smooth scroll passes through other sections; the scroll-spy is ignored until the scroll has been idle this long. */
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

  // Scroll-spy, read from positions on every scroll (one read per frame): the current item is the last section
  // whose top has passed 30% of the viewport, and the last item once the page cannot scroll further (its heading
  // may never reach the line). Reading positions, not band crossings, also follows a long jump (find in page,
  // a link to a table) straight to the section in view. The page's size is watched too: content that grows or
  // shrinks above the reader (a live table, a notice) moves the sections without any scroll event.
  useEffect(() => {
    setActive((current) => (current && items.some((item) => item.id === current) ? current : (items[0]?.id ?? null)))
    if (items.length === 0 || typeof window === 'undefined') return
    let frame = 0
    let pending = false
    const read = () => {
      pending = false
      if (locked.current) return
      const placed = items
        .map((item) => ({ id: item.id, node: document.getElementById(item.id) }))
        .filter((entry): entry is { id: string; node: HTMLElement } => entry.node !== null)
      if (placed.length === 0) return
      const root = document.documentElement
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= root.scrollHeight - 2
      if (atEnd) {
        setActive(placed[placed.length - 1]!.id)
        return
      }
      const line = window.innerHeight * 0.3
      let next = placed[0]!.id
      for (const { id, node } of placed) {
        const rect = node.getBoundingClientRect()
        // A section that is not laid out (hidden) has no position to compare.
        if (rect.height > 0 && rect.top <= line) next = id
      }
      setActive(next)
    }
    const schedule = () => {
      if (pending) return
      pending = true
      frame = window.requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    resized?.observe(document.body)
    return () => {
      if (pending) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      resized?.disconnect()
    }
    // items is compared by its ids: a new array with the same ids must not rebuild the listener
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // On phones the strip scrolls sideways: keep the current link in view, or the reader loses the position cue.
  // The strip is scrolled on its own (not scrollIntoView, which would also move the page).
  useEffect(() => {
    if (!strip || !active || strip.scrollWidth <= strip.clientWidth || typeof strip.scrollTo !== 'function') return
    const link = Array.from(strip.querySelectorAll<HTMLElement>('a')).find((node) => node.getAttribute('href') === `#${active}`)
    if (!link) return
    // 16px of the previous link stays visible, unless the current one is too long to fit with it.
    const inset = Math.max(0, Math.min(16, strip.clientWidth - link.offsetWidth))
    const delta = link.getBoundingClientRect().left - strip.getBoundingClientRect().left - inset
    if (Math.abs(delta) < 1) return
    strip.scrollTo({ left: strip.scrollLeft + delta, behavior: reduced ? 'auto' : 'smooth' })
  }, [active, strip, reduced])

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
