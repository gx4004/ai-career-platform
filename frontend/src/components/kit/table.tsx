import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Skeleton } from './skeleton'
import { useMergedRef } from './utils'
import type { RowDensity } from './row'

export type TableSort = { id: string; direction: 'asc' | 'desc' }

export type TableColumn<T> = {
  id: string
  /** Column heading. Also the label beside the value when rows stack on narrow widths (if it is text). */
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  /** Right-aligned (at the end edge) tabular figures. */
  numeric?: boolean
  align?: 'start' | 'center' | 'end'
  /** CSS width of the column ("6rem", "20%"). Leave unset to share the rest. */
  width?: string
  /** The header becomes a button; the table reports clicks through onSortChange. */
  sortable?: boolean
  /** The cell that names the row. It is the row header (th scope=row) and, stacked, the unlabelled title line. */
  primary?: boolean
  /** Do not draw the heading: an actions column. It is still read by assistive tech, and its cells sit above a StretchedLink. */
  hideHeader?: boolean
  /** Label beside the value when rows stack (default: the header, when it is a string). false: no label (actions, a lone badge). */
  stackLabel?: string | false
  mono?: boolean
  /** Keep the value on one line. */
  nowrap?: boolean
  /**
   * A column of Checkboxes (the header cell holds the select-all box). Stacked, the box takes the start of
   * the title line and the header box stays in the header row; give `stackLabel` to print a text ("Select all") beside it.
   */
  selection?: boolean
}

export type TableProps<T> = {
  /** The table's accessible name. Visually hidden: the Section above it carries the visible title. */
  caption: string
  columns: Array<TableColumn<T>>
  rows: T[]
  getRowId: (row: T) => string
  /** compact 36px rows, comfortable 44px (default). */
  density?: RowDensity
  /** Vertical alignment of every cell: middle (default), or top for rows whose cells run to several lines. */
  cellAlign?: 'middle' | 'top'
  /** Header row stays in view while the page scrolls (or while the table scrolls, with maxHeight). */
  stickyHeader?: boolean
  /** Scroll the table inside this height (any CSS length); the header sticks to the top of it. */
  maxHeight?: string
  sort?: TableSort | null
  onSortChange?: (sort: TableSort) => void
  /** Shown instead of rows when there are none (an EmptyState compact). */
  empty?: ReactNode
  loading?: boolean
  /** Placeholder rows while loading. Default 5. */
  loadingRows?: number
  /** Tinted with a bar on its start edge. One id, or several for a table with a selection column (see the doc: a Checkbox in the first column). */
  selectedRowId?: string | readonly string[] | null
  /** Extra props for a row: aria-busy, data-testid, onClick, className. */
  getRowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>
  /** Stack each row into a labelled list below ~640px of table width (default). false keeps the table. */
  stack?: boolean
  className?: string
  style?: CSSProperties
  ref?: Ref<HTMLDivElement>
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style' | 'ref' | 'role' | 'tabIndex'>

/** True while the element's content is larger than its box: it then needs a keyboard-reachable scroll region. */
function useOverflowing(element: RefObject<HTMLElement | null>) {
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const node = element.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () => setOverflowing(node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    const table = node.firstElementChild
    if (table) observer.observe(table)
    return () => observer.disconnect()
  }, [element])
  return overflowing
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' | 'none' }) {
  if (direction === 'asc') return <ArrowUp className="kit-table__sort-icon" aria-hidden="true" />
  if (direction === 'desc') return <ArrowDown className="kit-table__sort-icon" aria-hidden="true" />
  return <ChevronsUpDown className="kit-table__sort-icon" aria-hidden="true" />
}

function stackLabelOf<T>(column: TableColumn<T>): string | undefined {
  if (column.stackLabel === false) return undefined
  if (column.stackLabel !== undefined) return column.stackLabel
  if (column.hideHeader || column.primary || column.selection) return undefined
  return typeof column.header === 'string' ? column.header : undefined
}

function isSelected(selected: string | readonly string[] | null, id: string) {
  return typeof selected === 'string' ? selected === id : (selected?.includes(id) ?? false)
}

/**
 * Data table. Header row, hairline rows, right-aligned tabular numbers, sortable headers with
 * aria-sort, an empty state, and a stacked layout under ~640px where every cell becomes a
 * "label: value" line, so nothing scrolls sideways on a phone. The table does not sort or page
 * the rows; it reports sort clicks and you pass the rows in the order you want.
 */
