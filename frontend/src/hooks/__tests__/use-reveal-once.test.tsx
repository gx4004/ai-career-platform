import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markRevealPending, useRevealOnce } from '#/hooks/use-reveal-once'

function Probe({ id }: { id: string | number | null }) {
  return <span data-testid="reveal">{String(useRevealOnce(id))}</span>
}

describe('useRevealOnce', () => {
  const originalMatchMedia = window.matchMedia
  beforeEach(() => {
    window.sessionStorage.clear()
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.restoreAllMocks()
  })

  it('is false when nothing marked the run', () => {
    render(<Probe id="run-1" />)
    expect(screen.getByTestId('reveal').textContent).toBe('false')
  })

  it('is true on the mount after markRevealPending and false on every later mount', () => {
    markRevealPending('run-2')
    const first = render(<Probe id="run-2" />)
    expect(screen.getByTestId('reveal').textContent).toBe('true')
    expect(window.sessionStorage.getItem('cw:reveal:run-2')).toBeNull()
    first.unmount()
    render(<Probe id="run-2" />)
    expect(screen.getByTestId('reveal').textContent).toBe('false')
  })

  it('stays true across a re-render of the same mount', () => {
    markRevealPending(7)
    const { rerender } = render(<Probe id={7} />)
    rerender(<Probe id={7} />)
    expect(screen.getByTestId('reveal').textContent).toBe('true')
  })

  it('reads the flag again when the run id changes (Re-generate)', () => {
    const { rerender } = render(<Probe id="old" />)
    expect(screen.getByTestId('reveal').textContent).toBe('false')
    markRevealPending('new')
    rerender(<Probe id="new" />)
    expect(screen.getByTestId('reveal').textContent).toBe('true')
  })

  it('never reveals under reduced motion, and still consumes the flag', () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
    markRevealPending('run-3')
    render(<Probe id="run-3" />)
    expect(screen.getByTestId('reveal').textContent).toBe('false')
    expect(window.sessionStorage.getItem('cw:reveal:run-3')).toBeNull()
  })

  it('never reveals without a run id, and survives blocked storage', () => {
    render(<Probe id={null} />)
    expect(screen.getByTestId('reveal').textContent).toBe('false')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => markRevealPending('x')).not.toThrow()
    render(<Probe id="x" />)
    expect(screen.getAllByTestId('reveal').at(-1)!.textContent).toBe('false')
  })
})
