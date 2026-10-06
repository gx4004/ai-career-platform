import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeyValue, KeyValueRow, MetaRow, ScoreBar, Stat, scoreTone } from '#/components/kit'

afterEach(() => vi.restoreAllMocks())

describe('kit MetaRow', () => {
  it('renders each present item as a list item', () => {
    render(
      <MetaRow>
        <strong>Northwind Labs</strong>
        <span>Remote</span>
        <span>3 days ago</span>
      </MetaRow>,
    )
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Northwind Labs', 'Remote', '3 days ago'])
  })

  it('skips null, undefined, false and blank items, so no double or dangling separators', () => {
    render(
      <MetaRow>
        {null}
        <span>Tidewater</span>
        {false}
        {''}
        {'   '}
        <span>Lisbon</span>
        {undefined}
      </MetaRow>,
    )
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Tidewater', 'Lisbon'])
  })

  it('keeps the number zero', () => {
    render(<MetaRow>{0}</MetaRow>)
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['0'])
  })

  it('accepts an array and flattens fragments', () => {
    render(
      <MetaRow>
        {['A', null, 'B']}
        <>
          <span>C</span>
          {null}
        </>
      </MetaRow>,
    )
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['A', 'B', 'C'])
  })

  it('renders nothing when every item is missing', () => {
    const { container } = render(<MetaRow>{[null, undefined, false, '']}</MetaRow>)
    expect(container.firstChild).toBeNull()
  })

  it('merges className and passes native props', () => {
    render(
      <MetaRow className="extra" aria-label="Facts" data-testid="meta">
        <span>One</span>
      </MetaRow>,
    )
    const list = screen.getByTestId('meta')
    expect(list.className).toContain('kit-meta')
    expect(list.className).toContain('extra')
    expect(list.getAttribute('aria-label')).toBe('Facts')
  })

  it('marks the items that start a line, so a dot never leads a wrapped line', async () => {
    // Fake layout: A and B share the first line, C and D wrap onto the second.
    const tops: Record<string, number> = { A: 0, B: 0, C: 20, D: 20 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = tops[this.textContent ?? ''] ?? 0
      return { top, bottom: top + 16, left: 0, right: 40, width: 40, height: 16, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
    render(
      <MetaRow>
        <span>A</span>
        <span>B</span>
        <span>C</span>
        <span>D</span>
      </MetaRow>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    const flags = screen.getAllByRole('listitem').map((item) => item.hasAttribute('data-line-start'))
    expect(flags).toEqual([true, false, true, false])
  })

  it('leaves every dot alone when there is no layout (nothing measured)', async () => {
    render(
      <MetaRow>
        <span>A</span>
        <span>B</span>
      </MetaRow>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getAllByRole('listitem').some((item) => item.hasAttribute('data-line-start'))).toBe(false)
  })
})

describe('kit KeyValue', () => {
  it('renders a description list from items', () => {
    const { container } = render(
      <KeyValue
        items={[
          { label: 'Stage', value: 'Interview' },
          { label: 'Applied', value: 'Sep 23, 2026' },
        ]}
      />,
    )
    expect(container.querySelector('dl')).toBeTruthy()
    const terms = [...container.querySelectorAll('dt')].map((node) => node.textContent)
    const values = [...container.querySelectorAll('dd')].map((node) => node.textContent)
    expect(terms).toEqual(['Stage', 'Applied'])
    expect(values).toEqual(['Interview', 'Sep 23, 2026'])
  })

  it('supports KeyValueRow children and a mono value', () => {
    const { container } = render(
      <KeyValue>
        <KeyValueRow label="Id" mono>
          app_123
        </KeyValueRow>
      </KeyValue>,
    )
    expect(container.querySelector('dd')?.getAttribute('data-mono')).toBe('true')
  })

  it('marks only numeric values for tabular figures', () => {
    const { container } = render(
      <KeyValue
        items={[
          { label: 'Email', value: 'ada.1791@example.com' },
          { label: 'Runs', value: '1,144', numeric: true },
        ]}
      />,
    )
    const values = [...container.querySelectorAll('dd')].map((node) => node.getAttribute('data-numeric'))
    expect(values).toEqual([null, 'true'])
  })

  it('shows a quiet dash and "Not provided" for blank values', () => {
    const { container } = render(
      <KeyValue
        items={[
          { label: 'Contact', value: null },
          { label: 'Referral', value: '' },
          { label: 'Notes', value: undefined },
        ]}
      />,
    )
    const values = [...container.querySelectorAll('dd')]
    expect(values).toHaveLength(3)
    for (const value of values) {
      expect(value.textContent).toContain('—')
      expect(value.textContent).toContain('Not provided')
    }
  })

  it('does not treat the number 0 as blank', () => {
    const { container } = render(<KeyValue items={[{ label: 'Replies', value: 0 }]} />)
    expect(container.querySelector('dd')?.textContent).toBe('0')
  })

  it('records layout and divider options, and a label column width', () => {
    const { container } = render(<KeyValue layout="stacked" divided={false} labelWidth="7.5rem" items={[{ label: 'A', value: 'b' }]} />)
    const list = container.querySelector('dl') as HTMLElement
    expect(list.getAttribute('data-layout')).toBe('stacked')
    expect(list.hasAttribute('data-divided')).toBe(false)
    expect(list.style.getPropertyValue('--kit-kv-label')).toBe('7.5rem')
  })

  it('is divided and inline by default', () => {
    const { container } = render(<KeyValue items={[{ label: 'A', value: 'b' }]} />)
    const list = container.querySelector('dl') as HTMLElement
    expect(list.getAttribute('data-layout')).toBe('inline')
    expect(list.getAttribute('data-divided')).toBe('true')
  })
})

describe('kit Stat', () => {
  it('puts the label first in the DOM so it reads "label, value"', () => {
    const { container } = render(<Stat label="Applications" value={7} />)
    const children = [...(container.querySelector('dl')?.children ?? [])].map((node) => node.tagName)
    expect(children).toEqual(['DT', 'DD'])
    expect(container.querySelector('dt')?.textContent).toBe('Applications')
    expect(container.querySelector('dd')?.textContent).toBe('7')
  })

  it('renders a unit and a delta with its tone', () => {
    const { container } = render(<Stat label="Skills fit" value={92} unit="%" delta="+6 since Sep 24" tone="success" />)
    expect(container.querySelector('.kit-stat__unit')?.textContent).toBe('%')
    const delta = container.querySelector('.kit-stat__delta') as HTMLElement
    expect(delta.textContent).toBe('+6 since Sep 24')
    expect(delta.getAttribute('data-tone')).toBe('success')
  })

  it('has no unit or delta elements when they are not given', () => {
    const { container } = render(<Stat label="Replies" value="2 of 9" />)
    expect(container.querySelector('.kit-stat__unit')).toBeNull()
    expect(container.querySelector('.kit-stat__delta')).toBeNull()
  })

  it('supports the md size', () => {
    const { container } = render(<Stat label="Days" value={4.5} size="md" />)
    expect(container.querySelector('dl')?.getAttribute('data-size')).toBe('md')
  })
})

describe('kit ScoreBar', () => {
  it('exposes the bar as a meter named by its label, with value, bounds and text', () => {
    render(<ScoreBar label="Keyword match" value={72} valueLabel="72%" />)
    const meter = screen.getByRole('meter', { name: 'Keyword match' })
    expect(meter.getAttribute('aria-valuenow')).toBe('72')
    expect(meter.getAttribute('aria-valuemin')).toBe('0')
    expect(meter.getAttribute('aria-valuemax')).toBe('100')
    expect(meter.getAttribute('aria-valuetext')).toBe('72%')
  })

  it('shows the number (hidden from assistive tech: the meter already says it)', () => {
    render(<ScoreBar label="Fit" value={72.4} />)
    const shown = screen.getByText('72')
    expect(shown.getAttribute('aria-hidden')).toBe('true')
  })

  it('can be named with aria-label alone', () => {
    render(<ScoreBar aria-label="Skills fit" value={50} />)
    expect(screen.getByRole('meter', { name: 'Skills fit' })).toBeTruthy()
  })

  it('picks the tone from the default thresholds (70 / 41)', () => {
    const { container } = render(
      <>
        <ScoreBar label="a" value={92} />
        <ScoreBar label="b" value={70} />
        <ScoreBar label="c" value={58} />
        <ScoreBar label="d" value={41} />
        <ScoreBar label="e" value={40} />
      </>,
    )
    const tones = [...container.querySelectorAll('.kit-score__fill')].map((node) => node.getAttribute('data-tone'))
    expect(tones).toEqual(['success', 'success', 'warning', 'warning', 'danger'])
  })

  it('takes custom thresholds, a quiet low tone, and a forced tone', () => {
    const { container } = render(
      <>
        <ScoreBar label="a" value={55} thresholds={{ good: 50, fair: 20 }} />
        <ScoreBar label="b" value={10} lowTone="neutral" />
        <ScoreBar label="c" value={95} tone="danger" />
        <ScoreBar label="d" value={60} tone="accent" />
      </>,
    )
    const tones = [...container.querySelectorAll('.kit-score__fill')].map((node) => node.getAttribute('data-tone'))
    expect(tones).toEqual(['success', 'neutral', 'danger', 'accent'])
  })

  it('marks a fill resolved from auto (drawn ink) and leaves forced tones unmarked', () => {
    const { container } = render(
      <>
        <ScoreBar label="a" value={92} />
        <ScoreBar label="b" value={60} tone="accent" />
        <ScoreBar label="c" value={60} tone="ink" />
        <ScoreBar label="d" value={0} />
      </>,
    )
    const fills = [...container.querySelectorAll('.kit-score__fill')]
    expect(fills.map((node) => node.hasAttribute('data-auto'))).toEqual([true, false, false, true])
    expect(fills.map((node) => node.getAttribute('data-tone'))).toEqual(['success', 'accent', 'ink', 'danger'])
    expect(fills.map((node) => node.hasAttribute('data-zero'))).toEqual([false, false, false, true])
  })

  it('scales to max and clamps the fill to the track', () => {
    const { container } = render(
      <>
        <ScoreBar label="a" value={4} max={5} />
        <ScoreBar label="b" value={140} />
        <ScoreBar label="c" value={-5} />
      </>,
    )
    const widths = [...container.querySelectorAll<HTMLElement>('.kit-score__fill')].map((node) => node.style.inlineSize || node.style.width)
    expect(widths).toEqual(['80%', '100%', '0%'])
    expect(screen.getAllByRole('meter')[1].getAttribute('aria-valuenow')).toBe('100')
  })

  it('records layout and size', () => {
    const { container } = render(<ScoreBar label="a" value={1} layout="inline" size="sm" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-layout')).toBe('inline')
    expect(root.getAttribute('data-size')).toBe('sm')
    expect(root.getAttribute('data-labelled')).toBe('true')
  })

  it('valueWidth fixes the number column without dropping a caller style', () => {
    const { container } = render(
      <ScoreBar aria-label="a" value={1} layout="inline" valueWidth="3.5rem" style={{ marginTop: 2 }} />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--kit-score-value-w')).toBe('3.5rem')
    expect(root.style.marginTop).toBe('2px')
  })

  it('scoreTone is a plain function of percent and thresholds', () => {
    expect(scoreTone(100)).toBe('success')
    expect(scoreTone(69)).toBe('warning')
    expect(scoreTone(0)).toBe('danger')
    expect(scoreTone(0, undefined, 'neutral')).toBe('neutral')
  })
})

describe('kit Stat sizes', () => {
  it('has lg, md and a stamp size for a date', () => {
    const { container } = render(
      <>
        <Stat label="a" value={1} />
        <Stat label="b" value={2} size="md" />
        <Stat label="in 5 days" value="Oct 9" size="stamp" />
      </>,
    )
    expect([...container.querySelectorAll('.kit-stat')].map((node) => node.getAttribute('data-size'))).toEqual(['lg', 'md', 'stamp'])
  })
})
