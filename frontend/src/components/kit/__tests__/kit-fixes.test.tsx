import { createRef } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CardTitle,
  DateField,
  ErrorState,
  Input,
  Notice,
  Pagination,
  RowTitle,
  Select,
  Skeleton,
  Table,
  Toolbar,
  type TableColumn,
} from '#/components/kit'

/** Every Button the kit renders by itself must be type="button": inside a <form> a dismiss or a Previous must not submit it. */
describe('kit-owned buttons never submit a surrounding form', () => {
  function inForm(node: React.ReactNode) {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const view = render(<form onSubmit={onSubmit}>{node}</form>)
    return { onSubmit, view }
  }

  it('Notice dismiss', () => {
    const onDismiss = vi.fn()
    const { onSubmit } = inForm(<Notice onDismiss={onDismiss}>Saved.</Notice>)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ErrorState retry', () => {
    const onRetry = vi.fn()
    const { onSubmit } = inForm(<ErrorState title="Could not load" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Pagination Previous, Next and page buttons', () => {
    const onPageChange = vi.fn()
    const { onSubmit } = inForm(<Pagination page={3} pageCount={9} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 9' }))
    expect(onPageChange).toHaveBeenCalledTimes(3)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Toolbar Clear filters', () => {
    const onClear = vi.fn()
    const { onSubmit } = inForm(
      <Toolbar
        filters={
          <Select aria-label="Company">
            <option>All</option>
          </Select>
        }
        activeFilters={1}
        onClearFilters={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Toolbar Filters trigger and the sheet buttons (Clear filters, Done)', async () => {
    const onClear = vi.fn()
    const { onSubmit } = inForm(
      <Toolbar
        filters={
          <Select aria-label="Company">
            <option>All</option>
          </Select>
        }
        activeFilters={1}
        onClearFilters={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    for (const button of within(dialog).getAllByRole('button')) expect(button.getAttribute('type')).toBe('button')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('Toolbar sheet shows what each control filters', () => {
  it('turns a bare aria-label into a visible label inside the sheet, leaving self-labelled controls alone', async () => {
    render(
      <Toolbar
        filters={
          <>
            <Select aria-label="Company" defaultValue="n">
              <option value="n">Northwind Labs</option>
            </Select>
            <Select aria-label="Posted" defaultValue="any">
              <option value="any">Any time</option>
            </Select>
          </>
        }
        sort={
          <Select leading="Sort" aria-label="Sort" defaultValue="best">
            <option value="best">Best fit</option>
          </Select>
        }
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getByText('Company').tagName).toBe('LABEL')
    expect(within(dialog).getByText('Posted').tagName).toBe('LABEL')
    // Still named, still one control each.
    expect(within(dialog).getByRole('combobox', { name: 'Company' })).toBeTruthy()
    // A Select with its own leading text is not given a second label.
    expect(within(dialog).getAllByText('Sort')).toHaveLength(1)
  })
})

describe('Skeleton announces its label as text', () => {
  it('a labelled skeleton holds the label as hidden text so the live region has something to say', () => {
    render(<Skeleton variant="row" count={2} label="Loading jobs" />)
    const status = screen.getByRole('status', { name: 'Loading jobs' })
    expect(status.getAttribute('aria-busy')).toBe('true')
    expect(status.textContent).toBe('Loading jobs')
    expect(status.querySelector('.kit-sr-only')?.textContent).toBe('Loading jobs')
  })

  it('the page variant says "Loading"; an unlabelled skeleton stays silent', () => {
    const { container, unmount } = render(<Skeleton variant="page" />)
    expect(screen.getByRole('status').textContent).toBe('Loading')
    unmount()
    const silent = render(<Skeleton lines={2} />)
    expect(silent.container.textContent).toBe('')
    expect(container).toBeTruthy()
  })
})

describe('Table loading and selection', () => {
  type Row = { id: string; name: string }
  const columns: Array<TableColumn<Row>> = [
    { id: 'name', header: 'Name', primary: true, cell: (row) => row.name },
    { id: 'stage', header: 'Stage', cell: () => 'x' },
    { id: 'actions', header: 'Actions', hideHeader: true, cell: () => 'a' },
  ]

  it('loading cells carry the same data attributes as loaded ones, so the stacked layout puts the title bar first', () => {
    render(<Table caption="Apps" columns={columns} rows={[]} getRowId={(row) => row.id} loading loadingRows={1} />)
    const cells = Array.from(document.querySelectorAll('tbody td'))
    expect(cells[0].getAttribute('data-primary')).toBe('true')
    expect(cells[1].getAttribute('data-primary')).toBeNull()
    expect(cells[2].getAttribute('data-actions')).toBe('true')
    expect(cells[1].getAttribute('data-label')).toBe('Stage')
  })

  it('selectedRowId accepts several ids', () => {
    const rows = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    render(<Table caption="Apps" columns={columns} rows={rows} getRowId={(row) => row.id} selectedRowId={['a', 'c']} />)
    const flags = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.getAttribute('data-selected'))
    expect(flags).toEqual(['true', null, 'true'])
  })
})

describe('Input empty state hook', () => {
  it('marks the frame data-empty until a value is present (a date reads like a placeholder while empty)', () => {
    const { container } = render(<DateField aria-label="Due" />)
    const frame = container.firstElementChild as HTMLElement
    expect(frame.hasAttribute('data-empty')).toBe(true)
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-10-31' } })
    expect(frame.hasAttribute('data-empty')).toBe(false)
    render(<Input aria-label="Filled" defaultValue="x" />)
    expect((screen.getByLabelText('Filled').parentElement as HTMLElement).hasAttribute('data-empty')).toBe(false)
  })
})

describe('title components forward refs', () => {
  it('RowTitle and CardTitle point the ref at the title element', () => {
    const rowRef = createRef<HTMLElement>()
    const cardRef = createRef<HTMLElement>()
    render(
      <>
        <RowTitle ref={rowRef}>Row</RowTitle>
        <CardTitle ref={cardRef} headingLevel={3}>
          Card
        </CardTitle>
      </>,
    )
    expect(rowRef.current?.textContent).toBe('Row')
    expect(cardRef.current?.tagName).toBe('H3')
  })

  it('with asChild the ref is the link itself, inside the heading', () => {
    const ref = createRef<HTMLElement>()
    render(
      <RowTitle ref={ref} asChild headingLevel={3}>
        <a href="#x">Open</a>
      </RowTitle>,
    )
    expect(ref.current?.tagName).toBe('A')
    expect(ref.current?.parentElement?.tagName).toBe('H3')
    expect(ref.current?.className).toContain('kit-stretched')
  })
})

describe('Notice dismiss closes on click', () => {
  it('still calls onDismiss', async () => {
    const onDismiss = vi.fn()
    render(<Notice onDismiss={onDismiss}>Saved.</Notice>)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })
})
