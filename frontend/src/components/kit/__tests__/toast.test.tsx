import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast, type ToastOptions } from '#/components/kit'

function Harness({ options, extra }: { options: ToastOptions; extra?: ToastOptions[] }) {
  const { toast, dismiss } = useToast()
  return (
    <>
      <button onClick={() => toast(options)}>show</button>
      <button
        onClick={() => {
          for (const item of extra ?? []) toast(item)
        }}
      >
        show many
      </button>
      <button onClick={() => dismiss()}>dismiss all</button>
    </>
  )
}

function setup(options: ToastOptions, extra?: ToastOptions[], max?: number) {
  render(
    <ToastProvider max={max}>
      <Harness options={options} extra={extra} />
    </ToastProvider>,
  )
}

const show = () => fireEvent.click(screen.getByRole('button', { name: 'show' }))
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const polite = () => document.querySelector('[data-kit-toast-announcer="polite"]') as HTMLElement
const assertive = () => document.querySelector('[data-kit-toast-announcer="assertive"]') as HTMLElement
const toasts = () => Array.from(document.querySelectorAll('.kit-toast-region .kit-toast'))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('kit Toast', () => {
  it('throws a clear error outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Harness options={{ title: 'x' }} />)).toThrow('useToast must be used inside <ToastProvider>')
    spy.mockRestore()
  })

  // Sign-off r4 chrome-F01 (WCAG 2.4.11): a page that moves focus in the same render that opens a toast scrolls with
  // the stack height of the moment before it; once the new height is published, a focused control under a toast is
  // scrolled clear (the root's scroll padding now includes it).
  describe('keeps the focused control clear of a toast that opens over it', () => {
    const originalObserver = globalThis.ResizeObserver
    const originalRect = Element.prototype.getBoundingClientRect
    const hadScroll = Object.prototype.hasOwnProperty.call(Element.prototype, 'scrollIntoView')
    const originalScroll = Element.prototype.scrollIntoView
    let notify = () => {}
    let scrolled: Array<[Element, unknown]> = []
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top }) as DOMRect

    beforeEach(() => {
      scrolled = []
      globalThis.ResizeObserver = class {
        constructor(callback: ResizeObserverCallback) {
          notify = () => callback([], this as unknown as ResizeObserver)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver
      Element.prototype.scrollIntoView = function scrollIntoView(this: Element, options?: unknown) {
        scrolled.push([this, options])
      } as typeof Element.prototype.scrollIntoView
    })

    afterEach(() => {
      globalThis.ResizeObserver = originalObserver
      Element.prototype.getBoundingClientRect = originalRect
      if (hadScroll) Element.prototype.scrollIntoView = originalScroll
      else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    })

    function renderWithProbe(probeRect: DOMRect) {
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.matches('.kit-toast')) return rect(624, 640, 380, 108)
        if (this.matches('[data-probe]')) return probeRect
        return originalRect.call(this)
      }
      let api: ReturnType<typeof useToast> | null = null
      function Grab() {
        api = useToast()
        return null
      }
      render(
        <ToastProvider>
          <Grab />
          <button data-probe="">Probe</button>
        </ToastProvider>,
      )
      const probe = screen.getByRole('button', { name: 'Probe' })
      // Focus moved by the page (no click in between, which would make it a pointer focus), then a toast opens.
      probe.focus()
      act(() => void api?.toast({ title: 'Added to your applications' }))
      act(() => notify())
      return probe
    }

    it('scrolls it into view (nearest) when the toast covers it', () => {
      const probe = renderWithProbe(rect(900, 700, 80, 36))
      expect(scrolled).toContainEqual([probe, { block: 'nearest' }])
    })

    it('leaves the page alone when the toast does not cover it', () => {
      renderWithProbe(rect(100, 700, 80, 36))
      expect(scrolled).toEqual([])
    })
  })

  it('publishes the region height as --kit-toast-stack, so a bottom sheet on a phone can stop below the toasts', () => {
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.matches('[data-kit-toast-region]')) return { height: 123.4 } as DOMRect
      return original.call(this)
    }
    try {
      const { unmount } = render(
        <ToastProvider>
          <span />
        </ToastProvider>,
      )
      expect(document.documentElement.style.getPropertyValue('--kit-toast-stack')).toBe('124px')
      unmount()
      expect(document.documentElement.style.getPropertyValue('--kit-toast-stack')).toBe('')
    } finally {
      Element.prototype.getBoundingClientRect = original
    }
  })

  it('shows a neutral toast with the text and a dismiss button', () => {
    setup({ title: 'Link copied.' })
    show()
    const toast = toasts()[0]
    expect(toast.textContent).toContain('Link copied.')
    expect(toast.getAttribute('data-tone')).toBe('neutral')
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeTruthy()
  })

  it('announces through two persistent live regions, not through the toast that appears', () => {
    setup({ title: 'Link copied.' })
    // The regions exist before any toast does: screen readers speak changes to a region that is already there.
    expect(polite().getAttribute('role')).toBe('status')
    expect(assertive().getAttribute('role')).toBe('alert')
    expect(polite().textContent).toBe('')
    const before = polite()
    show()
    expect(polite()).toBe(before)
    expect(polite().textContent).toBe('Link copied.')
    expect(assertive().textContent).toBe('')
    // The visible toast carries no live role of its own, so nothing is announced twice.
    expect(toasts()[0].getAttribute('role')).toBeNull()
    expect(toasts()[0].querySelector('[role="status"], [role="alert"]')).toBeNull()
  })

  it('sends danger to the assertive region and success to the polite one, and keeps both when they arrive together', () => {
    setup({ tone: 'danger', title: 'Not saved' }, [{ tone: 'success', title: 'Saved', description: 'Backend roles.' }])
    show()
    fireEvent.click(screen.getByRole('button', { name: 'show many' }))
    expect(assertive().textContent).toBe('Not saved')
    expect(polite().textContent).toBe('Saved Backend roles.')
  })

  it('renders title and description', () => {
    setup({ title: 'CV saved', description: 'Backend roles is up to date.' })
    show()
    expect(screen.getByText('CV saved').className).toContain('kit-toast__title')
    expect(screen.getByText('Backend roles is up to date.').className).toContain('kit-toast__description')
  })

  it('auto-dismisses after 5s: closing state first, removed after the fade', () => {
    setup({ title: 'Gone soon' })
    show()
    advance(4999)
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].getAttribute('data-state')).toBe('open')
    advance(1)
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
    advance(200)
    expect(toasts()).toHaveLength(0)
  })

  it('keeps a danger toast or one with an action for 8s', () => {
    setup({ tone: 'danger', title: 'Failed' })
    show()
    advance(7999)
    expect(toasts()[0].getAttribute('data-state')).toBe('open')
    advance(1)
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
  })

  it('honours an explicit duration, and null keeps the toast until it is dismissed', () => {
    setup({ title: 'Quick', duration: 1000 }, [{ title: 'Sticky', duration: null }])
    show()
    fireEvent.click(screen.getByRole('button', { name: 'show many' }))
    advance(1000)
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
    advance(60_000)
    const remaining = toasts()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].textContent).toContain('Sticky')
    expect(remaining[0].getAttribute('data-state')).toBe('open')
  })

  it('pauses while hovered and resumes with the time that was left', () => {
    setup({ title: 'Hover me' })
    show()
    advance(3000)
    const toast = toasts()[0]
    fireEvent.pointerEnter(toast)
    advance(30_000)
    expect(toast.getAttribute('data-state')).toBe('open')
    fireEvent.pointerLeave(toast)
    advance(1999)
    expect(toast.getAttribute('data-state')).toBe('open')
    advance(1)
    expect(toast.getAttribute('data-state')).toBe('closed')
  })

  it('pauses while focus is inside the toast and resumes when it leaves', () => {
    setup({ title: 'Focus me', action: { label: 'Undo', onClick: () => undefined }, duration: 4000 })
    show()
    advance(1000)
    const undo = screen.getByRole('button', { name: 'Undo' })
    act(() => undo.focus())
    advance(30_000)
    expect(toasts()[0].getAttribute('data-state')).toBe('open')
    fireEvent.blur(undo, { relatedTarget: null })
    advance(2999)
    expect(toasts()[0].getAttribute('data-state')).toBe('open')
    advance(1)
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
  })

  it('runs the action and dismisses', () => {
    const onClick = vi.fn()
    setup({ title: 'Hid “Backend Engineer”.', action: { label: 'Undo', onClick }, duration: null })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
    advance(200)
    expect(toasts()).toHaveLength(0)
  })

  it('dismisses from the X button and from Escape inside the toast, calling onDismiss once', () => {
    const onDismiss = vi.fn()
    setup({ title: 'Bye', duration: null, onDismiss })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    advance(200)
    expect(toasts()).toHaveLength(0)

    show()
    fireEvent.keyDown(toasts()[0], { key: 'Escape' })
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
  })

  it('stacks up to max and closes the oldest first', () => {
    setup({ title: 'unused' }, [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }, { title: 'Four' }], 3)
    fireEvent.click(screen.getByRole('button', { name: 'show many' }))
    const open = toasts().filter((item) => item.getAttribute('data-state') === 'open')
    expect(open.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Two'),
      expect.stringContaining('Three'),
      expect.stringContaining('Four'),
    ])
    advance(200)
    expect(toasts()).toHaveLength(3)
  })

  it('replaces a toast with the same id in place and restarts its timer', () => {
    setup({ id: 'sync', title: 'First' }, [{ id: 'sync', title: 'Second' }])
    show()
    advance(4000)
    fireEvent.click(screen.getByRole('button', { name: 'show many' }))
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].textContent).toContain('Second')
    advance(4000)
    expect(toasts()[0].getAttribute('data-state')).toBe('open')
    advance(1000)
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
  })

  it('dismiss() with no id closes everything', () => {
    setup({ title: 'A', duration: null }, [{ title: 'B', duration: null }])
    show()
    fireEvent.click(screen.getByRole('button', { name: 'show many' }))
    fireEvent.click(screen.getByRole('button', { name: 'dismiss all' }))
    advance(200)
    expect(toasts()).toHaveLength(0)
  })

  it('draws the tone icon for success and danger, none for neutral, and a custom or no icon on request', () => {
    setup({ tone: 'success', title: 'Saved' }, [{ title: 'Plain' }, { title: 'Custom', icon: <svg data-testid="mine" /> }, { tone: 'danger', title: 'Nope', icon: false }])
    show()
    expect(document.querySelector('.kit-toast__icon svg')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'show many' }))
    const [, plain, custom, nope] = toasts()
    expect(plain.querySelector('.kit-toast__icon')).toBeNull()
    expect(custom.querySelector('[data-testid="mine"]')).toBeTruthy()
    expect(nope.querySelector('.kit-toast__icon')).toBeNull()
  })

  it('renders the action as a link-style button and the tone icon inside the disc', () => {
    setup({ tone: 'success', title: 'Hid it', action: { label: 'Undo', onClick: () => undefined } })
    show()
    expect(screen.getByRole('button', { name: 'Undo' }).className).toContain('kit-button--link')
    expect(document.querySelector('.kit-toast__icon > svg')).toBeTruthy()
  })

  // Sign-off chrome-F08: "Added to your applications" offers View application and Undo (STICKER 4.D).
  it('takes a second quiet action after the first; either one runs and dismisses', () => {
    const view = vi.fn()
    const undo = vi.fn()
    setup({
      tone: 'success',
      title: 'Added to your applications',
      action: { label: 'View application', onClick: view },
      secondaryAction: { label: 'Undo', onClick: undo },
    })
    show()
    const [first, second] = [...toasts()[0].querySelectorAll('.kit-toast__actions > button')]
    expect(first.textContent).toBe('View application')
    expect(second.textContent).toBe('Undo')
    expect(second.className).toContain('kit-button--link')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(view).not.toHaveBeenCalled()
    expect(toasts()[0].getAttribute('data-state')).toBe('closed')
  })

  // Sign-off r5 chrome-F14: the root scroll padding that keeps a focused control clear of the toasts used to apply with
  // no toast up too (36px), so focusing a sticky sidebar control near the viewport bottom (the rail avatar, the legal
  // links) scrolled the page under it. With no toast there is no padding, so that focus cannot scroll; with one there is.
  // jsdom has no layout, so this reads the cascade of the real stylesheet, which is what decides whether focus scrolls.
  it('pads the page scroll above the toasts only while a toast is up, so focus near the bottom never scrolls otherwise', () => {
    const style = document.createElement('style')
    style.textContent = readFileSync(path.resolve(__dirname, '../../../styles/kit/toast.css'), 'utf8')
    document.head.append(style)
    const padding = () => getComputedStyle(document.documentElement).getPropertyValue('scroll-padding-block-end').trim()
    try {
      setup({ title: 'Saved' })
      expect(padding()).toBe('')
      show()
      expect(toasts()).toHaveLength(1)
      expect(padding()).toContain('var(--kit-toast-stack')
      fireEvent.click(screen.getByRole('button', { name: 'dismiss all' }))
      advance(1000)
      expect(toasts()).toHaveLength(0)
      expect(padding()).toBe('')
    } finally {
      style.remove()
    }
  })

  it('keeps a persistent live-region marker on the container so a modal never hides it from assistive tech', () => {
    setup({ title: 'x' })
    expect(document.querySelector('.kit-toast-region')?.getAttribute('aria-live')).toBe('off')
  })
})
