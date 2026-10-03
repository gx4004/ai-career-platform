import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button, Card, CardActions, CardHeader, CardTitle, Notice, Section, StretchedLink } from '#/components/kit'

describe('kit Section', () => {
  it('is not a region landmark unless asked: a dense page would get a dozen of them', () => {
    render(<Section title="Documents">Body</Section>)
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Documents' })).toBeTruthy()
  })

  it('with landmark it is a region named by its heading, which is an h2 by default', () => {
    render(
      <Section landmark title="Documents">
        Body
      </Section>,
    )
    const region = screen.getByRole('region', { name: 'Documents' })
    expect(within(region).getByRole('heading', { level: 2, name: 'Documents' })).toBeTruthy()
    expect(within(region).getByText('Body')).toBeTruthy()
  })

  it('honours headingLevel', () => {
    render(
      <Section title="Details" headingLevel={3}>
        x
      </Section>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Details' })).toBeTruthy()
  })

  it('shows the count after the title, separated by a space, in the heading name', () => {
    render(
      <Section title="Documents" count={3}>
        x
      </Section>,
    )
    expect(screen.getByRole('heading', { name: 'Documents 3' })).toBeTruthy()
  })

  it('keeps a count of zero', () => {
    render(
      <Section title="Closed" count={0}>
        x
      </Section>,
    )
    expect(screen.getByRole('heading', { name: 'Closed 0' })).toBeTruthy()
  })

  it('renders actions and a description, in the heading block above the content', () => {
    const { container } = render(
      <Section title="Prepare" description="We draft a cover letter." actions={<button type="button">Add</button>}>
        <p>Content</p>
      </Section>,
    )
    const head = container.querySelector('.kit-section__head') as HTMLElement
    expect(within(head).getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(within(head).getByText('We draft a cover letter.')).toBeTruthy()
    expect(head.contains(screen.getByText('Content'))).toBe(false)
  })

  it('steps its title down with size="sm" and marks it for the stylesheet', () => {
    const { container, rerender } = render(<Section title="A">x</Section>)
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-size')).toBe(false)
    rerender(
      <Section title="A" size="sm">
        x
      </Section>,
    )
    expect((container.firstElementChild as HTMLElement).getAttribute('data-size')).toBe('sm')
  })

  it('has the hairline by default and drops it with rule={false}', () => {
    const { container, rerender } = render(<Section title="A">x</Section>)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-rule')).toBe('true')
    rerender(
      <Section title="A" rule={false}>
        x
      </Section>,
    )
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-rule')).toBe(false)
  })

  it('uses a given id for the region and derives the heading id from it', () => {
    render(
      <Section id="docs" landmark title="Documents">
        x
      </Section>,
    )
    expect(screen.getByRole('region', { name: 'Documents' }).id).toBe('docs')
    expect(screen.getByRole('heading', { name: 'Documents' }).id).toBe('docs-heading')
  })
})

describe('kit Notice', () => {
  it('is a status by default and an alert for danger', () => {
    const { rerender } = render(<Notice>Carried over from Resume.</Notice>)
    expect(screen.getByRole('status').textContent).toContain('Carried over from Resume.')
    rerender(<Notice tone="danger">It failed.</Notice>)
    expect(screen.getByRole('alert').textContent).toContain('It failed.')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('lets the page override the role', () => {
    render(
      <Notice tone="danger" role="status">
        Calm.
      </Notice>,
    )
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders a title and detail, and records the tone', () => {
    render(
      <Notice tone="warning" title="Check your CV">
        Kubernetes is missing.
      </Notice>,
    )
    const notice = screen.getByRole('status')
    expect(notice.getAttribute('data-tone')).toBe('warning')
    expect(within(notice).getByText('Check your CV')).toBeTruthy()
    expect(within(notice).getByText('Kubernetes is missing.')).toBeTruthy()
  })

  it('draws the tone icon (hidden from assistive tech) unless icon={false}', () => {
    const { container, rerender } = render(<Notice tone="success">Saved.</Notice>)
    const icon = container.querySelector('.kit-notice__icon svg')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    rerender(
      <Notice tone="success" icon={false}>
        Saved.
      </Notice>,
    )
    expect(container.querySelector('.kit-notice__icon')).toBeNull()
  })

  it('renders an action', () => {
    render(<Notice action={<Button>Sign in</Button>}>Guest runs are not saved.</Notice>)
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('shows a labelled close button only with onDismiss, and calls it', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Notice>Hello</Notice>)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(
      <Notice onDismiss={onDismiss} dismissLabel="Dismiss notice">
        Hello
      </Notice>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('kit Card', () => {
  it('is an article by default and can be a li or div', () => {
    const { container, rerender } = render(<Card>x</Card>)
    expect(screen.getByRole('article')).toBeTruthy()
    rerender(
      <ul>
        <Card as="li">x</Card>
      </ul>,
    )
    expect(container.querySelector('li.kit-card')).toBeTruthy()
    rerender(<Card as="div">x</Card>)
    expect(container.querySelector('div.kit-card')).toBeTruthy()
  })

  it('records selected, interactive and padding as data attributes', () => {
    render(
      <Card selected interactive padding="sm">
        x
      </Card>,
    )
    const card = screen.getByRole('article')
    expect(card.getAttribute('data-selected')).toBe('true')
    expect(card.getAttribute('data-interactive')).toBe('true')
    expect(card.getAttribute('data-padding')).toBe('sm')
  })

  it('is not selected or interactive by default', () => {
    render(<Card>x</Card>)
    const card = screen.getByRole('article')
    expect(card.hasAttribute('data-selected')).toBe(false)
    expect(card.hasAttribute('data-interactive')).toBe(false)
  })

  it('CardTitle with asChild makes the child the heading link of the whole card', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle headingLevel={3} asChild>
            <a href="/campaigns/1">Senior Backend Engineer</a>
          </CardTitle>
          <CardActions>
            <button type="button">Move</button>
          </CardActions>
        </CardHeader>
      </Card>,
    )
    const heading = screen.getByRole('heading', { level: 3 })
    const link = within(heading).getByRole('link', { name: 'Senior Backend Engineer' })
    expect(link.className).toContain('kit-stretched')
    expect(link.className).toContain('kit-card__title')
    expect(link.getAttribute('dir')).toBe('auto')
    // The action is a sibling of the heading, not inside the link.
    expect(link.contains(screen.getByRole('button', { name: 'Move' }))).toBe(false)
  })

  it('CardTitle without asChild is plain text in a div (or a heading when asked)', () => {
    const { container, rerender } = render(<CardTitle>Plain</CardTitle>)
    expect(container.querySelector('div.kit-card__title')?.textContent).toBe('Plain')
    rerender(<CardTitle headingLevel={4}>Plain</CardTitle>)
    expect(screen.getByRole('heading', { level: 4, name: 'Plain' })).toBeTruthy()
  })

  it('CardActions reveal by default and can opt out', () => {
    const { container, rerender } = render(<CardActions>x</CardActions>)
    expect(container.querySelector('.kit-card__actions')?.getAttribute('data-reveal')).toBe('true')
    rerender(<CardActions reveal={false}>x</CardActions>)
    expect(container.querySelector('.kit-card__actions')?.hasAttribute('data-reveal')).toBe(false)
  })
})

describe('kit StretchedLink', () => {
  it('is an anchor with the stretched class', () => {
    render(<StretchedLink href="/x">Open</StretchedLink>)
    const link = screen.getByRole('link', { name: 'Open' })
    expect(link.getAttribute('href')).toBe('/x')
    expect(link.className).toContain('kit-stretched')
  })

  it('can wrap another element with asChild', () => {
    render(
      <StretchedLink asChild>
        <button type="button">Open drawer</button>
      </StretchedLink>,
    )
    const button = screen.getByRole('button', { name: 'Open drawer' })
    expect(button.className).toContain('kit-stretched')
  })
})
