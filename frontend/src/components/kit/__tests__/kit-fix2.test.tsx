import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  Button,
  Checkbox,
  Field,
  List,
  Row,
  RowActions,
  RowBody,
  RowMeta,
  RowTitle,
  Segmented,
  Switch,
  Table,
  type TableColumn,
} from '#/components/kit'

describe('RowActions collapse', () => {
  it('without collapse renders the children directly in the group', () => {
    render(
      <List aria-label="x">
        <Row>
          <RowBody>
            <RowTitle>Run</RowTitle>
          </RowBody>
          <RowActions>
            <Button>Rename</Button>
          </RowActions>
        </Row>
      </List>,
    )
    const group = screen.getByRole('button', { name: 'Rename' }).parentElement!
    expect(group.className).toContain('kit-row__actions')
    expect(group.hasAttribute('data-collapsible')).toBe(false)
  })

  it('with collapse renders both the inline actions and the overflow menu, marked for the narrow-list rule', () => {
    render(
      <List aria-label="x">
        <Row>
          <RowBody>
            <RowTitle>Run</RowTitle>
          </RowBody>
          <RowMeta>Sep 29</RowMeta>
          <RowActions collapse={<Button aria-label="More actions">...</Button>}>
            <Button>Rename</Button>
            <Button>Delete</Button>
          </RowActions>
        </Row>
      </List>,
    )
    const rename = screen.getByRole('button', { name: 'Rename' })
    const more = screen.getByRole('button', { name: 'More actions' })
    const group = rename.closest('.kit-row__actions')!
    expect(group.getAttribute('data-collapsible')).toBe('true')
    expect(rename.closest('.kit-row__actions-inline')).toBeTruthy()
    expect(more.closest('.kit-row__actions-collapsed')).toBeTruthy()
    expect(group.contains(more)).toBe(true)
  })
})

describe('Segmented native props and Field wiring', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ]

  it('spreads native props onto the radiogroup root, and keeps its own props off the DOM', () => {
    render(<Segmented aria-label="Pick" options={options} defaultValue="a" data-testid="seg" aria-describedby="note" title="Pick one" />)
    const group = screen.getByTestId('seg')
    expect(group.getAttribute('role')).toBe('radiogroup')
    expect(group.getAttribute('aria-describedby')).toBe('note')
    expect(group.getAttribute('title')).toBe('Pick one')
    expect(group.hasAttribute('defaultvalue')).toBe(false)
    expect(group.hasAttribute('options')).toBe(false)
  })

  it('inside a Field takes the label as its name and the help, error and required as aria', () => {
    render(
      <Field label="Tone" help="Pick one." error="Choose a tone." required>
        <Segmented options={options} />
      </Field>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Tone' })
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(group.getAttribute('aria-required')).toBe('true')
    const described = group.getAttribute('aria-describedby')!.split(' ')
    expect(described.map((id) => document.getElementById(id)?.textContent)).toEqual(['Pick one.', 'Choose a tone.'])
  })

  it('invalid prop forces the invalid look without a Field', () => {
    render(<Segmented aria-label="Pick" options={options} invalid />)
    const group = screen.getByRole('radiogroup')
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(group.getAttribute('data-invalid')).toBe('true')
  })
})

describe('Checkbox and Switch framed size', () => {
  it('records the size on a framed control only', () => {
    const { container, rerender } = render(<Checkbox framed size="sm" label="Remote only" />)
    expect(container.querySelector('.kit-check')!.getAttribute('data-size')).toBe('sm')
    rerender(<Switch framed label="Include remote" />)
    expect(container.querySelector('.kit-check')!.getAttribute('data-size')).toBe('md')
    rerender(<Checkbox size="lg" label="Plain" />)
    expect(container.querySelector('.kit-check')!.hasAttribute('data-size')).toBe(false)
  })
})

type Person = { id: string; name: string; role: string }
const PEOPLE: Person[] = [
  { id: '1', name: 'Ada', role: 'Admin' },
  { id: '2', name: 'Grace', role: 'Member' },
]

describe('Table selection column, native props and loading status', () => {
  const columns: Array<TableColumn<Person>> = [
    {
      id: 'select',
      header: <Checkbox aria-label="Select all" />,
      selection: true,
      stackLabel: 'Select all',
      cell: (person) => <Checkbox aria-label={`Select ${person.name}`} />,
    },
    { id: 'name', header: 'Name', primary: true, cell: (person) => person.name },
    { id: 'role', header: 'Role', cell: (person) => person.role },
  ]

  it('flags the header and body cells of a selection column, and gives the cells no stacked label', () => {
    render(<Table caption="People" columns={columns} rows={PEOPLE} getRowId={(person) => person.id} />)
    const header = screen.getByRole('columnheader', { name: 'Select all' })
    expect(header.getAttribute('data-selection')).toBe('true')
    expect(header.getAttribute('data-label')).toBe('Select all')
    const cell = screen.getByRole('checkbox', { name: 'Select Ada' }).closest('td')!
    expect(cell.getAttribute('data-selection')).toBe('true')
    expect(cell.hasAttribute('data-label')).toBe(false)
    // The Role cell keeps its label.
    expect(screen.getAllByRole('cell', { name: 'Admin' })[0].getAttribute('data-label')).toBe('Role')
  })

  it('spreads native props onto the wrapper', () => {
    render(<Table caption="People" columns={columns} rows={PEOPLE} getRowId={(person) => person.id} data-testid="people-table" aria-describedby="hint" />)
    const wrap = screen.getByTestId('people-table')
    expect(wrap.className).toContain('kit-table-wrap')
    expect(wrap.getAttribute('aria-describedby')).toBe('hint')
  })

  it('announces loading in a status region and clears it afterwards', () => {
    const { rerender } = render(<Table caption="People" columns={columns} rows={[]} getRowId={(person) => person.id} loading />)
    expect(screen.getByRole('status').textContent).toBe('People, loading')
    rerender(<Table caption="People" columns={columns} rows={PEOPLE} getRowId={(person) => person.id} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
