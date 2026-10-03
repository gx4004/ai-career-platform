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

  it('keeps a persistent live-region marker on the container so a modal never hides it from assistive tech', () => {
    setup({ title: 'x' })
    expect(document.querySelector('.kit-toast-region')?.getAttribute('aria-live')).toBe('off')
  })
})
