import { readFileSync } from 'node:fs'
import path from 'node:path'
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

describe('kit ScoreSeal type floor', () => {
  // A 132px seal (the landing closer on phones) put "/100" at 7.5% = 9.9px (sign-off public-F08).
  it('keeps the unit at 0.075 x the seal but never under the 12px text minimum', () => {
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/seal.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.match(/\.kit-seal__of\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/font-size:\s*max\(var\(--fs-micro\),\s*7\.5cqw\)/)
    expect(readFileSync(path.resolve(__dirname, '../../../styles/theme.css'), 'utf8')).toMatch(/--fs-micro:\s*0\.75rem/)
  })
})

describe('kit ScoreSeal reveal ring', () => {
  const strip = (file: string) =>
    readFileSync(path.resolve(__dirname, `../../../styles/kit/${file}`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  // A transform counts toward the page's scrollable overflow. The ring scaled to 1.35 and fill-mode forwards held it
  // there, so a seal near the right edge of a 320px phone left the document 327px wide and the page zoomed out after
  // the "applied" stamp (applications-discovery-F29). The ring now grows by outline-offset, which is ink overflow
  // only, and nothing holds an end state.
  it('pulses out without a transform and without holding its end state, so it never widens the page', () => {
    const ring = strip('foundation.css').match(/@keyframes kit-ring\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(ring).not.toBe('')
    expect(ring).not.toMatch(/transform|scale|inset|width|height|margin/)
    expect(ring).toMatch(/outline-offset/)
    const after = strip('seal.css').match(/\.kit-seal\[data-reveal='stamp'\]::after\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(after).toMatch(/animation:\s*kit-ring\b/)
    expect(after).not.toMatch(/\b(forwards|both)\b/)
    expect(after).not.toMatch(/\bborder\s*:/)
    expect(after).toMatch(/outline:\s*var\(--bw\) solid var\(--ink\)/)
  })
})
