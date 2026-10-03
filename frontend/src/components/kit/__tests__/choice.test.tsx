import { createRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox, Switch } from '#/components/kit'

describe('kit Checkbox', () => {
  it('is a native checkbox named by its label, and the label click toggles it', () => {
    const onChange = vi.fn()
    render(<Checkbox label="Remember me" onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Remember me' }) as HTMLInputElement
    expect(checkbox.type).toBe('checkbox')
    expect(checkbox.checked).toBe(false)
    fireEvent.click(screen.getByText('Remember me'))
    expect(checkbox.checked).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reports the new state through onCheckedChange', () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox label="Remote only" onCheckedChange={onCheckedChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Remote only' })
    fireEvent.click(checkbox)
    fireEvent.click(checkbox)
    expect(onCheckedChange.mock.calls).toEqual([[true], [false]])
  })

  it('works controlled', () => {
    function Controlled() {
      const [checked, setChecked] = useState(true)
      return <Checkbox label="Resume" checked={checked} onCheckedChange={setChecked} />
    }
    render(<Controlled />)
    const checkbox = screen.getByRole('checkbox', { name: 'Resume' }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })

  it('sets the indeterminate DOM property', () => {
    const { rerender } = render(<Checkbox label="Select all" indeterminate checked={false} onChange={() => undefined} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement
    expect(checkbox.indeterminate).toBe(true)
    rerender(<Checkbox label="Select all" indeterminate={false} checked onChange={() => undefined} />)
    expect(checkbox.indeterminate).toBe(false)
  })

  it('links the description with aria-describedby', () => {
    render(<Checkbox label="Email me" description="At most weekly." />)
    const checkbox = screen.getByRole('checkbox', { name: 'Email me' })
    expect(checkbox.getAttribute('aria-describedby')).toBe(screen.getByText('At most weekly.').id)
  })

  it('does not toggle when disabled', () => {
    const onChange = vi.fn()
    render(<Checkbox label="Locked" disabled onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Locked' }) as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
    fireEvent.click(screen.getByText('Locked'))
    expect(checkbox.checked).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports invalid, framed and an aria-label without visible text', () => {
    const { container } = render(
      <>
        <Checkbox label="Terms" invalid />
        <Checkbox label="Remote only" framed />
        <Checkbox aria-label="Select row" />
      </>,
    )
    expect(screen.getByRole('checkbox', { name: 'Terms' }).getAttribute('aria-invalid')).toBe('true')
    expect(container.querySelector('.kit-check[data-framed]')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeTruthy()
  })

  it('forwards the ref and passes name and value for forms', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox ref={ref} label="Agree" name="agree" value="yes" />)
    expect(ref.current?.name).toBe('agree')
    expect(ref.current?.value).toBe('yes')
  })
})

describe('kit Switch', () => {
  it('exposes role=switch named by its label and toggles on click', () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="ATS-friendly mode" onCheckedChange={onCheckedChange} />)
    const toggle = screen.getByRole('switch', { name: 'ATS-friendly mode' }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
    fireEvent.click(toggle)
    expect(toggle.checked).toBe(true)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('switch', { name: 'ATS-friendly mode', checked: true })).toBeTruthy()
  })

  it('toggles from its label text', () => {
    render(<Switch label="Weekly digest" defaultChecked />)
    const toggle = screen.getByRole('switch', { name: 'Weekly digest' }) as HTMLInputElement
    fireEvent.click(screen.getByText('Weekly digest'))
    expect(toggle.checked).toBe(false)
  })

  it('can sit at the end of the row and carry a description', () => {
    const { container } = render(<Switch label="Updates" description="Rarely." controlPosition="end" />)
    expect(container.querySelector('.kit-check')?.getAttribute('data-control-position')).toBe('end')
    expect(screen.getByRole('switch', { name: 'Updates' }).getAttribute('aria-describedby')).toBe(screen.getByText('Rarely.').id)
  })

  it('is inert when disabled', () => {
    const onChange = vi.fn()
    render(<Switch label="Off" disabled onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: 'Off' }) as HTMLInputElement
    expect(toggle.disabled).toBe(true)
    fireEvent.click(screen.getByText('Off'))
    expect(toggle.checked).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts an aria-label when there is no visible text', () => {
    render(<Switch aria-label="Enable alerts" />)
    expect(screen.getByRole('switch', { name: 'Enable alerts' })).toBeTruthy()
  })
})
