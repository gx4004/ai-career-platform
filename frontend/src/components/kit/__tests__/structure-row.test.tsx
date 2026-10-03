import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Button,
  List,
  MetaRow,
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowMeta,
  RowReveal,
  RowSubtitle,
  RowTitle,
  Skeleton,
} from '#/components/kit'

describe('kit List and Row', () => {
  it('renders a list of list items, with the list role kept explicit', () => {
    render(
      <List aria-label="Jobs">
        <Row>
          <RowBody>
            <RowTitle>First</RowTitle>
          </RowBody>
        </Row>
        <Row>
          <RowBody>
            <RowTitle>Second</RowTitle>
          </RowBody>
        </Row>
      </List>,
    )
    const list = screen.getByRole('list', { name: 'Jobs' })
    expect(list.tagName).toBe('UL')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  it('numbered renders an ol and records it', () => {
    render(
      <List numbered aria-label="Fix first">
        <Row>
          <RowBody>
            <RowTitle>One</RowTitle>
          </RowBody>
        </Row>
      </List>,
    )
    const list = screen.getByRole('list', { name: 'Fix first' })
    expect(list.tagName).toBe('OL')
    expect(list.getAttribute('data-numbered')).toBe('true')
  })

  it('boxed is recorded; plain lists are not boxed', () => {
    const { rerender } = render(<List aria-label="a" boxed />)
    expect(screen.getByRole('list').getAttribute('data-boxed')).toBe('true')
    rerender(<List aria-label="a" />)
    expect(screen.getByRole('list').hasAttribute('data-boxed')).toBe(false)
  })

  it('Row is comfortable, wrapping, unselected and not interactive by default', () => {
    render(
      <List aria-label="x">
        <Row>x</Row>
      </List>,
    )
    const row = screen.getByRole('listitem')
    expect(row.getAttribute('data-density')).toBe('comfortable')
    expect(row.getAttribute('data-overflow')).toBe('wrap')
    expect(row.hasAttribute('data-selected')).toBe(false)
    expect(row.hasAttribute('data-interactive')).toBe(false)
  })

  it('Row records density, overflow, selected and interactive', () => {
    render(
      <List aria-label="x">
        <Row density="compact" overflow="truncate" selected interactive>
          x
        </Row>
      </List>,
    )
    const row = screen.getByRole('listitem')
    expect(row.getAttribute('data-density')).toBe('compact')
    expect(row.getAttribute('data-overflow')).toBe('truncate')
    expect(row.getAttribute('data-selected')).toBe('true')
    expect(row.getAttribute('data-interactive')).toBe('true')
  })

  it('Row can stand alone as a div or an article', () => {
    const { container, rerender } = render(<Row as="div">x</Row>)
    expect(container.querySelector('div.kit-row')).toBeTruthy()
    rerender(<Row as="article">x</Row>)
    expect(container.querySelector('article.kit-row')).toBeTruthy()
  })

  it('forwards the ref and native props, and merges className', () => {
    let node: HTMLElement | null = null
    render(
      <List aria-label="x">
        <Row
          ref={(element) => {
            node = element
          }}
          className="extra"
          data-testid="row"
        >
          x
        </Row>
      </List>,
    )
    expect(node).toBe(screen.getByTestId('row'))
    expect(screen.getByTestId('row').className).toContain('extra')
  })

  it('lays out leading, body (title and subtitle), meta and actions in the order given', () => {
    const { container } = render(
      <List aria-label="x">
        <Row>
          <RowLeading>L</RowLeading>
          <RowBody>
            <RowTitle>Title</RowTitle>
            <RowSubtitle>
              <MetaRow>
                <span>Company</span>
                <span>Remote</span>
              </MetaRow>
            </RowSubtitle>
          </RowBody>
          <RowMeta>Sep 29</RowMeta>
          <RowActions>
            <Button size="sm">Open</Button>
          </RowActions>
        </Row>
      </List>,
    )
    const parts = [...container.querySelector('.kit-row')!.children].map((node) => node.className)
    expect(parts).toEqual(['kit-row__leading', 'kit-row__body', 'kit-row__meta', 'kit-row__actions'])
    expect(container.querySelector('.kit-row__title')?.textContent).toBe('Title')
  })

  it('titles and subtitles are dir=auto, so user text in any script truncates at its own end', () => {
    const { container } = render(
      <Row as="div">
        <RowTitle>مهندس</RowTitle>
        <RowSubtitle>شركة</RowSubtitle>
      </Row>,
    )
    expect(container.querySelector('.kit-row__title')?.getAttribute('dir')).toBe('auto')
    expect(container.querySelector('.kit-row__subtitle')?.getAttribute('dir')).toBe('auto')
  })
})

describe('kit RowTitle', () => {
  it('can be a heading', () => {
    render(<RowTitle headingLevel={3}>Senior Backend Engineer</RowTitle>)
    expect(screen.getByRole('heading', { level: 3, name: 'Senior Backend Engineer' })).toBeTruthy()
  })

  it('with asChild the link or button is the title and the whole-row link', () => {
    render(
      <Row as="div">
        <RowBody>
          <RowTitle asChild>
            <a href="/runs/1">Resume for Northwind</a>
          </RowTitle>
        </RowBody>
        <RowActions>
          <Button iconOnly size="sm" variant="ghost" aria-label="Delete run">
            x
          </Button>
        </RowActions>
      </Row>,
    )
    const link = screen.getByRole('link', { name: 'Resume for Northwind' })
    expect(link.className).toContain('kit-stretched')
    expect(link.className).toContain('kit-row__title')
    expect(link.contains(screen.getByRole('button', { name: 'Delete run' }))).toBe(false)
  })

  it('wraps an asChild link in the heading when headingLevel is given', () => {
    render(
      <RowTitle headingLevel={3} asChild>
        <button type="button">Open job</button>
      </RowTitle>,
    )
    const heading = screen.getByRole('heading', { level: 3 })
    expect(within(heading).getByRole('button', { name: 'Open job' }).className).toContain('kit-stretched')
  })
})

describe('kit RowActions and RowReveal', () => {
  it('reveal on hover by default, and can stay visible', () => {
    const { container, rerender } = render(<RowActions>x</RowActions>)
    expect(container.querySelector('.kit-row__actions')?.getAttribute('data-reveal')).toBe('true')
    rerender(<RowActions reveal={false}>x</RowActions>)
    expect(container.querySelector('.kit-row__actions')?.hasAttribute('data-reveal')).toBe(false)
  })

  it('RowReveal wraps secondary actions inside an always-visible group', () => {
    const { container } = render(
      <RowActions reveal={false}>
        <Button size="sm">Add</Button>
        <RowReveal>
          <Button size="sm" variant="ghost">
            More
          </Button>
        </RowReveal>
      </RowActions>,
    )
    expect(container.querySelector('.kit-row__actions')?.hasAttribute('data-reveal')).toBe(false)
    expect(container.querySelector('.kit-row__reveal')?.textContent).toBe('More')
  })

  it('keeps every action reachable by keyboard (they are hidden with opacity, never removed)', () => {
    render(
      <RowActions>
        <Button size="sm">Rename</Button>
      </RowActions>,
    )
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
  })
})

describe('kit Skeleton rows in a List', () => {
  it('renders count rows as hidden list items matching the density', () => {
    render(
      <List aria-label="Jobs" aria-busy="true">
        <Skeleton variant="row" as="li" count={3} density="compact" leading />
      </List>,
    )
    const rows = document.querySelectorAll('li.kit-skeleton__row')
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.getAttribute('aria-hidden')).toBe('true')
      expect(row.getAttribute('data-density')).toBe('compact')
      expect(row.querySelector('.kit-skeleton__leading')).toBeTruthy()
    }
    // A compact row has one text line; a comfortable one has two.
    expect(rows[0].querySelectorAll('.kit-skeleton__line')).toHaveLength(1)
  })
})
