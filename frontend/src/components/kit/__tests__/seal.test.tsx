import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScoreSeal } from '#/components/kit'
import { sealPath } from '#/components/kit/seal'
import { useCountUp } from '#/hooks/use-count-up'

describe('sealPath', () => {
  it('is a closed 361-point scallop of 18 lobes around the centre', () => {
    const d = sealPath(110, 110, 93, 5, 18)
    expect(d.startsWith('M208.00,110.00L')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const points = d.slice(1, -1).split('L').map((pair) => pair.split(',').map(Number))
    expect(points).toHaveLength(361)
    const radii = points.map(([x, y]) => Math.hypot(x - 110, y - 110))
    expect(Math.max(...radii)).toBeCloseTo(98, 0)
    expect(Math.min(...radii)).toBeCloseTo(88, 0)
    // 18 lobes: the radius crosses its mean 36 times
    let crossings = 0
    for (let i = 1; i < radii.length; i++) if (radii[i - 1] < 93 !== radii[i] < 93) crossings++
    expect(crossings).toBe(36)
  })
})

describe('kit ScoreSeal', () => {
  it('exposes the score as a term and a description, and keeps the visible numeral out of the tree', () => {
    const { container } = render(<ScoreSeal value={77} label="Resume score" />)
    expect(screen.getByRole('term').textContent).toContain('Resume score')
    expect(screen.getByRole('definition').textContent).toContain('77 out of 100')
    const dl = container.querySelector('dl.kit-seal') as HTMLElement
    expect(dl.getAttribute('data-tone')).toBe('tangerine')
    expect(dl.getAttribute('data-reveal')).toBe('none')
    expect(dl.style.getPropertyValue('--seal')).toBe('300px')
    expect(dl.style.getPropertyValue('--seal-rotate')).toBe('-4deg')
    expect(container.querySelector('.kit-seal__num')?.textContent).toBe('77')
    expect(container.querySelector('.kit-seal__num')?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(container.querySelector('.kit-seal__of')?.textContent).toBe('/100')
    expect(container.querySelectorAll('.kit-seal__shadow, .kit-seal__shape, .kit-seal__ring')).toHaveLength(3)
  })

  it('draws the scalloped path twice (shadow and shape) and a dotted ring', () => {
    const { container } = render(<ScoreSeal value={77} label="Resume score" />)
    const shadow = container.querySelector('.kit-seal__shadow')!.getAttribute('d')
    const shape = container.querySelector('.kit-seal__shape')!.getAttribute('d')
    expect(shape).toBe(shadow)
    expect(shape).toBe(sealPath(110, 110, 93, 5, 18))
    const ring = container.querySelector('.kit-seal__ring')!
    expect(ring.getAttribute('r')).toBe('80')
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 220 220')
  })

  it('maps named sizes, tone, rotation and text values', () => {
    const { container, rerender } = render(<ScoreSeal value={84} label="Example" size="sm" tone="lemon" rotate={-2} />)
    const dl = container.querySelector('dl') as HTMLElement
    expect(dl.style.getPropertyValue('--seal')).toBe('170px')
    expect(dl.style.getPropertyValue('--seal-rotate')).toBe('-2deg')
    expect(dl.getAttribute('data-tone')).toBe('lemon')
    expect(dl.getAttribute('data-small')).toBe('true')
    rerender(<ScoreSeal value="404" label="Error 404" size={230} unit={null} />)
    const next = container.querySelector('dl') as HTMLElement
    expect(next.style.getPropertyValue('--seal')).toBe('230px')
    expect(next.getAttribute('data-digits')).toBe('3')
    expect(container.querySelector('.kit-seal__of')).toBeNull()
    expect(screen.getByRole('definition').textContent).toContain('404')
  })

  it('shrinks the numeral for three digits (100 must not touch the ring)', () => {
    const { container } = render(<ScoreSeal value={100} label="Perfect" />)
    expect(container.querySelector('dl')!.getAttribute('data-digits')).toBe('3')
  })

  it('renders a missing score in stone with an en dash and says so', () => {
    const { container } = render(<ScoreSeal value={null} label="Resume score" />)
    const dl = container.querySelector('dl') as HTMLElement
    expect(dl.getAttribute('data-tone')).toBe('stone')
    expect(dl.getAttribute('data-missing')).toBe('true')
    expect(container.querySelector('.kit-seal__num')?.textContent).toBe('–')
    expect(screen.getByRole('definition').textContent).toContain('not available')
    expect(container.querySelector('.kit-seal__of')).toBeNull()
  })

  it('says percent for a % unit', () => {
    render(<ScoreSeal value={61} label="Career fit" unit="%" />)
    expect(screen.getByRole('definition').textContent).toContain('61 percent')
  })
})

function allowMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
  window.matchMedia = globalThis.matchMedia
}

describe('ScoreSeal reveal', () => {
  const originalMatchMedia = window.matchMedia
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] })
    allowMotion()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    window.matchMedia = originalMatchMedia
  })

  it('counts up from 0 to the value while the hidden description already holds the final number', () => {
    const { container } = render(<ScoreSeal value={77} label="Resume score" reveal="stamp" />)
    const advance = (ms: number) => vi.advanceTimersByTime(ms)
    expect(container.querySelector('dl')!.getAttribute('data-reveal')).toBe('stamp')
    expect(container.querySelector('dl')!.getAttribute('data-animating')).toBe('true')
    expect(container.querySelector('.kit-seal__num')?.textContent).toBe('0')
    expect(screen.getByRole('definition').textContent).toContain('77 out of 100')
    act(() => advance(200))
    expect(container.querySelector('.kit-seal__num')?.textContent).toBe('0')
    act(() => advance(500))
    const mid = Number(container.querySelector('.kit-seal__num')?.textContent)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(77)
    act(() => advance(600))
    expect(container.querySelector('.kit-seal__num')?.textContent).toBe('77')
  })

  it('does not count when reveal is none', () => {
    const { container } = render(<ScoreSeal value={77} label="Resume score" />)
    expect(container.querySelector('.kit-seal__num')?.textContent).toBe('77')
    expect(container.querySelector('dl')!.getAttribute('data-animating')).toBeNull()
  })

  it('calls onRevealEnd once the stamp animation ends', () => {
    const onRevealEnd = vi.fn()
    const { container } = render(<ScoreSeal value={77} label="Resume score" reveal="stamp" onRevealEnd={onRevealEnd} />)
    const dl = container.querySelector('dl') as HTMLElement
    // jsdom has no AnimationEvent: give the plain event the one field React reads
    const end = (animationName: string) => {
      // jsdom lacks the CSS animation properties, so React listens for the webkit-prefixed name there
      for (const type of ['animationend', 'webkitAnimationEnd']) {
        const event = new Event(type, { bubbles: true })
        Object.defineProperty(event, 'animationName', { value: animationName })
        act(() => {
          dl.dispatchEvent(event)
        })
      }
    }
    end('kit-ring')
    expect(onRevealEnd).not.toHaveBeenCalled()
    end('kit-stamp')
    expect(onRevealEnd).toHaveBeenCalled()
    expect(dl.getAttribute('data-animating')).toBeNull()
  })
})

describe('useCountUp', () => {
  it('returns the value at once when disabled', () => {
    function Probe() {
      return <span data-testid="n">{useCountUp(42, { enabled: false })}</span>
    }
    render(<Probe />)
    expect(screen.getByTestId('n').textContent).toBe('42')
  })
})

describe('ScoreSeal under reduced motion', () => {
  it('shows the final number at once even when a reveal is requested (the jsdom default is reduced motion)', () => {
    const { container } = render(<ScoreSeal value={77} label="Resume score" reveal="stamp" />)
    expect(container.querySelector('.kit-seal__num')?.textContent).toBe('77')
  })
})
