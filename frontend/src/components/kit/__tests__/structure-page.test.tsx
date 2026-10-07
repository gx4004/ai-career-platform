import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button, Cluster, Lead, Page, PageHeader, Split, Stack, TabsList, TabsTrigger, Tabs } from '#/components/kit'

describe('kit Page', () => {
  it('is the main landmark and the skip-link target by default', () => {
    render(<Page>Content</Page>)
    const main = screen.getByRole('main')
    expect(main.id).toBe('main-content')
    expect(main.getAttribute('tabindex')).toBe('-1')
    expect(main.className).toContain('kit-page')
    expect(main.getAttribute('data-width')).toBe('default')
  })

  it('renders a plain div (no landmark, no id) when an ancestor already has main', () => {
    const { container } = render(<Page as="div" width="narrow">Content</Page>)
    expect(screen.queryByRole('main')).toBeNull()
    const page = container.firstElementChild as HTMLElement
    expect(page.tagName).toBe('DIV')
    expect(page.id).toBe('')
    expect(page.getAttribute('tabindex')).toBeNull()
    expect(page.getAttribute('data-width')).toBe('narrow')
  })

  it('lets the page keep its own id and merges className', () => {
    render(<Page id="custom" className="extra">x</Page>)
    const main = screen.getByRole('main')
    expect(main.id).toBe('custom')
    expect(main.className).toContain('extra')
  })
})

describe('kit PageHeader', () => {
  it('renders the title as the h1 inside a banner-free header', () => {
    render(<PageHeader title="Your applications" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Your applications' })).toBeTruthy()
  })

  it('can render the title as an h2', () => {
    render(<PageHeader headingLevel={2} title="Settings" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Settings' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('renders lead, meta (skipping missing items), actions and back slots', () => {
    const { container } = render(
      <PageHeader
        title="Senior Backend Engineer"
        lead="Everything for this application."
        meta={['Northwind Labs', null, false, '', 'Applied 6 days ago']}
        actions={<button type="button">Archive</button>}
        back={<a href="/campaigns">All applications</a>}
      />,
    )
    expect(screen.getByText('Everything for this application.')).toBeTruthy()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Northwind Labs', 'Applied 6 days ago'])
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'All applications' })).toBeTruthy()
    // Order in the DOM: back, then title, then actions.
    const text = container.textContent ?? ''
    expect(text.indexOf('All applications')).toBeLessThan(text.indexOf('Senior Backend Engineer'))
    expect(text.indexOf('Senior Backend Engineer')).toBeLessThan(text.indexOf('Archive'))
  })

  it('renders no meta list and no actions wrapper when they are empty', () => {
    const { container } = render(<PageHeader title="Dashboard" meta={[null, undefined]} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(container.querySelector('.kit-page-header__actions')).toBeNull()
    expect(container.querySelector('.kit-page-header__lead')).toBeNull()
  })

  it('places a tabs slot in the header and marks it so the header hairline gives way', () => {
    render(
      <Tabs defaultValue="a">
        <PageHeader
          title="Application"
          tabs={
            <TabsList aria-label="Sections">
              <TabsTrigger value="a">Overview</TabsTrigger>
              <TabsTrigger value="b">Documents</TabsTrigger>
            </TabsList>
          }
        />
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy()
    expect(document.querySelector('header')?.getAttribute('data-tabs')).toBe('true')
  })

  // consistency-F31: a rename form nested in the h1 took the heading's display tracking (Cancel and Save name
  // computed -0.08em) and made the page heading read "CancelSave name". The editor now replaces the visible title
  // beside the heading, never inside it, and the heading stays for assistive tech.
  it('renders a title editor in place of the visible title, outside the heading, and keeps the heading', () => {
    render(
      <PageHeader
        title="Senior Backend Engineer"
        titleEditor={
          <Cluster gap={2}>
            <input aria-label="Application name" defaultValue="Senior Backend Engineer" />
            <Button type="button">Save name</Button>
          </Cluster>
        }
      />,
    )
    const heading = screen.getByRole('heading', { level: 1, name: 'Senior Backend Engineer' })
    expect(heading.className).toContain('kit-sr-only')
    const field = screen.getByRole('textbox', { name: 'Application name' })
    expect(field.closest('h1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save name' }).closest('h1')).toBeNull()
    expect(field.closest('.kit-page-header__title-editor')).toBeTruthy()
  })

  it('shows the title as usual when the editor slot is empty', () => {
    const { container } = render(<PageHeader title="Senior Backend Engineer" titleEditor={null} />)
    expect(screen.getByRole('heading', { level: 1 }).className).not.toContain('kit-sr-only')
    expect(container.querySelector('.kit-page-header__title-editor')).toBeNull()
  })

  // jsdom has no layout but does run the cascade, so this reads the real stylesheets: a Button never takes on the
  // tracking of a heading it sits in, as control.css already guarantees for the field beside it.
  it('keeps a Button at normal tracking inside a display heading', () => {
    const style = document.createElement('style')
    style.textContent = ['page.css', 'button.css', 'control.css']
      .map((name) => readFileSync(path.resolve(__dirname, '../../../styles/kit', name), 'utf8'))
      .join('\n')
    document.head.append(style)
    try {
      render(
        <h1 className="kit-page-header__title" style={{ letterSpacing: '-1.2px' }}>
          <Button type="button">Save name</Button>
        </h1>,
      )
      expect(getComputedStyle(screen.getByRole('button', { name: 'Save name' })).letterSpacing).toBe('normal')
    } finally {
      style.remove()
    }
  })
})

