import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Checkbox, Field, Input, Segmented, Select, Textarea } from '#/components/kit'

describe('kit Field', () => {
  it('group: names a group of self-named controls with the field label, without renaming them (cv-studio-G14)', () => {
    render(
      <Field group label="Highlights" help="One per line.">
        <Textarea aria-label="Highlight 1" />
        <Textarea aria-label="Highlight 2" />
      </Field>,
    )
    const group = screen.getByRole('group', { name: 'Highlights' })
    expect(group.className).toContain('kit-field')
    // The same 14px label as a single field (not a section heading), with no label element pointing at one control.
    const label = screen.getByText('Highlights')
    expect(label.className).toContain('kit-field__label')
    expect(label.tagName).toBe('SPAN')
    expect(group.getAttribute('aria-describedby')).toBe(screen.getByText('One per line.').id)
    const first = screen.getByRole('textbox', { name: 'Highlight 1' })
    expect(first.getAttribute('aria-labelledby')).toBeNull()
    expect(first.id).toBe('')
    expect(screen.getByRole('textbox', { name: 'Highlight 2' })).toBeTruthy()
  })

  it('labels its control through htmlFor/id', () => {
    render(
      <Field label="Email">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(input.tagName).toBe('INPUT')
    expect(screen.getByText('Email').getAttribute('for')).toBe(input.id)
  })

  it('wires help into aria-describedby', () => {
    render(
      <Field label="Phone" help="Shown on your CV.">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Phone')
    const help = screen.getByText('Shown on your CV.')
    expect(input.getAttribute('aria-describedby')).toBe(help.id)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('marks the control invalid, describes it by help and error, and announces the error', () => {
    render(
      <Field label="Password" help="At least 8 characters." error="Too short.">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Password')
    const help = screen.getByText('At least 8 characters.')
    const error = screen.getByRole('alert')
    expect(error.textContent).toBe('Too short.')
    // The error is text plus a decorative alert icon: never colour alone.
    expect(error.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(`${help.id} ${error.id}`)
  })

  it('shows the Optional marker inside the label', () => {
    render(
      <Field label="Bio" optional>
        <Textarea />
      </Field>,
    )
    expect(screen.getByText('Optional')).toBeTruthy()
    expect(screen.getByLabelText(/Bio/).tagName).toBe('TEXTAREA')
  })

  it('passes required and disabled down to the control', () => {
    render(
      <>
        <Field label="Name" required>
          <Input />
        </Field>
        <Field label="Account" disabled>
          <Input />
        </Field>
      </>,
    )
    expect((screen.getByLabelText('Name') as HTMLInputElement).required).toBe(true)
    expect((screen.getByLabelText('Account') as HTMLInputElement).disabled).toBe(true)
  })

  it('keeps a hidden label available to assistive tech', () => {
    render(
      <Field label="Search jobs" hideLabel>
        <Input />
      </Field>,
    )
    const label = screen.getByText('Search jobs')
    expect(label.classList.contains('kit-sr-only')).toBe(true)
    expect(screen.getByLabelText('Search jobs')).toBeTruthy()
  })

  it('works with Select and Textarea', () => {
    render(
      <>
        <Field label="Stage" error="Pick one.">
          <Select defaultValue="">
            <option value="">Choose</option>
          </Select>
        </Field>
        <Field label="Notes" help="Private.">
          <Textarea />
        </Field>
      </>,
    )
    const select = screen.getByLabelText('Stage')
    expect(select.tagName).toBe('SELECT')
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Notes').getAttribute('aria-describedby')).toBeTruthy()
  })

  it('lets explicit control props win over the Field', () => {
    render(
      <Field label="Email" error="Bad" required>
        <Input id="custom" invalid={false} required={false} aria-describedby="mine" />
      </Field>,
    )
    const input = document.getElementById('custom') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.required).toBe(false)
    expect(input.getAttribute('aria-describedby')?.split(' ')[0]).toBe('mine')
  })

  it('describes a checkbox by the Field error without adding a second label', () => {
    render(
      <Field error="Accept the terms to continue.">
        <Checkbox label="I accept the terms" />
      </Field>,
    )
    const checkbox = screen.getByRole('checkbox', { name: 'I accept the terms' })
    expect(checkbox.getAttribute('aria-invalid')).toBe('true')
    expect(checkbox.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })

  it('names a Segmented group with the Field label', () => {
    render(
      <Field label="Question order">
        <Segmented
          defaultValue="a"
          options={[
            { value: 'a', label: 'Weakest first' },
            { value: 'b', label: 'As asked' },
          ]}
        />
      </Field>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Question order' })).toBeTruthy()
  })

  it('sets a prose Textarea at 17/1.6 for reading-length text (a letter), not form-field type', () => {
    render(<Textarea aria-label="Letter" prose />)
    expect(screen.getByLabelText('Letter').getAttribute('data-prose')).toBe('true')
    render(<Textarea aria-label="Plain" />)
    expect(screen.getByLabelText('Plain').hasAttribute('data-prose')).toBe(false)
    const css = readFileSync(path.resolve(__dirname, '../../../styles/kit/control.css'), 'utf8')
    const rule = css.match(/\.kit-textarea\[data-prose\]\s*\{([^}]*)\}/)![1]
    expect(rule).toMatch(/--kit-control-fs:\s*1\.0625rem/)
    expect(rule).toMatch(/line-height:\s*1\.6/)
  })
})
