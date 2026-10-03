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

  it('never uses a shimmer: it is bars with a pulse class, nothing sweeping', () => {
    const { container } = render(<Skeleton variant="page" />)
    expect(container.querySelector('[class*="shimmer"]')).toBeNull()
    expect(container.querySelectorAll('.kit-skeleton__bar').length).toBeGreaterThan(5)
  })
})
