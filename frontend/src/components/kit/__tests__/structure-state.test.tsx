import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button, EmptyState, ErrorState, Skeleton } from '#/components/kit'

describe('kit EmptyState', () => {
  it('renders the title, the sentence and one action', () => {
    render(<EmptyState title="No applications yet" description="Add a job from Discover." action={<Button>Find jobs</Button>} />)
    expect(screen.getByText('No applications yet')).toBeTruthy()
    expect(screen.getByText('Add a job from Discover.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find jobs' })).toBeTruthy()
  })

  it('is compact by default and can be page-level', () => {
    const { container, rerender } = render(<EmptyState title="Nothing" />)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-size')).toBe('compact')
    rerender(<EmptyState title="Nothing" size="page" />)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-size')).toBe('page')
  })

  it('can carry the page heading on a full-page state', () => {
    render(<EmptyState size="page" headingLevel={1} title="Nothing here" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Nothing here' })).toBeTruthy()
  })

  it('can be an inline placeholder for a narrow slot', () => {
    const { container } = render(<EmptyState size="inline" title="Offers on the table" />)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-size')).toBe('inline')
    expect(screen.getByText('Offers on the table').className).toContain('kit-empty__title')
  })

  it('renders only what it is given', () => {
    const { container } = render(<EmptyState title="You have seen every match" />)
    expect(container.querySelector('.kit-empty__text')).toBeNull()
    expect(container.querySelector('.kit-empty__action')).toBeNull()
  })

  it('the title is a paragraph unless a heading level is given', () => {
    const { container, rerender } = render(<EmptyState title="Nothing" />)
    expect(container.querySelector('p.kit-empty__title')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
    rerender(<EmptyState title="Nothing" headingLevel={2} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing' })).toBeTruthy()
  })

  it('has no icon or image: an empty state is words', () => {
    const { container } = render(<EmptyState title="Nothing" description="d" action={<Button>Go</Button>} />)
    expect(container.querySelector('img, svg')).toBeNull()
  })
})

describe('kit ErrorState', () => {
  it('is an alert by default, with the title and description', () => {
    render(<ErrorState title="Your applications couldn't be loaded" description="Something went wrong on our side." />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain("Your applications couldn't be loaded")
    expect(alert.textContent).toContain('Something went wrong on our side.')
  })

  it('can be a status or silent', () => {
    const { rerender } = render(<ErrorState title="Not found" role="status" />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<ErrorState title="Not found" role="none" />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers a Try again button that calls onRetry', () => {
    const onRetry = vi.fn()
    render(<ErrorState title="Failed" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has no retry button without onRetry', () => {
    render(<ErrorState title="Failed" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('takes a retry label, and shows a busy, non-submitting button while retrying', () => {
    const onRetry = vi.fn()
    render(<ErrorState title="Failed" onRetry={onRetry} retryLabel="Export again" retrying />)
    const button = screen.getByRole('button', { name: 'Export again' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('renders a code, a detail line and a way back', () => {
    render(
      <ErrorState
        code="404"
        title="This application couldn't be opened"
        detail="request 7f3c1a"
        backAction={
          <Button asChild variant="secondary">
            <a href="/campaigns">All applications</a>
          </Button>
        }
      />,
    )
    expect(screen.getByText('404')).toBeTruthy()
    expect(screen.getByText('request 7f3c1a')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'All applications' }).getAttribute('href')).toBe('/campaigns')
  })

  it('shares the empty-state shape and size', () => {
    const { container } = render(<ErrorState title="Failed" size="page" headingLevel={2} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('kit-empty')
    expect(root.getAttribute('data-size')).toBe('page')
    expect(screen.getByRole('heading', { level: 2, name: 'Failed' })).toBeTruthy()
  })
})

describe('kit Skeleton', () => {
  it('is hidden from assistive tech by default', () => {
    const { container } = render(<Skeleton />)
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('with a label it is a named, busy status region', () => {
    render(<Skeleton variant="card" count={2} label="Loading applications" />)
    const status = screen.getByRole('status', { name: 'Loading applications' })
    expect(status.getAttribute('aria-busy')).toBe('true')
    expect(status.querySelectorAll('.kit-skeleton__card')).toHaveLength(2)
  })

  it('the page variant announces itself as Loading even without a label', () => {
    render(<Skeleton variant="page" />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
  })

  it('line renders the requested number of lines, the last one shorter, in the requested text size', () => {
    const { container } = render(<Skeleton lines={3} size="meta" />)
    const lines = container.querySelectorAll('.kit-skeleton__line')
    expect(lines).toHaveLength(3)
    expect(lines[0].getAttribute('data-size')).toBe('meta')
    expect((lines[0].firstElementChild as HTMLElement).style.inlineSize).toBe('100%')
    expect((lines[2].firstElementChild as HTMLElement).style.inlineSize).toBe('60%')
  })

  it('line takes a width, numbers being pixels', () => {
    const { container } = render(<Skeleton width={120} />)
    expect((container.querySelector('.kit-skeleton__bar') as HTMLElement).style.inlineSize).toBe('120px')
  })

  it('block takes shape="circle" for a round placeholder (an avatar) and stays a rectangle by default', () => {
    const { container, rerender } = render(<Skeleton variant="block" width={36} height={36} />)
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-shape')).toBe(false)
    rerender(<Skeleton variant="block" shape="circle" width={36} height={36} />)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-shape')).toBe('circle')
  })

  it('block takes width and height', () => {
    const { container } = render(<Skeleton variant="block" width="100%" height={72} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.inlineSize).toBe('100%')
    expect(root.style.blockSize).toBe('72px')
  })

  it('stat repeats a number line and a label line', () => {
    const { container } = render(<Skeleton variant="stat" count={3} />)
    expect(container.querySelectorAll('.kit-skeleton__stat')).toHaveLength(3)
    const lines = container.querySelector('.kit-skeleton__stat')!.querySelectorAll('.kit-skeleton__line')
    expect([...lines].map((line) => line.getAttribute('data-size'))).toEqual(['display', 'meta'])
  })

  it('row renders the requested density and a leading square on request', () => {
    const { container } = render(<Skeleton variant="row" count={2} density="compact" leading />)
    const rows = container.querySelectorAll('.kit-skeleton__row')
    expect(rows).toHaveLength(2)
    expect(rows[0].getAttribute('data-density')).toBe('compact')
    expect(rows[0].querySelector('.kit-skeleton__leading')).toBeTruthy()
  })

  it('row can lead with the 40px tool-tile square a run row has, so the text does not move when it loads', () => {
    const { container } = render(<Skeleton variant="row" leading="tile" />)
    expect(container.querySelector('.kit-skeleton__leading.kit-skeleton__leading--tile')).toBeTruthy()
    const plain = render(<Skeleton variant="row" leading />)
    expect(plain.container.querySelector('.kit-skeleton__leading--tile')).toBeNull()
  })

  it('header is the PageHeader alone: a display line and a lead line, for pages that draw their own sections', () => {
    const { container } = render(<Skeleton variant="header" label="Loading your dashboard" />)
    const lines = container.querySelectorAll('.kit-skeleton__header > .kit-skeleton__line')
    expect([...lines].map((line) => line.getAttribute('data-size'))).toEqual(['display', 'body'])
    expect(screen.getByRole('status', { name: 'Loading your dashboard' })).toBeTruthy()
  })

  it('row can lead with the FitStamp box of a match row', () => {
    const { container } = render(<Skeleton variant="row" leading="stamp" />)
    expect(container.querySelector('.kit-skeleton__leading.kit-skeleton__leading--stamp')).toBeTruthy()
  })

  it('row can open with a ListHeading strip (a day-grouped list such as History), hidden like the rows', () => {
    const { container } = render(
      <ul>
        <Skeleton variant="row" as="li" heading count={2} />
      </ul>,
    )
    const items = [...container.querySelectorAll('ul > li')]
    expect(items).toHaveLength(3)
    expect(items[0].classList.contains('kit-list-heading')).toBe(true)
    expect(items[0].getAttribute('aria-hidden')).toBe('true')
    expect(items[0].querySelector('.kit-skeleton__line')?.getAttribute('data-size')).toBe('title')
    expect(items.slice(1).every((item) => item.classList.contains('kit-skeleton__row'))).toBe(true)
    const { container: plain } = render(<ul><Skeleton variant="row" as="li" count={2} /></ul>)
    expect(plain.querySelector('.kit-list-heading')).toBeNull()
  })

  it('sticker draws tone-less plates in place of Stickers, as many as asked and as tall as asked', () => {
    const { container } = render(<Skeleton variant="sticker" count={2} height={132} label="Loading what needs you" />)
    const plates = container.querySelectorAll<HTMLElement>('.kit-skeleton--stickers > .kit-skeleton__sticker')
    expect(plates).toHaveLength(2)
    expect(plates[0].style.blockSize).toBe('132px')
    expect(screen.getByRole('status', { name: 'Loading what needs you' })).toBeTruthy()
  })

  // consistency-F30 (STICKER 4.O): every skeleton's frame shows at once and only the fill pulses; the sticker plates
  // were the one borderless shape, and the loaded stickers' outline snapped on around them.
  it('frames the sticker plates (2px --line, inside their height) and pulses only the fill inside', () => {
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/skeleton.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const plate = css.match(/\.kit-skeleton__sticker \{([^}]*)\}/)?.[1] ?? ''
    expect(plate).toMatch(/border:\s*var\(--bw\) solid var\(--line\)/)
    expect(plate).toMatch(/box-sizing:\s*border-box/)
    expect(plate).not.toMatch(/animation|box-shadow/)
    expect(css).toMatch(/\.kit-skeleton__sticker::before \{[^}]*animation:\s*kit-skeleton-pulse/)
  })

  it('never uses a shimmer: it is bars with a pulse class, nothing sweeping', () => {
    const { container } = render(<Skeleton variant="page" />)
    expect(container.querySelector('[class*="shimmer"]')).toBeNull()
    expect(container.querySelectorAll('.kit-skeleton__bar').length).toBeGreaterThan(5)
  })
})

describe('kit EmptyState and ErrorState icon', () => {
  it('draws an icon in a disc before the title, hidden from assistive tech', () => {
    const { container } = render(<EmptyState icon={<svg data-testid="star" />} title="No starred results" />)
    const disc = container.querySelector('.kit-empty__icon') as HTMLElement
    expect(disc.getAttribute('aria-hidden')).toBe('true')
    expect(disc.querySelector('[data-testid="star"]')).toBeTruthy()
    expect(container.querySelector('.kit-empty__title')).toBeTruthy()
  })

  it('has no disc without an icon, on both states', () => {
    const { container } = render(
      <>
        <EmptyState title="Nothing" />
        <ErrorState title="Failed" />
      </>,
    )
    expect(container.querySelector('.kit-empty__icon')).toBeNull()
  })

  it('an ErrorState icon sits in the same disc (the stylesheet colours it rose)', () => {
    const { container } = render(<ErrorState icon={<svg />} title="Failed" />)
    expect(container.querySelector('.kit-error .kit-empty__icon')).toBeTruthy()
  })

  // An outcome that replaces the form whose submit had focus (a reset done, a link refused, a new account) would
  // drop focus to the page body and say nothing (sign-off public-G05): focusTitle hands focus to its heading.
  it('focusTitle moves focus to the heading when the state appears, without a tab stop', () => {
    render(<EmptyState variant="open" headingLevel={1} focusTitle title="Password updated" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Password updated' })
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })

  it('focusTitle works on an ErrorState too, and without it the title takes no focus', () => {
    const { unmount } = render(<ErrorState variant="open" headingLevel={1} role="none" focusTitle title="Invalid reset link" />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Invalid reset link' }))
    unmount()
    render(<EmptyState headingLevel={2} title="Nothing" />)
    const heading = screen.getByRole('heading', { level: 2, name: 'Nothing' })
    expect(heading.hasAttribute('tabindex')).toBe(false)
    expect(document.activeElement).not.toBe(heading)
  })
})
