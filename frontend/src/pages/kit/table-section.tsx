import { useMemo, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Pagination,
  Segmented,
  StretchedLink,
  Table,
  type TableColumn,
  type TableSort,
} from '#/components/kit'
import { DemoLink, GallerySection, Group, Row, Specimen } from './gallery-parts'
import { APPLICATIONS, USERS, compact, type UserRow } from './sample-data'

const USER_COLUMNS: Array<TableColumn<UserRow>> = [
  {
    id: 'email',
    header: 'User',
    primary: true,
    sortable: true,
    cell: (user) => (
      <>
        <StretchedLink asChild>
          <DemoLink>{user.email}</DemoLink>
        </StretchedLink>
        {user.name ? <span className="kit-gallery__sub">{user.name}</span> : null}
      </>
    ),
  },
  {
    id: 'role',
    header: 'Role',
    cell: (user) => <Badge tone={user.role === 'Admin' ? 'accent' : 'neutral'}>{user.role}</Badge>,
  },
  { id: 'runs', header: 'Runs', numeric: true, sortable: true, cell: (user) => user.runs.toLocaleString('en') },
  { id: 'created', header: 'Joined', nowrap: true, sortable: true, cell: (user) => user.created },
  {
    id: 'actions',
    header: 'Actions',
    hideHeader: true,
    align: 'end',
    stackLabel: false,
    cell: (user) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button iconOnly variant="ghost" size="sm" aria-label={`Actions for ${user.email}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>View runs</DropdownMenuItem>
          <DropdownMenuItem destructive>Suspend</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]

const WIDE_COLUMNS: Array<TableColumn<UserRow>> = [
  { id: 'email', header: 'User', primary: true, cell: (user) => user.email },
  { id: 'runs', header: 'Runs', numeric: true, cell: (user) => user.runs.toLocaleString('en') },
  { id: 'in', header: 'Tokens in', numeric: true, cell: (user) => compact(user.tokensIn) },
  { id: 'out', header: 'Tokens out', numeric: true, cell: (user) => compact(user.tokensOut) },
  { id: 'cost', header: 'Cost', numeric: true, cell: (user) => `$${user.cost.toFixed(2)}` },
  { id: 'errors', header: 'Errors', numeric: true, cell: (user) => user.errors },
  { id: 'cache', header: 'Cache hit', numeric: true, cell: (user) => `${user.cache}%` },
  { id: 'p50', header: 'p50 (s)', numeric: true, cell: (user) => user.p50.toFixed(1) },
  { id: 'p95', header: 'p95 (s)', numeric: true, cell: (user) => user.p95.toFixed(1) },
]

const APP_COLUMNS: Array<TableColumn<(typeof APPLICATIONS)[number]>> = [
  { id: 'stage', header: 'Stage', width: '8rem', cell: (app) => <Badge tone={app.tone}>{app.stage}</Badge> },
  { id: 'role', header: 'Role', primary: true, cell: (app) => app.role },
  { id: 'company', header: 'Company', cell: (app) => app.company },
  { id: 'fit', header: 'Skills fit', numeric: true, cell: (app) => (app.fit === null ? '-' : `${app.fit}%`) },
  { id: 'next', header: 'Next step', cell: (app) => app.next ?? '-' },
]

function SortableUsers() {
  const [sort, setSort] = useState<TableSort | null>({ id: 'runs', direction: 'desc' })
  const [page, setPage] = useState(2)
  const [selected, setSelected] = useState<string | null>(null)
  const rows = useMemo(() => {
    if (!sort) return USERS
    const sign = sort.direction === 'asc' ? 1 : -1
    return [...USERS].sort((a, b) => {
      const left = a[sort.id as keyof UserRow] ?? ''
      const right = b[sort.id as keyof UserRow] ?? ''
      return (left < right ? -1 : left > right ? 1 : 0) * sign
    })
  }, [sort])
  return (
    <div className="kit-gallery__stack">
      <p className="kit-gallery__quiet" role="status">
        Sorted by {sort ? `${sort.id} (${sort.direction === 'asc' ? 'ascending' : 'descending'})` : 'nothing'}
      </p>
      <Table
        caption="Users"
        columns={USER_COLUMNS}
        rows={rows}
        getRowId={(user) => user.id}
        sort={sort}
        onSortChange={setSort}
        selectedRowId={selected}
        getRowProps={(user) => ({ onDoubleClick: () => setSelected(user.id) })}
      />
      <Pagination variant="simple" page={page} pageCount={9} onPageChange={setPage} summary={`Showing ${(page - 1) * 4 + 1} to ${page * 4} of 34`} />
    </div>
  )
}

function SelectableUsers() {
  const [selected, setSelected] = useState<string[]>(['u1'])
  const all = selected.length === USERS.length
  const columns: Array<TableColumn<UserRow>> = [
    {
      id: 'select',
      header: (
        <Checkbox
          aria-label="Select all users"
          checked={all}
          indeterminate={selected.length > 0 && !all}
          onCheckedChange={(next) => setSelected(next ? USERS.map((user) => user.id) : [])}
        />
      ),
      width: '2.75rem',
      selection: true,
      stackLabel: 'Select all',
      cell: (user) => (
        <Checkbox
          aria-label={`Select ${user.email}`}
          checked={selected.includes(user.id)}
          onCheckedChange={(next) => setSelected((current) => (next ? [...current, user.id] : current.filter((id) => id !== user.id)))}
        />
      ),
    },
    ...USER_COLUMNS.slice(0, 3),
  ]
  return (
    <div className="kit-gallery__stack">
      <p className="kit-gallery__quiet" role="status">
        {selected.length} selected
      </p>
      <Table caption="Users with selection" columns={columns} rows={USERS} getRowId={(user) => user.id} selectedRowId={selected} />
    </div>
  )
}

function States() {
  const [mode, setMode] = useState<'rows' | 'loading' | 'empty'>('rows')
  return (
    <div className="kit-gallery__stack">
      <Row>
        <Segmented
          aria-label="Table state"
          size="sm"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'rows', label: 'Rows' },
            { value: 'loading', label: 'Loading' },
            { value: 'empty', label: 'Empty' },
          ]}
        />
      </Row>
      <Table
        caption="Applications"
        columns={APP_COLUMNS}
        rows={mode === 'empty' ? [] : APPLICATIONS}
        getRowId={(app) => app.id}
        loading={mode === 'loading'}
        loadingRows={3}
        empty={<EmptyState title="No applications yet" description="Add a job from Discover and it appears here." />}
      />
    </div>
  )
}

export function TableSection() {
  return (
    <GallerySection
      id="table"
      title="Table"
      note="Under about 640px of table width every row stacks into a labelled list, so nothing scrolls sideways on a phone. Resize the window or look at the narrow frame."
    >
      <Group title="Sortable, with a whole-row link (the email), an actions column and a Pagination (click a header; double-click a row to select it)">
        <SortableUsers />
      </Group>

      <Group title="Eight numeric columns: right-aligned, tabular (scrolls inside its own box when wider than the page)">
        <Table caption="Usage by user" columns={WIDE_COLUMNS} rows={USERS} getRowId={(user) => user.id} density="compact" />
      </Group>

      <Group title="Sticky header inside a 12rem scroll box (maxHeight)">
        <Table
          caption="Usage, scrolling"
          columns={WIDE_COLUMNS}
          rows={[...USERS, ...USERS.map((user) => ({ ...user, id: `${user.id}b` })), ...USERS.map((user) => ({ ...user, id: `${user.id}c` }))]}
          getRowId={(user) => user.id}
          maxHeight="12rem"
          density="compact"
        />
      </Group>

      <div className="kit-gallery__grid kit-gallery__grid--wide">
        <Specimen label="Loading, empty and rows (same columns, same row height)">
          <States />
        </Specimen>
        <Specimen label="Forced narrow container (30rem): stacked">
          <div className="kit-gallery__frame kit-gallery__frame--phone">
            <Table caption="Users (stacked)" columns={USER_COLUMNS} rows={USERS.slice(0, 3)} getRowId={(user) => user.id} />
          </div>
        </Specimen>
        <Specimen label="Loading, forced narrow container: the placeholder bars stay full width, the title bar first">
          <div className="kit-gallery__frame kit-gallery__frame--phone">
            <Table caption="Applications (loading, stacked)" columns={APP_COLUMNS} rows={[]} getRowId={(app) => app.id} loading loadingRows={2} />
          </div>
        </Specimen>
        <Specimen label="Selection column: a Checkbox per row and in the header; selectedRowId takes several ids">
          <SelectableUsers />
        </Specimen>
        <Specimen label="Selection column, forced narrow container: the box starts the title line and select-all stays in the header row">
          <div className="kit-gallery__frame kit-gallery__frame--phone">
            <SelectableUsers />
          </div>
        </Specimen>
        <Specimen label="cellAlign=&quot;top&quot;: multi-line rows start every cell at the row's top rule">
          <Table caption="Users (top-aligned)" columns={USER_COLUMNS} rows={USERS.slice(0, 3)} getRowId={(user) => user.id} cellAlign="top" />
        </Specimen>
        <Specimen label="stack={false}: keeps the table, scrolls sideways if it must">
          <div className="kit-gallery__frame kit-gallery__frame--phone">
            <Table caption="Users (no stacking)" columns={WIDE_COLUMNS} rows={USERS.slice(0, 3)} getRowId={(user) => user.id} stack={false} density="compact" />
          </div>
        </Specimen>
      </div>
    </GallerySection>
  )
}
