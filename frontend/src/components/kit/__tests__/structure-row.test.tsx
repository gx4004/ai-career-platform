import { readFileSync } from 'node:fs'
import path from 'node:path'
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

  it('boxed="end" records a rule under the last row only (a list right under its own heading)', () => {
    render(<List aria-label="a" framed={false} boxed="end" />)
    expect(screen.getByRole('list').getAttribute('data-boxed')).toBe('end')
  })

  it('flush is recorded on an unframed list; plain lists are not flush', () => {
    const { rerender } = render(<List aria-label="a" framed={false} flush />)
    expect(screen.getByRole('list').getAttribute('data-flush')).toBe('true')
    rerender(<List aria-label="a" framed={false} />)
    expect(screen.getByRole('list').hasAttribute('data-flush')).toBe(false)
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

  it('floats revealed actions over the row only when asked (placement="overlay"), never an always-visible group', () => {
    const { container, rerender } = render(<RowActions>x</RowActions>)
    expect(container.querySelector('.kit-row__actions')?.hasAttribute('data-placement')).toBe(false)
    rerender(<RowActions placement="overlay">x</RowActions>)
    expect(container.querySelector('.kit-row__actions')?.getAttribute('data-placement')).toBe('overlay')
    rerender(<RowActions placement="overlay" reveal={false}>x</RowActions>)
    expect(container.querySelector('.kit-row__actions')?.hasAttribute('data-placement')).toBe(false)
  })

  it('drops always-visible actions under the text on a narrow list when asked (placement="below")', () => {
    const { container, rerender } = render(<RowActions reveal={false} placement="below">x</RowActions>)
    expect(container.querySelector('.kit-row__actions')?.getAttribute('data-placement')).toBe('below')
    rerender(<RowActions reveal={false}>x</RowActions>)
    expect(container.querySelector('.kit-row__actions')?.hasAttribute('data-placement')).toBe(false)
    // Only a narrow list moves them: the rule lives in the kit-list container query.
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/row.css'), 'utf8')
    const narrow = css.slice(css.indexOf('@container kit-list (max-width: 31.9375rem)'))
    expect(narrow).toMatch(/\.kit-row > \.kit-row__actions\[data-placement='below'\]\s*\{[^}]*grid-row:\s*3/)
  })

  it('drops the meta under the text on a narrow list when asked (RowMeta placement="below")', () => {
    const { container, rerender } = render(<RowMeta placement="below">x</RowMeta>)
    expect(container.querySelector('.kit-row__meta')?.getAttribute('data-placement')).toBe('below')
    rerender(<RowMeta>x</RowMeta>)
    expect(container.querySelector('.kit-row__meta')?.hasAttribute('data-placement')).toBe(false)
    // Only a narrow list moves it (the kit-list container query); wide lists keep the meta at the row end.
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/row.css'), 'utf8')
    const narrow = css.slice(css.indexOf('@container kit-list (max-width: 31.9375rem)'))
    expect(narrow).toMatch(/\.kit-row > \.kit-row__meta\[data-placement='below'\]\s*\{[^}]*grid-row:\s*2/)
    expect(css.slice(0, css.indexOf('@container kit-list (max-width: 31.9375rem)'))).not.toMatch(/__meta\[data-placement='below'\]/)
  })

  it('centres a one-line body against the 44px actions on a narrow list when the row has no meta', () => {
    // Without this the body sits in grid row 1 of 2 and the spare actions height leaves the title floating high.
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/row.css'), 'utf8')
    const narrow = css.slice(css.indexOf('@container kit-list (max-width: 31.9375rem)'))
    // The selector is :where()-weighted (consistency-F01): a page's own stacked layout must still win over it.
    expect(narrow).toMatch(
      /\.kit-row:where\(:has\(> \.kit-row__actions\):not\(:has\(> \.kit-row__meta\)\)\) > \.kit-row__body\s*\{[^}]*grid-row:\s*1 \/ span 2;[^}]*align-self:\s*center/,
    )
  })

  it('keeps a narrow row\'s actions at the top of a multi-line row, not centred over the whole text (history-profile-F39)', () => {
    // A one-line row is unchanged (its body spans both grid rows, centred on the actions' height); a five-line
    // fact keeps Edit and Delete beside its title instead of floating halfway down the row.
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/row.css'), 'utf8')
    const narrow = css.slice(css.indexOf('@container kit-list (max-width: 31.9375rem)'))
    expect(narrow).toMatch(/\.kit-row > \.kit-row__actions\s*\{[^}]*grid-row:\s*1 \/ span 2;[^}]*align-self:\s*start/)
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

describe('kit List framed and RowTitle size', () => {
  it('is framed by default, and framed={false} drops the frame for a list inside a Panel', () => {
    const { container, rerender } = render(
      <List aria-label="Jobs">
        <Row />
      </List>,
    )
    const list = () => container.firstElementChild as HTMLElement
    expect(list().getAttribute('data-framed')).toBe('true')
    rerender(
      <List aria-label="Jobs" framed={false}>
        <Row />
      </List>,
    )
    expect(list().hasAttribute('data-framed')).toBe(false)
  })

  it('RowTitle is md by default and lg for a comfortable match row, with or without a heading', () => {
    render(
      <List aria-label="Jobs">
        <Row>
          <RowBody>
            <RowTitle>Plain</RowTitle>
            <RowTitle size="lg" headingLevel={3}>
              Match
            </RowTitle>
          </RowBody>
        </Row>
      </List>,
    )
    expect(screen.getByText('Plain').hasAttribute('data-size')).toBe(false)
    expect(screen.getByRole('heading', { level: 3, name: 'Match' }).getAttribute('data-size')).toBe('lg')
  })

  it('RowTitle is bold by default; semibold and regular set a sentence-length title lighter', () => {
    render(
      <List aria-label="Notes">
        <Row>
          <RowBody>
            <RowTitle>Bold</RowTitle>
            <RowTitle weight="semibold">Strength</RowTitle>
            <RowTitle weight="regular" headingLevel={3}>
              A full sentence of advice
            </RowTitle>
          </RowBody>
        </Row>
      </List>,
    )
    expect(screen.getByText('Bold').hasAttribute('data-weight')).toBe(false)
    expect(screen.getByText('Strength').getAttribute('data-weight')).toBe('semibold')
    expect(screen.getByRole('heading', { level: 3 }).getAttribute('data-weight')).toBe('regular')
  })

  it('RowSubtitle is the 13px meta line by default and 15px body text with size="lg"', () => {
    render(
      <List aria-label="Next">
        <Row>
          <RowBody>
            <RowSubtitle>Quiet</RowSubtitle>
            <RowSubtitle size="lg">A sentence under a display title</RowSubtitle>
          </RowBody>
        </Row>
      </List>,
    )
    expect(screen.getByText('Quiet').hasAttribute('data-size')).toBe(false)
    expect(screen.getByText('A sentence under a display title').getAttribute('data-size')).toBe('lg')
  })

  // consistency-F17: a run's headline in a 280px rail beside a score pill had ~134px, so one line said "Strong foundation: …".
  it('RowSubtitle keeps one line in a clamped row; lines={2} lets a sentence take two before the ellipsis', () => {
    render(
      <List aria-label="Rail">
        <Row overflow="clamp">
          <RowBody>
            <RowSubtitle>Oct 6, 2:13 PM</RowSubtitle>
            <RowSubtitle lines={2}>Strong foundation: 2 bullets carry real numbers</RowSubtitle>
          </RowBody>
        </Row>
      </List>,
    )
    expect(screen.getByText('Oct 6, 2:13 PM').hasAttribute('data-lines')).toBe(false)
    expect(screen.getByText(/Strong foundation/).getAttribute('data-lines')).toBe('2')
    // The two-line rule comes after the clamp/truncate one-line rules at the same weight, so it wins in either mode.
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/row.css'), 'utf8')
    const twoLines = css.search(/\.kit-row \.kit-row__subtitle\[data-lines='2'\]\s*\{[^}]*-webkit-line-clamp:\s*2/)
    expect(twoLines).toBeGreaterThan(css.indexOf(".kit-row[data-overflow='clamp'] .kit-row__subtitle"))
    expect(twoLines).toBeGreaterThan(css.indexOf(".kit-row[data-overflow='truncate'] :is(.kit-row__title, .kit-row__subtitle)"))
  })

  // Sign-off consistency-F23: a score pill on the title's own line, so the headline under the title keeps the body's
  // full width (as RowMeta it took a column the height of the row and squeezed the headline to ~150px in a rail).
  it('RowTitle aside puts a short fact at the end of the title line, inside the body, and keeps the link the title', () => {
    render(
      <List aria-label="Runs">
        <Row overflow="clamp">
          <RowBody>
            <RowTitle asChild aside={<span data-testid="pill" aria-hidden="true">89/100</span>}>
              <a href="/r/1">Oct 6, 2:13 PM</a>
            </RowTitle>
            <RowSubtitle lines={2}>Strong foundation</RowSubtitle>
          </RowBody>
        </Row>
      </List>,
    )
    const link = screen.getByRole('link', { name: 'Oct 6, 2:13 PM' })
    const line = link.parentElement as HTMLElement
    expect(line.className).toBe('kit-row__title-line')
    expect(line.parentElement?.className).toContain('kit-row__body')
    expect(link.className).toContain('kit-row__title')
    expect(screen.getByTestId('pill').parentElement?.className).toBe('kit-row__title-aside')
    const rowCss = readFileSync(path.resolve(__dirname, '../../../styles/kit/row.css'), 'utf8')
    expect(rowCss).toMatch(/\.kit-row__title-line \{[^}]*display:\s*flex;/)
    expect(rowCss).toMatch(/\.kit-row__title-aside \{[^}]*flex:\s*none;/)
  })

  it('RowTitle without aside renders the title alone (no wrapper)', () => {
    render(
      <List aria-label="Runs">
        <Row>
          <RowBody>
            <RowTitle>Plain</RowTitle>
          </RowBody>
        </Row>
      </List>,
    )
    expect(screen.getByText('Plain').parentElement?.className).toContain('kit-row__body')
  })
})
