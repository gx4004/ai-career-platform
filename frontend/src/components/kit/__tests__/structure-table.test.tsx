import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Table, type TableColumn, type TableSort } from '#/components/kit'

type User = { id: string; email: string; role: string; runs: number }

const USERS: User[] = [
  { id: 'u1', email: 'ada@example.com', role: 'Admin', runs: 148 },
  { id: 'u2', email: 'grace@example.com', role: 'Member', runs: 0 },
]

const COLUMNS: Array<TableColumn<User>> = [
  { id: 'email', header: 'User', primary: true, sortable: true, cell: (user) => user.email },
  { id: 'role', header: 'Role', cell: (user) => user.role },
  { id: 'runs', header: 'Runs', numeric: true, sortable: true, cell: (user) => user.runs },
  { id: 'actions', header: 'Actions', hideHeader: true, stackLabel: false, cell: () => <button type="button">Open</button> },
]

function Demo({ onSort }: { onSort?: (sort: TableSort) => void }) {
  const [sort, setSort] = useState<TableSort | null>(null)
  return (
    <Table
      caption="Users"
      columns={COLUMNS}
      rows={USERS}
      getRowId={(user) => user.id}
      sort={sort}
      onSortChange={(next) => {
        setSort(next)
        onSort?.(next)
      }}
    />
  )
}

