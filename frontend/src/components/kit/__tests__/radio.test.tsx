import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field, RadioGroup, RadioItem } from '#/components/kit'

function Controlled({ onValueChange }: { onValueChange?: (value: string) => void }) {
  const [value, setValue] = useState('classic')
  return (
    <RadioGroup
      aria-label="Template"
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange?.(next)
      }}
    >
      <RadioItem value="classic" label="Classic" description="One column." />
      <RadioItem value="modern" label="Modern" />
    </RadioGroup>
  )
}

describe('kit RadioGroup', () => {
  it('is a named radiogroup of native radios sharing one name', () => {
    render(<Controlled />)
    const group = screen.getByRole('radiogroup', { name: 'Template' })
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(2)
    expect(radios.every((radio) => group.contains(radio) && radio.tagName === 'INPUT' && radio.type === 'radio')).toBe(true)
    expect(radios[0].name).toBe(radios[1].name)
    expect(radios[0].name).not.toBe('')
  })

  it('names each radio by its label and describes it by its description', () => {
    render(<Controlled />)
    const classic = screen.getByRole('radio', { name: 'Classic' })
    expect(classic.getAttribute('aria-describedby')).toBe(screen.getByText('One column.').id)
    expect((classic as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Modern' }) as HTMLInputElement).checked).toBe(false)
  })

  it('selecting an option (a click on its label too) calls onValueChange and moves the selection', () => {
    const onValueChange = vi.fn()
    render(<Controlled onValueChange={onValueChange} />)
    fireEvent.click(screen.getByText('Modern'))
    expect(onValueChange).toHaveBeenCalledWith('modern')
    expect((screen.getByRole('radio', { name: 'Modern' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Classic' }) as HTMLInputElement).checked).toBe(false)
  })

  it('works uncontrolled with defaultValue', () => {
    render(
      <RadioGroup aria-label="Spacing" defaultValue="tight">
        <RadioItem value="tight" label="Tight" />
        <RadioItem value="loose" label="Loose" />
      </RadioGroup>,
    )
    expect((screen.getByRole('radio', { name: 'Tight' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'Loose' }))
    expect((screen.getByRole('radio', { name: 'Loose' }) as HTMLInputElement).checked).toBe(true)
  })

  it('takes its name, description and invalid state from a surrounding Field', () => {
    render(
      <Field label="Visibility" help="Who can see this." error="Choose one.">
        <RadioGroup>
          <RadioItem value="a" label="Only me" />
        </RadioGroup>
      </Field>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Visibility' })
    expect(group.getAttribute('aria-invalid')).toBe('true')
    expect(group.getAttribute('aria-describedby')).toContain(screen.getByText('Who can see this.').id)
    expect(group.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id)
    expect(group.hasAttribute('data-invalid')).toBe(true)
  })

  it('disables every option from the group, or a single option on its own', () => {
    const { unmount } = render(
      <RadioGroup aria-label="Locked" disabled defaultValue="a">
        <RadioItem value="a" label="A" />
        <RadioItem value="b" label="B" />
      </RadioGroup>,
    )
    expect(screen.getAllByRole('radio').every((radio) => (radio as HTMLInputElement).disabled)).toBe(true)
    unmount()
    render(
      <RadioGroup aria-label="One" defaultValue="a">
        <RadioItem value="a" label="A" />
        <RadioItem value="b" label="B" disabled />
      </RadioGroup>,
    )
    expect((screen.getByRole('radio', { name: 'B' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('radio', { name: 'A' }) as HTMLInputElement).disabled).toBe(false)
  })

  it('swatches are named by their label (not drawn) and carry the colour as a custom property', () => {
    render(
      <RadioGroup aria-label="Accent colour" variant="swatch" defaultValue="forest">
        <RadioItem value="forest" label="Forest" swatch="var(--accent)" />
        <RadioItem value="ink" label="Ink" swatch="var(--text-strong)" />
      </RadioGroup>,
    )
    const forest = screen.getByRole('radio', { name: 'Forest' })
    expect(forest.getAttribute('aria-label')).toBe('Forest')
    const frame = forest.closest('label') as HTMLElement
    expect(frame.style.getPropertyValue('--kit-swatch')).toBe('var(--accent)')
    expect(frame.querySelector('.kit-radio__label')).toBeNull()
  })

  it('card options may hold rich labels and trailing meta', () => {
    render(
      <RadioGroup aria-label="Font" variant="card" defaultValue="a">
        <RadioItem value="a" label="Newsreader" meta="serif" />
      </RadioGroup>,
    )
    expect(screen.getByRole('radio', { name: 'Newsreader' })).toBeTruthy()
    expect(screen.getByText('serif').className).toContain('kit-radio__meta')
    expect(screen.getByRole('radiogroup').getAttribute('data-variant')).toBe('card')
  })

  it('tile options show their picture above the dot and text, named by the label alone', () => {
    render(
      <RadioGroup aria-label="Gallery" variant="tile" defaultValue="classic">
        <RadioItem value="classic" label="Classic" description="One column" mediaAspect="210 / 297" media={<img src="data:," alt="Preview of the Classic template" />} />
        <RadioItem value="rail" label="Rail" description="Two columns" />
      </RadioGroup>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Gallery' })
    expect(group.getAttribute('data-variant')).toBe('tile')
    const classic = screen.getByRole('radio', { name: 'Classic' }) as HTMLInputElement
    expect(classic.checked).toBe(true)
    const label = classic.closest('label')!
    const media = label.querySelector('.kit-radio__media') as HTMLElement
    expect(media.style.getPropertyValue('--kit-radio-media-ratio')).toBe('210 / 297')
    expect(within(media).getByRole('img', { name: 'Preview of the Classic template' })).toBeTruthy()
    // The picture comes first, then the row with the dot and the text.
    expect(label.firstElementChild).toBe(media)
    expect(label.querySelector('.kit-radio__body')?.contains(classic)).toBe(true)
    // No picture: a text-only tile.
    expect(screen.getByRole('radio', { name: 'Rail' }).closest('label')?.querySelector('.kit-radio__media')).toBeNull()
    fireEvent.click(screen.getByRole('img', { name: 'Preview of the Classic template' }))
    fireEvent.click(screen.getByText('Rail'))
    expect((screen.getByRole('radio', { name: 'Rail' }) as HTMLInputElement).checked).toBe(true)
  })

  it('an option outside a group is a clear error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<RadioItem value="a" label="A" />)).toThrow('RadioItem must be used inside <RadioGroup>')
    spy.mockRestore()
  })
})
