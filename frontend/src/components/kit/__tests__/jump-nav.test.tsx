import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JumpNav } from '#/components/kit'

type Callback = (records: Array<{ isIntersecting: boolean; target: Element }>) => void
let observers: Array<{ callback: Callback; options?: IntersectionObserverInit; observed: Element[]; disconnected: boolean }> = []

class MockObserver {
  record: (typeof observers)[number]
  constructor(callback: Callback, options?: IntersectionObserverInit) {
    this.record = { callback, options, observed: [], disconnected: false }
    observers.push(this.record)
  }
  observe(node: Element) {
    this.record.observed.push(node)
  }
  disconnect() {
    this.record.disconnected = true
  }
  unobserve() {}
  takeRecords() {
    return []
  }
}

const ITEMS = [
  { id: 'fix-first', label: 'Fix first' },
  { id: 'breakdown', label: 'Score breakdown' },
  { id: 'strengths', label: 'Major strengths' },
]

describe('kit JumpNav', () => {
  const original = globalThis.IntersectionObserver
  beforeEach(() => {
    observers = []
    globalThis.IntersectionObserver = MockObserver as unknown as typeof IntersectionObserver
    for (const item of ITEMS) {
      const node = document.createElement('section')
      node.id = item.id
      node.scrollIntoView = vi.fn()
      document.body.appendChild(node)
    }
  })
  afterEach(() => {
    globalThis.IntersectionObserver = original
    document.body.querySelectorAll('section').forEach((node) => node.remove())
  })

  it('is a named nav of anchors and the first link is current on load', () => {
    render(<JumpNav aria-label="On this page" items={ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    const links = nav.querySelectorAll('a')
    expect([...links].map((a) => a.getAttribute('href'))).toEqual(['#fix-first', '#breakdown', '#strengths'])
    expect(links[0].getAttribute('aria-current')).toBe('true')
    expect(links[1].hasAttribute('aria-current')).toBe(false)
    expect(nav.getAttribute('data-sticky')).toBe('true')
  })

  it('is not sticky when asked', () => {
    render(<JumpNav aria-label="Jump" items={ITEMS} sticky={false} />)
    expect(screen.getByRole('navigation').hasAttribute('data-sticky')).toBe(false)
  })

  it('observes every target with the 20% / 70% band and follows the section that enters it', () => {
    render(<JumpNav aria-label="On this page" items={ITEMS} />)
    expect(observers).toHaveLength(1)
    expect(observers[0].options?.rootMargin).toBe('-20% 0px -70% 0px')
    expect(observers[0].observed.map((node) => node.id)).toEqual(['fix-first', 'breakdown', 'strengths'])
    act(() => {
      observers[0].callback([{ isIntersecting: true, target: document.getElementById('strengths')! }])
    })
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'true')
    expect(current.map((a) => a.textContent)).toEqual(['Major strengths'])
    act(() => {
      observers[0].callback([{ isIntersecting: false, target: document.getElementById('breakdown')! }])
    })
    expect(screen.getByRole('link', { name: 'Major strengths' }).getAttribute('aria-current')).toBe('true')
  })

  it('does not rebuild the observer for a new array with the same ids, and disconnects on unmount', () => {
    const { rerender, unmount } = render(<JumpNav aria-label="On this page" items={ITEMS} />)
    rerender(<JumpNav aria-label="On this page" items={ITEMS.map((item) => ({ ...item }))} />)
    expect(observers).toHaveLength(1)
    unmount()
    expect(observers[0].disconnected).toBe(true)
  })

  it('click scrolls to the section (instantly under reduced motion, which is the test default) and marks it current', () => {
    render(<JumpNav aria-label="On this page" items={ITEMS} />)
    const target = document.getElementById('breakdown')!
    const link = screen.getByRole('link', { name: 'Score breakdown' })
    const prevented = !fireEvent.click(link)
    expect(prevented).toBe(true)
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    expect(link.getAttribute('aria-current')).toBe('true')
  })

  it('leaves the default anchor jump alone when the target is not on the page', () => {
    render(<JumpNav aria-label="On this page" items={[{ id: 'missing', label: 'Missing' }]} />)
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Missing' }))
    expect(notPrevented).toBe(true)
  })

  it('ignores the observer while a click scroll settles, then follows it again', () => {
    vi.useFakeTimers()
    try {
      render(<JumpNav aria-label="On this page" items={ITEMS} />)
      fireEvent.click(screen.getByRole('link', { name: 'Major strengths' }))
      act(() => {
        observers[0].callback([{ isIntersecting: true, target: document.getElementById('breakdown')! }])
      })
      expect(screen.getByRole('link', { name: 'Major strengths' }).getAttribute('aria-current')).toBe('true')
      act(() => {
        vi.advanceTimersByTime(800)
        observers[0].callback([{ isIntersecting: true, target: document.getElementById('breakdown')! }])
      })
      expect(screen.getByRole('link', { name: 'Score breakdown' }).getAttribute('aria-current')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves modified clicks to the browser', () => {
    render(<JumpNav aria-label="On this page" items={ITEMS} />)
    const target = document.getElementById('breakdown')!
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Score breakdown' }), { metaKey: true })
    expect(notPrevented).toBe(true)
    expect(target.scrollIntoView).not.toHaveBeenCalled()
  })

  it('marks the strip as having more to scroll to only while it overflows and is not at its end', () => {
    render(<JumpNav aria-label="Report sections" items={ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'Report sections' })
    // jsdom lays nothing out: a strip with no overflow has no fade.
    expect(nav.dataset.more).toBe('false')

    Object.defineProperty(nav, 'scrollWidth', { value: 600, configurable: true })
    Object.defineProperty(nav, 'clientWidth', { value: 320, configurable: true })
    nav.scrollLeft = 0
    fireEvent.scroll(nav)
    expect(nav.dataset.more).toBe('true')

    nav.scrollLeft = 280
    fireEvent.scroll(nav)
    expect(nav.dataset.more).toBe('false')
  })

  it('still hands the nav element to a forwarded ref', () => {
    const ref = { current: null as HTMLElement | null }
    render(<JumpNav ref={ref} aria-label="Report sections" items={ITEMS} />)
    expect(ref.current?.tagName).toBe('NAV')
  })
})
