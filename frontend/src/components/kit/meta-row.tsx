import {
  Children,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '#/lib/utils'
import { useMergedRef } from './utils'

/** Flatten fragments and drop everything that renders nothing (null, undefined, booleans, blank strings). */
export function toItems(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = []
  for (const child of Children.toArray(children)) {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      out.push(...toItems(child.props.children))
    } else if (typeof child === 'string' && child.trim() === '') {
      continue
    } else {
      out.push(child)
    }
  }
  return out
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/*
 * Marking the items that start a wrapped line. A dot belongs in the gap between two
 * items on the same line; the item that begins a line has no dot to its left. Which
 * items those are depends on layout, so it is measured: the reads for every row are
 * batched, then all writes happen, which costs one layout however many rows exist.
 * The dot is drawn in the gap (not inside the item), so hiding it moves nothing and
 * the measurement cannot feed back into itself.
 */
const queue = new Set<HTMLElement>()
let scheduled = false

function readLineStarts(list: HTMLElement): boolean[] | null {
  const items = Array.from(list.children) as HTMLElement[]
  if (items.length === 0) return null
  const rects = items.map((item) => item.getBoundingClientRect())
  if (rects.every((rect) => rect.width === 0 && rect.height === 0)) return null // not laid out (hidden, or jsdom)
  return rects.map((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom - 0.5)
}

function flush() {
  scheduled = false
  const batch = Array.from(queue)
  queue.clear()
  const reads = batch.map((list) => [list, readLineStarts(list)] as const)
  for (const [list, starts] of reads) {
    if (!starts) continue
    Array.from(list.children).forEach((item, index) => item.toggleAttribute('data-line-start', starts[index]))
  }
}

function schedule(list: HTMLElement) {
  queue.add(list)
  if (scheduled) return
  scheduled = true
  queueMicrotask(flush)
}

function useLineStarts(ref: RefObject<HTMLUListElement | null>, active: boolean) {
  // Every render may change the items, so every render re-measures (batched, see above).
  useIsoLayoutEffect(() => {
    if (ref.current) schedule(ref.current)
  })
  // The row's own size changes with the viewport and with the page's layout; web fonts change text widths.
  useEffect(() => {
    const list = ref.current
    if (!list || !active) return
    const measure = () => schedule(list)
    if (typeof document !== 'undefined') void document.fonts?.ready.then(measure)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [ref, active])
}

export type MetaRowProps = ComponentPropsWithoutRef<'ul'>

/**
 * Inline facts separated by a dot: "Northwind Labs · Remote · 3 days ago". Pass the items as
 * children (or an array); anything that renders nothing is skipped, so no item can leave a
 * double or dangling dot. When the row wraps, a dot never starts a line.
 */
export const MetaRow = forwardRef<HTMLUListElement, MetaRowProps>(function MetaRow({ className, children, ...rest }, ref) {
  const inner = useRef<HTMLUListElement | null>(null)
  const merged = useMergedRef(ref, inner)
  const items = toItems(children)
  useLineStarts(inner, items.length > 0)
  if (items.length === 0) return null
  return (
    <ul ref={merged} role="list" className={cn('kit-meta', className)} {...rest}>
      {items.map((item, index) => (
        <li key={isValidElement(item) && item.key !== null ? item.key : index} className="kit-meta__item">
          {item}
        </li>
      ))}
    </ul>
  )
})