describe('kit Lead', () => {
  it('is a paragraph with the lead class', () => {
    render(<Lead>The verdict.</Lead>)
    const lead = screen.getByText('The verdict.')
    expect(lead.tagName).toBe('P')
    expect(lead.className).toContain('kit-lead')
  })
})

describe('kit Split', () => {
  it('renders the main column and a named rail landmark', () => {
    render(
      <Split rail={<p>Rail content</p>} railLabel="Summary">
        <p>Main content</p>
      </Split>,
    )
    const rail = screen.getByRole('complementary', { name: 'Summary' })
    expect(within(rail).getByText('Rail content')).toBeTruthy()
    expect(screen.getByText('Main content').closest('.kit-split__main')).toBeTruthy()
    expect(rail.closest('.kit-split__layout')).toBeTruthy()
  })

  it('records the sticky and rail-first options as data attributes', () => {
    const { container } = render(
      <Split rail="r" railLabel="Details" stickyRail railFirst>
        m
      </Split>,
    )
    const split = container.firstElementChild as HTMLElement
    expect(split.getAttribute('data-sticky')).toBe('true')
    expect(split.getAttribute('data-rail-first')).toBe('true')
  })

  it('leaves them off by default', () => {
    const { container } = render(
      <Split rail="r" railLabel="Details">
        m
      </Split>,
    )
    const split = container.firstElementChild as HTMLElement
    expect(split.hasAttribute('data-sticky')).toBe(false)
    expect(split.hasAttribute('data-rail-first')).toBe(false)
  })
})

describe('kit Stack and Cluster', () => {
  it('Stack carries its gap', () => {
    const { container } = render(<Stack gap={6}>x</Stack>)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-gap')).toBe('6')
  })

  it('Cluster carries gap, alignment, justification and nowrap', () => {
    const { container } = render(
      <Cluster gap={3} align="baseline" justify="between" nowrap>
        x
      </Cluster>,
    )
    const cluster = container.firstElementChild as HTMLElement
    expect(cluster.getAttribute('data-gap')).toBe('3')
    expect(cluster.getAttribute('data-align')).toBe('baseline')
    expect(cluster.getAttribute('data-justify')).toBe('between')
    expect(cluster.getAttribute('data-nowrap')).toBe('true')
  })
})

describe('kit PageHeader mark and Lead size', () => {
  it('puts a mark before the title block, hidden from assistive tech, and adds no wrapper without one', () => {
    const { container, rerender } = render(<PageHeader title="Resume Analyzer" />)
    expect(container.querySelector('.kit-page-header__identity')).toBeNull()
    rerender(<PageHeader title="Resume Analyzer" mark={<span data-testid="tile" />} />)
    const identity = container.querySelector('.kit-page-header__identity') as HTMLElement
    expect(identity).toBeTruthy()
    const mark = identity.querySelector('.kit-page-header__mark') as HTMLElement
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(within(mark).getByTestId('tile')).toBeTruthy()
    expect(identity.querySelector('.kit-page-header__text')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Resume Analyzer' })).toBeTruthy()
  })

  it('lead is the 15px body line by default and the 19px large lead when asked (auth pages)', () => {
    const { container, rerender } = render(<PageHeader title="Sign in" lead="Pick up where you left off." />)
    const lead = () => container.querySelector('.kit-page-header__lead') as HTMLElement
    expect(lead().hasAttribute('data-size')).toBe(false)
    rerender(<PageHeader title="Sign in" lead="Pick up where you left off." leadSize="lg" />)
    expect(lead().getAttribute('data-size')).toBe('lg')
    expect(lead().textContent).toBe('Pick up where you left off.')
    // Without a lead the size has nothing to apply to.
    rerender(<PageHeader title="Sign in" leadSize="lg" />)
    expect(container.querySelector('.kit-page-header__lead')).toBeNull()
  })

  it('sets the large lead at 19px / 1.45 with 8px more air under the title, from tokens', () => {
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/page.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.match(/\.kit-page-header__lead\[data-size='lg'\]\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/font-size:\s*var\(--fs-body-l\)/)
    expect(rule).toMatch(/line-height:\s*var\(--lh-body-l\)/)
    expect(rule).toMatch(/margin-block-start:\s*var\(--s2\)/)
    const theme = readFileSync(path.resolve(__dirname, '../../../styles/theme.css'), 'utf8')
    expect(theme).toMatch(/--fs-body-l:\s*1\.1875rem/)
  })

  it('Lead is md by default and xl for a report hero', () => {
    const { container, rerender } = render(<Lead>Verdict.</Lead>)
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-size')).toBe(false)
    rerender(<Lead size="xl">Verdict.</Lead>)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-size')).toBe('xl')
  })
})
