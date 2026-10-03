import { createRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DateField, Input, Select, Textarea } from '#/components/kit'

describe('kit Input', () => {
  it('renders a framed text input; className goes to the frame, native props and ref to the input', () => {
    const ref = createRef<HTMLInputElement>()
    const { container } = render(
      <Input ref={ref} className="wide" size="lg" aria-label="Name" placeholder="Ada" name="name" maxLength={20} />,
    )
    const input = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
    const frame = container.querySelector('.kit-input') as HTMLElement
    expect(frame.classList.contains('wide')).toBe(true)
    expect(frame.getAttribute('data-size')).toBe('lg')
    expect(input.classList.contains('kit-input__control')).toBe(true)
    expect(input.name).toBe('name')
    expect(input.maxLength).toBe(20)
    expect(ref.current).toBe(input)
  })

  it('renders leading and trailing adornments', () => {
    render(<Input aria-label="Salary" leading={<span data-testid="lead">€</span>} trailing={<span data-testid="trail">/ year</span>} />)
    expect(screen.getByTestId('lead')).toBeTruthy()
    expect(screen.getByTestId('trail')).toBeTruthy()
  })

  it('reflects invalid, disabled and read-only on the frame and the input', () => {
    const { container } = render(
      <>
        <Input aria-label="Bad" invalid />
        <Input aria-label="Off" disabled />
        <Input aria-label="Locked" readOnly defaultValue="x" />
      </>,
    )
    const frames = container.querySelectorAll('.kit-input')
    expect(screen.getByLabelText('Bad').getAttribute('aria-invalid')).toBe('true')
    expect(frames[0].hasAttribute('data-invalid')).toBe(true)
    expect((screen.getByLabelText('Off') as HTMLInputElement).disabled).toBe(true)
    expect(frames[1].hasAttribute('data-disabled')).toBe(true)
    expect((screen.getByLabelText('Locked') as HTMLInputElement).readOnly).toBe(true)
    expect(frames[2].hasAttribute('data-readonly')).toBe(true)
  })

  it('calls onChange as the user types', () => {
    const onChange = vi.fn()
    render(<Input aria-label="Name" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('shows a clear button only while a controlled field has a value, and empties it', () => {
    const onClear = vi.fn()
    function Controlled() {
      const [value, setValue] = useState('backend')
      return <Input aria-label="Search" clearable value={value} onChange={(event) => setValue(event.target.value)} onClear={onClear} />
    }
    render(<Controlled />)
    const input = screen.getByLabelText('Search') as HTMLInputElement
    const clear = screen.getByRole('button', { name: 'Clear' })
    fireEvent.click(clear)
    expect(input.value).toBe('')
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(input)
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('clears an uncontrolled field and tracks typing for the clear button', () => {
    render(<Input aria-label="Search" clearable />)
    const input = screen.getByLabelText('Search') as HTMLInputElement
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(input.value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('reports the cleared value through onChange', () => {
    const onChange = vi.fn()
    render(<Input aria-label="Search" clearable defaultValue="abc" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0][0] as { target: HTMLInputElement }).target.value).toBe('')
  })

  it('hides the clear button when disabled or read-only and supports a custom label', () => {
    render(
      <>
        <Input aria-label="A" clearable defaultValue="x" disabled />
        <Input aria-label="B" clearable defaultValue="x" readOnly />
        <Input aria-label="C" clearable defaultValue="x" clearLabel="Clear search" />
      </>,
    )
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Clear search'])
  })
})

describe('kit Select', () => {
  it('renders a native select with options, a chevron and size on the frame', () => {
    const ref = createRef<HTMLSelectElement>()
    const onChange = vi.fn()
    const { container } = render(
      <Select ref={ref} aria-label="Company" size="sm" defaultValue="b" onChange={onChange} leading="Sort">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    )
    const select = screen.getByRole('combobox', { name: 'Company' }) as HTMLSelectElement
    expect(select.value).toBe('b')
    expect(ref.current).toBe(select)
    expect(container.querySelector('.kit-select')?.getAttribute('data-size')).toBe('sm')
    expect(container.querySelector('.kit-select__chevron')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('Sort')).toBeTruthy()
    fireEvent.change(select, { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('supports invalid and disabled', () => {
    const { container } = render(
      <>
        <Select aria-label="Bad" invalid>
          <option>x</option>
        </Select>
        <Select aria-label="Off" disabled>
          <option>x</option>
        </Select>
      </>,
    )
    expect(screen.getByLabelText('Bad').getAttribute('aria-invalid')).toBe('true')
    expect((screen.getByLabelText('Off') as HTMLSelectElement).disabled).toBe(true)
    expect(container.querySelectorAll('.kit-select[data-disabled]').length).toBe(1)
  })
})

describe('kit Textarea', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
  afterEach(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
  })

  it('renders a textarea with rows, invalid and ref', () => {
    const ref = createRef<HTMLTextAreaElement>()
    render(<Textarea ref={ref} aria-label="Notes" rows={5} invalid />)
    const textarea = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement
    expect(textarea.rows).toBe(5)
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.classList.contains('kit-textarea')).toBe(true)
    expect(ref.current).toBe(textarea)
  })

  it('defaults to three rows, or two when it grows with its content', () => {
    render(
      <>
        <Textarea aria-label="Plain" />
        <Textarea aria-label="Grows" autosize />
      </>,
    )
    expect((screen.getByLabelText('Plain') as HTMLTextAreaElement).rows).toBe(3)
    expect((screen.getByLabelText('Grows') as HTMLTextAreaElement).rows).toBe(2)
  })

  it('grows to its content height when autosize is on', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 120 })
    render(<Textarea aria-label="Grows" autosize defaultValue="a\nb\nc" />)
    const textarea = screen.getByLabelText('Grows') as HTMLTextAreaElement
    expect(textarea.style.height).toBe('120px')
    expect(textarea.getAttribute('data-autosize')).toBe('true')
  })

  it('stops growing at maxRows and scrolls', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 400 })
    render(<Textarea aria-label="Capped" autosize maxRows={3} />)
    const textarea = screen.getByLabelText('Capped') as HTMLTextAreaElement
    expect(textarea.style.height).toBe('60px') // 3 rows x the 20px fallback line height
    expect(textarea.style.overflowY).toBe('auto')
  })

  it('does not touch the height when autosize is off', () => {
    render(<Textarea aria-label="Fixed" />)
    expect((screen.getByLabelText('Fixed') as HTMLTextAreaElement).style.height).toBe('')
  })

  it('re-measures when the user types', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 50 })
    const onChange = vi.fn()
    render(<Textarea aria-label="Grows" autosize onChange={onChange} />)
    const textarea = screen.getByLabelText('Grows') as HTMLTextAreaElement
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 90 })
    fireEvent.change(textarea, { target: { value: 'more\ntext' } })
    expect(textarea.style.height).toBe('90px')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('kit DateField', () => {
  it('renders a date input in the Input frame and reports ISO values', () => {
    const onValueChange = vi.fn()
    const onChange = vi.fn()
    const { container } = render(<DateField aria-label="Due date" onValueChange={onValueChange} onChange={onChange} />)
    const input = screen.getByLabelText('Due date') as HTMLInputElement
    expect(input.type).toBe('date')
    expect(container.querySelector('.kit-input')).toBeTruthy()
    fireEvent.change(input, { target: { value: '2026-10-31' } })
    expect(onValueChange).toHaveBeenCalledWith('2026-10-31')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('passes min and max through and supports disabled and invalid', () => {
    render(<DateField aria-label="Due" min="2026-01-01" max="2026-12-31" disabled invalid />)
    const input = screen.getByLabelText('Due') as HTMLInputElement
    expect(input.min).toBe('2026-01-01')
    expect(input.max).toBe('2026-12-31')
    expect(input.disabled).toBe(true)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })
})
