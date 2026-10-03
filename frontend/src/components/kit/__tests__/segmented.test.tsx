import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Segmented } from '#/components/kit'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

function Controlled({ initial = 'a', options = OPTIONS }: { initial?: string; options?: typeof OPTIONS }) {
  const [value, setValue] = useState(initial)
  return <Segmented aria-label="Letters" options={options} value={value} onValueChange={setValue} />
}

const radio = (name: string) => screen.getByRole('radio', { name })

describe('kit Segmented', () => {
  it('renders a named radiogroup with one checked radio per option', () => {
    render(<Controlled initial="b" />)
    expect(screen.getByRole('radiogroup', { name: 'Letters' })).toBeTruthy()
    expect(screen.getAllByRole('radio').length).toBe(3)
    expect(radio('Beta').getAttribute('aria-checked')).toBe('true')
    expect(radio('Alpha').getAttribute('aria-checked')).toBe('false')
    expect(radio('Beta').getAttribute('data-state')).toBe('checked')
  })

  it('selects on click and reports the value', () => {
    const onValueChange = vi.fn()
    render(<Segmented aria-label="Letters" options={OPTIONS} value="a" onValueChange={onValueChange} />)
    fireEvent.click(radio('Gamma'))
    expect(onValueChange).toHaveBeenCalledWith('c')
  })

  it('uses a roving tabindex: only the selected option is tabbable', () => {
    render(<Controlled initial="b" />)
    expect(radio('Beta').getAttribute('tabindex')).toBe('0')
    expect(radio('Alpha').getAttribute('tabindex')).toBe('-1')
    expect(radio('Gamma').getAttribute('tabindex')).toBe('-1')
  })

  it('makes the first enabled option tabbable when nothing is selected', () => {
    render(<Segmented aria-label="Letters" options={[{ ...OPTIONS[0], disabled: true }, OPTIONS[1], OPTIONS[2]]} value={undefined} onValueChange={() => undefined} />)
    expect(radio('Alpha').getAttribute('tabindex')).toBe('-1')
    expect(radio('Beta').getAttribute('tabindex')).toBe('0')
  })

  it('moves and selects with the arrow keys, wrapping around', () => {
    render(<Controlled initial="a" />)
    radio('Alpha').focus()
    fireEvent.keyDown(radio('Alpha'), { key: 'ArrowRight' })
    expect(radio('Beta').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radio('Beta'))
    fireEvent.keyDown(radio('Beta'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(radio('Gamma'))
    fireEvent.keyDown(radio('Gamma'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(radio('Alpha'))
    expect(radio('Alpha').getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(radio('Alpha'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(radio('Gamma'))
    fireEvent.keyDown(radio('Gamma'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(radio('Beta'))
  })

  it('jumps with Home and End', () => {
    render(<Controlled initial="b" />)
    radio('Beta').focus()
    fireEvent.keyDown(radio('Beta'), { key: 'End' })
    expect(radio('Gamma').getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(radio('Gamma'), { key: 'Home' })
    expect(radio('Alpha').getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(radio('Alpha'))
  })

  it('skips disabled options and ignores other keys', () => {
    const options = [OPTIONS[0], { ...OPTIONS[1], disabled: true }, OPTIONS[2]]
    const onValueChange = vi.fn()
    render(<Segmented aria-label="Letters" options={options} value="a" onValueChange={onValueChange} />)
    radio('Alpha').focus()
    fireEvent.keyDown(radio('Alpha'), { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenLastCalledWith('c')
    fireEvent.keyDown(radio('Alpha'), { key: 'a' })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect((radio('Beta') as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables every option when the group is disabled', () => {
    render(<Segmented aria-label="Letters" options={OPTIONS} value="a" onValueChange={() => undefined} disabled />)
    for (const option of screen.getAllByRole('radio')) expect((option as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('radiogroup').getAttribute('aria-disabled')).toBe('true')
  })

  it('works uncontrolled with defaultValue', () => {
    render(<Segmented aria-label="Letters" options={OPTIONS} defaultValue="a" />)
    fireEvent.click(radio('Beta'))
    expect(radio('Beta').getAttribute('aria-checked')).toBe('true')
    expect(radio('Alpha').getAttribute('aria-checked')).toBe('false')
  })

  it('deselectable: clicking the selected option reports null, and the first option stays tabbable', () => {
    function Filter() {
      const [value, setValue] = useState<string | null>('b')
      return <Segmented aria-label="Filter" deselectable options={OPTIONS} value={value} onValueChange={setValue} />
    }
    render(<Filter />)
    fireEvent.click(radio('Beta'))
    expect(screen.getAllByRole('radio').every((node) => node.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(radio('Alpha').getAttribute('tabindex')).toBe('0')
    fireEvent.click(radio('Gamma'))
    expect(radio('Gamma').getAttribute('aria-checked')).toBe('true')
  })

  it('supports numeric values and per-option aria-labels', () => {
    const onValueChange = vi.fn()
    render(
      <Segmented
        aria-label="Question count"
        value={10}
        onValueChange={onValueChange}
        options={[
          { value: 5, label: '5', 'aria-label': '5 questions' },
          { value: 10, label: '10', 'aria-label': '10 questions' },
        ]}
      />,
    )
    fireEvent.click(radio('5 questions'))
    expect(onValueChange).toHaveBeenCalledWith(5)
  })

  it('names icon-only options by aria-label', () => {
    render(
      <Segmented
        aria-label="Layout"
        defaultValue="grid"
        options={[
          { value: 'grid', icon: <svg aria-hidden="true" />, 'aria-label': 'Grid' },
          { value: 'list', icon: <svg aria-hidden="true" />, 'aria-label': 'List' },
        ]}
      />,
    )
    expect(radio('Grid').getAttribute('aria-checked')).toBe('true')
    expect(radio('List')).toBeTruthy()
  })

  it('passes size, fullWidth and className to the group', () => {
    render(<Segmented aria-label="Letters" options={OPTIONS} defaultValue="a" size="sm" fullWidth className="extra" />)
    const group = screen.getByRole('radiogroup')
    expect(group.getAttribute('data-size')).toBe('sm')
    expect(group.hasAttribute('data-full-width')).toBe(true)
    expect(group.classList.contains('extra')).toBe(true)
  })
})
