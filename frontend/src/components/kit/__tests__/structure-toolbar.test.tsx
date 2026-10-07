import { useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox, Input, Pagination, Select, Toolbar, pageItems } from '#/components/kit'

function Demo({ onClear }: { onClear?: () => void }) {
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('')
  const [remote, setRemote] = useState(false)
  const active = (company ? 1 : 0) + (remote ? 1 : 0)
  return (
    <Toolbar
      search={<Input type="search" aria-label="Search jobs" value={query} onChange={(event) => setQuery(event.target.value)} />}
      filters={
        <>
          <Select aria-label="Company" value={company} onChange={(event) => setCompany(event.target.value)}>
            <option value="">All companies</option>
            <option value="Northwind">Northwind</option>
          </Select>
          <Checkbox framed label="Remote only" checked={remote} onCheckedChange={setRemote} />
        </>
      }
      sort={
        <Select aria-label="Sort" defaultValue="best">
          <option value="best">Best fit</option>
        </Select>
      }
      count="148 jobs"
      activeFilters={active}
      onClearFilters={() => {
        setCompany('')
        setRemote(false)
        onClear?.()
      }}
    />
  )
}

describe('kit Toolbar', () => {
  it('renders search, filters, sort and a polite result count', () => {
    render(<Demo />)
    expect(screen.getByRole('searchbox', { name: 'Search jobs' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Company' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Remote only' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeTruthy()
    const count = screen.getByRole('status')
    expect(count.textContent).toBe('148 jobs')
  })

  it('puts the count on its own line only when asked (countPlacement="below")', () => {
    const { container, rerender } = render(<Toolbar search={<Input aria-label="Search" />} count="3 jobs" />)
    expect(container.querySelector('.kit-toolbar')?.hasAttribute('data-count')).toBe(false)
    rerender(<Toolbar search={<Input aria-label="Search" />} count="3 jobs" countPlacement="below" />)
    expect(container.querySelector('.kit-toolbar')?.getAttribute('data-count')).toBe('below')
  })

  it('has a Filters button (for phones) named with the number of active filters', () => {
    render(<Demo />)
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Company' }), { target: { value: 'Northwind' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remote only' }))
    const button = screen.getByRole('button', { name: 'Filters, 2 active' })
    expect(button.querySelector('.kit-count')?.textContent).toBe('2')
    // The visible word is its own element so a 320px phone can drop it (icon + count stay; the name is the aria-label),
    // giving the search beside it room for its placeholder (account-admin-F22).
    expect(button.querySelector('.kit-toolbar__filters-word')?.textContent).toBe('Filters')
  })

  it('opens a Filters sheet holding the same controls, in the same state', async () => {
    render(<Demo />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Company' }), { target: { value: 'Northwind' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filters, 1 active' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect((within(dialog).getByRole('combobox', { name: 'Company' }) as HTMLSelectElement).value).toBe('Northwind')
    expect(within(dialog).getByRole('checkbox', { name: 'Remote only' })).toBeTruthy()
    expect(within(dialog).getByRole('combobox', { name: 'Sort' })).toBeTruthy()
    // The search field stays in the row, not in the sheet.
    expect(within(dialog).queryByRole('searchbox')).toBeNull()
  })

  it('a change made in the sheet reaches the page state and the badge', async () => {
    render(<Demo />)
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Remote only' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'Filters, 1 active' })).toBeTruthy()
  })

  it('Clear filters appears only while filters are active and calls the handler', () => {
    const onClear = vi.fn()
    render(<Demo onClear={onClear} />)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remote only' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('marks Clear filters as starting a line when it wraps under the filters (it then drops its start margin)', () => {
    const box = (top: number, height: number, width = 100) => ({ top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    const layout = { clearTop: 0 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('kit-toolbar__clear')) return box(layout.clearTop, 36)
      if (this.classList.contains('kit-toolbar__filters')) return box(0, 44)
      // Everything else (the phone-only Filters button among them) is not laid out.
      return box(0, 0, 0)
    })
    try {
      const { rerender } = render(<Toolbar filters={<Checkbox framed label="Remote only" checked onCheckedChange={() => {}} />} activeFilters={1} onClearFilters={() => {}} />)
      const clear = screen.getByRole('button', { name: 'Clear filters' })
      // Same line as the filters.
      expect(clear.hasAttribute('data-line-start')).toBe(false)
      layout.clearTop = 56
      rerender(<Toolbar filters={<Checkbox framed label="Remote only" checked onCheckedChange={() => {}} />} activeFilters={2} onClearFilters={() => {}} />)
      expect(clear.hasAttribute('data-line-start')).toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('describes the Filters sheet as narrowing, and as sorting only when it holds a sort (history-profile-F33)', async () => {
    const describe = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
      const sheet = await screen.findByRole('dialog')
      return document.getElementById(sheet.getAttribute('aria-describedby') as string)?.textContent
    }
    const { unmount } = render(<Toolbar filters={<Checkbox framed label="Remote only" checked={false} onCheckedChange={() => {}} />} />)
    expect(await describe()).toBe('Narrow the list.')
    unmount()
    render(
      <Toolbar
        filters={<Checkbox framed label="Remote only" checked={false} onCheckedChange={() => {}} />}
        sort={<Select aria-label="Sort"><option>Newest</option></Select>}
      />,
    )
    expect(await describe()).toBe('Narrow and sort the list.')
  })

  it('has no Filters button when there are no filters or sort', () => {
    render(<Toolbar search={<Input aria-label="Search users" />} count="34 users" />)
    expect(screen.queryByRole('button', { name: /Filters/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('34 users')
  })

  it('omits the count element when no count is given', () => {
    render(<Toolbar search={<Input aria-label="Search" />} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders always-visible actions', () => {
    render(<Toolbar search={<Input aria-label="Search" />} actions={<button type="button">Board</button>} />)
    expect(screen.getByRole('button', { name: 'Board' })).toBeTruthy()
  })
})

describe('pageItems', () => {
  it('shows first, last and the current page with its neighbours; null marks a gap', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, null, 20])
    expect(pageItems(14, 40)).toEqual([1, null, 13, 14, 15, null, 40])
    expect(pageItems(20, 20)).toEqual([1, null, 19, 20])
    expect(pageItems(2, 3)).toEqual([1, 2, 3])
    expect(pageItems(1, 1)).toEqual([1])
  })
})

describe('kit Pagination', () => {
  it('is a nav landmark named Pages, with page buttons and aria-current on the current one', () => {
    render(<Pagination page={14} pageCount={40} onPageChange={() => undefined} />)
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Page 14' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Page 15' }).hasAttribute('aria-current')).toBe(false)
    expect(screen.getByRole('button', { name: 'Page 40' })).toBeTruthy()
  })

  it('takes another accessible name', () => {
    render(<Pagination aria-label="History pages" page={1} pageCount={3} onPageChange={() => undefined} />)
    expect(screen.getByRole('navigation', { name: 'History pages' })).toBeTruthy()
  })

  it('goes to the clicked page, and to the previous and next', () => {
    const onPageChange = vi.fn()
    render(<Pagination page={5} pageCount={9} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Page 9' }))
    expect(onPageChange).toHaveBeenLastCalledWith(9)
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))
    expect(onPageChange).toHaveBeenLastCalledWith(4)
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(onPageChange).toHaveBeenLastCalledWith(6)
  })

  it('disables Previous on the first page and Next on the last', () => {
    const { rerender } = render(<Pagination page={1} pageCount={4} onPageChange={() => undefined} />)
    expect((screen.getByRole('button', { name: /Previous/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled).toBe(false)
    rerender(<Pagination page={4} pageCount={4} onPageChange={() => undefined} />)
    expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('clamps an out-of-range page', () => {
    const onPageChange = vi.fn()
    render(<Pagination page={99} pageCount={4} onPageChange={onPageChange} />)
    expect(screen.getByRole('button', { name: 'Page 4' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('simple variant has no page numbers, says "Page x of y", and shows the summary', () => {
    render(<Pagination variant="simple" page={2} pageCount={9} onPageChange={() => undefined} summary="Showing 21 to 40 of 134" />)
    expect(screen.queryByRole('button', { name: /^Page \d/ })).toBeNull()
    expect(screen.getByText('Page 2 of 9')).toBeTruthy()
    expect(screen.getByText('Showing 21 to 40 of 134')).toBeTruthy()
  })

  it('brings the list it pages back into view when its top has scrolled away (scrollTarget, AA-F08)', () => {
    function Paged() {
      const list = useRef<HTMLDivElement>(null)
      const [page, setPage] = useState(1)
      return (
        <>
          <div ref={list} data-testid="list">
            Page {page} rows
          </div>
          <Pagination variant="simple" page={page} pageCount={9} onPageChange={setPage} scrollTarget={list} />
        </>
      )
    }
    render(<Paged />)
    const list = screen.getByTestId('list')
    const scrollIntoView = vi.fn()
    list.scrollIntoView = scrollIntoView
    // Scrolled to the bottom of a long page: the list's top is above the viewport.
    list.getBoundingClientRect = () => ({ top: -3200 }) as DOMRect
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(list.textContent).toBe('Page 2 rows')
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))

    // The top is already on screen (a short list on a desktop): nothing moves.
    scrollIntoView.mockClear()
    list.getBoundingClientRect = () => ({ top: 120 }) as DOMRect
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('numbered variant also carries "Page x of y" (shown on phones in place of the numbers)', () => {
    render(<Pagination page={3} pageCount={9} onPageChange={() => undefined} />)
    expect(screen.getByText('Page 3 of 9').className).toContain('kit-pagination__status')
  })
})
