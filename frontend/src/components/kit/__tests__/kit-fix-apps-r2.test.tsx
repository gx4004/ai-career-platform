import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Disclosure, FitStamp, Panel, Section, Table } from '#/components/kit'

// Sign-off round 2, applications and Discover: the kit-level fixes behind those pages.

const dir = path.resolve(__dirname, '../../../styles') + path.sep
const css = (name: string) => readFileSync(dir + name, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const squash = (text: string) => text.replace(/\s+/g, ' ')

describe('flush lists with an overlay action (the Tasks panel)', () => {
  it('keep one sm icon button of room at the row end, at the weight of the flush rule that zeroes the padding', () => {
    const row = squash(css('kit/row.css'))
    expect(row).toContain(
      ".kit-list[data-flush]:not([data-framed]) > .kit-row:has(> .kit-row__actions[data-placement='overlay']) { padding-inline-end: calc(var(--control-sm) + var(--kit-row-overlay-inset, var(--s2))); }",
    )
  })
})

describe('Disclosure heading a Panel', () => {
  it('rounds the hover fill to the panel corners: top for the first row, bottom for a closed last row', () => {
    const disclosure = squash(css('kit/disclosure.css'))
    expect(disclosure).toMatch(
      /:first-child > \.kit-disclosure__heading > \.kit-disclosure__trigger \{ border-start-start-radius: calc\(var\(--r-lg\) - var\(--bw\)\); border-start-end-radius: calc\(var\(--r-lg\) - var\(--bw\)\); \}/,
    )
    expect(disclosure).toMatch(
      /:last-child > \.kit-disclosure__heading > \.kit-disclosure__trigger\[data-state='closed'\] \{ border-end-start-radius: calc\(var\(--r-lg\) - var\(--bw\)\); border-end-end-radius: calc\(var\(--r-lg\) - var\(--bw\)\); \}/,
    )
  })

  it('ruled draws the PanelHeader ink rule under the open row only', () => {
    const disclosure = squash(css('kit/disclosure.css'))
    expect(disclosure).toContain(
      ".kit-disclosure--section[data-ruled] > .kit-disclosure__heading > .kit-disclosure__trigger[data-state='open'] { border-block-end: var(--bw) solid var(--ink); }",
    )
    render(
      <Panel>
        <Disclosure title="What's working" ruled defaultOpen headingLevel={2}>
          <p>Body</p>
        </Disclosure>
        <Disclosure title="Inline" variant="inline" ruled>
          <p>Body</p>
        </Disclosure>
      </Panel>,
    )
    const ruled = screen.getByRole('button', { name: "What's working" }).closest('.kit-disclosure')
    expect(ruled?.hasAttribute('data-ruled')).toBe(true)
    // An inline disclosure has no row to rule.
    expect(screen.getByRole('button', { name: 'Inline' }).closest('.kit-disclosure')?.hasAttribute('data-ruled')).toBe(false)
  })
})

describe('FitStamp "100%"', () => {
  it('starts the smaller three-digit numeral lower, so it centres on the tile like the two-digit figures', () => {
    const stamps = css('kit/stamps.css')
    const md3 = stamps.match(/\.kit-fit-stamp\[data-digits='3'\]\s*\{([^}]*)\}/)![1]
    expect(md3).toMatch(/padding-block-start:\s*13\.5px/)
    const sm3 = stamps.match(/\.kit-fit-stamp\[data-size='sm'\]\[data-digits='3'\]\s*\{([^}]*)\}/)![1]
    expect(sm3).toMatch(/padding-block-start:\s*14px/)
    render(<FitStamp value={100} />)
    expect(screen.getByRole('img', { name: '100% fit' }).getAttribute('data-digits')).toBe('3')
  })
})

describe('Table roomy column', () => {
  it('marks the cells of a roomy column, which keep 12px from the row rules', () => {
    expect(squash(css('kit/table.css'))).toContain('.kit-table__cell[data-roomy] { padding-block: var(--s3); }')
    render(
      <Table
        caption="Fits"
        columns={[
          { id: 'role', header: 'Role', primary: true, cell: (row: { id: string; fit: number }) => row.id },
          { id: 'fit', header: 'Skills fit', roomy: true, cell: (row: { id: string; fit: number }) => <FitStamp value={row.fit} size="sm" /> },
        ]}
        rows={[{ id: 'a', fit: 88 }]}
        getRowId={(row) => row.id}
      />,
    )
    const stamp = screen.getByRole('img', { name: '88% fit' })
    expect(stamp.closest('td')?.getAttribute('data-roomy')).toBe('true')
    expect(screen.getByRole('rowheader', { name: 'a' }).getAttribute('data-roomy')).toBeNull()
  })

  it('keeps a stacked head of sort buttons on one scrolling line instead of wrapping onto two', () => {
    const table = squash(css('kit/table.css'))
    expect(table).toMatch(/\.kit-table-wrap\[data-stack\] \.kit-table__head-row \{ display: flex; flex-wrap: nowrap;[^}]*overflow-x: auto;/)
    // consistency-F26 added position: static (a sticky header cell would paint over the strip's edge cue).
    expect(table).toMatch(/\.kit-table-wrap\[data-stack\] \.kit-table__head-row > \.kit-table__th \{[^}]*flex: none;/)
  })
})

describe('Field help', () => {
  it('balances a wrapped hint instead of orphaning its last word', () => {
    expect(css('kit/field.css')).toMatch(/\.kit-field__help \{[^}]*text-wrap: pretty;/)
  })
})

describe('Section size card', () => {
  it('sets a narrow column heading in the h-card face, display 20/800', () => {
    render(
      <Section title="Interviewing" size="card">
        <p>Body</p>
      </Section>,
    )
    expect(screen.getByRole('heading', { name: 'Interviewing' }).closest('.kit-section')?.getAttribute('data-size')).toBe('card')
    expect(squash(css('kit/section.css'))).toContain(
      ".kit-section[data-size='card'] > .kit-section__head .kit-section__title { font-size: var(--fs-title); line-height: 1.1; letter-spacing: var(--ls-title); }",
    )
  })
})