describe('kit Table', () => {
  it('is a table named by its (visually hidden) caption', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} />)
    const table = screen.getByRole('table', { name: 'Users' })
    expect(table.querySelector('caption')?.className).toContain('kit-sr-only')
  })

  it('renders a header row and a row per item, with the primary cell as the row header', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual(['User', 'Role', 'Runs', 'Actions'])
    expect(screen.getAllByRole('row')).toHaveLength(3)
    const rowHeader = screen.getByRole('rowheader', { name: 'ada@example.com' })
    expect(rowHeader.getAttribute('scope')).toBe('row')
    expect(screen.getByRole('cell', { name: 'Admin' })).toBeTruthy()
  })

  it('right-aligns numeric columns (data-align=end) in the header and the cells', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} />)
    expect(screen.getByRole('columnheader', { name: 'Runs' }).getAttribute('data-align')).toBe('end')
    const cell = screen.getByRole('cell', { name: '148' })
    expect(cell.getAttribute('data-align')).toBe('end')
    expect(cell.getAttribute('data-numeric')).toBe('true')
  })

  it('keeps a hidden-header column readable to assistive tech and flags its cells as actions', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} />)
    const header = screen.getByRole('columnheader', { name: 'Actions' })
    expect(header.querySelector('.kit-sr-only')?.textContent).toBe('Actions')
    const row = screen.getByRole('rowheader', { name: 'ada@example.com' }).closest('tr') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Open' }).closest('td')?.getAttribute('data-actions')).toBe('true')
  })

  it('labels every cell for the stacked layout with its column header (data-label)', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} />)
    expect(screen.getByRole('cell', { name: 'Admin' }).getAttribute('data-label')).toBe('Role')
    expect(screen.getByRole('cell', { name: '148' }).getAttribute('data-label')).toBe('Runs')
    // The primary cell is the title line (no label); the actions cell opts out.
    expect(screen.getByRole('rowheader', { name: 'ada@example.com' }).hasAttribute('data-label')).toBe(false)
    const row = screen.getByRole('rowheader', { name: 'ada@example.com' }).closest('tr') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Open' }).closest('td')?.hasAttribute('data-label')).toBe(false)
  })

  it('stacks by default and can opt out', () => {
    const { container, rerender } = render(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} />)
    expect(container.firstElementChild?.getAttribute('data-stack')).toBe('true')
    rerender(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} stack={false} />)
    expect(container.firstElementChild?.hasAttribute('data-stack')).toBe(false)
  })

  it('records the row density', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} density="compact" />)
    expect(screen.getByRole('table').getAttribute('data-density')).toBe('compact')
  })

  it('shows the empty content in one full-width cell when there are no rows', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={[]} getRowId={(user) => user.id} empty={<p>No users yet</p>} />)
    const cell = screen.getByText('No users yet').closest('td') as HTMLElement
    expect(cell.getAttribute('colspan')).toBe(String(COLUMNS.length))
  })

  it('renders only the header when empty is not given', () => {
    render(<Table caption="Users" columns={COLUMNS} rows={[]} getRowId={(user) => user.id} />)
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  it('loading renders hidden placeholder rows and marks the table busy; the empty state waits', () => {
    render(
      <Table caption="Users" columns={COLUMNS} rows={[]} getRowId={(user) => user.id} loading loadingRows={3} empty={<p>No users yet</p>} />,
    )
    expect(screen.getByRole('table', { hidden: true }).getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByText('No users yet')).toBeNull()
    expect(document.querySelectorAll('tbody tr[aria-hidden="true"]')).toHaveLength(3)
  })

  it('marks the selected row and passes row props through', () => {
    const onClick = vi.fn()
    render(
      <Table
        caption="Users"
        columns={COLUMNS}
        rows={USERS}
        getRowId={(user) => user.id}
        selectedRowId="u2"
        getRowProps={(user) => ({ 'aria-busy': user.id === 'u1' || undefined, onClick, className: 'extra' })}
      />,
    )
    const second = screen.getByRole('rowheader', { name: 'grace@example.com' }).closest('tr') as HTMLElement
    const first = screen.getByRole('rowheader', { name: 'ada@example.com' }).closest('tr') as HTMLElement
    expect(second.getAttribute('data-selected')).toBe('true')
    expect(first.hasAttribute('data-selected')).toBe(false)
    expect(first.getAttribute('aria-busy')).toBe('true')
    expect(first.className).toContain('extra')
    fireEvent.click(first)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  describe('sorting', () => {
    it('sortable headers are buttons with aria-sort; plain headers are not', () => {
      render(<Demo />)
      expect(within(screen.getByRole('columnheader', { name: 'User' })).getByRole('button')).toBeTruthy()
      expect(screen.getByRole('columnheader', { name: 'User' }).getAttribute('aria-sort')).toBe('none')
      expect(within(screen.getByRole('columnheader', { name: 'Role' })).queryByRole('button')).toBeNull()
      expect(screen.getByRole('columnheader', { name: 'Role' }).hasAttribute('aria-sort')).toBe(false)
    })

    it('a click sorts ascending, the next one descending, and aria-sort follows', () => {
      const onSort = vi.fn()
      render(<Demo onSort={onSort} />)
      const button = within(screen.getByRole('columnheader', { name: 'Runs' })).getByRole('button')
      fireEvent.click(button)
      expect(onSort).toHaveBeenLastCalledWith({ id: 'runs', direction: 'asc' })
      expect(screen.getByRole('columnheader', { name: 'Runs' }).getAttribute('aria-sort')).toBe('ascending')
      fireEvent.click(button)
      expect(onSort).toHaveBeenLastCalledWith({ id: 'runs', direction: 'desc' })
      expect(screen.getByRole('columnheader', { name: 'Runs' }).getAttribute('aria-sort')).toBe('descending')
    })

    it('sorting another column resets the first to none', () => {
      render(<Demo />)
      fireEvent.click(within(screen.getByRole('columnheader', { name: 'Runs' })).getByRole('button'))
      fireEvent.click(within(screen.getByRole('columnheader', { name: 'User' })).getByRole('button'))
      expect(screen.getByRole('columnheader', { name: 'User' }).getAttribute('aria-sort')).toBe('ascending')
      expect(screen.getByRole('columnheader', { name: 'Runs' }).getAttribute('aria-sort')).toBe('none')
    })

    it('the sort buttons are real buttons that do not submit forms', () => {
      render(<Demo />)
      expect(within(screen.getByRole('columnheader', { name: 'User' })).getByRole('button').getAttribute('type')).toBe('button')
    })
  })

  it('takes a maxHeight, which makes the header sticky inside the box', () => {
    const { container } = render(<Table caption="Usage" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} maxHeight="12rem" />)
    const wrap = container.firstElementChild as HTMLElement
    expect(wrap.style.getPropertyValue('--kit-table-max-h')).toBe('12rem')
    expect(wrap.getAttribute('data-sticky')).toBe('true')
    expect(wrap.getAttribute('data-scroll')).toBe('true')
  })

  describe('when its content overflows the box', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')

    it('becomes a keyboard-focusable, named scroll region', () => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      )
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 900 })
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 })
      try {
        const { container } = render(<Table caption="Usage" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} stack={false} />)
        const wrap = container.firstElementChild as HTMLElement
        expect(wrap.getAttribute('role')).toBe('region')
        expect(wrap.getAttribute('tabindex')).toBe('0')
        expect(wrap.getAttribute('aria-label')).toContain('Usage')
      } finally {
        if (original) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', original)
        else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
        vi.unstubAllGlobals()
      }
    })
  })

  it('adds no tab stop when nothing scrolls', () => {
    const { container } = render(<Table caption="Usage" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} />)
    const wrap = container.firstElementChild as HTMLElement
    expect(wrap.hasAttribute('tabindex')).toBe(false)
    expect(wrap.hasAttribute('role')).toBe(false)
  })

  it('stickyHeader marks the wrapper', () => {
    const { container } = render(<Table caption="Usage" columns={COLUMNS} rows={USERS} getRowId={(user) => user.id} stickyHeader />)
    expect((container.firstElementChild as HTMLElement).getAttribute('data-sticky')).toBe('true')
  })
})
