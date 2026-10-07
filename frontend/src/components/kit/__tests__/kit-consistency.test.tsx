import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { List, ListHeading, Row, RowBody, RowTitle, Skeleton, Table, type TableColumn } from '#/components/kit'

const css = (name: string) =>
  readFileSync(path.resolve(__dirname, '../../../styles/kit', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('consistency sign-off: kit additions', () => {
  it('ListHeading is a real heading inside the List, not a Row (no hover, no number)', () => {
    render(
      <List aria-label="Runs">
        <ListHeading>Today</ListHeading>
        <Row>
          <RowBody>
            <RowTitle>Resume run</RowTitle>
          </RowBody>
        </Row>
      </List>,
    )
    const heading = screen.getByRole('heading', { level: 3, name: 'Today' })
    const item = heading.closest('li')!
    expect(item.className).toBe('kit-list-heading')
    expect(item.classList.contains('kit-row')).toBe(false)
    expect(within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('ListHeading takes another heading level', () => {
    render(
      <List aria-label="Days">
        <ListHeading headingLevel={2}>Yesterday</ListHeading>
      </List>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Yesterday' })).toBeTruthy()
  })

  it('ListHeading uses the display face at 20/800 on the stone-soft strip with a 2px --line rule', () => {
    const source = css('row.css')
    const title = source.match(/\.kit-list-heading__title \{([^}]*)\}/)![1]
    expect(title).toMatch(/font-family:\s*var\(--font-display\)/)
    expect(title).toMatch(/font-size:\s*var\(--fs-title\)/)
    expect(title).toMatch(/font-weight:\s*var\(--fw-black\)/)
    const strip = source.match(/\.kit-list-heading \{([^}]*)\}/)![1]
    expect(strip).toMatch(/background:\s*var\(--stone-soft\)/)
    expect(strip).toMatch(/border-bottom:\s*var\(--bw\) solid var\(--line\)/)
  })

  it('the narrow-list body placement is :where()-weighted, so a page layout of its own still wins', () => {
    const narrow = css('row.css').match(/@container kit-list \(max-width: 31\.9375rem\) \{([\s\S]*?)\n\}/)![1]
    expect(narrow).toMatch(/\.kit-row:where\(:has\(> \.kit-row__actions\):not\(:has\(> \.kit-row__meta\)\)\) > \.kit-row__body \{/)
    expect(narrow).not.toMatch(/\.kit-row:has\(> \.kit-row__actions\):not\(:has\(> \.kit-row__meta\)\) > \.kit-row__body/)
  })

  it('a row skeleton draws `lines` subtitle bars and the trailing shape it is given', () => {
    const { container } = render(
      <>
        <Skeleton variant="row" lines={2} data-testid="two" />
        <Skeleton variant="row" lines={3} trailing="button" data-testid="button" />
        <Skeleton variant="row" trailing="pips" data-testid="pips" />
        <Skeleton variant="row" density="compact" data-testid="compact" />
      </>,
    )
    const rowOf = (id: string) => container.querySelector(`[data-testid="${id}"] .kit-skeleton__row`)!
    const metaLines = (id: string) => rowOf(id).querySelectorAll('.kit-skeleton__line[data-size="meta"]').length
    expect(metaLines('two')).toBe(2)
    expect(metaLines('button')).toBe(3)
    expect(metaLines('pips')).toBe(1)
    expect(metaLines('compact')).toBe(0)
    expect(rowOf('button').getAttribute('data-trailing')).toBe('button')
    expect(rowOf('button').querySelector('.kit-skeleton__trail--button')).toBeTruthy()
    expect(rowOf('pips').querySelector('.kit-skeleton__trail--pips')).toBeTruthy()
    expect(rowOf('two').getAttribute('data-trailing')).toBeNull()
    expect(rowOf('two').querySelector('.kit-skeleton__trail')).toBeTruthy()
  })

  it('narrowLines adds subtitle bars that show only on a narrow List (and lines past it only on a wide one)', () => {
    const { container } = render(
      <>
        <Skeleton variant="row" lines={2} narrowLines={4} data-testid="more" />
        <Skeleton variant="row" lines={3} narrowLines={1} data-testid="fewer" />
      </>,
    )
    const only = (id: string) =>
      [...container.querySelectorAll(`[data-testid="${id}"] .kit-skeleton__line[data-size="meta"]`)].map((line) => line.getAttribute('data-only'))
    expect(only('more')).toEqual([null, null, 'narrow', 'narrow'])
    expect(only('fewer')).toEqual([null, 'wide', 'wide'])
    expect(css('skeleton.css')).toMatch(/@container kit-list \(max-width: 31\.9375rem\) \{\s*\.kit-skeleton__line\[data-only='narrow'\] \{\s*display: flex;/)
  })

  it('a row skeleton with trailing="none" draws no trailing bar', () => {
    const { container } = render(<Skeleton variant="row" trailing="none" />)
    expect(container.querySelector('.kit-skeleton__trail')).toBeNull()
  })

  type Item = { id: string; name: string }
  const columns: Array<TableColumn<Item>> = [
    { id: 'name', header: 'Name', primary: true, cell: (item) => item.name },
    { id: 'other', header: 'Other', cell: (item) => item.name },
  ]

  it('Table stackBelow sets the stacking width on the wrap; the container query reads it in em', () => {
    const { container } = render(<Table caption="Sources" columns={columns} rows={[]} getRowId={(item) => item.id} stackBelow={56} />)
    const wrap = container.querySelector('.kit-table-wrap') as HTMLElement
    expect(wrap.style.getPropertyValue('--kit-table-stack-below')).toBe('56')
    const source = css('table.css')
    expect(source).toMatch(/@container kit-table \(max-width: 39\.9375em\) \{/)
    expect(source).toMatch(/font-size:\s*calc\(1rem \* var\(--kit-table-stack-below, 40\) \/ 40\)/)
  })

  it('Table without stackBelow keeps the default (no inline threshold)', () => {
    const { container } = render(<Table caption="Users" columns={columns} rows={[]} getRowId={(item) => item.id} />)
    expect((container.querySelector('.kit-table-wrap') as HTMLElement).style.getPropertyValue('--kit-table-stack-below')).toBe('')
  })

  it('Table loadingLines draws a name and a sub-line placeholder in each text cell', () => {
    const { container } = render(
      <Table caption="Runs" columns={columns} rows={[]} getRowId={(item) => item.id} loading loadingRows={1} loadingLines={2} />,
    )
    const cells = container.querySelectorAll('tbody .kit-table__cell')
    expect(cells).toHaveLength(2)
    for (const cell of cells) expect(cell.querySelectorAll('.kit-skeleton__line')).toHaveLength(2)
  })

  it('a loading actions column draws a button-sized placeholder', () => {
    const withActions: Array<TableColumn<Item>> = [...columns, { id: 'act', header: 'Actions', hideHeader: true, cell: () => null }]
    const { container } = render(<Table caption="Users" columns={withActions} rows={[]} getRowId={(item) => item.id} loading loadingRows={1} />)
    const block = container.querySelector('tbody .kit-table__cell[data-actions] .kit-skeleton--block') as HTMLElement
    expect(block.style.blockSize).toBe('var(--kit-h-sm)')
  })
})
