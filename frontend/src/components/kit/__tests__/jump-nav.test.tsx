import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JumpNav } from '#/components/kit'

const ITEMS = [
  { id: 'fix-first', label: 'Fix first' },
  { id: 'breakdown', label: 'Score breakdown' },
  { id: 'strengths', label: 'Major strengths' },
]

/** Lays the sections out: each id's top edge, in viewport pixels (jsdom lays nothing out by itself). */
function layout(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    document.getElementById(id)!.getBoundingClientRect = () => ({ top, bottom: top + 120, height: 120, left: 0, right: 800, width: 800, x: 0, y: top, toJSON() {} }) as DOMRect
  }
}

/** Scrolls the window to `y` of a `height`-tall page and lets the scroll-spy read it. */
function scrollWindowTo(y: number, height = 4000) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: height, configurable: true })
  act(() => {
    fireEvent.scroll(window)
  })
}

const current = () => screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'true').map((a) => a.textContent)

describe('kit JumpNav', () => {
  beforeEach(() => {
    // The spy reads the layout once per frame; run frames at once so a scroll is read before the assertion.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    for (const item of ITEMS) {
      const node = document.createElement('section')
      node.id = item.id
      node.scrollIntoView = vi.fn()
      document.body.appendChild(node)
    }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
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

  // The spy reads where the sections are on every scroll (sign-off public-R2-N2): the current item is the last
  // section whose top has passed 30% of the viewport, and the last item at the very end of the page.
  it('follows the last section whose top has passed 30% of the viewport', () => {
    render(<JumpNav aria-label="On this page" items={ITEMS} />)
    layout({ 'fix-first': 300, breakdown: 900, strengths: 1500 })
    scrollWindowTo(10)
    expect(current()).toEqual(['Fix first'])
    layout({ 'fix-first': -400, breakdown: 200, strengths: 800 })
    scrollWindowTo(700)
    expect(current()).toEqual(['Score breakdown'])
  })

  it('marks the last item at the end of the page, where its heading never reaches the line', () => {
    render(<JumpNav aria-label="On this page" items={ITEMS} />)
    // The last two sections are short and on screen together, both below the 30% line.
    layout({ 'fix-first': -900, breakdown: 300, strengths: 600 })
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
    scrollWindowTo(4000 - 768)
    expect(current()).toEqual(['Major strengths'])
  })

  it('follows a long jump (find in page, a link) to the section in view, not the one before it', () => {
    render(<JumpNav aria-label="On this page" items={ITEMS} />)
    layout({ 'fix-first': -2400, breakdown: -1500, strengths: -200 })
    scrollWindowTo(2600)
    expect(current()).toEqual(['Major strengths'])
  })

  // Content above can grow or shrink with no scroll at all (a live table re-read on the cookie page, a notice):
  // the spy reads the sections again whenever the page's size changes (sign-off public, legal scroll-spy leftover).
  it('reads the sections again when the page changes size without scrolling', () => {
    const observers: Array<() => void> = []
    const original = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        observers.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      render(<JumpNav aria-label="On this page" items={ITEMS} />)
      layout({ 'fix-first': -400, breakdown: 200, strengths: 800 })
      scrollWindowTo(700)
      expect(current()).toEqual(['Score breakdown'])
      // A block above shrank: the next section moved up past the line, and no scroll event fired.
      layout({ 'fix-first': -600, breakdown: -100, strengths: 150 })
      act(() => observers.forEach((callback) => callback()))
      expect(current()).toEqual(['Major strengths'])
    } finally {
      globalThis.ResizeObserver = original
    }
  })

  it('stops reading the scroll once unmounted, and does not re-subscribe for a new array with the same ids', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { rerender, unmount } = render(<JumpNav aria-label="On this page" items={ITEMS} />)
    const scrolls = () => add.mock.calls.filter(([type]) => type === 'scroll').length
    const before = scrolls()
    rerender(<JumpNav aria-label="On this page" items={ITEMS.map((item) => ({ ...item }))} />)
    expect(scrolls()).toBe(before)
    unmount()
    expect(remove.mock.calls.some(([type]) => type === 'scroll')).toBe(true)
    add.mockRestore()
    remove.mockRestore()
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

  it('ignores the scroll while a click scroll settles, then follows it again', () => {
    vi.useFakeTimers()
    try {
      render(<JumpNav aria-label="On this page" items={ITEMS} />)
      fireEvent.click(screen.getByRole('link', { name: 'Major strengths' }))
      layout({ 'fix-first': -400, breakdown: 100, strengths: 900 })
      scrollWindowTo(500)
      expect(current()).toEqual(['Major strengths'])
      act(() => {
        vi.advanceTimersByTime(800)
      })
      scrollWindowTo(510)
      expect(current()).toEqual(['Score breakdown'])
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

  it('scrolls an overflowing strip (not the page) so the current link stays in view', () => {
    render(<JumpNav aria-label="Report sections" items={ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'Report sections' })
    Object.defineProperty(nav, 'scrollWidth', { value: 600, configurable: true })
    Object.defineProperty(nav, 'clientWidth', { value: 320, configurable: true })
    const stripScrollTo = vi.fn()
    nav.scrollTo = stripScrollTo as unknown as typeof nav.scrollTo
    nav.getBoundingClientRect = () => ({ left: 0 }) as DOMRect
    const strengths = screen.getByRole('link', { name: 'Major strengths' })
    strengths.getBoundingClientRect = () => ({ left: 420 }) as DOMRect
    layout({ 'fix-first': -2000, breakdown: -1000, strengths: 100 })
    scrollWindowTo(2200)
    expect(stripScrollTo).toHaveBeenCalledWith({ left: 404, behavior: 'auto' })
    expect(document.getElementById('strengths')!.scrollIntoView).not.toHaveBeenCalled()
  })

  it('still hands the nav element to a forwarded ref', () => {
    const ref = { current: null as HTMLElement | null }
    render(<JumpNav ref={ref} aria-label="Report sections" items={ITEMS} />)
    expect(ref.current?.tagName).toBe('NAV')
  })
})