export function Table<T>({
  caption,
  columns,
  rows,
  getRowId,
  density = 'comfortable',
  cellAlign = 'middle',
  stickyHeader = false,
  maxHeight,
  sort = null,
  onSortChange,
  empty,
  loading = false,
  loadingRows = 5,
  selectedRowId = null,
  getRowProps,
  stack = true,
  className,
  style,
  ref,
  ...rest
}: TableProps<T>) {
  const wrap = useRef<HTMLDivElement | null>(null)
  const merged = useMergedRef(ref, wrap)
  const overflowing = useOverflowing(wrap)
  const showEmpty = !loading && rows.length === 0 && empty !== undefined
  const hasSortable = columns.some((column) => column.sortable)

  return (
    <div
      {...rest}
      ref={merged}
      className={cn('kit-table-wrap', className)}
      data-stack={stack ? 'true' : undefined}
      data-sticky={stickyHeader || maxHeight ? 'true' : undefined}
      data-scroll={maxHeight ? 'true' : undefined}
      style={maxHeight ? ({ ...style, '--kit-table-max-h': maxHeight } as CSSProperties) : style}
      {...(overflowing ? { tabIndex: 0, role: 'region', 'aria-label': `${caption} (scrollable)` } : {})}
    >
      <table
        className="kit-table"
        role="table"
        data-density={density}
        data-cell-align={cellAlign === 'top' ? 'top' : undefined}
        data-sortable={hasSortable ? 'true' : undefined}
        aria-busy={loading || undefined}
      >
        <caption className="kit-sr-only">{caption}</caption>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead className="kit-table__head" role="rowgroup">
          <tr role="row" className="kit-table__head-row">
            {columns.map((column) => {
              const sorted = sort?.id === column.id ? sort.direction : null
              const align = column.numeric ? 'end' : (column.align ?? 'start')
              return (
                <th
                  key={column.id}
                  role="columnheader"
                  scope="col"
                  className="kit-table__th"
                  data-align={align}
                  data-sortable={column.sortable ? 'true' : undefined}
                  data-selection={column.selection ? 'true' : undefined}
                  data-label={column.selection ? column.stackLabel || undefined : undefined}
                  aria-sort={
                    column.sortable ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="kit-table__sort"
                      onClick={() =>
                        onSortChange?.({ id: column.id, direction: sorted === 'asc' ? 'desc' : 'asc' })
                      }
                    >
                      <span>{column.header}</span>
                      <SortIcon direction={sorted ?? 'none'} />
                    </button>
                  ) : column.hideHeader ? (
                    <span className="kit-sr-only">{column.header}</span>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="kit-table__body" role="rowgroup">
          {loading
            ? Array.from({ length: loadingRows }, (_, rowIndex) => (
                <tr key={rowIndex} role="row" className="kit-table__row" aria-hidden="true">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      role="cell"
                      className="kit-table__cell"
                      data-align={column.numeric ? 'end' : (column.align ?? 'start')}
                      data-primary={column.primary ? 'true' : undefined}
                      data-actions={column.hideHeader ? 'true' : undefined}
                      data-selection={column.selection ? 'true' : undefined}
                      data-label={column.selection ? undefined : stackLabelOf(column)}
                    >
                      <Skeleton variant="line" width={column.selection ? '1rem' : column.primary ? '70%' : '55%'} />
                    </td>
                  ))}
                </tr>
              ))
            : showEmpty
              ? (
                  <tr role="row" className="kit-table__row kit-table__row--empty">
                    <td role="cell" className="kit-table__cell kit-table__empty" colSpan={columns.length}>
                      {empty}
                    </td>
                  </tr>
                )
              : rows.map((row, index) => {
                  const id = getRowId(row)
                  const { className: rowClass, ...rowRest } = getRowProps?.(row) ?? {}
                  return (
                    <tr
                      key={id}
                      role="row"
                      className={cn('kit-table__row', rowClass)}
                      data-selected={isSelected(selectedRowId, id) ? 'true' : undefined}
                      {...rowRest}
                    >
                      {columns.map((column) => {
                        const align = column.numeric ? 'end' : (column.align ?? 'start')
                        const label = column.selection ? undefined : stackLabelOf(column)
                        const common = {
                          className: 'kit-table__cell',
                          'data-align': align,
                          'data-numeric': column.numeric ? 'true' : undefined,
                          'data-mono': column.mono ? 'true' : undefined,
                          'data-nowrap': column.nowrap ? 'true' : undefined,
                          'data-primary': column.primary ? 'true' : undefined,
                          'data-actions': column.hideHeader ? 'true' : undefined,
                          'data-selection': column.selection ? 'true' : undefined,
                          'data-label': label,
                        }
                        return column.primary ? (
                          <th key={column.id} role="rowheader" scope="row" {...common}>
                            {column.cell(row, index)}
                          </th>
                        ) : (
                          <td key={column.id} role="cell" {...common}>
                            {column.cell(row, index)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
        </tbody>
      </table>
      <span role="status" className="kit-sr-only">
        {loading ? `${caption}, loading` : ''}
      </span>
    </div>
  )
}
