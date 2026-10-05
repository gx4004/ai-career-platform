import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Cluster, Lead, Page, PageHeader, Split, Stack, TabsList, TabsTrigger, Tabs } from '#/components/kit'

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

  it('Lead is md by default and xl for a report hero', () => {
    const { container, rerender } = render(<Lead>Verdict.</Lead>)
    expect((container.firstElementChild as HTMLElement).hasAttribute('data-size')).toBe(false)
    rerender(<Lead size="xl">Verdict.</Lead>)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-size')).toBe('xl')
  })
})
